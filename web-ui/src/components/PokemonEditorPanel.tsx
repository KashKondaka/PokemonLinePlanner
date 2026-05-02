import React, { useState, useEffect, useCallback } from 'react';
import PokemonIcon from './PokemonIcon';
import type { EnrichedPokemon } from '../logic/parsers';

const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
const STAT_LABELS: Record<string, string> = {
  hp: 'HP', atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed',
};

const NATURES = [
  'Hardy', 'Lonely', 'Brave', 'Adamant', 'Naughty',
  'Bold', 'Docile', 'Relaxed', 'Impish', 'Lax',
  'Timid', 'Hasty', 'Serious', 'Jolly', 'Naive',
  'Modest', 'Mild', 'Quiet', 'Bashful', 'Rash',
  'Calm', 'Gentle', 'Sassy', 'Careful', 'Quirky',
];

const NATURE_EFFECTS: Record<string, { plus?: string; minus?: string }> = {
  Lonely:  { plus: 'atk', minus: 'def' },
  Brave:   { plus: 'atk', minus: 'spe' },
  Adamant: { plus: 'atk', minus: 'spa' },
  Naughty: { plus: 'atk', minus: 'spd' },
  Bold:    { plus: 'def', minus: 'atk' },
  Relaxed: { plus: 'def', minus: 'spe' },
  Impish:  { plus: 'def', minus: 'spa' },
  Lax:     { plus: 'def', minus: 'spd' },
  Timid:   { plus: 'spe', minus: 'atk' },
  Hasty:   { plus: 'spe', minus: 'def' },
  Jolly:   { plus: 'spe', minus: 'spa' },
  Naive:   { plus: 'spe', minus: 'spd' },
  Modest:  { plus: 'spa', minus: 'atk' },
  Mild:    { plus: 'spa', minus: 'def' },
  Quiet:   { plus: 'spa', minus: 'spe' },
  Rash:    { plus: 'spa', minus: 'spd' },
  Calm:    { plus: 'spd', minus: 'atk' },
  Gentle:  { plus: 'spd', minus: 'def' },
  Sassy:   { plus: 'spd', minus: 'spe' },
  Careful: { plus: 'spd', minus: 'spa' },
};

function natureLabel(name: string): string {
  const fx = NATURE_EFFECTS[name];
  if (!fx) return name;
  return `${name} (+${STAT_LABELS[fx.plus!]?.slice(0, 3) ?? ''}, -${STAT_LABELS[fx.minus!]?.slice(0, 3) ?? ''})`;
}

function computeStat(
  statKey: string, base: number, iv: number, ev: number, level: number, nature?: string,
): number {
  if (statKey === 'hp') {
    if (base === 1) return 1;
    return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
  }
  let val = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5;
  const fx = nature ? NATURE_EFFECTS[nature] : undefined;
  if (fx?.plus === statKey) val = Math.floor(val * 1.1);
  if (fx?.minus === statKey) val = Math.floor(val * 0.9);
  return val;
}

const TYPE_COLORS: Record<string, string> = {
  Normal: 'bg-neutral-400', Fire: 'bg-red-500', Water: 'bg-blue-500', Electric: 'bg-yellow-400',
  Grass: 'bg-green-500', Ice: 'bg-cyan-300', Fighting: 'bg-red-700', Poison: 'bg-purple-500',
  Ground: 'bg-yellow-700', Flying: 'bg-indigo-300', Psychic: 'bg-pink-500', Bug: 'bg-lime-500',
  Rock: 'bg-yellow-800', Ghost: 'bg-purple-700', Dragon: 'bg-indigo-600', Dark: 'bg-neutral-700',
  Steel: 'bg-neutral-500', Fairy: 'bg-pink-300',
};

const CATEGORY_COLORS: Record<string, string> = {
  Physical: 'bg-red-700 text-red-100',
  Special: 'bg-blue-700 text-blue-100',
  Status: 'bg-neutral-600 text-neutral-200',
};

type MoveDetail = { bp: number; type: string; category: string };
type LearnsetData = {
  moves: string[];
  abilities: string[];
  moveDetails: Record<string, MoveDetail>;
};

type Props = {
  pokemon: EnrichedPokemon;
  gen: number;
  items: string[];
  onSave: (updated: EnrichedPokemon) => void;
  onDuplicate: (pokemon: EnrichedPokemon) => void;
  onDelete: () => void;
};

