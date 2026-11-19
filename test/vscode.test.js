import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fixture, defaultModel } from './helpers.js';
import { parseSettings, editSetting } from '../lib/jsonc.js';
import { setupVSCode, replaceChecked, createVSCodeWrapper } from '../lib/vscode-setup.js';
import { vscodeLaunch, vscodeModels } from '../lib/vscode.js';

function officialExtension(f) {
  const root = join(f.home, '.vscode', 'extensions', 'openai.chatgpt-1.0.0');
  const family = process.platform === 'win32' ? 'windows' : process.platform;
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
  const dir = join(root, 'bin', `${family}-${arch}`);
  mkdirSync(dir, { recursive: true });
  // Registration/path validation does not execute this fixture binary.
  const command = join(dir, process.platform === 'win32' ? 'codex.exe' : 'codex');
  writeFileSync(command, 'fixture native path', { mode: 0o755 });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ publisher: 'openai', name: 'chatgpt', version: '1.0.0', contributes: { configuration: { properties: { 'chatgpt.cliExecutable': { type: 'string' } } } } }));
  return { root, command };
}

test('JSONC single-key editing preserves comments, commas, nested values and URL strings', () => {
  for (const source of ['{}', '{"a":1}', '{"a":1,}', '{ // hello\n "url":"https://host/a//b", /* keep */ "nested":{"a":[1,2,]},\n}', '\ufeff{\r\n "x":1,\r\n}\r\n']) {
    const original = parseSettings(source).value;
    const added = editSetting(source, 'chatgpt.cliExecutable', 'C:\\space path\\adapter.exe');
    assert.equal(parseSettings(added).value['chatgpt.cliExecutable'], 'C:\\space path\\adapter.exe');
    const removed = editSetting(added, 'chatgpt.cliExecutable', undefined, true);
    assert.deepEqual(parseSettings(removed).value, original);
    if (source.includes('keep')) assert.ok(removed.includes('/* keep */'));
  }
  assert.throws(() => parseSettings('{"x":1,"x":2}'), /Duplicate/);
  assert.throws(() => parseSettings('{/* unterminated'), /unterminated/);
  for (const source of ['{"key":"old","tail":2}', '{"head":2,"key":"old"}', '{"key":"old"}']) {
    assert.equal(parseSettings(editSetting(source, 'key', 'new')).value.key, 'new');
    assert.equal(parseSettings(editSetting(source, 'key', undefined, true)).value.key, undefined);
  }
  const note = '{"editor.fontSize":14, // editor note\n "chatgpt.cliExecutable":"wrapper"\n}';
  const removed = editSetting(note, 'chatgpt.cliExecutable', undefined, true);
  assert.ok(removed.includes('// editor note'));
  assert.equal(parseSettings(removed).value['editor.fontSize'], 14);
});

test('same-connection catalog separates URL, credentials, context and supports duplicate IDs', async () => {
  const f = fixture({ models: [defaultModel, { ...defaultModel, model: 'second' }, { ...defaultModel, model: 'remote', baseUrl: 'https://other/v1' }, { ...defaultModel, model: 'other-auth', authToken: 'other' }, { ...defaultModel, model: 'other-context', contextTokens: 16384 }] });
  const group = await vscodeModels(f.home, '2');
  assert.deepEqual(group.catalog.models.map(row => row.slug), ['second', defaultModel.model]);
  assert.equal(group.selector, '2');
  assert.ok(!JSON.stringify(group.catalog).includes(defaultModel.authToken));
  assert.deepEqual((await vscodeModels(f.home, '3')).models.map(row => row.model), ['remote']);
});

test('registration restores exact original bytes and leaves Codexing/model/native config alone', async () => {
  const f = fixture(); officialExtension(f);
  const settings = join(f.root, 'profile', 'User', 'settings.json');
  mkdirSync(join(f.root, 'profile', 'User'), { recursive: true });
  const original = Buffer.from('\ufeff{\r\n  // untouched preference\r\n  "editor.fontSize": 15,\r\n  "chatgpt.cliExecutable": "previous.exe",\r\n}\r\n');
  writeFileSync(settings, original);
  const modelFile = join(f.home, '.codexing', 'config.json'), modelBytes = readFileSync(modelFile);
  const setup = await setupVSCode(['--settings', settings], { home: f.home });
  assert.equal(parseSettings(readFileSync(settings, 'utf8')).value['chatgpt.cliExecutable'], setup.wrapper);
  await setupVSCode(['--openai'], { home: f.home });
  const native = await vscodeLaunch(['-c', 'features.code_mode_host=true', 'app-server', '--analytics-default-enabled'], { home: f.home, cwd: f.cwd, env: { OPENAI_API_KEY: 'sentinel', CODEX_HOME: 'keep-home' } });
  assert.deepEqual(native.args, ['-c', 'features.code_mode_host=true', 'app-server', '--analytics-default-enabled']);
  assert.deepEqual(native.env, { OPENAI_API_KEY: 'sentinel', CODEX_HOME: 'keep-home' });
  await setupVSCode(['--off'], { home: f.home });
  assert.deepEqual(readFileSync(settings), original);
  assert.deepEqual(readFileSync(modelFile), modelBytes);
});

test('unregister preserves intervening user edits, including edits before a mode switch', async () => {
  const f = fixture(); officialExtension(f);
  const file = join(f.root, 'settings.json');
  writeFileSync(file, '{ // original\n "editor.fontSize":14\n}\n');
  await setupVSCode(['--settings', file], { home: f.home });
  writeFileSync(file, editSetting(readFileSync(file, 'utf8'), 'editor.fontSize', 19));
  await setupVSCode(['--openai'], { home: f.home });
  await setupVSCode(['--off'], { home: f.home });
  const restored = parseSettings(readFileSync(file, 'utf8')).value;
  assert.equal(restored['editor.fontSize'], 19);
  assert.equal(restored['chatgpt.cliExecutable'], undefined);
});

