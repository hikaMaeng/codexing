import assert from 'node:assert/strict';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateModel, normalizeEndpoint, readJson, initConfig } from '../lib/config.js';
import { selectModel } from '../lib/models.js';
import { fixture, defaultModel } from './helpers.js';

test('strict model validation rejects invalid fields, token/URL leaks and control characters', () => {
  for (const change of [{ baseUrl: 'file:///x' }, { baseUrl: 'http://user:secret@host/v1' }, { baseUrl: 'https://host/v1?key=secret' }, { baseUrl: 'https://host/#secret' }, { model: '\n' }, { contextTokens: 0 }, { contextTokens: null }, { authToken: '' }, { authToken: '\r\nsecret' }, { extra: 1 }]) assert.throws(() => validateModel({ ...defaultModel, ...change }));
  assert.equal(normalizeEndpoint(' http://localhost:1234/v1/ '), 'http://localhost:1234/v1');
  assert.equal(normalizeEndpoint('http://localhost:1234'), 'http://localhost:1234');
});

test('single, wrapped, index, unique ID, ambiguous ID and non-TTY selection', async () => {
  const second = { ...defaultModel, baseUrl: 'http://other/v1', model: 'other' };
  assert.equal(await selectModel(defaultModel), defaultModel);
  assert.equal(await selectModel({ models: [defaultModel, second] }, '2'), second);
  assert.equal(await selectModel({ models: [defaultModel, second] }, 'other'), second);
  await assert.rejects(selectModel({ models: [defaultModel, second] }, '0'));
  await assert.rejects(selectModel({ models: [defaultModel, { ...second, model: defaultModel.model }] }, defaultModel.model), /Duplicate/);
  await assert.rejects(selectModel({ models: [defaultModel, second] }, undefined, { isTTY: false }), /select-model/);
  for (const value of [null, [], { models: [] }, { models: [defaultModel], model: 'ambiguous' }, { models: [defaultModel, {}] }]) await assert.rejects(selectModel(value));
});

test('interactive menu selects an index and hides tokens', async () => {
  const input = new PassThrough(), output = new PassThrough();
  input.isTTY = output.isTTY = true;
  let text = '';
  output.on('data', (chunk) => { text += chunk; });
  const second = { ...defaultModel, model: 'second' };
  const selection = selectModel({ models: [defaultModel, second] }, undefined, input, output);
  input.write('2\n');
  assert.equal(await selection, second);
  assert.match(text, /Configured models/);
  assert.ok(!text.includes(defaultModel.authToken));
});

test('init preserves existing bytes and accepts a UTF-8 BOM', () => {
  const f = fixture();
  const file = join(f.home, '.codexing', 'config.json');
  const original = '\ufeff' + JSON.stringify({ models: [defaultModel] }, null, 3);
  writeFileSync(file, original);
  assert.equal(f.run(['--init']).status, 0);
  assert.equal(readFileSync(file, 'utf8'), original);
  assert.deepEqual(readJson(file), { models: [defaultModel] });
  writeFileSync(file, '{ secret-token: broken }');
  const result = f.run();
  assert.equal(result.status, 1);
  assert.ok(!result.stderr.includes('secret-token'));
});

test('fresh init validates before writing and creates an exclusive default file', () => {
  const f = fixture(), file = join(f.root, 'new', 'config.json');
  assert.throws(() => initConfig(file, ['bad-url', 'x']));
  assert.equal(initConfig(file, []), true);
  assert.deepEqual(readJson(file), { baseUrl: 'http://127.0.0.1:1234/v1', model: 'openai/gpt-oss-20b' });
});
