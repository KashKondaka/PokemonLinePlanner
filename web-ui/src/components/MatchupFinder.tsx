import React, { useState } from 'react';
import TrainerSelector, { type TrainerEntry } from './TrainerSelector';
import PokemonIcon from './PokemonIcon';
import { normalizeEnemyTrainerTextForBackend } from '../logic/helpers';

type MatchupResult = {
  species: string;
  tier: 'fastOhko' | 'slowOhko' | 'fast2hko' | 'slow2hko' | 'none';
  bestMove: string;
  bestMoveDmgPct: number;
  bestMoveMinPct: number;
  enemyBestMove: string;
  enemyBestDmgPct: number;
  mySpeed: number;
  enemySpeed: number;
};

type TankResult = {
  species: string;
  hitsToKO: number;
  dmgPctPerHit: number;
  tier: 'elite' | 'good' | 'none';
};

type Props = {
  myText: string;
  enemyText: string;
  gen: number;
  onEnemyTextChange: (text: string) => void;
  selectedTrainer: TrainerEntry | null;
  onTrainerSelect: (trainer: TrainerEntry, text: string) => void;
  myCollection: string[];
};

const MATCHUP_COLORS: Record<string, string> = {
  fastOhko: 'bg-red-600/80 ring-2 ring-red-500',
  slowOhko: 'bg-orange-500/70 ring-2 ring-orange-400',
  fast2hko: 'bg-green-600/60 ring-2 ring-green-500',
  slow2hko: 'bg-yellow-500/50 ring-2 ring-yellow-400',
  none: '',
};

const TANK_COLORS: Record<string, string> = {
  elite: 'bg-blue-600/70 ring-2 ring-blue-500',
  good: 'bg-sky-500/50 ring-2 ring-sky-400',
  none: '',
};

const MATCHUP_LEGEND = [
  { tier: 'fastOhko', label: 'Fast OHKO', color: 'bg-red-600' },
  { tier: 'slowOhko', label: 'Slow OHKO', color: 'bg-orange-500' },
  { tier: 'fast2hko', label: 'Fast 2HKO', color: 'bg-green-600' },
  { tier: 'slow2hko', label: 'Slow 2HKO', color: 'bg-yellow-500' },
];

const TANK_LEGEND = [
  { tier: 'elite', label: '5+ hits', color: 'bg-blue-600' },
  { tier: 'good', label: '3-4 hits', color: 'bg-sky-500' },
];

