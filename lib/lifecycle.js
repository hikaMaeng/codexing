import { constants } from 'node:os';

/** Supervise a direct child, preserving exit status and forwarding caught signals. */
export function superviseChild(child, { parent = process, terminal = Boolean(process.stdin.isTTY), graceMs = 2000 } = {}) {
  return new Promise((resolve, reject) => {
    let timer, stopping = false;
    const handlers = new Map();
    const clean = () => {
      clearTimeout(timer);
      for (const [signal, handler] of handlers) parent.removeListener(signal, handler);
      child.removeListener('error', failed);
      child.removeListener('exit', exited);
    };
    const kill = (signal) => {
      try { child.kill(signal); } catch (error) {
        if (error.code !== 'ESRCH') parent.stderr.write(`codexing: Could not forward ${signal} to Codex.\n`);
      }
    };
    const shutdown = (signal) => {
      if (signal === 'SIGINT' && terminal) return;
      if (stopping) return kill('SIGKILL');
      stopping = true;
      kill(signal);
      timer = setTimeout(() => kill('SIGKILL'), graceMs);
    };
    const failed = (error) => { clean(); reject(error); };
    const exited = (code, signal) => { clean(); resolve(code ?? 128 + (constants.signals[signal] ?? 1)); };
    for (const signal of ['SIGTERM', 'SIGHUP', 'SIGINT']) {
      const handler = () => shutdown(signal);
      handlers.set(signal, handler);
      parent.on(signal, handler);
    }
    child.once('error', failed);
    child.once('exit', exited);
  });
}
