import { type TeamMember, type StatStages } from '../components/TeamBox';
import { type StatusState, type StatusType, applyEndOfTurnResidual } from './status';
import { type WeatherState, getWeatherDamage } from './weather';
import { inferBerryRule, normalizeBerryName } from './hpMath';

export type BerryState = { name: string; consumed: boolean };

export type MemberEx = TeamMember & {
  berry?: BerryState;
  status?: StatusState;
  statStages?: StatStages;
};

export interface GameState {
  myTeam: (MemberEx | undefined)[];
  enemyTeam: (MemberEx | undefined)[];
}

export interface IntimidateEffect {
  targetTeam: 'my' | 'enemy';
  targetIndex: number;
  stages: number;
}

export interface DamageAction {
  type: 'damage';
  turnIndex: number;
  actionKey?: string;
  targetTeam: 'my' | 'enemy';
  targetIndex: number;
  damageHP: number;
  defenderMaxHP: number;
  appliesStatus?: StatusState | null;
  weather?: WeatherState | null;
  gen: number;
  intimidateEffects?: IntimidateEffect[];
}

export interface StatChangeAction {
  type: 'stat-change';
  turnIndex: number;
  actionKey?: string;
  targetTeam: 'my' | 'enemy';
  targetIndex: number;
  statChanges: { stat: string; stages: number }[];
  intimidateEffects?: IntimidateEffect[];
}

export interface StatusMoveAction {
  type: 'status-move';
  turnIndex: number;
  actionKey?: string;
  targetTeam: 'my' | 'enemy';
  targetIndex: number;
  statusEffect: StatusType;
  berryCured: boolean;
  intimidateEffects?: IntimidateEffect[];
}

export interface EndOfTurnEffect {
  targetTeam: 'my' | 'enemy';
  targetIndex: number;
  healHP: number;
  maxHP: number;
  source: 'leftovers';
  pokemonName: string;
}

export interface EndOfTurnAction {
  type: 'end-of-turn';
  actionKey?: string;
  turnIndex: number;
  effects: EndOfTurnEffect[];
}

export type GameAction = DamageAction | StatChangeAction | StatusMoveAction | EndOfTurnAction;

// --- Clone helpers ---

export function cloneMember(m?: MemberEx): MemberEx | undefined {
  if (!m) return undefined;
  return {
    ...m,
    berry: m.berry ? { ...m.berry } : undefined,
    status: m.status ? { ...m.status } : undefined,
    statStages: m.statStages ? { ...m.statStages } : undefined,
  };
}

export function cloneState(state: GameState): GameState {
  return {
    myTeam: state.myTeam.map(cloneMember),
    enemyTeam: state.enemyTeam.map(cloneMember),
  };
}

// --- Damage effects computation (pure, no React) ---

export interface DamageEffects {
  finalPct: number;
  finalHP: number;
  maxHP: number;
  berry?: BerryState;
  status?: StatusState;
  berryUsedName?: string;
  eotType?: 'burn' | 'poison';
  eotLossPct?: number;
  weatherLossPct?: number;
}

export function computeDamageEffects(
  member: MemberEx | undefined,
  action: DamageAction,
): DamageEffects {
  const prevPct = member?.pct ?? 100;
  const prevMaxHP = member?.maxHP;
  const prevCurHP = member?.curHP;
  const prevBerry = member?.berry;
  const prevStatus = member?.status;

  const maxHP = action.defenderMaxHP > 0
    ? action.defenderMaxHP
    : (typeof prevMaxHP === 'number' ? prevMaxHP : 0);

  const curHPNow = typeof prevCurHP === 'number'
    ? prevCurHP
    : Math.max(0, Math.round((prevPct / 100) * maxHP));

  let postHP = Math.max(0, curHPNow - action.damageHP);
  let postPct = maxHP > 0 ? Math.max(0, Math.round((postHP / maxHP) * 100)) : 0;

  let berry = prevBerry;
  const heldBerryName: string | undefined =
    (berry && !berry.consumed) ? berry.name : normalizeBerryName(member?.item);
  const rule = inferBerryRule(heldBerryName, action.gen);
  let berryUsedName: string | undefined;

  if (rule && postPct <= rule.thresholdPct) {
    const healHP = rule.kind === 'heal-flat'
      ? rule.healHP
      : Math.round((rule.healPct / 100) * maxHP);
    postHP = Math.min(maxHP, postHP + healHP);
    postPct = maxHP > 0 ? Math.max(0, Math.round((postHP / maxHP) * 100)) : 0;

    if (heldBerryName) {
      if (berry && berry.name.toLowerCase() === heldBerryName.toLowerCase()) {
        berry = { ...berry, consumed: true };
      } else if (!prevBerry) {
        berry = { name: heldBerryName, consumed: true };
      }
      berryUsedName = heldBerryName;
    }
  }

  let newStatus = prevStatus;
  if (action.appliesStatus) newStatus = action.appliesStatus;

  let finalPct = postPct;
  let finalStatus = newStatus;
  let eotLossPct: number | undefined;
  let eotType: 'burn' | 'poison' | undefined;

  if (newStatus) {
    const e = applyEndOfTurnResidual(finalPct, maxHP, newStatus);
    eotLossPct = e.lossPct > 0 ? e.lossPct : undefined;
    finalPct = e.nextPct;
    if (newStatus.type === 'burn') eotType = 'burn';
    if (newStatus.type === 'psn' || newStatus.type === 'tox') eotType = 'poison';
    if (newStatus.type === 'tox') {
      const stage = (newStatus.toxicStage ?? 1) + 1;
      finalStatus = { type: 'tox', toxicStage: stage };
    }
  }

  let weatherLossPct: number | undefined;
  if (action.weather?.type && (action.weather.type === 'hail' || action.weather.type === 'sandstorm')) {
    const weatherDamage = getWeatherDamage(action.weather.type);
    if (weatherDamage > 0) {
      weatherLossPct = weatherDamage;
      finalPct = Math.max(0, finalPct - weatherDamage);
    }
  }

  const finalHP = maxHP > 0 ? Math.max(0, Math.round((finalPct / 100) * maxHP)) : 0;

  return {
    finalPct: Math.round(finalPct),
    finalHP,
    maxHP,
    berry,
    status: finalStatus,
    berryUsedName,
    eotType,
    eotLossPct,
    weatherLossPct,
  };
}