function ConfirmDialog({ message, onConfirm, onCancel }: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-5 max-w-sm w-full mx-4 shadow-xl">
        <p className="text-sm text-neutral-200 mb-4">{message}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 rounded-lg text-sm bg-neutral-700 hover:bg-neutral-600 text-neutral-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-1.5 rounded-lg text-sm bg-red-600 hover:bg-red-500 text-white font-semibold transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PokemonEditorPanel({ pokemon, gen, items, onSave, onDuplicate, onDelete }: Props) {
  const [draft, setDraft] = useState<EnrichedPokemon>({ ...pokemon });
  const [learnset, setLearnset] = useState<LearnsetData>({ moves: [], abilities: [], moveDetails: {} });
  const [confirm, setConfirm] = useState<{ action: 'save' | 'duplicate' | 'delete' } | null>(null);

  useEffect(() => {
    setDraft({ ...pokemon });
  }, [pokemon]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/learnset/${encodeURIComponent(pokemon.species)}?gen=${gen}`)
      .then(r => r.json())
      .then((data: LearnsetData) => {
        if (!cancelled) setLearnset(data);
      })
      .catch(() => {
        if (!cancelled) setLearnset({ moves: [], abilities: [], moveDetails: {} });
      });
    return () => { cancelled = true; };
  }, [pokemon.species, gen]);

  const updateField = useCallback(<K extends keyof EnrichedPokemon>(key: K, value: EnrichedPokemon[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  }, []);

  const updateIV = useCallback((stat: string, value: number) => {
    setDraft(prev => ({ ...prev, ivs: { ...prev.ivs, [stat]: value } }));
  }, []);

  const updateEV = useCallback((stat: string, value: number) => {
    setDraft(prev => ({ ...prev, evs: { ...prev.evs, [stat]: value } }));
  }, []);

  const updateMove = useCallback((index: number, moveName: string) => {
    setDraft(prev => {
      const moves = [...prev.moves];
      moves[index] = moveName;
      const moveDetails = [...prev.moveDetails];
      const info = learnset.moveDetails[moveName];
      if (info) {
        moveDetails[index] = { name: moveName, bp: info.bp, type: info.type, category: info.category };
      } else {
        moveDetails[index] = { name: moveName, bp: 0, type: 'Normal', category: 'Status' };
      }
      return { ...prev, moves, moveDetails };
    });
  }, [learnset.moveDetails]);

  const totalEVs = STAT_KEYS.reduce((sum, k) => sum + (draft.evs[k] ?? 0), 0);
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(pokemon);

  const handleConfirm = () => {
    if (!confirm) return;
    if (confirm.action === 'save') onSave(draft);
    else if (confirm.action === 'duplicate') onDuplicate(draft);
    else if (confirm.action === 'delete') onDelete();
    setConfirm(null);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {confirm && (
        <ConfirmDialog
          message={
            confirm.action === 'delete'
              ? `Are you sure you want to delete ${draft.species}? This cannot be undone.`
              : confirm.action === 'save'
              ? `Save changes to ${draft.species}?`
              : `Duplicate ${draft.species} in your collection?`
          }
          onConfirm={handleConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-neutral-700">
        <PokemonIcon name={draft.species} size={64} />
        <div className="flex-1">
          <h2 className="text-xl font-bold">{draft.species}</h2>
          <div className="flex gap-1.5 mt-1">
            {draft.types.map(t => (
              <span
                key={t}
                className={`text-[10px] px-2 py-0.5 rounded font-semibold text-white ${TYPE_COLORS[t] ?? 'bg-neutral-600'}`}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Level + Nature + Ability + Item */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <label className="block">
          <span className="text-xs text-neutral-400">Level</span>
          <input
            type="number"
            min={1}
            max={100}
            value={draft.level}
            onChange={e => updateField('level', Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
            className="w-full mt-0.5 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs text-neutral-400">Nature</span>
          <select
            value={draft.nature ?? ''}
            onChange={e => updateField('nature', e.target.value || undefined)}
            className="w-full mt-0.5 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="">-- None --</option>
            {NATURES.map(n => (
              <option key={n} value={n}>{natureLabel(n)}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-neutral-400">Ability</span>
          {learnset.abilities.length > 0 ? (
            <select
              value={draft.ability ?? ''}
              onChange={e => updateField('ability', e.target.value || undefined)}
              className="w-full mt-0.5 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="">-- None --</option>
              {learnset.abilities.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={draft.ability ?? ''}
              onChange={e => updateField('ability', e.target.value || undefined)}
              className="w-full mt-0.5 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm"
            />
          )}
        </label>
        <label className="block">
          <span className="text-xs text-neutral-400">Item</span>
          {items.length > 0 ? (
            <select
              value={draft.item ?? ''}
              onChange={e => updateField('item', e.target.value || undefined)}
              className="w-full mt-0.5 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="">-- None --</option>
              {draft.item && !items.includes(draft.item) && (
                <option value={draft.item}>{draft.item}</option>
              )}
              {items.map(it => (
                <option key={it} value={it}>{it}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={draft.item ?? ''}
              onChange={e => updateField('item', e.target.value || undefined)}
              className="w-full mt-0.5 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm"
            />
          )}
        </label>
      </div>

      {/* Stats Table */}
      <div className="mb-4">
        <div className="text-xs text-neutral-400 mb-2 flex items-center justify-between">
          <span>Stats</span>
          <span className={`text-[10px] ${totalEVs > 510 ? 'text-red-400' : 'text-neutral-500'}`}>
            EVs: {totalEVs}/510
          </span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-neutral-500 border-b border-neutral-800">
              <th className="text-left py-1 font-medium">Stat</th>
              <th className="text-center py-1 font-medium w-14">Base</th>
              <th className="text-center py-1 font-medium w-16">IVs</th>
              <th className="text-center py-1 font-medium w-16">EVs</th>
              <th className="text-right py-1 font-medium w-14">Total</th>
            </tr>
          </thead>
          <tbody>
            {STAT_KEYS.map(key => {
              const base = draft.baseStats[key] ?? 0;
              const iv = draft.ivs[key] ?? 31;
              const ev = draft.evs[key] ?? 0;
              const computed = computeStat(key, base, iv, ev, draft.level, draft.nature);
              const fx = draft.nature ? NATURE_EFFECTS[draft.nature] : undefined;
              const isPlus = fx?.plus === key;
              const isMinus = fx?.minus === key;

              return (
                <tr key={key} className="border-b border-neutral-800/50">
                  <td className={`py-1.5 font-medium ${isPlus ? 'text-emerald-400' : isMinus ? 'text-red-400' : ''}`}>
                    {STAT_LABELS[key]}
                  </td>
                  <td className="text-center text-neutral-400">{base}</td>
                  <td className="text-center">
                    <input
                      type="number"
                      min={0}
                      max={31}
                      value={iv}
                      onChange={e => updateIV(key, Math.max(0, Math.min(31, parseInt(e.target.value) || 0)))}
                      className="w-12 bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-center text-xs"
                    />
                  </td>
                  <td className="text-center">
                    <input
                      type="number"
                      min={0}
                      max={252}
                      step={4}
                      value={ev}
                      onChange={e => updateEV(key, Math.max(0, Math.min(252, parseInt(e.target.value) || 0)))}
                      className="w-14 bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-center text-xs"
                    />
                  </td>
                  <td className={`text-right font-semibold ${isPlus ? 'text-emerald-400' : isMinus ? 'text-red-400' : ''}`}>
                    {computed}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Moves */}
      <div className="mb-4">
        <div className="text-xs text-neutral-400 mb-2">Moves</div>
        {/* Header row */}
        <div className="grid grid-cols-[1fr_4.5rem_5rem_3rem] gap-1.5 text-[10px] text-neutral-500 font-medium px-3 mb-1">
          <span>Move</span>
          <span className="text-center">Type</span>
          <span className="text-center">Cat.</span>
          <span className="text-right">BP</span>
        </div>
        <div className="space-y-1">
          {Array.from({ length: 4 }).map((_, i) => {
            const move = draft.moves[i] ?? '';
            const detail = draft.moveDetails[i];
            return (
              <div key={i} className="grid grid-cols-[1fr_4.5rem_5rem_3rem] gap-1.5 items-center bg-neutral-800/60 rounded-lg px-3 py-1.5">
                {learnset.moves.length > 0 ? (
                  <select
                    value={move}
                    onChange={e => updateMove(i, e.target.value)}
                    className="bg-transparent text-sm outline-none truncate"
                  >
                    <option value="">-- Select --</option>
                    {move && !learnset.moves.includes(move) && (
                      <option value={move}>{move}</option>
                    )}
                    {learnset.moves.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={move}
                    onChange={e => updateMove(i, e.target.value)}
                    placeholder={`Move ${i + 1}`}
                    className="bg-transparent text-sm outline-none truncate"
                  />
                )}
                <div className="flex justify-center">
                  {detail && move ? (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold text-white text-center ${TYPE_COLORS[detail.type] ?? 'bg-neutral-600'}`}>
                      {detail.type}
                    </span>
                  ) : <span className="text-neutral-600 text-[10px]">--</span>}
                </div>
                <div className="flex justify-center">
                  {detail && move ? (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold text-center ${CATEGORY_COLORS[detail.category] ?? ''}`}>
                      {detail.category}
                    </span>
                  ) : <span className="text-neutral-600 text-[10px]">--</span>}
                </div>
                <div className="text-right text-[11px] text-neutral-400">
                  {detail && move && detail.bp > 0 ? detail.bp : '--'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-auto pt-3 border-t border-neutral-700 flex gap-2">
        <button
          onClick={() => setConfirm({ action: 'save' })}
          disabled={!hasChanges}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
            hasChanges
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
              : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
          }`}
        >
          Save
        </button>
        <button
          onClick={() => setConfirm({ action: 'duplicate' })}
          className="flex-1 py-2 rounded-lg text-sm font-semibold bg-neutral-700 hover:bg-neutral-600 text-neutral-200 transition-colors"
        >
          Duplicate
        </button>
        <button
          onClick={() => setConfirm({ action: 'delete' })}
          className="py-2 px-4 rounded-lg text-sm font-semibold bg-red-900/60 hover:bg-red-800 text-red-200 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
