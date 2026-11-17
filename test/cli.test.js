import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, defaultModel } from './helpers.js';
import { parseArgs, validateArgs } from '../lib/arguments.js';
import { findCodex } from '../lib/executable.js';
import { makeProvider } from '../lib/provider.js';

test('folder grammar and launcher/native help are distinct', () => {
  const f = fixture();
  assert.match(f.run(['--help']).stdout, /Codexing/);
  assert.equal(existsSync(f.env.CAPTURE), false);
  assert.equal(f.run(['--', '--help']).status, 0);
  assert.ok(JSON.parse(readFileSync(f.env.CAPTURE)).args.includes('--help'));
  assert.deepEqual(parseArgs(['--', 'exec', 'prompt'], f.cwd).args, ['exec', 'prompt']);
  assert.deepEqual(parseArgs([f.cwd, '--', 'exec', 'prompt']).args, ['exec', 'prompt']);
  assert.equal(f.run(['nonexistent-folder']).status, 1);
});

test('literal argv, selected provider, child credentials, native config isolation and exit status', () => {
  const f = fixture();
  const sentinel = join(f.home, '.codex', 'config.toml');
  const auth = join(f.home, '.codex', 'auth.json');
  writeFileSync(sentinel, '# preserve\nmodel="existing"\n');
  writeFileSync(auth, '{"sentinel":"credentials"}');
  const prompt = '한글 "quoted" & | > $(not-a-command) %PATH% `literal` \\ end';
  const result = f.run([f.cwd, '--', 'exec', '-c', 'model_reasoning_effort="low"', '--', prompt], { OPENAI_API_KEY: 'unrelated-secret', FAKE_EXIT: '37' });
  assert.equal(result.status, 37, result.stderr);
  const captured = JSON.parse(readFileSync(f.env.CAPTURE));
  assert.equal(captured.cwd, f.cwd);
  assert.deepEqual(captured.args.slice(-5), ['-c', 'model_reasoning_effort="low"', 'exec', '--', prompt]);
  assert.equal(captured.env.CODEXING_AUTH_TOKEN, defaultModel.authToken);
  assert.equal(captured.env.OPENAI_API_KEY, undefined);
  assert.equal(captured.env.CODEX_HOME, f.env.CODEX_HOME);
  assert.ok(captured.args.includes('--no-daemon'));
  assert.ok(captured.args.some((arg) => arg.includes('wire_api') && arg.includes('responses')));
  assert.ok(captured.args.includes('model_context_window=32000'));
  assert.ok(!captured.args.join(' ').includes(defaultModel.authToken));
  assert.ok(!captured.args.includes('--dangerously-bypass-approvals-and-sandbox'));
  assert.equal(readFileSync(sentinel, 'utf8'), '# preserve\nmodel="existing"\n');
  assert.equal(readFileSync(auth, 'utf8'), '{"sentinel":"credentials"}');
});

test('routing overrides and conflicting environment fail before spawn without secrets', () => {
  for (const args of [['--model=x'], ['-mx'], ['--oss'], ['--remote=ws://x'], ['-C..'], ['-cmodel_provider="openai"'], ['--config', '"model_provider"="openai"'], ['--config=model_providers={x=1}'], ['-c', 'mcp_servers={}'], ['login']]) assert.throws(() => validateArgs(args));
  const f = fixture();
  for (const key of ['OPENAI_BASE_URL', 'CODEX_API_KEY']) {
    const result = f.run([], { [key]: 'do-not-echo-this' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(key));
    assert.ok(!result.stderr.includes('do-not-echo-this'));
    assert.equal(existsSync(f.env.CAPTURE), false);
  }
  const one = makeProvider(defaultModel, {}), two = makeProvider(defaultModel, {});
  assert.notDeepEqual(one.args, two.args);
  assert.equal(makeProvider({ baseUrl: defaultModel.baseUrl, model: 'x' }, { CODEXING_AUTH_TOKEN: 'stale' }).env.CODEXING_AUTH_TOKEN, undefined);
});

test('native version and multi-model selection fail before launch when invalid', () => {
  const f = fixture({ models: [defaultModel, { ...defaultModel, model: 'second-model', authToken: 'second-token' }] });
  assert.equal(f.run().status, 1);
  assert.equal(existsSync(f.env.CAPTURE), false);
  assert.equal(f.run(['--select-model', '2'], { FAKE_VERSION: '0.162.0' }).status, 1);
  assert.equal(existsSync(f.env.CAPTURE), false);
  assert.equal(f.run(['--select-model', '2', f.cwd, '--', 'exec', 'prompt']).status, 0);
  const captured = JSON.parse(readFileSync(f.env.CAPTURE));
  assert.ok(captured.args.includes('model="second-model"'));
  assert.equal(captured.env.CODEXING_AUTH_TOKEN, 'second-token');
});

test('Windows resolution honors PATH order, skips shell execution and rejects escaping bins', () => {
  const f = fixture(), later = join(f.root, 'later');
  mkdirSync(later);
  writeFileSync(join(later, 'codex.exe'), 'later');
  if (process.platform === 'win32') {
    const found = findCodex({ platform: 'win32', env: { PATH: `${f.path};${later}` } });
    assert.equal(found.command, process.execPath);
    assert.ok(found.prefix[0].endsWith('fake.js'));
    writeFileSync(join(f.path, 'node_modules', '@openai', 'codex', 'package.json'), JSON.stringify({ name: '@openai/codex', bin: { codex: '../../../../outside.js' } }));
    assert.equal(findCodex({ platform: 'win32', env: { PATH: `${f.path};${later}` } }).command, join(later, 'codex.exe'));
  }
  assert.throws(() => findCodex({ env: { PATH: '' } }), /not found/);
});
