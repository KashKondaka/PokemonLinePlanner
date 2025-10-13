// src/logic/status.ts
export type StatusType = 'burn' | 'psn' | 'tox' | 'par' | 'frz';

export type StatusState = {
  type: StatusType;
  toxicStage?: number;
};

/** Deterministic move→status mapper (kept simple) */
export function inferStatusFromMove(moveName: string): StatusType | null {
  const m = moveName.trim().toLowerCase();
  if (m === 'will o wisp' || m === 'will-o-wisp' || m === 'will-o’-wisp') return 'burn';
  if (m === 'thunder wave' || m === 'nuzzle') return 'par';
  if (m === 'toxic') return 'tox';
  if (m === 'poison gas' || m === 'poison powder' || m === 'poisonpowder') return 'psn';
  return null;
}

export function statusLabel(s: StatusState | undefined) {
  if (!s) return '';
  if (s.type === 'burn') return 'BRN';
  if (s.type === 'par')  return 'PAR';
  if (s.type === 'psn')  return 'PSN';
  if (s.type === 'tox')  return `TOX${s.toxicStage ? `(${s.toxicStage})` : ''}`;
  if (s.type === 'frz')  return 'FRZ';
  return '';
}

/** End-of-turn residual on current HP% given a status. */
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
    case 'frz':
    default:
      lossPct = 0; // no EoT damage
      break;
  }

  const nextPct = Math.max(0, Math.round(currentPct - lossPct));

  let lossHP: number | undefined = undefined;
  if (typeof maxHP === 'number' && isFinite(maxHP)) {
    lossHP = Math.max(0, Math.round((lossPct / 100) * maxHP));
  }

  return { nextPct, lossPct: Math.round(lossPct), lossHP, nextStatus };
}

/** Initial state for a newly-applied status */
export function makeInitialStatus(type: StatusType): StatusState {
  if (type === 'tox') return { type: 'tox', toxicStage: 1 };
  return { type };
}
