import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { damageSummary } from './damage';
import { parseShowdownTeamsFile, parseEnemyCompactLines } from './parser';
import { SimpleSet } from './types';

type Lookup = Record<string, SimpleSet>;

function readFileOrDie(p: string): string {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (e) {
    console.error(`Could not read ${p}. Make sure the file exists.`);
    process.exit(1);
  }
}

function normalizeNoEVs(s: SimpleSet): SimpleSet {
  return {
    ...s,
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...(s.evs || {}) },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31, ...(s.ivs || {}) },
  };
}

function aliasKeys(set: SimpleSet): string[] {
  const s = set.species.toLowerCase();
  const base = s.replace(/\s+/g, '');
  return [s, base];
}

function buildLookup(sets: SimpleSet[]): Lookup {
  const map: Lookup = {};
  for (const s of sets) {
    for (const k of aliasKeys(s)) map[k] = s;
  }
  return map;
}

function parseActionLine(s: string) {
  // "staryu: aurora beam -> kubfu"
  const m = s.match(/^([^:]+):\s*(.+?)\s*->\s*(.+)$/i);
  if (!m) return null;
  return {
    actorAlias: m[1].trim().toLowerCase().replace(/\s+/g, ''),
    move: m[2].trim(),
    targetAlias: m[3].trim().toLowerCase().replace(/\s+/g, ''),
  };
}

function itemThresholdPercent(item?: string): number | undefined {
  if (!item) return undefined;
  const name = item.toLowerCase();
  if (name.includes('oran')) return 50; // Oran: heal 10 HP at <=50% (planner note only)
  if (name.includes('iapapa')) return 25; // Iapapa: heal 33% at <=25%
  return undefined;
}

function berryTriggerNote(defender: SimpleSet, dmgRollPercents: number[]): string | undefined {
  const thr = itemThresholdPercent(defender.item);
  if (thr == null) return undefined;

  // We plan from full HP; remaining HP after hit is 100 - damage%
  const remaining = dmgRollPercents.map((p) => Math.max(0, 100 - p));
  const triggering = remaining.filter((r) => r <= thr).length;
  if (triggering === 16) return `${defender.item} will activate on all non-crit rolls.`;
  if (triggering > 0) return `${defender.item} may activate on some non-crit rolls (${triggering}/16).`;
  return undefined;
}

function formatPctHp(pct: number, hp: number): string {
  return `${pct}%(${hp})`;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function printOneHit(gen: number, atk: SimpleSet, def: SimpleSet, moveName: string) {
  const sum = damageSummary(gen, atk, def, moveName);

  // Damage (% and HP)
  const minPct = sum.minPct;
  const maxPct = sum.maxPct;
  const minHP = sum.rollsHP[0];
  const maxHPdmg = sum.rollsHP[sum.rollsHP.length - 1];

  const critMinPct = sum.critMinPct;
  const critMaxPct = sum.critMaxPct;
  const critMinHP = sum.critRollsHP[0];
  const critMaxHPdmg = sum.critRollsHP[sum.critRollsHP.length - 1];

  // Remaining HP (start at full): remaining = maxHP - damage
  const defMax = sum.defenderMaxHP;

  // Worst remaining = after highest damage; best remaining = after lowest damage
  const lowRemainPct = Math.max(0, 100 - maxPct);
  const highRemainPct = Math.max(0, 100 - minPct);
  const lowRemainHP = Math.max(0, defMax - maxHPdmg);
  const highRemainHP = Math.max(0, defMax - minHP);

  const critLowRemainPct = Math.max(0, 100 - critMaxPct);
  const critHighRemainPct = Math.max(0, 100 - critMinPct);
  const critLowRemainHP = Math.max(0, defMax - critMaxHPdmg);
  const critHighRemainHP = Math.max(0, defMax - critMinHP);

  console.log(`${atk.species} used ${capitalize(moveName)} on ${def.species}.`);

  // Line 1: "Damage (% of Kubfu max HP): low=35%(10) | high=42%(12) | crit≈52%(15)–62%(18)"
  console.log(
    `Damage (% of ${def.species} max HP): ` +
      `low=${formatPctHp(minPct, minHP)} | ` +
      `high=${formatPctHp(maxPct, maxHPdmg)} | ` +
      `crit≈${formatPctHp(critMinPct, critMinHP)}–${formatPctHp(critMaxPct, critMaxHPdmg)}`
  );

  // Line 2: "Kubfu HP after hit (starting at 100%): low=58%(HP) | high=65%(HP) | crit≈38%(HP)–48%(HP)"
  console.log(
    `${def.species} HP after hit (starting at 100%): ` +
      `low=${formatPctHp(lowRemainPct, lowRemainHP)} | ` +
      `high=${formatPctHp(highRemainPct, highRemainHP)} | ` +
      `crit≈${formatPctHp(critLowRemainPct, critLowRemainHP)}–${formatPctHp(critHighRemainPct, critHighRemainHP)}`
  );

  const note = berryTriggerNote(def, sum.rollsPct);
  if (note) console.log(`Berry: ${note}`);
}

async function main() {
  const gen = 9; // change if needed

  // Allow custom paths via args: npm start -- myteam.txt enemytrainer.txt
  const [, , myArg, enemyArg] = process.argv;
  const myPath = path.resolve(process.cwd(), myArg || 'myteam.txt');
  const enemyPath = path.resolve(process.cwd(), enemyArg || 'enemytrainer.txt');

  const myText = readFileOrDie(myPath);
  const enemyText = readFileOrDie(enemyPath);

  const mySets = parseShowdownTeamsFile(myText).map(normalizeNoEVs);
  const enemySets = parseEnemyCompactLines(enemyText).map(normalizeNoEVs);

  if (mySets.length === 0) {
    console.error('No Pokémon found in myteam.txt');
    process.exit(1);
  }
  if (enemySets.length === 0) {
    console.error('No Pokémon found in enemytrainer.txt');
    process.exit(1);
  }

  const myLookup = buildLookup(mySets);
  const enemyLookup = buildLookup(enemySets);
  const globalLookup: Record<string, SimpleSet> = { ...myLookup, ...enemyLookup };

  console.log('== Poke Fight Planner ==');
  console.log(`Loaded ${mySets.length} from myteam.txt, ${enemySets.length} from enemytrainer.txt.`);
  console.log('Type actions like: staryu: aurora beam -> kubfu   (case-insensitive)');
  console.log('Type "exit" to quit.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const ask = (q: string) => new Promise<string>((res) => rl.question(q, (ans) => res(ans)));

  while (true) {
    const line = (await ask('> ')).trim();
    if (!line) continue;
    if (line.toLowerCase() === 'exit') break;

    const act = parseActionLine(line);
    if (!act) {
      console.log('Could not parse. Try: attacker: move -> defender');
      continue;
    }

    const atk = globalLookup[act.actorAlias];
    const def = globalLookup[act.targetAlias];

    if (!atk) {
      console.log(`Unknown attacker "${act.actorAlias}". Check species in files.`);
      continue;
    }
    if (!def) {
      console.log(`Unknown defender "${act.targetAlias}". Check species in files.`);
      continue;
    }

    try {
      printOneHit(gen, atk, def, act.move);
    } catch (e: any) {
      console.log(`Error calculating damage for "${act.move}": ${e?.message || e}`);
    }
  }

  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
