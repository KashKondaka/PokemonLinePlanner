import React, { useState } from 'react';
import SpriteDropZone from './SpriteDropZone';
import MoveButtonGrid from './MoveButtonGrid';
import RollSlider from './RollSlider';
import CritToggleButton from './CritToggleButton';
import RunButton from './RunButton';
import UndoButton from './UndoButton';

export type SubAction = {
  type: 'attack' | 'switch';
  attackerSource?: 'my' | 'enemy';
  attackerName?: string;
  moveName?: string;
  defenderName?: string;
  defenderSource?: 'my' | 'enemy';
  switchTo?: string;
  switchSource?: 'my' | 'enemy';

  result?: {
    defender: string;
    defenderMaxHP?: number;
    lowPct: number; lowHP?: number;
    highPct: number; highHP?: number;
    critPct: number; critHP?: number;
    rawRollsNormal?: number[];
    rawRollsCrit?: number[];
    rollOptionsNormal?: number[];
    rollOptionsCrit?: number[];
    isStatChange?: boolean;
    statChanges?: { stat: string; stages: number; target: string }[];
    target?: string;
    screenSetUp?: { type: string; turnsRemaining: number; user: string };
    isStatusMove?: boolean;
    statusEffect?: string;
    berryCured?: boolean;
    berryUsed?: string;
    intimidateEffects?: Array<{ user: string; target: string; effect: string }>;
    appliesStatus?: any;
  };

  useCrit?: boolean;
  selectedRollIndex?: number;
  runApplied?: boolean;
  loading?: boolean;
  error?: string | null;
  aiMoveProbs?: number[];
  attackerFirstTurnOut?: boolean;
  defenderFirstTurnOut?: boolean;

  moveDamageRanges?: Record<string, { minPct: number; maxPct: number } | null>;

  switchScores?: { species: string; score: number; isBest: boolean }[];

  chosen?: {
    attacker: string;
    move: string;
    defender: string;
    finalPct: number;
    finalHP?: number;
    maxHP?: number;
    berryUsedName?: string;
    eotType?: string;
    eotLossPct?: number;
    weatherLossPct?: number;
    leftoversHealHP?: number;
    leftoversTarget?: string;
    isStatChange?: boolean;
    statChanges?: Array<{ stat: string; stages: number; target: string }>;
    screenSetUp?: { type: string; turnsRemaining: number; user: string };
    isStatusMove?: boolean;
    statusEffect?: string;
    statusCured?: boolean;
    intimidateUsed?: Array<{ user: string; target: string; effect: string }>;
  };
};

export type EotSummaryData = {
  nextAiMove?: string;
  nextAiProb?: number;
  nextAiMoveProbs?: number[];
  nextAiMoveNames?: string[];
  nextAiTarget?: string;
  nextAiTargetPct?: number;
};

export type Turn = {
  id: number;
  playerAction: SubAction;
  enemyAction: SubAction;
  weather?: any;
  myScreens?: any[];
  enemyScreens?: any[];
  eotSummary?: EotSummaryData;
};

type MemberLookup = {
  name: string;
  pct: number;
  curHP?: number;
  maxHP?: number;
};

type TeamMember = {
  name: string;
  source: 'my' | 'enemy';
};

type SwitchAnnotation = { score: number; isBest: boolean };

type SubActionRowProps = {
  label: string;
  action: SubAction;
  moves: string[];
  locked?: boolean;
  attackerInfo?: MemberLookup;
  defenderInfo?: MemberLookup;
  attackerTeam?: TeamMember[];
  defenderTeam?: TeamMember[];
  switchTeam?: TeamMember[];
  switchAnnotations?: Record<string, SwitchAnnotation>;
  onSetSwitch?: (name: string, source: 'my' | 'enemy') => void;
  onClearSwitch?: () => void;
  onSetAttacker: (name: string, source: 'my' | 'enemy') => void;
  onClearAttacker: () => void;
  onSetDefender: (name: string, source: 'my' | 'enemy') => void;
  onClearDefender: () => void;
  onSelectMove: (move: string | undefined) => void;
  onToggleSwitch: () => void;
  onCalc: () => void;
  onRun: () => void;
  onUndo: () => void;
  onSetCrit: (crit: boolean) => void;
  onSetRollIndex: (idx: number) => void;
  onSetFirstTurnOut: (attacker: boolean, defender: boolean) => void;
};

