import React from 'react';

type Props = {
  label: string;           // "Normal Rolls" | "Crit Rolls"
  options: number[];       // HP damage values (unique, sorted, includes 0)
  selectedIndex: number;
  onChange: (index: number) => void;
};

export default function RollSlider({ label, options, selectedIndex, onChange }: Props) {
  const safeOptions = options?.length ? options : [0];
  const idx = Math.max(0, Math.min(selectedIndex ?? 0, safeOptions.length - 1));
  const selectedValue = safeOptions[idx] ?? 0;
  const maxIdx = Math.max(0, safeOptions.length - 1);

  return (
    <div
      className="rounded-lg border border-neutral-700 bg-gradient-to-b from-neutral-800/70 to-neutral-900/60 px-3 py-2 shadow-inner"
      title="Select a damage roll (HP)"
    >
      <div className="flex items-center justify-between text-[11px] text-neutral-300 mb-1">
        <span>{label}</span>
        <span className="font-semibold">{selectedValue} HP</span>
      </div>

      <input
        type="range"
        min={0}
        max={maxIdx}
        step={1}
        value={idx}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full accent-emerald-500"
      />

      {/* Number line with ticks & labels */}
      <div className="relative mt-2 h-8">
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-neutral-700" />
        {safeOptions.map((v, i) => {
          const pos = maxIdx > 0 ? (i / maxIdx) * 100 : 0;
          const isSel = i === idx;
          return (
            <div key={`${v}-${i}`} className="absolute -translate-x-1/2" style={{ left: `${pos}%` }}>
              <div className={`w-px ${isSel ? 'h-3 bg-emerald-400' : 'h-2 bg-neutral-500'}`} />
              <div className={`text-[10px] mt-1 ${isSel ? 'text-emerald-300 font-semibold' : 'text-neutral-400'}`}>
                {v}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
