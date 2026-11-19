import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readOptional, findExtension, vscodeModels } from './vscode.js';
import { editSetting, parseSettings } from './jsonc.js';

const setting = 'chatgpt.cliExecutable';
const bytes = file => existsSync(file) ? readFileSync(file) : null;
const hash = value => createHash('sha256').update(value).digest('hex');

/** Replace one file after checking the pre-edit snapshot; preserve all unrelated bytes. */
export function replaceChecked(file, content, original) {
  mkdirSync(dirname(file), { recursive: true });
  const staged = file + `.codexing-${randomUUID()}.tmp`;
  try {
    if (content !== null) writeFileSync(staged, content, { flag: 'wx', mode: 0o600 });
    const current = bytes(file);
    if (original === null ? current !== null : current === null || !current.equals(original)) throw new Error('Settings changed during setup; no replacement was made. Retry after reviewing the saved backup.');
    if (content === null) { if (current !== null) unlinkSync(file); }
    else renameSync(staged, file);
  } finally { if (existsSync(staged)) unlinkSync(staged); }
}

/** Commit a small registration transaction; rollback only bytes still owned by this write. */
export function commitRegistration(changes, replace = replaceChecked) {
  const completed = [];
  try {
    for (const change of changes) {
      if (change.before === null && change.after === null || change.before !== null && change.after !== null && change.before.equals(change.after)) continue;
      replace(change.file, change.after, change.before);
      completed.push(change);
    }
  } catch (error) {
    const failures = [];
    for (const change of completed.reverse()) {
      try { replaceChecked(change.file, change.before, change.after); } catch { failures.push(change.file); }
    }
    if (failures.length) throw new Error(`${error.message} Rollback preserved concurrent edits; review saved backups and registration state before retrying.`);
    throw new Error(`${error.message} Previous registration state was restored.`);
  }
}

