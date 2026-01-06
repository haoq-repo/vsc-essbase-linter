
/**
 * parser.ts
 *
 * Produces tokens for FIX / ENDFIX, skipping content inside line comments (//),
 * block comments (/* ... * /) and double-quoted strings.
 */

export type TokenType = 'FIX' | 'ENDFIX';

export interface Token {
  type: TokenType;
  line: number;       // 0-based
  column: number;     // 0-based
  lexeme: string;     // 'FIX' or 'ENDFIX'
}

/**
 * Parse Essbase text and return all FIX / ENDFIX tokens found outside comments/strings.
 */
export function parseEssbase(text: string): Token[] {
  const lines = text.split(/\r?\n/);
  const tokens: Token[] = [];
  let inBlockComment = false;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    let line = lines[lineNum];
    let i = 0;

    while (i < line.length) {
      if (inBlockComment) {
        const end = line.indexOf('*/', i);
        if (end === -1) {
          // Still inside block comment; skip the whole line.
          i = line.length;
          continue;
        } else {
          inBlockComment = false;
          i = end + 2;
          continue;
        }
      }

      // Line comment?
      if (line.startsWith('//', i)) {
        break; // rest of the line is a comment
      }

      // Block comment start?
      if (line.startsWith('/*', i)) {
        inBlockComment = true;
        i += 2;
        continue;
      }

      // String?
      if (line[i] === '"') {
        i++; // skip opening quote
        while (i < line.length) {
          if (line[i] === '\\') { i += 2; continue; } // escape sequence
          if (line[i] === '"') { i++; break; }        // closing quote
          i++;
        }
        continue;
      }

      // Try FIX / ENDFIX at current position using case-insensitive word boundary
      // We only want whole words (e.g., FIX, not PREFIX)
      const rest = line.slice(i);
      const fixMatch = /^\bFIX\b/i.exec(rest);
      const endfixMatch = /^\bENDFIX\b/i.exec(rest);

      if (fixMatch) {
        tokens.push({ type: 'FIX', line: lineNum, column: i, lexeme: fixMatch[0] });
        i += fixMatch[0].length;
        continue;
      }
      if (endfixMatch) {
        tokens.push({ type: 'ENDFIX', line: lineNum, column: i, lexeme: endfixMatch[0] });
        i += endfixMatch[0].length;
        continue;
      }

      // Otherwise, advance
      i++;
    }
  }

  return tokens;
}
