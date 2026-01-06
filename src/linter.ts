/**
 * linter.ts
 * Runs all enabled rules over parser tokens; converts results to VS Code diagnostics.
 * Provides quick fixes for missing ENDFIX and missing ENDIF.
 */

import * as vscode from 'vscode';
import { parseEssbase } from './parser';
import { ALL_RULES, RuleDiagnostic, Severity } from './rules';

const COLLECTION_NAME = 'essbase-linter';

export function createCollection(): vscode.DiagnosticCollection {
  return vscode.languages.createDiagnosticCollection(COLLECTION_NAME);
}

type RuleConfig = {
  [ruleId: string]: { enabled?: boolean; severity?: Severity };
};

function getConfig(): { rules: RuleConfig } {
  const cfg = vscode.workspace.getConfiguration('essbaseLinter');
  const rules = cfg.get<RuleConfig>('rules', {});
  return { rules };
}

export function lintDocument(doc: vscode.TextDocument, collection: vscode.DiagnosticCollection) {
  if (doc.languageId !== 'essbase') return;

  const { rules: ruleConfig } = getConfig();
  const tokens = parseEssbase(doc.getText());
  const diags: vscode.Diagnostic[] = [];

  const toVscodeSeverity = (s: Severity | undefined): vscode.DiagnosticSeverity => {
    switch (s) {
      case 'warning': return vscode.DiagnosticSeverity.Warning;
      case 'info':    return vscode.DiagnosticSeverity.Information;
      case 'error':
      default:        return vscode.DiagnosticSeverity.Error;
    }
  };

  const push = (rd: RuleDiagnostic) => {
    const range = new vscode.Range(
      new vscode.Position(rd.start.line, rd.start.character),
      new vscode.Position(rd.end.line,   rd.end.character)
    );
    const d = new vscode.Diagnostic(range, rd.message, toVscodeSeverity(rd.severity));
    d.code = rd.code;
    d.source = 'Essbase Linter';
    diags.push(d);
  };

  for (const rule of ALL_RULES) {
    const rc = ruleConfig[rule.id] ?? { enabled: true, severity: 'error' };
    if (rc.enabled === false) continue;
    const res = rule.apply(tokens, rc);
    res.forEach(push);
  }

  collection.set(doc.uri, diags);
}

/* ------------------------------ Quick fixes ------------------------------ */

export class EssbaseQuickFixProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(document: vscode.TextDocument, _range: vscode.Range, context: vscode.CodeActionContext): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    for (const diag of context.diagnostics) {
      switch (diag.code) {
        case 'essbase.fix.missingEndfix': {
          const action = new vscode.CodeAction('Insert ENDFIX', vscode.CodeActionKind.QuickFix);
          const line = diag.range.start.line;
          const indent = leadingWS(document.lineAt(line).text);
          const pos = new vscode.Position(Math.min(line + 1, document.lineCount), 0);
          const edit = new vscode.WorkspaceEdit();
          edit.insert(document.uri, pos, `${indent}ENDFIX\n`);
          action.edit = edit;
          action.diagnostics = [diag];
          action.isPreferred = true;
          actions.push(action);
          break;
        }
        case 'essbase.if.missingEndif': {
          const action = new vscode.CodeAction('Insert ENDIF', vscode.CodeActionKind.QuickFix);
          const line = diag.range.start.line;
          const indent = leadingWS(document.lineAt(line).text);
          const pos = new vscode.Position(Math.min(line + 1, document.lineCount), 0);
          const edit = new vscode.WorkspaceEdit();
          edit.insert(document.uri, pos, `${indent}ENDIF\n`);
          action.edit = edit;
          action.diagnostics = [diag];
          action.isPreferred = true;
          actions.push(action);
          break;
        }
        default:
          break;
      }
    }

    return actions;
  }
}

function leadingWS(text: string): string {
  const m = /^(\s*)/.exec(text);
  return m ? m[1] : '';
}