import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { superviseChild } from '../lib/lifecycle.js';

function fixture() {
  const child = new EventEmitter(), parent = new EventEmitter();
  parent.stderr = { write() {} };
  child.signals = [];
  child.kill = (signal) => { child.signals.push(signal); return true; };
  return { child, parent };
}

test('caught signals forward, escalate and clean handlers; numeric exits survive', async () => {
  const { child, parent } = fixture();
  const result = superviseChild(child, { parent, terminal: false, graceMs: 10 });
  parent.emit('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(child.signals, ['SIGTERM', 'SIGKILL']);
  child.emit('exit', 37, null);
  assert.equal(await result, 37);
  assert.equal(parent.listenerCount('SIGTERM'), 0);
});

test('terminal Ctrl+C avoids duplicate signaling; spawn errors clean up', async () => {
  const a = fixture();
  const result = superviseChild(a.child, { parent: a.parent, terminal: true });
  a.parent.emit('SIGINT');
  assert.deepEqual(a.child.signals, []);
  a.child.emit('exit', 0, null);
  assert.equal(await result, 0);
  const b = fixture(), failure = superviseChild(b.child, { parent: b.parent });
  b.child.emit('error', new Error('failed'));
  await assert.rejects(failure, /failed/);
  assert.equal(b.parent.listenerCount('SIGTERM'), 0);
});

test('real child exit is reaped and preserved', { timeout: 5000 }, async () => {
  const child = spawn(process.execPath, ['-e', 'process.exit(23)'], { stdio: 'ignore' });
  assert.equal(await superviseChild(child), 23);
});

test('POSIX parent-only shutdown reaps its direct child', { skip: process.platform === 'win32', timeout: 5000 }, async () => {
  const module = new URL('../lib/lifecycle.js', import.meta.url).href;
  const script = `import {spawn} from 'node:child_process'; import {superviseChild} from ${JSON.stringify(module)}; const c=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>process.exit(37));console.log('ready');setInterval(()=>{},1000)"],{stdio:['ignore','pipe','inherit']});c.stdout.once('data',()=>console.log('ready'));process.exitCode=await superviseChild(c,{terminal:false});`;
  const parent = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'inherit'] });
  await once(parent.stdout, 'data');
  parent.kill('SIGTERM');
  const [code] = await once(parent, 'exit');
  assert.equal(code, 37);
});
