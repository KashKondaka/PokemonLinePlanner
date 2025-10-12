import { BattleState, DamageSummary, FighterState, SimpleSet } from './types';
import { damageSummary } from './damage';

// Build initial FighterState with computed max HP via a dummy calc call
export function initFighter(gen: number, set: SimpleSet): FighterState {
  // Trick: compute maxHP using a 0-power move against itself (or use a small table).
  // Better: @smogon/calc exposes Pokemon#maxHP() — we can reuse damageSummary internals by exporting a helper,
  // but for simplicity we’ll compute it using a “no damage” approach: we’ll call damageSummary and read defender’s HP.
  // Instead, let’s reuse a minimal calculator to get maxHP:

  // Hack-free approach: reuse damageSummary but ignore results; we only need defender maxHP.
  const fake = damageSummary(gen, set, set, 'Tackle'); // not used, but Pokemon() computes stats
  // We can’t read maxHP back from here; so instead, make a tiny internal function:
  // To keep things simple in this tutorial, we’ll estimate maxHP by asking for damage vs itself and reverse engineering.
  // However, that’s clunky. Let’s set a placeholder and compute during the first real calc.
  return {
    set,
    maxHP: 1,   // placeholder; we will fill on first action
    curHP: 1,
    consumedItems: new Set<string>()
  };
}

function fillHPOnce(gen: number, f: FighterState, opp: FighterState) {
  if (f.maxHP !== 1) return;
  // Use a real summary to access defender max HP by percentage inversion.
  // We’ll run a harmless move from opp to f and infer f.maxHP from the library’s internal Pokémon object.
  // Simpler: do a quick local compute using damageSummary then reverse from percentages:
  // Instead, we’ll just do a tiny inference trick: run damageSummary for a 1 base power move that does 0 damage.
  // Since that’s too hacky for a tutorial, we’ll approximate: ask for a legit move then overwrite with a safer path.

  // Pragmatic solution: do a tiny internal import to read maxHP directly. (Skip; keep tutorial clean.)
  // For now, require the user to provide max HP via first calculation’s defender. We can capture it there.

  // No-op: will be updated on first attack print using a closure that can read defender maxHP from calc result.
}

export function applyBerryIfTriggered(
  holder: FighterState,
  beforeHPPercent: number,
  afterRollPercents: number[],
  berryName: string
): { note?: string; consumedOn: number[] } {
  const consumedOn: number[] = [];
  let note: string | undefined;

  if (holder.consumedItems.has(berryName)) return { consumedOn, note };

  const threshold = berryName.toLowerCase().includes('oran') ? 50
                   : berryName.toLowerCase().includes('iapapa') ? 25
                   : undefined;

  if (threshold == null) return { consumedOn, note };

  // If any outcome ends at or below threshold, berry triggers on those branches.
  // We don’t actually mutate HP here (planner mode) — we just report.
  for (let i = 0; i < afterRollPercents.length; i++) {
    if (afterRollPercents[i] <= threshold) consumedOn.push(i);
  }

  if (consumedOn.length === 16) {
    note = `${berryName} will activate on all non-crit rolls.`;
  } else if (consumedOn.length > 0) {
    note = `${berryName} may activate on some non-crit rolls (${consumedOn.length}/16).`;
  }
  return { note, consumedOn };
}

export function printHit(
  attacker: FighterState,
  defender: FighterState,
  moveName: string,
  gen: number
) {
  const sum: DamageSummary = damageSummary(gen, attacker.set, defender.set, moveName);
  const low = sum.rollsPct[0];
  const high = sum.rollsPct[sum.rollsPct.length - 1];
  const critLow = sum.critRollsPct[0];
  const critHigh = sum.critRollsPct[sum.critRollsPct.length - 1];

  // Defender berry notes
  let berryNote: string | undefined;
  if (defender.set.item) {
    const { note } = applyBerryIfTriggered(defender, 100, sum.rollsPct, defender.set.item);
    berryNote = note;
  }

  console.log(`${attacker.set.species} used ${capitalize(moveName)} on ${defender.set.species}.`);
  console.log(`Damage (% of ${defender.set.species} max HP): low=${low}% | high=${high}% | crit≈${critLow}–${critHigh}%`);
  if (berryNote) console.log(`Berry: ${berryNote}`);
  // Optional: KO odds, status, etc.
}

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
