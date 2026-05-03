import React from 'react';

type Props = {
  moves: string[];
  selectedMove?: string;
  onSelectMove: (move: string | undefined) => void;
  aiMoveProbs?: number[];
  moveDamageRanges?: Record<string, { minPct: number; maxPct: number } | null>;
  disabled?: boolean;
};

function probColor(prob: number): string {
  if (prob >= 0.8) return 'bg-teal-800 border-teal-600';
  if (prob >= 0.5) return 'bg-teal-700/80 border-teal-600/80';
  if (prob >= 0.25) return 'bg-teal-600/50 border-teal-500/50';
  if (prob >= 0.1) return 'bg-teal-500/30 border-teal-400/30';
  return 'bg-teal-400/15 border-teal-400/20';
}

export default function MoveButtonGrid({ moves, selectedMove, onSelectMove, aiMoveProbs, moveDamageRanges, disabled }: Props) {
  const hasDmg = moveDamageRanges && Object.keys(moveDamageRanges).length > 0;
  const cellH = hasDmg ? 'h-10' : 'h-8';

  if (moves.length === 0) {
    return (
      <div className="grid grid-cols-2 gap-1 w-[160px]">
        {[0,1,2,3].map(i => (
          <div key={i} className={`${cellH} rounded-lg border border-neutral-800 bg-neutral-900/30`} />
        ))}
      </div>
    );
  }

  const slots = [...moves];
  while (slots.length < 4) slots.push('');

  return (
    <div className="grid grid-cols-2 gap-1 w-[160px]">
      {slots.slice(0, 4).map((move, i) => {
        if (!move) {
          return <div key={i} className={`${cellH} rounded-lg border border-neutral-800 bg-neutral-900/30`} />;
        }

        const isSelected = move === selectedMove;
        const hasProb = aiMoveProbs && aiMoveProbs[i] !== undefined;
        const prob = hasProb ? aiMoveProbs![i] : 0;
        const probBg = hasProb ? probColor(prob) : '';
        const dmg = moveDamageRanges?.[move];
        const dmgLabel = dmg ? (dmg.minPct === dmg.maxPct ? `${dmg.minPct}%` : `${dmg.minPct}-${dmg.maxPct}%`) : null;

        return (
          <button
            key={i}
            onClick={() => !disabled && onSelectMove(isSelected ? undefined : move)}
            disabled={disabled}
            className={`${cellH} rounded-lg text-[10px] font-medium px-1 transition border relative flex flex-col items-center justify-center
              ${isSelected
                ? 'bg-blue-600 border-blue-500 text-white ring-1 ring-blue-400'
                : hasProb
                  ? `${probBg} text-neutral-200 hover:brightness-110`
                  : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
            title={move + (hasProb ? ` (${(prob * 100).toFixed(1)}%)` : '') + (dmgLabel ? ` — dmg ${dmgLabel}` : '')}
          >
            <span className="truncate max-w-full leading-tight">{move}</span>
            {dmgLabel && (
              <span className={`text-[8px] leading-none ${isSelected ? 'text-blue-200' : 'text-amber-400'}`}>
                {dmgLabel}
              </span>
            )}
            {hasProb && (
              <span className={`absolute top-0 right-0.5 text-[8px] font-bold ${isSelected ? 'text-blue-200' : 'text-teal-300'}`}>
                {(prob * 100).toFixed(0)}%
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
