// src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import QueryEditor from './components/QueryEditor';
import TeamBox, { type TeamMember } from './components/TeamBox';
import { buildDictionaries, type Dictionaries } from './logic/parsers';
import { parseActionFromLine } from './logic/grammar';
import { inferBerryRule, normalizeBerryName } from './logic/hpMath';

/* ===================== Helpers: alias/canonical + enemy normalizer ===================== */

function aliasKey(s: string) {
  return (s || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function resolveCanonicalName(name: string, dicts: Dictionaries): string | null {
  const ak = aliasKey(name);
  const all = [...dicts.mySpecies, ...dicts.enemySpecies];
  for (const n of all) if (aliasKey(n) === ak) return n;
  return null;
}

/** Keep enemy lines as-is but normalize minimal spacing for backend */
function normalizeEnemyTrainerTextForBackend(raw: string) {
  const lines = raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  const fixed = lines.map(line =>
    line.replace(/@(?=\S)/g, '@ ').replace(/\s{2,}/g, ' ').trim()
  );

  return fixed.slice(0, 6).join('\n');
}

/* ===================== Status / Berry domain ===================== */

type StatusType = 'burn' | 'psn' | 'tox' | 'par' | 'frz';
type StatusState = { type: StatusType; toxicStage?: number };

function inferStatusFromMove(moveName: string): StatusType | null {
  const m = moveName.trim().toLowerCase();
  if (m === 'will o wisp' || m === 'will-o-wisp' || m === 'will-o’-wisp') return 'burn';
  if (m === 'thunder wave' || m === 'nuzzle') return 'par';
  if (m === 'toxic') return 'tox';
  if (m === 'poison gas' || m === 'poison powder' || m === 'poisonpowder') return 'psn';
  return null;
}

function makeInitialStatus(type: StatusType): StatusState {
  if (type === 'tox') return { type: 'tox', toxicStage: 1 };
  return { type };
}

function applyEndOfTurnResidual(
  currentPct: number,
  maxHP: number | undefined,
  status: StatusState | undefined
): { nextPct: number; lossPct: number; lossHP?: number; nextStatus?: StatusState } {
  if (!status) return { nextPct: currentPct, lossPct: 0, lossHP: 0, nextStatus: undefined };

  let lossPct = 0;
  let nextStatus: StatusState | undefined = { ...status };

  switch (status.type) {
    case 'burn': lossPct = 100 / 16; break;   // 6.25%
    case 'psn':  lossPct = 100 / 8;  break;   // 12.5%
    case 'tox': {
      const n = Math.max(1, status.toxicStage ?? 1);
      lossPct = (100 / 16) * n;               // n * 6.25%
      nextStatus.toxicStage = n + 1;
      break;
    }
    case 'par':
    case 'frz':
    default: lossPct = 0; break;
  }

  const nextPct = Math.max(0, Math.round(currentPct - lossPct));
  let lossHP: number | undefined = undefined;
  if (typeof maxHP === 'number' && isFinite(maxHP)) {
    lossHP = Math.max(0, Math.round((lossPct / 100) * maxHP));
  }
  return { nextPct, lossPct: Math.round(lossPct), lossHP, nextStatus };
}

type BerryName =
  | 'oran' | 'sitrus'
  | 'rawst' | 'pecha' | 'cheri' | 'chesto' | 'aspear';

function berryCuresStatus(berry: BerryName, status: StatusType): boolean {
  switch (berry) {
    case 'rawst':  return status === 'burn';
    case 'pecha':  return status === 'psn' || status === 'tox';
    case 'cheri':  return status === 'par';
    case 'aspear': return status === 'frz';
    case 'chesto': return false;
    default:       return false;
  }
}

/* ===================== Local types ===================== */

type BerryState = { name: string; consumed: boolean };

export type MemberEx = TeamMember & {
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
    lowPct: number;  lowHP?: number;
    highPct: number; highHP?: number;
    critPct: number; critHP?: number;
    eot?: {
      low?: { nextPct: number; lossPct: number; lossHP?: number; note: string };
      high?: { nextPct: number; lossPct: number; lossHP?: number; note: string };
      crit?: { nextPct: number; lossPct: number; lossHP?: number; note: string };
    };
    appliesStatus?: StatusState | null;
  };
  appliedChanges?: AppliedChange[];
  loading?: boolean;
  error?: string | null;
};

type CalcResponseA = {
  defender: string;
  defenderMaxHP: number;
  remaining: { lowPct: number; lowHP: number; highPct: number; highHP: number; critPct: number; critHP: number };
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

      // Reset berry object based on selected item
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

  /** Roll back everything this turn previously applied (HP, status, berry),
   * so switching rolls “unconsumes” berries and undoes effects cleanly. */
  function rollbackTurnChanges(turnIndex: number) {
    const t = turns[turnIndex];
    const changes = (t.appliedChanges ?? []).slice().reverse();

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
            berry: ch.prevBerry,     // ← restores consumed → unconsumed/undefined
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
            berry: ch.prevBerry,     // ← restores consumed → unconsumed/undefined
            status: ch.prevStatus,
            item: ch.prevItem,
          };
          return next;
        });
      }
    });

    // Clear the turn’s history so the next application records a fresh baseline
    setTurns(prev => prev.map((x, idx) => idx === turnIndex ? { ...x, appliedChanges: [] } : x));
  }

  async function doCalc(i: number) {
    const t = turns[i];

    // Parse "<pokemon> use <move> on <pokemon>"
    const base = parseActionFromLine(t.text);
    if (!base) {
      setTurns(prev => prev.map((x, idx) =>
        idx === i ? { ...x, result: undefined, error: 'Line grammar: "<pokemon> use <move> on <pokemon>"' } : x
      ));
      return;
    }

    // Canonicalize names
    const attackerCanon = resolveCanonicalName(base.attacker, dicts) ?? base.attacker;
    const defenderCanon = resolveCanonicalName(base.defender, dicts) ?? base.defender;

    // Read defender state (matters for turn 2+)
    const defLoc = findMember(defenderCanon);
    const currentPct   = defLoc.member?.pct ?? 100;
    const currentStatus = defLoc.member?.status;

    // Status this move would apply (preview only)
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

      const data: CalcResponseA = await resp.json();

      // Convert API "remaining from full" → DAMAGE%, then subtract from CURRENT%
      const r = data.remaining;
      const defMaxHP = data.defenderMaxHP;

      const dmgLowPct  = 100 - r.highPct; // low roll = lower dmg branch
      const dmgHighPct = 100 - r.lowPct;  // high roll = higher dmg branch
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

      // EoT preview from these post-hit numbers
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

      setTurns(prev => prev.map((x, idx) => idx === i ? ({
        ...x,
        loading: false,
        error: null,
        result: {
          defender: data.defender || defenderCanon,
          lowPct:  postLowPct,  lowHP:  postLowHP,
          highPct: postHighPct, highHP: postHighHP,
          critPct: postCritPct, critHP: postCritHP,
          defenderMaxHP: defMaxHP,
          eot,
          appliesStatus,
        },
      }) : x));
    } catch (err: any) {
      setTurns(prev => prev.map((x, idx) =>
        idx === i ? ({ ...x, loading: false, error: err?.message || String(err), result: undefined }) : x
      ));
    }
  }

  function applyResult(i: number, kind: 'low'|'high'|'crit') {
    // IMPORTANT: unconsume-on-switch → roll back previous application for this turn first
    rollbackTurnChanges(i);

    const t = turns[i];
    if (!t?.result) return;

    const { defender, defenderMaxHP } = t.result;
    const defCanon = resolveCanonicalName(defender, dicts) ?? defender;

    const loc = findMember(defCanon);
    if (!loc.team) return;

    const prevPct    = loc.member?.pct ?? 100;
    const prevMaxHP  = loc.member?.maxHP;
    const prevCurHP  = loc.member?.curHP;
    const prevBerry  = loc.member?.berry;     // ← this snapshot lets us restore unconsumed berry
    const prevStatus = loc.member?.status;
    const prevItem   = loc.member?.item;

    // Base post-hit remaining from the clicked roll
    let postPct = 100;
    let postHP: number | undefined;
    if (kind === 'low')  { postPct = Math.round(t.result.lowPct);  postHP = t.result.lowHP;  }
    if (kind === 'high') { postPct = Math.round(t.result.highPct); postHP = t.result.highHP; }
    if (kind === 'crit') { postPct = Math.round(t.result.critPct); postHP = t.result.critHP; }

    // Determine maxHP
    const maxHP = typeof defenderMaxHP === 'number' && defenderMaxHP > 0
      ? defenderMaxHP
      : (typeof prevMaxHP === 'number' ? prevMaxHP : undefined);

    if (typeof postHP !== 'number' && typeof maxHP === 'number') {
      postHP = Math.max(0, Math.round((postPct / 100) * maxHP));
    }

    // ===== Berry trigger & consumption (heal right after hit) =====
    let berry = prevBerry;
    let heldBerryName: string | undefined;

    // If a berry exists:
    if (berry) {
      // If it was previously consumed, do NOT allow it to re-proc on later turns
      // But within THIS turn, rollbackTurnChanges restored prevBerry, so consumed is accurate.
      heldBerryName = berry.consumed ? undefined : berry.name;
    } else {
      // If there wasn't a berry object yet, infer from item once for this slot
      const inferred = normalizeBerryName(loc.member?.item);
      if (inferred) {
        berry = { name: inferred, consumed: false };
        heldBerryName = inferred;
      }
    }

    const rule = inferBerryRule(heldBerryName, gen);
    if (rule && postPct <= rule.thresholdPct) {
      if (typeof maxHP === 'number' && typeof postHP === 'number') {
        const healHP = rule.kind === 'heal-flat'
          ? rule.healHP
          : Math.round((rule.healPct / 100) * maxHP);
        const newHP = Math.min(maxHP, postHP + healHP);
        postHP = newHP;
        postPct = Math.max(0, Math.round((newHP / maxHP) * 100));
      } else if (rule.kind === 'heal-pct') {
        postPct = Math.min(100, postPct + rule.healPct);
      }
      // Mark consumed once; switching rolls is handled by rollback → restores prevBerry
      if (berry && heldBerryName && berry.name.toLowerCase() === heldBerryName.toLowerCase()) {
        berry = { ...berry, consumed: true };
      }
    }

    // ===== End-of-turn residual AFTER berry heal =====
    let newStatus = prevStatus;
    if (t.result.appliesStatus) newStatus = t.result.appliesStatus;

    let finalPct = postPct;
    let finalStatus = newStatus;

    if (newStatus) {
      const e = applyEndOfTurnResidual(finalPct, maxHP, newStatus);
      finalPct = e.nextPct;
      if (newStatus.type === 'tox') {
        const stage = (newStatus.toxicStage ?? 1) + 1;
        finalStatus = { type: 'tox', toxicStage: stage };
      }
    }

    const finalHP = typeof maxHP === 'number'
      ? Math.max(0, Math.round((finalPct / 100) * maxHP))
      : postHP;

    // Commit to the slot
    setMemberByLoc(loc as any, cur => {
      const existing = cur ?? ({ name: defCanon, pct: 100 } as MemberEx);
      return {
        ...existing,
        pct: Math.round(finalPct),
        maxHP: maxHP ?? existing.maxHP,
        curHP: typeof finalHP === 'number' ? finalHP : existing.curHP,
        berry,
        status: finalStatus,
      };
    });

    // Track change so delete/roll-switch can undo perfectly
    setTurns(prev => prev.map((x, idx) => {
      if (idx !== i) return x;
      const applied = x.appliedChanges ?? [];
      return {
        ...x,
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

  function deleteTurn(i: number) {
    const t = turns[i];
    const changes = (t.appliedChanges ?? []).slice().reverse();

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
            <button onClick={addTurn} className="rounded-xl px-3 py-2 bg-emerald-600 hover:bg-emerald-500 transition text-sm font-semibold shadow">+ Add Turn</button>
          </div>

          <div className="space-y-3">
            {turns.map((t, idx) => (
              <div key={t.id} className="flex items-stretch gap-3">
                <div className="w-20 shrink-0 flex items-center justify-end pr-1">
                  <div className="text-sm font-semibold text-neutral-300">Turn {idx+1}:</div>
                </div>

                <div className="flex-1 rounded-xl border border-neutral-800 bg-neutral-900/60 shadow-inner relative z-10">
                  <QueryEditor value={t.text} onChange={(v)=>onEditorChange(idx, v)} dicts={dicts} />
                </div>

                <button
                  onClick={()=>doCalc(idx)}
                  disabled={t.loading}
                  className="shrink-0 h-[44px] rounded-xl px-3 bg-sky-600 hover:bg-sky-500 transition text-sm font-semibold shadow disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {t.loading ? '...' : 'Calc'}
                </button>

                <button
                  onClick={()=>deleteTurn(idx)}
                  className="shrink-0 h-[44px] rounded-xl px-3 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 transition text-sm font-semibold shadow"
                >
                  Delete
                </button>

                <div className="w-[580px] shrink-0">
                  {t.error && <div className="h-[44px] flex items-center text-xs text-red-400">{t.error}</div>}
                  {t.result && !t.error && (
                    <div className="grid grid-cols-3 gap-2">
                      {/* Low = dark yellow */}
                      <button
                        onClick={()=>applyResult(idx, 'low')}
                        className="rounded-lg px-2 py-2 flex flex-col items-center justify-center text-center border bg-gradient-to-b from-yellow-600/45 to-yellow-700/30 border-yellow-700/70 hover:from-yellow-600/55 hover:to-yellow-700/40 transition"
                        title="Apply Low Roll"
                      >
                        <div className="text-[10px] text-yellow-200/90 leading-tight">Low Roll</div>
                        <div className="text-base font-bold text-yellow-50">
                          {Math.round(t.result.lowPct)}%{t.result.lowHP != null ? ` (${t.result.lowHP})` : ''}
                        </div>
                        {t.result.eot?.low && (
                          <div className="text-[10px] text-neutral-300">
                            EoT: {t.result.eot.low.nextPct}%{typeof t.result.eot.low.lossHP === 'number' ? ` (−${t.result.eot.low.lossHP})` : ` (−${t.result.eot.low.lossPct}%)`} {t.result.eot.low.note}
                          </div>
                        )}
                      </button>

                      {/* High = dark orange */}
                      <button
                        onClick={()=>applyResult(idx, 'high')}
                        className="rounded-lg px-2 py-2 flex flex-col items-center justify-center text-center border bg-gradient-to-b from-orange-600/45 to-orange-700/30 border-orange-700/70 hover:from-orange-600/55 hover:to-orange-700/40 transition"
                        title="Apply High Roll"
                      >
                        <div className="text-[10px] text-orange-200/90 leading-tight">High Roll</div>
                        <div className="text-base font-bold text-orange-50">
                          {Math.round(t.result.highPct)}%{t.result.highHP != null ? ` (${t.result.highHP})` : ''}
                        </div>
                        {t.result.eot?.high && (
                          <div className="text-[10px] text-neutral-300">
                            EoT: {t.result.eot.high.nextPct}%{typeof t.result.eot.high.lossHP === 'number' ? ` (−${t.result.eot.high.lossHP})` : ` (−${t.result.eot.high.lossPct}%)`} {t.result.eot.high.note}
                          </div>
                        )}
                      </button>

                      {/* Crit = dark red */}
                      <button
                        onClick={()=>applyResult(idx, 'crit')}
                        className="rounded-lg px-2 py-2 flex flex-col items-center justify-center text-center border bg-gradient-to-b from-red-700/50 to-red-800/40 border-red-800/70 hover:from-red-700/60 hover:to-red-800/50 transition"
                        title="Apply Crit"
                      >
                        <div className="text-[10px] text-red-200/90 leading-tight">Crit</div>
                        <div className="text-base font-bold text-red-50">
                          {Math.round(t.result.critPct)}%{t.result.critHP != null ? ` (${t.result.critHP})` : ''}
                        </div>
                        {t.result.eot?.crit && (
                          <div className="text-[10px] text-neutral-300">
                            EoT: {t.result.eot.crit.nextPct}%{typeof t.result.eot.crit.lossHP === 'number' ? ` (−${t.result.eot.crit.lossHP})` : ` (−${t.result.eot.crit.lossPct}%)`} {t.result.eot.crit.note}
                          </div>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <footer className="text-xs text-neutral-500 mt-6">
          <p>Healing/status items persist in your team box; berries consume once and switching rolls within a turn will “unconsume” them if the new roll wouldn’t proc.</p>
        </footer>
      </div>
    </div>
  );
}
