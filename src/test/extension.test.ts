import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { SKILL_PATH_PATTERN } from '../atifPreviewPanel';
// import * as myExtension from '../../extension';

function detectSkill(path: string): string | undefined {
	return new RegExp(SKILL_PATH_PATTERN).exec(path)?.[1];
}

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('Detects skills in standard skill locations', () => {
		const paths = [
			'/workspace/.github/skills/project-skill/SKILL.md',
			'/home/user/.claude/skills/personal-skill/SKILL.md',
			'/home/user/.agents/skills/agent-skill/SKILL.md',
			String.raw`C:\Users\user\.copilot\skills\copilot-skill\SKILL.md`,
		];

		assert.deepStrictEqual(paths.map(detectSkill), [
			'project-skill',
			'personal-skill',
			'agent-skill',
			'copilot-skill',
		]);
	});

	test('Detects skills installed by Copilot plugins', () => {
		const paths = [
			String.raw`C:\Users\scope\.copilot\installed-plugins\wiqd\wiqd\skills\wiqd\SKILL.md`,
			String.raw`C:\\Users\\scope\\.copilot\\installed-plugins\\wiqd\\wiqd\\skills\\wiqd\\SKILL.md`,
		];

		assert.deepStrictEqual(paths.map(detectSkill), ['wiqd', 'wiqd']);
	});

	test('Detects skills contributed by VS Code extensions', () => {
		const paths = [
			String.raw`C:\Users\scope\.vscode\extensions\teamsdevapp.ms-teams-vscode-extension-6.12.0\skills\microsoft-365-agents-toolkit\SKILL.md`,
			'/Users/user/.vscode-insiders/extensions/garrytrinder.dev-proxy-toolkit-1.34.0/dist/skills/dev-proxy/SKILL.md',
		];

		assert.deepStrictEqual(paths.map(detectSkill), [
			'microsoft-365-agents-toolkit',
			'dev-proxy',
		]);
	});
});
