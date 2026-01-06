/**
 * parser.ts
 * Produces tokens for FIX / ENDFIX / IF / ELSEIF / ELSE / ENDIF,
 * skipping content inside comments and double-quoted strings.
 */

export type TokenType = 'FIX' | 'ENDFIX' | 'IF' | 'ELSEIF' | 'ELSE' | 'ENDIF';

export interface Token {
  type: TokenType;
  line: number;     // 0-based
  column: number;   // 0-based
  lexeme: string;   // original matched keyword text
}

/**
 * Parse Essbase text and return tokens found outside comments/strings.
 */
export function parseEssbase(text: string): Token[] {
  const lines = text.split(/\r?\n/);
  const tokens: Token[] = [];
  let inBlockComment = false;

  const tryKeyword = (lineNum: number, i: number, line: string, kw: RegExp, type: TokenType): number | null => {
    const rest = line.slice(i);
    const m = kw.exec(rest);
    if (!m) return null;
    const lexeme = m[0];
    tokens.push({ type, line: lineNum, column: i, lexeme });
    return i + lexeme.length;
  };

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    let i = 0;

    while (i < line.length) {
      // Handle block comment state
      if (inBlockComment) {
        const end = line.indexOf('*/', i);
        if (end === -1) { i = line.length; continue; }
        inBlockComment = false;
        i = end + 2;
        continue;
      }

      // Block comment start?
      if (line.startsWith('/*', i)) { inBlockComment = true; i += 2; continue; }

      // String?
      if (line[i] === '"') {
        i++;
        while (i < line.length) {
          if (line[i] === '\\') { i += 2; continue; }
          if (line[i] === '"') { i++; break; }
          i++;
        }
        continue;
      }

      // Try keywords at current position (case-insensitive, word-boundary)
      // Note: Order matters: ELSEIF must be checked before ELSE.
      const kwElseIf = /^\bELSEIF\b/i;
      const kwElse   = /^\bELSE\b/i;
      const kwIf     = /^\bIF\b/i;
      const kwEndIf  = /^\bENDIF\b/i;
      const kwFix    = /^\bFIX\b/i;
      const kwEndFix = /^\bENDFIX\b/i;

      let next: number | null = null;
      next = tryKeyword(lineNum, i, line, kwElseIf, 'ELSEIF');
      if (next !== null) { i = next; continue; }

      next = tryKeyword(lineNum, i, line, kwElse, 'ELSE');
      if (next !== null) { i = next; continue; }

      next = tryKeyword(lineNum, i, line, kwIf, 'IF');
      if (next !== null) { i = next; continue; }

      next = tryKeyword(lineNum, i, line, kwEndIf, 'ENDIF');
      if (next !== null) { i = next; continue; }

      next = tryKeyword(lineNum, i, line, kwFix, 'FIX');
      if (next !== null) { i = next; continue; }

      next = tryKeyword(lineNum, i, line, kwEndFix, 'ENDFIX');
      if (next !== null) { i = next; continue; }

      i++;
    }
  }

  return tokens;
}
