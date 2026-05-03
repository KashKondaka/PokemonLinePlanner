// src/logic/parsers.ts
export type Dictionaries = {
    mySpecies: string[];
    enemySpecies: string[];
    movesBySpecies: Record<string, string[]>;
    movesByAlias: Record<string, string[]>;
    myItemBySpecies: Record<string, string | undefined>;
    enemyItemBySpecies: Record<string, string | undefined>;
    myAbilityBySpecies: Record<string, string | undefined>;
    enemyAbilityBySpecies: Record<string, string | undefined>;
  };
  
  export function uniqueSorted<T>(arr: T[]) {
    return Array.from(new Set(arr)).sort((a: any, b: any) =>
      String(a).localeCompare(String(b), undefined, { sensitivity: 'base' })
    );
  }
  
  function clean(s: string | undefined) {
    return (s ?? '').replace(/\s+/g, ' ').trim();
  }
  
  // Strong alias: SAME as grammar.ts
  export function aliasKey(s: string) {
    return s
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }
  
  /** ===== MYTEAM (block-based) ===== */
  function parseMyTeam(text: string) {
    const species: string[] = [];
    const movesBySpecies: Record<string, string[]> = {};
    const itemBySpecies: Record<string, string | undefined> = {};
    const abilityBySpecies: Record<string, string | undefined> = {};
  
    const blocks = text.replace(/\r\n/g, '\n').split(/\n{2,}/);
  
    for (const rawBlock of blocks) {
      const lines = rawBlock
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);
      if (!lines.length) continue;
  
      const header = lines[0];
      const m = header.match(/^(.+?)(?:\s*@\s*(.+))?$/);
      if (!m) continue;
  
      const speciesName = clean(m[1]);
      if (!speciesName) continue;
  
      const item = clean(m[2] || '');
      species.push(speciesName);
      if (item) itemBySpecies[speciesName] = item;
  
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
  
        if (/^Ability:/i.test(line)) {
          const ability = clean(line.split(':')[1]);
          if (ability) abilityBySpecies[speciesName] = ability;
          continue;
        }
        if (/^(Level:|IVs:|EVs:)/i.test(line)) continue;
        if (/^[A-Za-z]+ Nature$/i.test(line)) continue;
  
        if (line.startsWith('- ')) {
          const mv = clean(line.slice(2));
          if (mv) (movesBySpecies[speciesName] ||= []).push(mv);
        }
      }
    }
  
    for (const k of Object.keys(movesBySpecies)) {
      movesBySpecies[k] = uniqueSorted(movesBySpecies[k]);
    }
  
    return { species: uniqueSorted(species), movesBySpecies, itemBySpecies, abilityBySpecies };
  }
  
  /** ===== ENEMYTRAINER (line-based) ===== */
