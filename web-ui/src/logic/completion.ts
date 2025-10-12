// src/logic/completion.ts
import type { Dictionaries } from './parsers';
import { analyzeGrammar, aliasKey, isBerryToken, isStatusToken } from './grammar';
import { uniqueSorted } from './parsers';

type CompletionContext = { dicts: Dictionaries };

let _monaco: any | null = null;
let _providerDisposable: any | null = null;
let _ctx: CompletionContext = {
  dicts: {
    mySpecies: [],
    enemySpecies: [],
    movesBySpecies: {},
    movesByAlias: {},
    myItemBySpecies: {},
    enemyItemBySpecies: {},
  } as any,
};

function filterPrefix(arr: string[], frag: string) {
  const f = (frag || '').toLowerCase();
  if (!f) return arr;
  return arr.filter(w => w.toLowerCase().startsWith(f));
}
function dedupe(arr: string[]) {
  return Array.from(new Set(arr));
}

export function initGlobalCompletionProvider(monaco: any) {
  if (_monaco) return;
  _monaco = monaco;

  _providerDisposable = monaco.languages.registerCompletionItemProvider('pokeline', {
    triggerCharacters: [
      ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
      ' ', '-', '.', "'", '[', ']', ',', // important for bracket flow
    ],
    provideCompletionItems(model: any, position: any) {
      const lineToCursor = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
      const g = analyzeGrammar(lineToCursor);
      const frag = (g.fragment || '').toLowerCase();

      const { mySpecies, enemySpecies, movesBySpecies, movesByAlias } = _ctx.dicts;
      const allMons = uniqueSorted([...mySpecies, ...enemySpecies]);

      let pool: string[] = [];
      let insertSuffix = ' ';
      let range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: g.segmentStart + 1,
        endColumn: g.segmentEnd + 1,
      };

      // Helper to suggest moves for the attacker
      const movepool = (() => {
        const atkAlias = g.attackerToken ? aliasKey(g.attackerToken) : '';
        return (atkAlias && movesByAlias[atkAlias]) ? movesByAlias[atkAlias] : [];
      })();

      // Team-aware helper for defender bracket availability
      const defenderIsMy = (() => {
        const dt = (g.defenderToken || '').toLowerCase();
        return mySpecies.some(n => n.toLowerCase() === dt);
      })();
      const defenderIsEnemy = (() => {
        const dt = (g.defenderToken || '').toLowerCase();
        return enemySpecies.some(n => n.toLowerCase() === dt);
      })();

      // Inside-bracket token state (what's already present)
      const haveBerry = g.bracket?.haveBerry ?? false;
      const haveStatus = g.bracket?.haveStatus ?? false;

      switch (g.slot) {
        case 'attacker': {
          pool = allMons;
          break;
        }
        case 'keyword_use': {
          pool = ['use'];
          break;
        }
        case 'move': {
          pool = movepool.length ? movepool : dedupe(Object.values(movesBySpecies).flat());
          break;
        }
        case 'keyword_on': {
          pool = ['on'];
          break;
        }
        case 'defender': {
          // Suggest opposite roster by default, but first token can be any mon
          const atk = (g.attackerToken || '').toLowerCase();
          const attackerIsMy = mySpecies.some(n => n.toLowerCase() === atk);
          const attackerIsEnemy = enemySpecies.some(n => n.toLowerCase() === atk);
          const mons = attackerIsMy ? enemySpecies : attackerIsEnemy ? mySpecies : allMons;
          pool = mons;
          break;
        }
        case 'bracket_open': {
          // Only suggest '[' if defender is My Team (not enemy)
          if (defenderIsMy) {
            pool = ['['];
            insertSuffix = ''; // user will type token next
            // insert at caret (not replacing defender); override range:
            range = {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: position.column,
              endColumn: position.column,
            };
          } else {
            pool = []; // enemy defender → no bracket suggestions
          }
          break;
        }
        case 'bracket_token': {
          // We are inside [...), before a closing ']'.
          // Offer remaining categories + ']' when appropriate.
          // Allowed berries + statuses:
          const berryOpts = ['oran','sitrus','rawst','pecha','cheri','chesto','aspear'];
          const statusOpts = ['psn','bpsn','prlyz','brn','frzn'];

          let candidates: string[] = [];
          const fragInside = frag; // fragment of current token

          // If neither chosen yet, offer both sets
          if (!haveBerry) candidates.push(...berryOpts);
          if (!haveStatus) candidates.push(...statusOpts);

          // If we already have both categories OR fragment is empty and at least one token present → also offer ']'
          const insideHasAny = (g.bracket?.insideRaw || '').trim().length > 0;
          if ((haveBerry || haveStatus) && insideHasAny) {
            candidates.push(']', ','); // allow closing or comma to add the other category
          } else if (!insideHasAny) {
            // first token: do not offer ']' yet
          }

          // Filter by prefix for actual tokens (but keep ',' and ']' unfiltered if fragment empty)
          const specials = [']', ','];
          const filtered =
            fragInside
              ? candidates.filter(x => specials.includes(x) ? x.startsWith(fragInside) : x.toLowerCase().startsWith(fragInside))
              : candidates;

          pool = dedupe(filtered);

          // Insert at caret; do not replace defender/bracket text
          range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: position.column,
            endColumn: position.column,
          };

          // Suffix rules:
          //  - if selecting a token (berry/status) and the other category still missing → add ", "
          //  - if selecting final token or selecting ']' → add just ']' or space after if closing
          // We’ll set suffix per-suggestion below by mapping.
          break;
        }
        case 'bracket_close': // (not used separately; covered above)
        case 'done':
        default: {
          pool = [];
          break;
        }
      }

      // Final filtering for non-bracket slots
      if (g.slot !== 'bracket_token') {
        pool = filterPrefix(pool, frag);
      }
      // Limit and map to Monaco items
      const suggestions = pool.slice(0, 80).map((label: string, idx: number) => {
        let insertText = label;
        let thisSuffix = insertSuffix;

        if (g.slot === 'bracket_token') {
          // Determine smart suffixes:
          if (label === ']') {
            insertText = '] ';
            thisSuffix = '';
          } else if (label === ',') {
            insertText = ', ';
            thisSuffix = '';
          } else {
            // It's a token (berry/status)
            const t = label.toLowerCase();
            const willConsumeBerry = isBerryToken(t) && !haveBerry;
            const willConsumeStatus = isStatusToken(t) && !haveStatus;

            // If after choosing this we still need the other category and it isn't present insideRaw, add comma-space
            const needsOther =
              (willConsumeBerry && !haveStatus) ||
              (willConsumeStatus && !haveBerry);

            if (needsOther) {
              insertText = label + ', ';
              thisSuffix = '';
            } else {
              // Last token → maybe offer auto close? Prefer not to auto-close here to avoid surprise.
              insertText = label + ' ';
              thisSuffix = '';
            }
          }
        } else {
          insertText = label + thisSuffix;
        }

        return {
          label,
          kind: _monaco.languages.CompletionItemKind.Text,
          insertText,
          sortText: String(idx).padStart(4, '0'),
          range,
        };
      });

      return { suggestions };
    },
  });
}

export function updateCompletionDicts(dicts: Dictionaries) {
  _ctx.dicts = dicts;
}

export function disposeGlobalCompletion() {
  _providerDisposable?.dispose?.();
  _providerDisposable = null;
  _monaco = null;
}
