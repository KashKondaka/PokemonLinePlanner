/** Normalize enemytrainer.txt minimal spacing for backend parser */
export function normalizeEnemyTrainerTextForBackend(raw: string) {
    const lines = raw
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);
  
    const fixed = lines.map(line =>
      line
        .replace(/@(?=\S)/g, '@ ')
        .replace(/\s{2,}/g, ' ')
        .trim()
    );
  
    return fixed.slice(0, 6).join('\n');
  }
  