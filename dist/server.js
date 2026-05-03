"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/server.ts
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const damage_1 = require("./damage");
const parser_1 = require("./parser");
const calc_1 = require("@smogon/calc");
const STAT_CHANGING_MOVES = [
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
function getStatChangingMove(moveName) {
    const normalized = moveName.toLowerCase().trim();
    return STAT_CHANGING_MOVES.find(m => m.name === normalized) ?? null;
}
const STATUS_MOVES = [
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
function getStatusMove(moveName) {
    const normalized = moveName.toLowerCase().trim();
    return STATUS_MOVES.find(m => m.name === normalized) ?? null;
}
// Convert UI stat stages to @smogon/calc boosts format
function convertStatStagesToBoosts(statStages) {
    if (!statStages)
        return {};
    // Use long format keys for boosts (atk, def, spa, spd, spe)
    return {
        atk: statStages.atk ?? 0,
        def: statStages.def ?? 0,
        spa: statStages.spatk ?? 0,
        spd: statStages.spdef ?? 0,
        spe: statStages.spd ?? 0,
    };
}
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '2mb' }));
function normalizeNoEVs(s) {
    return {
        ...s,
        // Keep EV defaults
        evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...(s.evs || {}) },
        // IMPORTANT: do NOT inject 31s here; preserve exactly what was parsed
        ivs: { ...(s.ivs || {}) },
    };
}
const key = (s) => s.toLowerCase().replace(/\s+/g, '');
const buildLookup = (sets) => {
    const map = {};
    for (const set of sets)
        map[key(set.species)] = set;
    return map;
};
// (Optional) map UI status strings → calc codes if you pass overrides from the UI
function mapUiStatusToCalc(s) {
    if (!s)
        return undefined;
    const k = s.trim().toLowerCase();
    // Map our status types to @smogon/calc's expected format
    if (k === 'brn' || k === 'burn')
        return 'brn';
    if (k === 'prlyz' || k === 'par' || k === 'paralyze' || k === 'paralyzed')
        return 'par';
    if (k === 'psn' || k === 'poison')
        return 'psn';
    if (k === 'bpsn' || k === 'tox' || k === 'toxic' || k === 'badly poisoned')
        return 'tox';
    if (k === 'frzn' || k === 'frz' || k === 'frozen')
        return 'frz';
    if (k === 'slp' || k === 'sleep')
        return 'slp';
    return undefined;
}
// Map weather string to @smogon/calc weather format
function mapWeatherToCalc(weather) {
    if (!weather)
        return undefined;
    const w = weather.trim().toLowerCase();
    if (w === 'sun' || w === 'sunny')
        return 'Sun';
    if (w === 'rain')
        return 'Rain';
    if (w === 'sandstorm' || w === 'sand')
        return 'Sand';
    if (w === 'hail')
        return 'Hail';
    return undefined;
}
// Build a Pokemon exactly like the calc will see it (for debug echo)
function toCalcPokemon(gen, set, boosts) {
    const norm = (s) => (s && s.trim().length ? s : undefined);
    const sIV = (set.ivs ?? {});
    const sEV = (set.evs ?? {});
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
    };
    const evs = {
        hp: ev_hp, at: ev_at, df: ev_df, sa: ev_sa, sd: ev_sd, sp: ev_sp,
        atk: ev_at, def: ev_df, spa: ev_sa, spd: ev_sd, spe: ev_sp,
    };
    return new calc_1.Pokemon(gen, set.species, {
        level: set.level ?? 50,
        nature: norm(set.nature),
        ability: norm(set.ability),
        item: norm(set.item),
        status: set.status,
        ivs,
        evs,
        boosts: boosts ?? {},
    });
}
app.post('/api/calc', (req, res) => {
    try {
        const { gen = 9, myText = '', enemyText = '', attacker, move, defender, weather, // 'sun' | 'rain' | 'hail' | 'sandstorm' | null
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
        const mySets = (0, parser_1.parseShowdownTeamsFile)(String(myText)).map(normalizeNoEVs);
        const enemySets = (0, parser_1.parseEnemyCompactLines)(String(enemyText)).map(normalizeNoEVs);
        const lookup = buildLookup([...mySets, ...enemySets]);
        const A0 = lookup[key(String(attacker))];
        const D0 = lookup[key(String(defender))];
        if (!A0)
            return res.status(404).json({ error: `Unknown attacker: ${attacker}` });
        if (!D0)
            return res.status(404).json({ error: `Unknown defender: ${defender}` });
        // Clone sets and apply optional UI overrides
        const A = { ...A0 };
        const D = { ...D0 };
        if (overrides?.attacker?.item)
            A.item = String(overrides.attacker.item);
        if (overrides?.defender?.item)
            D.item = String(overrides.defender.item);
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
        const sum = (0, damage_1.damageSummary)(Number(gen), A, D, String(move), fieldOptions, attackerBoosts, defenderBoosts);
        const defMax = sum.defenderMaxHP;
        // Determine if the move is physical or special and if it's a spread move
        const moveObj = new calc_1.Move(calc_1.Generations.get(Number(gen)), String(move));
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
                }
                else if (screen.type === 'reflect' && isPhysical) {
                    screenModifier *= screenReduction;
                }
                else if (screen.type === 'aurora-veil') {
                    screenModifier *= screenReduction;
                }
            }
        }
        // Combine all modifiers
        const totalModifier = screenModifier * spreadModifier;
        // Damage (min/max/crit) from calc, with all modifiers applied
        let dmgLowPct = sum.minPct * totalModifier;
        let dmgHighPct = sum.maxPct * totalModifier;
        let dmgCritPct = sum.critMaxPct * totalModifier;
        let dmgLowHP = Math.floor(sum.rollsHP[0] * totalModifier);
        let dmgHighHP = Math.floor(sum.rollsHP[sum.rollsHP.length - 1] * totalModifier);
        let dmgCritHP = Math.floor(sum.critRollsHP[sum.critRollsHP.length - 1] * totalModifier);
        // === Remaining (what UI wants to display) ===
        // "Low roll" should be LESS damage → MORE remaining.
        // "High roll" should be MORE damage → LESS remaining.
        const remaining = {
            lowPct: Math.max(0, 100 - dmgHighPct),
            lowHP: Math.max(0, defMax - dmgHighHP),
            highPct: Math.max(0, 100 - dmgLowPct),
            highHP: Math.max(0, defMax - dmgLowHP),
            critPct: Math.max(0, 100 - dmgCritPct),
            critHP: Math.max(0, defMax - dmgCritHP),
        };
        // Keep raw damage for debugging/optional UI
        const damage = {
            lowPct: dmgLowPct, lowHP: dmgLowHP,
            highPct: dmgHighPct, highHP: dmgHighHP,
            critPct: dmgCritPct, critHP: dmgCritHP,
        };
        // EXTRA DEBUG: exact stats and raw 16 rolls
        const g = calc_1.Generations.get(Number(gen));
        const pA = toCalcPokemon(g, A, attackerBoosts);
        const pD = toCalcPokemon(g, D, defenderBoosts);
        const mv = new calc_1.Move(g, String(move));
        const fld = new calc_1.Field({});
        const result = (0, calc_1.calculate)(g, pA, pD, mv, fld);
        const resultCrit = (0, calc_1.calculate)(g, pA, pD, new calc_1.Move(g, String(move), { isCrit: true }), fld);
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
                status: pA.status || '',
                stats: pA.stats, // {hp, at, df, sa, sd, sp}
                ivs: pA.ivs,
                evs: pA.evs,
            },
            defender: {
                species: pD.species.name,
                level: pD.level,
                nature: String(pD.nature || ''),
                ability: String(pD.ability || ''),
                item: String(pD.item || ''),
                status: pD.status || '',
                stats: pD.stats,
                ivs: pD.ivs,
                evs: pD.evs,
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
    }
    catch (e) {
        res.status(500).json({ error: e?.message || 'calc failed' });
    }
});
app.post('/api/team-details', (req, res) => {
    try {
        const { myText = '', gen = 9 } = req.body || {};
        if (!myText)
            return res.json([]);
        const genNum = Number(gen);
        const g = calc_1.Generations.get(genNum);
        const sets = (0, parser_1.parseShowdownTeamsFile)(String(myText)).map(normalizeNoEVs);
        const enriched = sets.map((set) => {
            const pokemon = toCalcPokemon(g, set);
            const bs = pokemon.species.baseStats;
            const baseStats = {
                hp: bs.hp, atk: bs.atk, def: bs.def,
                spa: bs.spa, spd: bs.spd, spe: bs.spe,
            };
            const rs = pokemon.rawStats;
            const computedStats = {
                hp: rs.hp, atk: rs.atk, def: rs.def,
                spa: rs.spa, spd: rs.spd, spe: rs.spe,
            };
            const types = pokemon.types.map(String);
            const moveDetails = set.moves.map((moveName) => {
                try {
                    const mv = new calc_1.Move(g, moveName);
                    return { name: mv.name, bp: mv.bp, type: mv.type, category: mv.category };
                }
                catch {
                    return { name: moveName, bp: 0, type: 'Normal', category: 'Physical' };
                }
            });
            const ivs = {
                hp: set.ivs?.hp ?? 31, atk: set.ivs?.atk ?? 31, def: set.ivs?.def ?? 31,
                spa: set.ivs?.spa ?? 31, spd: set.ivs?.spd ?? 31, spe: set.ivs?.spe ?? 31,
            };
            const evs = {
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
    }
    catch (e) {
        res.status(500).json({ error: e?.message || 'team-details failed' });
    }
});
function normalizeLearnsetKey(name) {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}
let learnsetCache = null;
let speciesNamesCache = null;
function getLearnsetData() {
    if (!learnsetCache) {
        const filePath = path_1.default.resolve(__dirname, '..', 'Learnset, Evolution Methods and Abilities.txt');
        if (!fs_1.default.existsSync(filePath)) {
            learnsetCache = {};
            speciesNamesCache = [];
            return learnsetCache;
        }
        const text = fs_1.default.readFileSync(filePath, 'utf-8');
        const result = {};
        const names = [];
        const blocks = text.replace(/\r\n/g, '\n').split(/\n{2,}/);
        for (const block of blocks) {
            const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
            if (!lines.length)
                continue;
            const speciesName = lines[0];
            names.push(speciesName);
            const moves = [];
            const abilities = [];
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i];
                const moveMatch = line.match(/^Lv\.\s*\d+\s+(.+)$/);
                if (moveMatch) {
                    const moveName = moveMatch[1].trim();
                    if (!moves.includes(moveName))
                        moves.push(moveName);
                    continue;
                }
                const abilityMatch = line.match(/^(?:Ability \d|Hidden Ability):\s*(.+)$/i);
                if (abilityMatch) {
                    const ab = abilityMatch[1].trim();
                    if (ab && ab !== 'None' && !abilities.includes(ab))
                        abilities.push(ab);
                }
            }
            result[normalizeLearnsetKey(speciesName)] = { moves, abilities };
        }
        learnsetCache = result;
        speciesNamesCache = names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    }
    return learnsetCache;
}
function getSpeciesNames() {
    getLearnsetData();
    return speciesNamesCache || [];
}
function showdownToLearnsetKey(species) {
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
    const gen = Number(req.query.gen ?? 9);
    const data = getLearnsetData();
    const lkey = showdownToLearnsetKey(species);
    let entry = data[lkey];
    if (!entry) {
        for (const [k, v] of Object.entries(data)) {
            if (k.startsWith(lkey) || lkey.startsWith(k)) {
                entry = v;
                break;
            }
        }
    }
    const moves = entry?.moves ?? [];
    const abilities = entry?.abilities ?? [];
    const g = calc_1.Generations.get(gen);
    const moveDetails = {};
    for (const moveName of moves) {
        try {
            const mv = new calc_1.Move(g, moveName);
            moveDetails[moveName] = { bp: mv.bp, type: mv.type, category: mv.category };
        }
        catch { /* skip unknown moves */ }
    }
    let baseStats = {};
    let types = [];
    try {
        const pokemon = new calc_1.Pokemon(g, species, { level: 50 });
        const bs = pokemon.species.baseStats;
        baseStats = { hp: bs.hp, atk: bs.atk, def: bs.def, spa: bs.spa, spd: bs.spd, spe: bs.spe };
        types = pokemon.types.map(String);
    }
    catch { /* species not in calc data */ }
    res.json({ moves, abilities, moveDetails, baseStats, types });
});
app.get('/api/species', (_req, res) => {
    try {
        res.json(getSpeciesNames());
    }
    catch (e) {
        res.status(500).json({ error: e?.message || 'Failed to load species list' });
    }
});
app.get('/api/items', (req, res) => {
    const gen = Number(req.query.gen ?? 9);
    const items = calc_1.ITEMS[gen] ?? [];
    res.json(items);
});
function parseTrainerBattlesFile() {
    const filePath = path_1.default.resolve(__dirname, '..', 'Trainer Battles.txt');
    if (!fs_1.default.existsSync(filePath))
        return [];
    const text = fs_1.default.readFileSync(filePath, 'utf-8');
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const trainers = [];
    let currentArea = '';
    let currentTrainer = null;
    let globalId = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) {
            if (currentTrainer && currentTrainer.pokemon.length > 0) {
                trainers.push(currentTrainer);
                currentTrainer = null;
            }
            continue;
        }
        if (line.startsWith('------')) {
            if (currentTrainer && currentTrainer.pokemon.length > 0) {
                trainers.push(currentTrainer);
                currentTrainer = null;
            }
            const nextLine = lines[i + 1]?.trim();
            if (nextLine && !nextLine.startsWith('------')) {
                currentArea = nextLine;
                i++;
                if (lines[i + 1]?.trim().startsWith('------'))
                    i++;
            }
            continue;
        }
        if (line.startsWith('- ') || line === '~')
            continue;
        const lvMatch = line.match(/\bLv\.\d+\b/);
        if (lvMatch) {
            const poke = parseTrainerPokemonLine(line);
            if (poke && currentTrainer) {
                currentTrainer.pokemon.push(poke);
            }
        }
        else {
            if (currentTrainer && currentTrainer.pokemon.length > 0) {
                trainers.push(currentTrainer);
            }
            const tags = [];
            let trainerName = line;
            const tagMatches = line.matchAll(/\[([^\]]+)\]/g);
            for (const m of tagMatches) {
                tags.push(m[1]);
                trainerName = trainerName.replace(m[0], '');
            }
            trainerName = trainerName.trim();
            currentTrainer = {
                id: globalId++,
                name: trainerName,
                area: currentArea,
                tags,
                pokemon: [],
            };
        }
    }
    if (currentTrainer && currentTrainer.pokemon.length > 0) {
        trainers.push(currentTrainer);
    }
    return trainers;
}
function parseTrainerPokemonLine(line) {
    let work = line.trim();
    let nature;
    let ability;
    const bracketMatch = work.match(/\[([^\]]+)\]\s*$/);
    if (bracketMatch) {
        const parts = bracketMatch[1].split('|').map(s => s.trim());
        nature = parts[0] || undefined;
        ability = parts[1] || undefined;
        work = work.slice(0, bracketMatch.index).trim();
    }
    const lvMatch = work.match(/\bLv\.(\d+)\b/);
    if (!lvMatch)
        return null;
    const level = parseInt(lvMatch[1], 10);
    const species = work.slice(0, work.indexOf('Lv.')).trim();
    if (!species)
        return null;
    const afterLv = work.slice(work.indexOf('Lv.') + lvMatch[0].length).trim();
    let item;
    let moves = [];
    const atIdx = afterLv.indexOf('@');
    if (atIdx !== -1) {
        const afterAt = afterLv.slice(atIdx + 1).trim();
        const colonIdx = afterAt.indexOf(':');
        if (colonIdx !== -1) {
            item = afterAt.slice(0, colonIdx).trim();
            moves = afterAt.slice(colonIdx + 1).split(',').map(s => s.trim()).filter(Boolean);
        }
        else {
            item = afterAt.trim();
        }
    }
    else {
        const parts = afterLv.split(',').map(s => s.trim()).filter(Boolean);
        if (parts.length > 0)
            moves = parts;
    }
    return { species, level, item, moves, nature, ability };
}
let trainerCache = null;
function getTrainerData() {
    if (!trainerCache)
        trainerCache = parseTrainerBattlesFile();
    return trainerCache;
}
app.get('/api/trainers', (_req, res) => {
    try {
        const trainers = getTrainerData();
        res.json(trainers);
    }
    catch (e) {
        res.status(500).json({ error: e?.message || 'Failed to parse trainer battles' });
    }
});
app.get('/api/trainers/:id/enemy-text', (req, res) => {
    try {
        const trainers = getTrainerData();
        const id = parseInt(req.params.id, 10);
        const trainer = trainers.find(t => t.id === id);
        if (!trainer)
            return res.status(404).json({ error: 'Trainer not found' });
        const lines = trainer.pokemon.map(p => {
            let line = `${p.species} Lv.${p.level}`;
            if (p.item) {
                line += ` @ ${p.item}`;
            }
            if (p.moves.length > 0) {
                line += `: ${p.moves.join(', ')}`;
            }
            if (p.nature || p.ability) {
                line += ` [${p.nature || ''}|${p.ability || ''}]`;
            }
            return line;
        });
        res.json({ text: lines.join('\n'), trainer });
    }
    catch (e) {
        res.status(500).json({ error: e?.message || 'Failed to get trainer' });
    }
});
// --- AI Move Distribution (using syl-rnb-calc) ---
const sylCalcDistPath = path_1.default.resolve(__dirname, '..', 'vendor', 'syl-rnb-calc');
let sylCalcModule = null;
let generateMoveDistFn = null;
try {
    sylCalcModule = require(sylCalcDistPath);
    generateMoveDistFn = require(path_1.default.join(sylCalcDistPath, 'ai')).generateMoveDist;
}
catch (e) {
    console.warn('[ai-move-dist] Could not load syl-rnb-calc:', e.message);
}
app.post('/api/ai-move-dist', (req, res) => {
    if (!sylCalcModule || !generateMoveDistFn) {
        return res.status(503).json({ error: 'AI module not available. Ensure vendor/syl-rnb-calc/ contains the compiled dist files.' });
    }
    try {
        const { gen = 9, myPokemon, enemyPokemon, myMoves, enemyMoves, myText = '', enemyText = '', aiOptions = {}, } = req.body || {};
        if (!myPokemon || !enemyPokemon || !enemyMoves || !myMoves) {
            return res.status(400).json({ error: 'myPokemon, enemyPokemon, myMoves, enemyMoves required' });
        }
        const genNum = Number(gen);
        const SylCalc = sylCalcModule;
        const mySets = (0, parser_1.parseShowdownTeamsFile)(String(myText)).map(normalizeNoEVs);
        const enemySets = (0, parser_1.parseEnemyCompactLines)(String(enemyText)).map(normalizeNoEVs);
        const lookup = buildLookup([...mySets, ...enemySets]);
        const mySet = lookup[key(String(myPokemon))];
        const enemySet = lookup[key(String(enemyPokemon))];
        if (!mySet)
            return res.status(404).json({ error: `Unknown my pokemon: ${myPokemon}` });
        if (!enemySet)
            return res.status(404).json({ error: `Unknown enemy pokemon: ${enemyPokemon}` });
        function toSylPokemon(set, curHP) {
            const norm = (s) => (s && s.trim().length ? s : undefined);
            const sIV = (set.ivs ?? {});
            const sEV = (set.evs ?? {});
            const opts = {
                level: set.level ?? 50,
                nature: norm(set.nature),
                ability: norm(set.ability),
                item: norm(set.item),
                status: set.status,
                ivs: {
                    hp: sIV.hp ?? sIV.HP ?? 31, atk: sIV.atk ?? sIV.Atk ?? 31,
                    def: sIV.def ?? sIV.Def ?? 31, spa: sIV.spa ?? sIV.SpA ?? 31,
                    spd: sIV.spd ?? sIV.SpD ?? 31, spe: sIV.spe ?? sIV.Spe ?? 31,
                },
                evs: {
                    hp: sEV.hp ?? sEV.HP ?? 0, atk: sEV.atk ?? sEV.Atk ?? 0,
                    def: sEV.def ?? sEV.Def ?? 0, spa: sEV.spa ?? sEV.SpA ?? 0,
                    spd: sEV.spd ?? sEV.SpD ?? 0, spe: sEV.spe ?? sEV.Spe ?? 0,
                },
                moves: set.moves,
            };
            if (typeof curHP === 'number')
                opts.curHP = curHP;
            return new SylCalc.Pokemon(genNum, set.species, opts);
        }
        const playerPoke = toSylPokemon(mySet);
        const enemyPoke = toSylPokemon(enemySet);
        const field = new SylCalc.Field({});
        const playerResults = [];
        for (const moveName of myMoves.slice(0, 4)) {
            try {
                const mv = new SylCalc.Move(genNum, moveName);
                playerResults.push(SylCalc.calculate(genNum, playerPoke, enemyPoke, mv, field));
            }
            catch {
                playerResults.push(SylCalc.calculate(genNum, playerPoke, enemyPoke, new SylCalc.Move(genNum, 'Tackle'), field));
            }
        }
        while (playerResults.length < 4) {
            playerResults.push(SylCalc.calculate(genNum, playerPoke, enemyPoke, new SylCalc.Move(genNum, 'Tackle'), field));
        }
        const enemyResults = [];
        for (const moveName of enemyMoves.slice(0, 4)) {
            try {
                const mv = new SylCalc.Move(genNum, moveName);
                enemyResults.push(SylCalc.calculate(genNum, enemyPoke, playerPoke, mv, field));
            }
            catch {
                enemyResults.push(SylCalc.calculate(genNum, enemyPoke, playerPoke, new SylCalc.Move(genNum, 'Tackle'), field));
            }
        }
        while (enemyResults.length < 4) {
            enemyResults.push(SylCalc.calculate(genNum, enemyPoke, playerPoke, new SylCalc.Move(genNum, 'Tackle'), field));
        }
        const playerSpeed = playerPoke.stats.spe ?? playerPoke.rawStats?.spe ?? 0;
        const enemySpeed = enemyPoke.stats.spe ?? enemyPoke.rawStats?.spe ?? 0;
        const fastestSide = playerSpeed >= enemySpeed ? '0' : '1';
        const defaultAiOptions = {
            firstTurnOutAiOpt: true,
            protectIncentiveAiOpt: true,
            tauntAiOpt: false,
            ...aiOptions,
        };
        const damageResults = [playerResults, enemyResults];
        const moveProbs = generateMoveDistFn(damageResults, fastestSide, defaultAiOptions);
        const moveNames = enemyMoves.slice(0, 4);
        while (moveNames.length < 4)
            moveNames.push('');
        res.json({ moveProbs, moveNames });
    }
    catch (e) {
        console.error('[ai-move-dist] Error:', e);
        res.status(500).json({ error: e?.message || 'AI move dist failed' });
    }
});
// --- Matchup Finder ---
app.post('/api/matchups', (req, res) => {
    try {
        const { myText = '', enemyText = '', enemySpecies, gen = 9 } = req.body || {};
        if (!enemySpecies)
            return res.status(400).json({ error: 'enemySpecies is required' });
        const genNum = Number(gen);
        const g = calc_1.Generations.get(genNum);
        const mySets = (0, parser_1.parseShowdownTeamsFile)(String(myText)).map(normalizeNoEVs);
        const enemySets = (0, parser_1.parseEnemyCompactLines)(String(enemyText)).map(normalizeNoEVs);
        const enemySet = enemySets.find(s => key(s.species) === key(String(enemySpecies)));
        if (!enemySet)
            return res.status(404).json({ error: `Unknown enemy: ${enemySpecies}` });
        const enemyPoke = toCalcPokemon(g, enemySet);
        const enemySpeed = enemyPoke.rawStats.spe;
        const results = mySets.map(mySet => {
            let mySpeed = 0;
            try {
                const myPoke = toCalcPokemon(g, mySet);
                mySpeed = myPoke.rawStats.spe;
            }
            catch { /* fall through with speed 0 */ }
            const isFaster = mySpeed >= enemySpeed;
            let bestMove = '';
            let bestMaxPct = 0;
            let bestMinPct = 0;
            for (const moveName of mySet.moves) {
                if (getStatChangingMove(moveName) || getStatusMove(moveName))
                    continue;
                try {
                    const sum = (0, damage_1.damageSummary)(genNum, mySet, enemySet, moveName);
                    if (sum.maxPct > bestMaxPct) {
                        bestMaxPct = sum.maxPct;
                        bestMinPct = sum.minPct;
                        bestMove = moveName;
                    }
                }
                catch { /* skip moves the calc can't handle */ }
            }
            let enemyBestMove = '';
            let enemyBestMaxPct = 0;
            for (const moveName of enemySet.moves) {
                if (getStatChangingMove(moveName) || getStatusMove(moveName))
                    continue;
                try {
                    const sum = (0, damage_1.damageSummary)(genNum, enemySet, mySet, moveName);
                    if (sum.maxPct > enemyBestMaxPct) {
                        enemyBestMaxPct = sum.maxPct;
                        enemyBestMove = moveName;
                    }
                }
                catch { /* skip */ }
            }
            let tier = 'none';
            if (bestMaxPct >= 100) {
                tier = isFaster ? 'fastOhko' : 'slowOhko';
            }
            else if (bestMinPct * 2 >= 100) {
                if (isFaster) {
                    tier = 'fast2hko';
                }
                else if (enemyBestMaxPct < 100) {
                    tier = 'slow2hko';
                }
            }
            return {
                species: mySet.species,
                tier,
                bestMove,
                bestMoveDmgPct: bestMaxPct,
                bestMoveMinPct: bestMinPct,
                enemyBestMove,
                enemyBestDmgPct: enemyBestMaxPct,
                mySpeed,
                enemySpeed,
            };
        });
        res.json(results);
    }
    catch (e) {
        console.error('[matchups] Error:', e);
        res.status(500).json({ error: e?.message || 'matchups failed' });
    }
});
app.post('/api/find-tanks', (req, res) => {
    try {
        const { myText = '', enemyText = '', enemySpecies, enemyMove, gen = 9 } = req.body || {};
        if (!enemySpecies || !enemyMove) {
            return res.status(400).json({ error: 'enemySpecies and enemyMove are required' });
        }
        const genNum = Number(gen);
        const mySets = (0, parser_1.parseShowdownTeamsFile)(String(myText)).map(normalizeNoEVs);
        const enemySets = (0, parser_1.parseEnemyCompactLines)(String(enemyText)).map(normalizeNoEVs);
        const enemySet = enemySets.find(s => key(s.species) === key(String(enemySpecies)));
        if (!enemySet)
            return res.status(404).json({ error: `Unknown enemy: ${enemySpecies}` });
        const results = mySets.map(mySet => {
            let dmgMaxPct = 0;
            try {
                const sum = (0, damage_1.damageSummary)(genNum, enemySet, mySet, String(enemyMove));
                dmgMaxPct = sum.maxPct;
            }
            catch { /* move may not be valid against this target */ }
            const hitsToKO = dmgMaxPct > 0 ? Math.ceil(100 / dmgMaxPct) : 999;
            let tier = 'none';
            if (hitsToKO >= 5)
                tier = 'elite';
            else if (hitsToKO >= 3)
                tier = 'good';
            return {
                species: mySet.species,
                hitsToKO,
                dmgPctPerHit: dmgMaxPct,
                tier,
            };
        });
        res.json(results);
    }
    catch (e) {
        console.error('[find-tanks] Error:', e);
        res.status(500).json({ error: e?.message || 'find-tanks failed' });
    }
});
// --- Switch-In AI Score ---
function computeSwitchScore(genNum, candidateSet, playerSet) {
    const g = calc_1.Generations.get(genNum);
    const candidatePoke = toCalcPokemon(g, candidateSet);
    const playerPoke = toCalcPokemon(g, playerSet);
    const candidateSpeed = candidatePoke.rawStats.spe;
    const playerSpeed = playerPoke.rawStats.spe;
    const isFaster = candidateSpeed >= playerSpeed;
    let bestCandidateDmgPct = 0;
    for (const moveName of candidateSet.moves) {
        if (getStatChangingMove(moveName) || getStatusMove(moveName))
            continue;
        try {
            const sum = (0, damage_1.damageSummary)(genNum, candidateSet, playerSet, moveName);
            if (sum.maxPct > bestCandidateDmgPct)
                bestCandidateDmgPct = sum.maxPct;
        }
        catch { /* skip */ }
    }
    let bestPlayerDmgPct = 0;
    for (const moveName of playerSet.moves) {
        if (getStatChangingMove(moveName) || getStatusMove(moveName))
            continue;
        try {
            const sum = (0, damage_1.damageSummary)(genNum, playerSet, candidateSet, moveName);
            if (sum.maxPct > bestPlayerDmgPct)
                bestPlayerDmgPct = sum.maxPct;
        }
        catch { /* skip */ }
    }
    const canOHKO = bestCandidateDmgPct >= 100;
    const isOHKOd = bestPlayerDmgPct >= 100;
    let score = 0;
    if (isFaster && canOHKO) {
        score = 5;
    }
    else if (!isFaster && canOHKO && !isOHKOd) {
        score = 4;
    }
    else if (isFaster && bestCandidateDmgPct > bestPlayerDmgPct) {
        score = 3;
    }
    else if (!isFaster && bestCandidateDmgPct > bestPlayerDmgPct) {
        score = 2;
    }
    else if (isFaster) {
        score = 1;
    }
    else if (!isFaster && isOHKOd) {
        score = -1;
    }
    // Special cases
    const speciesLower = candidateSet.species.toLowerCase();
    if (speciesLower === 'ditto') {
        score = Math.max(score, 2);
    }
    if (speciesLower === 'wynaut' || speciesLower === 'wobbuffet') {
        if (!(!isFaster && isOHKOd)) {
            score = Math.max(score, 2);
        }
    }
    return score;
}
app.post('/api/switch-scores', (req, res) => {
    try {
        const { myText = '', enemyText = '', playerPokemon, gen = 9 } = req.body || {};
        if (!playerPokemon) {
            return res.status(400).json({ error: 'playerPokemon is required' });
        }
        const genNum = Number(gen);
        const mySets = (0, parser_1.parseShowdownTeamsFile)(String(myText)).map(normalizeNoEVs);
        const enemySets = (0, parser_1.parseEnemyCompactLines)(String(enemyText)).map(normalizeNoEVs);
        const lookup = buildLookup([...mySets, ...enemySets]);
        const playerSet = lookup[key(String(playerPokemon))];
        if (!playerSet) {
            return res.status(404).json({ error: `Unknown player pokemon: ${playerPokemon}` });
        }
        const scores = enemySets.map((enemySet, partyIndex) => {
            const score = computeSwitchScore(genNum, enemySet, playerSet);
            return { species: enemySet.species, score, partyIndex };
        });
        // Determine the best: highest score, ties broken by party order (lower index first)
        let bestIdx = 0;
        for (let i = 1; i < scores.length; i++) {
            if (scores[i].score > scores[bestIdx].score)
                bestIdx = i;
        }
        const result = scores.map((s, i) => ({
            species: s.species,
            score: s.score,
            isBest: i === bestIdx,
        }));
        console.log('[switch-scores]', playerPokemon, '→', result.map(r => `${r.species}(${r.score >= 0 ? '+' : ''}${r.score}${r.isBest ? '★' : ''})`).join(', '));
        res.json({ scores: result });
    }
    catch (e) {
        console.error('[switch-scores] Error:', e);
        res.status(500).json({ error: e?.message || 'switch-scores failed' });
    }
});
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
});
