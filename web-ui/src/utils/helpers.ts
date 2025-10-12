import type { Dictionaries } from '../logic/parsers';

/** Lowercase, remove accents, strip non-alphanum */
export function aliasKey(s: string) {
  return (s || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Try to map a user-typed name to canonical species from dicts */
export function resolveCanonicalName(name: string, dicts: Dictionaries): string | null {
  const ak = aliasKey(name);
  const all = [...dicts.mySpecies, ...dicts.enemySpecies];
  for (const n of all) if (aliasKey(n) === ak) return n;
  return null;
}
