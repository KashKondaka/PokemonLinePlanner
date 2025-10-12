// src/logic/hpMath.ts
export type BerryRule =
  | { kind: 'heal-flat'; name: 'oran'; thresholdPct: number; healHP: number }
  | { kind: 'heal-pct';  name: 'sitrus'; thresholdPct: number; healPct: number };

export function normalizeBerryName(s?: string) {
  if (!s) return undefined;
  const k = s.toLowerCase().replace(/\s+/g, '');
  if (k.startsWith('oran')) return 'oran';
  if (k.startsWith('sitrus')) return 'sitrus';
  return undefined;
}

/** Gen-aware rules for healing berries we support in planner */
export function inferBerryRule(name: string | undefined, gen: number): BerryRule | undefined {
  if (!name) return undefined;
  if (name === 'oran') {
    // Oran = +10 HP, threshold ≤50% in modern gens (older gens also 10 HP; threshold behavior doesn’t matter for planner preview)
    return { kind: 'heal-flat', name: 'oran', thresholdPct: 50, healHP: 10 };
  }
  if (name === 'sitrus') {
    // Sitrus is 25% (Gen 4+) at ≤50%
    const healPct = 25;
    return { kind: 'heal-pct', name: 'sitrus', thresholdPct: 50, healPct };
  }
  return undefined;
}

export function formatPct(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

type BaseRemain = { lowPct: number; highPct: number; critPct: number; defenderMaxHP?: number };

function applyHeal(rawPct: number, rule: BerryRule, maxHP?: number) {
  if (rule.kind === 'heal-flat') {
    const healHP = rule.healHP;
    const healPct = maxHP && maxHP > 0 ? Math.round((healHP / maxHP) * 100) : 0;
    return { pct: formatPct(rawPct + healPct), hp: undefined, healHP, healPct };
  } else {
    const healPct = rule.healPct;
    return { pct: formatPct(rawPct + healPct), hp: undefined, healHP: undefined, healPct };
  }
}

/**
 * Given the current defender %, and raw API remaining % (no berry),
 * apply berry only if the post-hit remaining is ≤ threshold.
 * Returns adjusted branches + flags if the berry was consumed on that branch.
 */
export function adjustFromCurrentRWithBerry(
  currentPct: number,
  base: BaseRemain,
  rule: BerryRule | undefined,
  maxHP?: number
) {
  const applyBranch = (rawPct: number) => {
    if (!rule) {
      return { pct: formatPct(rawPct), hp: undefined, consumed: false, healHP: 0, healPct: 0 };
    }
    // Trigger ONLY if post-hit (raw) remaining crosses threshold (≤)
    if (rawPct <= rule.thresholdPct) {
      const healed = applyHeal(rawPct, rule, maxHP);
      return {
        pct: healed.pct,
        hp: healed.hp,
        consumed: true,
        healHP: (healed.healHP ?? 0),
        healPct: (healed.healPct ?? 0),
      };
    }
    return { pct: formatPct(rawPct), hp: undefined, consumed: false, healHP: 0, healPct: 0 };
  };

  const low  = applyBranch(base.lowPct);
  const high = applyBranch(base.highPct);
  const crit = applyBranch(base.critPct);

  return { low, high, crit };
}
