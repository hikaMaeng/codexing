import { fileURLToPath } from 'node:url';
import { toml } from './provider.js';
import { switchVSCodeMode } from './vscode-setup.js';

/** Static executable paths only. The submitted prompt is never part of a command. */
export function vscodeHookArgs() {
  const entry = fileURLToPath(new URL('../bin/codexing-vscode-hook.js', import.meta.url));
  const posix = value => `'${value.replaceAll("'", "'\\''")}'`;
  const windows = value => {
    if (/["\r\n%$`&|<>^();]/.test(value)) throw new Error('Unsupported character in hook executable path.');
    return `"${value}"`;
  };
  const quote = process.platform === 'win32' ? windows : posix;
  // Windows uses a pinned PATH and disables cmd's current-directory search in
  // the adapter environment. A bare command avoids shell-specific leading-path
  // quote rules; the submitted prompt never enters this static command string.
  const command = `${process.platform === 'win32' ? 'node' : quote(process.execPath)} ${quote(entry)}`;
  return ['-c', `hooks.UserPromptSubmit=${toml([{ hooks: [{ type: 'command', command, timeout: 60, statusMessage: 'Checking Codexing mode command' }] }])}`];
}

/** Only exact, explicitly submitted commands in an adapter-marked process can mutate state. */
export async function handleVSCodePrompt(input, env = process.env) {
  if (input?.hook_event_name !== 'UserPromptSubmit' ||
      !env.CODEXING_VSCODE_CONTROL_HOME || !env.CODEXING_VSCODE_CONTROL_NAMESPACE) return {};
  const mode = new Map([['codexing /vscode on', 'on'], ['codexing /vscode off', 'off']]).get(input.prompt);
  if (!mode) return {};
  try {
    const reason = await switchVSCodeMode(mode, { home: env.CODEXING_VSCODE_CONTROL_HOME,
      namespace: env.CODEXING_VSCODE_CONTROL_NAMESPACE });
    return { decision: 'block', reason };
  } catch (error) {
    return { decision: 'block', reason: `Codexing switch failed: ${error.message} This command was not sent to the model.` };
  }
}
