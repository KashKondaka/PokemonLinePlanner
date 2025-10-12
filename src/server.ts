// src/server.ts
import express from 'express';
import cors from 'cors';
import { damageSummary } from './damage';
import { parseShowdownTeamsFile, parseEnemyCompactLines } from './parser';
import { SimpleSet } from './types';
import { Generations, Pokemon, Move, Field, GenerationNum, calculate } from '@smogon/calc';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

function normalizeNoEVs(s: SimpleSet): SimpleSet {
  return {
    ...s,
    // Keep EV defaults
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...(s.evs || {}) },
    // IMPORTANT: do NOT inject 31s here; preserve exactly what was parsed
    ivs: { ...(s.ivs || {}) },
  };
}

const key = (s: string) => s.toLowerCase().replace(/\s+/g, '');
const buildLookup = (sets: SimpleSet[]) => {
  const map: Record<string, SimpleSet> = {};
  for (const set of sets) map[key(set.species)] = set;
  return map;
};

// (Optional) map UI status strings → calc codes if you pass overrides from the UI
function mapUiStatusToCalc(s?: string): SimpleSet['status'] | undefined {
  if (!s) return undefined;
  const k = s.trim().toLowerCase();
  if (k === 'brn' || k === 'burn') return 'brn';
  if (k === 'prlyz' || k === 'par' || k === 'paralyze' || k === 'paralyzed') return 'par';
  if (k === 'psn' || k === 'poison') return 'psn';
  if (k === 'bpsn' || k === 'tox' || k === 'toxic' || k === 'badly poisoned') return 'tox';
  if (k === 'frzn' || k === 'frz' || k === 'frozen') return 'frz';
  if (k === 'slp' || k === 'sleep') return 'slp';
  return undefined;
}

// Build a Pokemon exactly like the calc will see it (for debug echo)
function toCalcPokemon(gen: ReturnType<typeof Generations.get>, set: SimpleSet) {
  const norm = (s?: string) => (s && s.trim().length ? s : undefined);
  const sIV = (set.ivs ?? {}) as any;
  const sEV = (set.evs ?? {}) as any;

  // Accept both Showdown keys (atk/def/spa/spd/spe) and calc keys (at/df/sa/sd/sp)
  const iv_hp = sIV.hp ?? sIV.HP ?? 31;
  const iv_at = sIV.at ?? sIV.atk ?? sIV.Atk ?? 31;
  const iv_df = sIV.df ?? sIV.def ?? sIV.Def ?? 31;
  const iv_sa = sIV.sa ?? sIV.spa ?? sIV.SpA ?? 31;
  const iv_sd = sIV.sd ?? sIV.spd ?? sIV.SpD ?? 31;
  const iv_sp = sIV.sp ?? sIV.spe ?? sIV.Spe ?? 31;

  const ev_hp = sEV.hp ?? sEV.HP ?? 0;
  const ev_at = sEV.at ?? sEV.atk ?? sEV.Atk ?? 0;
  const ev_df = sEV.df ?? sEV.def ?? sEV.Def ?? 0;
  const ev_sa = sEV.sa ?? sEV.spa ?? sEV.SpA ?? 0;
  const ev_sd = sEV.sd ?? sEV.spd ?? sEV.SpD ?? 0;
  const ev_sp = sEV.sp ?? sEV.spe ?? sEV.Spe ?? 0;

  // Provide both sets of keys so debug echo is clear; calc reads the short ones.
  const ivs = {
    hp: iv_hp, at: iv_at, df: iv_df, sa: iv_sa, sd: iv_sd, sp: iv_sp,
    atk: iv_at, def: iv_df, spa: iv_sa, spd: iv_sd, spe: iv_sp,
  } as any;

  const evs = {
    hp: ev_hp, at: ev_at, df: ev_df, sa: ev_sa, sd: ev_sd, sp: ev_sp,
    atk: ev_at, def: ev_df, spa: ev_sa, spd: ev_sd, spe: ev_sp,
  } as any;

  return new Pokemon(gen, set.species, {
    level: set.level ?? 50,
    nature: norm(set.nature),
    ability: norm(set.ability),
    item: norm(set.item),
    status: set.status as any,
    ivs,
    evs,
  });
}

