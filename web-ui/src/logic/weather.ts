// Weather system for Pokemon battles

export type WeatherType = 'sun' | 'rain' | 'hail' | 'sandstorm';

export type WeatherState = {
  type: WeatherType;
  turnsRemaining: number; // -1 for infinite (Run and Bun)
  startedOnTurn: number;
};

// Abilities that set weather on entry
export const WEATHER_ABILITIES: Record<string, WeatherType> = {
  'drizzle': 'rain',
  'drought': 'sun',
  'snow warning': 'hail',
  'sand stream': 'sandstorm',
};

// Sand Spit is special - triggers when taking damage
export const SAND_SPIT_ABILITY = 'sand spit';

// Moves that set weather
export const WEATHER_MOVES: Record<string, WeatherType> = {
  'sunny day': 'sun',
  'rain dance': 'rain',
  'hail': 'hail',
  'sandstorm': 'sandstorm',
};

// Get weather duration based on Run and Bun setting
export function getWeatherDuration(runAndBun: boolean): number {
  return runAndBun ? -1 : 5; // -1 = infinite, 5 turns otherwise (modern gen)
}

// Check if a move sets weather
export function getWeatherFromMove(moveName: string): WeatherType | null {
  const normalized = moveName.toLowerCase().trim();
  return WEATHER_MOVES[normalized] ?? null;
}

// Check if an ability sets weather
export function getWeatherFromAbility(abilityName: string): WeatherType | null {
  const normalized = abilityName.toLowerCase().trim();
  return WEATHER_ABILITIES[normalized] ?? null;
}

// Check if an ability is Sand Spit
export function isSandSpitAbility(abilityName: string): boolean {
  return abilityName.toLowerCase().trim() === SAND_SPIT_ABILITY;
}

// Types immune to weather damage
export function isImmuneToWeatherDamage(weather: WeatherType, pokemonTypes: string[]): boolean {
  if (!weather) return true;
  
  const types = pokemonTypes.map(t => t.toLowerCase());
  
  if (weather === 'hail') {
    return types.includes('ice');
  }
  
  if (weather === 'sandstorm') {
    return types.includes('rock') || types.includes('steel') || types.includes('ground');
  }
  
  return true; // Sun and rain don't deal damage
}

// Calculate weather damage (as percentage of max HP)
export function getWeatherDamage(weather: WeatherType): number {
  if (weather === 'hail' || weather === 'sandstorm') {
    return 100 / 16; // 6.25% of max HP
  }
  return 0;
}

// Get weather symbol for UI
export function getWeatherSymbol(weather: WeatherType): string {
  switch (weather) {
    case 'sun': return '☀️';
    case 'rain': return '🌧️';
    case 'hail': return '❄️';
    case 'sandstorm': return '🌪️';
    default: return '';
  }
}

// Get weather name for display
export function getWeatherName(weather: WeatherType): string {
  switch (weather) {
    case 'sun': return 'Sunny';
    case 'rain': return 'Rain';
    case 'hail': return 'Hail';
    case 'sandstorm': return 'Sandstorm';
    default: return 'None';
  }
}

// Advance weather (decrease turns remaining)
export function advanceWeather(weather: WeatherState | null): WeatherState | null {
  if (!weather || weather.turnsRemaining === -1) return weather;
  
  const newTurns = weather.turnsRemaining - 1;
  if (newTurns <= 0) return null; // Weather ended
  
  return {
    ...weather,
    turnsRemaining: newTurns,
  };
}

