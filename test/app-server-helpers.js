import { spawn } from 'node:child_process';
import { once } from 'node:events';

/** Exercise the native JSONL protocol without rewriting service/auth responses. */
export function appServer(command, args, options = {}) {
  const child = spawn(command, args, { ...options, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let sequence = 0, buffer = '', stderr = '', closing;
  const pending = new Map(), notifications = [];
  const listeners = new Set();
  child.stdout.on('data', data => {
    buffer += data;
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      if (message.id !== undefined && pending.has(message.id)) {
        const waiter = pending.get(message.id); pending.delete(message.id);
        message.error ? waiter.reject(new Error(JSON.stringify(message.error))) : waiter.resolve(message.result);
      } else {
        notifications.push(message);
        for (const notify of listeners) notify(message);
      }
    }
  });
  child.stderr.on('data', data => { stderr = (stderr + data).slice(-5000); });
  child.on('exit', () => { for (const waiter of pending.values()) waiter.reject(new Error('app-server exited: ' + stderr.slice(-1200))); pending.clear(); });
  return {
    child, notifications,
    rpc(method, params = {}, timeout = 20000) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('app-server request timed out: ' + method + '\n' + stderr.slice(-1200))); }, timeout);
        pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
        child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
      });
    },
    notify(method, params = {}) { child.stdin.write(JSON.stringify({ method, params }) + '\n'); },
    wait(method, timeout = 20000) {
      const existing = notifications.find(message => message.method === method);
      if (existing) return Promise.resolve(existing.params);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { listeners.delete(listener); reject(new Error('Notification timeout: ' + method + '\n' + stderr.slice(-1200))); }, timeout);
        const listener = message => { if (message.method === method) { clearTimeout(timer); listeners.delete(listener); resolve(message.params); } };
        listeners.add(listener);
      });
    },
    close() {
      // Signal exits have exitCode=null. Reusing the same close promise also
      // makes the test's final cleanup safe after an explicit provider switch.
      closing ??= (async () => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        const exited = once(child, 'exit');
        child.stdin.end();
        const timer = setTimeout(() => child.kill(), 2000);
        try { await exited; } finally { clearTimeout(timer); }
      })();
      return closing;
    },
  };
}
