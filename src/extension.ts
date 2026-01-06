/**
 * extension.ts
 * Entry point: sets up the diagnostic collection, event hooks, and quick fixes.
 */

import * as vscode from 'vscode';
import { createCollection, lintDocument, EssbaseQuickFixProvider } from './linter';

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

  // Register quick fix provider (for all Essbase docs, any scheme)
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { language: 'essbase' },
      new EssbaseQuickFixProvider(),
      { providedCodeActionKinds: EssbaseQuickFixProvider.providedCodeActionKinds }
    )
  );
}

export function deactivate() {}