export default function MatchupFinder({
  myText, enemyText, gen, onEnemyTextChange,
  selectedTrainer, onTrainerSelect, myCollection,
}: Props) {
  const [selectedEnemy, setSelectedEnemy] = useState<string | null>(null);
  const [selectedMove, setSelectedMove] = useState<string | null>(null);
  const [matchupResults, setMatchupResults] = useState<MatchupResult[]>([]);
  const [tankResults, setTankResults] = useState<TankResult[]>([]);
  const [activeMode, setActiveMode] = useState<'matchups' | 'tanks' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredSpecies, setHoveredSpecies] = useState<string | null>(null);

  const enemyPokemon = selectedTrainer?.pokemon ?? [];
  const selectedEnemyData = enemyPokemon.find(
    p => p.species.toLowerCase() === selectedEnemy?.toLowerCase()
  );
  const enemyMoves = selectedEnemyData?.moves ?? [];

  function handleTrainerSelect(trainer: TrainerEntry, text: string) {
    onTrainerSelect(trainer, text);
    setSelectedEnemy(null);
    setSelectedMove(null);
    setMatchupResults([]);
    setTankResults([]);
    setActiveMode(null);
    setError(null);
  }

  function handleSelectEnemy(species: string) {
    setSelectedEnemy(species);
    setSelectedMove(null);
    setMatchupResults([]);
    setTankResults([]);
    setActiveMode(null);
    setError(null);
  }

  async function findMatchups() {
    if (!selectedEnemy || !myText) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/matchups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          myText,
          enemyText: normalizeEnemyTrainerTextForBackend(enemyText),
          enemySpecies: selectedEnemy,
          gen,
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(errText || `HTTP ${resp.status}`);
      }
      const data: MatchupResult[] = await resp.json();
      setMatchupResults(data);
      setTankResults([]);
      setActiveMode('matchups');
    } catch (e: any) {
      console.error('Find matchups failed:', e);
      setError(e?.message || 'Find matchups failed');
    } finally {
      setLoading(false);
    }
  }

  async function findTanks() {
    if (!selectedEnemy || !selectedMove || !myText) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/find-tanks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          myText,
          enemyText: normalizeEnemyTrainerTextForBackend(enemyText),
          enemySpecies: selectedEnemy,
          enemyMove: selectedMove,
          gen,
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(errText || `HTTP ${resp.status}`);
      }
      const data: TankResult[] = await resp.json();
      setTankResults(data);
      setMatchupResults([]);
      setActiveMode('tanks');
    } catch (e: any) {
      console.error('Find tanks failed:', e);
      setError(e?.message || 'Find tanks failed');
    } finally {
      setLoading(false);
    }
  }

  function getColorForSpecies(species: string): string {
    if (activeMode === 'matchups' && matchupResults.length > 0) {
      const r = matchupResults.find(
        m => m.species.toLowerCase() === species.toLowerCase()
      );
      return MATCHUP_COLORS[r?.tier ?? 'none'];
    }
    if (activeMode === 'tanks' && tankResults.length > 0) {
      const r = tankResults.find(
        t => t.species.toLowerCase() === species.toLowerCase()
      );
      return TANK_COLORS[r?.tier ?? 'none'];
    }
    return '';
  }

  function getTooltip(species: string): string {
    if (activeMode === 'matchups') {
      const r = matchupResults.find(
        m => m.species.toLowerCase() === species.toLowerCase()
      );
      if (!r || r.tier === 'none') return `${species}: no good matchup`;
      const speedNote = r.mySpeed >= r.enemySpeed ? 'outspeeds' : 'slower';
      return `${species} (${speedNote}, spd ${r.mySpeed} vs ${r.enemySpeed})\nBest: ${r.bestMove} — ${r.bestMoveDmgPct}% max dmg\nEnemy best: ${r.enemyBestMove} — ${r.enemyBestDmgPct}%`;
    }
    if (activeMode === 'tanks') {
      const r = tankResults.find(
        t => t.species.toLowerCase() === species.toLowerCase()
      );
      if (!r || r.tier === 'none') return `${species}: folds quickly`;
      return `${species}: survives ${r.hitsToKO} hits (${r.dmgPctPerHit}% per hit)`;
    }
    return species;
  }

  const activeLegend = activeMode === 'matchups' ? MATCHUP_LEGEND
    : activeMode === 'tanks' ? TANK_LEGEND
    : null;

  const resultCount = activeMode === 'matchups'
    ? matchupResults.filter(r => r.tier !== 'none').length
    : activeMode === 'tanks'
    ? tankResults.filter(r => r.tier !== 'none').length
    : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* LEFT: My Collection */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-neutral-800 p-4 bg-neutral-900/40">
          <h2 className="text-sm font-semibold mb-3">
            Your Collection
            {activeMode && (
              <span className="text-neutral-400 font-normal ml-2">
                — {activeMode === 'matchups' ? 'offense tiers' : 'tankiness'} vs {selectedEnemy}
                {activeMode === 'tanks' && selectedMove && ` (${selectedMove})`}
                {resultCount > 0 && ` · ${resultCount} highlighted`}
              </span>
            )}
          </h2>

          {/* Legend */}
          {activeLegend && (
            <div className="flex flex-wrap gap-3 text-xs text-neutral-300 mb-3 pb-3 border-b border-neutral-800">
              {activeLegend.map(item => (
                <div key={item.tier} className="flex items-center gap-1.5">
                  <span className={`w-3 h-3 rounded-sm ${item.color}`} />
                  <span>{item.label}</span>
                </div>
              ))}
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-neutral-700 border border-neutral-600" />
                <span>No matchup</span>
              </div>
            </div>
          )}

          {myCollection.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {myCollection.map(name => {
                const colorCls = getColorForSpecies(name);
                const tip = getTooltip(name);
                return (
                  <div
                    key={name}
                    className={`relative flex flex-col items-center p-1.5 rounded-xl transition cursor-default ${colorCls || 'bg-neutral-800/50'}`}
                    title={tip}
                    onMouseEnter={() => setHoveredSpecies(name)}
                    onMouseLeave={() => setHoveredSpecies(null)}
                  >
                    <PokemonIcon name={name} size={40} />
                    <span className="text-[9px] text-neutral-300 truncate max-w-[56px] mt-0.5">
                      {name}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-neutral-500 text-center py-8">
              Upload your myteam.txt in the Team Editor tab first.
            </div>
          )}

          {/* Hover detail card */}
          {hoveredSpecies && activeMode && (
            <HoverDetail
              species={hoveredSpecies}
              mode={activeMode}
              matchup={matchupResults.find(m => m.species.toLowerCase() === hoveredSpecies.toLowerCase())}
              tank={tankResults.find(t => t.species.toLowerCase() === hoveredSpecies.toLowerCase())}
            />
          )}
        </div>
      </div>

      {/* RIGHT: Enemy Selection */}
      <div className="space-y-4">
        {/* Trainer Selector */}
        <div className="rounded-2xl border border-neutral-800 p-4 bg-neutral-900/40">
          <h2 className="text-sm font-semibold mb-3">Enemy Trainer</h2>
          <TrainerSelector
            onSelect={handleTrainerSelect}
            selected={selectedTrainer}
          />
        </div>

        {/* Enemy Team + Moves + Buttons */}
        {enemyPokemon.length > 0 && (
          <div className="rounded-2xl border border-neutral-800 p-4 bg-neutral-900/40">
            <h2 className="text-sm font-semibold mb-3">Enemy Team — click to target</h2>
            <div className="flex flex-wrap gap-3 mb-4">
              {enemyPokemon.map((p, i) => (
                <button
                  key={i}
                  onClick={() => handleSelectEnemy(p.species)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl transition ${
                    selectedEnemy?.toLowerCase() === p.species.toLowerCase()
                      ? 'bg-neutral-700 ring-2 ring-blue-500'
                      : 'bg-neutral-800 hover:bg-neutral-700'
                  }`}
                >
                  <PokemonIcon name={p.species} size={48} />
                  <span className="text-xs text-neutral-300 truncate max-w-[72px]">{p.species}</span>
                  <span className="text-[10px] text-neutral-500">Lv.{p.level}</span>
                </button>
              ))}
            </div>

            {/* Enemy Moves */}
            {selectedEnemy && enemyMoves.length > 0 && (
              <div className="mb-4">
                <div className="text-xs text-neutral-400 mb-2">
                  {selectedEnemy}'s moves — select one for "Find Tanks"
                </div>
                <div className="flex flex-wrap gap-2">
                  {enemyMoves.map((move, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedMove(
                        selectedMove === move ? null : move
                      )}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                        selectedMove === move
                          ? 'bg-blue-600 text-white ring-1 ring-blue-400'
                          : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
                      }`}
                    >
                      {move}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={findMatchups}
                disabled={!selectedEnemy || !myText || loading}
                className="px-5 py-2 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {loading && activeMode === 'matchups' ? 'Calculating...' : 'Find Matchups'}
              </button>
              <button
                onClick={findTanks}
                disabled={!selectedEnemy || !selectedMove || !myText || loading}
                className="px-5 py-2 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition"
                title={!selectedMove ? 'Select an enemy move first' : ''}
              >
                {loading && activeMode === 'tanks' ? 'Calculating...' : 'Find Tanks'}
              </button>
            </div>

            {/* Error Display */}
            {error && (
              <div className="mt-3 p-3 rounded-xl bg-red-900/30 border border-red-800 text-xs text-red-300">
                {error}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function HoverDetail({ species, mode, matchup, tank }: {
  species: string;
  mode: 'matchups' | 'tanks';
  matchup?: MatchupResult;
  tank?: TankResult;
}) {
  if (mode === 'matchups' && matchup && matchup.tier !== 'none') {
    const speedLabel = matchup.mySpeed >= matchup.enemySpeed ? 'Outspeeds' : 'Slower';
    return (
      <div className="mt-3 p-3 rounded-xl bg-neutral-800/80 border border-neutral-700 text-xs space-y-1">
        <div className="font-semibold text-neutral-200">{species}</div>
        <div className="text-neutral-400">
          {speedLabel} (Speed: {matchup.mySpeed} vs {matchup.enemySpeed})
        </div>
        <div>
          Best move: <span className="text-white font-medium">{matchup.bestMove}</span>
          {' '}&mdash; {matchup.bestMoveDmgPct}% max, {matchup.bestMoveMinPct}% min
        </div>
        <div>
          Enemy best: <span className="text-white font-medium">{matchup.enemyBestMove || '(none)'}</span>
          {matchup.enemyBestMove && <> &mdash; {matchup.enemyBestDmgPct}%</>}
        </div>
      </div>
    );
  }
  if (mode === 'tanks' && tank && tank.tier !== 'none') {
    return (
      <div className="mt-3 p-3 rounded-xl bg-neutral-800/80 border border-neutral-700 text-xs space-y-1">
        <div className="font-semibold text-neutral-200">{species}</div>
        <div>
          Takes <span className="text-white font-medium">{tank.hitsToKO}</span> hits to KO
        </div>
        <div className="text-neutral-400">
          {tank.dmgPctPerHit}% damage per hit
        </div>
      </div>
    );
  }
  return null;
}