test('ownership and concurrent-file conflicts stop without replacing user values', async () => {
  const f = fixture(); officialExtension(f);
  const file = join(f.root, 'settings.json');
  writeFileSync(file, '{}');
  await setupVSCode(['--settings', file], { home: f.home });
  writeFileSync(file, '{"chatgpt.cliExecutable":"changed-elsewhere.exe"}');
  await assert.rejects(setupVSCode(['--off'], { home: f.home }), /changed elsewhere/);
  const current = readFileSync(file);
  assert.throws(() => replaceChecked(file, Buffer.from('{}'), Buffer.from('stale')), /changed during/);
  assert.deepEqual(readFileSync(file), current);
});

test('app-server launch keeps protocol argv/stdin contract and applies private token/catalog', async () => {
  const f = fixture(), extension = officialExtension(f);
  mkdirSync(join(f.home, '.codexing', 'vscode'), { recursive: true });
  writeFileSync(join(f.home, '.codexing', 'vscode.json'), JSON.stringify({ enabled: true, modelSelector: '1', nativeExecutable: extension.command, providerNamespace: '1'.repeat(32) }));
  const args = ['-c', 'features.code_mode_host=true', '-c', 'features.windows_sandbox_service=true', 'app-server', '--analytics-default-enabled'];
  const launch = await vscodeLaunch(args, { home: f.home, cwd: f.cwd, env: { OPENAI_API_KEY: 'unrelated', CODEX_HOME: 'same-home' } });
  assert.deepEqual(launch.args.slice(0, 4), args.slice(0, 4));
  assert.deepEqual(launch.args.slice(-2), ['app-server', '--analytics-default-enabled']);
  assert.equal(launch.env.CODEXING_AUTH_TOKEN, defaultModel.authToken);
  assert.equal(launch.env.OPENAI_API_KEY, undefined);
  assert.ok(launch.env.CODEX_HOME.startsWith(join(f.home, '.codexing', 'vscode', 'codex-home-')));
  assert.ok(!launch.args.join(' ').includes(defaultModel.authToken));
  const catalogArg = launch.args.find(arg => arg.startsWith('model_catalog_json='));
  const catalog = JSON.parse(readFileSync(JSON.parse(catalogArg.split('=').slice(1).join('=')), 'utf8'));
  assert.equal(catalog.models[0].slug, defaultModel.model);
});

test('failed settings/registration commits roll back launcher state and preserve concurrent user edits', async () => {
  for (const failedTarget of ['settings', 'registration']) {
    const f = fixture(); officialExtension(f);
    const file = join(f.root, 'settings.json');
    writeFileSync(file, '{"editor.fontSize":14}');
    const original = readFileSync(file);
    const stateFile = join(f.home, '.codexing', 'vscode.json');
    await assert.rejects(setupVSCode(['--settings', file], { home: f.home, replace(target, content, before) {
      if (failedTarget === 'settings' && target === file) {
        writeFileSync(file, '{"editor.fontSize":19}');
        replaceChecked(target, content, before);
      } else if (failedTarget === 'registration' && target.endsWith('registration.json')) throw new Error('Injected registration disk error');
      else replaceChecked(target, content, before);
    } }), /Previous registration state was restored/);
    assert.equal(existsSync(stateFile), false);
    assert.equal(parseSettings(readFileSync(file, 'utf8')).value['editor.fontSize'], failedTarget === 'settings' ? 19 : 14);
    if (failedTarget === 'registration') assert.deepEqual(readFileSync(file), original);
  }
});

test('same-wrapper mode change does not rewrite VS Code settings', async () => {
  const f = fixture(); officialExtension(f);
  const file = join(f.root, 'settings.json');
  writeFileSync(file, '{}');
  await setupVSCode(['--settings', file], { home: f.home });
  const old = readFileSync(file);
  await setupVSCode(['--openai'], { home: f.home, replace(target, after, before) {
    assert.notEqual(target, file);
    replaceChecked(target, after, before);
  } });
  assert.deepEqual(readFileSync(file), old);
});

test('native adapter preserves literal argv and byte streams, including Unicode paths and empty arguments', { timeout: 10000 }, async () => {
  const f = fixture(), entry = join(f.root, 'echo-한글.cjs');
  writeFileSync(entry, `process.stdout.write(JSON.stringify(process.argv.slice(2))+'\\n'); const chunks=[];process.stdin.on('data',b=>chunks.push(b));process.stdin.on('end',()=>{process.stdout.write(Buffer.concat(chunks));process.stderr.write('오류 스트림');});`);
  const wrapper = createVSCodeWrapper(join(f.root, 'adapter'), { entry });
  const args = ['space value', '"quoted"', 'C:\\trailing\\', '한글', '&|<>', ''];
  const payload = Buffer.from([0, 255, 10, ...Buffer.from('입출력', 'utf8')]);
  const child = spawn(wrapper, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const stdout = [], stderr = [];
  child.stdout.on('data', data => stdout.push(data)); child.stderr.on('data', data => stderr.push(data));
  const exited = once(child, 'exit');
  child.stdin.end(payload);
  const [code] = await exited;
  assert.equal(code, 0);
  const output = Buffer.concat(stdout), newline = output.indexOf(10);
  assert.deepEqual(JSON.parse(output.subarray(0, newline).toString('utf8')), args);
  assert.deepEqual(output.subarray(newline + 1), payload);
  assert.equal(Buffer.concat(stderr).toString('utf8'), '오류 스트림');
});
