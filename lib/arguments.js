import { resolve } from 'node:path';

/** Parse the launcher prefix; a leading -- removes folder interpretation. */
export function parseArgs(input, cwd = process.cwd()) {
  let args = [...input];
  if (args[0] === '--help' || args[0] === '-h') return { action: 'help' };
  if (args[0] === '--init') return { action: 'init', args: args.slice(1) };
  let selector;
  if (args[0] === '--select-model') {
    selector = args[1];
    if (!selector || selector.startsWith('-')) throw new Error('Use --select-model <index|model-id> before the folder.');
    args = args.slice(2);
  }
  if (args[0] && !args[0].startsWith('-')) cwd = resolve(cwd, args.shift());
  if (args[0] === '--') args.shift();
  return { action: 'run', cwd, selector, args };
}

/** Refuse routing conflicts, including quoted TOML keys and attached short flags. */
export function validateArgs(args) {
  const configArgs = [];
  const forwarded = [];
  let firstPositional;
  const valueFlags = new Set(['-p', '--profile', '-s', '--sandbox', '-a', '--ask-for-approval', '--enable', '--disable', '-o', '--output-last-message', '--output-schema', '--color', '-i', '--image', '--add-dir', '--thread-source', '--cyber-access-program']);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') { forwarded.push(...args.slice(i)); break; }
    if (/^--(?:model|oss|local-provider|remote|remote-auth-token-env|cd)(?:=|$)/.test(arg) || /^-[mC].*/.test(arg)) {
      throw new Error('Codex model/provider/remote/cwd overrides conflict with Codexing. Edit config.json or use its folder argument.');
    }
    let assignment;
    if (arg === '-c' || arg === '--config') {
      assignment = args[++i];
      if (!assignment) throw new Error('Missing key=value after Codex --config.');
    } else if (arg.startsWith('--config=')) assignment = arg.slice(9);
    else if (arg.startsWith('-c') && arg.length > 2) assignment = arg.slice(2);
    if (assignment !== undefined) {
      const key = assignment.slice(0, assignment.indexOf('=')).trim();
      if (!assignment.includes('=') || !/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(key)) throw new Error('Codex --config needs an unquoted dotted key=value.');
      if (/^(?:model|review_model|model_provider|model_providers|model_context_window|mcp_servers|profile|profiles|forced_login_method|forced_chatgpt_workspace_id|cli_auth_credentials_store|chatgpt_base_url|openai_base_url)(?:\.|$)/.test(key)) {
        throw new Error('This Codex --config key conflicts with launcher-owned routing/auth/MCP settings.');
      }
      configArgs.push('-c', assignment);
      continue;
    }
    if (arg === '-p' || arg === '--profile') {
      if (!args[i + 1] || args[i + 1].startsWith('-')) throw new Error('Missing Codex profile name.');
      configArgs.push(arg, args[++i]); continue;
    }
    if (arg.startsWith('--profile=') || (arg.startsWith('-p') && arg.length > 2)) { configArgs.push(arg); continue; }
    forwarded.push(arg);
    if (valueFlags.has(arg)) {
      if (args[i + 1] === undefined) throw new Error(`Missing value after ${arg}.`);
      forwarded.push(args[++i]); continue;
    }
    if (!arg.startsWith('-') && firstPositional === undefined) firstPositional = arg;
  }
  // Native management commands can change shared user state; invoke codex directly.
  const blocked = new Set(['login', 'logout', 'mcp', 'plugin', 'app', 'app-server', 'remote-control', 'agents', 'cloud', 'exec-server', 'update', 'features', 'doctor', 'debug', 'queue', 'archive', 'delete', 'unarchive', 'migrate-rollouts', 'completion', 'sandbox', 'apply']);
  if (blocked.has(firstPositional)) throw new Error('Use codex directly for management commands; Codexing launches coding sessions.');
  return { configArgs, args: forwarded };
}
