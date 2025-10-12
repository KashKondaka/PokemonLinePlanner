// src/logic/status.ts

export type StatusType = 'burn' | 'psn' | 'tox' | 'par';

export type StatusState = {
  type: StatusType;
  // For badly poisoned (Toxic), the stage starts at 1 (i.e., 1/16),
  // and increases by +1 each end of turn while active.
  toxicStage?: number;
};

/** Very small deterministic move→status mapper.
 *  (We avoid probabilistic moves like Scald/Flamethrower to keep it simple.)
 */
export function inferStatusFromMove(moveName: string): StatusType | null {
  const m = moveName.trim().toLowerCase();
  if (m === 'will o wisp' || m === 'will-o-wisp' || m === 'will-o’-wisp') return 'burn';
  if (m === 'thunder wave') return 'par';
  if (m === 'toxic') return 'tox';
  if (m === 'poison gas' || m === 'poison powder' || m === 'poisonpowder') return 'psn';
  return null;
}

/** User-friendly label for chips/notes */
export function statusLabel(s: StatusState | undefined) {
  if (!s) return '';
  if (s.type === 'burn') return 'BRN';
  if (s.type === 'par') return 'PAR';
  if (s.type === 'psn') return 'PSN';
  if (s.type === 'tox') return `TOX${s.toxicStage ? `(${s.toxicStage})` : ''}`;
  return '';
}

/** Compute end-of-turn residual on current HP% given a status.
 *  Returns newPct, hpLoss (absolute), and nextToxicStage (if applicable).
 *
 *  Conventions used (modern gens):
 *   - Burn: 1/16 max HP
 *   - Poison: 1/8 max HP
 *   - Badly Poisoned (Toxic): n/16 this turn, then n+=1
 *   - Paralysis: no EoT damage
 *
 *  If maxHP is unknown, we do pure percent math (rounded).
 */
export function applyEndOfTurnResidual(
  currentPct: number,
  maxHP: number | undefined,
  status: StatusState | undefined
): { nextPct: number; lossPct: number; lossHP?: number; nextStatus?: StatusState } {
  if (!status) return { nextPct: currentPct, lossPct: 0, lossHP: 0, nextStatus: undefined };

  let lossPct = 0;
  let nextStatus: StatusState | undefined = { ...status };

  switch (status.type) {
    case 'burn':
      lossPct = 100 / 16; // 6.25%
      break;
    case 'psn':
      lossPct = 100 / 8; // 12.5%
      break;
    case 'tox': {
      const n = Math.max(1, status.toxicStage ?? 1);
      lossPct = (100 / 16) * n; // n * 6.25%
      nextStatus.toxicStage = n + 1; // increments after this turn
      break;
    }
    case 'par':
    default:
      lossPct = 0;
      break;
  }

  // Cap loss so we never go below 0.
  const nextPct = Math.max(0, Math.round(currentPct - lossPct));

  let lossHP: number | undefined = undefined;
  if (typeof maxHP === 'number' && isFinite(maxHP)) {
    lossHP = Math.max(0, Math.round((lossPct / 100) * maxHP));
  }

  return { nextPct, lossPct: Math.round(lossPct), lossHP, nextStatus };
}

/** If a move applies a new status, construct the initial state. */
export function makeInitialStatus(type: StatusType): StatusState {
  if (type === 'tox') return { type: 'tox', toxicStage: 1 };
  return { type };
}