/** Create a stdio-safe native Windows entrypoint or a POSIX exec shim. */
export function createVSCodeWrapper(directory, { node = process.execPath,
  entry = fileURLToPath(new URL('../bin/codexing-vscode.js', import.meta.url)) } = {}) {
  mkdirSync(directory, { recursive: true });
  if (process.platform !== 'win32') {
    const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
    const file = join(directory, 'codexing-vscode');
    writeFileSync(file, `#!/bin/sh\nexec ${quote(node)} ${quote(entry)} "$@"\n`, { mode: 0o700 });
    return file;
  }
  const template = readFileSync(new URL('./vscode-wrapper.cs', import.meta.url), 'utf8');
  const escape = value => value.replaceAll('"', '""');
  const source = template.replace('__CODEXING_NODE__', escape(node)).replace('__CODEXING_ENTRY__', escape(entry));
  const digest = hash(source).slice(0, 16);
  const output = join(directory, `codexing-vscode-${digest}.exe`);
  if (existsSync(output)) return output;
  const compiler = ['Framework64', 'Framework'].map(name => join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', name, 'v4.0.30319', 'csc.exe')).find(existsSync);
  if (!compiler) throw new Error('The Windows adapter requires the .NET Framework C# compiler (csc.exe).');
  const input = join(directory, `codexing-vscode-${digest}.cs`);
  writeFileSync(input, source, { mode: 0o600 });
  const result = spawnSync(compiler, ['/nologo', '/target:exe', '/optimize+', '/codepage:65001', `/out:${output}`, input], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  if (result.error || result.status !== 0) throw new Error('Cannot compile the VS Code process adapter; no VS Code settings were changed.');
  return output;
}

/** Resolve the local VS Code user-settings path; remote/WSL installs are explicit. */
export function defaultSettingsPath(home = homedir(), appData = process.env.APPDATA) {
  if (process.platform === 'win32') {
    if (!appData) throw new Error('APPDATA is unavailable; pass /vscode --settings <settings.json>.');
    return join(appData, 'Code', 'User', 'settings.json');
  }
  return process.platform === 'darwin' ? join(home, 'Library', 'Application Support', 'Code', 'User', 'settings.json') :
    join(process.env.XDG_CONFIG_HOME || join(home, '.config'), 'Code', 'User', 'settings.json');
}

/** Register/toggle/unregister the official extension's development executable setting. */
export async function setupVSCode(args, { home = homedir(), appData = process.env.APPDATA, replace = replaceChecked } = {}) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log('Usage: codexing /vscode [--select-model <index|id> | --openai | --off | --status] [--settings <settings.json>] [--extension <official-extension-directory>]\nSwitching applies to the next app-server. Reload the target VS Code window and start a new chat.');
    return;
  }
  let mode = 'codexing', selector, settingsPath, extensionPath, status = false;
  const modes = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--off' || arg === '--openai' || arg === '--on') { modes.push(arg); mode = arg === '--off' ? 'off' : arg === '--openai' ? 'openai' : 'codexing'; }
    else if (arg === '--status') status = true;
    else if (['--select-model', '--settings', '--extension'].includes(arg)) {
      const value = args[++i];
      if (!value || value.startsWith('-')) throw new Error(`Missing value after ${arg}.`);
      if (arg === '--select-model') selector = value;
      if (arg === '--settings') settingsPath = resolve(value);
      if (arg === '--extension') extensionPath = resolve(value);
    } else throw new Error('Usage: codexing /vscode [--select-model <index|id> | --openai | --off | --status] [--settings <file>] [--extension <directory>]');
  }
  if (modes.length > 1 || selector && mode !== 'codexing' || status && (modes.length || selector || extensionPath)) throw new Error('Choose one VS Code mode or --status.');
  const directory = join(home, '.codexing', 'vscode');
  const registrationFile = join(directory, 'registration.json');
  const oldRegistration = bytes(registrationFile);
  const registration = readOptional(registrationFile);
  const stateFile = join(home, '.codexing', 'vscode.json');
  const oldState = bytes(stateFile), state = readOptional(stateFile);
  if (status) {
    const file = settingsPath ?? registration.settingsFile;
    const current = file && existsSync(file) ? parseSettings(readFileSync(file, 'utf8')).value[setting] : undefined;
    console.log(`Registration: ${registration.active && current === registration.wrapper ? 'active' : 'not active'}\nMode for the next app-server: ${state.enabled ? 'Codexing' : 'original OpenAI'}\nModel selection: ${state.modelSelector ?? '1'}\nSettings: ${file ?? '(not registered)'}`);
    return;
  }
  settingsPath ??= registration.active ? registration.settingsFile : defaultSettingsPath(home, appData);
  const original = bytes(settingsPath), source = original?.toString('utf8') ?? '{}\n';
  const settings = parseSettings(source).value;
  if (registration.active && (registration.settingsFile !== settingsPath || settings[setting] !== registration.wrapper)) throw new Error('The registered VS Code setting was changed elsewhere. No settings were replaced; review registration.json and its backup.');
  if (mode === 'off') {
    if (!registration.active) throw new Error('No active Codexing VS Code registration was found.');
    let restored;
    if (registration.exactRestore && hash(original) === registration.installedHash) restored = registration.originalExisted ? readFileSync(registration.backup) : null;
    else restored = Buffer.from(editSetting(source, setting, registration.previous.value, !registration.previous.present), 'utf8');
    commitRegistration([
      { file: stateFile, before: oldState, after: Buffer.from(JSON.stringify({ ...state, enabled: false }, null, 2) + '\n') },
      { file: settingsPath, before: original, after: restored },
      { file: registrationFile, before: oldRegistration, after: Buffer.from(JSON.stringify({ ...registration, active: false }, null, 2) + '\n') },
    ], replace);
    console.log('Codexing registration removed; the previous cliExecutable setting was restored. Reload the target VS Code window.');
    return;
  }
  let group;
  if (process.platform === 'win32' && settings['chatgpt.runCodexInWindowsSubsystemForLinux'] === true) throw new Error('This registration targets local Windows VS Code. Existing WSL mode was preserved; configure the integration inside the intended execution host instead.');
  if (mode === 'codexing') group = await vscodeModels(home, selector ?? state.modelSelector);
  const explicitExtension = extensionPath !== undefined || registration.active && state.extensionExplicit === true;
  const extension = findExtension({ home, extensionPath: extensionPath ?? (explicitExtension ? state.extensionPath : undefined) });
  const wrapper = createVSCodeWrapper(directory);
  mkdirSync(join(directory, 'backups'), { recursive: true });
  const backup = join(directory, 'backups', `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.json`);
  if (original !== null) writeFileSync(backup, original, { flag: 'wx', mode: 0o600 });
  const newState = { enabled: mode === 'codexing', modelSelector: group?.selector ?? state.modelSelector ?? '1',
    nativeExecutable: extension.command, extensionPath: extension.root, extensionExplicit: explicitExtension, extensionVersion: extension.version,
    providerNamespace: /^[a-f0-9]{32}$/.test(state.providerNamespace ?? '') ? state.providerNamespace : randomUUID().replaceAll('-', '') };
  const updated = Buffer.from(editSetting(source, setting, wrapper), 'utf8');
  const nextRegistration = registration.active ? { ...registration, installedHash: hash(updated), exactRestore: registration.exactRestore && hash(original) === registration.installedHash } : {
    active: true, settingsFile: settingsPath, wrapper, originalExisted: original !== null, backup,
    previous: Object.hasOwn(settings, setting) ? { present: true, value: settings[setting] } : { present: false }, installedHash: hash(updated), exactRestore: true,
  };
  // The first backup remains the exact-byte restoration source across mode changes.
  if (registration.active) nextRegistration.wrapper = wrapper;
  commitRegistration([
    { file: stateFile, before: oldState, after: Buffer.from(JSON.stringify(newState, null, 2) + '\n') },
    { file: settingsPath, before: original, after: updated },
    { file: registrationFile, before: oldRegistration, after: Buffer.from(JSON.stringify(nextRegistration, null, 2) + '\n') },
  ], replace);
  console.log(`Official Codex extension registered (${extension.version}).\nNext process: ${newState.enabled ? 'Codexing' : 'original OpenAI'}${group ? `\nSelected model: ${group.selected.model.trim()}\nSame-connection picker models: ${group.models.map(entry => entry.model.trim()).join(', ')}` : ''}\nSettings: ${settingsPath}\nBackup: ${nextRegistration.backup}\nReload the target VS Code window and start a new chat. Existing app-server processes are not switched or stopped.`);
  return { wrapper, settingsFile: settingsPath, state: newState, backup: nextRegistration.backup };
}
