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

// --- Mega Stones ---

export const MEGA_STONES: Record<string, string> = {
  Absolite: 'Absol',
  Abomasite: 'Abomasnow',
  Aerodactylite: 'Aerodactyl',
  Aggronite: 'Aggron',
  Alakazite: 'Alakazam',
  Altarianite: 'Altaria',
  Ampharosite: 'Ampharos',
  Audinite: 'Audino',
  Banettite: 'Banette',
  Beedrillite: 'Beedrill',
  Blastoisinite: 'Blastoise',
  Blazikenite: 'Blaziken',
  Cameruptite: 'Camerupt',
  'Charizardite X': 'Charizard',
  'Charizardite Y': 'Charizard',
  Crucibellite: 'Crucibelle',
  Diancite: 'Diancie',
  Galladite: 'Gallade',
  Garchompite: 'Garchomp',
  Gardevoirite: 'Gardevoir',
  Gengarite: 'Gengar',
  Glalitite: 'Glalie',
  Gyaradosite: 'Gyarados',
  Heracronite: 'Heracross',
  Houndoominite: 'Houndoom',
  Kangaskhanite: 'Kangaskhan',
  Latiasite: 'Latias',
  Latiosite: 'Latios',
  Lopunnite: 'Lopunny',
  Lucarionite: 'Lucario',
  Manectite: 'Manectric',
  Mawilite: 'Mawile',
  Medichamite: 'Medicham',
  Metagrossite: 'Metagross',
  'Mewtwonite X': 'Mewtwo',
  'Mewtwonite Y': 'Mewtwo',
  Pidgeotite: 'Pidgeot',
  Pinsirite: 'Pinsir',
  Sablenite: 'Sableye',
  Salamencite: 'Salamence',
  Sceptilite: 'Sceptile',
  Scizorite: 'Scizor',
  Sharpedonite: 'Sharpedo',
  Slowbronite: 'Slowbro',
  Steelixite: 'Steelix',
  Swampertite: 'Swampert',
  Tyranitarite: 'Tyranitar',
  Venusaurite: 'Venusaur',
};

/**
 * If item is a mega stone for the given species, return the mega-form name.
 * Otherwise return the original species.
 */
export function getMegaFormName(species: string, item: string | undefined): string {
  if (!item || !MEGA_STONES[item]) return species;
  if (item.endsWith(' X')) return `${species}-Mega-X`;
  if (item.endsWith(' Y')) return `${species}-Mega-Y`;
  return `${species}-Mega`;
}

// --- Sprite URL ---

const SPRITE_OVERRIDES: Record<string, string> = {
  'oricorio_pom_pom': 'oricorio-pompom',
  'furfrou_heart_trim': 'furfrou-heart',
  'florges_orange_flower': 'florges-orange',
  'floette_eternal_flower': 'floette-eternal',
  'alcremie_caramel_swirl': 'alcremie-caramelswirl',
  'wormadam_trash_cloak': 'wormadam-trash',
  'wormadam_sandy_cloak': 'wormadam-sandy',
  'greninja_battle_bond': 'greninja-ash',
  'urshifu_rapid_strike_style': 'urshifu-rapidstrike',
};

const REGIONAL_SUFFIX: Record<string, string> = {
  galarian: 'galar',
  alolan: 'alola',
  hisuian: 'hisui',
  paldean: 'paldea',
};

const GENDER_SUFFIX: Record<string, string> = {
  female: 'f',
  male: 'm',
};

const BASE_NAME_FINAL_WORDS = new Set([
  'mime', 'rime', 'lele', 'fini', 'koko', 'bulu',
  'null', 'oh', 'jr', 'z', 'o',
]);

function stripToAlnum(s: string): string {
  return s
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Convert a species display name to a Showdown sprite URL. */
export function getPokemonSpriteUrl(name: string): string {
  const lower = name.toLowerCase();
  const overrideKey = lower.replace(/\s+/g, '_');
  if (SPRITE_OVERRIDES[overrideKey]) {
    return `https://play.pokemonshowdown.com/sprites/gen5/${SPRITE_OVERRIDES[overrideKey]}.png`;
  }

  const parts = name.split('_');
  if (parts.length > 1) {
    const lastPart = parts[parts.length - 1].toLowerCase();
    if (!BASE_NAME_FINAL_WORDS.has(lastPart)) {
      const baseParts = parts.slice(0, -1);
      const baseId = stripToAlnum(baseParts.join(''));
      const formSuffix =
        REGIONAL_SUFFIX[lastPart] ??
        GENDER_SUFFIX[lastPart] ??
        lastPart;
      return `https://play.pokemonshowdown.com/sprites/gen5/${baseId}-${formSuffix}.png`;
    }
  }

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
 * Ask the backend for a Pokémon's max HP and speed via a harmless self-calc.
 */
export async function fetchPokemonStatsFromAPI(
  species: string,
  myText: string,
  enemyText: string,
  gen: number
): Promise<{ maxHP?: number; speed?: number }> {
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
    if (!resp.ok) return {};
    const data = await resp.json();
    const hp: number | undefined =
      typeof data?.defenderMaxHP === 'number'
        ? data.defenderMaxHP
        : (data?.debug?.defender?.maxHP as number | undefined);
    const speed: number | undefined = data?.debug?.defender?.speed as number | undefined;
    return {
      maxHP: typeof hp === 'number' && hp > 0 ? hp : undefined,
      speed: typeof speed === 'number' && speed > 0 ? speed : undefined,
    };
  } catch {
    return {};
  }
}

/** Convenience wrapper for code that only needs maxHP. */
export async function fetchMaxHPFromAPI(
  species: string,
  myText: string,
  enemyText: string,
  gen: number
): Promise<number | undefined> {
  const stats = await fetchPokemonStatsFromAPI(species, myText, enemyText, gen);
  return stats.maxHP;
}
