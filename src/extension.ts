
/**
 * extension.ts
 *
 * Entry point: sets up the diagnostic collection, event hooks, and quick fixes.
 */

import * as vscode from 'vscode';
import { createCollection, lintDocument, MissingEndfixQuickFixProvider } from './linter';

export function activate(context: vscode.ExtensionContext) {
  const collection = createCollection();
  context.subscriptions.push(collection);

  const maybeLintActive = () => {
    const ed = vscode.window.activeTextEditor;
    if (ed) lintDocument(ed.document, collection);
  };

  // Lint on open/change/active editor switch
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(doc => lintDocument(doc, collection)),
    vscode.workspace.onDidChangeTextDocument(e => lintDocument(e.document, collection)),
    vscode.window.onDidChangeActiveTextEditor(() => maybeLintActive())
  );

  // Initial lint
  maybeLintActive();

  // Register quick fix provider
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { language: 'essbase', scheme: 'file' },
      new MissingEndfixQuickFixProvider(),
      { providedCodeActionKinds: MissingEndfixQuickFixProvider.providedCodeActionKinds }
    )
  );

  // Optional command to insert ENDFIX for the last unmatched FIX in the file
  context.subscriptions.push(
    vscode.commands.registerCommand('essbaseLinter.fixMissingEndfix', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const doc = editor.document;
      const diags = vscode.languages.getDiagnostics(doc.uri)
        .filter(d => d.code === 'essbase.fix.missingEndfix');

      if (diags.length === 0) {
        vscode.window.showInformationMessage('No missing ENDFIX found.');
        return;
      }

      const last = diags[diags.length - 1];
      const insertPos = new vscode.Position(last.range.end.line + 1, 0);
      const indent = getLeadingWhitespace(doc.lineAt(last.range.start.line).text);

      const edit = new vscode.WorkspaceEdit();
      edit.insert(doc.uri, insertPos, `${indent}ENDFIX\n`);
      await vscode.workspace.applyEdit(edit);
    })
  );
}

export function deactivate() {}

function getLeadingWhitespace(lineText: string): string {
  const m = /^(\s*)/.exec(lineText);
  return m ? m[1] : '';
}
