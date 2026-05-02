import type { Dictionaries } from './parsers';

/** Canonicalize name by alias. */
export function aliasKey(s: string) {
  return (s || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function resolveCanonicalName(name: string, dicts: Dictionaries): string | null {
  const ak = aliasKey(name);
  const all = [...dicts.mySpecies, ...dicts.enemySpecies];
  for (const n of all) if (aliasKey(n) === ak) return n;
  return null;
}

/** Keep enemy lines minimal/normalized for backend parser. */
export function normalizeEnemyTrainerTextForBackend(raw: string) {
  const lines = (raw || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  const fixed = lines.map(line =>
    line
      .replace(/@(?=\S)/g, '@ ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  );

  return fixed.slice(0, 6).join('\n');
}

/** Unique, ascending numbers; ensure a single leading 0. */
export function uniqSortedWithZero(arr: number[]) {
  const uniq = Array.from(new Set(arr.map(n => Math.max(0, Math.round(n))))).sort((a, b) => a - b);
  if (uniq[0] !== 0) uniq.unshift(0);
  return uniq;
}

/** Convert a species display name to a Showdown sprite URL. */
export function getPokemonSpriteUrl(name: string): string {
  const id = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['']/g, '')
    .replace(/[^a-z0-9-]/g, '')
    .trim();
  return `https://play.pokemonshowdown.com/sprites/gen5/${id}.png`;
}

/**
 * Ask the backend for a Pokémon's max HP by doing a harmless self-calc.
 * Returns undefined on failure (UI can fall back to %-only display).
 */
export async function fetchMaxHPFromAPI(
  species: string,
  myText: string,
  enemyText: string,
  gen: number
): Promise<number | undefined> {
  try {
    const enemyTextForBackend = normalizeEnemyTrainerTextForBackend(enemyText);
    const resp = await fetch('/api/calc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        myText,
        enemyText: enemyTextForBackend,
        attacker: species,
        defender: species,
        move: 'Tackle',
        gen,
      }),
    });
    if (!resp.ok) return undefined;
    const data = await resp.json();
    const hp: number | undefined =
      typeof data?.defenderMaxHP === 'number'
        ? data.defenderMaxHP
        : (data?.debug?.defender?.maxHP as number | undefined);
    return typeof hp === 'number' && hp > 0 ? hp : undefined;
  } catch {
    return undefined;
  }
}
