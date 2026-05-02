// src/App.tsx
import React, { useEffect, useMemo, useState } from 'react';

import QueryEditor from './components/QueryEditor';
import TeamBox, { type TeamMember } from './components/TeamBox';
import CalcButton from './components/CalcButton';
import CritToggleButton from './components/CritToggleButton';
import RunButton from './components/RunButton';
import UndoButton from './components/UndoButton';
import RollSlider from './components/RollSlider';
import FilePicker from './components/FilePicker';
import PokemonIcon from './components/PokemonIcon';
import TeamEditor from './components/TeamEditor';

import { buildDictionaries, type Dictionaries } from './logic/parsers';
import { parseActionFromLine } from './logic/grammar';
import { inferBerryRule, normalizeBerryName } from './logic/hpMath';
import {
  inferStatusFromMove,
  applyEndOfTurnResidual,
  makeInitialStatus,
  type StatusType,
  type StatusState,
} from './logic/status';
import {
  resolveCanonicalName,
  normalizeEnemyTrainerTextForBackend,
  uniqSortedWithZero,
  fetchMaxHPFromAPI,
} from './logic/helpers';
import {
  type WeatherType,
  type WeatherState,
  getWeatherFromMove,
  getWeatherFromAbility,
  isSandSpitAbility,
  getWeatherDuration,
  getWeatherSymbol,
  getWeatherName,
  advanceWeather,
  getWeatherDamage,
  isImmuneToWeatherDamage,
} from './logic/weather';
import {
  type ScreenType,
  type ScreenState,
  getScreenFromMove,
  getScreenSymbol,
  getScreenName,
  getScreenDescription,
  advanceScreen,
  SCREEN_DURATION,
  doesScreenAffectAttack,
} from './logic/screens';
import {
  type MemberEx,
  type BerryState,
  type GameState,
  type GameAction,
  type DamageAction,
  type StatChangeAction,
  type StatusMoveAction,
  type IntimidateEffect,
  cloneMember,
  cloneState,
  computeDamageEffects,
  replayAll,
} from './logic/gameState';

type StatChange = {
  stat: 'atk' | 'def' | 'spatk' | 'spdef' | 'spd';
  stages: number;
  target: 'self' | 'opponent';
};

type TurnLine = {
  id: number;
  text: string;

  // Result from /api/calc (plus roll lists)
  result?: {
    defender: string;
    defenderMaxHP?: number;

    lowPct: number;  lowHP?: number;  lowBerry?: { name: string; healHP: number; healPct: number } | null;
    highPct: number; highHP?: number; highBerry?: { name: string; healHP: number; healPct: number } | null;
    critPct: number; critHP?: number; critBerry?: { name: string; healHP: number; healPct: number } | null;

    eot?: {
      low?:  { nextPct: number; lossPct: number; lossHP?: number; note: string };
      high?: { nextPct: number; lossPct: number; lossHP?: number; note: string };
      crit?: { nextPct: number; lossPct: number; lossHP?: number; note: string };
    };

    appliesStatus?: StatusState | null;

    rawRollsNormal?: number[];
    rawRollsCrit?: number[];
    rollOptionsNormal?: number[];
    rollOptionsCrit?: number[];

    // For stat-changing moves
    isStatChange?: boolean;
    statChanges?: StatChange[];
    target?: string;
    
    // For status-inflicting moves
    isStatusMove?: boolean;
    statusEffect?: 'burn' | 'psn' | 'tox' | 'par' | 'frz';
    berryCured?: boolean;
    berryUsed?: string;
    
    // For displaying Intimidate effects
    intimidateEffects?: Array<{ user: string; target: string; effect: 'normal' | 'blocked' | 'defiant' }>;
  };

  // Snapshot of applied outcome (for export)
  chosen?: {
    attacker: string;
    move: string;
    defender: string;
    finalPct: number;
    finalHP?: number;
    maxHP?: number;
    berryUsedName?: string;
    eotType?: 'burn' | 'poison';
    eotLossPct?: number;
    // For stat-changing moves
    isStatChange?: boolean;
    statChanges?: Array<{ stat: string; stages: number; target: string }>;
    // For status-inflicting moves
    isStatusMove?: boolean;
    statusEffect?: 'burn' | 'psn' | 'tox' | 'par' | 'frz';
    statusCured?: boolean;
    // For Intimidate
    intimidateUsed?: Array<{ user: string; target: string; effect: 'normal' | 'blocked' | 'defiant' }>;
  };

  // UX
  loading?: boolean;
  error?: string | null;

  // UI state
  useCrit?: boolean;
  selectedRollIndex?: number;
  attackerFirstTurnOut?: boolean;
  defenderFirstTurnOut?: boolean;

  // Run-once gate
  runApplied?: boolean;

  // Weather state for this turn
  weather?: WeatherState | null;
  
  // Screen states for this turn (multiple screens can be active)
  myScreens?: ScreenState[]; // Screens set up by my team
  enemyScreens?: ScreenState[]; // Screens set up by enemy team
};

type CalcResponse = {
  defender: string;
  defenderMaxHP: number;
  remaining: { lowPct: number; lowHP: number; highPct: number; highHP: number; critPct: number; critHP: number };
  debug?: { rolls?: { normal?: number[]; crit?: number[] } };
};

/* ===================== App ===================== */

