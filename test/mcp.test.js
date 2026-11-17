import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeMcp } from '../lib/mcp.js';
import { fixture } from './helpers.js';

test('stdio and HTTP MCP become native namespaced tables with secret references', () => {
  const result = makeMcp({ mcpServers: { files: { command: 'node', args: ['server.js', 'a & b'], env_vars: ['PROJECT_ROOT'] }, api: { url: 'http://localhost:3000/mcp', bearer_token_env_var: 'MCP_TOKEN', env_http_headers: { 'X-Client': 'MCP_CLIENT' } } } });
  assert.deepEqual(result.names, ['codexing_files', 'codexing_api']);
  assert.match(result.args[1], /mcp_servers.codexing_files=/);
  assert.match(result.args[3], /bearer_token_env_var/);
});

test('MCP rejects unsupported transport, inline secrets and malformed schema', () => {
  for (const server of [{ command: 'node', env: { TOKEN: 'secret' } }, { url: 'https://example.com/mcp', type: 'sse' }, { command: 'node', url: 'https://example.com' }, { url: 'https://example.com?token=secret' }, { command: 'node', args: 'server.js' }, { command: 'node', required: 'true' }, { command: 'node', startup_timeout_sec: -1 }, { url: 'https://example.com', env_http_headers: { Authorization: 'not a variable name' } }]) assert.throws(() => makeMcp({ mcpServers: { x: server } }));
  assert.throws(() => makeMcp({ mcpServers: { 'a.b': { command: 'node' } } }));
});

test('effective native MCP collisions fail closed before the coding child launches', () => {
  const f = fixture();
  writeFileSync(join(f.home, '.codexing', 'mcp.json'), JSON.stringify({ mcpServers: { demo: { command: 'node', args: ['demo.js'], enabled: false } } }));
  const conflict = f.run([], { FAKE_MCP_LIST: JSON.stringify([{ name: 'codexing_demo' }]) });
  assert.equal(conflict.status, 1);
  assert.equal(existsSync(f.env.CAPTURE), false);
  const okay = f.run([], { FAKE_MCP_LIST: JSON.stringify([{ name: 'existing' }]) });
  assert.equal(okay.status, 0, okay.stderr);
  assert.ok(JSON.parse(readFileSync(f.env.CAPTURE, 'utf8')).args.some((arg) => arg.startsWith('mcp_servers.codexing_demo=')));
});
