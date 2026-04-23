import * as vscode from 'vscode';

export class AtifPreviewPanel {
  private static panels: Map<string, AtifPreviewPanel> = new Map();
  private static readonly viewType = 'atifPreview';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private sourceUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, document: vscode.TextDocument): void {
    const column = vscode.ViewColumn.Beside;
    const key = document.uri.toString();

    const existing = AtifPreviewPanel.panels.get(key);
    if (existing) {
      existing.update(document.getText());
      existing.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      AtifPreviewPanel.viewType,
      `ATIF: ${getFileName(document.uri)}`,
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'node_modules', '@vscode', 'codicons', 'dist'),
        ],
      }
    );

    AtifPreviewPanel.panels.set(key, new AtifPreviewPanel(panel, extensionUri, document));
  }

  public static updateIfActive(document: vscode.TextDocument): void {
    const existing = AtifPreviewPanel.panels.get(document.uri.toString());
    if (existing) {
      existing.update(document.getText());
    }
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, document: vscode.TextDocument) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.sourceUri = document.uri;

    this.update(document.getText());

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      (message) => {
        if (message.type === 'openFile') {
          this.openReferencedFile(message.path);
        }
      },
      null,
      this.disposables
    );
  }

  private async openReferencedFile(refPath: string): Promise<void> {
    const sourceDir = vscode.Uri.joinPath(this.sourceUri, '..');
    const uri = refPath.startsWith('/')
      ? vscode.Uri.file(refPath)
      : vscode.Uri.joinPath(sourceDir, refPath);

    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
      // Trigger preview on the opened file
      AtifPreviewPanel.createOrShow(vscode.Uri.file(''), doc);
    } catch {
      vscode.window.showErrorMessage(`Could not open referenced trajectory: ${refPath}`);
    }
  }

  private dispose(): void {
    AtifPreviewPanel.panels.delete(this.sourceUri.toString());
    this.panel.dispose();
    while (this.disposables.length) {
      const d = this.disposables.pop();
      if (d) {
        d.dispose();
      }
    }
  }

  private update(text: string): void {
    this.panel.title = `ATIF: ${getFileName(this.sourceUri)}`;
    this.panel.webview.html = this.getHtml(text);
  }

  private getHtml(jsonText: string): string {
    const nonce = getNonce();
    const webview = this.panel.webview;

    // Codicon CSS URI
    const codiconCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css')
    );

    // Safely embed JSON in a script tag by escaping only what's dangerous in that context
    const safeJson = jsonText.replace(/</g, '\\u003c');

    // Test if it's valid JSON - if so, embed as literal; otherwise embed as string
    let jsonEmbed: string;
    try {
      JSON.parse(jsonText);
      jsonEmbed = `var rawJson = ${safeJson};`;
    } catch {
      // Embed as a string so the webview script can show a parse error
      const asString = JSON.stringify(jsonText).replace(/</g, '\\u003c');
      jsonEmbed = `var rawJson = ${asString};`;
    }

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'nonce-${nonce}' ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ATIF Trajectory</title>
  <link rel="stylesheet" href="${codiconCssUri}" nonce="${nonce}">
  <style nonce="${nonce}">
    ${getStyles()}
  </style>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}">
    ${jsonEmbed}
    var vscode = acquireVsCodeApi();
    ${getScript()}
  </script>
