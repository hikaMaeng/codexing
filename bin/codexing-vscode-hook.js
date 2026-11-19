#!/usr/bin/env node
import { handleVSCodePrompt } from '../lib/vscode-hook.js';

try {
  const chunks = [];
  let size = 0;
  let input;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 8 * 1024 * 1024) throw new Error('Hook input exceeds 8 MiB.');
    chunks.push(chunk);
    // Some app-server versions keep stdin open until the hook exits. Consume
    // one complete JSON event rather than waiting for EOF after that event.
    try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { continue; }
    break;
  }
  if (input === undefined) throw new Error('Expected one complete JSON hook event.');
  process.stdout.write(JSON.stringify(await handleVSCodePrompt(input)) + '\n');
} catch (error) {
  process.stderr.write(`Codexing hook input error: ${error.message}\n`);
  process.exitCode = 1;
}
