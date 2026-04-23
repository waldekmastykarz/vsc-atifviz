import * as vscode from 'vscode';
import { AtifPreviewPanel } from './atifPreviewPanel';

export function activate(context: vscode.ExtensionContext) {
  const command = vscode.commands.registerCommand('atif-visualizer.preview', () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor found.');
      return;
    }

    AtifPreviewPanel.createOrShow(context.extensionUri, editor.document);
  });

  context.subscriptions.push(command);

  // Update preview when the source document changes
  const changeDisposable = vscode.workspace.onDidChangeTextDocument((e) => {
    AtifPreviewPanel.updateIfActive(e.document);
  });

  context.subscriptions.push(changeDisposable);
}

export function deactivate() {}
