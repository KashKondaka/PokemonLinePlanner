// src/logic/monacoLanguage.ts
export const LANG_ID = 'pokeline';
export const THEME_ID = 'pokeline-theme';

export function registerLanguageAndTheme(monaco: any) {
  // Register once idempotently
  if (!(monaco.languages.getLanguages() || []).some((l: any) => l.id === LANG_ID)) {
    monaco.languages.register({ id: LANG_ID });

    monaco.languages.setMonarchTokensProvider(LANG_ID, {
      tokenizer: {
        root: [
          [/\s+/, 'white'],
          [/[^ \t]+/, { cases: { '@eos': 'entity.attacker', '@default': { token: 'entity.attacker', next: '@maybeUse' } } }],
        ],
        maybeUse: [
          [/\s+/, 'white'],
          [/use\b/i, { token: 'keyword.use', next: '@afterUse' }],
          [/[^ \t]+/, 'entity.attacker'],
        ],
        afterUse: [
          [/\s+/, 'white'],
          [/on\b/i, { token: 'keyword.on', next: '@afterOn' }],
          [/[^ \t]+/, 'move.bold'],
        ],
        afterOn: [
          [/\s+/, 'white'],
          [/[^ \t]+/, 'entity.defender'],
        ],
      },
    });

    monaco.editor.defineTheme(THEME_ID, {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'entity.attacker', foreground: '7aa2ff' },   // blue-ish
        { token: 'keyword.use', foreground: 'c084fc', fontStyle: 'bold' },
        { token: 'keyword.on',  foreground: 'c084fc', fontStyle: 'bold' },
        { token: 'move.bold', foreground: 'ffffff', fontStyle: 'bold' },
        { token: 'entity.defender', foreground: 'ff7a7a' },   // red-ish
      ],
      colors: {},
    });
  }
}