</body>
</html>`;
  }
}

function getFileName(uri: vscode.Uri): string {
  const parts = uri.path.split('/');
  return parts[parts.length - 1];
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

function getStyles(): string {
  return `
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --border: var(--vscode-panel-border, #444);
      --accent: var(--vscode-textLink-foreground, #3794ff);
      --badge-system: #6c71c4;
      --badge-user: #268bd2;
      --badge-agent: #2aa198;
      --hover-bg: var(--vscode-list-hoverBackground, rgba(255,255,255,0.05));
      --card-bg: var(--vscode-editorWidget-background, #252526);
      --subtle: var(--vscode-descriptionForeground, #999);
      --error-fg: var(--vscode-errorForeground, #f44747);
      --success-bg: var(--vscode-testing-iconPassed, #73c991);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--fg);
      background: var(--bg);
      padding: 16px;
      line-height: 1.5;
    }

    .error-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 200px;
      text-align: center;
      padding: 40px;
    }

    .error-icon {
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }

    .error-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .error-message {
      color: var(--subtle);
      max-width: 500px;
    }

    /* Header */
    .header {
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }

    .header h1 {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .header-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      color: var(--subtle);
      font-size: 12px;
    }

    .header-meta span {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    /* Metrics bar */
    .metrics-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 20px;
    }

    .metric-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px 14px;
      min-width: 120px;
    }

    .metric-card.clickable {
      cursor: pointer;
      user-select: none;
      border-style: dashed;
    }

    .metric-card.clickable:hover {
      background: var(--hover-bg);
      border-style: solid;
    }

    .metric-card.clickable.active {
      border-color: var(--accent);
      border-style: solid;
      box-shadow: 0 0 0 1px var(--accent);
    }

    .metric-card.clickable .metric-label .codicon {
      font-size: 10px;
      margin-left: 4px;
      vertical-align: middle;
    }

    .metric-label {
      font-size: 11px;
      color: var(--subtle);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .metric-value {
      font-size: 20px;
      font-weight: 600;
      margin-top: 2px;
    }

    /* Tools list */
    .tools-list {
      display: none;
      margin-bottom: 12px;
    }

    .tools-list.visible {
      display: block;
    }

    .tools-list hr {
      border: none;
      border-top: 1px solid var(--border);
      margin: 0;
    }

    .tools-filter-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 16px 0;
    }

    .tools-filter-bar label {
      font-size: 11px;
      color: var(--subtle);
      white-space: nowrap;
    }

    .tools-filter-bar input {
      flex: 1;
      padding: 4px 8px;
      font-size: 12px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--card-bg);
      color: var(--fg);
      outline: none;
      font-family: inherit;
    }

    .tools-filter-bar input:focus {
      border-color: var(--accent);
    }

    .tool-item {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 12px;
      overflow: hidden;
    }

    .tool-item-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      cursor: pointer;
      user-select: none;
    }

    .tool-item-header:hover {
      background: var(--hover-bg);
    }

    .tool-item-name {
      font-weight: 600;
      font-size: 13px;
    }

    .tool-item-chevron {
      font-size: 12px;
      transition: transform 0.15s;
      margin-left: auto;
    }

    .tool-item.expanded .tool-item-chevron {
      transform: rotate(90deg);
    }

    .tool-item-body {
      display: none;
      padding: 0 14px 12px;
    }

    .tool-item.expanded .tool-item-body {
      display: block;
    }

    .tool-item-desc {
      font-size: 12px;
      color: var(--subtle);
      white-space: pre-wrap;
      margin-bottom: 8px;
    }

    .tool-item-params {
      font-size: 11px;
      font-family: var(--vscode-editor-font-family), monospace;
    }

    .tool-param {
      padding: 2px 0;
    }

    .tool-param-name {
      font-weight: 600;
      color: var(--accent);
    }

    .tool-param-type {
      color: var(--subtle);
      margin-left: 4px;
    }

    .tool-param-desc {
      color: var(--subtle);
      margin-left: 8px;
      font-family: inherit;
      font-size: 12px;
    }

    .tool-param-required {
      color: var(--badge-system);
      font-size: 10px;
      margin-left: 4px;
    }

    /* Steps */
    .step {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 12px;
      overflow: hidden;
      transition: opacity 0.15s;
    }

    .step.dimmed {
      opacity: 0.3;
    }

    .step.dimmed:hover {
      opacity: 0.6;
    }

    /* Filter bar */
    .filter-bar {
      margin: 8px 0 24px;
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
    }

    .filter-tools {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    .filter-skills {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    .filter-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    .filter-row-label {
      font-size: 11px;
      color: var(--subtle);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      min-width: 48px;
    }

    .filter-tool-btn {
      font-size: 11px;
      padding: 4px 12px;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: var(--card-bg);
      color: var(--fg);
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
    }

    .filter-tool-btn:hover {
      background: var(--hover-bg);
    }

    .filter-tool-btn.active {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
    }

    .filter-skill-btn {
      font-size: 11px;
      padding: 4px 12px;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: var(--card-bg);
      color: var(--fg);
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
    }

    .filter-skill-btn:hover {
      background: var(--hover-bg);
    }

    .filter-skill-btn.active {
      background: var(--badge-agent);
      color: #fff;
      border-color: var(--badge-agent);
    }

    .filter-text {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .filter-text input {
      flex: 1;
      padding: 4px 8px;
      font-size: 12px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--card-bg);
      color: var(--fg);
      outline: none;
      font-family: inherit;
    }

    .filter-text input:focus {
      border-color: var(--accent);
    }

    .filter-text label {
      font-size: 11px;
      color: var(--subtle);
      white-space: nowrap;
    }

    .step.active-step {
      border-color: var(--accent);
      box-shadow: 0 0 0 1px var(--accent);
    }

    .step-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      cursor: pointer;
      user-select: none;
    }

    .step-header:hover {
      background: var(--hover-bg);
    }

    .step-number {
      font-weight: 700;
      font-size: 14px;
      min-width: 28px;
    }

    .source-badge {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 2px 8px;
      border-radius: 10px;
      color: #fff;
    }

    .source-badge.system { background: var(--badge-system); }
    .source-badge.user { background: var(--badge-user); }
    .source-badge.agent { background: var(--badge-agent); }

    .step-preview {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--subtle);
      font-size: 12px;
    }

    .step-indicators {
      display: flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }

    .step-indicator {
      font-size: 11px;
      color: var(--subtle);
      display: flex;
      align-items: center;
      gap: 2px;
    }

    .step-indicator-icon {
      font-size: 13px;
    }

    .step-indicator-count {
      font-size: 10px;
    }

    .step-timestamp {
      font-size: 11px;
      color: var(--subtle);
      white-space: nowrap;
    }

    .step-chevron {
      font-size: 12px;
      transition: transform 0.15s;
    }

    .step.expanded > .step-header > .step-chevron {
      transform: rotate(90deg);
    }

    .step-body {
      display: none;
      padding: 0 14px 14px;
    }

    .step.expanded .step-body {
      display: block;
    }

    /* Sections within a step */
    .section {
      margin-top: 12px;
    }

    .section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--accent);
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .message-content {
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.6;
    }

    .reasoning-content {
      white-space: pre-wrap;
      word-break: break-word;
      padding: 10px;
      border-left: 3px solid var(--badge-agent);
      background: rgba(42, 161, 152, 0.05);
      border-radius: 0 4px 4px 0;
      font-style: italic;
    }

    /* Tool calls */
    .tool-call {
      border: 1px solid var(--border);
      border-radius: 6px;
      margin-bottom: 8px;
      overflow: hidden;
    }

    .tool-call-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      cursor: pointer;
      user-select: none;
      font-size: 13px;
    }

    .tool-call-header:hover {
      background: var(--hover-bg);
    }

    .tool-fn-name {
      font-weight: 600;
      font-family: var(--vscode-editor-font-family, monospace);
    }

    .tool-call-id {
      font-size: 11px;
      color: var(--subtle);
      font-family: var(--vscode-editor-font-family, monospace);
    }

    .tool-call-body {
      display: none;
      padding: 0 12px 10px;
    }

    .tool-call.expanded .tool-call-body {
      display: block;
    }

    .tool-call .step-chevron {
      font-size: 11px;
      margin-left: auto;
    }

    .tool-call.expanded .step-chevron {
      transform: rotate(90deg);
    }

    /* JSON/code blocks */
    .code-block {
      background: var(--vscode-textCodeBlock-background, rgba(0,0,0,0.2));
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 10px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-all;
      overflow-x: auto;
      max-height: 400px;
      overflow-y: auto;
    }

    /* Observation results */
    .obs-result {
      border: 1px solid var(--border);
      border-radius: 6px;
      margin-bottom: 8px;
      overflow: hidden;
    }

    .obs-result-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      cursor: pointer;
      user-select: none;
      font-size: 13px;
    }

    .obs-result-header:hover {
      background: var(--hover-bg);
    }

    .obs-result-body {
      display: none;
      padding: 0 12px 10px;
    }

    .obs-result.expanded .obs-result-body {
      display: block;
    }

    .obs-result.expanded .step-chevron {
      transform: rotate(90deg);
    }

    .obs-source-id {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
      color: var(--subtle);
    }

    /* Step metrics */
    .step-metrics {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 4px;
    }

    .step-metric {
      font-size: 12px;
    }

    .step-metric-label {
      color: var(--subtle);
    }

    .step-metric-value {
      font-weight: 600;
    }

    /* Model name badge */
    .model-badge {
      font-size: 11px;
      padding: 1px 6px;
      border-radius: 3px;
      border: 1px solid var(--border);
      color: var(--subtle);
      font-family: var(--vscode-editor-font-family, monospace);
    }

    .sub-label {
      font-size: 11px;
      color: var(--subtle);
      margin-bottom: 4px;
      font-weight: 600;
    }

    /* Trajectory tabs */
    .trajectory-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 2px;
      margin-bottom: 20px;
      border-bottom: 2px solid var(--border);
      padding-bottom: 0;
    }

    .trajectory-tab {
      background: transparent;
      border: 1px solid transparent;
      border-bottom: none;
      color: var(--subtle);
      padding: 8px 16px;
      cursor: pointer;
      font-size: 13px;
      font-family: inherit;
      border-radius: 6px 6px 0 0;
      position: relative;
      bottom: -2px;
      transition: background 0.1s, color 0.1s;
    }

    .trajectory-tab:hover {
      background: var(--hover-bg);
      color: var(--fg);
    }

    .trajectory-tab.active {
      background: var(--card-bg);
      color: var(--fg);
      border-color: var(--border);
      border-bottom: 2px solid var(--card-bg);
      font-weight: 600;
    }

    .trajectory-tab .tab-agent {
      font-weight: 600;
    }

    .trajectory-tab .tab-session {
      font-size: 10px;
      color: var(--subtle);
      margin-left: 6px;
      font-family: var(--vscode-editor-font-family, monospace);
    }

    .trajectory-tab .tab-badge {
      display: inline-block;
      font-size: 9px;
      padding: 1px 5px;
      border-radius: 8px;
      margin-left: 6px;
      vertical-align: middle;
    }

    .trajectory-tab .tab-badge.parent {
      background: var(--accent);
      color: #fff;
    }

    .trajectory-tab .tab-badge.sub {
      background: var(--badge-agent);
      color: #fff;
    }

    .trajectory-pane {
      display: none;
    }

    .trajectory-pane.active {
      display: block;
    }

    /* Subagent ref link */
    .subagent-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 6px 12px;
      margin: 4px 0;
      cursor: pointer;
      font-size: 12px;
      color: var(--accent);
      font-family: inherit;
      transition: background 0.1s;
    }

    .subagent-link:hover {
      background: var(--hover-bg);
    }

    .subagent-link .link-icon {
      font-size: 14px;
    }

    .subagent-link .link-label {
      font-weight: 600;
    }

    .subagent-link .link-detail {
      color: var(--subtle);
      font-size: 11px;
    }

    .subagent-file-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--accent);
      cursor: pointer;
      font-size: 12px;
      text-decoration: underline;
      margin-top: 4px;
    }

    .subagent-file-link:hover {
      opacity: 0.8;
    }
  `;
}

function getScript(): string {
  return `
    (function() {
      const app = document.getElementById('app');
      var currentSteps = {};
      var activePane = 'single';
      var paneTrajectories = {};

      let data;
      try {
        data = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
      } catch (e) {
        app.innerHTML = renderError('Invalid JSON', 'This file does not contain valid JSON. Please check the file for syntax errors.');
        return;
      }

      // Normalize: support single trajectory or array of trajectories
      let trajectories = [];
      if (Array.isArray(data)) {
        trajectories = data.filter(isAtif);
        if (trajectories.length === 0) {
          app.innerHTML = renderError(
            'Not an ATIF Trajectory',
            'This JSON array does not contain any valid ATIF trajectories. Each trajectory requires: schema_version, session_id, agent, and steps fields.'
          );
          return;
        }
      } else if (isAtif(data)) {
        trajectories = [data];
      } else {
        app.innerHTML = renderError(
          'Not an ATIF Trajectory',
          'This JSON file does not appear to be a valid ATIF trajectory. An ATIF file requires at minimum: schema_version, session_id, agent, and steps fields.'
        );
        return;
      }

      // Build session_id → index map for cross-referencing
      const sessionMap = {};
      trajectories.forEach(function(t, i) {
        sessionMap[t.session_id] = i;
      });

      if (trajectories.length === 1) {
        renderSingleTrajectory(trajectories[0]);
      } else {
        renderMultiTrajectory(trajectories);
      }

      function isAtif(obj) {
        return (
          obj &&
          typeof obj === 'object' &&
          typeof obj.schema_version === 'string' &&
          typeof obj.session_id === 'string' &&
          obj.agent &&
          typeof obj.agent === 'object' &&
          Array.isArray(obj.steps)
        );
      }

      function renderError(title, message) {
        return '<div class="error-container">' +
          '<div class="error-icon">📄</div>' +
          '<div class="error-title">' + esc(title) + '</div>' +
          '<div class="error-message">' + esc(message) + '</div>' +
        '</div>';
      }

      // ── Single trajectory ──
      function renderSingleTrajectory(t) {
        app.innerHTML = buildTrajectoryHtml(t, 'single');
        bindAllEvents('single');
      }

      // ── Multiple trajectories (tabs) ──
      function renderMultiTrajectory(list) {
        let html = '';

        // Tabs
        html += '<div class="trajectory-tabs" id="trajectory-tabs">';
        list.forEach(function(t, i) {
          const paneId = 'traj-' + i;
          const isParent = isParentTrajectory(t, list);
          html += '<button class="trajectory-tab' + (i === 0 ? ' active' : '') + '" data-pane="' + paneId + '">';
          html += '<span class="tab-agent">' + esc(t.agent.name || 'Agent ' + (i + 1)) + '</span>';
          html += '<span class="tab-session">' + esc(truncate(t.session_id, 12)) + '</span>';
          if (isParent) {
            html += '<span class="tab-badge parent">parent</span>';
          } else {
            html += '<span class="tab-badge sub">sub</span>';
          }
          html += '</button>';
        });
        html += '</div>';

        // Panes
        list.forEach(function(t, i) {
          const paneId = 'traj-' + i;
          html += '<div class="trajectory-pane' + (i === 0 ? ' active' : '') + '" id="pane-' + paneId + '">';
          html += buildTrajectoryHtml(t, paneId);
          html += '</div>';
        });

        app.innerHTML = html;

        // Bind tab switching
        document.querySelectorAll('.trajectory-tab').forEach(function(tab) {
          tab.addEventListener('click', function() {
            const paneId = this.getAttribute('data-pane');
            switchPane(paneId);
          });
        });

        // Bind events for each pane
        list.forEach(function(t, i) {
          bindAllEvents('traj-' + i);
        });

        // Navigate to first step of first pane
        activePane = 'traj-0';
      }

      function isParentTrajectory(t, list) {
        // A trajectory is a parent if other trajectories are referenced from it
        // or if no other trajectory references it
        let isReferenced = false;
        list.forEach(function(other) {
          if (other === t) return;
          (other.steps || []).forEach(function(step) {
            if (step.observation && step.observation.results) {
              step.observation.results.forEach(function(r) {
                if (r.subagent_trajectory_ref) {
                  r.subagent_trajectory_ref.forEach(function(ref) {
                    if (ref.session_id === t.session_id) {
                      isReferenced = true;
                    }
                  });
                }
              });
            }
          });
        });
        return !isReferenced;
      }

      function switchPane(paneId) {
        document.querySelectorAll('.trajectory-pane').forEach(function(p) {
          p.classList.remove('active');
        });
        document.querySelectorAll('.trajectory-tab').forEach(function(t) {
          t.classList.remove('active');
        });
        const pane = document.getElementById('pane-' + paneId);
        if (pane) pane.classList.add('active');
        const tab = document.querySelector('.trajectory-tab[data-pane="' + paneId + '"]');
        if (tab) tab.classList.add('active');
        activePane = paneId;
      }

      // ── Build trajectory HTML (used by both single and multi) ──
      function buildTrajectoryHtml(t, paneId) {
        let html = '';

        // Header
        html += '<div class="header">';
        html += '<h1>' + esc(t.agent.name || 'Unknown Agent') + ' Trajectory</h1>';
        html += '<div class="header-meta">';
        html += '<span>Version: ' + esc(t.agent.version || '?') + '</span>';
        if (t.agent.model_name) {
          html += '<span>Model: ' + esc(t.agent.model_name) + '</span>';
        }
        var startTs = getFirstTimestamp(t.steps);
        if (startTs) {
          html += '<span>Started: ' + esc(new Date(startTs).toLocaleString()) + '</span>';
          var endTs = getLastTimestamp(t.steps);
          if (endTs) {
            var elapsed = formatElapsed(new Date(endTs).getTime() - new Date(startTs).getTime());
            if (elapsed) {
              html += '<span>Duration: ' + esc(elapsed) + '</span>';
            }
          }
        }
        if (t.continued_trajectory_ref) {
          html += '<span>Continues → <code>' + esc(truncate(t.continued_trajectory_ref, 30)) + '</code></span>';
        }
        html += '</div></div>';

        // Final metrics + tools card
        var toolDefs = (t.agent && t.agent.tool_definitions) || [];
        html += renderFinalMetrics(t.final_metrics, toolDefs.length, paneId);

        // Tools list (hidden by default, toggled by clicking the Tools metric card)
        if (toolDefs.length > 0) {
          html += '<div class="tools-list" id="tools-list-' + paneId + '">';
          html += '<hr>';
          html += '<div class="tools-filter-bar">';
          html += '<label>Search:</label>';
          html += '<input type="text" class="tools-filter-input" data-pane="' + paneId + '" placeholder="Filter tools by name...">';
          html += '</div>';
          toolDefs.forEach(function(td) {
            var fn = td.function || td;
            html += renderToolItem(fn);
          });
          html += '<hr>';
          html += '</div>';
        }
        // Check if all steps that have a model use the same one
        var allSameModel = true;
        var seenModel = null;
        t.steps.forEach(function(s) {
          if (s.model_name) {
            if (seenModel === null) seenModel = s.model_name;
            else if (s.model_name !== seenModel) allSameModel = false;
          }
        });

        // Filter bar
        var usedTools = {};
        var usedSkills = {};
        t.steps.forEach(function(s) {
          if (s.tool_calls) {
            s.tool_calls.forEach(function(tc) {
              var name = tc.function_name || (tc.function && tc.function.name) || tc.name || '';
              if (name) usedTools[name] = true;
            });
          }
          getStepSkills(s).forEach(function(sk) { usedSkills[sk] = true; });
        });
        var usedToolNames = Object.keys(usedTools).sort();
        var usedSkillNames = Object.keys(usedSkills).sort();
        html += '<div class="filter-bar" data-pane="' + paneId + '">';
        if (usedToolNames.length > 0) {
          html += '<div class="filter-row">';
          html += '<label class="filter-row-label">Tools:</label>';
          html += '<div class="filter-tools" data-pane="' + paneId + '" data-filter-kind="tool">';
          html += '<button class="filter-tool-btn active" data-tool="__all__" data-pane="' + paneId + '">All</button>';
          usedToolNames.forEach(function(name) {
            html += '<button class="filter-tool-btn" data-tool="' + esc(name) + '" data-pane="' + paneId + '">' + esc(name) + '</button>';
          });
          html += '</div></div>';
        }
        if (usedSkillNames.length > 0) {
          html += '<div class="filter-row">';
          html += '<label class="filter-row-label">Skills:</label>';
          html += '<div class="filter-skills" data-pane="' + paneId + '" data-filter-kind="skill">';
          html += '<button class="filter-skill-btn active" data-skill="__all__" data-pane="' + paneId + '">All</button>';
          usedSkillNames.forEach(function(name) {
            html += '<button class="filter-skill-btn" data-skill="' + esc(name) + '" data-pane="' + paneId + '">' + esc(name) + '</button>';
          });
          html += '</div></div>';
        }
        html += '<div class="filter-text">';
        html += '<label>Search:</label>';
        html += '<input type="text" class="filter-text-input" data-pane="' + paneId + '" placeholder="Filter steps by text...">';
        html += '</div>';
        html += '</div>';

        // Steps
        html += '<div class="steps-container" data-pane="' + paneId + '">';
        t.steps.forEach(function(step, i) {
          html += renderStep(step, i, t.steps, paneId, allSameModel);
        });
        html += '</div>';

        return html;
      }

      function renderFinalMetrics(m, toolCount, paneId) {
        let html = '<div class="metrics-bar">';
        if (toolCount > 0) {
          html += '<div class="metric-card clickable tools-metric" data-pane="' + paneId + '">';
          html += '<div class="metric-label">Tools <span class="codicon codicon-chevron-down"></span></div>';
          html += '<div class="metric-value">' + toolCount + '</div>';
          html += '</div>';
        }
        if (m && m.total_steps != null) {
          html += metricCard('Steps', m.total_steps);
        }
        if (m && m.total_prompt_tokens != null) {
          html += metricCard('Prompt Tokens', formatNum(m.total_prompt_tokens));
        }
        if (m && m.total_completion_tokens != null) {
          html += metricCard('Completion Tokens', formatNum(m.total_completion_tokens));
        }
        if (m && m.total_cached_tokens != null) {
          html += metricCard('Cached Tokens', formatNum(m.total_cached_tokens));
        }
        if (m && m.total_cost_usd != null) {
          html += metricCard('Total Cost', '$' + m.total_cost_usd.toFixed(5));
        }
        html += '</div>';
        return html;
      }

      function metricCard(label, value) {
        return '<div class="metric-card">' +
          '<div class="metric-label">' + esc(label) + '</div>' +
          '<div class="metric-value">' + esc(String(value)) + '</div>' +
        '</div>';
      }

      function bindAllEvents(paneId) {
        currentSteps[paneId] = 0;

        // Prev/Next
        const container = document.querySelector('.steps-container[data-pane="' + paneId + '"]');
        if (!container) return;
        const totalSteps = container.querySelectorAll('.step').length;

        // Nav button listeners use data-pane attributes, handled by delegation

        // Text filter input
        var textInput = document.querySelector('.filter-text-input[data-pane="' + paneId + '"]');
        if (textInput) {
          textInput.addEventListener('input', function() {
            applyFilters(paneId);
          });
        }

        // Tools list filter input
        var toolsFilterInput = document.querySelector('.tools-filter-input[data-pane="' + paneId + '"]');
        if (toolsFilterInput) {
          toolsFilterInput.addEventListener('input', function() {
            var query = toolsFilterInput.value.toLowerCase().trim();
            var list = document.getElementById('tools-list-' + paneId);
            if (!list) return;
            list.querySelectorAll('.tool-item').forEach(function(item) {
              var name = (item.querySelector('.tool-item-name') || {}).textContent || '';
              item.style.display = name.toLowerCase().indexOf(query) !== -1 ? '' : 'none';
            });
          });
        }
      }

      // ── Filtering ──
      function getStepSearchText(step) {
        var parts = [];
        if (step.message) parts.push(typeof step.message === 'string' ? step.message : JSON.stringify(step.message));
        if (step.reasoning_content) parts.push(step.reasoning_content);
        if (step.source) parts.push(step.source);
        if (step.tool_calls) {
          step.tool_calls.forEach(function(tc) {
            var name = tc.function_name || (tc.function && tc.function.name) || tc.name || '';
            if (name) parts.push(name);
            var args = tc.arguments || (tc.function && tc.function.arguments);
            if (args) parts.push(typeof args === 'string' ? args : JSON.stringify(args));
          });
        }
        if (step.observation && step.observation.results) {
          step.observation.results.forEach(function(r) {
            if (r.content) parts.push(typeof r.content === 'string' ? r.content : JSON.stringify(r.content));
          });
        }
        return parts.join(' ').toLowerCase();
      }

      // Detect skill usage from tool call arguments. A skill is identified by a
      // path under a known VS Code Agent Skills location:
      //   .github/skills/, .claude/skills/, .agents/skills/, .copilot/skills/
      // (project skills live in the workspace; personal skills live under ~/).
      // The segment immediately after "skills/" is the skill name. Any file
      // under that directory (including subfolders) counts as skill usage.
      function collectSkillsFromValue(val, out) {
        if (val == null) return;
        if (typeof val === 'string') {
          var re = /(?:^|\\/)\\.(?:github|claude|agents|copilot)\\/skills\\/([^\\/\\s"']+)/g;
          var m;
          while ((m = re.exec(val)) !== null) {
            out[m[1]] = true;
          }
        } else if (typeof val === 'object') {
          for (var k in val) {
            if (Object.prototype.hasOwnProperty.call(val, k)) {
              collectSkillsFromValue(val[k], out);
            }
          }
        }
      }
      function getStepSkills(step) {
        var found = {};
        if (step.tool_calls) {
          step.tool_calls.forEach(function(tc) {
            var args = tc.arguments || (tc.function && tc.function.arguments);
            if (typeof args === 'string') {
              try { args = JSON.parse(args); } catch (e) { /* leave as string */ }
            }
            collectSkillsFromValue(args, found);
          });
        }
        return Object.keys(found);
      }

      function applyFilters(paneId) {
        var container = document.querySelector('.steps-container[data-pane="' + paneId + '"]');
        if (!container) return;

        // Get active tool filters
        var toolBar = document.querySelector('.filter-tools[data-pane="' + paneId + '"]');
        var allActive = true;
        var selectedTools = [];
        if (toolBar) {
          var allBtn = toolBar.querySelector('[data-tool="__all__"]');
          allActive = allBtn && allBtn.classList.contains('active');
          if (!allActive) {
            toolBar.querySelectorAll('.filter-tool-btn.active').forEach(function(b) {
              selectedTools.push(b.getAttribute('data-tool'));
            });
          }
        }

        // Get active skill filters
        var skillBar = document.querySelector('.filter-skills[data-pane="' + paneId + '"]');
        var skillAllActive = true;
        var selectedSkills = [];
        if (skillBar) {
          var skillAllBtn = skillBar.querySelector('[data-skill="__all__"]');
          skillAllActive = skillAllBtn && skillAllBtn.classList.contains('active');
          if (!skillAllActive) {
            skillBar.querySelectorAll('.filter-skill-btn.active').forEach(function(b) {
              selectedSkills.push(b.getAttribute('data-skill'));
            });
          }
        }

        // Get text filter
        var textInput = document.querySelector('.filter-text-input[data-pane="' + paneId + '"]');
        var searchText = (textInput ? textInput.value : '').toLowerCase().trim();

        // Get trajectory steps data
        var steps = paneTrajectories[paneId] || [];

        // Apply to DOM
        var stepEls = container.querySelectorAll('.step');
        stepEls.forEach(function(el) {
          var idx = parseInt(el.getAttribute('data-index'), 10);
          var step = steps[idx];
          var match = true;

          // Tool filter
          if (!allActive && selectedTools.length > 0 && step) {
            var stepTools = (el.getAttribute('data-tools') || '').split(',').filter(Boolean);
            var hasMatchingTool = selectedTools.some(function(t) {
              return stepTools.indexOf(t) !== -1;
            });
            if (!hasMatchingTool) match = false;
          }

          // Skill filter
          if (match && !skillAllActive && selectedSkills.length > 0) {
            var stepSkills = (el.getAttribute('data-skills') || '').split(',').filter(Boolean);
            var hasMatchingSkill = selectedSkills.some(function(s) {
              return stepSkills.indexOf(s) !== -1;
            });
            if (!hasMatchingSkill) match = false;
          }

          // Text filter
          if (match && searchText && step) {
            var text = getStepSearchText(step);
            if (text.indexOf(searchText) === -1) match = false;
          }

          if (match) {
            el.classList.remove('dimmed');
          } else {
            el.classList.add('dimmed');
          }
        });
      }

      // ── Global event delegation ──
      app.addEventListener('click', function(e) {
        const target = e.target;

        // Filter tool button click
        const filterBtn = target.closest('.filter-tool-btn');
        if (filterBtn) {
          var paneId = filterBtn.getAttribute('data-pane');
          var tool = filterBtn.getAttribute('data-tool');
          var toolBar = filterBtn.closest('.filter-tools');
          if (tool === '__all__') {
            // Deselect all tool buttons, activate All
            toolBar.querySelectorAll('.filter-tool-btn').forEach(function(b) {
              b.classList.remove('active');
            });
            filterBtn.classList.add('active');
          } else {
            // Toggle this tool, deactivate All
            filterBtn.classList.toggle('active');
            var allBtn = toolBar.querySelector('[data-tool="__all__"]');
            if (allBtn) allBtn.classList.remove('active');
            // If no tools selected, re-activate All
            var anyActive = toolBar.querySelectorAll('.filter-tool-btn.active');
            if (anyActive.length === 0 && allBtn) {
              allBtn.classList.add('active');
            }
          }
          applyFilters(paneId);
          return;
        }

        // Filter skill button click
        const filterSkillBtn = target.closest('.filter-skill-btn');
        if (filterSkillBtn) {
          var paneId2 = filterSkillBtn.getAttribute('data-pane');
          var skill = filterSkillBtn.getAttribute('data-skill');
          var skillBar = filterSkillBtn.closest('.filter-skills');
          if (skill === '__all__') {
            skillBar.querySelectorAll('.filter-skill-btn').forEach(function(b) {
              b.classList.remove('active');
            });
            filterSkillBtn.classList.add('active');
          } else {
            filterSkillBtn.classList.toggle('active');
            var skillAllBtn2 = skillBar.querySelector('[data-skill="__all__"]');
            if (skillAllBtn2) skillAllBtn2.classList.remove('active');
            var anyActive2 = skillBar.querySelectorAll('.filter-skill-btn.active');
            if (anyActive2.length === 0 && skillAllBtn2) {
              skillAllBtn2.classList.add('active');
            }
          }
          applyFilters(paneId2);
          return;
        }

        // Step header toggle
        const stepHeader = target.closest('.step-header');
        if (stepHeader) {
          const step = stepHeader.closest('.step');
          if (step) {
            step.classList.toggle('expanded');
          }
          return;
        }

        // Tools metric card toggle
        const toolsMetric = target.closest('.tools-metric');
        if (toolsMetric) {
          const paneId = toolsMetric.getAttribute('data-pane');
          const list = document.getElementById('tools-list-' + paneId);
          if (list) {
            list.classList.toggle('visible');
            toolsMetric.classList.toggle('active');
          }
          return;
        }

        // Tool item header toggle
        const toolItemHeader = target.closest('.tool-item-header');
        if (toolItemHeader) {
          const toolItem = toolItemHeader.closest('.tool-item');
          if (toolItem) {
            toolItem.classList.toggle('expanded');
          }
          return;
        }

        // Tool call header toggle
        const toolCallHeader = target.closest('.tool-call-header');
        if (toolCallHeader) {
          const toolCall = toolCallHeader.closest('.tool-call');
          if (toolCall) {
            toolCall.classList.toggle('expanded');
          }
          return;
        }

        // Observation result header toggle
        const obsHeader = target.closest('.obs-result-header');
        if (obsHeader) {
          const obsResult = obsHeader.closest('.obs-result');
          if (obsResult) {
            obsResult.classList.toggle('expanded');
          }
          return;
        }

        // Trajectory tab
        const trajTab = target.closest('.trajectory-tab');
        if (trajTab) {
          const paneId = trajTab.getAttribute('data-pane');
          if (paneId) {
            switchPane(paneId);
          }
          return;
        }

        // Subagent inline link (jump to tab)
        const subLink = target.closest('.subagent-link[data-target-pane]');
        if (subLink) {
          const targetPane = subLink.getAttribute('data-target-pane');
          if (targetPane) {
            switchPane(targetPane);
          }
          return;
        }

        // Subagent file link (open in editor)
        const fileLink = target.closest('.subagent-file-link');
        if (fileLink) {
          const filePath = fileLink.getAttribute('data-path');
          if (filePath) {
            vscode.postMessage({ type: 'openFile', path: filePath });
          }
          return;
        }
      });

      function navigateTo(index, paneId) {
        const container = document.querySelector('.steps-container[data-pane="' + paneId + '"]');
        if (!container) return;
        const steps = container.querySelectorAll('.step');
        if (steps[index]) {
          steps[index].classList.add('expanded');
          steps[index].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }

      // ── Tool item rendering ──
      function renderToolItem(fn) {
        let html = '<div class="tool-item">';
        html += '<div class="tool-item-header">';
        html += '<span class="tool-item-name">' + esc(fn.name || 'unknown') + '</span>';
        html += '<span class="tool-item-chevron">\u25B6</span>';
        html += '</div>';
        html += '<div class="tool-item-body">';
        if (fn.description) {
          html += '<div class="tool-item-desc">' + esc(fn.description) + '</div>';
        }
        if (fn.parameters && fn.parameters.properties) {
          var props = fn.parameters.properties;
          var required = fn.parameters.required || [];
          html += '<div class="tool-item-params">';
          Object.keys(props).forEach(function(pName) {
            var p = props[pName];
            html += '<div class="tool-param">';
            html += '<span class="tool-param-name">' + esc(pName) + '</span>';
            if (p.type) {
              html += '<span class="tool-param-type">' + esc(p.type) + '</span>';
            }
            if (required.indexOf(pName) !== -1) {
              html += '<span class="tool-param-required">required</span>';
            }
            if (p.description) {
              html += '<div class="tool-param-desc">' + esc(p.description) + '</div>';
            }
            html += '</div>';
          });
          html += '</div>';
        }
        html += '</div>';
        html += '</div>';
        return html;
      }

      // ── Step rendering ──

      function renderStep(step, index, steps, paneId, allSameModel) {
        // Store trajectory steps for this pane (set once per pane)
        if (!paneTrajectories[paneId]) {
          paneTrajectories[paneId] = steps;
        }

        // Collect tool names for data attribute
        var stepToolNames = [];
        if (step.tool_calls) {
          step.tool_calls.forEach(function(tc) {
            var name = tc.function_name || (tc.function && tc.function.name) || tc.name || '';
            if (name) stepToolNames.push(name);
          });
        }
        var stepSkillNames = getStepSkills(step);

        const source = step.source || 'unknown';
        let html = '<div class="step" data-index="' + index + '" data-tools="' + esc(stepToolNames.join(',')) + '" data-skills="' + esc(stepSkillNames.join(',')) + '">';

        // Header
        html += '<div class="step-header">';
        html += '<span class="step-number">#' + (step.step_id || index + 1) + '</span>';
        html += '<span class="source-badge ' + source + '">' + esc(source) + '</span>';
        if (step.model_name && !allSameModel) {
          html += '<span class="model-badge">' + esc(step.model_name) + '</span>';
        }
        html += '<span class="step-preview">' + esc(getPreview(step.message || step.reasoning_content)) + '</span>';
        // Content indicators
        html += '<span class="step-indicators">';
        if (step.message) {
          html += '<span class="step-indicator" title="Message"><span class="step-indicator-icon codicon codicon-comment"></span></span>';
        }
        if (step.reasoning_content) {
          html += '<span class="step-indicator" title="Reasoning"><span class="step-indicator-icon codicon codicon-lightbulb"></span></span>';
        }
        if (step.tool_calls && step.tool_calls.length > 0) {
          html += '<span class="step-indicator" title="Tool calls"><span class="step-indicator-icon codicon codicon-tools"></span><span class="step-indicator-count">' + step.tool_calls.length + '</span></span>';
        }
        if (stepSkillNames.length > 0) {
          var skillTitle = 'Skill' + (stepSkillNames.length > 1 ? 's' : '') + ': ' + stepSkillNames.join(', ');
          html += '<span class="step-indicator skill-indicator" title="' + esc(skillTitle) + '"><span class="step-indicator-icon codicon codicon-mortar-board"></span><span class="step-indicator-count">' + stepSkillNames.length + '</span></span>';
        }
        html += '</span>';
        var duration = getDuration(step, index, steps);
        if (duration !== null) {
          html += '<span class="step-timestamp">' + esc(duration) + '</span>';
        }
        html += '<span class="step-chevron">▶</span>';
        html += '</div>';

        // Body
        html += '<div class="step-body">';

        // Message
        if (step.message) {
          html += '<div class="section">';
          html += '<div class="section-title">Message</div>';
          html += '<div class="message-content">' + esc(renderMessage(step.message)) + '</div>';
          html += '</div>';
        }

        // Reasoning
        if (step.reasoning_content) {
          html += '<div class="section">';
          html += '<div class="section-title">Reasoning</div>';
          html += '<div class="reasoning-content">' + esc(step.reasoning_content) + '</div>';
          html += '</div>';
        }

        // Tool calls (with inline observation results)
        if (step.tool_calls && step.tool_calls.length > 0) {
          // Build a map from tool_call_id to observation result
          var obsMap = {};
          if (step.observation && step.observation.results) {
            step.observation.results.forEach(function(r) {
              if (r.source_call_id) {
                obsMap[r.source_call_id] = r;
              }
            });
          }
          html += '<div class="section">';
          html += '<div class="section-title">Tool Calls (' + step.tool_calls.length + ')</div>';
          step.tool_calls.forEach(function(tc) {
            html += renderToolCall(tc, obsMap[tc.tool_call_id]);
          });
          html += '</div>';
        }

        // Metrics
        if (step.metrics) {
          html += '<div class="section">';
          html += '<div class="section-title">Metrics</div>';
          html += renderStepMetrics(step.metrics);
          html += '</div>';
        }

        html += '</div>'; // step-body
        html += '</div>'; // step
        return html;
      }

      function renderToolCall(tc, obsResult) {
        let html = '<div class="tool-call">';
        html += '<div class="tool-call-header">';
        html += '<span class="tool-fn-name">' + esc(tc.function_name || 'unknown') + '</span>';
        if (tc.tool_call_id) {
          html += '<span class="tool-call-id">' + esc(tc.tool_call_id) + '</span>';
        }
        html += '<span class="step-chevron">▶</span>';
        html += '</div>';
        html += '<div class="tool-call-body">';
        html += '<div class="sub-label">Arguments</div>';
        html += '<div class="code-block">' + esc(formatJson(tc.arguments)) + '</div>';
        if (obsResult) {
          html += '<div class="sub-label" style="margin-top:8px">Result</div>';
          if (obsResult.content != null) {
            var contentStr = renderMessage(obsResult.content);
            html += '<div class="code-block">' + esc(contentStr) + '</div>';
          }
          if (obsResult.subagent_trajectory_ref && obsResult.subagent_trajectory_ref.length > 0) {
            html += '<div class="sub-label" style="margin-top:8px">Subagent Trajectories</div>';
            obsResult.subagent_trajectory_ref.forEach(function(ref) {
              html += renderSubagentRef(ref);
            });
          }
        }
        html += '</div>';
        html += '</div>';
        return html;
      }

      function renderObsResult(result) {
        let html = '<div class="obs-result">';
        html += '<div class="obs-result-header">';
        html += '<span class="step-chevron">▶</span>';
        html += '<span>Result</span>';
        if (result.source_call_id) {
          html += '<span class="obs-source-id">→ ' + esc(result.source_call_id) + '</span>';
        }
        html += '</div>';
        html += '<div class="obs-result-body">';

        if (result.content != null) {
          html += '<div class="sub-label">Content</div>';
          const contentStr = renderMessage(result.content);
          html += '<div class="code-block">' + esc(contentStr) + '</div>';
        }

        // Subagent trajectory references
        if (result.subagent_trajectory_ref && result.subagent_trajectory_ref.length > 0) {
          html += '<div class="sub-label" style="margin-top:8px">Subagent Trajectories</div>';
          result.subagent_trajectory_ref.forEach(function(ref) {
            html += renderSubagentRef(ref);
          });
        }

        html += '</div>';
        html += '</div>';
        return html;
      }

      function renderSubagentRef(ref) {
        let html = '';
        const sessionId = ref.session_id || '';
        const trajPath = ref.trajectory_path || '';

        // Check if this session_id exists in our loaded trajectories
        const inlineIndex = sessionMap[sessionId];

        if (inlineIndex != null) {
          // Inline reference → clickable tab jump
          const targetPane = 'traj-' + inlineIndex;
          const targetTraj = trajectories[inlineIndex];
          html += '<button class="subagent-link" data-target-pane="' + targetPane + '">';
          html += '<span class="link-icon">🔗</span>';
          html += '<span class="link-label">' + esc(targetTraj.agent.name || 'Subagent') + '</span>';
          html += '<span class="link-detail">' + esc(truncate(sessionId, 20)) + '</span>';
          html += '</button>';
        } else {
          // External reference → show info + file link if available
          html += '<div style="margin: 4px 0;">';
          html += '<span style="font-size: 12px;">Session: <code>' + esc(truncate(sessionId, 30)) + '</code></span>';
          if (trajPath) {
            html += '<br><button class="subagent-file-link" data-path="' + esc(trajPath) + '">';
            html += '📂 Open ' + esc(trajPath);
            html += '</button>';
          }
          if (ref.extra) {
            html += '<div class="code-block" style="margin-top:4px; font-size:11px">' + esc(formatJson(ref.extra)) + '</div>';
          }
          html += '</div>';
        }

        return html;
      }

      function renderStepMetrics(m) {
        let html = '<div class="step-metrics">';
        if (m.prompt_tokens != null) {
          html += renderMetricItem('Prompt', formatNum(m.prompt_tokens));
        }
        if (m.completion_tokens != null) {
          html += renderMetricItem('Completion', formatNum(m.completion_tokens));
        }
        if (m.cached_tokens != null) {
          html += renderMetricItem('Cached', formatNum(m.cached_tokens));
        }
        if (m.cost_usd != null) {
          html += renderMetricItem('Cost', '$' + m.cost_usd.toFixed(5));
        }
        html += '</div>';
        return html;
      }

      function renderMetricItem(label, value) {
        return '<div class="step-metric">' +
          '<span class="step-metric-label">' + esc(label) + ': </span>' +
          '<span class="step-metric-value">' + esc(String(value)) + '</span>' +
        '</div>';
      }

      function renderMessage(msg) {
        if (typeof msg === 'string') return msg;
        if (Array.isArray(msg)) {
          return msg.map(function(part) {
            if (part.type === 'text') return part.text || '';
            if (part.type === 'image') return '[Image: ' + (part.source && part.source.path ? part.source.path : 'embedded') + ']';
            return JSON.stringify(part);
          }).join('\\n');
        }
        return JSON.stringify(msg, null, 2);
      }

      function getPreview(msg) {
        const text = typeof msg === 'string' ? msg : (Array.isArray(msg) ? renderMessage(msg) : '');
        return text.substring(0, 100).replace(/\\n/g, ' ');
      }

      function formatJson(obj) {
        try {
          return JSON.stringify(obj, null, 2);
        } catch (e) {
          return String(obj);
        }
      }

      function getFirstTimestamp(steps) {
        for (var i = 0; i < steps.length; i++) {
          if (steps[i].timestamp) return steps[i].timestamp;
        }
        return null;
      }

      function getLastTimestamp(steps) {
        for (var i = steps.length - 1; i >= 0; i--) {
          if (steps[i].timestamp) return steps[i].timestamp;
        }
        return null;
      }

      function formatElapsed(ms) {
        if (isNaN(ms) || ms < 0) return null;
        var secs = Math.floor(ms / 1000);
        var mins = Math.floor(secs / 60);
        var hrs = Math.floor(mins / 60);
        secs = secs % 60;
        mins = mins % 60;
        if (hrs > 0) return hrs + 'h ' + mins + 'm ' + secs + 's';
        if (mins > 0) return mins + 'm ' + secs + 's';
        return secs + 's';
      }

      function getDuration(step, index, steps) {
        if (!step.timestamp || index === 0) return null;
        var prevStep = steps[index - 1];
        if (!prevStep || !prevStep.timestamp) return null;
        try {
          var cur = new Date(step.timestamp).getTime();
          var prev = new Date(prevStep.timestamp).getTime();
          if (isNaN(cur) || isNaN(prev)) return null;
          var diffMs = cur - prev;
          var diffSec = diffMs / 1000;
          if (diffSec < 0.01) return '<0.01s';
          if (diffSec < 10) return diffSec.toFixed(2) + 's';
          if (diffSec < 60) return diffSec.toFixed(1) + 's';
          var min = Math.floor(diffSec / 60);
          var sec = Math.round(diffSec % 60);
          return min + 'm ' + sec + 's';
        } catch (e) {
          return null;
        }
      }

      function formatNum(n) {
        if (typeof n !== 'number') return String(n);
        return n.toLocaleString();
      }

      function truncate(s, len) {
        if (!s) return '';
        return s.length > len ? s.substring(0, len) + '...' : s;
      }

      function esc(s) {
        if (!s) return '';
        const div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
      }
    })();
  `;
}
