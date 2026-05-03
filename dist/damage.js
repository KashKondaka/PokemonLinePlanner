"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.damageSummary = damageSummary;
// src/damage.ts
const calc_1 = require("@smogon/calc");
// Map our keys (atk/def/spa/spd/spe) → calc keys (at/df/sa/sd/sp) and ensure all 6 exist
// src/damage.ts
function toCalcPokemon(gen, set, boosts) {
    const norm = (s) => (s && s.trim().length ? s : undefined);
    const sIV = (set.ivs ?? {});
    const sEV = (set.evs ?? {});
    // Decide each stat value once, preferring calc-style first if present,
    // then showdown-style, then default.
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
    // Mirror to BOTH naming conventions so the calc can't fall back to its 31 defaults.
    const ivs = {
        // short keys
        hp: iv_hp, at: iv_at, df: iv_df, sa: iv_sa, sd: iv_sd, sp: iv_sp,
        // long keys (mirrors)
        atk: iv_at, def: iv_df, spa: iv_sa, spd: iv_sd, spe: iv_sp,
    };
    const evs = {
        // short
        hp: ev_hp, at: ev_at, df: ev_df, sa: ev_sa, sd: ev_sd, sp: ev_sp,
        // long (mirrors)
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
function damageSummary(genNum, atk, def, moveName, fieldInput, attackerBoosts, defenderBoosts) {
    const gen = calc_1.Generations.get(genNum);
    const A = toCalcPokemon(gen, atk, attackerBoosts);
    const D = toCalcPokemon(gen, def, defenderBoosts);
    console.log('[damageSummary] Pokemon A boosts:', A.boosts);
    console.log('[damageSummary] Pokemon D boosts:', D.boosts);
    const move = new calc_1.Move(gen, moveName);
    const field = new calc_1.Field(fieldInput ?? {});
    let res;
    try {
        res = (0, calc_1.calculate)(gen, A, D, move, field);
    }
    catch (e) {
        console.error('[calc error] move:', moveName);
        console.error('[attacker]', {
            species: A.species.name, level: A.level, item: A.item, ability: A.ability, nature: A.nature,
            status: A.status, ivs: A.ivs, evs: A.evs,
        });
        console.error('[defender]', {
            species: D.species.name, level: D.level, item: D.item, ability: D.ability, nature: D.nature,
            status: D.status, ivs: D.ivs, evs: D.evs,
        });
        throw e;
    }
    const rawDmg = Array.isArray(res.damage) ? res.damage : [res.damage];
    const rollsHP = rawDmg.map(n => Math.max(0, n));
    const [minHP, maxHPdmg] = res.range();
    const defMaxHP = D.maxHP();
    const pct = (n) => Math.round((100 * n) / defMaxHP);
    const rollsPct = rollsHP.map(pct);
    const critRes = (0, calc_1.calculate)(gen, A, D, new calc_1.Move(gen, moveName, { isCrit: true }), field);
    const rawCritDmg = Array.isArray(critRes.damage) ? critRes.damage : [critRes.damage];
    const critRollsHP = rawCritDmg.map(n => Math.max(0, n));
    const [cminHP, cmaxHPdmg] = critRes.range();
    const critRollsPct = critRollsHP.map(pct);
    return {
        defenderMaxHP: defMaxHP,
        minPct: pct(minHP),
        maxPct: pct(maxHPdmg),
        rollsPct,
        rollsHP,
        critMinPct: pct(cminHP),
        critMaxPct: pct(cmaxHPdmg),
        critRollsPct,
        critRollsHP,
        desc: res.desc(),
    };
}