function SubActionRow({
  label, action, moves, locked, attackerInfo, defenderInfo,
  attackerTeam, defenderTeam, switchTeam, switchAnnotations,
  onSetSwitch, onClearSwitch,
  onSetAttacker, onClearAttacker, onSetDefender, onClearDefender,
  onSelectMove, onToggleSwitch, onCalc, onRun, onUndo,
  onSetCrit, onSetRollIndex, onSetFirstTurnOut,
}: SubActionRowProps) {
  const isSwitch = action.type === 'switch';

  const oppositeSource = (src: 'my' | 'enemy') => src === 'my' ? 'enemy' : 'my';

  const effectiveAttackerTeam = action.defenderSource
    ? (attackerTeam ?? []).filter(m => m.source === oppositeSource(action.defenderSource!))
    : attackerTeam;

  const effectiveDefenderTeam = action.attackerSource
    ? (defenderTeam ?? []).filter(m => m.source === oppositeSource(action.attackerSource!))
    : defenderTeam;

  const rollOpts = action.useCrit
    ? (action.result?.rollOptionsCrit ?? [0])
    : (action.result?.rollOptionsNormal ?? [0]);
  const selectedIdx = Math.max(0, Math.min((action.selectedRollIndex ?? 0), rollOpts.length - 1));

  const resultMsg = action.result?.isStatChange
    ? (action.result.statChanges?.length
        ? action.result.statChanges.map(sc => `${sc.target} ${sc.stat} ${sc.stages > 0 ? '+' : ''}${sc.stages}`).join(', ')
        : action.result.screenSetUp
          ? `${action.result.screenSetUp.type.replace('-', ' ')} (${action.result.screenSetUp.turnsRemaining} turns)`
          : null)
    : action.result?.isStatusMove
      ? `${action.result.target} was ${action.result.statusEffect}${action.result.berryCured ? ' (cured)' : ''}!`
      : null;

  return (
    <div>
    <div className={`flex items-center gap-2 py-1 ${locked ? 'pointer-events-none opacity-50' : ''}`}>
      <div className="w-12 text-[10px] text-neutral-500 text-right shrink-0 font-medium">{label}</div>

      {isSwitch ? (
        <>
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <span>Switch to:</span>
            <SpriteDropZone
              pokemonName={action.switchTo}
              source={action.switchSource}
              pct={100}
              acceptFrom="any"
              onDrop={(name, src) => (onSetSwitch ?? onSetAttacker)(name, src)}
              onClear={onClearSwitch ?? onClearAttacker}
              label="Switch"
              selectableTeam={switchTeam}
              annotations={switchAnnotations}
            />
            {action.switchTo && switchAnnotations?.[action.switchTo] && (
              <span className={`text-[10px] font-semibold ${switchAnnotations[action.switchTo].isBest ? 'text-yellow-400' : 'text-neutral-500'}`}>
                {switchAnnotations[action.switchTo].score >= 0 ? '+' : ''}{switchAnnotations[action.switchTo].score}
                {switchAnnotations[action.switchTo].isBest ? ' ★' : ''}
              </span>
            )}
          </div>
          <button
            onClick={onToggleSwitch}
            className="text-[9px] px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-neutral-400 hover:bg-neutral-700"
          >
            → Attack
          </button>
          <div className="flex-1" />
          <RunButton onClick={onRun} disabled={!!action.runApplied} />
          <UndoButton onClick={onUndo} disabled={!action.runApplied} />
        </>
      ) : (
        <>
          <SpriteDropZone
            pokemonName={action.attackerName}
            source={action.attackerSource}
            pct={attackerInfo?.pct ?? 100}
            curHP={attackerInfo?.curHP}
            maxHP={attackerInfo?.maxHP}
            acceptFrom="any"
            onDrop={onSetAttacker}
            onClear={onClearAttacker}
            label="Attacker"
            selectableTeam={effectiveAttackerTeam}
          />

          <div className="text-neutral-600 text-xs">→</div>

          <MoveButtonGrid
            moves={moves}
            selectedMove={action.moveName}
            onSelectMove={onSelectMove}
            aiMoveProbs={action.aiMoveProbs}
            moveDamageRanges={action.moveDamageRanges}
            disabled={!action.attackerName || !!action.runApplied}
          />

          <div className="text-neutral-600 text-xs">→</div>

          <SpriteDropZone
            pokemonName={action.defenderName}
            source={action.defenderSource}
            pct={defenderInfo?.pct ?? 100}
            curHP={defenderInfo?.curHP}
            maxHP={defenderInfo?.maxHP}
            acceptFrom="any"
            onDrop={onSetDefender}
            onClear={onClearDefender}
            label="Target"
            selectableTeam={effectiveDefenderTeam}
          />

          <button
            onClick={onToggleSwitch}
            className="text-[9px] px-1.5 py-1 rounded bg-neutral-800 border border-neutral-700 text-neutral-400 hover:bg-neutral-700 shrink-0"
            title="Switch to switch mode"
          >
            ⇄
          </button>

          {!action.result && !action.error && action.attackerName && action.moveName && action.defenderName && (
            <button
              onClick={onCalc}
              disabled={action.loading}
              className="h-7 px-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500 font-semibold text-[10px] transition shadow shrink-0"
            >
              {action.loading ? '...' : 'Calc'}
            </button>
          )}

          {action.error && (
            <div className="text-[10px] text-red-400 truncate max-w-[140px]" title={action.error}>{action.error}</div>
          )}

          {action.result && !action.error && (
            <div className="flex items-center gap-1">
              {resultMsg ? (
                <div className="text-[10px] text-neutral-300 max-w-[120px] truncate" title={resultMsg}>{resultMsg}</div>
              ) : (
                <>
                  <RollSlider
                    label={action.useCrit ? 'Crit' : 'Rolls'}
                    options={rollOpts}
                    selectedIndex={selectedIdx}
                    onChange={onSetRollIndex}
                  />
                  <CritToggleButton
                    active={!!action.useCrit}
                    onToggle={() => onSetCrit(!action.useCrit)}
                  />
                </>
              )}
              <RunButton onClick={onRun} disabled={!!action.runApplied} />
              <UndoButton onClick={onUndo} disabled={!action.runApplied} />
            </div>
          )}

          <div className="flex gap-0.5 text-[9px] shrink-0">
            <label className="flex items-center gap-0.5 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={!!action.attackerFirstTurnOut}
                onChange={e => onSetFirstTurnOut(e.target.checked, !!action.defenderFirstTurnOut)}
                className="w-2.5 h-2.5"
              />
              <span className="text-neutral-500">A1st</span>
            </label>
            <label className="flex items-center gap-0.5 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={!!action.defenderFirstTurnOut}
                onChange={e => onSetFirstTurnOut(!!action.attackerFirstTurnOut, e.target.checked)}
                className="w-2.5 h-2.5"
              />
              <span className="text-neutral-500">D1st</span>
            </label>
          </div>
        </>
      )}
    </div>
    </div>
  );
}