export default function App() {
  // Tab navigation
  const [activeTab, setActiveTab] = useState<'editor' | 'planner'>('planner');

  // Uploads + gen
  const [myText, setMyText] = useState('');
  const [enemyText, setEnemyText] = useState('');
  const [gen, setGen] = useState<number>(9);
  const [runAndBun, setRunAndBun] = useState<boolean>(false); // Weather lasts indefinitely if true
  const [battleMode, setBattleMode] = useState<'singles' | 'doubles'>('singles'); // Battle format

  const dicts = useMemo<Dictionaries>(() => buildDictionaries(myText, enemyText), [myText, enemyText]);

  // Base (editable) teams — used before first Run
  const [baseMyTeam, setMyTeam] = useState<MemberEx[]>(Array(6).fill(undefined) as any);
  const [baseEnemyTeam, setEnemyTeam] = useState<MemberEx[]>([]);

  // Action-log replay state
  const [initialState, setInitialState] = useState<GameState | null>(null);
  const [actionLog, setActionLog] = useState<GameAction[]>([]);

  const derivedState = useMemo<GameState | null>(
    () => initialState ? replayAll(initialState, actionLog) : null,
    [initialState, actionLog]
  );

  // Active teams: derived from action log when running, editable otherwise
  const myTeam = (derivedState?.myTeam ?? baseMyTeam) as MemberEx[];
  const enemyTeam = (derivedState?.enemyTeam ?? baseEnemyTeam) as MemberEx[];

  // Prefill enemy team when enemytrainer changes
  useEffect(() => {
    const init = dicts.enemySpecies.slice(0, 6).map(name => {
      const item = dicts.enemyItemBySpecies[name];
      const norm = normalizeBerryName(item);
      const rule = inferBerryRule(norm, gen);
      return {
        name,
        pct: 100,
        maxHP: undefined,
        curHP: undefined,
        item,
        berry: rule ? { name: rule.name, consumed: false } : undefined,
        status: undefined,
        statStages: { atk: 0, def: 0, spatk: 0, spdef: 0, spd: 0 },
      } as MemberEx;
    });
    setEnemyTeam(init);

    // Fetch maxHP for each enemy Pokemon
    init.forEach(async (member, idx) => {
      if (member?.name) {
        const maxHP = await fetchMaxHPFromAPI(member.name, myText, enemyText, gen);
        if (typeof maxHP === 'number') {
          setEnemyTeam(prev => {
            const next = [...prev];
            if (next[idx]) {
              next[idx] = { ...next[idx]!, maxHP, curHP: maxHP };
            }
            return next;
          });
        }
      }
    });
  }, [dicts.enemySpecies.join('|'), dicts.enemyItemBySpecies, gen, myText, enemyText]);

  function findMember(name: string): { team: 'my'|'enemy'|null, index: number, member?: MemberEx } {
    const e = enemyTeam.findIndex(m => m?.name?.toLowerCase() === name.toLowerCase());
    if (e !== -1) return { team: 'enemy', index: e, member: enemyTeam[e] };
    const i = myTeam.findIndex(m => m?.name?.toLowerCase() === name.toLowerCase());
    if (i !== -1) return { team: 'my', index: i, member: myTeam[i] };
    return { team: null, index: -1, member: undefined };
  }

  async function addToMyTeam(slotIndex: number, species: string) {
    const item = dicts.myItemBySpecies[species];
    const norm = normalizeBerryName(item);
    const rule = inferBerryRule(norm, gen);
    setMyTeam(prev => {
      const next = [...prev];
      next[slotIndex] = {
        name: species,
        pct: 100,
        maxHP: undefined,
        curHP: undefined,
        item,
        berry: rule ? { name: rule.name, consumed: false } : undefined,
        status: undefined,
        statStages: { atk: 0, def: 0, spatk: 0, spdef: 0, spd: 0 },
      };
      return next;
    });

    // Fetch maxHP for the added Pokemon
    const maxHP = await fetchMaxHPFromAPI(species, myText, enemyText, gen);
    if (typeof maxHP === 'number') {
      setMyTeam(prev => {
        const next = [...prev];
        if (next[slotIndex]?.name === species) {
          next[slotIndex] = { ...next[slotIndex]!, maxHP, curHP: maxHP };
        }
        return next;
      });
    }
  }

  // Change status/item (My Team only)
  const onChangeStatus = (index: number, statusType: StatusType | undefined) => {
    setMyTeam(prev => {
      const next = [...prev];
      const cur = next[index];
      if (!cur) return prev;
      const status = statusType ? { type: statusType as StatusType } : undefined;
      next[index] = { ...cur, status };
      return next;
    });
  };

  const onChangeItem = (index: number, item: string | undefined) => {
    setMyTeam(prev => {
      const next = [...prev];
      const cur = next[index];
      if (!cur) return prev;

      const norm = normalizeBerryName(item);
      const rule = inferBerryRule(norm, gen);
      const berry: BerryState | undefined = rule ? { name: rule.name, consumed: false } : undefined;

      next[index] = { ...cur, item, berry };
      return next;
    });
  };

  const onChangeHP = (index: number, curHP: number, maxHP: number) => {
    setMyTeam(prev => {
      const next = [...prev];
      const cur = next[index];
      if (!cur) return prev;

      const pct = Math.round((curHP / maxHP) * 100);
      next[index] = { ...cur, curHP, maxHP, pct };
      return next;
    });
  };

  // Planner
  const [turns, setTurns] = useState<TurnLine[]>([{ id: 1, text: '' }]);
  const onEditorChange = (i: number, v: string) =>
    setTurns(p => p.map((t, idx) => (idx === i ? { ...t, text: v } : t)));
  const addTurn = () =>
    setTurns(p => [...p, { id: p.length + 1, text: '' }]);

  // Undo: remove this turn's action from the log; state auto-recomputes
  function undoRun(i: number) {
    const t = turns[i];
    if (!t.runApplied) return;

    const newLog = actionLog.filter(a => a.turnIndex !== i);
    setActionLog(newLog);

    if (newLog.length === 0 && initialState) {
      setMyTeam(initialState.myTeam.map(cloneMember) as MemberEx[]);
      setEnemyTeam(initialState.enemyTeam.map(cloneMember) as MemberEx[]);
      setInitialState(null);
    }

    setTurns(prev => prev.map((x, idx) =>
      idx === i ? { ...x, runApplied: false, chosen: undefined } : x
    ));
  }


  // Calc handler
  async function doCalc(i: number) {
    const t = turns[i];
    const base = parseActionFromLine(t.text);
    if (!base) {
      setTurns(prev => prev.map((x, idx) => idx === i ? { ...x, result: undefined, error: 'Line grammar: "<pokemon> use <move> on <pokemon>"' } : x));
      return;
    }

    // Derived state (from action log) is always the correct current state — no snapshot needed
    const attackerCanon = resolveCanonicalName(base.attacker, dicts) ?? base.attacker;
    const defenderCanon = resolveCanonicalName(base.defender, dicts) ?? base.defender;

    const defenderLoc = findMember(defenderCanon);
    const currentPct = defenderLoc.member?.pct ?? 100;
    const currentStatus = defenderLoc.member?.status;

    // Status from MOVE (for EoT preview; actual mutation happens on Run)
    const appliedType = inferStatusFromMove(base.move);
    const appliesStatus = appliedType ? makeInitialStatus(appliedType) : null;

    setTurns(prev => prev.map((x, idx) => idx === i ? ({ ...x, loading: true, error: null }) : x));

    try {
      const enemyTextForBackend = normalizeEnemyTrainerTextForBackend(enemyText);
      
      // Get attacker location (defenderLoc already fetched above)
      const attackerLoc = findMember(attackerCanon);
      
      // Clone stat stages to apply Intimidate
      let attackerStatStages = { ...(attackerLoc.member?.statStages ?? { atk: 0, def: 0, spatk: 0, spdef: 0, spd: 0 }) };
      let defenderStatStages = { ...(defenderLoc.member?.statStages ?? { atk: 0, def: 0, spatk: 0, spdef: 0, spd: 0 }) };
      
      // Apply Intimidate ability if first turn out is checked
      const attackerAbility = dicts.myAbilityBySpecies[attackerCanon] || dicts.enemyAbilityBySpecies[attackerCanon];
      const defenderAbility = dicts.myAbilityBySpecies[defenderCanon] || dicts.enemyAbilityBySpecies[defenderCanon];
      
      if (t.attackerFirstTurnOut && attackerAbility?.toLowerCase() === 'intimidate') {
        // Attacker has Intimidate - check defender's ability
        const defAbilityLower = defenderAbility?.toLowerCase();
        if (defAbilityLower === 'inner focus') {
          // Inner Focus prevents Intimidate
          // No stat change
        } else if (defAbilityLower === 'defiant') {
          // Defiant raises Attack by 2 when stats are lowered
          defenderStatStages.atk = Math.min(6, defenderStatStages.atk + 2);
        } else {
          // Normal Intimidate effect - lower defender's Attack
          defenderStatStages.atk = Math.max(-6, defenderStatStages.atk - 1);
        }
      }
      
      if (t.defenderFirstTurnOut && defenderAbility?.toLowerCase() === 'intimidate') {
        // Defender has Intimidate - check attacker's ability
        const atkAbilityLower = attackerAbility?.toLowerCase();
        if (atkAbilityLower === 'inner focus') {
          // Inner Focus prevents Intimidate
          // No stat change
        } else if (atkAbilityLower === 'defiant') {
          // Defiant raises Attack by 2 when stats are lowered
          attackerStatStages.atk = Math.min(6, attackerStatStages.atk + 2);
        } else {
          // Normal Intimidate effect - lower attacker's Attack
          attackerStatStages.atk = Math.max(-6, attackerStatStages.atk - 1);
        }
      }

      // Determine current weather (carry forward from previous turn or set new)
      let currentWeather: WeatherState | null = null;
      
      // Get weather from previous turn
      if (i > 0 && turns[i - 1].weather) {
        currentWeather = advanceWeather(turns[i - 1].weather);
      }
      
      // Check if abilities set weather when first turn out
      if (t.attackerFirstTurnOut && attackerAbility) {
        const abilityWeather = getWeatherFromAbility(attackerAbility);
        if (abilityWeather) {
          currentWeather = {
            type: abilityWeather,
            turnsRemaining: getWeatherDuration(runAndBun),
            startedOnTurn: i + 1,
          };
        }
      }
      
      if (t.defenderFirstTurnOut && defenderAbility) {
        const abilityWeather = getWeatherFromAbility(defenderAbility);
        if (abilityWeather) {
          currentWeather = {
            type: abilityWeather,
            turnsRemaining: getWeatherDuration(runAndBun),
            startedOnTurn: i + 1,
          };
        }
      }
      
      // Check if the move sets weather
      const moveWeather = getWeatherFromMove(base.move);
      if (moveWeather) {
        currentWeather = {
          type: moveWeather,
          turnsRemaining: getWeatherDuration(runAndBun),
          startedOnTurn: i + 1,
        };
      }
      
      // Carry forward screens from previous turn and advance their duration
      let myScreens: ScreenState[] = [];
      let enemyScreens: ScreenState[] = [];
      
      if (i > 0 && turns[i - 1].myScreens) {
        myScreens = turns[i - 1].myScreens
          .map(advanceScreen)
          .filter((s): s is ScreenState => s !== null);
      }
      
      if (i > 0 && turns[i - 1].enemyScreens) {
        enemyScreens = turns[i - 1].enemyScreens
          .map(advanceScreen)
          .filter((s): s is ScreenState => s !== null);
      }
      
      // Check if the move sets up a screen
      const screenType = getScreenFromMove(base.move);
      if (screenType) {
        // Determine which team is using the screen
        const attackerIsMyTeam = myTeam.some(m => 
          m?.name && resolveCanonicalName(m.name, dicts) === attackerCanon
        );
        
        const newScreen: ScreenState = {
          type: screenType,
          userTeam: attackerIsMyTeam ? 'my' : 'enemy',
          turnsRemaining: SCREEN_DURATION,
          startedOnTurn: i + 1,
        };
        
        if (attackerIsMyTeam) {
          // Remove any existing screen of the same type, then add new one
          myScreens = myScreens.filter(s => s.type !== screenType);
          myScreens.push(newScreen);
        } else {
          enemyScreens = enemyScreens.filter(s => s.type !== screenType);
          enemyScreens.push(newScreen);
        }
        
        // For screen moves, return early with a message (like stat-changing moves)
        setTurns(prev => prev.map((x, idx) => idx === i ? ({
          ...x,
          loading: false,
          error: null,
          result: {
            defender: defenderCanon,
            lowPct: 0, highPct: 0, critPct: 0,
            isStatChange: true, // Reuse this flag for non-damaging moves
            statChanges: [], // Empty for screen moves
            target: attackerCanon,
            intimidateEffects: undefined,
          },
          weather: currentWeather,
          myScreens,
          enemyScreens,
          runApplied: false,
          chosen: undefined,
        }) : x));
        return;
      }
      
      // Determine which team is attacking to pass correct screen info
      const attackerIsMyTeam = myTeam.some(m => 
        m?.name && resolveCanonicalName(m.name, dicts) === attackerCanon
      );
      
      // Screens that affect the attacker (set by opposing team)
      const screensAffectingAttacker = attackerIsMyTeam ? enemyScreens : myScreens;
      
      const resp = await fetch('/api/calc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          myText,
          enemyText: enemyTextForBackend,
          attacker: attackerCanon,
          move: base.move,
          defender: defenderCanon,
          gen,
          weather: currentWeather?.type,
          screens: screensAffectingAttacker, // Only send screens that affect the attacker
          battleMode, // 'singles' or 'doubles'
          overrides: {
            attacker: {
              statStages: attackerStatStages,
              status: attackerLoc.member?.status?.type,
            },
            defender: {
              statStages: defenderStatStages,
              status: defenderLoc.member?.status?.type,
            },
          },
        }),
      });
      if (!resp.ok) throw new Error(await resp.text() || `HTTP ${resp.status}`);

      const data: any = await resp.json();

      // Apply Intimidate stat changes to the actual Pokemon if they were triggered
      // Intimidate stat changes are now persisted via the action log on Run, not during Calc

      // Build Intimidate effects array for display
      const intimidateEffects: Array<{ user: string; target: string; effect: 'normal' | 'blocked' | 'defiant' }> = [];
      if (t.attackerFirstTurnOut && attackerAbility?.toLowerCase() === 'intimidate') {
        const defAbilityLower = defenderAbility?.toLowerCase();
        const effect = defAbilityLower === 'inner focus' ? 'blocked'
          : defAbilityLower === 'defiant' ? 'defiant'
          : 'normal';
        intimidateEffects.push({ user: attackerCanon, target: defenderCanon, effect });
      }
      if (t.defenderFirstTurnOut && defenderAbility?.toLowerCase() === 'intimidate') {
        const atkAbilityLower = attackerAbility?.toLowerCase();
        const effect = atkAbilityLower === 'inner focus' ? 'blocked'
          : atkAbilityLower === 'defiant' ? 'defiant'
          : 'normal';
        intimidateEffects.push({ user: defenderCanon, target: attackerCanon, effect });
      }

      // Check if this is a stat change move
      if (data.isStatChange) {
        setTurns(prev => prev.map((x, idx) => idx === i ? ({
          ...x,
          loading: false,
          error: null,
          result: {
            defender: defenderCanon,
            lowPct: 0, highPct: 0, critPct: 0,
            isStatChange: true,
            statChanges: data.statChanges,
            target: data.target,
            intimidateEffects: intimidateEffects.length > 0 ? intimidateEffects : undefined,
          },
          weather: currentWeather,
          myScreens,
          enemyScreens,
          runApplied: false,
          chosen: undefined,
        }) : x));
        return;
      }

      // Check if this is a status-inflicting move
      if (data.isStatusMove) {
        const targetCanon = resolveCanonicalName(data.target, dicts) ?? data.target;
        const targetLoc = findMember(targetCanon);
        
        // Check if target has a berry that cures this status
        const targetBerry = targetLoc.member?.item;
        const curingBerries: Record<string, string[]> = {
          'burn': ['Lum Berry', 'Rawst Berry'],
          'par': ['Lum Berry', 'Cheri Berry'],
          'psn': ['Lum Berry', 'Pecha Berry'],
          'tox': ['Lum Berry', 'Pecha Berry'],
          'frz': ['Lum Berry', 'Aspear Berry'],
        };
        
        const curesList = curingBerries[data.status] || [];
        const berryCures = targetBerry && curesList.some(b => targetBerry.toLowerCase().includes(b.toLowerCase().replace(' berry', '')));
        
        setTurns(prev => prev.map((x, idx) => idx === i ? ({
          ...x,
          loading: false,
          error: null,
          result: {
            defender: targetCanon,
            lowPct: 0, highPct: 0, critPct: 0,
            isStatusMove: true,
            statusEffect: data.status,
            target: targetCanon,
            berryCured: !!berryCures,
            berryUsed: berryCures ? targetBerry : undefined,
            intimidateEffects: intimidateEffects.length > 0 ? intimidateEffects : undefined,
          },
          weather: currentWeather,
          myScreens,
          enemyScreens,
          runApplied: false,
          chosen: undefined,
        }) : x));
        return;
      }

      // API remaining-from-full → damage → apply to currentPct baseline
      const r = data.remaining;
      const defMaxHP = data.defenderMaxHP;

      const dmgLowPct  = 100 - r.highPct;
      const dmgHighPct = 100 - r.lowPct;
      const dmgCritPct = 100 - r.critPct;

      const postLowPct  = Math.max(0, Math.round(currentPct - dmgLowPct));
      const postHighPct = Math.max(0, Math.round(currentPct - dmgHighPct));
      const postCritPct = Math.max(0, Math.round(currentPct - dmgCritPct));

      const toHP = (pct: number | undefined) =>
        typeof defMaxHP === 'number' && typeof pct === 'number'
          ? Math.max(0, Math.round((pct / 100) * defMaxHP))
          : undefined;

      const postLowHP  = toHP(postLowPct);
      const postHighHP = toHP(postHighPct);
      const postCritHP = toHP(postCritPct);

      // EoT preview (status from move if any, else current status)
      const mkE = (postPct: number) => {
        const st = appliesStatus ?? currentStatus;
        if (!st) return null;
        const { nextPct, lossPct, lossHP } = applyEndOfTurnResidual(Math.round(postPct), defMaxHP, st);
        const note =
          st.type === 'burn' ? 'after BRN' :
          st.type === 'psn'  ? 'after PSN' :
          st.type === 'tox'  ? 'after BPSN' :
          st.type === 'par'  ? 'PRLYZ (no EoT dmg)' :
          st.type === 'frz'  ? 'FRZN (no EoT dmg)' : '';
        return { nextPct, lossPct, lossHP, note };
      };

      const eot = {
        low:  mkE(postLowPct)  || undefined,
        high: mkE(postHighPct) || undefined,
        crit: mkE(postCritPct) || undefined,
      };

      // Raw roll arrays (HP) → slider options (dedup + include 0)
      const normalRaw = data?.debug?.rolls?.normal ?? [];
      const critRaw   = data?.debug?.rolls?.crit ?? [];
      const rollOptionsNormal = uniqSortedWithZero(normalRaw);
      const rollOptionsCrit   = uniqSortedWithZero(critRaw);

      setTurns(prev => prev.map((x, idx) => idx === i ? ({
        ...x,
        loading: false,
        error: null,
        result: {
          defender: data.defender || defenderCanon,
          lowPct:  postLowPct,  lowHP:  postLowHP,   lowBerry: null,
          highPct: postHighPct, highHP: postHighHP,  highBerry: null,
          critPct: postCritPct, critHP: postCritHP,  critBerry: null,
          defenderMaxHP: defMaxHP,
          eot,
          appliesStatus,
          rawRollsNormal: normalRaw,
          rawRollsCrit: critRaw,
          rollOptionsNormal,
          rollOptionsCrit,
          intimidateEffects: intimidateEffects.length > 0 ? intimidateEffects : undefined,
        },
        weather: currentWeather,
        myScreens,
        enemyScreens,
        useCrit: false,
        selectedRollIndex: 0,
        runApplied: false,
        chosen: undefined,
      }) : x));
    } catch (err: any) {
      setTurns(prev => prev.map((x, idx) => idx === i ? ({ ...x, loading: false, error: err?.message || String(err), result: undefined }) : x));
    }
  }

  // Apply the currently selected roll (Run)
  function applySelectedRoll(i: number) {
    const t = turns[i];
    if (!t?.result) return;
    if (t.runApplied) return;

    const parsed = parseActionFromLine(t.text);
    const attackerName = parsed?.attacker ?? '';
    const moveName = parsed?.move ?? '';
    const defenderName = parsed?.defender ?? t.result.defender;

    const attackerCanon = resolveCanonicalName(attackerName, dicts) ?? attackerName;
    const defenderCanon = resolveCanonicalName(defenderName, dicts) ?? defenderName;
    const attackerAbility = dicts.myAbilityBySpecies[attackerCanon] || dicts.enemyAbilityBySpecies[attackerCanon];
    const defenderAbility = dicts.myAbilityBySpecies[defenderCanon] || dicts.enemyAbilityBySpecies[defenderCanon];

    // Build Intimidate effects for the action log + export display
    const intimidateEffects: IntimidateEffect[] = [];
    const intimidateUsed: Array<{ user: string; target: string; effect: 'normal' | 'blocked' | 'defiant' }> = [];

    if (t.attackerFirstTurnOut && attackerAbility?.toLowerCase() === 'intimidate') {
      const defAbilityLower = defenderAbility?.toLowerCase();
      const defLoc = findMember(defenderCanon);
      if (defAbilityLower === 'inner focus') {
        intimidateUsed.push({ user: attackerName, target: defenderName, effect: 'blocked' });
      } else if (defAbilityLower === 'defiant') {
        intimidateUsed.push({ user: attackerName, target: defenderName, effect: 'defiant' });
        if (defLoc.team) intimidateEffects.push({ targetTeam: defLoc.team, targetIndex: defLoc.index, stages: 2 });
      } else {
        intimidateUsed.push({ user: attackerName, target: defenderName, effect: 'normal' });
        if (defLoc.team) intimidateEffects.push({ targetTeam: defLoc.team, targetIndex: defLoc.index, stages: -1 });
      }
    }
    if (t.defenderFirstTurnOut && defenderAbility?.toLowerCase() === 'intimidate') {
      const atkAbilityLower = attackerAbility?.toLowerCase();
      const atkLoc = findMember(attackerCanon);
      if (atkAbilityLower === 'inner focus') {
        intimidateUsed.push({ user: defenderName, target: attackerName, effect: 'blocked' });
      } else if (atkAbilityLower === 'defiant') {
        intimidateUsed.push({ user: defenderName, target: attackerName, effect: 'defiant' });
        if (atkLoc.team) intimidateEffects.push({ targetTeam: atkLoc.team, targetIndex: atkLoc.index, stages: 2 });
      } else {
        intimidateUsed.push({ user: defenderName, target: attackerName, effect: 'normal' });
        if (atkLoc.team) intimidateEffects.push({ targetTeam: atkLoc.team, targetIndex: atkLoc.index, stages: -1 });
      }
    }

    // Capture initial state on first Run
    if (!initialState) {
      setInitialState({
        myTeam: baseMyTeam.map(cloneMember),
        enemyTeam: baseEnemyTeam.map(cloneMember),
      });
    }

    // Handle stat-changing moves
    if (t.result.isStatChange && t.result.statChanges && t.result.target) {
      const targetCanon = resolveCanonicalName(t.result.target, dicts) ?? t.result.target;
      const loc = findMember(targetCanon);
      if (!loc.team) return;

      const action: StatChangeAction = {
        type: 'stat-change',
        turnIndex: i,
        targetTeam: loc.team,
        targetIndex: loc.index,
        statChanges: t.result.statChanges.map(sc => ({ stat: sc.stat, stages: sc.stages })),
        intimidateEffects: intimidateEffects.length > 0 ? intimidateEffects : undefined,
      };
      setActionLog(prev => [...prev, action]);

      const statChangeDescriptions = t.result.statChanges.map(change => ({
        stat: change.stat, stages: change.stages, target: targetCanon,
      }));

      setTurns(prev => prev.map((x, idx) => idx === i ? {
        ...x,
        runApplied: true,
        chosen: {
          attacker: attackerName || '',
          move: moveName || '',
          defender: targetCanon,
          finalPct: loc.member?.pct ?? 100,
          finalHP: loc.member?.curHP,
          maxHP: loc.member?.maxHP,
          isStatChange: true,
          statChanges: statChangeDescriptions,
          intimidateUsed: intimidateUsed.length > 0 ? intimidateUsed : undefined,
        },
      } : x));
      return;
    }

    // Handle status-inflicting moves
    if (t.result.isStatusMove && t.result.statusEffect && t.result.target) {
      const targetCanon = resolveCanonicalName(t.result.target, dicts) ?? t.result.target;
      const loc = findMember(targetCanon);
      if (!loc.team) return;

      const action: StatusMoveAction = {
        type: 'status-move',
        turnIndex: i,
        targetTeam: loc.team,
        targetIndex: loc.index,
        statusEffect: t.result.statusEffect as StatusType,
        berryCured: !!t.result.berryCured,
        intimidateEffects: intimidateEffects.length > 0 ? intimidateEffects : undefined,
      };
      setActionLog(prev => [...prev, action]);

      setTurns(prev => prev.map((x, idx) => idx === i ? {
        ...x,
        runApplied: true,
        chosen: {
          attacker: attackerName || '',
          move: moveName || '',
          defender: targetCanon,
          finalPct: loc.member?.pct ?? 100,
          finalHP: loc.member?.curHP,
          maxHP: loc.member?.maxHP,
          isStatusMove: true,
          statusEffect: t.result.statusEffect,
          statusCured: t.result.berryCured,
          intimidateUsed: intimidateUsed.length > 0 ? intimidateUsed : undefined,
        },
      } : x));
      return;
    }

    // Damaging move
    const { defender, defenderMaxHP } = t.result;
    const defCanon = resolveCanonicalName(defender, dicts) ?? defender;
    const loc = findMember(defCanon);
    if (!loc.team) return;

    const options = (t.useCrit ? t.result.rollOptionsCrit : t.result.rollOptionsNormal) ?? [0];
    const selectedIdx = Math.max(0, Math.min((t.selectedRollIndex ?? 0), options.length - 1));
    const selectedDamageHP = Math.max(0, Math.round(options[selectedIdx] ?? 0));

    const maxHP = typeof defenderMaxHP === 'number' && defenderMaxHP > 0
      ? defenderMaxHP
      : (typeof loc.member?.maxHP === 'number' ? loc.member.maxHP : undefined);

    if (typeof maxHP !== 'number') return;

    // Check for Sand Spit ability
    let sandSpitTriggered = false;
    if (selectedDamageHP > 0) {
      const defAbility = dicts.myAbilityBySpecies[defCanon] || dicts.enemyAbilityBySpecies[defCanon];
      if (isSandSpitAbility(defAbility)) {
        sandSpitTriggered = true;
        const newWeather: WeatherState = {
          type: 'sandstorm',
          turnsRemaining: getWeatherDuration(runAndBun),
          startedOnTurn: i + 1,
        };
        setTurns(prev => prev.map((turn, idx) => idx >= i ? { ...turn, weather: newWeather } : turn));
      }
    }

    const action: DamageAction = {
      type: 'damage',
      turnIndex: i,
      targetTeam: loc.team,
      targetIndex: loc.index,
      damageHP: selectedDamageHP,
      defenderMaxHP: maxHP,
      appliesStatus: t.result.appliesStatus ?? undefined,
      weather: t.weather,
      gen,
      intimidateEffects: intimidateEffects.length > 0 ? intimidateEffects : undefined,
    };
    setActionLog(prev => [...prev, action]);

    const effects = computeDamageEffects(loc.member, action);

    setTurns(prev => prev.map((x, idx) => {
      if (idx !== i) return x;
      return {
        ...x,
        runApplied: true,
        chosen: {
          attacker: attackerName || '',
          move: moveName || '',
          defender: defenderName || defCanon,
          finalPct: effects.finalPct,
          finalHP: effects.finalHP,
          maxHP: effects.maxHP,
          berryUsedName: effects.berryUsedName,
          eotType: effects.eotType,
          eotLossPct: effects.eotLossPct,
          weatherLossPct: effects.weatherLossPct,
          sandSpitTriggered,
          intimidateUsed: intimidateUsed.length > 0 ? intimidateUsed : undefined,
        },
      };
    }));
  }

  // Delete turn: remove action from log (renumber subsequent), remove turn
  function deleteTurn(i: number) {
    const newLog = actionLog
      .filter(a => a.turnIndex !== i)
      .map(a => a.turnIndex > i ? { ...a, turnIndex: a.turnIndex - 1 } : a);
    setActionLog(newLog);

    if (newLog.length === 0 && initialState) {
      setMyTeam(initialState.myTeam.map(cloneMember) as MemberEx[]);
      setEnemyTeam(initialState.enemyTeam.map(cloneMember) as MemberEx[]);
      setInitialState(null);
    }

    setTurns(prev => prev.filter((_, idx) => idx !== i));
  }

  // -------- Export Lines (.txt) --------
  function exportLines() {
    const lines: string[] = [];

    turns.forEach((t, idx) => {
      const n = idx + 1;
      const c = t.chosen;
      if (!c) return;

      const att = c.attacker || '(attacker)';
      const mv  = c.move || '(move)';
      const def = c.defender || '(defender)';

      // Build the main line
      let line = `Turn ${n}: `;

      // Add weather information if present
      if (t.weather?.type) {
        const weatherName = getWeatherName(t.weather.type);
        line += `[${weatherName}] `;
      }

      // Add screen information if present
      const allScreens = [...(t.myScreens || []), ...(t.enemyScreens || [])];
      if (allScreens.length > 0) {
        const screenNames = allScreens.map(s => {
          const name = getScreenName(s.type);
          const team = s.userTeam === 'my' ? 'Your' : 'Enemy';
          return `${name} (${team})`;
        }).join(', ');
        line += `[${screenNames}] `;
      }

      // Add Intimidate text if applicable
      if (c.intimidateUsed && c.intimidateUsed.length > 0) {
        const intimidateText = c.intimidateUsed
          .map(intim => {
            if (intim.effect === 'blocked') {
              return `${intim.user}'s Intimidate fails (${intim.target} has Inner Focus)`;
            } else if (intim.effect === 'defiant') {
              return `${intim.user}'s Intimidate triggers ${intim.target}'s Defiant (Attack +2)`;
            } else {
              return `${intim.user}'s Intimidate lowers ${intim.target}'s Attack`;
            }
          })
          .join(', ');
        line += `${intimidateText}; `;
      }

      line += `${att} use ${mv} on ${def}`;

      // For stat-changing moves
      if (c.isStatChange && c.statChanges && c.statChanges.length > 0) {
        const statText = c.statChanges.map(sc => {
          const statName = sc.stat === 'atk' ? 'Attack' 
            : sc.stat === 'def' ? 'Defense'
            : sc.stat === 'spatk' ? 'Sp. Attack'
            : sc.stat === 'spdef' ? 'Sp. Defense'
            : sc.stat === 'spd' ? 'Speed'
            : sc.stat;
          const direction = sc.stages > 0 ? 'raised' : 'lowered';
          const amount = Math.abs(sc.stages);
          return `${sc.target}'s ${statName} ${direction} by ${amount}`;
        }).join(', ');
        line += ` -> ${statText}`;
      } else if (c.isStatusMove && c.statusEffect) {
        // For status-inflicting moves
        const statusName = c.statusEffect === 'burn' ? 'burned'
          : c.statusEffect === 'par' ? 'paralyzed'
          : c.statusEffect === 'psn' ? 'poisoned'
          : c.statusEffect === 'tox' ? 'badly poisoned'
          : c.statusEffect === 'frz' ? 'frozen'
          : 'affected';
        
        if (c.statusCured) {
          line += ` -> ${def} was ${statusName} but cured by berry`;
        } else {
          line += ` -> ${def} was ${statusName}`;
        }
      } else {
        // For damaging moves
        const hpStr =
          typeof c.finalHP === 'number' && typeof c.maxHP === 'number'
            ? `${c.finalHP}/${c.maxHP} (${c.finalPct}%)`
            : `${c.finalPct}%`;

        let suffix = `-> ${def} has ${hpStr} remaining health`;

        if (c.berryUsedName) {
          suffix += ` after consuming ${c.berryUsedName} berry`;
        }
        if (c.eotType && typeof c.eotLossPct === 'number' && c.eotLossPct > 0) {
          const word = c.eotType === 'burn' ? 'burn' : 'poison';
          suffix += ` after ${word} damage of ${c.eotLossPct}%`;
        }
        if (typeof c.weatherLossPct === 'number' && c.weatherLossPct > 0) {
          const weatherName = t.weather?.type === 'hail' ? 'hail' : 'sandstorm';
          suffix += ` after ${weatherName} damage of ${c.weatherLossPct}%`;
        }

        line += ` ${suffix}`;
      }

      // Add Sand Spit trigger note
      if (c.sandSpitTriggered) {
        line += ` (${def}'s Sand Spit triggered Sandstorm!)`;
      }

      lines.push(line);
    });

    if (!lines.length) {
      alert('No applied turns to export.');
      return;
    }

    const content = lines.join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().replace(/[:T]/g, '-').split('.')[0];
    a.href = url;
    a.download = `plan_${date}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Helper to format stat change messages
  function formatStatChangeMessage(targetName: string, changes: StatChange[]): string {
    if (changes.length === 0) return '';
    
    if (changes.length === 1) {
      const change = changes[0];
      const statName = formatStatName(change.stat);
      const direction = change.stages > 0 ? 'rose' : 'fell';
      const amount = Math.abs(change.stages) > 1 ? ' sharply' : '';
      return `${targetName}'s ${statName}${amount} ${direction}!`;
    }
    
    // Multiple stat changes
    const parts = changes.map(change => {
      const statName = formatStatName(change.stat);
      const direction = change.stages > 0 ? '+' : '';
      return `${statName} ${direction}${change.stages}`;
    });
    
    return `${targetName}: ${parts.join(', ')}`;
  }

  // Helper to format Intimidate effects
  function formatIntimidateMessage(effects: Array<{ user: string; target: string; effect: 'normal' | 'blocked' | 'defiant' }>): string {
    return effects.map(eff => {
      if (eff.effect === 'blocked') {
        return `${eff.user}'s Intimidate fails (${eff.target} has Inner Focus)`;
      } else if (eff.effect === 'defiant') {
        return `${eff.user}'s Intimidate triggers ${eff.target}'s Defiant (Attack +2)`;
      } else {
        return `${eff.user}'s Intimidate lowers ${eff.target}'s Attack`;
      }
    }).join(', ');
  }

  // Helper to format status move messages
  function formatStatusMoveMessage(targetName: string, status: 'burn' | 'psn' | 'tox' | 'par' | 'frz', cured: boolean): string {
    const statusText = status === 'burn' ? 'burned'
      : status === 'par' ? 'paralyzed'
      : status === 'psn' ? 'poisoned'
      : status === 'tox' ? 'badly poisoned'
      : status === 'frz' ? 'frozen'
      : 'affected';

    if (cured) {
      return `${targetName} was ${statusText} but cured by berry!`;
    } else {
      return `${targetName} was ${statusText}!`;
    }
  }

  function formatStatName(stat: 'atk' | 'def' | 'spatk' | 'spdef' | 'spd'): string {
    switch (stat) {
      case 'atk': return 'Attack';
      case 'def': return 'Defense';
      case 'spatk': return 'Sp. Atk';
      case 'spdef': return 'Sp. Def';
      case 'spd': return 'Speed';
    }
  }

  function formatScreenSetupMessage(turnLine: TurnLine): string {
    // Extract the move name from the turn text
    const parsed = parseActionFromLine(turnLine.text);
    if (!parsed) return 'Screen set up!';
    
    const moveName = parsed.move;
    const screenType = getScreenFromMove(moveName);
    if (!screenType) return 'Screen set up!';
    
    const screenName = getScreenName(screenType);
    return `${screenName} was set up!`;
  }

  const myCollection = dicts.mySpecies;

  return (
    <div className="min-h-screen w-full flex flex-col items-center bg-neutral-950 text-neutral-100 p-6" style={{fontFamily:'Inter, ui-sans-serif, system-ui'}}>
      <div className="w-full max-w-6xl">
        <header className="mb-4">
          <h1 className="text-3xl font-bold tracking-tight">Poke Fight Planner</h1>
          <p className="text-neutral-400">Upload sets, pick generation, build teams, plan turns, and apply rolls (with status & items).</p>
        </header>

        {/* Tab Bar */}
        <div className="flex gap-1 bg-neutral-900 rounded-xl p-1 mb-6 w-fit">
          <button
            onClick={() => setActiveTab('editor')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === 'editor'
                ? 'bg-neutral-700 text-white'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
            }`}
          >
            Team Editor
          </button>
          <button
            onClick={() => setActiveTab('planner')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === 'planner'
                ? 'bg-neutral-700 text-white'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
            }`}
          >
            Planner
          </button>
        </div>

        {/* Uploads + Generation (shared between tabs) */}
        <section className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-neutral-800 p-4 bg-neutral-900/40 md:col-span-2">
            <h2 className="text-sm font-semibold mb-3">Upload sets</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-neutral-400 mb-1">myteam.txt</div>
                <FilePicker
                  label="myteam.txt"
                  onFileText={(text)=>setMyText(text)}
                  onClear={()=>{ setMyText(''); setMyTeam(Array(6).fill(undefined) as any); }}
                  currentText={myText}
                />
              </div>
              <div>
                <div className="text-xs text-neutral-400 mb-1">enemytrainer.txt</div>
                <FilePicker
                  label="enemytrainer.txt"
                  onFileText={(text)=>setEnemyText(text)}
                  onClear={()=>{ setEnemyText(''); setEnemyTeam([]); }}
                  currentText={enemyText}
                />
              </div>
            </div>
            <p className="text-xs text-neutral-500 mt-2">
              Drag Pokémon from your collection (parsed from <code>myteam.txt</code>) into “My Team”. Enemy team auto-fills (≤6) from <code>enemytrainer.txt</code>.
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 p-4 bg-neutral-900/40">
            <h2 className="text-sm font-semibold mb-2">Generation</h2>
            <select
              value={gen}
              onChange={(e)=>setGen(Number(e.target.value))}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm"
            >
              {[9,8,7,6,5,4,3,2,1].map(g => <option key={g} value={g}>Gen {g}</option>)}
            </select>

            <div className="mt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={runAndBun}
                  onChange={(e) => setRunAndBun(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-700 bg-neutral-800"
                />
                <span className="text-sm text-neutral-300">
                  Run and Bun <span className="text-neutral-500">(weather lasts indefinitely)</span>
                </span>
              </label>
            </div>
          </div>
        </section>

        {/* Team Editor Tab */}
        {activeTab === 'editor' && (
          <TeamEditor myText={myText} gen={gen} onMyTextChange={setMyText} />
        )}

        {/* Planner Tab */}
        {activeTab === 'planner' && (
          <>
        {/* Collection */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 mb-6">
          <div className="text-xs text-neutral-400 mb-2">Your collection</div>
          <div className="flex flex-wrap gap-1">
            {myCollection.map((name) => (
              <div
                key={name}
                draggable
                onDragStart={e => {
                  e.dataTransfer.setData('text/plain', name);
                  const img = e.currentTarget.querySelector('img');
                  if (img) e.dataTransfer.setDragImage(img, 16, 16);
                }}
                className="cursor-grab active:cursor-grabbing rounded-lg hover:bg-neutral-800 p-1 transition"
                title={name}
              >
                <PokemonIcon name={name} size={40} />
              </div>
            ))}
          </div>
        </div>

        {/* Teams */}
        <section className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <TeamBox
            title="My Team"
            subtitle="Drag from your collection → slots"
            members={myTeam}
            editable
            onRemove={(idx) => setMyTeam(prev => { const next=[...prev]; next[idx]=undefined as any; return next; })}
            onDropToSlot={(idx, name) => addToMyTeam(idx, name)}
            onChangeStatus={onChangeStatus}
            onChangeItem={onChangeItem}
            onChangeHP={onChangeHP}
          />
          <TeamBox
            title="Enemy Team"
            subtitle="Auto-filled from enemytrainer.txt"
            members={enemyTeam}
          />
        </section>

        {/* Planner */}
        <section className="rounded-2xl border border-neutral-800 p-4 bg-neutral-900/40">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">Planner</h2>
              <div className="flex items-center gap-1 bg-neutral-800 rounded-lg p-0.5">
                <button
                  onClick={() => setBattleMode('singles')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    battleMode === 'singles'
                      ? 'bg-blue-600 text-white'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  Singles
                </button>
                <button
                  onClick={() => setBattleMode('doubles')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    battleMode === 'doubles'
                      ? 'bg-blue-600 text-white'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  Doubles
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={addTurn} className="rounded-xl px-3 py-2 bg-emerald-600 hover:bg-emerald-500 transition text-sm font-semibold shadow">
                + Add Turn
              </button>
              <button onClick={exportLines} className="rounded-xl px-3 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 transition text-sm font-semibold shadow">
                Export Lines
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {turns.map((t, idx) => {
              const rollOpts = t.useCrit
                ? (t.result?.rollOptionsCrit ?? [0])
                : (t.result?.rollOptionsNormal ?? [0]);
              const selectedIdx = Math.max(0, Math.min((t.selectedRollIndex ?? 0), rollOpts.length - 1));

              return (
                <div key={t.id} className="flex items-stretch gap-3">
                  {/* Left column now has a small "-" delete button before the "Turn N:" label */}
                  <div className="w-32 shrink-0 flex items-center justify-end pr-1 gap-2">
                    <button
                      onClick={() => deleteTurn(idx)}
                      className="h-6 w-6 inline-flex items-center justify-center rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-sm"
                      title="Delete turn"
                      aria-label="Delete turn"
                    >
                      –
                    </button>
                    {/* Weather symbol */}
                    {t.weather?.type && (
                      <span className="text-lg" title={getWeatherName(t.weather.type)}>
                        {getWeatherSymbol(t.weather.type)}
                      </span>
                    )}
                    {/* Screen symbols */}
                    {t.myScreens?.map((screen, sIdx) => (
                      <span 
                        key={`my-${sIdx}`} 
                        className="text-sm" 
                        title={getScreenDescription(screen)}
                      >
                        {getScreenSymbol(screen.type)}
                      </span>
                    ))}
                    {t.enemyScreens?.map((screen, sIdx) => (
                      <span 
                        key={`enemy-${sIdx}`} 
                        className="text-sm opacity-70" 
                        title={getScreenDescription(screen)}
                      >
                        {getScreenSymbol(screen.type)}
                      </span>
                    ))}
                    <div className="text-sm font-semibold text-neutral-300">Turn {idx+1}:</div>
                  </div>

                  {/* Query editor - sized to fit layout */}
                  <div className="w-[420px] rounded-xl border border-neutral-800 bg-neutral-900/60 shadow-inner relative z-10">
                    <QueryEditor
                      value={t.text}
                      onChange={(v)=>onEditorChange(idx, v)}
                      dicts={dicts}
                      heightPx={72}
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => doCalc(idx)}
                      disabled={t.loading}
                      className="h-9 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500 font-semibold text-sm transition shadow"
                    >
                      {t.loading ? '...' : 'Calc'}
                    </button>
                    <div className="flex gap-1 text-[10px]">
                      <label className="flex items-center gap-0.5 cursor-pointer whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={!!t.attackerFirstTurnOut}
                          onChange={(e) => setTurns(prev => prev.map((x, j) => j === idx ? { ...x, attackerFirstTurnOut: e.target.checked } : x))}
                          className="w-3 h-3"
                        />
                        <span className="text-neutral-400">P1 first</span>
                      </label>
                      <label className="flex items-center gap-0.5 cursor-pointer whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={!!t.defenderFirstTurnOut}
                          onChange={(e) => setTurns(prev => prev.map((x, j) => j === idx ? { ...x, defenderFirstTurnOut: e.target.checked } : x))}
                          className="w-3 h-3"
                        />
                        <span className="text-neutral-400">P2 first</span>
                      </label>
                    </div>
                  </div>

                  {/* Roll selector + Crit toggle + Run + Undo OR Stat Change Message */}
                  <div className="w-[620px] shrink-0">
                    {t.error && <div className="h-[44px] flex items-center text-xs text-red-400">{t.error}</div>}
                    {t.result && !t.error && (
                      <>
                        {/* Intimidate effects message (shown for all result types) */}
                        {t.result.intimidateEffects && t.result.intimidateEffects.length > 0 && (
                          <div className="mb-1 text-xs px-2 py-1 rounded bg-purple-900/30 border border-purple-700/30 text-purple-200">
                            {formatIntimidateMessage(t.result.intimidateEffects)}
                          </div>
                        )}

                        {t.result.isStatChange ? (
                          // Stat change or screen setup display
                          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                            <div className="h-[44px] flex items-center text-sm px-4 rounded-xl bg-neutral-800/50 border border-neutral-700">
                              {(t.result.statChanges ?? []).length === 0 
                                ? formatScreenSetupMessage(t)
                                : formatStatChangeMessage(t.result.target ?? '', t.result.statChanges ?? [])}
                            </div>

                            <RunButton
                              onClick={() => applySelectedRoll(idx)}
                              disabled={!!t.runApplied}
                            />

                            <UndoButton
                              onClick={() => undoRun(idx)}
                              disabled={!t.runApplied}
                            />
                          </div>
                        ) : t.result.isStatusMove ? (
                          // Status move display
                          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                            <div className="h-[44px] flex items-center text-sm px-4 rounded-xl bg-neutral-800/50 border border-neutral-700">
                              {formatStatusMoveMessage(t.result.target ?? '', t.result.statusEffect!, t.result.berryCured ?? false)}
                            </div>

                            <RunButton
                              onClick={() => applySelectedRoll(idx)}
                              disabled={!!t.runApplied}
                            />

                            <UndoButton
                              onClick={() => undoRun(idx)}
                              disabled={!t.runApplied}
                            />
                          </div>
                        ) : (
                          // Normal damage roll display
                          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2">
                            <RollSlider
                              label={t.useCrit ? 'Crit Rolls' : 'Normal Rolls'}
                              options={rollOpts}
                              selectedIndex={selectedIdx}
                              onChange={(vi) => setTurns(prev => prev.map((x, j) => j === idx ? { ...x, selectedRollIndex: vi } : x))}
                            />

                            <CritToggleButton
                              active={!!t.useCrit}
                              onToggle={() => setTurns(prev => prev.map((x, j) => j === idx
                                ? { ...x, useCrit: !x.useCrit, selectedRollIndex: 0 }
                                : x))}
                            />

                            <RunButton
                              onClick={() => applySelectedRoll(idx)}
                              disabled={!!t.runApplied}
                            />

                            <UndoButton
                              onClick={() => undoRun(idx)}
                              disabled={!t.runApplied}
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
          </>
        )}

        <footer className="text-xs text-neutral-500 mt-6">
          <p>Berries (including pinch berries) auto-consume when thresholds are reached; Undo restores the pre-run state for that turn. Use ▶ to apply the selected roll, ↩ to undo, and the small “–” to delete a turn.</p>
        </footer>
      </div>
    </div>
  );
}
