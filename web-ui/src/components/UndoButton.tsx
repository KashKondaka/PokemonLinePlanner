import React from 'react';

type Props = {
  onClick: () => void;
  disabled?: boolean;
};

export default function UndoButton({ onClick, disabled }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        'h-[44px] rounded-lg px-3 text-sm font-semibold border shadow transition',
        disabled
          ? 'bg-neutral-800 border-neutral-800 text-neutral-500 cursor-not-allowed'
          : 'bg-neutral-700 hover:bg-neutral-600 border-neutral-600 text-neutral-100'
      ].join(' ')}
      title="Undo applied roll"
      aria-label="Undo"
    >
      {/* Reverse arrow symbol only */}
      ↩
    </button>
  );
}
