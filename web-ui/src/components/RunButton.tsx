import React from 'react';

type Props = {
  onClick: () => void;
  disabled?: boolean;
};

export default function RunButton({ onClick, disabled }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        'h-[44px] rounded-lg px-4 text-sm font-semibold border shadow transition',
        disabled
          ? 'bg-neutral-700 border-neutral-700 text-neutral-300 cursor-not-allowed'
          : 'bg-emerald-600 hover:bg-emerald-500 border-emerald-700 text-emerald-50'
      ].join(' ')}
      title="Apply selected roll"
      aria-label="Run"
    >
      {/* Play symbol only */}
      ▶
    </button>
  );
}
