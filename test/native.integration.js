import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { once } from 'node:events';
import { findCodex } from '../lib/executable.js';
import { cli, fixture } from './helpers.js';

test('installed Codex uses selected Responses route/model/token and keeps native files intact', { timeout: 60000 }, async (t) => {
  const installed = findCodex();
  const version = spawnSync(installed.command, [...installed.prefix, '--version'], { encoding: 'utf8' });
  assert.equal(version.status, 0);
  t.diagnostic(`Native: ${installed.command}; ${version.stdout.trim()}`);
  for (const authenticated of [false, true]) {
    const requests = [];
    const server = createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      requests.push({ url: req.url, authorization: req.headers.authorization, body: JSON.parse(Buffer.concat(chunks).toString()) });
      const message = { id: 'msg_fixture', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'fixture-ok', annotations: [] }] };
      const events = [
        { type: 'response.created', response: { id: 'resp_fixture', status: 'in_progress', output: [] } },
        { type: 'response.output_item.added', output_index: 0, item: { ...message, status: 'in_progress', content: [] } },
        { type: 'response.output_text.delta', item_id: message.id, output_index: 0, content_index: 0, delta: 'fixture-ok' },
        { type: 'response.output_item.done', output_index: 0, item: message },
        { type: 'response.completed', response: { id: 'resp_fixture', status: 'completed', output: [message], usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 } } },
      ];
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const f = fixture();
    const model = { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, model: 'codexing-fixture-model', contextTokens: 12345 };
    if (authenticated) model.authToken = 'fixture-selected-token';
    writeFileSync(join(f.home, '.codexing', 'config.json'), JSON.stringify(model));
    const nativeConfig = 'model = "wrong-model"\nmodel_context_window = 999\n[mcp_servers.existing]\ncommand = "unused-existing"\nenabled = false\n';
    const nativeAuth = '{"OPENAI_API_KEY":"fixture-native-key-must-not-leak"}';
    writeFileSync(join(f.home, '.codex', 'config.toml'), nativeConfig);
    writeFileSync(join(f.home, '.codex', 'auth.json'), nativeAuth);
    writeFileSync(join(f.home, '.codex', 'AGENTS.md'), 'User instruction marker: CODEXING_USER_INHERITANCE.\n');
    writeFileSync(join(f.cwd, 'AGENTS.md'), 'Project instruction marker: CODEXING_PROJECT_INHERITANCE.\n');
    writeFileSync(join(f.home, '.codexing', 'mcp.json'), JSON.stringify({ mcpServers: { demo: { command: 'unused-extra', enabled: false } } }));
    const env = { ...f.env, PATH: process.env.PATH, OPENAI_API_KEY: 'fixture-env-key-must-not-leak' };
    const child = spawn(process.execPath, [cli, '--', 'exec', '--skip-git-repo-check', '--ephemeral', '--json', '-c', 'web_search="disabled"', 'Reply fixture-ok; do not use tools.'], { cwd: f.cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill('SIGTERM'), 25000);
    try {
      const [code] = await once(child, 'exit');
      assert.equal(code, 0, stderr.slice(-4000));
      assert.ok(requests.length >= 1, stderr);
      assert.equal(requests[0].url, '/v1/responses');
      assert.equal(requests[0].body.model, model.model);
      assert.match(JSON.stringify(requests[0].body), /CODEXING_USER_INHERITANCE/);
      assert.match(JSON.stringify(requests[0].body), /CODEXING_PROJECT_INHERITANCE/);
      assert.equal(requests[0].authorization, authenticated ? 'Bearer fixture-selected-token' : undefined);
      assert.match(stdout, /fixture-ok/);
      assert.equal(readFileSync(join(f.home, '.codex', 'config.toml'), 'utf8'), nativeConfig);
      assert.equal(readFileSync(join(f.home, '.codex', 'auth.json'), 'utf8'), nativeAuth);
      assert.ok(!stdout.includes('fixture-selected-token'));
      t.diagnostic(`${authenticated ? 'Bearer token' : 'No token'}: ${requests.length} loopback Responses request(s); native config/auth unchanged.`);
    } finally { clearTimeout(timer); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  }
});
