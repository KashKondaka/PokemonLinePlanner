import React, { useState, useEffect, useCallback } from 'react';
import PokemonIcon from './PokemonIcon';
import PokemonEditorPanel from './PokemonEditorPanel';
import {
  type EnrichedPokemon,
  serializeToShowdown,
  replaceBlockInMyText,
  appendBlockToMyText,
  deleteBlockFromMyText,
} from '../logic/parsers';

type Props = {
  myText: string;
  gen: number;
  onMyTextChange: (text: string) => void;
};

export default function TeamEditor({ myText, gen, onMyTextChange }: Props) {
  const [collection, setCollection] = useState<EnrichedPokemon[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<string[]>([]);

  useEffect(() => {
    fetch(`/api/items?gen=${gen}`)
      .then(r => r.json())
      .then((data: string[]) => setItems(data))
      .catch(() => setItems([]));
  }, [gen]);

  const fetchTeamDetails = useCallback(async () => {
    if (!myText.trim()) {
      setCollection([]);
      setSelectedIndex(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/team-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ myText, gen }),
      });
      if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
      const data: EnrichedPokemon[] = await resp.json();
      setCollection(data);
      setSelectedIndex(prev => {
        if (prev !== null && prev >= data.length) {
          return data.length > 0 ? 0 : null;
        }
        return prev;
      });
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load team details');
    } finally {
      setLoading(false);
    }
  }, [myText, gen]);

  useEffect(() => {
    fetchTeamDetails();
  }, [fetchTeamDetails]);

  const handleSave = useCallback((updated: EnrichedPokemon) => {
    if (selectedIndex === null) return;
    const block = serializeToShowdown(updated);
    const newText = replaceBlockInMyText(myText, selectedIndex, block);
    onMyTextChange(newText);
  }, [myText, selectedIndex, onMyTextChange]);

  const handleDuplicate = useCallback((pokemon: EnrichedPokemon) => {
    const block = serializeToShowdown(pokemon);
    const newText = appendBlockToMyText(myText, block);
    onMyTextChange(newText);
    setTimeout(() => {
      setSelectedIndex(collection.length);
    }, 100);
  }, [myText, collection.length, onMyTextChange]);

  const handleDelete = useCallback(() => {
    if (selectedIndex === null) return;
    const newText = deleteBlockFromMyText(myText, selectedIndex);
    onMyTextChange(newText);
    setSelectedIndex(prev => {
      if (prev === null) return null;
      if (collection.length <= 1) return null;
      return prev >= collection.length - 1 ? prev - 1 : prev;
    });
  }, [myText, selectedIndex, collection.length, onMyTextChange]);

  const selected = selectedIndex !== null ? collection[selectedIndex] : null;

  return (
    <div className="flex gap-4 min-h-[600px]">
      {/* Left: Collection List */}
      <div className="w-1/2 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold">Pokemon Collection</h3>
          <span className="text-xs text-neutral-500">{collection.length} pokemon</span>
        </div>

        {loading && (
          <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm">
            Loading team details...
          </div>
        )}

        {error && (
          <div className="text-red-400 text-sm mb-2">{error}</div>
        )}

        {!loading && collection.length === 0 && !error && (
          <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm">
            Upload a myteam.txt to see your collection
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-1">
          {collection.map((poke, idx) => (
            <button
              key={`${poke.species}-${idx}`}
              onClick={() => setSelectedIndex(idx)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                selectedIndex === idx
                  ? 'bg-neutral-700/80 border border-neutral-600'
                  : 'hover:bg-neutral-800/80 border border-transparent'
              }`}
            >
              <PokemonIcon name={poke.species} size={40} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{poke.species}</div>
                <div className="text-[11px] text-neutral-400 flex gap-2">
                  <span>Lv. {poke.level}</span>
                  {poke.item && <span>@ {poke.item}</span>}
                </div>
              </div>
              <div className="flex gap-1">
                {poke.types.map(t => (
                  <span
                    key={t}
                    className={`text-[9px] px-1.5 py-0.5 rounded font-semibold text-white ${
                      TYPE_COLORS[t] ?? 'bg-neutral-600'
                    }`}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: Pokemon Editor */}
      <div className="w-1/2 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 flex flex-col">
        {selected ? (
          <PokemonEditorPanel
            key={`${selected.species}-${selectedIndex}`}
            pokemon={selected}
            gen={gen}
            items={items}
            onSave={handleSave}
            onDuplicate={handleDuplicate}
            onDelete={handleDelete}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm">
            {collection.length > 0
              ? 'Select a Pokemon from the collection to edit'
              : 'No Pokemon to edit yet'}
          </div>
        )}
      </div>
    </div>
  );
}

const TYPE_COLORS: Record<string, string> = {
  Normal: 'bg-neutral-400', Fire: 'bg-red-500', Water: 'bg-blue-500', Electric: 'bg-yellow-400',
  Grass: 'bg-green-500', Ice: 'bg-cyan-300', Fighting: 'bg-red-700', Poison: 'bg-purple-500',
  Ground: 'bg-yellow-700', Flying: 'bg-indigo-300', Psychic: 'bg-pink-500', Bug: 'bg-lime-500',
  Rock: 'bg-yellow-800', Ghost: 'bg-purple-700', Dragon: 'bg-indigo-600', Dark: 'bg-neutral-700',
  Steel: 'bg-neutral-500', Fairy: 'bg-pink-300',
};
