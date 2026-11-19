import { randomUUID } from 'node:crypto';
import { normalizeEndpoint } from './config.js';

/** Serialize the JSON subset supported by TOML inline values; never use a shell. */
export function toml(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return String(value);
  if (Array.isArray(value)) return `[${value.map(toml).join(', ')}]`;
  if (value && typeof value === 'object') return `{ ${Object.entries(value).map(([k, v]) => `${toml(k)} = ${toml(v)}`).join(', ')} }`;
  throw new Error('Unsupported TOML value.');
}

/** Build child-only routing; unique provider IDs prevent merging stored auth fields. */
export function makeProvider(config, source = process.env, providerId) {
  const env = { ...source };
  for (const key of Object.keys(env)) {
    if (['OPENAI_BASE_URL', 'CODEX_API_KEY'].includes(key.toUpperCase()) && env[key]) {
      throw new Error(`Unset conflicting ${key.toUpperCase()} before running Codexing (value hidden).`);
    }
    if (['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'CODEX_API_KEY', 'CODEXING_AUTH_TOKEN'].includes(key.toUpperCase())) delete env[key];
  }
  const id = providerId ?? `codexing_${randomUUID().replaceAll('-', '')}`;
  if (!/^codexing_[a-z0-9_]+$/.test(id)) throw new Error('Invalid Codexing provider ID.');
  const provider = { name: 'Codexing', base_url: normalizeEndpoint(config.baseUrl), wire_api: 'responses', requires_openai_auth: false, supports_websockets: false };
  if (config.authToken !== undefined) {
    provider.env_key = 'CODEXING_AUTH_TOKEN';
    env.CODEXING_AUTH_TOKEN = config.authToken.trim();
  }
  const settings = { [`model_providers.${id}`]: provider, model_provider: id, model: config.model.trim(), review_model: config.model.trim() };
  if (config.contextTokens !== undefined) settings.model_context_window = config.contextTokens;
  return { env, args: Object.entries(settings).flatMap(([key, value]) => ['-c', `${key}=${toml(value)}`]) };
}
