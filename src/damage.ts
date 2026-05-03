// src/damage.ts
import {
    calculate,
    Pokemon,
    Move,
    Field,
    Generations,
    GenerationNum,
  } from '@smogon/calc';
  import { DamageSummary, SimpleSet } from './types';
  
  // Map our keys (atk/def/spa/spd/spe) → calc keys (at/df/sa/sd/sp) and ensure all 6 exist
// src/damage.ts
function toCalcPokemon(gen: ReturnType<typeof Generations.get>, set: SimpleSet, boosts?: any) {
    const norm = (s?: string) => (s && s.trim().length ? s : undefined);

    const sIV = (set.ivs ?? {}) as any;
    const sEV = (set.evs ?? {}) as any;

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
    } as any;

    const evs = {
        // short
        hp: ev_hp, at: ev_at, df: ev_df, sa: ev_sa, sd: ev_sd, sp: ev_sp,
        // long (mirrors)
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
  
  export function damageSummary(
    genNum: number,
    atk: SimpleSet,
    def: SimpleSet,
    moveName: string,
    fieldInput?: Partial<ConstructorParameters<typeof Field>[0]>,
    attackerBoosts?: any,
    defenderBoosts?: any
  ): DamageSummary {
    const gen = Generations.get(genNum as GenerationNum);
  
    const A = toCalcPokemon(gen, atk, attackerBoosts);
    const D = toCalcPokemon(gen, def, defenderBoosts);
    
    console.log('[damageSummary] Pokemon A boosts:', (A as any).boosts);
    console.log('[damageSummary] Pokemon D boosts:', (D as any).boosts);
    
    const move = new Move(gen, moveName);
    const field = new Field(fieldInput ?? {});
  
    let res;
    try {
      res = calculate(gen, A, D, move, field);
    } catch (e) {
      console.error('[calc error] move:', moveName);
      console.error('[attacker]', {
        species: A.species.name, level: A.level, item: A.item, ability: A.ability, nature: A.nature,
        status: (A as any).status, ivs: (A as any).ivs, evs: (A as any).evs,
      });
      console.error('[defender]', {
        species: D.species.name, level: D.level, item: D.item, ability: D.ability, nature: D.nature,
        status: (D as any).status, ivs: (D as any).ivs, evs: (D as any).evs,
      });
      throw e;
    }
  
    const rawDmg = Array.isArray(res.damage) ? res.damage as number[] : [res.damage as number];
    const rollsHP = rawDmg.map(n => Math.max(0, n));
    const [minHP, maxHPdmg] = res.range();
    const defMaxHP = D.maxHP();
    const pct = (n: number) => Math.round((100 * n) / defMaxHP);
    const rollsPct = rollsHP.map(pct);
  
    const critRes = calculate(gen, A, D, new Move(gen, moveName, { isCrit: true }), field);
    const rawCritDmg = Array.isArray(critRes.damage) ? critRes.damage as number[] : [critRes.damage as number];
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
  