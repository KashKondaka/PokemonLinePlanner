// src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import QueryEditor from './components/QueryEditor';
import TeamBox, { type TeamMember } from './components/TeamBox';
import CalcButton from './components/CalcButton';
// import DeleteButton from './components/DeleteButton'; // removed — now a small "-" to the left
import CritToggleButton from './components/CritToggleButton';
import RunButton from './components/RunButton';
import UndoButton from './components/UndoButton';
import RollSlider from './components/RollSlider';

import { buildDictionaries, type Dictionaries } from './logic/parsers';
import { parseActionFromLine } from './logic/grammar';
import { inferBerryRule, normalizeBerryName } from './logic/hpMath';
import {
  inferStatusFromMove,
  applyEndOfTurnResidual,
  makeInitialStatus,
  type StatusType,
  type StatusState,
} from './logic/status';
import {
  resolveCanonicalName,
  normalizeEnemyTrainerTextForBackend,
  uniqSortedWithZero,
} from './logic/helpers';

/* ===================== Local types ===================== */

type BerryState = { name: string; consumed: boolean };

type MemberEx = TeamMember & {
  berry?: BerryState;
  status?: StatusState;
};

type AppliedChange = {
  team: 'my' | 'enemy';
  index: number;
  name: string;
  prevPct: number;
  prevCurHP?: number;
  prevMaxHP?: number;
  prevBerry?: BerryState | undefined;
  prevStatus?: StatusState | undefined;
  prevItem?: string | undefined;
};

type TurnLine = {
  id: number;
  text: string;
  result?: {
    defender: string;
    defenderMaxHP?: number;

    lowPct: number;  lowHP?: number;  lowBerry?: { name: string; healHP: number; healPct: number } | null;
    highPct: number; highHP?: number; highBerry?: { name: string; healHP: number; healPct: number } | null;
    critPct: number; critHP?: number; critBerry?: { name: string; healHP: number; healPct: number } | null;
    eot?: {
      low?: { nextPct: number; lossPct: number; lossHP?: number; note: string };
      high?: { nextPct: number; lossPct: number; lossHP?: number; note: string };
      crit?: { nextPct: number; lossPct: number; lossHP?: number; note: string };
    };
    appliesStatus?: StatusState | null;

    rawRollsNormal?: number[];
    rawRollsCrit?: number[];
    rollOptionsNormal?: number[];
    rollOptionsCrit?: number[];
  };
  chosen?: {
    attacker: string;
    move: string;
    defender: string;
    finalPct: number;
    finalHP?: number;
    maxHP?: number;
    berryUsedName?: string;
    eotType?: 'burn' | 'poison';
    eotLossPct?: number;
  };
  appliedChanges?: AppliedChange[];
  loading?: boolean;
  error?: string | null;

  // UI state
  useCrit?: boolean;
  selectedRollIndex?: number;

  // Run-once gate
  runApplied?: boolean;
};

type CalcResponse = {
  defender: string;
  defenderMaxHP: number;
  remaining: { lowPct: number; lowHP: number; highPct: number; highHP: number; critPct: number; critHP: number };
  debug?: { rolls?: { normal?: number[]; crit?: number[] } };
};

/* ===================== Upload picker ===================== */

function FilePicker({
  label,
  accept = '.txt',
  onFileText,
  onClear,
  currentText,
}: {
  label: string;
  accept?: string;
  onFileText: (text: string, filename?: string) => void;
  onClear: () => void;
  currentText: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>('');

  const handlePick = () => inputRef.current?.click();
  const handleChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      setFileName(f.name);
      onFileText(String(r.result || ''), f.name);
    };
    r.readAsText(f);
  };
  const handleClear = () => {
    setFileName('');
    onClear();
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="flex items-center gap-3">
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handleChange} />
      <button
        onClick={handlePick}
        className="rounded-xl px-3 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm"
      >
        Upload {label}
      </button>
      <button
        onClick={handleClear}
        className="rounded-xl px-3 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-sm"
      >
        Clear
      </button>
      <div className="text-xs text-neutral-400 truncate">
        {fileName ? fileName : currentText ? '(from text)' : 'No file selected'}
      </div>
    </div>
  );
}

