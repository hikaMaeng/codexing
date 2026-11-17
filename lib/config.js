import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Read UTF-8 JSON, accepting a PowerShell UTF-8 BOM without echoing file contents. */
export function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    throw new Error(`Cannot read valid UTF-8 JSON: ${file}`);
  }
}

/** Create a config exclusively; an existing file is never replaced. */
export function initConfig(file, args) {
  if (args.length !== 0 && args.length !== 2) throw new Error('Usage: codexing --init [base-url model-id]');
  const [baseUrl = 'http://127.0.0.1:1234/v1', model = 'openai/gpt-oss-20b'] = args;
  const config = { baseUrl, model };
  validateModel(config);
  mkdirSync(dirname(file), { recursive: true });
  try {
    writeFileSync(file, JSON.stringify(config, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
}

/** Validate only the supported model schema and reject credential-bearing URLs. */
export function validateModel(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Each model must be an object.');
  if (Object.keys(value).some((key) => !['baseUrl', 'model', 'contextTokens', 'authToken'].includes(key))) {
    throw new Error('Model fields: baseUrl, model, contextTokens, authToken only.');
  }
  if (typeof value.baseUrl !== 'string' || !URL.canParse(value.baseUrl.trim())) throw new Error('baseUrl must be an absolute HTTP(S) API base URL.');
  const url = new URL(value.baseUrl.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || /[\u0000-\u0020\u007f]/.test(value.baseUrl.trim())) {
    throw new Error('baseUrl must use HTTP(S), with no credentials, query, fragment, or whitespace.');
  }
  if (typeof value.model !== 'string' || !value.model.trim() || /[\u0000-\u001f\u007f]/.test(value.model)) throw new Error('model must be a non-empty model ID without control characters.');
  if (value.contextTokens !== undefined && (!Number.isSafeInteger(value.contextTokens) || value.contextTokens < 1)) throw new Error('contextTokens must be a positive safe integer.');
  if (value.authToken !== undefined && (typeof value.authToken !== 'string' || !value.authToken.trim() || /[^\x20-\x7e]/.test(value.authToken))) throw new Error('authToken must be a non-empty printable ASCII token; omit it for an unauthenticated server.');
}

/** Normalize the API base without guessing or appending a /v1 path. */
export function normalizeEndpoint(value) {
  return new URL(value.trim()).toString().replace(/\/+$/, '');
}
