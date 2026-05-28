import * as vscode from 'vscode';
import { AtifEditorProvider } from './atifPreviewPanel';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    AtifEditorProvider.register(context)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('atif-visualizer.preview', async () => {
      await vscode.commands.executeCommand(
        'reopenActiveEditorWith',
        AtifEditorProvider.viewType
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('atif-visualizer.showSource', async () => {
      await vscode.commands.executeCommand('reopenActiveEditorWith', 'default');
    })
  );
}

export function deactivate() {}
