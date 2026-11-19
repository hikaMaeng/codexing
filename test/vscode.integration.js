import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './helpers.js';
import { setupVSCode } from '../lib/vscode-setup.js';
import { findExtension } from '../lib/vscode.js';
import { appServer } from './app-server-helpers.js';

test('official extension app-server via native adapter: no OpenAI login, picker, Responses, MCP, trusted chat on/off and uninstall', { timeout: 300000 }, async t => {
  const extension = findExtension();
  t.diagnostic('Installed official extension version: ' + extension.version);
  const requests = [];
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/v1/responses') { res.writeHead(404); res.end(); return; }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({ url: req.url, authorization: req.headers.authorization, body: JSON.parse(Buffer.concat(chunks).toString()) });
    const message = { id: 'msg_smoke', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'vscode-fixture-ok', annotations: [] }] };
    const events = [
      { type: 'response.created', response: { id: 'resp_smoke', status: 'in_progress', output: [] } },
      { type: 'response.output_item.added', output_index: 0, item: { ...message, status: 'in_progress', content: [] } },
      { type: 'response.output_text.delta', item_id: message.id, output_index: 0, content_index: 0, delta: 'vscode-fixture-ok' },
      { type: 'response.output_item.done', output_index: 0, item: message },
      { type: 'response.completed', response: { id: 'resp_smoke', status: 'completed', output: [message], usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 } } },
    ];
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  const first = { baseUrl, model: 'vscode-fixture-one', contextTokens: 65536 };
  const f = fixture({ models: [first, { ...first, model: 'vscode-fixture-two' }, { ...first, model: 'another-server', baseUrl: 'http://127.0.0.1:1/v1' }] });
  if (process.platform === 'win32') {
    // A project must not substitute the pinned Node used by the trusted hook.
    writeFileSync(join(f.cwd, 'node.cmd'), '@echo off\r\nexit /b 98\r\n');
    writeFileSync(join(f.cwd, 'node.exe'), 'Not an executable: current-directory search must be disabled.');
  }
  const settings = join(f.root, 'settings.json');
  const original = '{ // preserve settings\n "editor.fontSize": 16,\n}\n';
  writeFileSync(settings, original);
  const nativeConfig = '[mcp_servers.native_existing]\ncommand="unused"\nenabled=false\n';
  writeFileSync(join(f.home, '.codex', 'config.toml'), nativeConfig);
  const nativeHooks = JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'echo existing-user-hook' }] }] } });
  writeFileSync(join(f.home, '.codex', 'hooks.json'), nativeHooks);
  const nativeAuth = '{"OPENAI_API_KEY":"fixture-original-account-not-copied"}';
  writeFileSync(join(f.home, '.codex', 'auth.json'), nativeAuth);
  writeFileSync(join(f.home, '.codexing', 'mcp.json'), JSON.stringify({ mcpServers: { additional: { command: 'unused-extra', enabled: false } } }));
  const setup = await setupVSCode(['on', '--select-model', '1', '--settings', settings, '--extension', extension.root], { home: f.home });
  const argv = ['-c', 'features.code_mode_host=true', '-c', 'features.windows_sandbox_service=true', 'app-server', '--analytics-default-enabled'];
  const env = { ...f.env, PATH: process.env.PATH };
  let client = appServer(setup.wrapper, argv, { cwd: f.cwd, env });
  t.after(() => client.close());
  await client.rpc('initialize', { clientInfo: { name: 'codexing_vscode_smoke', version: '0.1.0' }, capabilities: { experimentalApi: true } }, 60000);
  client.notify('initialized');
  const account = await client.rpc('account/read', { refreshToken: false });
  assert.equal(account.requiresOpenaiAuth, false);
  assert.equal(account.account, null);
  const config = (await client.rpc('config/read', { includeLayers: false })).config;
  assert.equal(config.model_context_window, 65536);
  assert.ok(config.mcp_servers.native_existing);
  assert.ok(config.mcp_servers.codexing_additional);
  const models = await client.rpc('model/list');
  assert.deepEqual(models.data.map(model => model.model), ['vscode-fixture-one', 'vscode-fixture-two']);
  assert.equal(models.data[0].isDefault, true);
  // The official picker may persist its default: native writes must target the dedicated profile.
  await client.rpc('config/value/write', { keyPath: 'model', value: 'vscode-fixture-two', mergeStrategy: 'replace' });
  assert.equal(readFileSync(join(f.home, '.codex', 'config.toml'), 'utf8'), nativeConfig);
  assert.equal(readFileSync(join(f.home, '.codex', 'auth.json'), 'utf8'), nativeAuth);
  for (const model of models.data) {
    const thread = await client.rpc('thread/start', { model: model.model, cwd: f.cwd, ephemeral: true, approvalPolicy: 'never', sandbox: 'read-only' });
    const done = client.wait('turn/completed', 45000);
    await client.rpc('turn/start', { threadId: thread.thread.id, input: [{ type: 'text', text: 'Reply vscode-fixture-ok. Do not use tools.', text_elements: [] }] });
    const completed = await done;
    assert.equal(completed.turn.status, 'completed');
    // A new wait must observe the second turn rather than the first cached notification.
    client.notifications.length = 0;
  }
  assert.deepEqual(requests.map(request => request.body.model), ['vscode-fixture-one', 'vscode-fixture-two']);
  assert.ok(requests.every(request => request.url === '/v1/responses' && request.authorization === undefined));
  // Trust through the same public config write used by the official Review Hooks UI,
  // only in this disposable home. Production code never writes trusted_hash.
  const hooks = (await client.rpc('hooks/list', { cwd: f.cwd })).data.flatMap(row => row.hooks);
  assert.ok(hooks.some(hook => hook.command === 'echo existing-user-hook'), 'existing user hook source remains present');
  const hook = hooks.find(hook => hook.source === 'sessionFlags');
  assert.equal(hook.eventName, 'userPromptSubmit');
  assert.equal(hook.trustStatus, 'untrusted');
  await client.rpc('config/batchWrite', { edits: [{ keyPath: `hooks.state.${JSON.stringify(hook.key)}.trusted_hash`, value: hook.currentHash, mergeStrategy: 'replace' }], reloadUserConfig: true });
  assert.equal((await client.rpc('hooks/list', { cwd: f.cwd })).data.flatMap(row => row.hooks).find(row => row.key === hook.key).trustStatus, 'trusted');
  client.notifications.length = 0;
  const ordinary = await client.rpc('thread/start', { cwd: f.cwd, ephemeral: true, approvalPolicy: 'never', sandbox: 'read-only' });
  const ordinaryDone = client.wait('turn/completed', 75000);
  await client.rpc('turn/start', { threadId: ordinary.thread.id, input: [{ type: 'text', text: 'Reply vscode-fixture-ok. Do not use tools.', text_elements: [] }] });
  await ordinaryDone;
  assert.equal(requests.length, 3, 'trusted mode hook leaves ordinary messages unchanged');
  const switchInChat = async (text, expected) => {
    client.notifications.length = 0;
    const thread = await client.rpc('thread/start', { cwd: f.cwd, ephemeral: true, approvalPolicy: 'never', sandbox: 'read-only' });
    const done = client.wait('turn/completed', 75000);
    await client.rpc('turn/start', { threadId: thread.thread.id, input: [{ type: 'text', text, text_elements: [] }] });
    await done;
    if (requests.length !== 3) t.diagnostic(JSON.stringify(client.notifications.filter(row => /hook/i.test(JSON.stringify(row)))));
    assert.equal(requests.length, 3, 'mode command must never reach Responses');
    assert.equal(JSON.parse(readFileSync(join(f.home, '.codexing', 'vscode.json'))).enabled, expected);
    assert.ok(JSON.stringify(client.notifications).includes('Reload this VS Code window'), 'native block notification includes the restart boundary');
  };
  await switchInChat('codexing /vscode off', false);
  await switchInChat('codexing /vscode on', true);
  // The current process remains on its original provider until restarted.
  assert.equal((await client.rpc('account/read', { refreshToken: false })).requiresOpenaiAuth, false);
  await client.close();
  await setupVSCode(['off'], { home: f.home });
  client = appServer(setup.wrapper, ['-c', `chatgpt_base_url=${JSON.stringify(baseUrl)}`, ...argv], { cwd: f.cwd, env: { ...env, OPENAI_BASE_URL: baseUrl } });
  await client.rpc('initialize', { clientInfo: { name: 'codexing_vscode_smoke', version: '0.1.0' }, capabilities: { experimentalApi: true } }, 60000);
  client.notify('initialized');
  assert.equal((await client.rpc('account/read', { refreshToken: false })).requiresOpenaiAuth, true);
  assert.equal((await client.rpc('modelProvider/list')).defaultProviderId, 'openai');
  const offHook = (await client.rpc('hooks/list', { cwd: f.cwd })).data.flatMap(row => row.hooks).find(row => row.source === 'sessionFlags');
  assert.equal(offHook.trustStatus, 'untrusted', 'OpenAI home has independent native hook trust');
  await client.rpc('config/batchWrite', { edits: [{ keyPath: `hooks.state.${JSON.stringify(offHook.key)}.trusted_hash`, value: offHook.currentHash, mergeStrategy: 'replace' }], reloadUserConfig: true });
  await switchInChat('codexing /vscode on', true);
  await client.close();
  await setupVSCode(['uninstall'], { home: f.home });
  assert.equal(readFileSync(settings, 'utf8'), original);
  assert.equal(readFileSync(join(f.home, '.codex', 'hooks.json'), 'utf8'), nativeHooks);
  assert.equal(readFileSync(join(f.home, '.codex', 'auth.json'), 'utf8'), nativeAuth);
  // Only the explicit fixture Review Hooks action wrote trust in the native home.
  assert.ok(readFileSync(join(f.home, '.codex', 'config.toml'), 'utf8').startsWith(nativeConfig));
  t.diagnostic('Two picker models routed Responses; trusted on/off hooks blocked all three mode prompts with zero additional model requests. Original OpenAI mode and registration restoration verified.');
});
