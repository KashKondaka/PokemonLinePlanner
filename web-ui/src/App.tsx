// src/App.tsx
import React, { useEffect, useMemo, useState } from 'react';

import TeamBox from './components/TeamBox';
import FilePicker from './components/FilePicker';
import PokemonIcon from './components/PokemonIcon';
import TeamEditor from './components/TeamEditor';
import FlyoutPanel from './components/FlyoutPanel';
import TrainerSelector, { type TrainerEntry } from './components/TrainerSelector';
import TurnCard, { type Turn, type SubAction, type EotSummaryData } from './components/TurnCard';
import MatchupFinder from './components/MatchupFinder';
import RiskReportModal from './components/RiskReportModal';

import { buildDictionaries, type Dictionaries } from './logic/parsers';
import { inferBerryRule, normalizeBerryName } from './logic/hpMath';
import {
  inferStatusFromMove,
  makeInitialStatus,
  type StatusType,
  type StatusState,
} from './logic/status';
import {
  resolveCanonicalName,
  normalizeEnemyTrainerTextForBackend,
  uniqSortedWithZero,
  fetchPokemonStatsFromAPI,
} from './logic/helpers';
import {
  type WeatherState,
  getWeatherFromMove,
  getWeatherFromAbility,
  isSandSpitAbility,
  getWeatherDuration,
  getWeatherSymbol,
  advanceWeather,
} from './logic/weather';
import {
  type ScreenState,
  getScreenFromMove,
  getScreenSymbol,
  advanceScreen,
  SCREEN_DURATION,
} from './logic/screens';
import {
  type MemberEx,
  type GameState,
  type GameAction,
  type DamageAction,
  type StatChangeAction,
  type StatusMoveAction,
  type EndOfTurnAction,
  type EndOfTurnEffect,
  type IntimidateEffect,
  cloneMember,
  computeDamageEffects,
  replayAll,
} from './logic/gameState';

type StatChange = {
  stat: 'atk' | 'def' | 'spatk' | 'spdef' | 'spd';
  stages: number;
  target: 'self' | 'opponent';
};

/* ===================== App ===================== */

