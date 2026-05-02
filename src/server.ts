// src/server.ts
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { damageSummary } from './damage';
import { parseShowdownTeamsFile, parseEnemyCompactLines } from './parser';
import { SimpleSet, EnrichedPokemon, MoveInfo, StatBlock } from './types';
import { Generations, Pokemon, Move, Field, GenerationNum, calculate, ITEMS } from '@smogon/calc';

// Stat-changing moves database
type StatChange = {
  stat: 'atk' | 'def' | 'spatk' | 'spdef' | 'spd';
  stages: number;
  target: 'self' | 'opponent';
};

type StatChangingMove = {
  name: string;
  changes: StatChange[];
};

const STAT_CHANGING_MOVES: StatChangingMove[] = [
  { name: 'growl', changes: [{ stat: 'atk', stages: -1, target: 'opponent' }] },
  { name: 'charm', changes: [{ stat: 'atk', stages: -2, target: 'opponent' }] },
  { name: 'baby-doll eyes', changes: [{ stat: 'atk', stages: -1, target: 'opponent' }] },
  { name: 'leer', changes: [{ stat: 'def', stages: -1, target: 'opponent' }] },
  { name: 'tail whip', changes: [{ stat: 'def', stages: -1, target: 'opponent' }] },
  { name: 'screech', changes: [{ stat: 'def', stages: -2, target: 'opponent' }] },
  { name: 'confide', changes: [{ stat: 'spatk', stages: -1, target: 'opponent' }] },
  { name: 'eerie impulse', changes: [{ stat: 'spatk', stages: -2, target: 'opponent' }] },
  { name: 'fake tears', changes: [{ stat: 'spdef', stages: -2, target: 'opponent' }] },
  { name: 'metal sound', changes: [{ stat: 'spdef', stages: -2, target: 'opponent' }] },
  { name: 'string shot', changes: [{ stat: 'spd', stages: -1, target: 'opponent' }] },
  { name: 'scary face', changes: [{ stat: 'spd', stages: -2, target: 'opponent' }] },
  { name: 'cotton spore', changes: [{ stat: 'spd', stages: -2, target: 'opponent' }] },
  { name: 'swords dance', changes: [{ stat: 'atk', stages: 2, target: 'self' }] },
  { name: 'howl', changes: [{ stat: 'atk', stages: 1, target: 'self' }] },
  { name: 'sharpen', changes: [{ stat: 'atk', stages: 1, target: 'self' }] },
  { name: 'harden', changes: [{ stat: 'def', stages: 1, target: 'self' }] },
  { name: 'withdraw', changes: [{ stat: 'def', stages: 1, target: 'self' }] },
  { name: 'defense curl', changes: [{ stat: 'def', stages: 1, target: 'self' }] },
  { name: 'iron defense', changes: [{ stat: 'def', stages: 2, target: 'self' }] },
  { name: 'nasty plot', changes: [{ stat: 'spatk', stages: 2, target: 'self' }] },
  { name: 'calm mind', changes: [{ stat: 'spatk', stages: 1, target: 'self' }, { stat: 'spdef', stages: 1, target: 'self' }] },
  { name: 'amnesia', changes: [{ stat: 'spdef', stages: 2, target: 'self' }] },
  { name: 'agility', changes: [{ stat: 'spd', stages: 2, target: 'self' }] },
  { name: 'rock polish', changes: [{ stat: 'spd', stages: 2, target: 'self' }] },
  { name: 'bulk up', changes: [{ stat: 'atk', stages: 1, target: 'self' }, { stat: 'def', stages: 1, target: 'self' }] },
  { name: 'dragon dance', changes: [{ stat: 'atk', stages: 1, target: 'self' }, { stat: 'spd', stages: 1, target: 'self' }] },
  { name: 'coil', changes: [{ stat: 'atk', stages: 1, target: 'self' }, { stat: 'def', stages: 1, target: 'self' }] },
];

function getStatChangingMove(moveName: string): StatChangingMove | null {
  const normalized = moveName.toLowerCase().trim();
  return STAT_CHANGING_MOVES.find(m => m.name === normalized) ?? null;
}

// Status-inflicting moves database
type StatusEffect = 'burn' | 'psn' | 'tox' | 'par' | 'frz';

