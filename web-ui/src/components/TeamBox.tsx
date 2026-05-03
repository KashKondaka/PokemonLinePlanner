// src/components/TeamBox.tsx
import React from 'react';
import PokemonIcon from './PokemonIcon';

export type StatusType = 'burn' | 'psn' | 'tox' | 'par' | 'frz';

export type StatStages = {
  atk: number;
  def: number;
  spatk: number;
  spdef: number;
  spd: number;
};

export type TeamMember = {
  name: string;
  pct: number;
  maxHP?: number;
  curHP?: number;
  item?: string;
  speed?: number;
  berry?: { name: string; consumed: boolean } | undefined;
  status?: { type: StatusType; toxicStage?: number } | undefined;
  statStages?: StatStages;
};

type Props = {
  title: string;
  subtitle?: string;
  members: (TeamMember | undefined)[];
  editable?: boolean;
  onDropToSlot?: (index: number, species: string) => void;
  onRemove?: (index: number) => void;
  onChangeStatus?: (index: number, status: StatusType | undefined) => void;
  onChangeItem?: (index: number, item: string | undefined) => void;
  onChangeHP?: (index: number, curHP: number, maxHP: number) => void;
};

const STATUS_OPTIONS: { label: string; value?: StatusType }[] = [
  { label: '(status)', value: undefined },
  { label: 'BRN', value: 'burn' },
  { label: 'PSN', value: 'psn' },
  { label: 'BPSN', value: 'tox' },
  { label: 'PRLYZ', value: 'par' },
  { label: 'FRZN', value: 'frz' },
];

const ITEM_OPTIONS: { label: string; value?: string }[] = [
  { label: '(item)', value: undefined },
  // Healing/status berries
  { label: 'oran', value: 'Oran Berry' },
  { label: 'sitrus', value: 'Sitrus Berry' },
  { label: 'iapapa', value: 'Iapapa Berry' },
  { label: 'figy', value: 'Figy Berry' },
  { label: 'wiki', value: 'Wiki Berry' },
  { label: 'mago', value: 'Mago Berry' },
  { label: 'aguav', value: 'Aguav Berry' },
  { label: 'pecha', value: 'Pecha Berry' },
  { label: 'rawst', value: 'Rawst Berry' },
  { label: 'aspear', value: 'Aspear Berry' },
  { label: 'chesto', value: 'Chesto Berry' },
  { label: 'cheri', value: 'Cheri Berry' },
  // Passive healing
  { label: 'leftovers', value: 'Leftovers' },
  // Boosters (short codes → canonical)
  { label: 'blk glss', value: 'Black Glasses' },
  { label: 'nvr ice', value: 'Never-Melt Ice' },
  { label: 'mys wtr', value: 'Mystic Water' },
  { label: 'sft snd', value: 'Soft Sand' },
  { label: 'psn brb', value: 'Poison Barb' },
  { label: 'mrcle seed', value: 'Miracle Seed' },
  { label: 'slvr pwdr', value: 'Silver Powder' },
  { label: 'shrp bk', value: 'Sharp Beak' },
  { label: 'pxie plte', value: 'Pixie Plate' },
  { label: 'blk blt', value: 'Black Belt' },
  { label: 'mtl ct', value: 'Metal Coat' },
  { label: 'drg fng', value: 'Dragon Fang' },
  { label: 'chrcl', value: 'Charcoal' },
  { label: 'mgnt', value: 'Magnet' },
  { label: 'twst spn', value: 'Twisted Spoon' },
  { label: 'spl tg', value: 'Spell Tag' },
  { label: 'rck gem', value: 'Rock Gem' },
  { label: 'drk gem', value: 'Dark Gem' },
  { label: 'psn gm', value: 'Poison Gem' },
  { label: 'grnd gm', value: 'Ground Gem' },
  { label: 'stl gm', value: 'Steel Gem' },
  { label: 'ele gm', value: 'Electric Gem' },
  { label: 'grs gm', value: 'Grass Gem' },
  { label: 'fly gm', value: 'Flying Gem' },
  { label: 'fire gm', value: 'Fire Gem' },
  { label: 'psy gm', value: 'Psychic Gem' },
  { label: 'bug gm', value: 'Bug Gem' },
  { label: 'nrm gm', value: 'Normal Gem' },
  { label: 'ghst gm', value: 'Ghost Gem' },
  { label: 'ice gm', value: 'Ice Gem' },
  { label: 'fght gm', value: 'Fighting Gem' },
  { label: 'wtr gm', value: 'Water Gem' },
  { label: 'fry gm', value: 'Fairy Gem' },
  { label: 'drg gm', value: 'Dragon Gem' },
];

