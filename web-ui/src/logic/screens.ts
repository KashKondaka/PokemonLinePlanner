// Screen system for Pokemon battles (Light Screen, Reflect, Aurora Veil, Tailwind)

export type ScreenType = 'light-screen' | 'reflect' | 'aurora-veil' | 'tailwind';

export type ScreenState = {
  type: ScreenType;
  userTeam: 'my' | 'enemy'; // Which team set up the screen
  turnsRemaining: number; // Turns remaining (decrements each turn)
  startedOnTurn: number;
};

// Moves that set up screens
export const SCREEN_MOVES: Record<string, ScreenType> = {
  'light screen': 'light-screen',
  'lightscreen': 'light-screen',
  'reflect': 'reflect',
  'aurora veil': 'aurora-veil',
  'auroraveil': 'aurora-veil',
  'tailwind': 'tailwind',
};

// Screen duration (5 turns)
export const SCREEN_DURATION = 5;

// Check if a move sets up a screen
export function getScreenFromMove(moveName: string): ScreenType | null {
  const normalized = moveName.toLowerCase().trim();
  return SCREEN_MOVES[normalized] ?? null;
}

// Get screen symbol for UI
export function getScreenSymbol(screen: ScreenType): string {
  switch (screen) {
    case 'light-screen': return '🛡️';
    case 'reflect': return '🪞';
    case 'aurora-veil': return '❄️🛡️';
    case 'tailwind': return '💨';
    default: return '';
  }
}

// Get screen name for display
export function getScreenName(screen: ScreenType): string {
  switch (screen) {
    case 'light-screen': return 'Light Screen';
    case 'reflect': return 'Reflect';
    case 'aurora-veil': return 'Aurora Veil';
    case 'tailwind': return 'Tailwind';
    default: return 'Unknown';
  }
}

// Get screen description for hover tooltip
export function getScreenDescription(screen: ScreenState): string {
  const name = getScreenName(screen.type);
  const team = screen.userTeam === 'my' ? 'Your team' : 'Enemy team';
  
  switch (screen.type) {
    case 'light-screen':
      return `${name} (${team}): Reduces special attack damage to opposing team by 50%`;
    case 'reflect':
      return `${name} (${team}): Reduces physical attack damage to opposing team by 50%`;
    case 'aurora-veil':
      return `${name} (${team}): Reduces both physical and special damage to opposing team by 50%`;
    case 'tailwind':
      return `${name} (${team}): Doubles Speed for ${team.toLowerCase()}`;
    default:
      return name;
  }
}

// Advance screen (decrease turns remaining)
export function advanceScreen(screen: ScreenState | null): ScreenState | null {
  if (!screen) return null;
  
  const newTurns = screen.turnsRemaining - 1;
  if (newTurns <= 0) return null; // Screen expired
  
  return {
    ...screen,
    turnsRemaining: newTurns,
  };
}

// Check if screen affects a specific attack
export function doesScreenAffectAttack(
  screen: ScreenState,
  attackerTeam: 'my' | 'enemy',
  isPhysical: boolean
): boolean {
  // Screen only affects attacks from the opposing team
  if (screen.userTeam === attackerTeam) return false;
  
  switch (screen.type) {
    case 'light-screen':
      return !isPhysical; // Affects special attacks
    case 'reflect':
      return isPhysical; // Affects physical attacks
    case 'aurora-veil':
      return true; // Affects both
    case 'tailwind':
      return false; // Doesn't affect damage
    default:
      return false;
  }
}

// Get damage modifier from screen (0.5 = 50% damage reduction)
export function getScreenDamageModifier(screen: ScreenState, isPhysical: boolean): number {
  switch (screen.type) {
    case 'light-screen':
      return isPhysical ? 1.0 : 0.5;
    case 'reflect':
      return isPhysical ? 0.5 : 1.0;
    case 'aurora-veil':
      return 0.5;
    case 'tailwind':
      return 1.0; // No damage modifier
    default:
      return 1.0;
  }
}