type StatusMove = {
  name: string;
  status: StatusEffect;
};

const STATUS_MOVES: StatusMove[] = [
  { name: 'thunder wave', status: 'par' },
  { name: 'will o wisp', status: 'burn' },
  { name: 'will-o-wisp', status: 'burn' },
  { name: "will-o'-wisp", status: 'burn' },
  { name: 'toxic', status: 'tox' },
  { name: 'poison gas', status: 'psn' },
  { name: 'poison powder', status: 'psn' },
  { name: 'poisonpowder', status: 'psn' },
  { name: 'stun spore', status: 'par' },
  { name: 'stunspore', status: 'par' },
  { name: 'glare', status: 'par' },
];

function getStatusMove(moveName: string): StatusMove | null {
  const normalized = moveName.toLowerCase().trim();
  return STATUS_MOVES.find(m => m.name === normalized) ?? null;
}

// Convert UI stat stages to @smogon/calc boosts format
function convertStatStagesToBoosts(statStages?: any): any {
  if (!statStages) return {};
  // Use long format keys for boosts (atk, def, spa, spd, spe)
  return {
    atk: statStages.atk ?? 0,
    def: statStages.def ?? 0,
    spa: statStages.spatk ?? 0,
    spd: statStages.spdef ?? 0,
    spe: statStages.spd ?? 0,
  };
}

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
  // Map our status types to @smogon/calc's expected format
  if (k === 'brn' || k === 'burn') return 'brn';
  if (k === 'prlyz' || k === 'par' || k === 'paralyze' || k === 'paralyzed') return 'par';
  if (k === 'psn' || k === 'poison') return 'psn';
  if (k === 'bpsn' || k === 'tox' || k === 'toxic' || k === 'badly poisoned') return 'tox';
  if (k === 'frzn' || k === 'frz' || k === 'frozen') return 'frz';
  if (k === 'slp' || k === 'sleep') return 'slp';
  return undefined;
}

// Map weather string to @smogon/calc weather format
function mapWeatherToCalc(weather?: string): 'Sun' | 'Rain' | 'Sand' | 'Hail' | 'Snow' | undefined {
  if (!weather) return undefined;
  const w = weather.trim().toLowerCase();
  if (w === 'sun' || w === 'sunny') return 'Sun';
  if (w === 'rain') return 'Rain';
  if (w === 'sandstorm' || w === 'sand') return 'Sand';
  if (w === 'hail') return 'Hail';
  return undefined;
}

