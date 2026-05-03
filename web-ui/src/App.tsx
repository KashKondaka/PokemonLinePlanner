// src/App.tsx
import React, { useEffect, useMemo, useState } from 'react';

import TeamBox from './components/TeamBox';
import FilePicker from './components/FilePicker';
import PokemonIcon from './components/PokemonIcon';
import TeamEditor from './components/TeamEditor';
import FlyoutPanel from './components/FlyoutPanel';
import TrainerSelector, { type TrainerEntry } from './components/TrainerSelector';
import TurnCard, { type Turn, type SubAction } from './components/TurnCard';
import MatchupFinder from './components/MatchupFinder';

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
  fetchMaxHPFromAPI,
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
        const maxHP = await fetchMaxHPFromAPI(member.name, myText, enemyText, gen);
        if (typeof maxHP === 'number') {
          setEnemyTeam(prev => {
            const next = [...prev];
            if (next[idx]) next[idx] = { ...next[idx]!, maxHP, curHP: maxHP };
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
        name: species, pct: 100, maxHP: undefined, curHP: undefined, item,
        berry: rule ? { name: rule.name, consumed: false } : undefined,
        status: undefined,
        statStages: { atk: 0, def: 0, spatk: 0, spdef: 0, spd: 0 },
      };
      return next;
    });
    const maxHP = await fetchMaxHPFromAPI(species, myText, enemyText, gen);
    if (typeof maxHP === 'number') {
      setMyTeam(prev => {
        const next = [...prev];
        if (next[slotIndex]?.name === species) next[slotIndex] = { ...next[slotIndex]!, maxHP, curHP: maxHP };
        return next;
      });
    }
  }

  const onChangeStatus = (index: number, statusType: StatusType | undefined) => {
    setMyTeam(prev => {
      const next = [...prev]; const cur = next[index]; if (!cur) return prev;
      next[index] = { ...cur, status: statusType ? { type: statusType } : undefined };
      return next;
    });
  };

  const onChangeItem = (index: number, item: string | undefined) => {
    setMyTeam(prev => {
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

  const addTurn = () => setTurns(p => [...p, {
    id: p.length + 1,
    playerAction: emptySubAction(),
    enemyAction: emptySubAction(),
  }]);

  function findActivePlayerPokemon(turnIdx: number): string | null {
    for (let i = turnIdx; i >= 0; i--) {
      const pa = turns[i].playerAction;
      if (pa.attackerName && pa.attackerSource === 'my') return pa.attackerName;
    }
    return null;
  }

  function updateSubAction(turnIdx: number, side: 'player' | 'enemy', update: Partial<SubAction>) {
    setTurns(prev => prev.map((t, i) => {
      if (i !== turnIdx) return t;
      const key = side === 'player' ? 'playerAction' : 'enemyAction';
      const updated = { ...t[key], ...update };

      // Trigger AI probability fetch when enemy is attacker and both pokemon are placed
      if (updated.attackerSource === 'enemy' && updated.attackerName && updated.defenderName) {
        fetchAiProbs(updated.attackerName, updated.defenderName);
      }

      // Trigger switch-in score fetch when enemy action toggles to switch
      if (side === 'enemy' && updated.type === 'switch' && t[key].type !== 'switch') {
        fetchSwitchScores(turnIdx);
      }

      return { ...t, [key]: updated };
    }));

    async function fetchSwitchScores(tidx: number) {
      const playerPokemon = findActivePlayerPokemon(tidx);
      if (!playerPokemon) return;
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

    async function fetchAiProbs(enemyName: string, playerName: string) {
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
          result: { defender: defenderCanon, lowPct: 0, highPct: 0, critPct: 0, isStatChange: true, statChanges: [], target: attackerCanon },
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

    const actionKey = `${turnIdx}-${side}`;

    if (action.result.isStatChange && action.result.statChanges && action.result.target) {
      const targetCanon = resolveCanonicalName(action.result.target, dicts) ?? action.result.target;
      const loc = findMember(targetCanon);
      if (!loc.team) return;
      const ga: StatChangeAction = {
        type: 'stat-change', turnIndex: turns.length * 2 + (side === 'enemy' ? 1 : 0),
        targetTeam: loc.team, targetIndex: loc.index,
        statChanges: action.result.statChanges.map(sc => ({ stat: sc.stat, stages: sc.stages })),
        intimidateEffects: intimidateEffects.length ? intimidateEffects : undefined,
      };
      setActionLog(prev => [...prev, ga]);
      updateSubAction(turnIdx, side, {
        runApplied: true,
        chosen: { attacker: attackerName, move: moveName, defender: targetCanon, finalPct: loc.member?.pct ?? 100, isStatChange: true, statChanges: action.result!.statChanges },
      });
      return;
    }

    if (action.result.isStatusMove && action.result.statusEffect && action.result.target) {
      const targetCanon = resolveCanonicalName(action.result.target, dicts) ?? action.result.target;
      const loc = findMember(targetCanon);
      if (!loc.team) return;
      const ga: StatusMoveAction = {
        type: 'status-move', turnIndex: turns.length * 2 + (side === 'enemy' ? 1 : 0),
        targetTeam: loc.team, targetIndex: loc.index,
        statusEffect: action.result.statusEffect as StatusType,
        berryCured: !!action.result.berryCured,
        intimidateEffects: intimidateEffects.length ? intimidateEffects : undefined,
      };
      setActionLog(prev => [...prev, ga]);
      updateSubAction(turnIdx, side, {
        runApplied: true,
        chosen: { attacker: attackerName, move: moveName, defender: targetCanon, finalPct: loc.member?.pct ?? 100, isStatusMove: true, statusEffect: action.result!.statusEffect },
      });
      return;
    }

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
      targetTeam: loc.team, targetIndex: loc.index,
      damageHP: selectedDamageHP, defenderMaxHP: maxHP,
      appliesStatus: action.result.appliesStatus ?? undefined,
      weather: turns[turnIdx].weather, gen,
      intimidateEffects: intimidateEffects.length ? intimidateEffects : undefined,
    };
    setActionLog(prev => [...prev, ga]);

    const effects = computeDamageEffects(loc.member, ga);
    updateSubAction(turnIdx, side, {
      runApplied: true,
      chosen: {
        attacker: attackerName, move: moveName, defender: defCanon,
        finalPct: effects.finalPct, finalHP: effects.finalHP, maxHP: effects.maxHP,
        berryUsedName: effects.berryUsedName,
        eotType: effects.eotType, eotLossPct: effects.eotLossPct,
      },
    });
  }

  function undoSubAction(turnIdx: number, side: 'player' | 'enemy') {
    const turn = turns[turnIdx];
    const action = side === 'player' ? turn.playerAction : turn.enemyAction;
    if (!action.runApplied) return;

    const actionIndex = turns.length * 2 + (side === 'enemy' ? 1 : 0);
    const newLog = actionLog.slice(0, -1);
    setActionLog(newLog);

    if (newLog.length === 0 && initialState) {
      setMyTeam(initialState.myTeam.map(cloneMember) as MemberEx[]);
      setEnemyTeam(initialState.enemyTeam.map(cloneMember) as MemberEx[]);
      setInitialState(null);
    }

    updateSubAction(turnIdx, side, { runApplied: false, chosen: undefined });
  }

  function deleteTurn(i: number) {
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
                      className="cursor-grab active:cursor-grabbing rounded-lg hover:bg-neutral-800 p-0.5 transition"
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
                <TeamBox title="Enemy Team" members={enemyTeam} />
              </div>
            </FlyoutPanel>

            {/* Main turn area */}
            <div className="ml-7 mr-7">
              {/* Top bar: gen, battle mode, controls */}
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
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
    </div>
  );
}