app.post('/api/calc', (req, res) => {
  try {
    const {
      gen = 9,
      myText = '',
      enemyText = '',
      attacker,
      move,
      defender,
      overrides, // { attacker?: { item?, status? }, defender?: { item?, status? } }
    } = req.body || {};

    if (!attacker || !move || !defender) {
      return res.status(400).json({ error: 'attacker, move, defender are required' });
    }

    // Parse text files each call (simple + stateless)
    const mySets = parseShowdownTeamsFile(String(myText)).map(normalizeNoEVs);
    const enemySets = parseEnemyCompactLines(String(enemyText)).map(normalizeNoEVs);

    const lookup = buildLookup([...mySets, ...enemySets]);
    const A0 = lookup[key(String(attacker))];
    const D0 = lookup[key(String(defender))];

    if (!A0) return res.status(404).json({ error: `Unknown attacker: ${attacker}` });
    if (!D0) return res.status(404).json({ error: `Unknown defender: ${defender}` });

    // Clone sets and apply optional UI overrides
    const A: SimpleSet = { ...A0 };
    const D: SimpleSet = { ...D0 };
    if (overrides?.attacker?.item) A.item = String(overrides.attacker.item);
    if (overrides?.defender?.item) D.item = String(overrides.defender.item);
    const aStat = mapUiStatusToCalc(overrides?.attacker?.status);
    const dStat = mapUiStatusToCalc(overrides?.defender?.status);
    if (aStat) A.status = aStat;
    if (dStat) D.status = dStat;

    // Main summary
    const sum = damageSummary(Number(gen), A, D, String(move));
    const defMax = sum.defenderMaxHP;

    // Damage (min/max/crit) from calc
    const dmgLowPct  = sum.minPct;
    const dmgHighPct = sum.maxPct;
    const dmgCritPct = sum.critMaxPct;

    const dmgLowHP   = sum.rollsHP[0];
    const dmgHighHP  = sum.rollsHP[sum.rollsHP.length - 1];
    const dmgCritHP  = sum.critRollsHP[sum.critRollsHP.length - 1];

    // === Remaining (what UI wants to display) ===
    // "Low roll" should be LESS damage → MORE remaining.
    // "High roll" should be MORE damage → LESS remaining.
    const remaining = {
      lowPct:  Math.max(0, 100 - dmgHighPct),
      lowHP:   Math.max(0, defMax - dmgHighHP),
      highPct: Math.max(0, 100 - dmgLowPct),
      highHP:  Math.max(0, defMax - dmgLowHP),
      critPct: Math.max(0, 100 - dmgCritPct),
      critHP:  Math.max(0, defMax - dmgCritHP),
    };

    // Keep raw damage for debugging/optional UI
    const damage = {
      lowPct:  dmgLowPct,  lowHP:  dmgLowHP,
      highPct: dmgHighPct, highHP: dmgHighHP,
      critPct: dmgCritPct, critHP: dmgCritHP,
    };

    // EXTRA DEBUG: exact stats and raw 16 rolls
    const g = Generations.get(Number(gen) as GenerationNum);
    const pA = toCalcPokemon(g, A);
    const pD = toCalcPokemon(g, D);
    const mv = new Move(g, String(move));
    const fld = new Field({});

    const result = calculate(g, pA, pD, mv, fld);
    const resultCrit = calculate(g, pA, pD, new Move(g, String(move), { isCrit: true }), fld);

    const rawRolls = (result.damage as number[]).slice();
    const rawRollsCrit = (resultCrit.damage as number[]).slice();

    const debug = {
      attacker: {
        species: pA.species.name,
        level: pA.level,
        nature: String(pA.nature || ''),
        ability: String(pA.ability || ''),
        item: String(pA.item || ''),
        status: (pA as any).status || '',
        stats: (pA as any).stats, // {hp, at, df, sa, sd, sp}
        ivs: (pA as any).ivs,
        evs: (pA as any).evs,
      },
      defender: {
        species: pD.species.name,
        level: pD.level,
        nature: String(pD.nature || ''),
        ability: String(pD.ability || ''),
        item: String(pD.item || ''),
        status: (pD as any).status || '',
        stats: (pD as any).stats,
        ivs: (pD as any).ivs,
        evs: (pD as any).evs,
        maxHP: pD.maxHP(),
      },
      move: {
        name: mv.name,
        basePower: mv.bp,
        type: mv.type,
        category: mv.category,
      },
      rolls: {
        normal: rawRolls,
        crit: rawRollsCrit,
      },
      desc: result.desc(),
    };

    const payload = {
      defender: D.species,
      defenderMaxHP: defMax,
      damage,
      remaining, // <-- UI should read from here (Low = more remaining, High = less)
      debug,
    };

    console.log('[calc]', attacker, 'used', move, 'on', defender, '→ remaining:', JSON.stringify(remaining));
    res.json(payload);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'calc failed' });
  }
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
