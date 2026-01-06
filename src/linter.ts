
/**
 * linter.ts
 *
 * Converts rule diagnostics to VS Code diagnostics, manages the collection,
 * and provides a Quick Fix to insert ENDFIX.
 */

import * as vscode from 'vscode';
import { parseEssbase } from './parser';
import { checkFixEndfixBalance, RuleDiagnostic } from './rules';

const COLLECTION_NAME = 'essbase-linter';

export const DIAG_CODE_MISSING_ENDFIX = 'essbase.fix.missingEndfix';
export const DIAG_CODE_UNMATCHED_ENDFIX = 'essbase.fix.unmatchedEndfix';

export function createCollection(): vscode.DiagnosticCollection {
  return vscode.languages.createDiagnosticCollection(COLLECTION_NAME);
}

export function lintDocument(doc: vscode.TextDocument, collection: vscode.DiagnosticCollection) {
  if (doc.languageId !== 'essbase') return;

  const text = doc.getText();
  const tokens = parseEssbase(text);
  const ruleDiags = checkFixEndfixBalance(tokens);

  const toVscodeDiag = (rd: RuleDiagnostic): vscode.Diagnostic => {
    const range = new vscode.Range(
      new vscode.Position(rd.start.line, rd.start.character),
      new vscode.Position(rd.end.line, rd.end.character)
    );

    const sev =
      rd.severity === 'error' ? vscode.DiagnosticSeverity.Error :
      rd.severity === 'warning' ? vscode.DiagnosticSeverity.Warning :
      vscode.DiagnosticSeverity.Information;

    const d = new vscode.Diagnostic(range, rd.message, sev);
    d.code = rd.code;
    d.source = 'Essbase Linter';
    return d;
  };

  const diagnostics = ruleDiags.map(toVscodeDiag);
  collection.set(doc.uri, diagnostics);
}

/**
 * Quick Fix provider: for 'missing ENDFIX', insert ENDFIX on the line after FIX,
 * preserving indentation of the FIX line.
 */
export class MissingEndfixQuickFixProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    for (const diag of context.diagnostics) {
      if (diag.code === DIAG_CODE_MISSING_ENDFIX) {
        const fix = new vscode.CodeAction('Insert ENDFIX', vscode.CodeActionKind.QuickFix);
        fix.diagnostics = [diag];
        fix.isPreferred = true;

        const fixLine = diag.range.start.line;
        const insertLine = Math.min(fixLine + 1, document.lineCount);
        const indent = getLeadingWhitespace(document.lineAt(fixLine).text);

        const edit = new vscode.WorkspaceEdit();
        edit.insert(document.uri, new vscode.Position(insertLine, 0), `${indent}ENDFIX\n`);
        fix.edit = edit;

        actions.push(fix);
      }
    }

    return actions;
  }
}

function getLeadingWhitespace(lineText: string): string {
  const m = /^(\s*)/.exec(lineText);
  return m ? m[1] : '';
}
