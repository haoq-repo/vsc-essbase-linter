/**
 * rules.ts
 * Rule framework + FIX/ENDFIX balance + IF/ELSEIF/ELSE/ENDIF balance.
 */

import type { Token } from './parser';

export type Severity = 'error' | 'warning' | 'info';

export interface RuleOptions {
  enabled?: boolean;
  severity?: Severity;
}

export interface RuleDiagnostic {
  code: string; // e.g. 'essbase.if.missingEndif'
  message: string;
  severity: Severity;
  start: { line: number; character: number };
  end:   { line: number; character: number };
}

export interface Rule {
  id: string;
  description: string;
  apply(tokens: Token[], options: RuleOptions): RuleDiagnostic[];
}

/* ------------------------ FIX/ENDFIX balance ------------------------ */

export const fixEndfixBalanceRule: Rule = {
  id: 'essbase.fix.balance',
  description: 'Every FIX must be closed by an ENDFIX; ENDFIX must have a preceding FIX.',
  apply(tokens: Token[], options: RuleOptions): RuleDiagnostic[] {
    const diags: RuleDiagnostic[] = [];
    const stack: Token[] = [];

    for (const t of tokens) {
      if (t.type === 'FIX') {
        stack.push(t);
      } else if (t.type === 'ENDFIX') {
        if (stack.length === 0) {
          diags.push({
            code: 'essbase.fix.unmatchedEndfix',
            message: 'Unmatched ENDFIX — no preceding FIX.',
            severity: options.severity ?? 'error',
            start: { line: t.line, character: t.column },
            end:   { line: t.line, character: t.column + t.lexeme.length }
          });
        } else {
          stack.pop();
        }
      }
    }

    for (const unmatched of stack) {
      diags.push({
        code: 'essbase.fix.missingEndfix',
        message: 'Missing ENDFIX for this FIX.',
        severity: options.severity ?? 'error',
        start: { line: unmatched.line, character: unmatched.column },
        end:   { line: unmatched.line, character: unmatched.column + unmatched.lexeme.length }
      });
    }

    return diags;
  }
};

/* ------------------ IF / ELSEIF / ELSE / ENDIF balance ------------------ */

export const ifElseEndifBalanceRule: Rule = {
  id: 'essbase.if.balance',
  description: 'IF chains must be balanced; ELSEIF is allowed inside IF; only one ELSE per IF; ENDIF must close an IF.',
  apply(tokens: Token[], options: RuleOptions): RuleDiagnostic[] {
    const diags: RuleDiagnostic[] = [];

    // Track IF stacks; each frame records whether an ELSE has appeared.
    const stack: { ifToken: Token; elseSeen: boolean }[] = [];

    for (const t of tokens) {
      switch (t.type) {
        case 'IF':
          stack.push({ ifToken: t, elseSeen: false });
          break;

        case 'ELSEIF':
          if (stack.length === 0) {
            diags.push({
              code: 'essbase.if.unexpectedElseif',
              message: 'ELSEIF found outside of an IF block.',
              severity: options.severity ?? 'error',
              start: { line: t.line, character: t.column },
              end:   { line: t.line, character: t.column + t.lexeme.length }
            });
          } else {
            // valid: multiple ELSEIF allowed; does not consume/close IF and does not set elseSeen
          }
          break;

        case 'ELSE':
          if (stack.length === 0) {
            diags.push({
              code: 'essbase.if.unexpectedElse',
              message: 'ELSE found outside of an IF block.',
              severity: options.severity ?? 'error',
              start: { line: t.line, character: t.column },
              end:   { line: t.line, character: t.column + t.lexeme.length }
            });
          } else {
            const top = stack[stack.length - 1];
            if (top.elseSeen) {
              diags.push({
                code: 'essbase.if.duplicateElse',
                message: 'Duplicate ELSE in the same IF block.',
                severity: options.severity ?? 'error',
                start: { line: t.line, character: t.column },
                end:   { line: t.line, character: t.column + t.lexeme.length }
              });
            } else {
              top.elseSeen = true;
            }
          }
          break;

        case 'ENDIF':
          if (stack.length === 0) {
            diags.push({
              code: 'essbase.if.unmatchedEndif',
              message: 'Unmatched ENDIF — no preceding IF.',
              severity: options.severity ?? 'error',
              start: { line: t.line, character: t.column },
              end:   { line: t.line, character: t.column + t.lexeme.length }
            });
          } else {
            stack.pop();
          }
          break;

        default:
          // other tokens ignored
          break;
      }
    }

    // Any remaining IF needs an ENDIF
    for (const frame of stack) {
      const unmatched = frame.ifToken;
      diags.push({
        code: 'essbase.if.missingEndif',
        message: 'Missing ENDIF for this IF.',
        severity: options.severity ?? 'error',
        start: { line: unmatched.line, character: unmatched.column },
        end:   { line: unmatched.line, character: unmatched.column + unmatched.lexeme.length }
      });
    }

    return diags;
  }
};

/* -------------------- Optional placeholder rule (nesting) -------------------- */
export const nestedFixOrderRule: Rule = {
  id: 'essbase.fix.nesting',
  description: 'Disallow overlapping FIX blocks (placeholder).',
  apply(_tokens: Token[], _options: RuleOptions): RuleDiagnostic[] {
    return [];
  }
};

/* ------------------------------ Registry ------------------------------ */
export const ALL_RULES: Rule[] = [
  fixEndfixBalanceRule,
  ifElseEndifBalanceRule,
  nestedFixOrderRule
];