
/**
 * rules.ts
 *
 * Contains lint rules operating on the tokens from parser.ts.
 * Rule 1: Every FIX must be closed by an ENDFIX (stack-based matching).
 */

import type { Token } from './parser';

export type Severity = 'error' | 'warning' | 'info';

export interface RuleDiagnostic {
  code: string;           // e.g. 'essbase.fix.missingEndfix' or 'essbase.fix.unmatchedEndfix'
  message: string;
  severity: Severity;
  start: { line: number; character: number };
  end:   { line: number; character: number };
}

export function checkFixEndfixBalance(tokens: Token[]): RuleDiagnostic[] {
  const diags: RuleDiagnostic[] = [];
  const stack: Token[] = [];

  for (const t of tokens) {
    if (t.type === 'FIX') {
      stack.push(t);
    } else if (t.type === 'ENDFIX') {
      if (stack.length === 0) {
        // Unmatched ENDFIX
        diags.push({
          code: 'essbase.fix.unmatchedEndfix',
          message: 'Unmatched ENDFIX — no preceding FIX.',
          severity: 'error',
          start: { line: t.line, character: t.column },
          end:   { line: t.line, character: t.column + t.lexeme.length }
        });
      } else {
        stack.pop(); // match with last FIX
      }
    }
  }

  // Remaining FIX tokens are missing ENDFIX
  for (const unmatched of stack) {
    diags.push({
      code: 'essbase.fix.missingEndfix',
      message: 'Missing ENDFIX for this FIX.',
      severity: 'error',
      start: { line: unmatched.line, character: unmatched.column },
      end:   { line: unmatched.line, character: unmatched.column + unmatched.lexeme.length }
    });
  }

  return diags;
}
