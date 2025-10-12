import { SimpleSet } from './types';

// Map IV labels to keys
const IV_KEY_MAP: Record<string, keyof NonNullable<SimpleSet['ivs']>> = {
  'HP': 'hp', 'Atk': 'atk', 'Def': 'def', 'SpA': 'spa', 'SpD': 'spd', 'Spe': 'spe'
};

export function parseShowdownBlock(block: string): SimpleSet {
  const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) throw new Error('Empty Showdown block');

  const header = lines.shift()!;
  const m = header.match(/^(.+?)(?:\s*@\s*(.+))?$/);
  if (!m) throw new Error(`Invalid set header: ${header}`);
  const species = m[1].trim();
  const item = m[2]?.trim();

  const set: SimpleSet = { species, item, level: 50, moves: [], evs: {}, ivs: {} };

  for (const line of lines) {
    if (/^Ability:/i.test(line)) set.ability = line.split(':')[1].trim();
    else if (/^Level:/i.test(line)) set.level = parseInt(line.split(':')[1].trim(), 10);
    else if (/Nature$/i.test(line)) set.nature = line.replace(/Nature/i, '').trim();
    else if (/^IVs:/i.test(line)) {
      const parts = line.split(':')[1].split('/').map(s => s.trim());
      for (const p of parts) {
        const n = p.match(/^(\d+)\s+(HP|Atk|Def|SpA|SpD|Spe)$/i);
        if (n) {
          const val = parseInt(n[1], 10);
          const key = IV_KEY_MAP[n[2]];
          if (key) (set.ivs as any)[key] = val;
        }
      }
    } else if (/^-\s+/i.test(line)) {
      set.moves.push(line.replace(/^-\s+/, '').trim());
    } else if (line === '.') {
      // sentinel; ignore (handled by multi-parser)
    }
  }

  // defaults
  set.ivs = { hp:31, atk:31, def:31, spa:31, spd:31, spe:31, ...set.ivs };
  set.evs = { hp:0, atk:0, def:0, spa:0, spd:0, spe:0, ...set.evs };
  return set;
}

/**
 * Parse a whole myteam.txt that may contain multiple Showdown blocks.
 * You can either:
 * - End each block with a single '.' line, OR
 * - Separate blocks by 1+ blank lines.
 */
export function parseShowdownTeamsFile(text: string): SimpleSet[] {
  // First, split by lines with only a dot
  const byDot = text.split(/^\s*\.\s*$/m).map(s => s.trim()).filter(Boolean);
  const candidates = byDot.length > 1 ? byDot : text.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
  return candidates.map(parseShowdownBlock);
}

/**
 * Parse enemytrainer.txt where each line is:
 *   Species Lv.N @ Item: Move1, Move2, Move3, Move4 [Nature|Ability]
 * You can have multiple lines (one per enemy Pokémon).
 */
export function parseEnemyCompactLines(text: string): SimpleSet[] {
  const sets: SimpleSet[] = [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    const s = parseEnemyCompact(line);
    sets.push(s);
  }
  return sets;
}

export function parseEnemyCompact(line: string): SimpleSet {
  const m = line.match(/^(.+?)\s+Lv\.(\d+)\s+@\s+([^:]+):\s+(.+?)(?:\s+\[(.+?)\])?$/i);
  if (!m) throw new Error(`Invalid enemy compact syntax:\n${line}`);
  const species = m[1].trim();
  const level = parseInt(m[2], 10);
  const item = m[3].trim();
  const moves = m[4].split(',').map(s => s.trim());
  const bracket = m[5]?.trim();
  let nature: string | undefined;
  let ability: string | undefined;
  if (bracket) {
    const [n, a] = bracket.split('|').map(s => s.trim());
    nature = n || undefined;
    ability = a || undefined;
  }
  return {
    species, level, item, nature, ability, moves,
    ivs: { hp:31, atk:31, def:31, spa:31, spd:31, spe:31 },
    evs: { hp:0, atk:0, def:0, spa:0, spd:0, spe:0 }
  };
}