function statusPillStyle(s?: StatusType) {
  switch (s) {
    case 'par': return 'bg-yellow-400 text-yellow-950 border border-yellow-600';
    case 'burn': return 'bg-orange-500 text-orange-50 border border-orange-700';
    case 'psn': return 'bg-purple-400 text-purple-950 border border-purple-600';
    case 'tox': return 'bg-purple-700 text-purple-100 border border-purple-900';
    case 'frz': return 'bg-cyan-400 text-cyan-950 border border-cyan-600';
    default: return 'bg-neutral-700 text-neutral-200 border border-neutral-600';
  }
}
function statusLabel(s?: StatusType) {
  if (!s) return '';
  if (s === 'burn') return 'BRN';
  if (s === 'par')  return 'PRLYZ';
  if (s === 'psn')  return 'PSN';
  if (s === 'tox')  return 'BPSN';
  if (s === 'frz')  return 'FRZN';
  return '';
}

function formatStatStage(stage: number): string {
  if (stage === 0) return '—';
  if (stage > 0) return `+${stage}`;
  return `${stage}`;
}

function getStatStageColor(stage: number): string {
  if (stage === 0) return 'text-neutral-500';
  if (stage > 0) return 'text-emerald-400';
  return 'text-red-400';
}

export default function TeamBox({
  title,
  subtitle,
  members,
  editable,
  onDropToSlot,
  onRemove,
  onChangeStatus,
  onChangeItem,
  onChangeHP,
}: Props) {
  const [editingHP, setEditingHP] = React.useState<number | null>(null);
  const [tempCurHP, setTempCurHP] = React.useState<string>('');
  const [tempMaxHP, setTempMaxHP] = React.useState<string>('');

  const handleDragOver = (e: React.DragEvent) => {
    if (!editable) return;
    e.preventDefault();
  };
  const handleDrop = (index: number, e: React.DragEvent) => {
    if (!editable || !onDropToSlot) return;
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      onDropToSlot(index, data.name ?? raw);
    } catch {
      onDropToSlot(index, raw);
    }
  };

  const startEditingHP = (idx: number, curHP: number | undefined, maxHP: number | undefined) => {
    if (!editable) return;
    setEditingHP(idx);
    setTempCurHP(String(curHP ?? maxHP ?? 0));
    setTempMaxHP(String(maxHP ?? 0));
  };

  const finishEditingHP = (idx: number) => {
    const newMaxHP = Math.max(1, parseInt(tempMaxHP) || 0);
    const newCurHP = Math.max(0, Math.min(newMaxHP, parseInt(tempCurHP) || 0));
    onChangeHP?.(idx, newCurHP, newMaxHP);
    setEditingHP(null);
  };

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-base font-semibold">{title}</h3>
      </div>
      {subtitle && <div className="text-xs text-neutral-400 mb-3">{subtitle}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Array.from({ length: Math.max(6, members.length || 0) }).map((_, idx) => {
          const m = members[idx];
          const pct = Math.max(0, Math.min(100, Math.round(m?.pct ?? 100))); // Default to 100 for full HP
          const maxHP = m?.maxHP;
          const curHP = (typeof m?.curHP === 'number')
            ? m!.curHP!
            : (typeof maxHP === 'number' ? Math.max(0, Math.round((pct / 100) * maxHP)) : undefined);

          const barColor =
            pct > 50 ? 'from-emerald-600 to-emerald-700'
            : pct > 25 ? 'from-yellow-500 to-yellow-600'
            : 'from-red-600 to-red-700';

          return (
            <div
              key={idx}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(idx, e)}
              className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {m?.name ? (
                    <PokemonIcon name={m.name} size={40} />
                  ) : (
                    <span className="text-neutral-500 italic">Empty slot</span>
                  )}
                  {/* Status indicator - show for all teams */}
                  {m?.status?.type && (
                    <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${statusPillStyle(m.status.type)}`}>
                      {statusLabel(m.status.type)}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {editable && m?.name && (
                    <button
                      onClick={() => onRemove?.(idx)}
                      className="h-6 w-6 inline-flex items-center justify-center rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-sm"
                      title="Remove"
                    >
                      –
                    </button>
                  )}
                </div>
              </div>

              {/* Stat Stages Display */}
              {m?.name && (
                <div className="mt-1 text-[10px] text-neutral-400 grid grid-cols-3 gap-x-2 gap-y-0.5">
                  <span>Atk: <span className={getStatStageColor(m.statStages?.atk ?? 0)}>{formatStatStage(m.statStages?.atk ?? 0)}</span></span>
                  <span>Def: <span className={getStatStageColor(m.statStages?.def ?? 0)}>{formatStatStage(m.statStages?.def ?? 0)}</span></span>
                  <span>SpA: <span className={getStatStageColor(m.statStages?.spatk ?? 0)}>{formatStatStage(m.statStages?.spatk ?? 0)}</span></span>
                  <span>SpD: <span className={getStatStageColor(m.statStages?.spdef ?? 0)}>{formatStatStage(m.statStages?.spdef ?? 0)}</span></span>
                  <span>Spd: <span className={getStatStageColor(m.statStages?.spd ?? 0)}>{formatStatStage(m.statStages?.spd ?? 0)}</span></span>
                </div>
              )}

              <div className="mt-2">
                <div 
                  className={`relative h-3 w-full rounded bg-neutral-800 overflow-hidden ${editable && m?.name ? 'cursor-pointer hover:ring-1 hover:ring-neutral-600' : ''}`}
                  onClick={() => editable && m?.name && startEditingHP(idx, curHP, maxHP)}
                >
                  <div
                    className={`absolute left-0 top-0 h-full bg-gradient-to-r ${barColor} transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                  {editingHP === idx ? (
                    <div className="absolute inset-0 flex items-center justify-center gap-0.5 text-[10px] font-semibold bg-neutral-900/95">
                      <input
                        type="number"
                        value={tempCurHP}
                        onChange={(e) => setTempCurHP(e.target.value)}
                        onBlur={() => finishEditingHP(idx)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') finishEditingHP(idx);
                          if (e.key === 'Escape') setEditingHP(null);
                        }}
                        autoFocus
                        className="w-12 bg-transparent text-center text-white outline-none"
                      />
                      <span className="text-white">/</span>
                      <input
                        type="number"
                        value={tempMaxHP}
                        onChange={(e) => setTempMaxHP(e.target.value)}
                        onBlur={() => finishEditingHP(idx)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') finishEditingHP(idx);
                          if (e.key === 'Escape') setEditingHP(null);
                        }}
                        className="w-12 bg-transparent text-center text-white outline-none"
                      />
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-black">
                      {typeof curHP === 'number' && typeof maxHP === 'number'
                        ? `${curHP}/${maxHP}`
                        : (typeof maxHP === 'number' ? `${maxHP}/${maxHP}` : '—/—')}
                    </div>
                  )}
                </div>
                <div className="text-[11px] text-neutral-400 mt-1">{pct}%</div>
              </div>

              {editable && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <select
                    value={m?.status?.type ?? ''}
                    onChange={(e) =>
                      onChangeStatus?.(idx, (e.target.value || undefined) as StatusType | undefined)
                    }
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1.5 text-xs"
                  >
                    {STATUS_OPTIONS.map(opt => (
                      <option key={opt.label} value={opt.value ?? ''}>{opt.label}</option>
                    ))}
                  </select>

                  <select
                    value={m?.item ?? ''}
                    onChange={(e) => onChangeItem?.(idx, e.target.value || undefined)}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1.5 text-xs"
                  >
                    {ITEM_OPTIONS.map(opt => (
                      <option key={opt.label} value={opt.value ?? ''}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {(m?.item || m?.status?.type) && (
                <div className="mt-2 text-[10px] text-neutral-400 flex flex-wrap items-center gap-2">
                  {m?.item && (
                    <>
                      <span>Item: <span className="text-neutral-300">{m.item}</span></span>
                      {m.berry?.name && (
                        <span>
                          • Berry: <span className="text-neutral-300">{m.berry.name}</span>
                          {m.berry.consumed ? ' (consumed)' : ''}
                        </span>
                      )}
                    </>
                  )}
                  {m?.status?.type && (
                    <span>
                      • Status: <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${statusPillStyle(m.status.type)}`}>
                        {statusLabel(m.status.type)}
                      </span>
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