// Build a Pokemon exactly like the calc will see it (for debug echo)
function toCalcPokemon(gen: ReturnType<typeof Generations.get>, set: SimpleSet, boosts?: any) {
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
    boosts: boosts ?? {},
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
      weather, // 'sun' | 'rain' | 'hail' | 'sandstorm' | null
      screens, // Array of ScreenState objects that affect the attacker
      battleMode = 'singles', // 'singles' or 'doubles'
      overrides, // { attacker?: { item?, status?, statStages? }, defender?: { item?, status?, statStages? } }
    } = req.body || {};

    if (!attacker || !move || !defender) {
      return res.status(400).json({ error: 'attacker, move, defender are required' });
    }

    // Check if this is a stat-changing move
    const statMove = getStatChangingMove(String(move));
    if (statMove) {
      // For stat-changing moves, determine the target
      const targetName = statMove.changes[0].target === 'opponent' ? defender : attacker;
      
      return res.json({
        isStatChange: true,
        attacker: String(attacker),
        move: String(move),
        target: targetName,
        statChanges: statMove.changes,
      });
    }

    // Check if this is a status-inflicting move
    const statusMove = getStatusMove(String(move));
    if (statusMove) {
      return res.json({
        isStatusMove: true,
        attacker: String(attacker),
        move: String(move),
        target: String(defender),
        status: statusMove.status,
      });
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
    if (aStat) {
      A.status = aStat;
      console.log(`[server] Applying status to attacker: ${aStat} (from ${overrides?.attacker?.status})`);
    }
    if (dStat) {
      D.status = dStat;
      console.log(`[server] Applying status to defender: ${dStat} (from ${overrides?.defender?.status})`);
    }

    // Apply stat stages from overrides
    const attackerBoosts = convertStatStagesToBoosts(overrides?.attacker?.statStages);
    const defenderBoosts = convertStatStagesToBoosts(overrides?.defender?.statStages);

    // Map weather for field
    const fieldWeather = mapWeatherToCalc(weather);
    const fieldOptions = fieldWeather ? { weather: fieldWeather } : undefined;

    // Main summary
    const sum = damageSummary(Number(gen), A, D, String(move), fieldOptions, attackerBoosts, defenderBoosts);
    const defMax = sum.defenderMaxHP;

    // Determine if the move is physical or special and if it's a spread move
    const moveObj = new Move(Generations.get(Number(gen) as any), String(move));
    const isPhysical = moveObj.category === 'Physical';
    // Spread moves in doubles hit multiple targets (Earthquake, Surf, Rock Slide, etc.)
    // These typically have target "all" or "allySide" or "foeSide"
    const isSpreadMove = moveObj.target === 'all' || 
                         moveObj.target === 'allySide' || 
                         moveObj.target === 'foeSide';
    
    // Apply spread move modifier in doubles
    let spreadModifier = 1.0;
    if (battleMode === 'doubles' && isSpreadMove) {
      spreadModifier = 0.75; // Spread moves deal 75% damage in doubles
    }
    
    // Apply screen modifiers
    let screenModifier = 1.0;
    if (screens && Array.isArray(screens) && screens.length > 0) {
      // Screen modifier differs between singles and doubles
      const singleScreenMod = 0.5; // 50% damage in singles
      const doublesScreenMod = 2 / 3; // ~66.7% damage in doubles
      const screenReduction = battleMode === 'doubles' ? doublesScreenMod : singleScreenMod;
      
      // Check each screen to see if it affects this attack
      for (const screen of screens) {
        if (screen.type === 'light-screen' && !isPhysical) {
          screenModifier *= screenReduction;
        } else if (screen.type === 'reflect' && isPhysical) {
          screenModifier *= screenReduction;
        } else if (screen.type === 'aurora-veil') {
          screenModifier *= screenReduction;
        }
      }
    }

    // Combine all modifiers
    const totalModifier = screenModifier * spreadModifier;

    // Damage (min/max/crit) from calc, with all modifiers applied
    let dmgLowPct  = sum.minPct * totalModifier;
    let dmgHighPct = sum.maxPct * totalModifier;
    let dmgCritPct = sum.critMaxPct * totalModifier;

    let dmgLowHP   = Math.floor(sum.rollsHP[0] * totalModifier);
    let dmgHighHP  = Math.floor(sum.rollsHP[sum.rollsHP.length - 1] * totalModifier);
    let dmgCritHP  = Math.floor(sum.critRollsHP[sum.critRollsHP.length - 1] * totalModifier);

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
    const pA = toCalcPokemon(g, A, attackerBoosts);
    const pD = toCalcPokemon(g, D, defenderBoosts);
    const mv = new Move(g, String(move));
    const fld = new Field({});

    const result = calculate(g, pA, pD, mv, fld);
    const resultCrit = calculate(g, pA, pD, new Move(g, String(move), { isCrit: true }), fld);

    // Use rolls from the summary which already has boosts applied, and apply all modifiers
    const rawRolls = sum.rollsHP.map(r => Math.floor(r * totalModifier));
    const rawRollsCrit = sum.critRollsHP.map(r => Math.floor(r * totalModifier));

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

app.post('/api/team-details', (req, res) => {
  try {
    const { myText = '', gen = 9 } = req.body || {};
    if (!myText) return res.json([]);

    const genNum = Number(gen) as GenerationNum;
    const g = Generations.get(genNum);
    const sets = parseShowdownTeamsFile(String(myText)).map(normalizeNoEVs);

    const enriched: EnrichedPokemon[] = sets.map((set) => {
      const pokemon = toCalcPokemon(g, set);

      const bs = pokemon.species.baseStats;
      const baseStats: StatBlock = {
        hp: bs.hp, atk: bs.atk, def: bs.def,
        spa: bs.spa, spd: bs.spd, spe: bs.spe,
      };

      const rs = pokemon.rawStats;
      const computedStats: StatBlock = {
        hp: rs.hp, atk: rs.atk, def: rs.def,
        spa: rs.spa, spd: rs.spd, spe: rs.spe,
      };

      const types: string[] = pokemon.types.map(String);

      const moveDetails: MoveInfo[] = set.moves.map((moveName) => {
        try {
          const mv = new Move(g, moveName);
          return { name: mv.name, bp: mv.bp, type: mv.type, category: mv.category };
        } catch {
          return { name: moveName, bp: 0, type: 'Normal', category: 'Physical' };
        }
      });

      const ivs: StatBlock = {
        hp: set.ivs?.hp ?? 31, atk: set.ivs?.atk ?? 31, def: set.ivs?.def ?? 31,
        spa: set.ivs?.spa ?? 31, spd: set.ivs?.spd ?? 31, spe: set.ivs?.spe ?? 31,
      };
      const evs: StatBlock = {
        hp: set.evs?.hp ?? 0, atk: set.evs?.atk ?? 0, def: set.evs?.def ?? 0,
        spa: set.evs?.spa ?? 0, spd: set.evs?.spd ?? 0, spe: set.evs?.spe ?? 0,
      };

      return {
        species: set.species,
        level: set.level,
        nature: set.nature,
        ability: set.ability,
        item: set.item,
        moves: set.moves,
        moveDetails,
        ivs,
        evs,
        baseStats,
        computedStats,
        types,
      };
    });

    res.json(enriched);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'team-details failed' });
  }
});

