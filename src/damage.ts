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
  
  function flattenDamage(damage: unknown): number[] {
    if (typeof damage === 'number') return [Math.max(0, damage)];
    if (!Array.isArray(damage)) return [0];
    if (damage.length === 0) return [0];
    // Multi-hit moves return number[][] — sum each roll set
    if (Array.isArray(damage[0])) {
      const hits = damage as number[][];
      const rollCount = hits[0].length;
      const summed: number[] = new Array(rollCount).fill(0);
      for (const hitRolls of hits) {
        for (let i = 0; i < rollCount; i++) summed[i] += (hitRolls[i] ?? 0);
      }
      return summed.map(n => Math.max(0, n));
    }
    return (damage as number[]).map(n => Math.max(0, typeof n === 'number' ? n : 0));
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
  
    const defMaxHP = D.maxHP();
    const pct = (n: number) => defMaxHP > 0 ? Math.round((100 * n) / defMaxHP) : 0;

    let res;
    try {
      res = calculate(gen, A, D, move, field);
    } catch (e) {
      console.error('[calc error] move:', moveName, (e as any)?.message);
      // Immune or unsupported — return all-zero result
      return {
        defenderMaxHP: defMaxHP,
        minPct: 0, maxPct: 0, rollsPct: [0], rollsHP: [0],
        critMinPct: 0, critMaxPct: 0, critRollsPct: [0], critRollsHP: [0],
        desc: `${A.species.name} used ${moveName} on ${D.species.name} — no effect`,
      };
    }

    const rollsHP = flattenDamage(res.damage);
    const rollsPct = rollsHP.map(pct);
    let minHP: number, maxHPdmg: number;
    try { [minHP, maxHPdmg] = res.range(); } catch { minHP = rollsHP[0] ?? 0; maxHPdmg = rollsHP[rollsHP.length - 1] ?? 0; }

    let critRollsHP: number[];
    let cminHP: number, cmaxHPdmg: number;
    try {
      const critRes = calculate(gen, A, D, new Move(gen, moveName, { isCrit: true }), field);
      critRollsHP = flattenDamage(critRes.damage);
      try { [cminHP, cmaxHPdmg] = critRes.range(); } catch { cminHP = critRollsHP[0] ?? 0; cmaxHPdmg = critRollsHP[critRollsHP.length - 1] ?? 0; }
    } catch {
      critRollsHP = [0];
      cminHP = 0; cmaxHPdmg = 0;
    }
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
      desc: (() => { try { return res.desc(); } catch { return ''; } })(),
    };
  }
  