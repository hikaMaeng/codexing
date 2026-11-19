import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, dirname, delimiter, isAbsolute, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readJson, normalizeEndpoint } from './config.js';
import { selectModel } from './models.js';
import { makeProvider } from './provider.js';
import { makeMcp } from './mcp.js';
import { vscodeHookArgs } from './vscode-hook.js';

/** Read an optional launcher-owned JSON file. */
export function readOptional(file) { return existsSync(file) ? readJson(file) : {}; }

/** Locate the official extension and its matching bundled executable. */
export function findExtension({ home = homedir(), extensionPath, platform = process.platform, arch = process.arch } = {}) {
  const base = join(home, '.vscode', 'extensions');
  let roots = extensionPath ? [resolve(extensionPath)] : statSync(base, { throwIfNoEntry: false })?.isDirectory() ?
    readdirSync(base).filter(name => name.startsWith('openai.chatgpt-')).map(name => join(base, name)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })) : [];
  const inventory = join(base, 'extensions.json');
  if (!extensionPath && existsSync(inventory)) {
    const active = readJson(inventory).find(entry => entry.identifier?.id === 'openai.chatgpt');
    if (active && typeof active.relativeLocation === 'string' && /^openai\.chatgpt-[^/\\]+$/.test(active.relativeLocation)) roots = [join(base, active.relativeLocation)];
  }
  for (const root of roots) {
    const file = join(root, 'package.json');
    if (!existsSync(file)) continue;
    const manifest = readJson(file);
    if (manifest.publisher !== 'openai' || manifest.name !== 'chatgpt') continue;
    const key = manifest.contributes?.configuration?.properties?.['chatgpt.cliExecutable'];
    const architecture = { x64: 'x86_64', arm64: 'aarch64' }[arch];
    const family = platform === 'win32' ? 'windows' : platform;
    const command = join(root, 'bin', `${family}-${architecture}`, platform === 'win32' ? 'codex.exe' : 'codex');
    if (!key || !architecture || !statSync(command, { throwIfNoEntry: false })?.isFile()) continue;
    return { root, command, version: manifest.version };
  }
  throw new Error('Official openai.chatgpt extension with chatgpt.cliExecutable was not found. Install it or pass /vscode --extension <extension-directory>.');
}

/** Build a native model catalog for entries sharing endpoint, authentication and context. */
export async function vscodeModels(home = homedir(), selector, input = process.stdin, output = process.stderr) {
  const config = readJson(join(home, '.codexing', 'config.json'));
  const selected = await selectModel(config, selector, input, output);
  const all = config.models ?? [config];
  const same = entry => normalizeEndpoint(entry.baseUrl) === normalizeEndpoint(selected.baseUrl) &&
    (entry.authToken?.trim() ?? '') === (selected.authToken?.trim() ?? '') && entry.contextTokens === selected.contextTokens;
  const models = [...new Map([selected, ...all.filter(same)].map(entry => [entry.model.trim(), entry])).values()];
  const catalog = { models: models.map((entry, priority) => ({
    slug: entry.model.trim(), display_name: `Codexing · ${entry.model.trim()}`,
    description: 'Configured Responses API model. Server capabilities vary.',
    base_instructions: 'You are a coding assistant. Follow the user instructions and available tool contracts.',
    default_reasoning_level: 'none', supported_reasoning_levels: [], shell_type: 'shell_command',
    visibility: 'list', supported_in_api: true, priority, support_verbosity: false,
    truncation_policy: { mode: 'tokens', limit: 10000 }, experimental_supported_tools: [],
    ...(entry.contextTokens === undefined ? {} : { context_window: entry.contextTokens }), input_modalities: ['text'],
  })) };
  return { selected, models, catalog, groupIndex: all.findIndex(same), selector: String(all.indexOf(selected) + 1) };
}

