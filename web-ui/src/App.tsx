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

/* ===================== Local types ===================== */

type BerryState = { name: string; consumed: boolean };

type StatStages = {
  atk: number;
  def: number;
  spatk: number;
  spdef: number;
  spd: number;
};

type MemberEx = TeamMember & {
  berry?: BerryState;
  status?: StatusState;
  statStages?: StatStages;
};

type AppliedChange = {
  team: 'my' | 'enemy';
  index: number;
  name: string;
  prevPct: number;
  prevCurHP?: number;
  prevMaxHP?: number;
  prevBerry?: BerryState | undefined;
  prevStatus?: StatusState | undefined;
  prevItem?: string | undefined;
  prevStatStages?: StatStages | undefined;
};

type TeamSnapshot = {
  my: (MemberEx | undefined)[];
  enemy: (MemberEx | undefined)[];
  weather?: WeatherState | null;
  myScreens?: ScreenState[];
  enemyScreens?: ScreenState[];
};

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

  // What we mutated on "Run" so we can undo
  appliedChanges?: AppliedChange[];

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

  // Turn state snapshots (before first Calc for this turn, and after Run)
  startSnapshot?: TeamSnapshot;
  endSnapshot?: TeamSnapshot;

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
  // Uploads + gen
  const [myText, setMyText] = useState('');
  const [enemyText, setEnemyText] = useState('');
  const [gen, setGen] = useState<number>(9);
  const [runAndBun, setRunAndBun] = useState<boolean>(false); // Weather lasts indefinitely if true
  const [battleMode, setBattleMode] = useState<'singles' | 'doubles'>('singles'); // Battle format

  const dicts = useMemo<Dictionaries>(() => buildDictionaries(myText, enemyText), [myText, enemyText]);

  // Teams – global state (turns apply mutations here)
  const [myTeam, setMyTeam] = useState<MemberEx[]>(Array(6).fill(undefined) as any);
  const [enemyTeam, setEnemyTeam] = useState<MemberEx[]>([]);

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

  function setMemberByLoc(
    loc: { team: 'my'|'enemy'; index: number },
    updater: (cur: MemberEx | undefined) => MemberEx | undefined
  ) {
    if (loc.team === 'enemy') {
      setEnemyTeam(p => { const n=[...p]; n[loc.index]=updater(n[loc.index]); return n; });
    } else {
      setMyTeam(p => { const n=[...p]; n[loc.index]=updater(n[loc.index]); return n; });
    }
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
  const [turns, setTurns] = useState<TurnLine[]>([{ id: 1, text: '', appliedChanges: [] }]);
  const onEditorChange = (i: number, v: string) =>
    setTurns(p => p.map((t, idx) => (idx === i ? { ...t, text: v } : t)));
  const addTurn = () =>
    setTurns(p => [...p, { id: p.length + 1, text: '', appliedChanges: [] }]);

  // Snapshot helpers
  const cloneMember = (m?: MemberEx) =>
    m
      ? {
          ...m,
          berry: m.berry ? { ...m.berry } : undefined,
          status: m.status ? { ...m.status } : undefined,
          statStages: m.statStages ? { ...m.statStages } : undefined,
        }
      : undefined;

  const cloneSnapshot = (snapshot?: TeamSnapshot): TeamSnapshot => ({
    my: (snapshot?.my || []).map(cloneMember),
    enemy: (snapshot?.enemy || []).map(cloneMember),
    weather: snapshot?.weather ? { ...snapshot.weather } : undefined,
    myScreens: snapshot?.myScreens ? [...snapshot.myScreens] : undefined,
    enemyScreens: snapshot?.enemyScreens ? [...snapshot.enemyScreens] : undefined,
  });

  // Restore teams from a snapshot
  const restoreFromSnapshot = (snapshot: TeamSnapshot, turnIndex?: number) => {
    setMyTeam(snapshot.my.map(cloneMember));
    setEnemyTeam(snapshot.enemy.map(cloneMember));
    
    // Restore weather and screens to the turn
    if (typeof turnIndex === 'number') {
      setTurns(prev => prev.map((x, idx) => idx === turnIndex ? {
        ...x,
        weather: snapshot.weather,
        myScreens: snapshot.myScreens,
        enemyScreens: snapshot.enemyScreens,
      } : x));
    }
  };

  // Get the start snapshot for a turn (from previous turn's end or initial state)
  const getStartSnapshotForTurn = (turnIndex: number): TeamSnapshot => {
    if (turnIndex === 0) {
      // First turn - use current state or create fresh snapshot
      const t = turns[0];
      if (t.startSnapshot) return cloneSnapshot(t.startSnapshot);
      return {
        my: myTeam.map(cloneMember),
        enemy: enemyTeam.map(cloneMember),
      };
    }
    
    // For subsequent turns, use the previous turn's end snapshot
    const prevTurn = turns[turnIndex - 1];
    if (prevTurn?.endSnapshot) {
      return cloneSnapshot(prevTurn.endSnapshot);
    }
    
    // Fallback to previous turn's start snapshot
    if (prevTurn?.startSnapshot) {
      return cloneSnapshot(prevTurn.startSnapshot);
    }
    
    // Last resort - current team state
    return {
      my: myTeam.map(cloneMember),
      enemy: enemyTeam.map(cloneMember),
    };
  };

  // Undo (revert the mutations of this specific turn)
  function undoRun(i: number) {
    const t = turns[i];
    if (!t.runApplied) return;

    // Restore to this turn's start snapshot
    if (t.startSnapshot) {
      restoreFromSnapshot(t.startSnapshot, i);
    }

    // Clear run state and end snapshot for this turn
    // For turn 1, also clear startSnapshot so manual changes can be made and recaptured
    setTurns(prev => prev.map((x, idx) => idx === i
      ? { 
          ...x, 
          appliedChanges: [], 
          chosen: undefined, 
          runApplied: false, 
          endSnapshot: undefined,
          startSnapshot: i === 0 ? undefined : x.startSnapshot  // Clear turn 1's snapshot
        }
      : x));
    
    // Clear the next turn's start snapshot since this turn's end is now invalid
    if (i + 1 < turns.length) {
      setTurns(prev => prev.map((x, idx) => idx === i + 1
        ? { ...x, startSnapshot: undefined }
        : x));
    }
  }


  // Calc handler
  async function doCalc(i: number) {
    const t = turns[i];
    const base = parseActionFromLine(t.text);
    if (!base) {
      setTurns(prev => prev.map((x, idx) => idx === i ? { ...x, result: undefined, error: 'Line grammar: "<pokemon> use <move> on <pokemon>"' } : x));
      return;
    }

    // STEP 1: Get or create the start snapshot for this turn
    let startSnap = t.startSnapshot;
    
    // Special handling for Turn 1: if it hasn't been run yet, always capture current state as baseline
    // This allows users to manually edit HP, items, and status on their team before the first calc
    // Each subsequent calc before the first run will recapture any manual changes
    if (i === 0 && !t.runApplied) {
      startSnap = {
        my: myTeam.map(cloneMember),
        enemy: enemyTeam.map(cloneMember),
        weather: t.weather,
        myScreens: t.myScreens,
        enemyScreens: t.enemyScreens,
      };
      // Store the snapshot
      setTurns(prev => prev.map((x, idx) => idx === i ? { ...x, startSnapshot: startSnap } : x));
    } else if (!startSnap) {
      // For other turns or after turn 1 is run, use the standard snapshot logic
      startSnap = getStartSnapshotForTurn(i);
      // Store the snapshot
      setTurns(prev => prev.map((x, idx) => idx === i ? { ...x, startSnapshot: startSnap } : x));
    }

    // STEP 2: Restore teams to the start snapshot (this is KEY - resets state every Calc)
    restoreFromSnapshot(startSnap, i);
    
    // Wait for state to update
    await new Promise(resolve => setTimeout(resolve, 0));

    const attackerCanon = resolveCanonicalName(base.attacker, dicts) ?? base.attacker;
    const defenderCanon = resolveCanonicalName(base.defender, dicts) ?? base.defender;

    // Get current state from teams (which have been restored to startSnapshot)
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
          startSnapshot: x.startSnapshot ?? {
            my: myTeam.map(cloneMember),
            enemy: enemyTeam.map(cloneMember),
            weather: currentWeather,
            myScreens,
            enemyScreens,
          },
          endSnapshot: undefined,
          appliedChanges: [],
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
      if (t.attackerFirstTurnOut && attackerAbility?.toLowerCase() === 'intimidate') {
        const defAbilityLower = defenderAbility?.toLowerCase();
        if (defAbilityLower !== 'inner focus') {
          // Apply the stat change (either Intimidate or Defiant)
          setMemberByLoc(defenderLoc as any, cur => {
            const existing = cur ?? ({ name: defenderCanon, pct: 100 } as MemberEx);
            const currentStages = existing.statStages ?? { atk: 0, def: 0, spatk: 0, spdef: 0, spd: 0 };
            return {
              ...existing,
              statStages: {
                ...currentStages,
                atk: defAbilityLower === 'defiant'
                  ? Math.min(6, currentStages.atk + 2)  // Defiant raises Attack by 2
                  : Math.max(-6, currentStages.atk - 1), // Normal Intimidate lowers by 1
              },
            };
          });
        }
      }
      
      if (t.defenderFirstTurnOut && defenderAbility?.toLowerCase() === 'intimidate') {
        const atkAbilityLower = attackerAbility?.toLowerCase();
        if (atkAbilityLower !== 'inner focus') {
          // Apply the stat change (either Intimidate or Defiant)
          setMemberByLoc(attackerLoc as any, cur => {
            const existing = cur ?? ({ name: attackerCanon, pct: 100 } as MemberEx);
            const currentStages = existing.statStages ?? { atk: 0, def: 0, spatk: 0, spdef: 0, spd: 0 };
            return {
              ...existing,
              statStages: {
                ...currentStages,
                atk: atkAbilityLower === 'defiant'
                  ? Math.min(6, currentStages.atk + 2)  // Defiant raises Attack by 2
                  : Math.max(-6, currentStages.atk - 1), // Normal Intimidate lowers by 1
              },
            };
          });
        }
      }

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
          startSnapshot: x.startSnapshot ?? {
            my: myTeam.map(cloneMember),
            enemy: enemyTeam.map(cloneMember),
            weather: currentWeather,
            myScreens,
            enemyScreens,
          },
          endSnapshot: undefined,
          appliedChanges: [],
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
          startSnapshot: x.startSnapshot ?? {
            my: myTeam.map(cloneMember),
            enemy: enemyTeam.map(cloneMember),
            weather: currentWeather,
            myScreens,
            enemyScreens,
          },
          endSnapshot: undefined,
          appliedChanges: [],
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
        // Keep startSnapshot if already set, otherwise ensure it
        startSnapshot: x.startSnapshot ?? {
          my: myTeam.map(cloneMember),
          enemy: enemyTeam.map(cloneMember),
          weather: currentWeather,
          myScreens,
          enemyScreens,
        },
        endSnapshot: undefined,
        appliedChanges: [],
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

    // Track Intimidate usage for export
    const intimidateUsed: Array<{ user: string; target: string; effect: 'normal' | 'blocked' | 'defiant' }> = [];
    const attackerCanon = resolveCanonicalName(attackerName, dicts) ?? attackerName;
    const defenderCanon = resolveCanonicalName(defenderName, dicts) ?? defenderName;
    const attackerAbility = dicts.myAbilityBySpecies[attackerCanon] || dicts.enemyAbilityBySpecies[attackerCanon];
    const defenderAbility = dicts.myAbilityBySpecies[defenderCanon] || dicts.enemyAbilityBySpecies[defenderCanon];

    if (t.attackerFirstTurnOut && attackerAbility?.toLowerCase() === 'intimidate') {
      const defAbilityLower = defenderAbility?.toLowerCase();
      const effect = defAbilityLower === 'inner focus' ? 'blocked'
        : defAbilityLower === 'defiant' ? 'defiant'
        : 'normal';
      intimidateUsed.push({ user: attackerName, target: defenderName, effect });
    }
    if (t.defenderFirstTurnOut && defenderAbility?.toLowerCase() === 'intimidate') {
      const atkAbilityLower = attackerAbility?.toLowerCase();
      const effect = atkAbilityLower === 'inner focus' ? 'blocked'
        : atkAbilityLower === 'defiant' ? 'defiant'
        : 'normal';
      intimidateUsed.push({ user: defenderName, target: attackerName, effect });
    }

    // Handle stat-changing moves
    if (t.result.isStatChange && t.result.statChanges && t.result.target) {
      const targetCanon = resolveCanonicalName(t.result.target, dicts) ?? t.result.target;
      const loc = findMember(targetCanon);
      if (!loc.team) return;

      const prevStatStages = loc.member?.statStages ?? { atk: 0, def: 0, spatk: 0, spdef: 0, spd: 0 };
      const newStatStages = { ...prevStatStages };

      // Apply stat changes
      t.result.statChanges.forEach(change => {
        newStatStages[change.stat] = Math.max(-6, Math.min(6, newStatStages[change.stat] + change.stages));
      });

      // Apply the stat change
      setMemberByLoc(loc as any, cur => {
        const existing = cur ?? ({ name: targetCanon, pct: 100 } as MemberEx);
        return {
          ...existing,
          statStages: newStatStages,
        };
      });

      // Build stat change description for export
      const statChangeDescriptions = t.result.statChanges.map(change => ({
        stat: change.stat,
        stages: change.stages,
        target: targetCanon,
      }));

      // Mark as applied and save end snapshot
      setTimeout(() => {
        setTurns(prev => prev.map((x, idx) => {
          if (idx !== i) return x;
          return {
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
            endSnapshot: {
              my: myTeam.map(cloneMember),
              enemy: enemyTeam.map(cloneMember),
              weather: t.weather,
              myScreens: t.myScreens,
              enemyScreens: t.enemyScreens,
            }
          };
        }));
        
        // Initialize next turn's start snapshot
        setTurns(prev => {
          if (i + 1 >= prev.length) return prev;
          return prev.map((x, idx) => {
            if (idx !== i + 1) return x;
            const currentTurnEnd = prev[i].endSnapshot;
            if (!currentTurnEnd) return x;
            return {
              ...x,
              startSnapshot: cloneSnapshot(currentTurnEnd),
            };
          });
        });
      }, 50);
      return;
    }

    // Handle status-inflicting moves
    if (t.result.isStatusMove && t.result.statusEffect && t.result.target) {
      const targetCanon = resolveCanonicalName(t.result.target, dicts) ?? t.result.target;
      const loc = findMember(targetCanon);
      if (!loc.team) return;

      const prevStatus = loc.member?.status;
      const prevBerry = loc.member?.berry;
      const prevItem = loc.member?.item;

      // Check if berry cures the status
      const berryCures = t.result.berryCured;
      
      if (!berryCures) {
        // Apply the status
        const newStatus: StatusState = t.result.statusEffect === 'tox'
          ? { type: 'tox', toxicStage: 1 }
          : { type: t.result.statusEffect as StatusType };

        setMemberByLoc(loc as any, cur => {
          const existing = cur ?? ({ name: targetCanon, pct: 100 } as MemberEx);
          return {
            ...existing,
            status: newStatus,
          };
        });
      } else {
        // Berry cures the status - consume the berry
        setMemberByLoc(loc as any, cur => {
          const existing = cur ?? ({ name: targetCanon, pct: 100 } as MemberEx);
          return {
            ...existing,
            berry: prevBerry ? { ...prevBerry, consumed: true } : undefined,
          };
        });
      }

      // Mark as applied and save end snapshot
      setTimeout(() => {
        setTurns(prev => prev.map((x, idx) => {
          if (idx !== i) return x;
          return {
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
              statusCured: berryCures,
              intimidateUsed: intimidateUsed.length > 0 ? intimidateUsed : undefined,
            },
            appliedChanges: [{
              team: loc.team!,
              index: loc.index,
              name: targetCanon,
              prevPct: loc.member?.pct ?? 100,
              prevCurHP: loc.member?.curHP,
              prevMaxHP: loc.member?.maxHP,
              prevBerry,
              prevStatus,
              prevItem,
            }],
            endSnapshot: {
              my: myTeam.map(cloneMember),
              enemy: enemyTeam.map(cloneMember),
              weather: t.weather,
              myScreens: t.myScreens,
              enemyScreens: t.enemyScreens,
            }
          };
        }));
        
        // Initialize next turn's start snapshot
        setTurns(prev => {
          if (i + 1 >= prev.length) return prev;
          return prev.map((x, idx) => {
            if (idx !== i + 1) return x;
            const currentTurnEnd = prev[i].endSnapshot;
            if (!currentTurnEnd) return x;
            return {
              ...x,
              startSnapshot: cloneSnapshot(currentTurnEnd),
            };
          });
        });
      }, 50);
      return;
    }

    const { defender, defenderMaxHP } = t.result;
    const defCanon = resolveCanonicalName(defender, dicts) ?? defender;

    const loc = findMember(defCanon);
    if (!loc.team) return;

    const prevPct    = loc.member?.pct ?? 100;
    const prevMaxHP  = loc.member?.maxHP;
    const prevCurHP  = loc.member?.curHP;
    const prevBerry  = loc.member?.berry;
    const prevStatus = loc.member?.status;
    const prevItem   = loc.member?.item;

    const options = (t.useCrit ? t.result.rollOptionsCrit : t.result.rollOptionsNormal) ?? [0];
    const selectedIdx = Math.max(0, Math.min((t.selectedRollIndex ?? 0), options.length - 1));
    const selectedDamageHP = Math.max(0, Math.round(options[selectedIdx] ?? 0));

    const maxHP = typeof defenderMaxHP === 'number' && defenderMaxHP > 0
      ? defenderMaxHP
      : (typeof prevMaxHP === 'number' ? prevMaxHP : undefined);

    if (typeof maxHP !== 'number') return;

    let curHPNow: number = typeof prevCurHP === 'number'
      ? prevCurHP
      : Math.max(0, Math.round((prevPct / 100) * maxHP));

    let postHP = Math.max(0, curHPNow - selectedDamageHP);
    let postPct = Math.max(0, Math.round((postHP / maxHP) * 100));

    // Check for Sand Spit ability - triggers sandstorm when taking damage
    let sandSpitTriggered = false;
    if (selectedDamageHP > 0) {
      const defenderAbility = dicts.myAbilityBySpecies[defCanon] || dicts.enemyAbilityBySpecies[defCanon];
      if (isSandSpitAbility(defenderAbility)) {
        sandSpitTriggered = true;
        // Update weather for this turn and all subsequent turns
        const newWeather: WeatherState = {
          type: 'sandstorm',
          turnsRemaining: getWeatherDuration(runAndBun),
          startedOnTurn: i + 1,
        };
        setTurns(prev => prev.map((turn, idx) => {
          if (idx === i) {
            // Update current turn
            return { ...turn, weather: newWeather };
          } else if (idx > i) {
            // Update subsequent turns if they don't have their own weather-setting ability/move
            return { ...turn, weather: newWeather };
          }
          return turn;
        }));
      }
    }

    let berry = prevBerry;
    let heldBerryName: string | undefined =
      (berry && !berry.consumed) ? berry.name : normalizeBerryName(loc.member?.item);
    const rule = inferBerryRule(heldBerryName, gen);
    let berryUsedName: string | undefined;

    // Berry trigger (Oran, Sitrus, pinch berries)
    if (rule && postPct <= rule.thresholdPct) {
      const healHP = rule.kind === 'heal-flat'
        ? rule.healHP
        : Math.round((rule.healPct / 100) * maxHP);
      postHP = Math.min(maxHP, postHP + healHP);
      postPct = Math.max(0, Math.round((postHP / maxHP) * 100));

      if (heldBerryName) {
        if (berry && berry.name.toLowerCase() === heldBerryName.toLowerCase()) {
          berry = { ...berry, consumed: true };
        } else if (prevBerry == null) {
          berry = { name: heldBerryName, consumed: true };
        }
        berryUsedName = heldBerryName;
      }
    }

    // End-of-turn residual AFTER berry
    let newStatus = prevStatus;
    if (t.result.appliesStatus) newStatus = t.result.appliesStatus;

    let finalPct = postPct;
    let finalStatus = newStatus;
    let eotLossPct: number | undefined;
    let weatherLossPct: number | undefined;
    
    // Apply status damage
    if (newStatus) {
      const e = applyEndOfTurnResidual(finalPct, maxHP, newStatus);
      eotLossPct = e.lossPct > 0 ? e.lossPct : undefined;
      finalPct = e.nextPct;
      if (newStatus.type === 'tox') {
        const stage = (newStatus.toxicStage ?? 1) + 1;
        finalStatus = { type: 'tox', toxicStage: stage };
      }
    }

    // Apply weather damage (Hail/Sandstorm)
    // Note: This is a simplified version - full implementation would check type immunity
    // (Ice immune to Hail, Rock/Steel/Ground immune to Sandstorm)
    if (t.weather?.type && (t.weather.type === 'hail' || t.weather.type === 'sandstorm')) {
      const weatherDamage = getWeatherDamage(t.weather.type);
      if (weatherDamage > 0) {
        weatherLossPct = weatherDamage;
        finalPct = Math.max(0, finalPct - weatherDamage);
      }
    }

    const finalHP = Math.max(0, Math.round((finalPct / 100) * maxHP));

    // Commit to the team slot
    setMemberByLoc(loc as any, cur => {
      const existing = cur ?? ({ name: defCanon, pct: 100 } as MemberEx);
      return {
        ...existing,
        pct: Math.round(finalPct),
        maxHP: maxHP ?? existing.maxHP,
        curHP: finalHP,
        berry,
        status: finalStatus,
      };
    });

    // Save "chosen" snapshot + applied change (for precise undo)
    setTurns(prev => prev.map((x, idx) => {
      if (idx !== i) return x;
      const applied = x.appliedChanges ?? [];
      let eotType: 'burn' | 'poison' | undefined;
      if (newStatus?.type === 'burn') eotType = 'burn';
      if (newStatus?.type === 'psn' || newStatus?.type === 'tox') eotType = 'poison';

      return {
        ...x,
        runApplied: true,
        chosen: {
          attacker: attackerName || '',
          move: moveName || '',
          defender: defenderName || defCanon,
          finalPct: Math.round(finalPct),
          finalHP,
          maxHP,
          berryUsedName,
          eotType,
          eotLossPct,
          weatherLossPct,
          sandSpitTriggered,
          intimidateUsed: intimidateUsed.length > 0 ? intimidateUsed : undefined,
        },
        appliedChanges: [
          ...applied,
          {
            team: loc.team!, index: loc.index, name: defCanon,
            prevPct, prevCurHP, prevMaxHP, prevBerry, prevStatus, prevItem
          }
        ]
      };
    }));

    // Create end snapshot after state updates (this becomes next turn's start snapshot)
    setTimeout(() => {
      setTurns(prev => prev.map((x, idx) => {
        if (idx !== i) return x;
        return {
          ...x,
          endSnapshot: {
            my: myTeam.map(cloneMember),
            enemy: enemyTeam.map(cloneMember),
            weather: x.weather,
            myScreens: x.myScreens,
            enemyScreens: x.enemyScreens,
          }
        };
      }));
      
      // Initialize next turn's start snapshot from this turn's end
      setTurns(prev => {
        if (i + 1 >= prev.length) return prev; // No next turn
        return prev.map((x, idx) => {
          if (idx !== i + 1) return x;
          // Set next turn's start snapshot to current turn's end snapshot
          const currentTurnEnd = prev[i].endSnapshot;
          if (!currentTurnEnd) return x;
          return {
            ...x,
            startSnapshot: cloneSnapshot(currentTurnEnd),
          };
        });
      });
    }, 50);
  }

  // Delete turn (revert if needed, then remove)
  function deleteTurn(i: number) {
    const t = turns[i];

    // If this turn was applied, restore to its start snapshot first
    if (t.runApplied && t.startSnapshot) {
      restoreFromSnapshot(t.startSnapshot, i);
    }

    // Remove the turn
    setTurns(prev => prev.filter((_, idx) => idx !== i));
    
    // Recalculate snapshots for subsequent turns
    setTimeout(() => {
      setTurns(prev => prev.map((turn, idx) => {
        if (idx < i) return turn; // Turns before deleted turn are unaffected
        // Turns after need their start snapshot recalculated
        const startSnap = getStartSnapshotForTurn(idx);
        return { ...turn, startSnapshot: startSnap };
      }));
    }, 100);
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
        <header className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Poke Fight Planner</h1>
          <p className="text-neutral-400">Upload sets, pick generation, build teams, plan turns, and apply rolls (with status & items).</p>
        </header>

        {/* Uploads + Generation */}
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

        {/* Collection */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 mb-6">
          <div className="text-xs text-neutral-400 mb-2">Your collection</div>
          <div className="text-sm leading-7">
            {myCollection.map((name, idx) => (
              <span key={name}>
                <span
                  draggable
                  onDragStart={e => e.dataTransfer.setData('text/plain', name)}
                  className="cursor-grab active:cursor-grabbing underline decoration-neutral-600 decoration-dotted"
                >
                  {name}
                </span>
                {idx < myCollection.length - 1 ? <span className="text-neutral-500">, </span> : null}
              </span>
            ))}
          </div>
        </div>

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
                              disabled={!t.runApplied || !(t.appliedChanges && t.appliedChanges.length)}
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
                              disabled={!t.runApplied || !(t.appliedChanges && t.appliedChanges.length)}
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
                              disabled={!t.runApplied || !(t.appliedChanges && t.appliedChanges.length)}
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

        <footer className="text-xs text-neutral-500 mt-6">
          <p>Berries (including pinch berries) auto-consume when thresholds are reached; Undo restores the pre-run state for that turn. Use ▶ to apply the selected roll, ↩ to undo, and the small “–” to delete a turn.</p>
        </footer>
      </div>
    </div>
  );
}
