import React, { useEffect, useMemo, useState, useRef } from 'react';
import PokemonIcon from './PokemonIcon';

type TrainerPokemon = {
  species: string;
  level: number;
  item?: string;
  moves: string[];
  nature?: string;
  ability?: string;
};

export type TrainerEntry = {
  id: number;
  name: string;
  area: string;
  tags: string[];
  pokemon: TrainerPokemon[];
};

type Props = {
  onSelect: (trainer: TrainerEntry, enemyText: string) => void;
  selected?: TrainerEntry | null;
};

export default function TrainerSelector({ onSelect, selected }: Props) {
  const [trainers, setTrainers] = useState<TrainerEntry[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/trainers')
      .then(r => r.json())
      .then(data => setTrainers(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return trainers;
    const q = search.toLowerCase();
    return trainers.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.area.toLowerCase().includes(q) ||
      t.pokemon.some(p => p.species.toLowerCase().includes(q))
    );
  }, [trainers, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, TrainerEntry[]>();
    for (const t of filtered) {
      const list = map.get(t.area) || [];
      list.push(t);
      map.set(t.area, list);
    }
    return map;
  }, [filtered]);

  async function handleSelect(trainer: TrainerEntry) {
    try {
      const resp = await fetch(`/api/trainers/${trainer.id}/enemy-text`);
      const data = await resp.json();
      onSelect(trainer, data.text);
    } catch {
      const lines = trainer.pokemon.map(p => {
        let line = `${p.species} Lv.${p.level}`;
        if (p.item && p.moves.length > 0) line += ` @${p.item}: ${p.moves.join(', ')}`;
        if (p.nature || p.ability) line += ` [${p.nature || ''}|${p.ability || ''}]`;
        return line;
      });
      onSelect(trainer, lines.join('\n'));
    }
    setOpen(false);
    setSearch('');
  }

  const tagLabel = (tags: string[]) => {
    if (!tags.length) return '';
    return ` [${tags.join(', ')}]`;
  };

  return (
    <div ref={ref} className="relative w-full">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm hover:bg-neutral-700 transition flex items-center justify-between"
      >
        <span className="truncate">
          {selected
            ? `${selected.name}${tagLabel(selected.tags)} — ${selected.area}`
            : 'Select trainer...'}
        </span>
        <span className="text-neutral-500 ml-2">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl max-h-96 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-neutral-800">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search trainer, area, or Pokemon..."
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-600"
              autoFocus
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {Array.from(grouped.entries()).map(([area, entries]) => (
              <div key={area}>
                <div className="sticky top-0 bg-neutral-800/90 backdrop-blur px-3 py-1 text-xs font-semibold text-neutral-400 border-b border-neutral-700">
                  {area || '(No area)'}
                </div>
                {entries.map(trainer => (
                  <button
                    key={trainer.id}
                    onClick={() => handleSelect(trainer)}
                    className={`w-full text-left px-3 py-2 hover:bg-neutral-800 transition flex items-center gap-2 ${
                      selected?.id === trainer.id ? 'bg-neutral-800' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">
                        {trainer.name}
                        {trainer.tags.length > 0 && (
                          <span className="text-neutral-500 text-xs ml-1">
                            [{trainer.tags.join(', ')}]
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-0.5 shrink-0">
                      {trainer.pokemon.slice(0, 6).map((p, i) => (
                        <PokemonIcon key={i} name={p.species} size={24} />
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            ))}
            {grouped.size === 0 && (
              <div className="px-3 py-4 text-sm text-neutral-500 text-center">No trainers found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
