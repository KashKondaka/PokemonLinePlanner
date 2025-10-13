// src/logic/helpers.ts
import type { Dictionaries } from './parsers';

/** Strong alias key normalizer used across app & parsers */
export function aliasKey(s: string) {
  return (s || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Resolve a possibly-aliased name to the canonical species name, if known */
export function resolveCanonicalName(name: string, dicts: Dictionaries): string | null {
  const ak = aliasKey(name);
  const all = [...dicts.mySpecies, ...dicts.enemySpecies];
  for (const n of all) if (aliasKey(n) === ak) return n;
  return null;
}

/** Keep enemy lines as-is but normalize minimal spacing for backend */
export function normalizeEnemyTrainerTextForBackend(raw: string) {
  const lines = raw
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

/** Unique, sorted list of integer HP damage values that always includes 0 */
export function uniqSortedWithZero(arr: number[]) {
  const set = new Set<number>([0, ...arr.map(n => Math.max(0, Math.round(n)))]);
  return Array.from(set).sort((a, b) => a - b);
}
