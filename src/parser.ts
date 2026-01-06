
/**
 * parser.ts
 *
 * Produces tokens for FIX / ENDFIX / IF / ELSEIF / ELSE / ENDIF,
 * and detects comma issues with awareness of valid multi-line lists
 * inside parentheses/brackets. Skips comments and strings while scanning.
 */

export type TokenType = 'FIX' | 'ENDFIX' | 'IF' | 'ELSEIF' | 'ELSE' | 'ENDIF';

export interface Token {
  type: TokenType;
  line: number;     // 0-based
  column: number;   // 0-based
  lexeme: string;   // original matched keyword text
}

/* ---------------- Comma issues (for rogue comma rule) ---------------- */

export type CommaIssueKind = 'trailing' | 'double';

export interface CommaIssue {
  kind: CommaIssueKind;
  line: number;       // 0-based
  startCol: number;   // inclusive
  endCol: number;     // exclusive
}

/**
 * Helper: find first significant (non-whitespace) character starting at a given line,
 * skipping comments
 * IMPORTANT: Treat the start of a string `"` and typical identifier/number starts
 * as *significant* (meaning list content continues).
 *
 * Returns:
 *  - { line, col, char } for the first significant character
 *  - null if nothing significant remains
 */
function findFirstSignificantCharFrom(
  lines: string[],
  startLine: number,
  inBlockCommentStart: boolean
): { line: number; col: number; char: string } | null {
  let inBlockComment = inBlockCommentStart;

  for (let ln = startLine; ln < lines.length; ln++) {
    const line = lines[ln];
    let i = 0;

    while (i < line.length) {
      // Inside block comment
      if (inBlockComment) {
        const end = line.indexOf('*/', i);
        if (end === -1) { i = line.length; break; }
        inBlockComment = false;
        i = end + 2;
        continue;
      }

      // Skip whitespace
      if (/\s/.test(line[i])) { i++; continue; }

      // Block comment start?
      if (line.startsWith('/*', i)) { inBlockComment = true; i += 2; continue; }

      // Treat the start of a string as significant content
      if (line[i] === '"') {
        return { line: ln, col: i, char: '"' };
      }

      // Treat typical identifier/number starts as significant content
      if (/[A-Za-z0-9_]/.test(line[i])) {
        return { line: ln, col: i, char: line[i] };
      }

      // Otherwise, return the symbol we see (e.g., ',', ')', ']', etc.)
      return { line: ln, col: i, char: line[i] };
    }
    // Next line
  }
  return null;
}

/**
 * Scan for comma problems outside comments/strings:
 *  - trailing: ',' followed by optional whitespace then ')' or ']' (same line or next significant line)
 *  - double:   ',' followed by optional whitespace then another ',' (same line or next significant line)
 *  - EOL comma inside (...) or [...] is OK if next significant char is not ')' or ']'.
 */
