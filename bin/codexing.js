#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { initConfig, readJson } from '../lib/config.js';
import { selectModel } from '../lib/models.js';
import { findCodex } from '../lib/executable.js';
import { parseArgs, validateArgs } from '../lib/arguments.js';
import { makeProvider } from '../lib/provider.js';
import { makeMcp } from '../lib/mcp.js';
import { superviseChild } from '../lib/lifecycle.js';
import { setupVSCode } from '../lib/vscode-setup.js';

const configDir = join(homedir(), '.codexing');
const configPath = join(configDir, 'config.json');
const mcpPath = join(configDir, 'mcp.json');

/** Launch the installed CLI with child-only overrides and the original terminal. */
async function main(argv) {
  if (argv[0] === '/vscode') return setupVSCode(argv.slice(1));
  const parsed = parseArgs(argv);
  if (parsed.action === 'help') {
    console.log(`Codexing — launch your installed Codex CLI with a local/self-hosted Responses API.

Usage: codexing [--select-model <index|model-id>] [folder] [--] [Codex options]
       codexing --init [base-url model-id]
       codexing /vscode [--select-model <index|id> | --openai | --off | --status]

Config: ${configPath}
Optional MCP: ${mcpPath}
Codex help: codexing -- --help
Non-interactive: codexing -- exec "Summarize this repository"
First plain argument is a folder; use -- before a native subcommand or prompt.
Codex >=0.163.0 and Node >=22 required. No default approval/sandbox bypass.
Docs: https://github.com/hikaMaeng/codexing`);
    return;
  }
  if (parsed.action === 'init') {
    const created = initConfig(configPath, parsed.args);
    console.log(`${created ? 'Created' : 'Already exists; preserved'}: ${configPath}`);
    return;
  }
  const native = validateArgs(parsed.args);
  if (!statSync(parsed.cwd, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`Folder not found: ${parsed.cwd}`);
  if (!existsSync(configPath)) throw new Error(`Configuration not found: ${configPath}. Run codexing --init first.`);
  const config = await selectModel(readJson(configPath), parsed.selector);
  const provider = makeProvider(config);
  const mcp = existsSync(mcpPath) ? makeMcp(readJson(mcpPath)) : { args: [], names: [] };
  const executable = findCodex();
  const options = { cwd: parsed.cwd, env: provider.env, encoding: 'utf8', timeout: 15000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 };
  const version = spawnSync(executable.command, [...executable.prefix, '--version'], options);
  const match = version.stdout?.match(/codex-cli (\d+)\.(\d+)\.(\d+)/);
  if (version.error || version.status !== 0 || !match || (Number(match[1]) === 0 && Number(match[2]) < 163)) throw new Error('Codex >=0.163.0 is required; could not verify the installed CLI. Run codex --version.');
  if (mcp.names.length) {
    // Native list loads effective user/project config without starting MCP servers.
    const list = spawnSync(executable.command, [...executable.prefix, ...provider.args, ...native.configArgs, 'mcp', 'list', '--json'], options);
    let servers;
    try { servers = JSON.parse(list.stdout); } catch { throw new Error('Could not inspect native MCP configuration for name collisions (details hidden).'); }
    if (list.error || list.status !== 0 || !Array.isArray(servers)) throw new Error('Could not inspect native MCP configuration for name collisions (details hidden).');
    if (servers.some((server) => mcp.names.includes(server.name))) throw new Error('An existing native MCP server uses a reserved codexing_ name. Rename it or the Codexing entry; no server was replaced.');
  }
  const child = spawn(executable.command, [...executable.prefix, '--no-daemon', ...provider.args, ...mcp.args, ...native.configArgs, ...native.args], { cwd: parsed.cwd, env: provider.env, stdio: 'inherit' });
  process.exitCode = await superviseChild(child);
}

try { await main(process.argv.slice(2)); } catch (error) {
  console.error(`codexing: ${error.message}`);
  process.exitCode = 1;
}
