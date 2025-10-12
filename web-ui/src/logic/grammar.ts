// src/logic/grammar.ts
export type Slot =
  | 'attacker'
  | 'keyword_use'
  | 'move'
  | 'keyword_on'
  | 'defender'
  | 'bracket_open'
  | 'bracket_token'
  | 'bracket_close'
  | 'done';

export type GrammarState = {
  slot: Slot;
  segmentStart: number;
  segmentEnd: number;
  fragment: string;

  // tokens discovered while scanning (raw, not canonicalized)
  attackerToken?: string;
  moveToken?: string;
  defenderToken?: string;

  // Bracket parsing (raw text inside [...])
  bracket?: {
    openIndex: number;      // index of '[' in the line (if present in defender segment)
    closeIndex: number;     // index of ']' in the line (-1 if not typed yet)
    insideRaw: string;      // current inside content (no closing bracket)
    haveBerry: boolean;
    haveStatus: boolean;
    lastChunk: string;      // last token fragment user is typing inside []
  };
};

/** Strong alias for name matching (kept consistent with parsers/completion). */
export function aliasKey(s: string) {
  return (s || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Analyze the current single-line editor string and return:
 * - Slot (what the user is expected to type next)
 * - Segment ranges for replacement
 * - Current token fragments
 *
 * Grammar: <attacker> use <move> on <defender>[berry, status]
 * Brackets are optional; when present they follow defender with no space: "Defender[ ... ]"
 * We do NOT do team-aware checks here; completion.ts will.
 */
export function analyzeGrammar(line: string): GrammarState {
  const s = line;
  const sl = s.toLowerCase();

  // Find "use"
  const useMatch = sl.match(/(?:^|\s)use(?:\s|$)/);
  const useIdx = useMatch ? (useMatch.index! + (useMatch[0].startsWith(' ') ? 1 : 0)) : -1;

  // No "use" yet -> we are typing attacker, then 'use'
  if (useIdx === -1) {
    const trimmed = s.trimEnd();
    const m = trimmed.match(/([^\s]*)$/);
    const fragment = m ? m[1] : '';
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    const slot: Slot = tokens.length >= 1 ? 'keyword_use' : 'attacker';
    const segStart = trimmed.length - fragment.length;
    const attackerToken = tokens[0] || '';
    return {
      slot,
      segmentStart: segStart,
      segmentEnd: trimmed.length,
      fragment,
      attackerToken,
    };
  }

  // Extract attacker token
  const attackerToken = s.slice(0, useIdx).trim().split(/\s+/)[0] || '';

  // After "use", look for "on"
  const afterUseIdx = useIdx + 'use'.length;
  const restAfterUse = sl.slice(afterUseIdx);
  const onRel = restAfterUse.search(/(?:^|\s)on(?:\s|$)/);
  const onIdx = onRel === -1 ? -1 : afterUseIdx + onRel + (restAfterUse[onRel] === ' ' ? 1 : 0);

  // No "on" yet -> we're typing the move
  if (onIdx === -1) {
    const moveSegStart = afterUseIdx + (s.slice(afterUseIdx).match(/^\s*/)![0].length);
    const moveSeg = s.slice(moveSegStart);
    const fragMatch = moveSeg.match(/([^\s]*)$/);
    const fragment = (moveSeg.trim() || (fragMatch ? fragMatch[1] : ''));
    const segmentStart =
      moveSegStart + (fragMatch ? moveSeg.length - fragMatch[1].length : moveSeg.length);
    const segmentEnd = moveSegStart + moveSeg.length;
    return {
      slot: 'move',
      segmentStart,
      segmentEnd,
      fragment,
      attackerToken,
    };
  }

  // Defender segment starts after "on"
  const afterOnIdx = onIdx + 'on'.length;
  const defSegStart = afterOnIdx + (s.slice(afterOnIdx).match(/^\s*/)![0].length);
  const defSeg = s.slice(defSegStart); // includes possible [ ... ]
  const defSegLower = defSeg.toLowerCase();

  // If there's a bracket in the defender segment, we split name and bracket
  const openIdxRel = defSeg.indexOf('[');
  const closeIdxRel = defSeg.indexOf(']');

  // Compute the editable fragment/range within the defender segment
  if (openIdxRel === -1) {
    // No bracket typed yet: we are typing defender name
    const fragMatch = defSeg.match(/([^\s]*)$/);
    const fragment = fragMatch ? fragMatch[1] : '';
    const segmentStart = defSegStart + (fragMatch ? defSeg.length - fragMatch[1].length : defSeg.length);
    const segmentEnd = defSegStart + defSeg.length;
    return {
      slot: 'defender',
      segmentStart,
      segmentEnd,
      fragment,
      attackerToken,
    };
  }

  // There is a '[', so defender token is before it
  const defenderToken = defSeg.slice(0, openIdxRel).trim();

  // Bracket details
  const openAbs = defSegStart + openIdxRel;
  const closeAbs = (closeIdxRel === -1) ? -1 : (defSegStart + closeIdxRel);

  // Inside raw (no trailing ']')
  const insideRaw = closeIdxRel === -1
    ? defSeg.slice(openIdxRel + 1)
    : defSeg.slice(openIdxRel + 1, closeIdxRel);

  // Split inside into tokens by comma
  const parts = insideRaw.split(',').map(x => x.trim()).filter(x => x.length > 0);
  const lastChunkMatch = insideRaw.match(/([^,]*)$/);
  const lastChunk = (lastChunkMatch ? lastChunkMatch[1] : '').trim();

  // Scan which categories are already present (one-of-each)
  let haveBerry = false;
  let haveStatus = false;
  for (const tok of parts) {
    const t = tok.toLowerCase();
    if (isBerryToken(t)) haveBerry = true;
    if (isStatusToken(t)) haveStatus = true;
  }

  // Decide current slot inside the brackets
  if (closeIdxRel !== -1) {
    // Already closed bracket -> done
    return {
      slot: 'done',
      segmentStart: s.length,
      segmentEnd: s.length,
      fragment: '',
      attackerToken,
      defenderToken,
      bracket: {
        openIndex: openAbs,
        closeIndex: closeAbs,
        insideRaw,
        haveBerry,
        haveStatus,
        lastChunk,
      },
    };
  }

  // Not closed yet → either typing first token or comma/new token, or want to close
  // We return a range AT THE CARET (the completion will overwrite just the current chunk)
  const caretStart = s.length; // monaco will override with precise position
  return {
    slot: insideRaw.trim().length === 0 ? 'bracket_open' : 'bracket_token',
    segmentStart: caretStart,
    segmentEnd: caretStart,
    fragment: lastChunk, // current partial token inside []
    attackerToken,
    defenderToken,
    bracket: {
      openIndex: openAbs,
      closeIndex: -1,
      insideRaw,
      haveBerry,
      haveStatus,
      lastChunk,
    },
  };
}

/** Tiny helpers used by both grammar & completion */
export function isBerryToken(tok: string) {
  const t = tok.toLowerCase();
  return ['oran','sitrus','rawst','pecha','cheri','chesto','aspear'].includes(t);
}
export function isStatusToken(tok: string) {
  const t = tok.toLowerCase();
  return ['psn','bpsn','prlyz','brn','frzn'].includes(t);
}

/**
 * Base parse used by App: attacker/move/defender (defender name WITHOUT brackets).
 * The caller (App) handles the bracket content separately.
 */
export function parseActionFromLine(text: string) {
  const s = text.trim();
  const sl = s.toLowerCase();
  const useMatch = sl.match(/(?:^|\s)use(?:\s|$)/);
  if (!useMatch) return null;
  const useIdx = useMatch.index! + (useMatch[0].startsWith(' ') ? 1 : 0);

  const attacker = s.slice(0, useIdx).trim().split(/\s+/)[0];

  const afterUseIdx = useIdx + 'use'.length;
  const rest = sl.slice(afterUseIdx);
  const onRel = rest.search(/(?:^|\s)on(?:\s|$)/);
  if (onRel === -1) return null;
  const onIdx = afterUseIdx + onRel + (rest[onRel] === ' ' ? 1 : 0);

  const move = s.slice(afterUseIdx, onIdx).trim();

  // Defender raw (may include brackets)
  const defRaw = s.slice(onIdx + 'on'.length).trim();
  if (!attacker || !move || !defRaw) return null;

  // Strip bracket part if present
  const b = defRaw.indexOf('[');
  const defender = (b === -1 ? defRaw : defRaw.slice(0, b)).trim();
  if (!defender) return null;

  return { attacker, move, defender } as const;
}