export function findCommaIssues(text: string): CommaIssue[] {
  const lines = text.split(/\r?\n/);
  const issues: CommaIssue[] = [];
  let inBlockComment = false;

  let parenDepth = 0;
  let bracketDepth = 0;

  const nextNonWSOnLine = (s: string, idx: number): number => {
    while (idx < s.length && /\s/.test(s[idx])) idx++;
    return idx;
  };

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    let i = 0;

    while (i < line.length) {
      // Block comment?
      if (inBlockComment) {
        const end = line.indexOf('*/', i);
        if (end === -1) { i = line.length; continue; }
        inBlockComment = false;
        i = end + 2;
        continue;
      }

      // Block comment start?
      if (line.startsWith('/*', i)) { inBlockComment = true; i += 2; continue; }

      // String skip for scanning (not for look-ahead)
      if (line[i] === '"') {
        i++;
        while (i < line.length) {
          if (line[i] === '\\') { i += 2; continue; }
          if (line[i] === '"') { i++; break; }
          i++;
        }
        continue;
      }

      // Track enclosures
      if (line[i] === '(') { parenDepth++; i++; continue; }
      if (line[i] === ')') { parenDepth = Math.max(parenDepth - 1, 0); i++; continue; }
      if (line[i] === '[') { bracketDepth++; i++; continue; }
      if (line[i] === ']') { bracketDepth = Math.max(bracketDepth - 1, 0); i++; continue; }

      // Comma checks
      if (line[i] === ',') {
        const j = nextNonWSOnLine(line, i + 1);

        // Same-line double comma
        if (j < line.length && line[j] === ',') {
          issues.push({ kind: 'double', line: lineNum, startCol: i, endCol: j + 1 });
          i = j + 1;
          continue;
        }

        // Same-line trailing comma
        if (j < line.length && (line[j] === ')' || line[j] === ']')) {
          issues.push({ kind: 'trailing', line: lineNum, startCol: i, endCol: i + 1 });
          i = i + 1;
          continue;
        }

        // End-of-line comma
        if (j >= line.length) {
          const insideEnclosure = (parenDepth + bracketDepth) > 0;

          if (!insideEnclosure) {
            // Outside any enclosure: check next significant char only for double comma across lines
            const nextSig = findFirstSignificantCharFrom(lines, lineNum + 1, inBlockComment);
            if (nextSig && nextSig.char === ',') {
              issues.push({ kind: 'double', line: lineNum, startCol: i, endCol: nextSig.col + 1 });
            }
            i = i + 1;
            continue;
          }

          // Inside (...) or [...]
          const nextSig = findFirstSignificantCharFrom(lines, lineNum + 1, inBlockComment);
          if (nextSig) {
            if (nextSig.char === ')' || nextSig.char === ']') {
              // Next significant is closer → trailing
              issues.push({ kind: 'trailing', line: lineNum, startCol: i, endCol: i + 1 });
            } else if (nextSig.char === ',') {
              // Double comma across lines
              issues.push({ kind: 'double', line: lineNum, startCol: i, endCol: nextSig.col + 1 });
            }
            // Else: content continues (e.g., '"' or identifier) → no issue
          }
        }

        i = i + 1;
        continue;
      }

      i++;
    }
  }

  return issues;
}

/* ---------------- Existing tokenization ---------------- */

/**
 * Parse Essbase text and return tokens found outside comments/strings.
 * Emits FIX, ENDFIX, IF, ELSEIF, ELSE, ENDIF tokens.
 */
export function parseEssbase(text: string): Token[] {
  const lines = text.split(/\r?\n/);
  const tokens: Token[] = [];
  let inBlockComment = false;

  // Optional enclosure tracking for future rule extensions
  let parenDepth = 0;
  let bracketDepth = 0;

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
      if (inBlockComment) {
        const end = line.indexOf('*/', i);
        if (end === -1) { i = line.length; continue; }
        inBlockComment = false;
        i = end + 2;
        continue;
      }

      if (line.startsWith('/*', i)) { inBlockComment = true; i += 2; continue; }

      if (line[i] === '"') {
        i++;
        while (i < line.length) {
          if (line[i] === '\\') { i += 2; continue; }
          if (line[i] === '"') { i++; break; }
          i++;
        }
        continue;
      }

      // Enclosures (optional tracking)
      if (line[i] === '(') { parenDepth++; i++; continue; }
      if (line[i] === ')') { parenDepth = Math.max(parenDepth - 1, 0); i++; continue; }
      if (line[i] === '[') { bracketDepth++; i++; continue; }
      if (line[i] === ']') { bracketDepth = Math.max(bracketDepth - 1, 0); i++; continue; }

      // Order matters: ELSEIF before ELSE
      const kwElseIf = /^\bELSEIF\b/i;
      const kwElse   = /^\bELSE\b/i;
      const kwIf     = /^\bIF\b/i;
      const kwEndIf  = /^\bENDIF\b/i;
      const kwFix    = /^\bFIX\b/i;
      const kwEndFix = /^\bENDFIX\b/i;

      let next: number | null = null;
      next = tryKeyword(lineNum, i, line, kwElseIf, 'ELSEIF'); if (next !== null) { i = next; continue; }
      next = tryKeyword(lineNum, i, line, kwElse,   'ELSE');   if (next !== null) { i = next; continue; }
      next = tryKeyword(lineNum, i, line, kwIf,     'IF');     if (next !== null) { i = next; continue; }
      next = tryKeyword(lineNum, i, line, kwEndIf,  'ENDIF');  if (next !== null) { i = next; continue; }
      next = tryKeyword(lineNum, i, line, kwFix,    'FIX');    if (next !== null) { i = next; continue; }
      next = tryKeyword(lineNum, i, line, kwEndFix, 'ENDFIX'); if (next !== null) { i = next; continue; }

      i++;
    }
  }

  return tokens;
}