/** Prepare the extension's real app-server without rewriting JSON-RPC/auth responses. */
export async function vscodeLaunch(args, { home = homedir(), cwd = process.cwd(), env = process.env } = {}) {
  const directory = join(home, '.codexing');
  const state = readOptional(join(directory, 'vscode.json'));
  const command = state.nativeExecutable;
  if (typeof command !== 'string' || !isAbsolute(command) || !statSync(command, { throwIfNoEntry: false })?.isFile()) throw new Error('VS Code bundled Codex executable is missing. Run codexing /vscode again.');
  if (typeof state.enabled !== 'boolean') throw new Error('Invalid VS Code enabled flag. Run codexing /vscode again.');
  if (!args.includes('app-server')) return { command, args: [...args], cwd, env: { ...env } };
  if (!/^[a-f0-9]{32}$/.test(state.providerNamespace ?? '')) throw new Error('Invalid VS Code registration namespace. Run codexing /vscode again.');
  // Hook sources remain independent native layers. Do not replace caller-supplied
  // session hooks for the same event; require the caller to resolve that conflict.
  if (args.some(arg => /^(?:--config=)?["']?hooks["']?(?:\.["']?UserPromptSubmit["']?)?\s*=/.test(arg))) throw new Error('Caller already defines session UserPromptSubmit hooks; no app-server was started.');
  const index = args.indexOf('app-server');
  const hookArgs = vscodeHookArgs();
  const controlEnv = { CODEXING_VSCODE_CONTROL_HOME: home, CODEXING_VSCODE_CONTROL_NAMESPACE: state.providerNamespace };
  if (process.platform === 'win32') {
    if (basename(process.execPath).toLowerCase() !== 'node.exe') throw new Error('The Windows hook requires a standard node.exe installation.');
    const pathKeys = Object.keys(env).filter(key => key.toUpperCase() === 'PATH');
    const pinned = dirname(process.execPath) + delimiter + (env[pathKeys[0]] ?? '');
    for (const key of pathKeys.length ? pathKeys : ['PATH']) controlEnv[key] = pinned;
    for (const key of Object.keys(env).filter(key => key.toUpperCase() === 'NODEFAULTCURRENTDIRECTORYINEXEPATH')) controlEnv[key] = '1';
    controlEnv.NoDefaultCurrentDirectoryInExePath = '1';
  }
  if (!state.enabled) return { command, args: [...args.slice(0, index), ...hookArgs, ...args.slice(index)], cwd, env: { ...env, ...controlEnv } };
  const { selected, catalog, groupIndex } = await vscodeModels(home, state.modelSelector ?? '1', { isTTY: false }, { isTTY: false });
  const fingerprint = createHash('sha256').update(JSON.stringify([normalizeEndpoint(selected.baseUrl), selected.contextTokens ?? null, groupIndex])).digest('hex').slice(0, 12);
  const provider = makeProvider(selected, env, `codexing_${state.providerNamespace}_${fingerprint}`);
  const mcpFile = join(directory, 'mcp.json');
  const mcp = existsSync(mcpFile) ? makeMcp(readJson(mcpFile)) : { names: [], args: [] };
  const generated = join(directory, 'vscode', 'catalogs');
  mkdirSync(generated, { recursive: true });
  const serialized = JSON.stringify(catalog, null, 2) + '\n';
  const digest = createHash('sha256').update(serialized).digest('hex');
  const file = join(generated, `${digest}.json`);
  if (!existsSync(file)) writeFileSync(file, serialized, { flag: 'wx', mode: 0o600 });
  else if (readFileSync(file, 'utf8') !== serialized) throw new Error('Generated model catalog was changed; remove that catalog file and retry.');
  // Existing extension -c values remain at root; launcher routing/catalog wins last.
  // The IDE persists picker defaults via config/value/write. App-server does not
  // accept --profile, so those writes need an isolated native home, not the CLI home.
  const originalHome = resolve(cwd, env.CODEX_HOME || join(home, '.codex'));
  const sourceHash = createHash('sha256').update(originalHome).digest('hex').slice(0, 12);
  const codexHome = join(directory, 'vscode', `codex-home-${state.providerNamespace}-${sourceHash}`);
  mkdirSync(codexHome, { recursive: true });
  for (const name of ['config.toml', 'hooks.json', 'AGENTS.md', 'AGENTS.override.md']) {
    const target = join(codexHome, name), source = join(originalHome, name);
    if (existsSync(target)) continue;
    if (statSync(source, { throwIfNoEntry: false })?.isFile()) {
      try { writeFileSync(target, readFileSync(source), { flag: 'wx', mode: 0o600 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
  }
  const sourceRules = join(originalHome, 'rules');
  if (statSync(sourceRules, { throwIfNoEntry: false })?.isDirectory()) {
    const targetRules = join(codexHome, 'rules');
    mkdirSync(targetRules, { recursive: true });
    for (const name of readdirSync(sourceRules).filter(name => name.endsWith('.rules'))) {
      const source = join(sourceRules, name), target = join(targetRules, name);
      if (existsSync(target) || !statSync(source, { throwIfNoEntry: false })?.isFile()) continue;
      try { writeFileSync(target, readFileSync(source), { flag: 'wx', mode: 0o600 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
  }
  provider.env.CODEX_HOME = codexHome;
  Object.assign(provider.env, controlEnv);
  if (mcp.names.length) {
    const list = spawnSync(command, [...provider.args, 'mcp', 'list', '--json'], { cwd, env: provider.env, encoding: 'utf8', timeout: 15000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
    let existing;
    try { existing = JSON.parse(list.stdout); } catch { /* fail closed */ }
    if (list.error || list.status !== 0 || !Array.isArray(existing)) throw new Error('Cannot inspect native MCP names; no app-server was started.');
    if (existing.some(server => mcp.names.includes(server.name))) throw new Error('Native MCP name collides with codexing_<name>. Rename the additional MCP entry.');
  }
  const launch = [...args.slice(0, index), ...provider.args, ...mcp.args, ...hookArgs, '-c', 'cli_auth_credentials_store="file"', '-c', `model_catalog_json=${JSON.stringify(file)}`, ...args.slice(index)];
  return { command, args: launch, cwd, env: provider.env };
}
