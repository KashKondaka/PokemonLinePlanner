import React from 'react';
import PokemonIcon from './PokemonIcon';

type Props = {
  name: string;
  pct: number;
  curHP?: number;
  maxHP?: number;
  size?: number;
  className?: string;
};

export default function SpriteWithHP({ name, pct, curHP, maxHP, size = 48, className = '' }: Props) {
  const safePct = Math.max(0, Math.min(100, Math.round(pct)));
  const barColor =
    safePct > 50 ? 'from-emerald-600 to-emerald-700'
    : safePct > 25 ? 'from-yellow-500 to-yellow-600'
    : 'from-red-600 to-red-700';

  const hpText = typeof curHP === 'number' && typeof maxHP === 'number'
    ? `${curHP}/${maxHP}`
    : `${safePct}%`;

  return (
    <div className={`flex flex-col items-center gap-0.5 ${className}`} style={{ width: size + 8 }}>
      <PokemonIcon name={name} size={size} />
      <div className="w-full h-2 rounded bg-neutral-800 overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${barColor} transition-all`}
          style={{ width: `${safePct}%` }}
        />
      </div>
      <div className="text-[9px] text-neutral-400 leading-none">{hpText}</div>
    </div>
  );
}