/* ================================== App ================================== */

export default function App() {
  // Uploads + gen
  const [myText, setMyText] = useState('');
  const [enemyText, setEnemyText] = useState('');
  const [gen, setGen] = useState<number>(9);

  const dicts = useMemo<Dictionaries>(() => buildDictionaries(myText, enemyText), [myText, enemyText]);

  // Teams
  const [myTeam, setMyTeam] = useState<MemberEx[]>(Array(6).fill(undefined) as any);
  const [enemyTeam, setEnemyTeam] = useState<MemberEx[]>([]);

  useEffect(() => {
    // Prefill enemy team (≤6) from enemytrainer.txt. Attach auto berry if present.
    const init = dicts.enemySpecies.slice(0, 6).map(name => {
      const item = dicts.enemyItemBySpecies[name];
      const norm = normalizeBerryName(item);
      const rule = inferBerryRule(norm, gen);
      return {
        name,
        pct: 100,
        maxHP: undefined,
        curHP: undefined,
        item,
        berry: rule ? { name: rule.name, consumed: false } : undefined,
        status: undefined,
      } as MemberEx;
    });
    setEnemyTeam(init);
  }, [dicts.enemySpecies.join('|'), dicts.enemyItemBySpecies, gen]);

  function findMember(name: string): { team: 'my'|'enemy'|null, index: number, member?: MemberEx } {
    const e = enemyTeam.findIndex(m => m?.name?.toLowerCase() === name.toLowerCase());
    if (e !== -1) return { team: 'enemy', index: e, member: enemyTeam[e] };
    const i = myTeam.findIndex(m => m?.name?.toLowerCase() === name.toLowerCase());
    if (i !== -1) return { team: 'my', index: i, member: myTeam[i] };
    return { team: null, index: -1, member: undefined };
  }

  function setMemberByLoc(
    loc: { team: 'my'|'enemy'; index: number },
    updater: (cur: MemberEx | undefined) => MemberEx | undefined
  ) {
    if (loc.team === 'enemy') setEnemyTeam(p => { const n=[...p]; n[loc.index]=updater(n[loc.index]); return n; });
    else setMyTeam(p => { const n=[...p]; n[loc.index]=updater(n[loc.index]); return n; });
  }

  function addToMyTeam(slotIndex: number, species: string) {
    const item = dicts.myItemBySpecies[species];
    const norm = normalizeBerryName(item);
    const rule = inferBerryRule(norm, gen);
    setMyTeam(prev => {
      const next = [...prev];
      next[slotIndex] = {
        name: species,
        pct: 100,
        maxHP: undefined,
        curHP: undefined,
        item,
        berry: rule ? { name: rule.name, consumed: false } : undefined,
        status: undefined,
      };
      return next;
    });
  }

  // Change status/item (My Team only)
  const onChangeStatus = (index: number, statusType: StatusType | undefined) => {
    setMyTeam(prev => {
      const next = [...prev];
      const cur = next[index];
      if (!cur) return prev;
      const status = statusType ? { type: statusType as StatusType } : undefined;
      next[index] = { ...cur, status };
      return next;
    });
  };

  const onChangeItem = (index: number, item: string | undefined) => {
    setMyTeam(prev => {
      const next = [...prev];
      const cur = next[index];
      if (!cur) return prev;

      const norm = normalizeBerryName(item);
      const rule = inferBerryRule(norm, gen);
      const berry: BerryState | undefined = rule ? { name: rule.name, consumed: false } : undefined;

      next[index] = { ...cur, item, berry };
      return next;
    });
  };

  // Planner
  const [turns, setTurns] = useState<TurnLine[]>([{ id: 1, text: '', appliedChanges: [] }]);
  const onEditorChange = (i: number, v: string) => setTurns(p => p.map((t, idx) => (idx === i ? { ...t, text: v } : t)));
  const addTurn = () => setTurns(p => [...p, { id: p.length + 1, text: '', appliedChanges: [] }]);

  async function doCalc(i: number) {
    const t = turns[i];

    const base = parseActionFromLine(t.text);
    if (!base) {
      setTurns(prev => prev.map((x, idx) => idx === i ? { ...x, result: undefined, error: 'Line grammar: "<pokemon> use <move> on <pokemon>"' } : x));
      return;
    }

    const attackerCanon = resolveCanonicalName(base.attacker, dicts) ?? base.attacker;
    const defenderCanon = resolveCanonicalName(base.defender, dicts) ?? base.defender;

    const defLoc = findMember(defenderCanon);
    const currentPct   = defLoc.member?.pct ?? 100;
    const currentStatus = defLoc.member?.status;

    const appliedType = inferStatusFromMove(base.move);
    const appliesStatus = appliedType ? makeInitialStatus(appliedType) : null;

    setTurns(prev => prev.map((x, idx) => idx === i ? ({ ...x, loading: true, error: null }) : x));

    try {
      const enemyTextForBackend = normalizeEnemyTrainerTextForBackend(enemyText);
      const resp = await fetch('/api/calc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          myText,
          enemyText: enemyTextForBackend,
          attacker: attackerCanon,
          move: base.move,
          defender: defenderCanon,
          gen,
        }),
      });
      if (!resp.ok) throw new Error(await resp.text() || `HTTP ${resp.status}`);

      const data: CalcResponse = await resp.json();

      const r = data.remaining;
      const defMaxHP = data.defenderMaxHP;

      const dmgLowPct  = 100 - r.highPct;
      const dmgHighPct = 100 - r.lowPct;
      const dmgCritPct = 100 - r.critPct;

      const postLowPct  = Math.max(0, Math.round(currentPct - dmgLowPct));
      const postHighPct = Math.max(0, Math.round(currentPct - dmgHighPct));
      const postCritPct = Math.max(0, Math.round(currentPct - dmgCritPct));

      const toHP = (pct: number | undefined) =>
        typeof defMaxHP === 'number' && typeof pct === 'number'
          ? Math.max(0, Math.round((pct / 100) * defMaxHP))
          : undefined;

      const postLowHP  = toHP(postLowPct);
      const postHighHP = toHP(postHighPct);
      const postCritHP = toHP(postCritPct);

      const mkE = (postPct: number) => {
        const st = appliesStatus ?? currentStatus;
        if (!st) return null;
        const { nextPct, lossPct, lossHP } = applyEndOfTurnResidual(Math.round(postPct), defMaxHP, st);
        const note =
          st.type === 'burn' ? 'after BRN' :
          st.type === 'psn'  ? 'after PSN' :
          st.type === 'tox'  ? 'after BPSN' :
          st.type === 'par'  ? 'PRLYZ (no EoT dmg)' :
          st.type === 'frz'  ? 'FRZN (no EoT dmg)' : '';
        return { nextPct, lossPct, lossHP, note };
      };

      const eot = {
        low:  mkE(postLowPct)  || undefined,
        high: mkE(postHighPct) || undefined,
        crit: mkE(postCritPct) || undefined,
      };

      const normalRaw = data?.debug?.rolls?.normal ?? [];
      const critRaw   = data?.debug?.rolls?.crit ?? [];
      const rollOptionsNormal = uniqSortedWithZero(normalRaw);
      const rollOptionsCrit   = uniqSortedWithZero(critRaw);

      setTurns(prev => prev.map((x, idx) => idx === i ? ({
        ...x,
        loading: false,
        error: null,
        result: {
          defender: data.defender || defenderCanon,
          lowPct:  postLowPct,  lowHP:  postLowHP,   lowBerry: null,
          highPct: postHighPct, highHP: postHighHP,  highBerry: null,
          critPct: postCritPct, critHP: postCritHP,  critBerry: null,
          defenderMaxHP: defMaxHP,
          eot,
          appliesStatus,
          rawRollsNormal: normalRaw,
          rawRollsCrit: critRaw,
          rollOptionsNormal,
          rollOptionsCrit,
        },
        useCrit: false,
        selectedRollIndex: 0,
        runApplied: false,
        appliedChanges: [],
        chosen: undefined,
      }) : x));
    } catch (err: any) {
      setTurns(prev => prev.map((x, idx) => idx === i ? ({ ...x, loading: false, error: err?.message || String(err), result: undefined }) : x));
    }
  }

  function applySelectedRoll(i: number) {
    const t = turns[i];
    if (!t?.result) return;
    if (t.runApplied) return;

    const parsed = parseActionFromLine(t.text);
    const attackerName = parsed?.attacker ?? '';
    const moveName = parsed?.move ?? '';
    const defenderName = parsed?.defender ?? t.result.defender;

    const { defender, defenderMaxHP } = t.result;
    const defCanon = resolveCanonicalName(defender, dicts) ?? defender;

    const loc = findMember(defCanon);
    if (!loc.team) return;

    const prevPct    = loc.member?.pct ?? 100;
    const prevMaxHP  = loc.member?.maxHP;
    const prevCurHP  = loc.member?.curHP;
    const prevBerry  = loc.member?.berry;
    const prevStatus = loc.member?.status;
    const prevItem   = loc.member?.item;

    const options = (t.useCrit ? t.result.rollOptionsCrit : t.result.rollOptionsNormal) ?? [0];
    const selectedIdx = Math.max(0, Math.min((t.selectedRollIndex ?? 0), options.length - 1));
    const selectedDamageHP = options[selectedIdx] ?? 0;

    const maxHP = typeof defenderMaxHP === 'number' && defenderMaxHP > 0
      ? defenderMaxHP
      : (typeof prevMaxHP === 'number' ? prevMaxHP : undefined);

    if (typeof maxHP !== 'number') return;

    let curHPNow: number = typeof prevCurHP === 'number'
      ? prevCurHP
      : Math.max(0, Math.round((prevPct / 100) * maxHP));

    let postHP = Math.max(0, curHPNow - Math.max(0, Math.round(selectedDamageHP)));
    let postPct = Math.max(0, Math.round((postHP / maxHP) * 100));

    let berry = prevBerry;
    let heldBerryName: string | undefined =
      (berry && !berry.consumed) ? berry.name : normalizeBerryName(loc.member?.item);
    const rule = inferBerryRule(heldBerryName, gen);
    let berryUsedName: string | undefined;

    if (rule) {
      if (postPct <= rule.thresholdPct) {
        const healHP = rule.kind === 'heal-flat'
          ? rule.healHP
          : Math.round((rule.healPct / 100) * maxHP);
        postHP = Math.min(maxHP, postHP + healHP);
        postPct = Math.max(0, Math.round((postHP / maxHP) * 100));

        if (heldBerryName) {
          if (berry && berry.name.toLowerCase() === heldBerryName.toLowerCase()) {
            berry = { ...berry, consumed: true };
          } else if (prevBerry == null) {
            berry = { name: heldBerryName, consumed: true };
          }
          berryUsedName = heldBerryName;
        }
      }
    }

    let newStatus = prevStatus;
    if (t.result.appliesStatus) newStatus = t.result.appliesStatus;

    let finalPct = postPct;
    let finalStatus = newStatus;
    let eotLossPct: number | undefined;
    if (newStatus) {
      const e = applyEndOfTurnResidual(finalPct, maxHP, newStatus);
      eotLossPct = e.lossPct > 0 ? e.lossPct : undefined;
      finalPct = e.nextPct;
      if (newStatus.type === 'tox') {
        const stage = (newStatus.toxicStage ?? 1) + 1;
        finalStatus = { type: 'tox', toxicStage: stage };
      }
    }

    const finalHP = Math.max(0, Math.round((finalPct / 100) * maxHP));

    setMemberByLoc(loc as any, cur => {
      const existing = cur ?? ({ name: defCanon, pct: 100 } as MemberEx);
      return {
        ...existing,
        pct: Math.round(finalPct),
        maxHP: maxHP ?? existing.maxHP,
        curHP: finalHP,
        berry,
        status: finalStatus,
      };
    });

    setTurns(prev => prev.map((x, idx) => {
      if (idx !== i) return x;
      const applied = x.appliedChanges ?? [];
      let eotType: 'burn' | 'poison' | undefined;
      if (newStatus?.type === 'burn') eotType = 'burn';
      if (newStatus?.type === 'psn' || newStatus?.type === 'tox') eotType = 'poison';

      return {
        ...x,
        runApplied: true,
        chosen: {
          attacker: attackerName || '',
          move: moveName || '',
          defender: defenderName || defCanon,
          finalPct: Math.round(finalPct),
          finalHP,
          maxHP,
          berryUsedName,
          eotType,
          eotLossPct,
        },
        appliedChanges: [
          ...applied,
          {
            team: loc.team!, index: loc.index, name: defCanon,
            prevPct, prevCurHP, prevMaxHP, prevBerry, prevStatus, prevItem
          }
        ]
      };
    }));
  }

  function undoRun(i: number) {
    const t = turns[i];
    const changes = (t?.appliedChanges ?? []).slice().reverse();
    if (!changes.length) return;

    // Restore snapshots
    changes.forEach(ch => {
      if (ch.team === 'enemy') {
        setEnemyTeam(prev => {
          const next = [...prev];
          const cur = next[ch.index];
          if (!cur || cur.name?.toLowerCase() !== ch.name.toLowerCase()) return next;
          next[ch.index] = {
            ...cur,
            pct: ch.prevPct,
            curHP: ch.prevCurHP,
            maxHP: ch.prevMaxHP,
            berry: ch.prevBerry,
            status: ch.prevStatus,
            item: ch.prevItem,
          };
          return next;
        });
      } else {
        setMyTeam(prev => {
          const next = [...prev];
          const cur = next[ch.index];
          if (!cur || cur.name?.toLowerCase() !== ch.name.toLowerCase()) return next;
          next[ch.index] = {
            ...cur,
            pct: ch.prevPct,
            curHP: ch.prevCurHP,
            maxHP: ch.prevMaxHP,
            berry: ch.prevBerry,
            status: ch.prevStatus,
            item: ch.prevItem,
          };
          return next;
        });
      }
    });

    // Clear run state for this turn
    setTurns(prev => prev.map((x, idx) => idx === i
      ? { ...x, appliedChanges: [], chosen: undefined, runApplied: false }
      : x));
  }

  function deleteTurn(i: number) {
    const t = turns[i];
    const changes = (t.appliedChanges ?? []).slice().reverse();

    // Revert if needed
    changes.forEach(ch => {
      if (ch.team === 'enemy') {
        setEnemyTeam(prev => {
          const next = [...prev];
          const cur = next[ch.index];
          if (!cur || cur.name?.toLowerCase() !== ch.name.toLowerCase()) return next;
          next[ch.index] = {
            ...cur,
            pct: ch.prevPct,
            curHP: ch.prevCurHP,
            maxHP: ch.prevMaxHP,
            berry: ch.prevBerry,
            status: ch.prevStatus,
            item: ch.prevItem,
          };
          return next;
        });
      } else {
        setMyTeam(prev => {
          const next = [...prev];
          const cur = next[ch.index];
          if (!cur || cur.name?.toLowerCase() !== ch.name.toLowerCase()) return next;
          next[ch.index] = {
            ...cur,
            pct: ch.prevPct,
            curHP: ch.prevCurHP,
            maxHP: ch.prevMaxHP,
            berry: ch.prevBerry,
            status: ch.prevStatus,
            item: ch.prevItem,
          };
          return next;
        });
      }
    });

    setTurns(prev => prev.filter((_, idx) => idx !== i));
  }

  // -------- Export Lines (.txt) --------
  function exportLines() {
    const lines: string[] = [];

    turns.forEach((t, idx) => {
      const n = idx + 1;
      const c = t.chosen;
      if (!c) return;

      const att = c.attacker || '(attacker)';
      const mv  = c.move || '(move)';
      const def = c.defender || '(defender)';

      const hpStr =
        typeof c.finalHP === 'number' && typeof c.maxHP === 'number'
          ? `${c.finalHP}/${c.maxHP} (${c.finalPct}%)`
          : `${c.finalPct}%`;

      let suffix = `-> ${def} has ${hpStr} remaining health`;

      if (c.berryUsedName) {
        suffix += ` after consuming ${c.berryUsedName} berry`;
      }
      if (c.eotType && typeof c.eotLossPct === 'number' && c.eotLossPct > 0) {
        const word = c.eotType === 'burn' ? 'burn' : 'poison';
        suffix += ` after ${word} damage of ${c.eotLossPct}%`;
      }

      lines.push(`Turn ${n}: ${att} use ${mv} on ${def} ${suffix}`);
    });

    if (!lines.length) {
      alert('No applied turns to export.');
      return;
    }

    const content = lines.join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().replace(/[:T]/g, '-').split('.')[0];
    a.href = url;
    a.download = `plan_${date}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const myCollection = dicts.mySpecies;

  return (
    <div className="min-h-screen w-full flex flex-col items-center bg-neutral-950 text-neutral-100 p-6" style={{fontFamily:'Inter, ui-sans-serif, system-ui'}}>
      <div className="w-full max-w-6xl">
        <header className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Poke Fight Planner</h1>
          <p className="text-neutral-400">Upload sets, pick generation, build teams, plan turns, and apply rolls (with status & items).</p>
        </header>

        {/* Uploads + Generation */}
        <section className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-neutral-800 p-4 bg-neutral-900/40 md:col-span-2">
            <h2 className="text-sm font-semibold mb-3">Upload sets</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-neutral-400 mb-1">myteam.txt</div>
                <FilePicker
                  label="myteam.txt"
                  onFileText={(text)=>setMyText(text)}
                  onClear={()=>{ setMyText(''); setMyTeam(Array(6).fill(undefined) as any); }}
                  currentText={myText}
                />
              </div>
              <div>
                <div className="text-xs text-neutral-400 mb-1">enemytrainer.txt</div>
                <FilePicker
                  label="enemytrainer.txt"
                  onFileText={(text)=>setEnemyText(text)}
                  onClear={()=>{ setEnemyText(''); setEnemyTeam([]); }}
                  currentText={enemyText}
                />
              </div>
            </div>
            <p className="text-xs text-neutral-500 mt-2">
              Drag Pokémon from your collection (parsed from <code>myteam.txt</code>) into “My Team”. Enemy team auto-fills (≤6) from <code>enemytrainer.txt</code>.
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 p-4 bg-neutral-900/40">
            <h2 className="text-sm font-semibold mb-2">Generation</h2>
            <select
              value={gen}
              onChange={(e)=>setGen(Number(e.target.value))}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm"
            >
              {[9,8,7,6,5,4,3,2,1].map(g => <option key={g} value={g}>Gen {g}</option>)}
            </select>
          </div>
        </section>

        {/* Teams */}
        <section className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <TeamBox
            title="My Team"
            subtitle="Drag from your collection → slots"
            members={myTeam}
            editable
            onRemove={(idx) => setMyTeam(prev => { const next=[...prev]; next[idx]=undefined as any; return next; })}
            onDropToSlot={(idx, name) => addToMyTeam(idx, name)}
            onChangeStatus={onChangeStatus}
            onChangeItem={onChangeItem}
          />
          <TeamBox
            title="Enemy Team"
            subtitle="Auto-filled from enemytrainer.txt"
            members={enemyTeam}
          />
        </section>

        {/* Collection */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 mb-6">
          <div className="text-xs text-neutral-400 mb-2">Your collection</div>
          <div className="text-sm leading-7">
            {myCollection.map((name, idx) => (
              <span key={name}>
                <span
                  draggable
                  onDragStart={e => e.dataTransfer.setData('text/plain', name)}
                  className="cursor-grab active:cursor-grabbing underline decoration-neutral-600 decoration-dotted"
                >
                  {name}
                </span>
                {idx < myCollection.length - 1 ? <span className="text-neutral-500">, </span> : null}
              </span>
            ))}
          </div>
        </div>

        {/* Planner */}
        <section className="rounded-2xl border border-neutral-800 p-4 bg-neutral-900/40">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Planner</h2>
            <div className="flex items-center gap-2">
              <button onClick={addTurn} className="rounded-xl px-3 py-2 bg-emerald-600 hover:bg-emerald-500 transition text-sm font-semibold shadow">
                + Add Turn
              </button>
              <button onClick={exportLines} className="rounded-xl px-3 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 transition text-sm font-semibold shadow">
                Export Lines
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {turns.map((t, idx) => {
              const rollOpts = t.useCrit
                ? (t.result?.rollOptionsCrit ?? [0])
                : (t.result?.rollOptionsNormal ?? [0]);
              const selectedIdx = Math.max(0, Math.min((t.selectedRollIndex ?? 0), rollOpts.length - 1));

              return (
                <div key={t.id} className="flex items-stretch gap-3">
                  {/* Left column now has a small "-" delete button before the "Turn N:" label */}
                  <div className="w-28 shrink-0 flex items-center justify-end pr-1 gap-2">
                    <button
                      onClick={() => deleteTurn(idx)}
                      className="h-6 w-6 inline-flex items-center justify-center rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-sm"
                      title="Delete turn"
                      aria-label="Delete turn"
                    >
                      –
                    </button>
                    <div className="text-sm font-semibold text-neutral-300">Turn {idx+1}:</div>
                  </div>

                  {/* Taller query editor for readability */}
                  <div className="flex-1 rounded-xl border border-neutral-800 bg-neutral-900/60 shadow-inner relative z-10">
                    <QueryEditor
                      value={t.text}
                      onChange={(v)=>onEditorChange(idx, v)}
                      dicts={dicts}
                      heightPx={64} // was 44 — taller so the line is easy to see
                    />
                  </div>

                  <CalcButton onClick={() => doCalc(idx)} loading={t.loading} />
                  {/* DeleteButton removed from the right side */}

                  {/* Roll selector + Crit toggle + Run + Undo */}
                  <div className="w-[760px] shrink-0">
                    {t.error && <div className="h-[44px] flex items-center text-xs text-red-400">{t.error}</div>}
                    {t.result && !t.error && (
                      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2">
                        <RollSlider
                          label={t.useCrit ? 'Crit Rolls' : 'Normal Rolls'}
                          options={rollOpts}
                          selectedIndex={selectedIdx}
                          onChange={(vi) => setTurns(prev => prev.map((x, j) => j === idx ? { ...x, selectedRollIndex: vi } : x))}
                        />

                        <CritToggleButton
                          active={!!t.useCrit}
                          onToggle={() => setTurns(prev => prev.map((x, j) => j === idx
                            ? { ...x, useCrit: !x.useCrit, selectedRollIndex: 0 }
                            : x))}
                        />

                        <RunButton
                          onClick={() => applySelectedRoll(idx)}
                          disabled={!!t.runApplied}
                        />

                        <UndoButton
                          onClick={() => undoRun(idx)}
                          disabled={!t.runApplied || !(t.appliedChanges && t.appliedChanges.length)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <footer className="text-xs text-neutral-500 mt-6">
          <p>Healing/status items persist in your team box; berries auto-consume when thresholds are reached. Use ▶ to apply the selected roll, ↩ to undo, and the small “–” to delete a turn.</p>
        </footer>
      </div>
    </div>
  );
}