function parseEnemyTrainer(text: string) {
    const species: string[] = [];
    const movesBySpecies: Record<string, string[]> = {};
    const itemBySpecies: Record<string, string | undefined> = {};
    const abilityBySpecies: Record<string, string | undefined> = {};
  
    for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
      let line = clean(raw);
      if (!line) continue;
  
      // Extract ability from trailing [ ... ] (Nature|Ability)
      const bracketIdx = line.indexOf('[');
      let ability: string | undefined;
      if (bracketIdx !== -1) {
        const bracket = line.slice(bracketIdx + 1, line.lastIndexOf(']') || line.length);
        const parts = bracket.split('|').map(clean);
        if (parts.length >= 2) {
          ability = parts[1]; // Second part is ability
        }
        line = clean(line.slice(0, bracketIdx));
      }
  
      const lower = line.toLowerCase();
      const cutpoints = [lower.indexOf(' lv.'), line.indexOf('@'), line.indexOf(':')].filter(i => i !== -1);
      const firstCut = cutpoints.length ? Math.min(...cutpoints) : -1;
  
      let speciesName = clean(firstCut === -1 ? line : line.slice(0, firstCut)).replace(/,\s*$/, '');
      if (!speciesName) continue;
      species.push(speciesName);
      
      if (ability) abilityBySpecies[speciesName] = ability;
  
      // item
      const atIdx = line.indexOf('@');
      if (atIdx !== -1) {
        const after = line.slice(atIdx + 1);
        const stop = after.indexOf(':');
        const item = clean(stop === -1 ? after : after.slice(0, stop));
        if (item) itemBySpecies[speciesName] = item;
      }
  
      // moves
      const colonIdx = line.indexOf(':');
      if (colonIdx !== -1) {
        const movesPart = clean(line.slice(colonIdx + 1));
        if (movesPart) {
          const arr = movesPart.split(',').map(s => clean(s)).filter(Boolean);
          if (arr.length) movesBySpecies[speciesName] = uniqueSorted(arr);
        }
      }
    }
  
    return { species: uniqueSorted(species), movesBySpecies, itemBySpecies, abilityBySpecies };
  }
  
  export function buildDictionaries(myText: string, enemyText: string): Dictionaries {
    const my = parseMyTeam(myText);
    const en = parseEnemyTrainer(enemyText);
  
    const movesBySpecies: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(my.movesBySpecies)) movesBySpecies[k] = v;
    for (const [k, v] of Object.entries(en.movesBySpecies)) movesBySpecies[k] = v;
  
    const movesByAlias: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(movesBySpecies)) {
      movesByAlias[aliasKey(k)] = v;
    }
  
    return {
      mySpecies: my.species,
      enemySpecies: en.species,
      movesBySpecies,
      movesByAlias,
      myItemBySpecies: my.itemBySpecies,
      enemyItemBySpecies: en.itemBySpecies,
      myAbilityBySpecies: my.abilityBySpecies,
      enemyAbilityBySpecies: en.abilityBySpecies,
    };
  }

  export type EnrichedPokemon = {
    species: string;
    level: number;
    nature?: string;
    ability?: string;
    item?: string;
    moves: string[];
    moveDetails: { name: string; bp: number; type: string; category: string }[];
    ivs: Record<string, number>;
    evs: Record<string, number>;
    baseStats: Record<string, number>;
    computedStats: Record<string, number>;
    types: string[];
  };

  const IV_LABEL: Record<string, string> = {
    hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe',
  };

  export function serializeToShowdown(p: EnrichedPokemon): string {
    const lines: string[] = [];

    let header = p.species;
    if (p.item) header += ` @ ${p.item}`;
    lines.push(header);

    if (p.ability) lines.push(`Ability: ${p.ability}`);
    lines.push(`Level: ${p.level}`);
    if (p.nature) lines.push(`${p.nature} Nature`);

    const ivParts: string[] = [];
    for (const [key, label] of Object.entries(IV_LABEL)) {
      const val = p.ivs[key] ?? 31;
      if (val !== 31) ivParts.push(`${val} ${label}`);
    }
    if (ivParts.length) lines.push(`IVs: ${ivParts.join(' / ')}`);

    const evParts: string[] = [];
    for (const [key, label] of Object.entries(IV_LABEL)) {
      const val = p.evs[key] ?? 0;
      if (val !== 0) evParts.push(`${val} ${label}`);
    }
    if (evParts.length) lines.push(`EVs: ${evParts.join(' / ')}`);

    for (const move of p.moves) {
      lines.push(`- ${move}`);
    }

    return lines.join('\n');
  }

  export function replaceBlockInMyText(
    myText: string,
    originalIndex: number,
    newBlock: string,
  ): string {
    const blocks = myText.replace(/\r\n/g, '\n').split(/\n{2,}/).filter(b => b.trim());
    if (originalIndex < 0 || originalIndex >= blocks.length) return myText;
    blocks[originalIndex] = newBlock;
    return blocks.join('\n\n') + '\n';
  }

  export function appendBlockToMyText(myText: string, newBlock: string): string {
    const trimmed = myText.trimEnd();
    if (!trimmed) return newBlock + '\n';
    return trimmed + '\n\n' + newBlock + '\n';
  }

  export function deleteBlockFromMyText(myText: string, index: number): string {
    const blocks = myText.replace(/\r\n/g, '\n').split(/\n{2,}/).filter(b => b.trim());
    if (index < 0 || index >= blocks.length) return myText;
    blocks.splice(index, 1);
    if (blocks.length === 0) return '';
    return blocks.join('\n\n') + '\n';
  }

  export function keepBlocksByIndices(myText: string, indices: Set<number>): string {
    const blocks = myText.replace(/\r\n/g, '\n').split(/\n{2,}/).filter(b => b.trim());
    const kept = blocks.filter((_, i) => indices.has(i));
    if (kept.length === 0) return '';
    return kept.join('\n\n') + '\n';
  }