type EotEntry = {
  key: string;
  icon: string;
  label: string;
};

function buildEotEntries(turn: Turn): EotEntry[] {
  const entries: EotEntry[] = [];
  for (const [sideKey, action] of [['P', turn.playerAction], ['E', turn.enemyAction]] as const) {
    const c = action.chosen;
    if (!c) continue;
    if (c.berryUsedName) {
      entries.push({ key: `${sideKey}-berry`, icon: '🫐', label: `${c.defender} consumed ${c.berryUsedName}` });
    }
    if (c.eotType && c.eotLossPct) {
      const typeLabel = c.eotType === 'burn' ? 'burn' : 'poison';
      entries.push({ key: `${sideKey}-status`, icon: c.eotType === 'burn' ? '🔥' : '☠️', label: `${c.defender} took ${Math.round(c.eotLossPct)}% ${typeLabel} damage` });
    }
    if (c.weatherLossPct) {
      entries.push({ key: `${sideKey}-weather`, icon: '🌪️', label: `${c.defender} took ${Math.round(c.weatherLossPct)}% weather damage` });
    }
    if (c.leftoversHealHP && c.leftoversTarget) {
      entries.push({ key: `${sideKey}-leftovers`, icon: '🍽️', label: `${c.leftoversTarget} healed ${c.leftoversHealHP} HP with Leftovers` });
    }
    if (c.screenSetUp) {
      const screenName = c.screenSetUp.type.replace(/-/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
      entries.push({ key: `${sideKey}-screen`, icon: '🛡️', label: `${c.screenSetUp.user} set up ${screenName} (${c.screenSetUp.turnsRemaining} turns remaining)` });
    }
  }
  return entries;
}

function EndOfTurnSummary({ turn }: { turn: Turn }) {
  const [collapsed, setCollapsed] = useState(false);
  const bothRun = !!turn.playerAction.runApplied && !!turn.enemyAction.runApplied;
  if (!bothRun) return null;

  const entries = buildEotEntries(turn);
  const ai = turn.eotSummary;
  const hasContent = entries.length > 0 || ai?.nextAiMove;

  if (!hasContent) return null;

  return (
    <div className="border-t border-neutral-800 mt-1">
      <button
        onClick={() => setCollapsed(prev => !prev)}
        className="flex items-center gap-1 w-full py-1 px-1 text-[10px] text-neutral-400 hover:text-neutral-200 transition-colors"
      >
        <span className={`transition-transform inline-block ${collapsed ? '' : 'rotate-90'}`}>▶</span>
        <span className="font-semibold">End of Turn</span>
      </button>
      {!collapsed && (
        <div className="pl-4 pb-1.5 space-y-0.5">
          {entries.map(e => (
            <div key={e.key} className="text-[10px] text-amber-400 flex items-center gap-1">
              <span>{e.icon}</span>
              <span>{e.label}</span>
            </div>
          ))}
          {ai?.nextAiMove && (
            <div className="text-[10px] text-cyan-400 flex items-center gap-1 mt-0.5">
              <span>🤖</span>
              <span>
                Next turn AI suggests: <strong>{ai.nextAiMove}</strong>
                {ai.nextAiProb != null && ` (${Math.round(ai.nextAiProb * 100)}%)`}
                {ai.nextAiTarget && ` on ${ai.nextAiTarget}`}
                {ai.nextAiTargetPct != null && ` at ${Math.round(ai.nextAiTargetPct)}%`}
              </span>
            </div>
          )}
          {ai?.nextAiMoveProbs && ai.nextAiMoveNames && (
            <div className="flex gap-2 mt-0.5 flex-wrap">
              {ai.nextAiMoveNames.map((name, i) => {
                const prob = ai.nextAiMoveProbs?.[i] ?? 0;
                if (!name || prob <= 0) return null;
                return (
                  <span key={i} className="text-[9px] text-neutral-500">
                    {name}: {Math.round(prob * 100)}%
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type TurnCardProps = {
  turn: Turn;
  index: number;
  isCurrent: boolean;
  playerMoves: string[];
  enemyMoves: string[];
  playerAttackerInfo?: MemberLookup;
  playerDefenderInfo?: MemberLookup;
  enemyAttackerInfo?: MemberLookup;
  enemyDefenderInfo?: MemberLookup;
  myTeamMembers?: TeamMember[];
  enemyTeamMembers?: TeamMember[];
  aliveMyMembers?: TeamMember[];
  aliveEnemyMembers?: TeamMember[];
  enemySwitchAnnotations?: Record<string, SwitchAnnotation>;
  onUpdatePlayerAction: (update: Partial<SubAction>) => void;
  onUpdateEnemyAction: (update: Partial<SubAction>) => void;
  onCalcPlayer: () => void;
  onCalcEnemy: () => void;
  onRunPlayer: () => void;
  onRunEnemy: () => void;
  onUndoPlayer: () => void;
  onUndoEnemy: () => void;
  onDelete: () => void;
  weatherSymbol?: string;
  screenSymbols?: string[];
};

export default function TurnCard({
  turn, index, isCurrent,
  playerMoves, enemyMoves,
  playerAttackerInfo, playerDefenderInfo,
  enemyAttackerInfo, enemyDefenderInfo,
  myTeamMembers, enemyTeamMembers,
  aliveMyMembers, aliveEnemyMembers, enemySwitchAnnotations,
  onUpdatePlayerAction, onUpdateEnemyAction,
  onCalcPlayer, onCalcEnemy,
  onRunPlayer, onRunEnemy,
  onUndoPlayer, onUndoEnemy,
  onDelete, weatherSymbol, screenSymbols,
}: TurnCardProps) {

  function playerSetAttacker(name: string, src: 'my' | 'enemy') {
    if (turn.playerAction.runApplied) onUndoPlayer();
    const update: Partial<SubAction> = { attackerName: name, attackerSource: src, moveName: undefined, result: undefined, error: null };
    if (turn.playerAction.defenderSource && turn.playerAction.defenderSource === src) {
      update.defenderName = undefined;
      update.defenderSource = undefined;
    }
    onUpdatePlayerAction(update);
  }

  function playerSetDefender(name: string, src: 'my' | 'enemy') {
    if (turn.playerAction.runApplied) onUndoPlayer();
    const update: Partial<SubAction> = { defenderName: name, defenderSource: src, result: undefined, error: null };
    if (turn.playerAction.attackerSource && turn.playerAction.attackerSource === src) {
      update.attackerName = undefined;
      update.attackerSource = undefined;
      update.moveName = undefined;
    }
    onUpdatePlayerAction(update);
  }

  function enemySetAttacker(name: string, src: 'my' | 'enemy') {
    if (turn.enemyAction.runApplied) onUndoEnemy();
    const update: Partial<SubAction> = { attackerName: name, attackerSource: src, moveName: undefined, result: undefined, error: null };
    if (turn.enemyAction.defenderSource && turn.enemyAction.defenderSource === src) {
      update.defenderName = undefined;
      update.defenderSource = undefined;
    }
    onUpdateEnemyAction(update);
  }

  function enemySetDefender(name: string, src: 'my' | 'enemy') {
    if (turn.enemyAction.runApplied) onUndoEnemy();
    const update: Partial<SubAction> = { defenderName: name, defenderSource: src, result: undefined, error: null };
    if (turn.enemyAction.attackerSource && turn.enemyAction.attackerSource === src) {
      update.attackerName = undefined;
      update.attackerSource = undefined;
      update.moveName = undefined;
    }
    onUpdateEnemyAction(update);
  }

  function playerClearAttacker() {
    if (turn.playerAction.runApplied) onUndoPlayer();
    onUpdatePlayerAction({ attackerName: undefined, attackerSource: undefined, moveName: undefined, result: undefined, error: null });
  }

  function playerClearDefender() {
    if (turn.playerAction.runApplied) onUndoPlayer();
    onUpdatePlayerAction({ defenderName: undefined, defenderSource: undefined, result: undefined, error: null });
  }

  function enemyClearAttacker() {
    if (turn.enemyAction.runApplied) onUndoEnemy();
    onUpdateEnemyAction({ attackerName: undefined, attackerSource: undefined, moveName: undefined, result: undefined, error: null });
  }

  function enemyClearDefender() {
    if (turn.enemyAction.runApplied) onUndoEnemy();
    onUpdateEnemyAction({ defenderName: undefined, defenderSource: undefined, result: undefined, error: null });
  }

  return (
    <div className={`rounded-xl border ${isCurrent ? 'border-neutral-800' : 'border-neutral-800/60'} bg-neutral-900/40 p-2`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-neutral-300">Turn {index + 1}</span>
          {weatherSymbol && <span className="text-sm">{weatherSymbol}</span>}
          {screenSymbols?.map((s, i) => <span key={i} className="text-xs">{s}</span>)}
        </div>
        <button
          onClick={onDelete}
          className="h-5 w-5 inline-flex items-center justify-center rounded border border-neutral-700 bg-neutral-800 hover:bg-red-800 text-[10px] transition"
          title="Delete turn"
        >
          –
        </button>
      </div>

      <SubActionRow
        label="Player"
        action={turn.playerAction}
        moves={playerMoves}
        locked={!isCurrent}
        attackerInfo={playerAttackerInfo}
        defenderInfo={playerDefenderInfo}
        attackerTeam={[...(myTeamMembers ?? []), ...(enemyTeamMembers ?? [])]}
        defenderTeam={[...(myTeamMembers ?? []), ...(enemyTeamMembers ?? [])]}
        switchTeam={aliveMyMembers}
        onSetSwitch={(name, src) => onUpdatePlayerAction({ switchTo: name, switchSource: src })}
        onClearSwitch={() => onUpdatePlayerAction({ switchTo: undefined, switchSource: undefined })}
        onSetAttacker={playerSetAttacker}
        onClearAttacker={playerClearAttacker}
        onSetDefender={playerSetDefender}
        onClearDefender={playerClearDefender}
        onSelectMove={move => {
          if (turn.playerAction.runApplied) onUndoPlayer();
          onUpdatePlayerAction({ moveName: move || undefined, result: undefined, error: null });
        }}
        onToggleSwitch={() => onUpdatePlayerAction({
          type: turn.playerAction.type === 'switch' ? 'attack' : 'switch',
          moveName: undefined, result: undefined, error: null,
        })}
        onCalc={onCalcPlayer}
        onRun={onRunPlayer}
        onUndo={onUndoPlayer}
        onSetCrit={crit => onUpdatePlayerAction({ useCrit: crit, selectedRollIndex: 0 })}
        onSetRollIndex={idx => onUpdatePlayerAction({ selectedRollIndex: idx })}
        onSetFirstTurnOut={(a, d) => onUpdatePlayerAction({ attackerFirstTurnOut: a, defenderFirstTurnOut: d })}
      />

      <div className="border-t border-neutral-800 my-0.5" />

      <SubActionRow
        label="Enemy"
        action={turn.enemyAction}
        moves={enemyMoves}
        locked={!isCurrent}
        attackerInfo={enemyAttackerInfo}
        defenderInfo={enemyDefenderInfo}
        attackerTeam={[...(myTeamMembers ?? []), ...(enemyTeamMembers ?? [])]}
        defenderTeam={[...(myTeamMembers ?? []), ...(enemyTeamMembers ?? [])]}
        switchTeam={aliveEnemyMembers}
        switchAnnotations={enemySwitchAnnotations}
        onSetSwitch={(name, src) => onUpdateEnemyAction({ switchTo: name, switchSource: src })}
        onClearSwitch={() => onUpdateEnemyAction({ switchTo: undefined, switchSource: undefined })}
        onSetAttacker={enemySetAttacker}
        onClearAttacker={enemyClearAttacker}
        onSetDefender={enemySetDefender}
        onClearDefender={enemyClearDefender}
        onSelectMove={move => {
          if (turn.enemyAction.runApplied) onUndoEnemy();
          onUpdateEnemyAction({ moveName: move || undefined, result: undefined, error: null });
        }}
        onToggleSwitch={() => onUpdateEnemyAction({
          type: turn.enemyAction.type === 'switch' ? 'attack' : 'switch',
          moveName: undefined, result: undefined, error: null,
        })}
        onCalc={onCalcEnemy}
        onRun={onRunEnemy}
        onUndo={onUndoEnemy}
        onSetCrit={crit => onUpdateEnemyAction({ useCrit: crit, selectedRollIndex: 0 })}
        onSetRollIndex={idx => onUpdateEnemyAction({ selectedRollIndex: idx })}
        onSetFirstTurnOut={(a, d) => onUpdateEnemyAction({ attackerFirstTurnOut: a, defenderFirstTurnOut: d })}
      />

      <EndOfTurnSummary turn={turn} />
    </div>
  );
}