export default function App() {
  const [activeTab, setActiveTab] = useState<'editor' | 'planner' | 'matchup'>('planner');

  const [myText, setMyText] = useState('');
  const [enemyText, setEnemyText] = useState('');
  const [gen, setGen] = useState<number>(9);
  const [runAndBun, setRunAndBun] = useState<boolean>(false);
  const [battleMode, setBattleMode] = useState<'singles' | 'doubles'>('singles');
  const [selectedTrainer, setSelectedTrainer] = useState<TrainerEntry | null>(null);

  const dicts = useMemo<Dictionaries>(() => buildDictionaries(myText, enemyText), [myText, enemyText]);

  const [baseMyTeam, setMyTeam] = useState<MemberEx[]>(Array(6).fill(undefined) as any);
  const [baseEnemyTeam, setEnemyTeam] = useState<MemberEx[]>([]);

  const [initialState, setInitialState] = useState<GameState | null>(null);
  const [actionLog, setActionLog] = useState<GameAction[]>([]);

  const derivedState = useMemo<GameState | null>(
    () => initialState ? replayAll(initialState, actionLog) : null,
    [initialState, actionLog]
  );

  const myTeam = (derivedState?.myTeam ?? baseMyTeam) as MemberEx[];
  const enemyTeam = (derivedState?.enemyTeam ?? baseEnemyTeam) as MemberEx[];

  // Prefill enemy team when enemyText changes
  useEffect(() => {
    const init = dicts.enemySpecies.slice(0, 6).map(name => {
      const item = dicts.enemyItemBySpecies[name];
      const norm = normalizeBerryName(item);
      const rule = inferBerryRule(norm, gen);
      return {
        name, pct: 100, maxHP: undefined, curHP: undefined, item,
        berry: rule ? { name: rule.name, consumed: false } : undefined,
        status: undefined,
        statStages: { atk: 0, def: 0, spatk: 0, spdef: 0, spd: 0 },
      } as MemberEx;
    });
    setEnemyTeam(init);

    init.forEach(async (member, idx) => {
      if (member?.name) {
        const stats = await fetchPokemonStatsFromAPI(member.name, myText, enemyText, gen);
        if (typeof stats.maxHP === 'number' || typeof stats.speed === 'number') {
          setEnemyTeam(prev => {
            const next = [...prev];
            if (next[idx]) {
              next[idx] = {
                ...next[idx]!,
                ...(typeof stats.maxHP === 'number' ? { maxHP: stats.maxHP, curHP: stats.maxHP } : {}),
                ...(typeof stats.speed === 'number' ? { speed: stats.speed } : {}),
              };
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
    const alreadyInSlot = myTeam.findIndex(m => m?.name?.toLowerCase() === species.toLowerCase());
    if (alreadyInSlot !== -1 && alreadyInSlot !== slotIndex) return;
    const item = dicts.myItemBySpecies[species];
    const norm = normalizeBerryName(item);
    const rule = inferBerryRule(norm, gen);
    setMyTeam(prev => {
      const next = [...prev];
      next[slotIndex] = {
        name: species, pct: 100, maxHP: undefined, curHP: undefined, item,
        berry: rule ? { name: rule.name, consumed: false } : undefined,
        status: undefined,
        statStages: { atk: 0, def: 0, spatk: 0, spdef: 0, spd: 0 },
      };
      return next;
    });
    const stats = await fetchPokemonStatsFromAPI(species, myText, enemyText, gen);
    if (typeof stats.maxHP === 'number' || typeof stats.speed === 'number') {
      setMyTeam(prev => {
        const next = [...prev];
        if (next[slotIndex]?.name === species) {
          next[slotIndex] = {
            ...next[slotIndex]!,
            ...(typeof stats.maxHP === 'number' ? { maxHP: stats.maxHP, curHP: stats.maxHP } : {}),
            ...(typeof stats.speed === 'number' ? { speed: stats.speed } : {}),
          };
        }
        return next;
      });
    }
  }

  function resetAllRuns() {
    if (!initialState) return;
    setMyTeam(initialState.myTeam.map(cloneMember) as MemberEx[]);
    setEnemyTeam(initialState.enemyTeam.map(cloneMember) as MemberEx[]);
    setInitialState(null);
    setActionLog([]);
    setTurns(prev => prev.map(t => ({
      ...t,
      playerAction: { ...t.playerAction, runApplied: false, chosen: undefined },
      enemyAction: { ...t.enemyAction, runApplied: false, chosen: undefined },
    })));
  }

  const onChangeStatus = (index: number, statusType: StatusType | undefined) => {
    resetAllRuns();
    setMyTeam(prev => {
      const next = [...prev]; const cur = next[index]; if (!cur) return prev;
      next[index] = { ...cur, status: statusType ? { type: statusType } : undefined };
      return next;
    });
  };

  const onChangeItem = (index: number, item: string | undefined) => {
    resetAllRuns();
    setMyTeam(prev => {
      const next = [...prev]; const cur = next[index]; if (!cur) return prev;
      const norm = normalizeBerryName(item);
      const rule = inferBerryRule(norm, gen);
      next[index] = { ...cur, item, berry: rule ? { name: rule.name, consumed: false } : undefined };
      return next;
    });
  };

  const onChangeEnemyStatus = (index: number, statusType: StatusType | undefined) => {
    resetAllRuns();
    setEnemyTeam(prev => {
      const next = [...prev]; const cur = next[index]; if (!cur) return prev;
      next[index] = { ...cur, status: statusType ? { type: statusType } : undefined };
      return next;
    });
  };

  const onChangeEnemyItem = (index: number, item: string | undefined) => {
    resetAllRuns();
    setEnemyTeam(prev => {
      const next = [...prev]; const cur = next[index]; if (!cur) return prev;
      const norm = normalizeBerryName(item);
      const rule = inferBerryRule(norm, gen);
      next[index] = { ...cur, item, berry: rule ? { name: rule.name, consumed: false } : undefined };
      return next;
    });
  };

  const onChangeHP = (index: number, curHP: number, maxHP: number) => {
    setMyTeam(prev => {
      const next = [...prev]; const cur = next[index]; if (!cur) return prev;
      next[index] = { ...cur, curHP, maxHP, pct: Math.round((curHP / maxHP) * 100) };
      return next;
    });
  };

  // Trainer selection handler
  function handleTrainerSelect(trainer: TrainerEntry, text: string) {
    setSelectedTrainer(trainer);
    setEnemyText(text);
    setInitialState(null);
    setActionLog([]);
    setTurns([{ id: 1, playerAction: emptySubAction(), enemyAction: emptySubAction() }]);
  }

  // --- Turns (new paired model) ---
  const emptySubAction = (): SubAction => ({ type: 'attack' });

  const [turns, setTurns] = useState<Turn[]>([{
    id: 1,
    playerAction: emptySubAction(),
    enemyAction: emptySubAction(),
  }]);

  function addTurn() {
    const prevTurn = turns[turns.length - 1];
    if (!prevTurn) {
      setTurns(p => [...p, { id: p.length + 1, playerAction: emptySubAction(), enemyAction: emptySubAction() }]);
      return;
    }

    // Determine active Pokemon from the previous turn
    let myActive: { name: string; source: 'my' | 'enemy' } | null = null;
    let enemyActive: { name: string; source: 'my' | 'enemy' } | null = null;

    const pa = prevTurn.playerAction;
    const ea = prevTurn.enemyAction;

    if (pa.type === 'switch' && pa.switchTo && pa.switchSource) {
      if (pa.switchSource === 'my') myActive = { name: pa.switchTo, source: 'my' };
      else enemyActive = { name: pa.switchTo, source: 'enemy' };
    } else if (pa.attackerName && pa.attackerSource) {
      if (pa.attackerSource === 'my') myActive = { name: pa.attackerName, source: 'my' };
      else enemyActive = { name: pa.attackerName, source: 'enemy' };
    }

    if (ea.type === 'switch' && ea.switchTo && ea.switchSource) {
      if (ea.switchSource === 'enemy') enemyActive = { name: ea.switchTo, source: 'enemy' };
      else myActive = myActive || { name: ea.switchTo, source: 'my' };
    } else if (ea.attackerName && ea.attackerSource) {
      if (ea.attackerSource === 'enemy') enemyActive = enemyActive || { name: ea.attackerName, source: 'enemy' };
      else myActive = myActive || { name: ea.attackerName, source: 'my' };
    }

    if (!enemyActive && pa.defenderName && pa.defenderSource === 'enemy') {
      enemyActive = { name: pa.defenderName, source: 'enemy' };
    }
    if (!myActive && pa.defenderName && pa.defenderSource === 'my') {
      myActive = { name: pa.defenderName, source: 'my' };
    }
    if (!myActive && ea.defenderName && ea.defenderSource === 'my') {
      myActive = { name: ea.defenderName, source: 'my' };
    }
    if (!enemyActive && ea.defenderName && ea.defenderSource === 'enemy') {
      enemyActive = { name: ea.defenderName, source: 'enemy' };
    }

    if (!myActive || !enemyActive) {
      setTurns(p => [...p, { id: p.length + 1, playerAction: emptySubAction(), enemyAction: emptySubAction() }]);
      return;
    }

    const effectiveSpeed = (member: MemberEx | undefined) => {
      const base = member?.speed ?? 0;
      const stage = member?.statStages?.spd ?? 0;
      const s = Math.max(-6, Math.min(6, stage));
      const multiplier = s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
      let spd = base * multiplier;
      if (member?.status?.type === 'par') spd *= 0.5;
      return spd;
    };
    const myMember = [...myTeam, ...enemyTeam].find(
      m => m?.name?.toLowerCase() === myActive!.name.toLowerCase()
    );
    const enemyMember = [...myTeam, ...enemyTeam].find(
      m => m?.name?.toLowerCase() === enemyActive!.name.toLowerCase()
    );
    const mySpeed = effectiveSpeed(myMember);
    const enemySpeed = effectiveSpeed(enemyMember);

    const myAlive = (myMember?.pct ?? 0) > 0;
    const enemyAlive = (enemyMember?.pct ?? 0) > 0;

    if (!myAlive || !enemyAlive) {
      setTurns(p => [...p, { id: p.length + 1, playerAction: emptySubAction(), enemyAction: emptySubAction() }]);
      return;
    }

    const faster = mySpeed >= enemySpeed ? myActive : enemyActive;
    const slower = mySpeed >= enemySpeed ? enemyActive : myActive;

    const row1: SubAction = {
      type: 'attack',
      attackerName: faster.name,
      attackerSource: faster.source,
      defenderName: slower.name,
      defenderSource: slower.source,
    };
    const row2: SubAction = {
      type: 'attack',
      attackerName: slower.name,
      attackerSource: slower.source,
      defenderName: faster.name,
      defenderSource: faster.source,
    };

    setTurns(p => [...p, { id: p.length + 1, playerAction: row1, enemyAction: row2 }]);

    const newTurnIdx = turns.length;
    if (faster.source === 'enemy') {
      fetchAiProbs(newTurnIdx, 'player', faster.name, slower.name);
    }
    if (slower.source === 'enemy') {
      fetchAiProbs(newTurnIdx, 'enemy', slower.name, faster.name);
    }
    fetchMoveDamageRanges(newTurnIdx, 'player', faster.name, slower.name);
    fetchMoveDamageRanges(newTurnIdx, 'enemy', slower.name, faster.name);
  }

  function findActivePlayerPokemon(turnIdx: number): string | null {
    for (let i = turnIdx; i >= 0; i--) {
      const pa = turns[i].playerAction;
      if (pa.attackerName && pa.attackerSource === 'my') return pa.attackerName;
    }
    return null;
  }

  async function fetchAiProbs(turnIdx: number, side: 'player' | 'enemy', enemyName: string, playerName: string) {
    try {
      const enemyCanon = resolveCanonicalName(enemyName, dicts) ?? enemyName;
      const playerCanon = resolveCanonicalName(playerName, dicts) ?? playerName;
      const eMoves = dicts.movesBySpecies[enemyCanon] ?? dicts.movesBySpecies[enemyName] ?? [];
      const pMoves = dicts.movesBySpecies[playerCanon] ?? dicts.movesBySpecies[playerName] ?? [];
      if (eMoves.length === 0) return;

      const resp = await fetch('/api/ai-move-dist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gen, myPokemon: playerCanon, enemyPokemon: enemyCanon,
          myMoves: pMoves.slice(0, 4), enemyMoves: eMoves.slice(0, 4),
          myText, enemyText: normalizeEnemyTrainerTextForBackend(enemyText),
        }),
      });
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.moveProbs) {
        setTurns(p => p.map((t, i) => {
          if (i !== turnIdx) return t;
          const key = side === 'player' ? 'playerAction' : 'enemyAction';
          return { ...t, [key]: { ...t[key], aiMoveProbs: data.moveProbs } };
        }));
      }
    } catch { /* silently fail - AI probs are non-critical */ }
  }

  async function fetchMoveDamageRanges(turnIdx: number, side: 'player' | 'enemy', attackerName: string, defenderName: string) {
    try {
      const attackerCanon = resolveCanonicalName(attackerName, dicts) ?? attackerName;
      const defenderCanon = resolveCanonicalName(defenderName, dicts) ?? defenderName;
      const moves = getMovesForPokemon(attackerCanon).slice(0, 4);
      if (moves.length === 0) return;

      const enemyTextForBackend = normalizeEnemyTrainerTextForBackend(enemyText);
      const resp = await fetch('/api/calc-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gen, myText, enemyText: enemyTextForBackend,
          attacker: attackerCanon, defender: defenderCanon,
          moves,
        }),
      });
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.results) {
        setTurns(p => p.map((t, i) => {
          if (i !== turnIdx) return t;
          const key = side === 'player' ? 'playerAction' : 'enemyAction';
          return { ...t, [key]: { ...t[key], moveDamageRanges: data.results } };
        }));
      }
    } catch { /* non-critical */ }
  }

  function updateSubAction(turnIdx: number, side: 'player' | 'enemy', update: Partial<SubAction>) {
    setTurns(prev => prev.map((t, i) => {
      if (i !== turnIdx) return t;
      const key = side === 'player' ? 'playerAction' : 'enemyAction';
      const prev_action = t[key];
      const updated = { ...prev_action, ...update };

      const attackerChanged = updated.attackerName !== prev_action.attackerName;
      const defenderChanged = updated.defenderName !== prev_action.defenderName;

      if (attackerChanged || defenderChanged) {
        updated.moveDamageRanges = undefined;
      }

      // Trigger AI probability fetch when enemy is attacker and both pokemon are placed
      if (updated.attackerSource === 'enemy' && updated.attackerName && updated.defenderName) {
        fetchAiProbs(turnIdx, side, updated.attackerName, updated.defenderName);
      }

      // Trigger damage preview for all moves when both attacker and defender are placed
      if (updated.attackerName && updated.defenderName && !updated.moveDamageRanges) {
        fetchMoveDamageRanges(turnIdx, side, updated.attackerName, updated.defenderName);
      }

      // Trigger switch-in score recalc when enemy toggles to switch, or
      // when the player side changes attacker while enemy is already in switch mode
      const enemyAction = side === 'enemy' ? updated : t.enemyAction;
      const playerAction = side === 'player' ? updated : t.playerAction;
      const enemyJustToggled = side === 'enemy' && updated.type === 'switch' && prev_action.type !== 'switch';
      const playerAttackerChanged = side === 'player' && attackerChanged && enemyAction.type === 'switch';
      if (enemyJustToggled || playerAttackerChanged) {
        const playerPoke = playerAction.attackerSource === 'my' ? playerAction.attackerName : null;
        if (playerPoke) fetchSwitchScores(turnIdx, playerPoke);
      }

      return { ...t, [key]: updated };
    }));
  }

  async function fetchSwitchScores(tidx: number, playerPokemon: string) {
    const playerCanon = resolveCanonicalName(playerPokemon, dicts) ?? playerPokemon;
    try {
      const resp = await fetch('/api/switch-scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gen, playerPokemon: playerCanon,
          myText, enemyText: normalizeEnemyTrainerTextForBackend(enemyText),
        }),
      });
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.scores) {
        setTurns(p => p.map((t, i) => {
          if (i !== tidx) return t;
          return { ...t, enemyAction: { ...t.enemyAction, switchScores: data.scores } };
        }));
      }
    } catch { /* non-critical */ }
  }

  function getMovesForPokemon(name: string | undefined): string[] {
    if (!name) return [];
    const canon = resolveCanonicalName(name, dicts) ?? name;
    return dicts.movesBySpecies[canon] ?? dicts.movesBySpecies[name] ?? [];
  }

  function getMemberInfo(name: string | undefined, source: 'my' | 'enemy' | undefined) {
    if (!name) return undefined;
    const team = source === 'my' ? myTeam : source === 'enemy' ? enemyTeam : [...myTeam, ...enemyTeam];
    const m = (Array.isArray(team) ? team : []).find(m => m?.name?.toLowerCase() === name.toLowerCase());
    if (!m) return undefined;
    return { name: m.name, pct: m.pct, curHP: m.curHP, maxHP: m.maxHP };
  }

  // --- Calc for a sub-action ---
  async function doSubCalc(turnIdx: number, side: 'player' | 'enemy') {
    const turn = turns[turnIdx];
    const action = side === 'player' ? turn.playerAction : turn.enemyAction;
    if (!action.attackerName || !action.moveName || !action.defenderName) return;

    const attackerCanon = resolveCanonicalName(action.attackerName, dicts) ?? action.attackerName;
    const defenderCanon = resolveCanonicalName(action.defenderName, dicts) ?? action.defenderName;

    const defenderLoc = findMember(defenderCanon);
    const attackerLoc = findMember(attackerCanon);
    const currentPct = defenderLoc.member?.pct ?? 100;
    const currentStatus = defenderLoc.member?.status;
    const appliedType = inferStatusFromMove(action.moveName);
    const appliesStatus = appliedType ? makeInitialStatus(appliedType) : null;

    updateSubAction(turnIdx, side, { loading: true, error: null });

    try {
      const enemyTextForBackend = normalizeEnemyTrainerTextForBackend(enemyText);

      let attackerStatStages = { ...(attackerLoc.member?.statStages ?? { atk: 0, def: 0, spatk: 0, spdef: 0, spd: 0 }) };
      let defenderStatStages = { ...(defenderLoc.member?.statStages ?? { atk: 0, def: 0, spatk: 0, spdef: 0, spd: 0 }) };

      const attackerAbility = dicts.myAbilityBySpecies[attackerCanon] || dicts.enemyAbilityBySpecies[attackerCanon];
      const defenderAbility = dicts.myAbilityBySpecies[defenderCanon] || dicts.enemyAbilityBySpecies[defenderCanon];

      if (action.attackerFirstTurnOut && attackerAbility?.toLowerCase() === 'intimidate') {
        const defAb = defenderAbility?.toLowerCase();
        if (defAb === 'defiant') defenderStatStages.atk = Math.min(6, defenderStatStages.atk + 2);
        else if (defAb !== 'inner focus') defenderStatStages.atk = Math.max(-6, defenderStatStages.atk - 1);
      }
      if (action.defenderFirstTurnOut && defenderAbility?.toLowerCase() === 'intimidate') {
        const atkAb = attackerAbility?.toLowerCase();
        if (atkAb === 'defiant') attackerStatStages.atk = Math.min(6, attackerStatStages.atk + 2);
        else if (atkAb !== 'inner focus') attackerStatStages.atk = Math.max(-6, attackerStatStages.atk - 1);
      }

      let currentWeather: WeatherState | null = null;
      if (turnIdx > 0 && turns[turnIdx - 1].weather) {
        currentWeather = advanceWeather(turns[turnIdx - 1].weather);
      }
      if (action.attackerFirstTurnOut && attackerAbility) {
        const aw = getWeatherFromAbility(attackerAbility);
        if (aw) currentWeather = { type: aw, turnsRemaining: getWeatherDuration(runAndBun), startedOnTurn: turnIdx + 1 };
      }
      if (action.defenderFirstTurnOut && defenderAbility) {
        const dw = getWeatherFromAbility(defenderAbility);
        if (dw) currentWeather = { type: dw, turnsRemaining: getWeatherDuration(runAndBun), startedOnTurn: turnIdx + 1 };
      }
      const moveWeather = getWeatherFromMove(action.moveName);
      if (moveWeather) currentWeather = { type: moveWeather, turnsRemaining: getWeatherDuration(runAndBun), startedOnTurn: turnIdx + 1 };

      let myScreens: ScreenState[] = [];
      let enemyScreens: ScreenState[] = [];
      if (turnIdx > 0 && turns[turnIdx - 1].myScreens) {
        myScreens = turns[turnIdx - 1].myScreens!.map(advanceScreen).filter((s): s is ScreenState => s !== null);
      }
      if (turnIdx > 0 && turns[turnIdx - 1].enemyScreens) {
        enemyScreens = turns[turnIdx - 1].enemyScreens!.map(advanceScreen).filter((s): s is ScreenState => s !== null);
      }

      const screenType = getScreenFromMove(action.moveName);
      if (screenType) {
        const attackerIsMyTeam = action.attackerSource === 'my';
        const newScreen: ScreenState = { type: screenType, userTeam: attackerIsMyTeam ? 'my' : 'enemy', turnsRemaining: SCREEN_DURATION, startedOnTurn: turnIdx + 1 };
        if (attackerIsMyTeam) { myScreens = myScreens.filter(s => s.type !== screenType); myScreens.push(newScreen); }
        else { enemyScreens = enemyScreens.filter(s => s.type !== screenType); enemyScreens.push(newScreen); }

        updateSubAction(turnIdx, side, {
          loading: false, error: null,
          result: {
            defender: defenderCanon, lowPct: 0, highPct: 0, critPct: 0,
            isStatChange: true, statChanges: [], target: attackerCanon,
            screenSetUp: { type: screenType, turnsRemaining: SCREEN_DURATION, user: attackerCanon },
          },
          runApplied: false, chosen: undefined,
        });
        setTurns(prev => prev.map((t, i) => i === turnIdx ? { ...t, weather: currentWeather, myScreens, enemyScreens } : t));
        return;
      }

      const attackerIsMyTeam = action.attackerSource === 'my';
      const screensAffecting = attackerIsMyTeam ? enemyScreens : myScreens;

      const resp = await fetch('/api/calc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          myText, enemyText: enemyTextForBackend,
          attacker: attackerCanon, move: action.moveName, defender: defenderCanon, gen,
          weather: currentWeather?.type,
          screens: screensAffecting, battleMode,
          overrides: {
            attacker: { statStages: attackerStatStages, status: attackerLoc.member?.status?.type },
            defender: { statStages: defenderStatStages, status: defenderLoc.member?.status?.type },
          },
        }),
      });
      if (!resp.ok) throw new Error(await resp.text() || `HTTP ${resp.status}`);
      const data: any = await resp.json();

      // Build intimidate effects for display
      const intimidateEffects: Array<{ user: string; target: string; effect: string }> = [];
      if (action.attackerFirstTurnOut && attackerAbility?.toLowerCase() === 'intimidate') {
        const defAb = defenderAbility?.toLowerCase();
        const effect = defAb === 'inner focus' ? 'blocked' : defAb === 'defiant' ? 'defiant' : 'normal';
        intimidateEffects.push({ user: attackerCanon, target: defenderCanon, effect });
      }
      if (action.defenderFirstTurnOut && defenderAbility?.toLowerCase() === 'intimidate') {
        const atkAb = attackerAbility?.toLowerCase();
        const effect = atkAb === 'inner focus' ? 'blocked' : atkAb === 'defiant' ? 'defiant' : 'normal';
        intimidateEffects.push({ user: defenderCanon, target: attackerCanon, effect });
      }

      if (data.isStatChange) {
        updateSubAction(turnIdx, side, {
          loading: false, error: null,
          result: { defender: defenderCanon, lowPct: 0, highPct: 0, critPct: 0, isStatChange: true, statChanges: data.statChanges, target: data.target, intimidateEffects: intimidateEffects.length ? intimidateEffects : undefined },
          runApplied: false, chosen: undefined,
        });
        setTurns(prev => prev.map((t, i) => i === turnIdx ? { ...t, weather: currentWeather, myScreens, enemyScreens } : t));
        return;
      }

      if (data.isStatusMove) {
        const targetCanon = resolveCanonicalName(data.target, dicts) ?? data.target;
        const targetLoc = findMember(targetCanon);
        const targetBerry = targetLoc.member?.item;
        const cureMap: Record<string, string[]> = {
          'burn': ['Lum Berry', 'Rawst Berry'], 'par': ['Lum Berry', 'Cheri Berry'],
          'psn': ['Lum Berry', 'Pecha Berry'], 'tox': ['Lum Berry', 'Pecha Berry'],
          'frz': ['Lum Berry', 'Aspear Berry'],
        };
        const berryCures = targetBerry && (cureMap[data.status] ?? []).some(b => targetBerry.toLowerCase().includes(b.toLowerCase().replace(' berry', '')));

        updateSubAction(turnIdx, side, {
          loading: false, error: null,
          result: { defender: targetCanon, lowPct: 0, highPct: 0, critPct: 0, isStatusMove: true, statusEffect: data.status, target: targetCanon, berryCured: !!berryCures, berryUsed: berryCures ? targetBerry : undefined, intimidateEffects: intimidateEffects.length ? intimidateEffects : undefined },
          runApplied: false, chosen: undefined,
        });
        setTurns(prev => prev.map((t, i) => i === turnIdx ? { ...t, weather: currentWeather, myScreens, enemyScreens } : t));
        return;
      }

      const r = data.remaining;
      const defMaxHP = data.defenderMaxHP;
      const dmgLowPct = 100 - r.highPct;
      const dmgHighPct = 100 - r.lowPct;
      const dmgCritPct = 100 - r.critPct;
      const postLowPct = Math.max(0, Math.round(currentPct - dmgLowPct));
      const postHighPct = Math.max(0, Math.round(currentPct - dmgHighPct));
      const postCritPct = Math.max(0, Math.round(currentPct - dmgCritPct));
      const toHP = (pct: number) => typeof defMaxHP === 'number' ? Math.max(0, Math.round((pct / 100) * defMaxHP)) : undefined;

      const normalRaw = data?.debug?.rolls?.normal ?? [];
      const critRaw = data?.debug?.rolls?.crit ?? [];

      updateSubAction(turnIdx, side, {
        loading: false, error: null,
        result: {
          defender: data.defender || defenderCanon,
          defenderMaxHP: defMaxHP,
          lowPct: postLowPct, lowHP: toHP(postLowPct),
          highPct: postHighPct, highHP: toHP(postHighPct),
          critPct: postCritPct, critHP: toHP(postCritPct),
          rawRollsNormal: normalRaw, rawRollsCrit: critRaw,
          rollOptionsNormal: uniqSortedWithZero(normalRaw),
          rollOptionsCrit: uniqSortedWithZero(critRaw),
          appliesStatus,
          intimidateEffects: intimidateEffects.length ? intimidateEffects : undefined,
        },
        useCrit: false, selectedRollIndex: 0, runApplied: false, chosen: undefined,
      });
      setTurns(prev => prev.map((t, i) => i === turnIdx ? { ...t, weather: currentWeather, myScreens, enemyScreens } : t));
    } catch (err: any) {
      updateSubAction(turnIdx, side, { loading: false, error: err?.message || String(err), result: undefined });
    }
  }

  // --- Run sub-action ---
  function runSubAction(turnIdx: number, side: 'player' | 'enemy') {
    const turn = turns[turnIdx];
    const action = side === 'player' ? turn.playerAction : turn.enemyAction;

    // Handle switch actions: mark as applied, then check EOT
    if (action.type === 'switch') {
      if (action.runApplied || !action.switchTo) return;
      updateSubAction(turnIdx, side, { runApplied: true });
      const otherSide = side === 'player' ? 'enemy' : 'player';
      const otherAction = otherSide === 'player' ? turn.playerAction : turn.enemyAction;
      if (otherAction.runApplied) {
        if (!initialState) {
          setInitialState({ myTeam: baseMyTeam.map(cloneMember), enemyTeam: baseEnemyTeam.map(cloneMember) });
        }
        const effectiveInitial = initialState ?? {
          myTeam: baseMyTeam.map(cloneMember),
          enemyTeam: baseEnemyTeam.map(cloneMember),
        };
        const postState = replayAll(effectiveInitial, actionLog);
        handleEndOfTurnEffects(turnIdx, turn, postState);
      }
      return;
    }

    if (!action.result || action.runApplied) return;

    const attackerName = action.attackerName ?? '';
    const moveName = action.moveName ?? '';
    const defenderName = action.defenderName ?? action.result.defender;

    const attackerCanon = resolveCanonicalName(attackerName, dicts) ?? attackerName;
    const defenderCanon = resolveCanonicalName(defenderName, dicts) ?? defenderName;
    const attackerAbility = dicts.myAbilityBySpecies[attackerCanon] || dicts.enemyAbilityBySpecies[attackerCanon];
    const defenderAbility = dicts.myAbilityBySpecies[defenderCanon] || dicts.enemyAbilityBySpecies[defenderCanon];

    const intimidateEffects: IntimidateEffect[] = [];
    if (action.attackerFirstTurnOut && attackerAbility?.toLowerCase() === 'intimidate') {
      const defLoc = findMember(defenderCanon);
      const defAb = defenderAbility?.toLowerCase();
      if (defAb === 'defiant' && defLoc.team) intimidateEffects.push({ targetTeam: defLoc.team, targetIndex: defLoc.index, stages: 2 });
      else if (defAb !== 'inner focus' && defLoc.team) intimidateEffects.push({ targetTeam: defLoc.team, targetIndex: defLoc.index, stages: -1 });
    }
    if (action.defenderFirstTurnOut && defenderAbility?.toLowerCase() === 'intimidate') {
      const atkLoc = findMember(attackerCanon);
      const atkAb = attackerAbility?.toLowerCase();
      if (atkAb === 'defiant' && atkLoc.team) intimidateEffects.push({ targetTeam: atkLoc.team, targetIndex: atkLoc.index, stages: 2 });
      else if (atkAb !== 'inner focus' && atkLoc.team) intimidateEffects.push({ targetTeam: atkLoc.team, targetIndex: atkLoc.index, stages: -1 });
    }

    if (!initialState) {
      setInitialState({ myTeam: baseMyTeam.map(cloneMember), enemyTeam: baseEnemyTeam.map(cloneMember) });
    }

    const actionKey = `turn-${turn.id}-${side}`;

    let builtAction: GameAction | null = null;

    if (action.result.isStatChange && action.result.statChanges && action.result.target) {
      const targetCanon = resolveCanonicalName(action.result.target, dicts) ?? action.result.target;
      const loc = findMember(targetCanon);
      if (!loc.team) return;
      const ga: StatChangeAction = {
        type: 'stat-change', turnIndex: turns.length * 2 + (side === 'enemy' ? 1 : 0),
        actionKey,
        targetTeam: loc.team, targetIndex: loc.index,
        statChanges: action.result.statChanges.map(sc => ({ stat: sc.stat, stages: sc.stages })),
        intimidateEffects: intimidateEffects.length ? intimidateEffects : undefined,
      };
      builtAction = ga;
      setActionLog(prev => [...prev, ga]);
      updateSubAction(turnIdx, side, {
        runApplied: true,
        chosen: { attacker: attackerName, move: moveName, defender: targetCanon, finalPct: loc.member?.pct ?? 100, isStatChange: true, statChanges: action.result!.statChanges, screenSetUp: action.result!.screenSetUp },
      });
    } else if (action.result.isStatusMove && action.result.statusEffect && action.result.target) {
      const targetCanon = resolveCanonicalName(action.result.target, dicts) ?? action.result.target;
      const loc = findMember(targetCanon);
      if (!loc.team) return;
      const ga: StatusMoveAction = {
        type: 'status-move', turnIndex: turns.length * 2 + (side === 'enemy' ? 1 : 0),
        actionKey,
        targetTeam: loc.team, targetIndex: loc.index,
        statusEffect: action.result.statusEffect as StatusType,
        berryCured: !!action.result.berryCured,
        intimidateEffects: intimidateEffects.length ? intimidateEffects : undefined,
      };
      builtAction = ga;
      setActionLog(prev => [...prev, ga]);
      updateSubAction(turnIdx, side, {
        runApplied: true,
        chosen: { attacker: attackerName, move: moveName, defender: targetCanon, finalPct: loc.member?.pct ?? 100, isStatusMove: true, statusEffect: action.result!.statusEffect },
      });
    } else {
      // Damage move
      const { defender, defenderMaxHP } = action.result;
      const defCanon = resolveCanonicalName(defender, dicts) ?? defender;
      const loc = findMember(defCanon);
      if (!loc.team) return;

      const options = (action.useCrit ? action.result.rollOptionsCrit : action.result.rollOptionsNormal) ?? [0];
      const selectedIdx = Math.max(0, Math.min((action.selectedRollIndex ?? 0), options.length - 1));
      const selectedDamageHP = Math.max(0, Math.round(options[selectedIdx] ?? 0));
      const maxHP = typeof defenderMaxHP === 'number' && defenderMaxHP > 0
        ? defenderMaxHP : (typeof loc.member?.maxHP === 'number' ? loc.member.maxHP : undefined);
      if (typeof maxHP !== 'number') return;

      const ga: DamageAction = {
        type: 'damage',
        turnIndex: turns.length * 2 + (side === 'enemy' ? 1 : 0),
        actionKey,
        targetTeam: loc.team, targetIndex: loc.index,
        damageHP: selectedDamageHP, defenderMaxHP: maxHP,
        appliesStatus: action.result.appliesStatus ?? undefined,
        weather: turns[turnIdx].weather, gen,
        intimidateEffects: intimidateEffects.length ? intimidateEffects : undefined,
      };
      builtAction = ga;
      setActionLog(prev => [...prev, ga]);

      const effects = computeDamageEffects(loc.member, ga);
      updateSubAction(turnIdx, side, {
        runApplied: true,
        chosen: {
          attacker: attackerName, move: moveName, defender: defCanon,
          finalPct: effects.finalPct, finalHP: effects.finalHP, maxHP: effects.maxHP,
          berryUsedName: effects.berryUsedName,
          eotType: effects.eotType, eotLossPct: effects.eotLossPct,
          weatherLossPct: effects.weatherLossPct,
        },
      });
    }

    // --- End-of-turn check ---
    if (!builtAction) return;
    const otherSide = side === 'player' ? 'enemy' : 'player';
    const otherAction = otherSide === 'player' ? turn.playerAction : turn.enemyAction;
    if (!otherAction.runApplied) return;

    if (!initialState) {
      setInitialState({ myTeam: baseMyTeam.map(cloneMember), enemyTeam: baseEnemyTeam.map(cloneMember) });
    }
    const effectiveInitial = initialState ?? {
      myTeam: baseMyTeam.map(cloneMember),
      enemyTeam: baseEnemyTeam.map(cloneMember),
    };
    const postState = replayAll(effectiveInitial, [...actionLog, builtAction]);
    handleEndOfTurnEffects(turnIdx, turn, postState);
  }

  function handleEndOfTurnEffects(turnIdx: number, turn: Turn, postState: GameState) {
    const playerAct = turn.playerAction;
    const enemyAct = turn.enemyAction;
    const playerActiveName = playerAct.type === 'switch' ? playerAct.switchTo : playerAct.attackerName;
    const enemyActiveName = enemyAct.type === 'switch' ? enemyAct.switchTo : enemyAct.attackerName;

    const eotEffects: EndOfTurnEffect[] = [];
    for (const [activeName, sideLabel] of [[playerActiveName, 'player'], [enemyActiveName, 'enemy']] as const) {
      if (!activeName) continue;
      const canon = resolveCanonicalName(activeName, dicts) ?? activeName;

      let foundTeam: 'my' | 'enemy' | null = null;
      let foundIdx = -1;
      let member: MemberEx | undefined;

      const eIdx = postState.enemyTeam.findIndex(m => m?.name?.toLowerCase() === canon.toLowerCase());
      if (eIdx !== -1) { foundTeam = 'enemy'; foundIdx = eIdx; member = postState.enemyTeam[eIdx] ?? undefined; }
      else {
        const mIdx = postState.myTeam.findIndex(m => m?.name?.toLowerCase() === canon.toLowerCase());
        if (mIdx !== -1) { foundTeam = 'my'; foundIdx = mIdx; member = postState.myTeam[mIdx] ?? undefined; }
      }

      if (!foundTeam || !member) continue;
      if (member.item?.toLowerCase() !== 'leftovers') continue;

      const mHP = member.maxHP ?? 0;
      const cHP = typeof member.curHP === 'number' ? member.curHP : Math.round(((member.pct ?? 100) / 100) * mHP);
      if (mHP <= 0 || cHP <= 0 || cHP >= mHP) continue;

      const healHP = Math.max(1, Math.floor(mHP / 16));
      eotEffects.push({ targetTeam: foundTeam, targetIndex: foundIdx, healHP, maxHP: mHP, source: 'leftovers', pokemonName: canon });

      setTurns(prev => prev.map((t, i) => {
        if (i !== turnIdx) return t;
        const key = sideLabel === 'player' ? 'playerAction' : 'enemyAction';
        const act = t[key];
        return { ...t, [key]: { ...act, chosen: { ...act.chosen, leftoversHealHP: healHP, leftoversTarget: canon } } };
      }));
    }

    if (eotEffects.length > 0) {
      const eotAction: EndOfTurnAction = {
        type: 'end-of-turn',
        actionKey: `turn-${turn.id}-eot`,
        turnIndex: turns.length * 2 + 2,
        effects: eotEffects,
      };
      setActionLog(prev => [...prev, eotAction]);
    }

    fetchNextTurnAiSuggestion(turnIdx, turn, postState);
  }

  async function fetchNextTurnAiSuggestion(turnIdx: number, turn: Turn, postState: GameState) {
    const playerAct = turn.playerAction;
    const enemyAct = turn.enemyAction;

    let myActiveName: string | undefined;
    let enemyActiveName: string | undefined;

    if (playerAct.attackerSource === 'my') {
      myActiveName = playerAct.attackerName;
      enemyActiveName = playerAct.defenderName;
    } else if (playerAct.attackerSource === 'enemy') {
      enemyActiveName = playerAct.attackerName;
      myActiveName = playerAct.defenderName;
    }
    if (enemyAct.attackerSource === 'enemy') {
      enemyActiveName = enemyActiveName || enemyAct.attackerName;
      myActiveName = myActiveName || enemyAct.defenderName;
    } else if (enemyAct.attackerSource === 'my') {
      myActiveName = myActiveName || enemyAct.attackerName;
      enemyActiveName = enemyActiveName || enemyAct.defenderName;
    }
    if (playerAct.type === 'switch' && playerAct.switchTo) myActiveName = playerAct.switchTo;
    if (enemyAct.type === 'switch' && enemyAct.switchTo) enemyActiveName = enemyAct.switchTo;

    if (!myActiveName || !enemyActiveName) return;

    const myCanon = resolveCanonicalName(myActiveName, dicts) ?? myActiveName;
    const enemyCanon = resolveCanonicalName(enemyActiveName, dicts) ?? enemyActiveName;
    const eMoves = dicts.movesBySpecies[enemyCanon] ?? dicts.movesBySpecies[enemyActiveName] ?? [];
    const pMoves = dicts.movesBySpecies[myCanon] ?? dicts.movesBySpecies[myActiveName] ?? [];
    if (eMoves.length === 0) return;

    // Use postState for accurate post-attack HP (React state may not have updated yet)
    const myMemberPost = [...postState.myTeam, ...postState.enemyTeam].find(
      m => m?.name?.toLowerCase() === myCanon.toLowerCase()
    );
    const enemyMemberPost = [...postState.myTeam, ...postState.enemyTeam].find(
      m => m?.name?.toLowerCase() === enemyCanon.toLowerCase()
    );
    const playerHPPct = myMemberPost?.pct ?? 100;
    const enemyHPPct = enemyMemberPost?.pct ?? 100;

    try {
      const resp = await fetch('/api/ai-move-dist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gen, myPokemon: myCanon, enemyPokemon: enemyCanon,
          myMoves: pMoves.slice(0, 4), enemyMoves: eMoves.slice(0, 4),
          myText, enemyText: normalizeEnemyTrainerTextForBackend(enemyText),
          playerHPPct, enemyHPPct,
        }),
      });
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.moveProbs && data.moveNames) {
        const probs: number[] = data.moveProbs;
        const names: string[] = data.moveNames;
        let bestIdx = 0;
        for (let i = 1; i < probs.length; i++) {
          if (probs[i] > probs[bestIdx]) bestIdx = i;
        }
        const summary: EotSummaryData = {
          nextAiMove: names[bestIdx] || undefined,
          nextAiProb: probs[bestIdx] ?? undefined,
          nextAiMoveProbs: probs,
          nextAiMoveNames: names,
          nextAiTarget: myCanon,
          nextAiTargetPct: playerHPPct,
        };
        setTurns(prev => prev.map((t, i) => i === turnIdx ? { ...t, eotSummary: summary } : t));
      }
    } catch { /* non-critical */ }
  }

  function undoSubAction(turnIdx: number, side: 'player' | 'enemy') {
    const turn = turns[turnIdx];
    const action = side === 'player' ? turn.playerAction : turn.enemyAction;
    if (!action.runApplied) return;

    const key = `turn-${turn.id}-${side}`;
    const eotKey = `turn-${turn.id}-eot`;
    const newLog = actionLog.filter(a => a.actionKey !== key && a.actionKey !== eotKey);
    setActionLog(newLog);

    if (newLog.length === 0 && initialState) {
      setMyTeam(initialState.myTeam.map(cloneMember) as MemberEx[]);
      setEnemyTeam(initialState.enemyTeam.map(cloneMember) as MemberEx[]);
      setInitialState(null);
    }

    updateSubAction(turnIdx, side, { runApplied: false, chosen: undefined });

    // Clear EOT summary and leftovers notes from the other side's chosen
    setTurns(prev => prev.map((t, i) => {
      if (i !== turnIdx) return t;
      let updated = { ...t, eotSummary: undefined };
      const otherSide: 'player' | 'enemy' = side === 'player' ? 'enemy' : 'player';
      const otherKey = otherSide === 'player' ? 'playerAction' : 'enemyAction';
      const otherChosen = t[otherKey].chosen;
      if (otherChosen?.leftoversHealHP) {
        const act = t[otherKey];
        const { leftoversHealHP, leftoversTarget, ...cleanChosen } = act.chosen as any;
        updated = { ...updated, [otherKey]: { ...act, chosen: cleanChosen } };
      }
      return updated;
    }));
  }

  function deleteTurn(i: number) {
    const turn = turns[i];
    if (!turn) return;

    const playerKey = `turn-${turn.id}-player`;
    const enemyKey = `turn-${turn.id}-enemy`;
    const eotKey = `turn-${turn.id}-eot`;
    const newLog = actionLog.filter(a => a.actionKey !== playerKey && a.actionKey !== enemyKey && a.actionKey !== eotKey);

    if (newLog.length !== actionLog.length) {
      setActionLog(newLog);
      if (newLog.length === 0 && initialState) {
        setMyTeam(initialState.myTeam.map(cloneMember) as MemberEx[]);
        setEnemyTeam(initialState.enemyTeam.map(cloneMember) as MemberEx[]);
        setInitialState(null);
      }
    }

    setTurns(prev => prev.filter((_, idx) => idx !== i));
  }

  function exportLines() {
    const summary: string[] = [];
    turns.forEach((t, idx) => {
      const n = idx + 1;
      for (const sideKey of ['playerAction', 'enemyAction'] as const) {
        const action = t[sideKey];
        const c = action.chosen;
        if (!c) continue;
        const sideLabel = sideKey === 'playerAction' ? 'P' : 'E';
        let line = `Turn ${n} [${sideLabel}]: ${c.attacker || '?'} use ${c.move || '?'} on ${c.defender || '?'}`;
        if (c.isStatChange && c.statChanges?.length) {
          const statText = c.statChanges.map(sc => `${sc.target} ${sc.stat} ${Number(sc.stages) > 0 ? '+' : ''}${sc.stages}`).join(', ');
          line += ` -> ${statText}`;
        } else if (c.isStatusMove && c.statusEffect) {
          line += ` -> ${c.defender} was ${c.statusEffect}${c.statusCured ? ' (cured by berry)' : ''}`;
        } else {
          const hpStr = typeof c.finalHP === 'number' && typeof c.maxHP === 'number'
            ? `${c.finalHP}/${c.maxHP} (${c.finalPct}%)` : `${c.finalPct}%`;
          line += ` -> ${c.defender} has ${hpStr} remaining`;
          if (c.berryUsedName) line += ` after consuming ${c.berryUsedName}`;
          if (c.leftoversHealHP && c.leftoversTarget) line += ` | ${c.leftoversTarget} healed ${c.leftoversHealHP} HP with Leftovers`;
        }
        summary.push(line);
      }
    });

    const saveData = {
      version: 1,
      savedAt: new Date().toISOString(),
      gen,
      battleMode,
      runAndBun,
      selectedTrainerId: selectedTrainer?.id ?? null,
      myText,
      enemyText,
      turns,
      actionLog,
    };

    const output = [
      '=== Poke Fight Planner Save ===',
      '',
      ...summary,
      '',
      '=== SAVE DATA (do not edit below) ===',
      JSON.stringify(saveData),
    ].join('\n');

    const blob = new Blob([output], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plan_${new Date().toISOString().replace(/[:T]/g, '-').split('.')[0]}.txt`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function importLines(fileText: string) {
    const marker = '=== SAVE DATA (do not edit below) ===';
    const markerIdx = fileText.indexOf(marker);
    if (markerIdx === -1) {
      alert('Invalid save file: no save data found.');
      return;
    }
    const jsonStr = fileText.slice(markerIdx + marker.length).trim();
    let saveData: any;
    try {
      saveData = JSON.parse(jsonStr);
    } catch {
      alert('Invalid save file: could not parse save data.');
      return;
    }
    if (!saveData.version || !saveData.turns) {
      alert('Invalid save file: missing required fields.');
      return;
    }

    if (saveData.gen) setGen(saveData.gen);
    if (saveData.battleMode) setBattleMode(saveData.battleMode);
    if (typeof saveData.runAndBun === 'boolean') setRunAndBun(saveData.runAndBun);
    if (saveData.myText) setMyText(saveData.myText);
    if (saveData.enemyText) setEnemyText(saveData.enemyText);
    if (Array.isArray(saveData.actionLog)) setActionLog(saveData.actionLog);
    setTurns(saveData.turns);

    if (saveData.selectedTrainerId != null) {
      fetch('/api/trainers').then(r => r.json()).then((trainers: TrainerEntry[]) => {
        const match = trainers.find(t => t.id === saveData.selectedTrainerId);
        if (match) setSelectedTrainer(match);
      }).catch(() => {});
    }
  }

  const importFileRef = React.useRef<HTMLInputElement>(null);

  // --- Risk Analysis ---
  const [riskReport, setRiskReport] = useState<any>(null);
  const [riskLoading, setRiskLoading] = useState(false);

  async function analyzeRisk() {
    const calcdTurns = turns.filter(t =>
      (t.playerAction.runApplied || t.enemyAction.runApplied)
    );
    if (calcdTurns.length === 0) return;

    setRiskLoading(true);
    try {
      const effectiveInitial = initialState ?? {
        myTeam: baseMyTeam.map(cloneMember),
        enemyTeam: baseEnemyTeam.map(cloneMember),
      };

      let runningState = { ...effectiveInitial, myTeam: [...effectiveInitial.myTeam], enemyTeam: [...effectiveInitial.enemyTeam] };

      const turnInputs = turns.map((turn, idx) => {
        const pa = turn.playerAction;
        const ea = turn.enemyAction;

        const myDefenderName = ea.type === 'attack' ? ea.defenderName : undefined;
        const myDefCanon = myDefenderName ? (resolveCanonicalName(myDefenderName, dicts) ?? myDefenderName) : undefined;

        let myPokemonHP = 0;
        let myPokemonMaxHP = 0;
        let myPokemonStatus: string | undefined;

        if (myDefCanon) {
          const m = [...runningState.myTeam, ...runningState.enemyTeam].find(
            mem => mem?.name?.toLowerCase() === myDefCanon.toLowerCase()
          );
          if (m) {
            myPokemonMaxHP = m.maxHP ?? 0;
            myPokemonHP = typeof m.curHP === 'number' ? m.curHP : Math.round(((m.pct ?? 100) / 100) * myPokemonMaxHP);
            myPokemonStatus = m.status?.type;
          }
        }

        const effectiveSpeed = (member: MemberEx | undefined) => {
          const base = (member as any)?.speed ?? 0;
          const stage = member?.statStages?.spd ?? 0;
          const s = Math.max(-6, Math.min(6, stage));
          const multiplier = s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
          let spd = base * multiplier;
          if (member?.status?.type === 'par') spd *= 0.5;
          return spd;
        };

        const enemyAttacker = ea.attackerName ? [...runningState.myTeam, ...runningState.enemyTeam].find(
          m => m?.name?.toLowerCase() === ea.attackerName!.toLowerCase()
        ) : undefined;
        const myDefender = myDefCanon ? [...runningState.myTeam, ...runningState.enemyTeam].find(
          m => m?.name?.toLowerCase() === myDefCanon.toLowerCase()
        ) : undefined;

        const enemyMovesFirst = effectiveSpeed(enemyAttacker) > effectiveSpeed(myDefender);

        // Advance running state with this turn's actions
        const turnActions = actionLog.filter(a => a.actionKey?.startsWith(`turn-${turn.id}-`));
        for (const act of turnActions) {
          runningState = replayAll(effectiveInitial, actionLog.slice(0, actionLog.indexOf(act) + 1)) as any;
        }

        return {
          turnNumber: idx + 1,
          playerAction: {
            type: pa.type,
            moveName: pa.moveName,
            attackerName: pa.attackerName,
            defenderName: pa.defenderName,
          },
          enemyAction: {
            type: ea.type,
            moveName: ea.moveName,
            attackerName: ea.attackerName,
            defenderName: ea.defenderName,
            rawRollsNormal: ea.result?.rawRollsNormal,
            rawRollsCrit: ea.result?.rawRollsCrit,
          },
          myPokemonHP,
          myPokemonMaxHP,
          myPokemonStatus,
          enemyMovesFirst,
        };
      });

      const resp = await fetch('/api/risk-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gen, turns: turnInputs }),
      });

      if (!resp.ok) throw new Error(await resp.text());
      const report = await resp.json();
      setRiskReport(report);
    } catch (err: any) {
      console.error('[risk-analysis]', err);
      alert(`Risk analysis failed: ${err?.message || err}`);
    } finally {
      setRiskLoading(false);
    }
  }

  const hasAnyCalc = turns.some(t => t.playerAction.result || t.enemyAction.result);

  const myCollection = dicts.mySpecies;

  return (
    <div className="min-h-screen w-full flex flex-col items-center bg-neutral-950 text-neutral-100 p-6" style={{fontFamily:'Inter, ui-sans-serif, system-ui'}}>
      <div className="w-full max-w-7xl">
        <header className="mb-4">
          <h1 className="text-3xl font-bold tracking-tight">Poke Fight Planner</h1>
          <p className="text-neutral-400">Build teams, select trainers, plan turns with drag-and-drop sprites.</p>
        </header>

        {/* Tab Bar */}
        <div className="flex gap-1 bg-neutral-900 rounded-xl p-1 mb-6 w-fit">
          <button
            onClick={() => setActiveTab('editor')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === 'editor' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
            }`}
          >
            Team Editor
          </button>
          <button
            onClick={() => setActiveTab('planner')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === 'planner' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
            }`}
          >
            Planner
          </button>
          <button
            onClick={() => setActiveTab('matchup')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === 'matchup' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
            }`}
          >
            Matchup Finder
          </button>
        </div>

        {/* Shared uploads: only myteam.txt + gen on editor; gen + trainer on planner */}
        {activeTab === 'editor' && (
          <section className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-neutral-800 p-4 bg-neutral-900/40 md:col-span-2">
              <h2 className="text-sm font-semibold mb-3">Upload sets</h2>
              <div>
                <div className="text-xs text-neutral-400 mb-1">myteam.txt</div>
                <FilePicker
                  label="myteam.txt"
                  onFileText={(text) => setMyText(text)}
                  onClear={() => { setMyText(''); setMyTeam(Array(6).fill(undefined) as any); }}
                  currentText={myText}
                />
              </div>
            </div>
            <div className="rounded-2xl border border-neutral-800 p-4 bg-neutral-900/40">
              <h2 className="text-sm font-semibold mb-2">Generation</h2>
              <select value={gen} onChange={e => setGen(Number(e.target.value))} className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm">
                {[9,8,7,6,5,4,3,2,1].map(g => <option key={g} value={g}>Gen {g}</option>)}
              </select>
              <div className="mt-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={runAndBun} onChange={e => setRunAndBun(e.target.checked)} className="w-4 h-4 rounded border-neutral-700 bg-neutral-800" />
                  <span className="text-sm text-neutral-300">Run and Bun <span className="text-neutral-500">(weather lasts indefinitely)</span></span>
                </label>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'editor' && (
          <TeamEditor myText={myText} gen={gen} onMyTextChange={setMyText} />
        )}

        {/* ====== PLANNER TAB ====== */}
        {activeTab === 'planner' && (
          <div className="relative">
            {/* Left Flyout: Collection + My Team */}
            <FlyoutPanel side="left" title="Collection & My Team">
              <div className="mb-3">
                <div className="text-[10px] text-neutral-500 mb-1">Collection (drag to turns)</div>
                <div className="flex flex-wrap gap-1">
                  {myCollection.map(name => (
                    <div
                      key={name}
                      draggable
                      onDragStart={e => {
                        e.dataTransfer.setData('text/plain', JSON.stringify({ name, source: 'my' }));
                        const img = e.currentTarget.querySelector('img');
                        if (img) e.dataTransfer.setDragImage(img, 16, 16);
                      }}
                      onClick={() => {
                        if (myTeam.some(m => m?.name?.toLowerCase() === name.toLowerCase())) return;
                        const emptyIdx = myTeam.findIndex(m => !m?.name);
                        if (emptyIdx !== -1) addToMyTeam(emptyIdx, name);
                      }}
                      className="cursor-pointer cursor-grab active:cursor-grabbing rounded-lg hover:bg-neutral-800 p-0.5 transition"
                      title={name}
                    >
                      <PokemonIcon name={name} size={32} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-neutral-800 pt-2">
                <div className="text-[10px] text-neutral-500 mb-1">My Team</div>
                <TeamBox
                  title="My Team"
                  members={myTeam}
                  editable
                  onRemove={idx => setMyTeam(prev => { const n = [...prev]; n[idx] = undefined as any; return n; })}
                  onDropToSlot={(idx, name) => addToMyTeam(idx, name)}
                  onChangeStatus={onChangeStatus}
                  onChangeItem={onChangeItem}
                  onChangeHP={onChangeHP}
                />
              </div>
            </FlyoutPanel>

            {/* Right Flyout: Enemy Team */}
            <FlyoutPanel side="right" title="Enemy Team">
              <div className="mb-3">
                <div className="text-[10px] text-neutral-500 mb-1">Select Trainer</div>
                <TrainerSelector onSelect={handleTrainerSelect} selected={selectedTrainer} />
              </div>

              <div className="mb-2">
                <div className="text-[10px] text-neutral-500 mb-1">Enemy Team (drag to turns)</div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {enemyTeam.filter(Boolean).map((m, i) => (
                    <div
                      key={i}
                      draggable
                      onDragStart={e => {
                        e.dataTransfer.setData('text/plain', JSON.stringify({ name: m.name, source: 'enemy' }));
                        const img = e.currentTarget.querySelector('img');
                        if (img) e.dataTransfer.setDragImage(img, 16, 16);
                      }}
                      className="cursor-grab active:cursor-grabbing rounded-lg hover:bg-neutral-800 p-0.5 transition"
                      title={m.name}
                    >
                      <PokemonIcon name={m.name} size={32} />
                    </div>
                  ))}
                </div>
                <TeamBox
                  title="Enemy Team"
                  members={enemyTeam}
                  editable
                  onChangeStatus={onChangeEnemyStatus}
                  onChangeItem={onChangeEnemyItem}
                />
              </div>
            </FlyoutPanel>

            {/* Main turn area */}
            <div className="ml-7 mr-7">
              {/* Top bar: gen, battle mode, controls */}
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2 sticky top-0 z-10 bg-neutral-950 py-2">
                <div className="flex items-center gap-3">
                  <select value={gen} onChange={e => setGen(Number(e.target.value))} className="bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1.5 text-sm">
                    {[9,8,7,6,5,4,3,2,1].map(g => <option key={g} value={g}>Gen {g}</option>)}
                  </select>
                  <div className="flex items-center gap-1 bg-neutral-800 rounded-lg p-0.5">
                    <button
                      onClick={() => setBattleMode('singles')}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${battleMode === 'singles' ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-neutral-200'}`}
                    >Singles</button>
                    <button
                      onClick={() => setBattleMode('doubles')}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${battleMode === 'doubles' ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-neutral-200'}`}
                    >Doubles</button>
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                    <input type="checkbox" checked={runAndBun} onChange={e => setRunAndBun(e.target.checked)} className="w-3.5 h-3.5 rounded border-neutral-700 bg-neutral-800" />
                    <span className="text-neutral-400">Run & Bun</span>
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={addTurn} className="rounded-lg px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 transition text-sm font-semibold shadow">
                    + Add Turn
                  </button>
                  <button
                    onClick={analyzeRisk}
                    disabled={!hasAnyCalc || riskLoading}
                    className={`rounded-lg px-3 py-1.5 transition text-sm font-semibold shadow ${
                      hasAnyCalc && !riskLoading
                        ? 'bg-amber-600 hover:bg-amber-500 text-white'
                        : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                    }`}
                  >
                    {riskLoading ? 'Analyzing...' : 'Analyze Risk'}
                  </button>
                  <button onClick={exportLines} className="rounded-lg px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 transition text-sm font-semibold shadow">
                    Export
                  </button>
                  <button onClick={() => importFileRef.current?.click()} className="rounded-lg px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 transition text-sm font-semibold shadow">
                    Import
                  </button>
                  <input
                    ref={importFileRef}
                    type="file"
                    accept=".txt"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => { if (typeof reader.result === 'string') importLines(reader.result); };
                      reader.readAsText(file);
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>

              {/* Turn cards */}
              <div className="space-y-2">
                {turns.map((turn, idx) => {
                  const pAction = turn.playerAction;
                  const eAction = turn.enemyAction;
                  const myMembers = myTeam.filter(Boolean).map(m => ({ name: m.name, source: 'my' as const }));
                  const enemyMembers = enemyTeam.filter(Boolean).map(m => ({ name: m.name, source: 'enemy' as const }));
                  const aliveMyMembers = myTeam
                    .filter(m => m && m.pct > 0)
                    .map(m => ({ name: m.name, source: 'my' as const }));
                  const aliveEnemyMembers = enemyTeam
                    .filter(m => m && m.pct > 0)
                    .map(m => ({ name: m.name, source: 'enemy' as const }));
                  let enemySwitchAnnotations: Record<string, { score: number; isBest: boolean }> | undefined;
                  if (eAction.switchScores) {
                    const alive = eAction.switchScores.filter(s => {
                      const m = enemyTeam.find(e => e?.name === s.species);
                      return m && m.pct > 0;
                    });
                    const anyBestAlive = alive.some(s => s.isBest);
                    let bestSpecies: string | null = null;
                    if (!anyBestAlive && alive.length > 0) {
                      bestSpecies = alive.reduce((best, cur) => cur.score > best.score ? cur : best, alive[0]).species;
                    }
                    enemySwitchAnnotations = Object.fromEntries(
                      alive.map(s => [s.species, {
                        score: s.score,
                        isBest: s.isBest || s.species === bestSpecies,
                      }])
                    );
                  }
                  return (
                    <TurnCard
                      key={turn.id}
                      turn={turn}
                      index={idx}
                      isCurrent={idx === turns.length - 1}
                      playerMoves={getMovesForPokemon(pAction.attackerName)}
                      enemyMoves={getMovesForPokemon(eAction.attackerName)}
                      playerAttackerInfo={getMemberInfo(pAction.attackerName, pAction.attackerSource)}
                      playerDefenderInfo={getMemberInfo(pAction.defenderName, pAction.defenderSource)}
                      enemyAttackerInfo={getMemberInfo(eAction.attackerName, eAction.attackerSource)}
                      enemyDefenderInfo={getMemberInfo(eAction.defenderName, eAction.defenderSource)}
                      myTeamMembers={myMembers}
                      enemyTeamMembers={enemyMembers}
                      aliveMyMembers={aliveMyMembers}
                      aliveEnemyMembers={aliveEnemyMembers}
                      enemySwitchAnnotations={enemySwitchAnnotations}
                      onUpdatePlayerAction={u => updateSubAction(idx, 'player', u)}
                      onUpdateEnemyAction={u => updateSubAction(idx, 'enemy', u)}
                      onCalcPlayer={() => doSubCalc(idx, 'player')}
                      onCalcEnemy={() => doSubCalc(idx, 'enemy')}
                      onRunPlayer={() => runSubAction(idx, 'player')}
                      onRunEnemy={() => runSubAction(idx, 'enemy')}
                      onUndoPlayer={() => undoSubAction(idx, 'player')}
                      onUndoEnemy={() => undoSubAction(idx, 'enemy')}
                      onDelete={() => deleteTurn(idx)}
                      weatherSymbol={turn.weather?.type ? getWeatherSymbol(turn.weather.type) : undefined}
                      screenSymbols={[
                        ...(turn.myScreens?.map(s => getScreenSymbol(s.type)) ?? []),
                        ...(turn.enemyScreens?.map(s => getScreenSymbol(s.type)) ?? []),
                      ]}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ====== MATCHUP FINDER TAB ====== */}
        {activeTab === 'matchup' && (
          <MatchupFinder
            myText={myText}
            enemyText={enemyText}
            gen={gen}
            onEnemyTextChange={setEnemyText}
            selectedTrainer={selectedTrainer}
            onTrainerSelect={handleTrainerSelect}
            myCollection={myCollection}
          />
        )}

        <footer className="text-xs text-neutral-500 mt-6">
          <p>Drag Pokemon from the left (My Team) or right (Enemy Team) flyouts into turn slots. Select a move, place a target, then Calc and Run.</p>
        </footer>
      </div>

      {riskReport && (
        <RiskReportModal report={riskReport} onClose={() => setRiskReport(null)} />
      )}
    </div>
  );
}
