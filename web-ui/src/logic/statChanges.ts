// src/logic/statChanges.ts

export type StatType = 'atk' | 'def' | 'spatk' | 'spdef' | 'spd';

export type StatChange = {
  stat: StatType;
  stages: number; // positive = boost, negative = lower
  target: 'self' | 'opponent';
};

export type StatChangingMove = {
  name: string;
  changes: StatChange[];
};

// Database of stat-changing moves
const STAT_CHANGING_MOVES: StatChangingMove[] = [
  // Attack lowering moves
  { name: 'growl', changes: [{ stat: 'atk', stages: -1, target: 'opponent' }] },
  { name: 'charm', changes: [{ stat: 'atk', stages: -2, target: 'opponent' }] },
  { name: 'baby-doll eyes', changes: [{ stat: 'atk', stages: -1, target: 'opponent' }] },
  
  // Defense lowering moves
  { name: 'leer', changes: [{ stat: 'def', stages: -1, target: 'opponent' }] },
  { name: 'tail whip', changes: [{ stat: 'def', stages: -1, target: 'opponent' }] },
  { name: 'screech', changes: [{ stat: 'def', stages: -2, target: 'opponent' }] },
  
  // Special Attack lowering moves
  { name: 'confide', changes: [{ stat: 'spatk', stages: -1, target: 'opponent' }] },
  { name: 'eerie impulse', changes: [{ stat: 'spatk', stages: -2, target: 'opponent' }] },
  
  // Special Defense lowering moves
  { name: 'fake tears', changes: [{ stat: 'spdef', stages: -2, target: 'opponent' }] },
  { name: 'metal sound', changes: [{ stat: 'spdef', stages: -2, target: 'opponent' }] },
  
  // Speed lowering moves
  { name: 'string shot', changes: [{ stat: 'spd', stages: -1, target: 'opponent' }] },
  { name: 'scary face', changes: [{ stat: 'spd', stages: -2, target: 'opponent' }] },
  { name: 'cotton spore', changes: [{ stat: 'spd', stages: -2, target: 'opponent' }] },
  
  // Attack boosting moves
  { name: 'swords dance', changes: [{ stat: 'atk', stages: 2, target: 'self' }] },
  { name: 'howl', changes: [{ stat: 'atk', stages: 1, target: 'self' }] },
  { name: 'sharpen', changes: [{ stat: 'atk', stages: 1, target: 'self' }] },
  
  // Defense boosting moves
  { name: 'harden', changes: [{ stat: 'def', stages: 1, target: 'self' }] },
  { name: 'withdraw', changes: [{ stat: 'def', stages: 1, target: 'self' }] },
  { name: 'defense curl', changes: [{ stat: 'def', stages: 1, target: 'self' }] },
  { name: 'iron defense', changes: [{ stat: 'def', stages: 2, target: 'self' }] },
  
  // Special Attack boosting moves
  { name: 'nasty plot', changes: [{ stat: 'spatk', stages: 2, target: 'self' }] },
  { name: 'calm mind', changes: [{ stat: 'spatk', stages: 1, target: 'self' }, { stat: 'spdef', stages: 1, target: 'self' }] },
  
  // Special Defense boosting moves
  { name: 'amnesia', changes: [{ stat: 'spdef', stages: 2, target: 'self' }] },
  
  // Speed boosting moves
  { name: 'agility', changes: [{ stat: 'spd', stages: 2, target: 'self' }] },
  { name: 'rock polish', changes: [{ stat: 'spd', stages: 2, target: 'self' }] },
  
  // Multi-stat moves
  { name: 'bulk up', changes: [{ stat: 'atk', stages: 1, target: 'self' }, { stat: 'def', stages: 1, target: 'self' }] },
  { name: 'dragon dance', changes: [{ stat: 'atk', stages: 1, target: 'self' }, { stat: 'spd', stages: 1, target: 'self' }] },
  { name: 'coil', changes: [{ stat: 'atk', stages: 1, target: 'self' }, { stat: 'def', stages: 1, target: 'self' }] },
];

/**
 * Check if a move causes stat changes
 */
export function getStatChanges(moveName: string): StatChangingMove | null {
  const normalized = moveName.toLowerCase().trim();
  const move = STAT_CHANGING_MOVES.find(m => m.name === normalized);
  return move ?? null;
}

/**
 * Format a stat change for display
 */
export function formatStatChangeMessage(
  targetName: string,
  changes: StatChange[]
): string {
  if (changes.length === 0) return '';
  
  if (changes.length === 1) {
    const change = changes[0];
    const statName = formatStatName(change.stat);
    const direction = change.stages > 0 ? 'rose' : 'fell';
    const amount = Math.abs(change.stages) > 1 ? ' sharply' : '';
    return `${targetName}'s ${statName}${amount} ${direction}!`;
  }
  
  // Multiple stat changes
  const parts = changes.map(change => {
    const statName = formatStatName(change.stat);
    const direction = change.stages > 0 ? '+' : '';
    return `${statName} ${direction}${change.stages}`;
  });
  
  return `${targetName}: ${parts.join(', ')}`;
}

function formatStatName(stat: StatType): string {
  switch (stat) {
    case 'atk': return 'Attack';
    case 'def': return 'Defense';
    case 'spatk': return 'Sp. Atk';
    case 'spdef': return 'Sp. Def';
    case 'spd': return 'Speed';
  }
}

