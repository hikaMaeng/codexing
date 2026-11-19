import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, defaultModel } from './helpers.js';
import { setupVSCode } from '../lib/vscode-setup.js';
import { findExtension } from '../lib/vscode.js';
import { appServer } from './app-server-helpers.js';

test('official extension app-server via native adapter: no OpenAI login, two picker models, Responses route, MCP, OpenAI passthrough and off', { timeout: 90000 }, async t => {
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
  const settings = join(f.root, 'settings.json');
  const original = '{ // preserve settings\n "editor.fontSize": 16,\n}\n';
  writeFileSync(settings, original);
  const nativeConfig = '[mcp_servers.native_existing]\ncommand="unused"\nenabled=false\n';
  writeFileSync(join(f.home, '.codex', 'config.toml'), nativeConfig);
  const nativeAuth = '{"OPENAI_API_KEY":"fixture-original-account-not-copied"}';
  writeFileSync(join(f.home, '.codex', 'auth.json'), nativeAuth);
  writeFileSync(join(f.home, '.codexing', 'mcp.json'), JSON.stringify({ mcpServers: { additional: { command: 'unused-extra', enabled: false } } }));
  const setup = await setupVSCode(['--select-model', '1', '--settings', settings, '--extension', extension.root], { home: f.home });
  const argv = ['-c', 'features.code_mode_host=true', '-c', 'features.windows_sandbox_service=true', 'app-server', '--analytics-default-enabled'];
  const env = { ...f.env, PATH: process.env.PATH };
  let client = appServer(setup.wrapper, argv, { cwd: f.cwd, env });
  t.after(() => client.close());
  await client.rpc('initialize', { clientInfo: { name: 'codexing_vscode_smoke', version: '0.1.0' }, capabilities: { experimentalApi: true } });
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
    const done = client.wait('turn/completed');
    await client.rpc('turn/start', { threadId: thread.thread.id, input: [{ type: 'text', text: 'Reply vscode-fixture-ok. Do not use tools.', text_elements: [] }] });
    const completed = await done;
    assert.equal(completed.turn.status, 'completed');
    // A new wait must observe the second turn rather than the first cached notification.
    client.notifications.length = 0;
  }
  assert.deepEqual(requests.map(request => request.body.model), ['vscode-fixture-one', 'vscode-fixture-two']);
  assert.ok(requests.every(request => request.url === '/v1/responses' && request.authorization === undefined));
  await client.close();
  await setupVSCode(['--openai'], { home: f.home });
  client = appServer(setup.wrapper, argv, { cwd: f.cwd, env });
  await client.rpc('initialize', { clientInfo: { name: 'codexing_vscode_smoke', version: '0.1.0' }, capabilities: { experimentalApi: true } });
  client.notify('initialized');
  assert.equal((await client.rpc('account/read', { refreshToken: false })).requiresOpenaiAuth, true);
  assert.equal((await client.rpc('modelProvider/list')).defaultProviderId, 'openai');
  await client.close();
  await setupVSCode(['--off'], { home: f.home });
  assert.equal(readFileSync(settings, 'utf8'), original);
  assert.equal(readFileSync(join(f.home, '.codex', 'config.toml'), 'utf8'), nativeConfig);
  t.diagnostic('Two native picker models each sent one loopback Responses request without OpenAI credentials. Original OpenAI mode requires auth; settings restored.');
});
