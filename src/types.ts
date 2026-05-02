export type SideID = 'p1' | 'p2';

export interface SimpleSet {
  species: string;
  level: number;
  nature?: string;
  ability?: string;
  item?: string;
  /** NEW: pass statuses through to the calc when provided by UI overrides */
  status?: 'brn' | 'par' | 'psn' | 'tox' | 'frz' | 'slp';
  moves: string[];
  ivs?: Partial<Record<'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe', number>>;
  evs?: Partial<Record<'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe', number>>;
}

export interface FighterState {
  set: SimpleSet;
  maxHP: number;
  curHP: number;
  consumedItems: Set<string>;
  status?: string;
}

export interface FieldState {
  weather?: string;
  terrain?: string;
  screens?: { reflect?: boolean; lightScreen?: boolean; auroraVeil?: boolean };
}

export interface BattleState {
  gen: number;
  field: FieldState;
  p1: FighterState;
  p2: FighterState;
}

export interface ActionLine {
  actorAlias: string;
  move: string;
  targetAlias: string;
}

export interface DamageSummary {
  defenderMaxHP: number;
  minPct: number;
  maxPct: number;
  rollsPct: number[];
  rollsHP: number[];
  critMinPct: number;
  critMaxPct: number;
  critRollsPct: number[];
  critRollsHP: number[];
  desc: string;
}

export type StatKey = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';
export type StatBlock = Record<StatKey, number>;

export interface MoveInfo {
  name: string;
  bp: number;
  type: string;
  category: string;
}

export interface EnrichedPokemon {
  species: string;
  level: number;
  nature?: string;
  ability?: string;
  item?: string;
  moves: string[];
  moveDetails: MoveInfo[];
  ivs: StatBlock;
  evs: StatBlock;
  baseStats: StatBlock;
  computedStats: StatBlock;
  types: string[];
}