// --- State transition functions (pure) ---

function applyIntimidateEffects(state: GameState, effects?: IntimidateEffect[]): GameState {
  if (!effects || effects.length === 0) return state;

  let result: GameState = { myTeam: [...state.myTeam], enemyTeam: [...state.enemyTeam] };
  for (const eff of effects) {
    const team = eff.targetTeam === 'my' ? [...result.myTeam] : [...result.enemyTeam];
    const member = team[eff.targetIndex];
    if (!member) continue;

    const stages = member.statStages ?? { atk: 0, def: 0, spatk: 0, spdef: 0, spd: 0 };
    team[eff.targetIndex] = {
      ...member,
      statStages: {
        ...stages,
        atk: Math.max(-6, Math.min(6, stages.atk + eff.stages)),
      },
    };
    if (eff.targetTeam === 'my') result = { ...result, myTeam: team };
    else result = { ...result, enemyTeam: team };
  }
  return result;
}

function applyDamage(state: GameState, action: DamageAction): GameState {
  let result = applyIntimidateEffects(state, action.intimidateEffects);

  const team = [...(action.targetTeam === 'my' ? result.myTeam : result.enemyTeam)];
  const member = team[action.targetIndex];

  const effects = computeDamageEffects(member, action);

  team[action.targetIndex] = {
    ...(member ?? ({ name: '', pct: 100 } as MemberEx)),
    pct: effects.finalPct,
    maxHP: effects.maxHP ?? member?.maxHP,
    curHP: effects.finalHP,
    berry: effects.berry,
    status: effects.status,
  };

  if (action.targetTeam === 'my') return { ...result, myTeam: team };
  return { ...result, enemyTeam: team };
}

function applyStatChange(state: GameState, action: StatChangeAction): GameState {
  let result = applyIntimidateEffects(state, action.intimidateEffects);

  const team = [...(action.targetTeam === 'my' ? result.myTeam : result.enemyTeam)];
  const member = team[action.targetIndex];
  if (!member) return result;

  const prevStages = member.statStages ?? { atk: 0, def: 0, spatk: 0, spdef: 0, spd: 0 };
  const newStages = { ...prevStages };

  for (const change of action.statChanges) {
    const stat = change.stat as keyof StatStages;
    if (stat in newStages) {
      newStages[stat] = Math.max(-6, Math.min(6, newStages[stat] + change.stages));
    }
  }

  team[action.targetIndex] = { ...member, statStages: newStages };
  if (action.targetTeam === 'my') return { ...result, myTeam: team };
  return { ...result, enemyTeam: team };
}

function applyStatusMove(state: GameState, action: StatusMoveAction): GameState {
  let result = applyIntimidateEffects(state, action.intimidateEffects);

  const team = [...(action.targetTeam === 'my' ? result.myTeam : result.enemyTeam)];
  const member = team[action.targetIndex];
  if (!member) return result;

  if (!action.berryCured) {
    const newStatus: StatusState = action.statusEffect === 'tox'
      ? { type: 'tox', toxicStage: 1 }
      : { type: action.statusEffect };
    team[action.targetIndex] = { ...member, status: newStatus };
  } else {
    team[action.targetIndex] = {
      ...member,
      berry: member.berry ? { ...member.berry, consumed: true } : undefined,
    };
  }

  if (action.targetTeam === 'my') return { ...result, myTeam: team };
  return { ...result, enemyTeam: team };
}

function applyEndOfTurn(state: GameState, action: EndOfTurnAction): GameState {
  let result: GameState = { myTeam: [...state.myTeam], enemyTeam: [...state.enemyTeam] };
  for (const eff of action.effects) {
    const team = eff.targetTeam === 'my' ? [...result.myTeam] : [...result.enemyTeam];
    const member = team[eff.targetIndex];
    if (!member || (member.pct ?? 100) <= 0) continue;

    const maxHP = eff.maxHP > 0 ? eff.maxHP : (member.maxHP ?? 0);
    const curHP = typeof member.curHP === 'number' ? member.curHP : Math.round(((member.pct ?? 100) / 100) * maxHP);
    if (curHP >= maxHP) continue;

    const newHP = Math.min(maxHP, curHP + eff.healHP);
    const newPct = maxHP > 0 ? Math.round((newHP / maxHP) * 100) : member.pct ?? 100;
    team[eff.targetIndex] = { ...member, curHP: newHP, pct: newPct, maxHP };

    if (eff.targetTeam === 'my') result = { ...result, myTeam: team };
    else result = { ...result, enemyTeam: team };
  }
  return result;
}

// --- Public API ---

export function applyAction(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'damage': return applyDamage(state, action);
    case 'stat-change': return applyStatChange(state, action);
    case 'status-move': return applyStatusMove(state, action);
    case 'end-of-turn': return applyEndOfTurn(state, action);
  }
}

export function replayAll(initial: GameState, actions: GameAction[]): GameState {
  return actions.reduce(applyAction, cloneState(initial));
}
