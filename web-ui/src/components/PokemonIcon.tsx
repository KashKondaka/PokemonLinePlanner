import React, { useState } from 'react';
import { getPokemonSpriteUrl } from '../logic/helpers';

type Props = {
  name: string;
  size?: number;
  className?: string;
};

export default function PokemonIcon({ name, size = 32, className = '' }: Props) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        className={`inline-flex items-center justify-center text-xs text-neutral-300 ${className}`}
        title={name}
        style={{ width: size, height: size }}
      >
        {name}
      </span>
    );
  }

  return (
    <img
      src={getPokemonSpriteUrl(name)}
      alt={name}
      title={name}
      width={size}
      height={size}
      className={`object-contain ${className}`}
      onError={() => setFailed(true)}
      draggable={false}
    />
  );
}
