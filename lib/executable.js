import { accessSync, constants, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, join, resolve, sep } from 'node:path';
import { readJson } from './config.js';

/** Locate official native/npm Codex in PATH order, without executing shell shims. */
export function findCodex({ platform = process.platform, env = process.env } = {}) {
  const dirs = (env.PATH ?? env.Path ?? '').split(platform === 'win32' ? ';' : delimiter).map((s) => s.replace(/^"|"$/g, '')).filter(Boolean);
  for (const dir of dirs) {
    const binary = join(dir, platform === 'win32' ? 'codex.exe' : 'codex');
    if (statSync(binary, { throwIfNoEntry: false })?.isFile()) {
      try { accessSync(binary, constants.X_OK); return { command: binary, prefix: [] }; } catch { /* next PATH entry */ }
    }
    if (platform !== 'win32' || !statSync(join(dir, 'codex.cmd'), { throwIfNoEntry: false })?.isFile()) continue;
    const root = join(dir, 'node_modules', '@openai', 'codex');
    const manifest = join(root, 'package.json');
    if (!statSync(manifest, { throwIfNoEntry: false })?.isFile()) continue;
    const pkg = readJson(manifest);
    const entry = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.codex;
    if (pkg.name !== '@openai/codex' || typeof entry !== 'string') continue;
    const file = resolve(root, entry);
    if (!file.startsWith(resolve(root) + sep) || !statSync(file, { throwIfNoEntry: false })?.isFile()) continue;
    // Resolve the native optional package to avoid an extra signal-forwarding process.
    const target = { x64: 'x86_64', arm64: 'aarch64' }[process.arch];
    if (target) {
      const relative = join('vendor', `${target}-pc-windows-msvc`, 'bin', 'codex.exe');
      const require = createRequire(manifest);
      let native;
      try { native = join(require.resolve(`@openai/codex-win32-${process.arch}/package.json`), '..', relative); } catch { native = join(root, relative); }
      if (statSync(native, { throwIfNoEntry: false })?.isFile()) return { command: native, prefix: [] };
    }
    if (/\.[cm]?js$/i.test(file)) return { command: process.execPath, prefix: [file] };
    if (/\.exe$/i.test(file)) return { command: file, prefix: [] };
  }
  throw new Error('Codex CLI was not found on PATH. Install the official Codex CLI first: npm install -g @openai/codex');
}
