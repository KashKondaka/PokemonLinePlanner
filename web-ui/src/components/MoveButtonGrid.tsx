import React from 'react';

type Props = {
  moves: string[];
  selectedMove?: string;
  onSelectMove: (move: string) => void;
  aiMoveProbs?: number[];
  disabled?: boolean;
};

function probColor(prob: number): string {
  if (prob >= 0.8) return 'bg-teal-800 border-teal-600';
  if (prob >= 0.5) return 'bg-teal-700/80 border-teal-600/80';
  if (prob >= 0.25) return 'bg-teal-600/50 border-teal-500/50';
  if (prob >= 0.1) return 'bg-teal-500/30 border-teal-400/30';
  return 'bg-teal-400/15 border-teal-400/20';
}

export default function MoveButtonGrid({ moves, selectedMove, onSelectMove, aiMoveProbs, disabled }: Props) {
  if (moves.length === 0) {
    return (
      <div className="grid grid-cols-2 gap-1 w-[160px]">
        {[0,1,2,3].map(i => (
          <div key={i} className="h-8 rounded-lg border border-neutral-800 bg-neutral-900/30" />
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
          return <div key={i} className="h-8 rounded-lg border border-neutral-800 bg-neutral-900/30" />;
        }

        const isSelected = move === selectedMove;
        const hasProb = aiMoveProbs && aiMoveProbs[i] !== undefined;
        const prob = hasProb ? aiMoveProbs![i] : 0;
        const probBg = hasProb ? probColor(prob) : '';

        return (
          <button
            key={i}
            onClick={() => !disabled && onSelectMove(move)}
            disabled={disabled}
            className={`h-8 rounded-lg text-[10px] font-medium px-1 truncate transition border relative
              ${isSelected
                ? 'bg-blue-600 border-blue-500 text-white ring-1 ring-blue-400'
                : hasProb
                  ? `${probBg} text-neutral-200 hover:brightness-110`
                  : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
            title={move + (hasProb ? ` (${(prob * 100).toFixed(1)}%)` : '')}
          >
            <span className="truncate">{move}</span>
            {hasProb && !isSelected && (
              <span className="absolute top-0 right-0.5 text-[8px] text-teal-300 font-bold">
                {(prob * 100).toFixed(0)}%
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
