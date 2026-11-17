import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const cli = fileURLToPath(new URL('../bin/codexing.js', import.meta.url));
export const defaultModel = { baseUrl: 'http://127.0.0.1:1234/v1', model: 'fixture-model', contextTokens: 32000, authToken: 'fixture-token' };

/** Create a disposable user home and fake official npm Codex installation. */
export function fixture(config = defaultModel) {
  const root = mkdtempSync(join(tmpdir(), 'codexing-test-'));
  const home = join(root, 'home'), path = join(root, 'fake-bin'), cwd = join(root, 'project space');
  for (const dir of [join(home, '.codexing'), join(home, '.codex'), cwd, path]) mkdirSync(dir, { recursive: true });
  const env = { ...process.env, HOME: home, USERPROFILE: home, CODEX_HOME: join(home, '.codex'), PATH: path, CAPTURE: join(root, 'capture.json') };
  for (const key of Object.keys(env)) if (['OPENAI_BASE_URL', 'CODEX_API_KEY', 'OPENAI_API_KEY', 'CODEXING_AUTH_TOKEN'].includes(key.toUpperCase())) delete env[key];
  const fake = `import {writeFileSync} from 'node:fs';
if(process.argv.includes('--version')) {console.log('codex-cli ' + (process.env.FAKE_VERSION || '0.163.0')); process.exit(0);}
if(process.argv.includes('list')) {console.log(process.env.FAKE_MCP_LIST || '[]'); process.exit(0);}
writeFileSync(process.env.CAPTURE, JSON.stringify({args:process.argv.slice(2), cwd:process.cwd(), env:Object.fromEntries(['CODEXING_AUTH_TOKEN','OPENAI_API_KEY','CODEX_HOME'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]))}));
process.exit(Number(process.env.FAKE_EXIT || 0));`;
  if (process.platform === 'win32') {
    const pkg = join(path, 'node_modules', '@openai', 'codex');
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: '@openai/codex', type: 'module', bin: { codex: 'fake.js' } }));
    writeFileSync(join(pkg, 'fake.js'), fake);
    writeFileSync(join(path, 'codex.cmd'), '@echo SHOULD-NOT-RUN');
  } else {
    writeFileSync(join(path, 'codex'), `#!${process.execPath}\n${fake}`, { mode: 0o755 });
  }
  if (config !== undefined) writeFileSync(join(home, '.codexing', 'config.json'), JSON.stringify(config));
  return { root, home, path, cwd, env, run: (args = [], extra = {}) => spawnSync(process.execPath, [cli, ...args], { cwd, env: { ...env, ...extra }, encoding: 'utf8', timeout: 15000 }) };
}