// --- Learnset data ---

type LearnsetEntry = {
  moves: string[];
  abilities: string[];
};

function normalizeLearnsetKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseLearnsetFile(): Record<string, LearnsetEntry> {
  const filePath = path.resolve(__dirname, '..', 'Learnset, Evolution Methods and Abilities.txt');
  if (!fs.existsSync(filePath)) return {};
  const text = fs.readFileSync(filePath, 'utf-8');
  const result: Record<string, LearnsetEntry> = {};
  const blocks = text.replace(/\r\n/g, '\n').split(/\n{2,}/);

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    const speciesName = lines[0];
    const moves: string[] = [];
    const abilities: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const moveMatch = line.match(/^Lv\.\s*\d+\s+(.+)$/);
      if (moveMatch) {
        const moveName = moveMatch[1].trim();
        if (!moves.includes(moveName)) moves.push(moveName);
        continue;
      }
      const abilityMatch = line.match(/^(?:Ability \d|Hidden Ability):\s*(.+)$/i);
      if (abilityMatch) {
        const ab = abilityMatch[1].trim();
        if (ab && ab !== 'None' && !abilities.includes(ab)) abilities.push(ab);
      }
    }

    result[normalizeLearnsetKey(speciesName)] = { moves, abilities };
  }

  return result;
}

let learnsetCache: Record<string, LearnsetEntry> | null = null;

function getLearnsetData(): Record<string, LearnsetEntry> {
  if (!learnsetCache) learnsetCache = parseLearnsetFile();
  return learnsetCache;
}

function showdownToLearnsetKey(species: string): string {
  return species
    .replace(/-Galar$/i, 'galarian')
    .replace(/-Alola$/i, 'alolan')
    .replace(/-Hisui$/i, 'hisuian')
    .replace(/-Paldea$/i, 'paldean')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

app.get('/api/learnset/:species', (req, res) => {
  const species = req.params.species;
  const gen = Number(req.query.gen ?? 9) as GenerationNum;
  const data = getLearnsetData();
  const lkey = showdownToLearnsetKey(species);

  let entry: LearnsetEntry | undefined = data[lkey];
  if (!entry) {
    for (const [k, v] of Object.entries(data)) {
      if (k.startsWith(lkey) || lkey.startsWith(k)) { entry = v; break; }
    }
  }

  const moves = entry?.moves ?? [];
  const abilities = entry?.abilities ?? [];

  const g = Generations.get(gen);
  const moveDetails: Record<string, { bp: number; type: string; category: string }> = {};
  for (const moveName of moves) {
    try {
      const mv = new Move(g, moveName);
      moveDetails[moveName] = { bp: mv.bp, type: mv.type, category: mv.category };
    } catch { /* skip unknown moves */ }
  }

  res.json({ moves, abilities, moveDetails });
});

app.get('/api/items', (req, res) => {
  const gen = Number(req.query.gen ?? 9) as GenerationNum;
  const items: string[] = (ITEMS as any)[gen] ?? [];
  res.json(items);
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
