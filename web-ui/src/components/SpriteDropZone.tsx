import React, { useState, useRef, useEffect } from 'react';
import SpriteWithHP from './SpriteWithHP';
import PokemonIcon from './PokemonIcon';

type TeamMember = {
  name: string;
  source: 'my' | 'enemy';
};

type Props = {
  pokemonName?: string;
  source?: 'my' | 'enemy';
  pct?: number;
  curHP?: number;
  maxHP?: number;
  acceptFrom?: 'my' | 'enemy' | 'any';
  onDrop: (name: string, source: 'my' | 'enemy') => void;
  onClear?: () => void;
  label?: string;
  selectableTeam?: TeamMember[];
};

export default function SpriteDropZone({
  pokemonName, source, pct = 100, curHP, maxHP,
  acceptFrom = 'any', onDrop, onClear, label,
  selectableTeam = [],
}: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen]);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (acceptFrom !== 'any' && data.source !== acceptFrom) return;
      onDrop(data.name, data.source);
    } catch {
      onDrop(raw, 'my');
    }
  }

  function handleClick() {
    if (selectableTeam.length > 0) {
      setPickerOpen(prev => !prev);
    }
  }

  function handlePick(member: TeamMember) {
    onDrop(member.name, member.source);
    setPickerOpen(false);
  }

  const playerMembers = selectableTeam.filter(m => m.source === 'my');
  const enemyMembers = selectableTeam.filter(m => m.source === 'enemy');
  const hasOptions = selectableTeam.length > 0;

  function renderPickerDropdown(stopPropagation = false) {
    if (!pickerOpen || !hasOptions) return null;
    return (
      <div className="absolute z-40 top-full mt-1 left-1/2 -translate-x-1/2 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl py-1 min-w-[140px] max-h-64 overflow-y-auto">
        {playerMembers.length > 0 && (
          <>
            <div className="px-2 py-1 text-[9px] font-semibold text-blue-400 bg-blue-950/40 border-b border-neutral-800 sticky top-0">
              Player
            </div>
            {playerMembers.map(m => (
              <button
                key={`my-${m.name}`}
                onClick={e => { if (stopPropagation) e.stopPropagation(); handlePick(m); }}
                className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-neutral-800 transition text-left"
              >
                <PokemonIcon name={m.name} size={24} />
                <span className="text-xs truncate">{m.name}</span>
              </button>
            ))}
          </>
        )}
        {playerMembers.length > 0 && enemyMembers.length > 0 && (
          <div className="border-t border-neutral-700 my-0.5" />
        )}
        {enemyMembers.length > 0 && (
          <>
            <div className="px-2 py-1 text-[9px] font-semibold text-red-400 bg-red-950/40 border-b border-neutral-800 sticky top-0">
              Enemy
            </div>
            {enemyMembers.map(m => (
              <button
                key={`enemy-${m.name}`}
                onClick={e => { if (stopPropagation) e.stopPropagation(); handlePick(m); }}
                className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-neutral-800 transition text-left"
              >
                <PokemonIcon name={m.name} size={24} />
                <span className="text-xs truncate">{m.name}</span>
              </button>
            ))}
          </>
        )}
      </div>
    );
  }

  if (pokemonName) {
    return (
      <div className="relative group" ref={pickerRef}>
        <div onClick={handleClick} className={hasOptions ? 'cursor-pointer' : ''}>
          <SpriteWithHP
            name={pokemonName}
            pct={pct}
            curHP={curHP}
            maxHP={maxHP}
            size={48}
          />
        </div>
        {onClear && (
          <button
            onClick={e => { e.stopPropagation(); onClear(); }}
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-neutral-700 border border-neutral-600 text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-red-600"
          >
            ×
          </button>
        )}
        {source && (
          <div className={`text-center text-[8px] mt-0.5 px-1 rounded w-fit mx-auto ${
            source === 'my' ? 'bg-blue-900/60 text-blue-300' : 'bg-red-900/60 text-red-300'
          }`}>
            {source === 'my' ? 'P' : 'E'}
          </div>
        )}
        {renderPickerDropdown()}
      </div>
    );
  }

  return (
    <div
      ref={pickerRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      className={`relative w-14 h-16 rounded-lg border-2 border-dashed flex flex-col items-center justify-center transition ${
        hasOptions ? 'cursor-pointer' : ''
      } ${
        dragOver
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-neutral-700 bg-neutral-900/40 hover:border-neutral-600'
      }`}
    >
      <span className="text-neutral-600 text-lg">+</span>
      {label && <span className="text-[8px] text-neutral-600">{label}</span>}
      {renderPickerDropdown(true)}
    </div>
  );
}
