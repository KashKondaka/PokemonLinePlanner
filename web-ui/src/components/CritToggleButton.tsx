import React from 'react';

type Props = {
  active: boolean;       // true = dark red (clicked), false = red-orange (unclicked)
  onToggle: () => void;
};

export default function CritToggleButton({ active, onToggle }: Props) {
  return (
    <button
      onClick={onToggle}
      className={[
        'h-[44px] rounded-lg px-3 text-sm font-semibold border transition',
        active
          ? 'bg-red-800 hover:bg-red-700 border-red-900 text-red-50'
          : 'bg-orange-700 hover:bg-orange-600 border-orange-800 text-orange-50'
      ].join(' ')}
      title="Toggle crit rolls"
    >
      Crit
    </button>
  );
}
