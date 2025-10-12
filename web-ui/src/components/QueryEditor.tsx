// src/components/QueryEditor.tsx
import React, { useEffect, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { registerLanguageAndTheme, LANG_ID, THEME_ID } from '../logic/monacoLanguage';
import { initGlobalCompletionProvider, updateCompletionDicts } from '../logic/completion';
import type { Dictionaries } from '../logic/parsers';
import { analyzeGrammar } from '../logic/grammar';

// SAME aliasKey logic used everywhere (grammar/parsers)
function aliasKey(s: string) {
  return (s || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

type Props = {
  value: string;
  onChange: (v: string) => void;
  dicts: Dictionaries;
};

export default function QueryEditor({ value, onChange, dicts }: Props) {
  const editorRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);
  const myAliasesRef = useRef<Set<string>>(new Set());
  const enemyAliasesRef = useRef<Set<string>>(new Set());

  // keep completion dictionaries up-to-date (global provider reads these)
  useEffect(() => {
    updateCompletionDicts(dicts);
    myAliasesRef.current = new Set(dicts.mySpecies.map(aliasKey));
    enemyAliasesRef.current = new Set(dicts.enemySpecies.map(aliasKey));
    // also refresh decorations when dicts change
    if (editorRef.current) applySemanticDecorations(editorRef.current.getModel()?.getLanguageId ? editorRef.current._monaco : null);
  }, [dicts]);

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    registerLanguageAndTheme(monaco);
    initGlobalCompletionProvider(monaco); // register ONCE globally

    editor.updateOptions({
      fontSize: 14,
      fontLigatures: true,
      lineNumbers: 'off',
      minimap: { enabled: false },
      wordWrap: 'off',
      roundedSelection: true,
      renderLineHighlight: 'none',
      padding: { top: 8, bottom: 8 },
      quickSuggestions: { other: true, comments: true, strings: true },
      quickSuggestionsDelay: 0,
      suggestOnTriggerCharacters: true,
      tabSize: 2,
      scrollbar: { vertical: 'hidden', horizontal: 'hidden' },
      scrollBeyondLastLine: false,
      contextmenu: false,
      cursorBlinking: 'smooth',

      // allow suggest widget to escape
      fixedOverflowWidgets: true,
    });

    // render overflow widgets at <body> level (prevents clipping)
    editor.updateOptions({
      overflowWidgetsDomNode: document.body as unknown as HTMLElement,
    });

    // Ensure model language & theme
    const model = editor.getModel?.();
    if (model) monaco.editor.setModelLanguage(model, LANG_ID);
    monaco.editor.setTheme(THEME_ID);

    const triggerSuggest = () => editor.trigger('any', 'editor.action.triggerSuggest', {});

    // Open suggestions on focus + every edit
    editor.onDidFocusEditorText(() => {
      triggerSuggest();
      applySemanticDecorations(monaco);
    });
    editor.onDidChangeModelContent(() => {
      triggerSuggest();
      applySemanticDecorations(monaco);
      if (editor.getValue().length === 0) setTimeout(triggerSuggest, 0);
    });

    // After backspace, nudge suggestions (without consuming the key)
    editor.onKeyDown((e) => {
      if (e.keyCode === monaco.KeyCode.Backspace) {
        setTimeout(() => {
          triggerSuggest();
          applySemanticDecorations(monaco);
        }, 0);
      }
    });

    // Initial decorations
    applySemanticDecorations(monaco);
  };

  // Apply semantic coloring: my = blue, enemy = red, move = bold
  function applySemanticDecorations(monaco: any) {
    const ed = editorRef.current;
    if (!ed || !monaco) return;

    const text: string = ed.getValue() ?? '';
    const lower = text.toLowerCase();

    // Compute indices for "use" and "on"
    const useMatch = lower.match(/(?:^|\s)use(?:\s|$)/);
    const useIdx = useMatch ? (useMatch.index! + (useMatch[0].startsWith(' ') ? 1 : 0)) : -1;

    let onIdx = -1;
    if (useIdx !== -1) {
      const afterUseIdx = useIdx + 'use'.length;
      const rest = lower.slice(afterUseIdx);
      const rel = rest.search(/(?:^|\s)on(?:\s|$)/);
      onIdx = rel === -1 ? -1 : afterUseIdx + rel + (rest[rel] === ' ' ? 1 : 0);
    }

    const lineNumber = 1; // single-line editor
    const decorations: any[] = [];

    // --- Attacker range + color (even if "use" not typed yet)
    let attackerEnd = -1;
    if (useIdx !== -1) {
      attackerEnd = useIdx;
    } else {
      // if no "use" yet, color the first token typed
      const firstWordMatch = text.match(/^\s*([^\s]+)/);
      attackerEnd = firstWordMatch ? (firstWordMatch.index! + firstWordMatch[0].length) : -1;
    }

    if (attackerEnd > 0) {
      const attackerRaw = text.slice(0, attackerEnd).trim().split(/\s+/)[0] || '';
      const attackerAlias = aliasKey(attackerRaw);

      const attackerRange = new monaco.Range(lineNumber, 1, lineNumber, attackerEnd + 1);
      const isMy = myAliasesRef.current.has(attackerAlias);
      const isEnemy = enemyAliasesRef.current.has(attackerAlias);

      decorations.push({
        range: attackerRange,
        options: {
          inlineClassName: isMy ? 'poke-my' : (isEnemy ? 'poke-enemy' : 'poke-unknown'),
        },
      });
    }

    // --- Move range (between 'use' and 'on')
    if (useIdx !== -1) {
      const afterUseIdx = useIdx + 'use'.length;
      const ws = text.slice(afterUseIdx).match(/^\s*/)?.[0].length ?? 0;
      const moveStart = afterUseIdx + ws;
      const moveEnd = onIdx !== -1 ? onIdx : text.length;
      if (moveStart < moveEnd) {
        const moveRange = new monaco.Range(lineNumber, moveStart + 1, lineNumber, moveEnd + 1);
        decorations.push({
          range: moveRange,
          options: { inlineClassName: 'poke-move' },
        });
      }
    }

    // --- Defender range + color (after 'on')
    if (onIdx !== -1) {
      const ws2 = text.slice(onIdx + 'on'.length).match(/^\s*/)?.[0].length ?? 0;
      const defStart = onIdx + 'on'.length + ws2;
      if (defStart < text.length) {
        const defenderRange = new monaco.Range(lineNumber, defStart + 1, lineNumber, text.length + 1);

        // Extract defender token (strip "(...)" if present)
        const tail = text.slice(defStart).trim();
        const defName = tail.replace(/\(.*$/, '').trim().split(/\s+/)[0] || '';
        const defAlias = aliasKey(defName);

        const isMyDef = myAliasesRef.current.has(defAlias);
        const isEnemyDef = enemyAliasesRef.current.has(defAlias);

        decorations.push({
          range: defenderRange,
          options: {
            inlineClassName: isEnemyDef ? 'poke-enemy' : (isMyDef ? 'poke-my' : 'poke-unknown'),
          },
        });
      }
    }

    decorationsRef.current = ed.deltaDecorations(decorationsRef.current, decorations);
  }

  useEffect(() => {
    // CSS for inline classes
    const style = document.createElement('style');
    style.textContent = `
      .monaco-editor .poke-my { color: #7aa2ff !important; font-weight: 600; }
      .monaco-editor .poke-enemy { color: #ff7a7a !important; font-weight: 600; }
      .monaco-editor .poke-move { font-weight: 700; }
      .monaco-editor .poke-unknown { color: #cbd5e1 !important; }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  return (
    <Editor
      height="44px"
      language={LANG_ID}
      value={value}
      onChange={(v) => onChange(v || '')}
      onMount={onMount}
      options={{
        lineNumbers: 'off',
        minimap: { enabled: false },
        fontSize: 14,
        fontLigatures: true,
        wordWrap: 'off',
        padding: { top: 8, bottom: 8 },
        quickSuggestions: { other: true, comments: true, strings: true },
        quickSuggestionsDelay: 0,
        suggestOnTriggerCharacters: true,
        tabSize: 2,
        renderLineHighlight: 'none',
        scrollBeyondLastLine: false,
        contextmenu: false,
        cursorBlinking: 'smooth',
        roundedSelection: true,
        fixedOverflowWidgets: true, // keep also in options
      }}
    />
  );
}
