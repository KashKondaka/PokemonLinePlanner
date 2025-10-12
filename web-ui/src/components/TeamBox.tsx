// src/components/TeamBox.tsx
import React from 'react';

export type StatusType = 'burn' | 'psn' | 'tox' | 'par' | 'frz';

export type TeamMember = {
  name: string;
  pct: number;                 // current HP in %
  maxHP?: number;              // known after first calc
  curHP?: number;              // absolute current HP if known
  item?: string;               // canonical item text (e.g., "Black Glasses", "Fire Gem", "Oran Berry")
  berry?: { name: string; consumed: boolean } | undefined;
  status?: { type: StatusType; toxicStage?: number } | undefined;
};

type Props = {
  title: string;
  subtitle?: string;
  members: (TeamMember | undefined)[];
  editable?: boolean;

  // For "My Team" box only
  onDropToSlot?: (index: number, species: string) => void;
  onRemove?: (index: number) => void;
  onChangeStatus?: (index: number, status: StatusType | undefined) => void;
  onChangeItem?: (index: number, item: string | undefined) => void;
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
  { label: 'pecha', value: 'Pecha Berry' },
  { label: 'rawst', value: 'Rawst Berry' },
  { label: 'aspear', value: 'Aspear Berry' },
  { label: 'chesto', value: 'Chesto Berry' },
  { label: 'cheri', value: 'Cheri Berry' },
  // Boosters (short codes from your list → canonical)
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
  { label: 'fry gm', value: 'Fairy Gem' }, // assuming "fry gm" = Fairy Gem
  { label: 'drg gm', value: 'Dragon Gem' },
];

function statusPillStyle(s?: StatusType) {
  switch (s) {
    case 'par': return 'bg-yellow-300 text-yellow-900';      // PRLYZ
    case 'burn': return 'bg-orange-500 text-orange-50';       // BRN
    case 'psn': return 'bg-purple-300 text-purple-900';       // PSN
    case 'tox': return 'bg-purple-700 text-purple-100';       // BPSN
    case 'frz': return 'bg-cyan-500 text-cyan-900';           // FRZN
    default: return 'bg-neutral-700 text-neutral-200';
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

export default function TeamBox({
  title,
  subtitle,
  members,
  editable,
  onDropToSlot,
  onRemove,
  onChangeStatus,
  onChangeItem,
}: Props) {

  const handleDragOver = (e: React.DragEvent) => {
    if (!editable) return;
    e.preventDefault();
  };
  const handleDrop = (index: number, e: React.DragEvent) => {
    if (!editable || !onDropToSlot) return;
    const species = e.dataTransfer.getData('text/plain');
    if (species) onDropToSlot(index, species);
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
          const pct = Math.max(0, Math.min(100, Math.round(m?.pct ?? 0)));
          const maxHP = m?.maxHP;
          const curHP = (typeof m?.curHP === 'number')
            ? m!.curHP!
            : (typeof maxHP === 'number' ? Math.max(0, Math.round((pct / 100) * maxHP)) : undefined);

          // HP bar color: green > 50, yellow 25-50, red < 25
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
                <div className="font-medium">
                  {m?.name ?? <span className="text-neutral-500 italic">Empty slot</span>}
                </div>

                <div className="flex items-center gap-2">
                  {/* Status pill (indicator only) */}
                  {m?.status?.type && (
                    <span className={`text-[10px] px-2 py-0.5 rounded ${statusPillStyle(m.status.type)}`}>
                      {statusLabel(m.status.type)}
                    </span>
                  )}

                  {/* Tiny remove for editable */}
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

              {/* HP Bar with overlayed absolute text */}
              <div className="mt-2">
                <div className="relative h-3 w-full rounded bg-neutral-800 overflow-hidden">
                  <div
                    className={`absolute left-0 top-0 h-full bg-gradient-to-r ${barColor} transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                    <div className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-black">
                    {typeof curHP === 'number' && typeof maxHP === 'number'
                        ? `${curHP}/${maxHP}`
                        : '—/—'}
                    </div>
                </div>
                <div className="text-[11px] text-neutral-400 mt-1">{pct}%</div>
              </div>

              {/* Item + Status dropdowns (My Team only / editable) */}
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

              {/* Item note (small, optional) */}
              {m?.item && (
                <div className="mt-2 text-[10px] text-neutral-400">
                  Item: <span className="text-neutral-300">{m.item}</span>
                  {m.berry?.name && (
                    <span className="ml-2">
                      • Berry: <span className="text-neutral-300">{m.berry.name}</span>
                      {m.berry.consumed ? ' (consumed)' : ''}
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
