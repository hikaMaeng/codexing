import { toml } from './provider.js';

/** Convert a constrained native-shaped MCP document into namespaced CLI overrides. */
export function makeMcp(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config) || Object.keys(config).some((key) => key !== 'mcpServers') || !config.mcpServers || typeof config.mcpServers !== 'object' || Array.isArray(config.mcpServers)) throw new Error('mcp.json needs {"mcpServers": {"name": {native Codex fields}}}.');
  const args = [], names = [];
  for (const [name, server] of Object.entries(config.mcpServers)) {
    if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new Error('MCP names may contain letters, numbers, _ and - only.');
    if (!server || typeof server !== 'object' || Array.isArray(server)) throw new Error('Each MCP server must be an object.');
    const allowed = ['command', 'args', 'cwd', 'env_vars', 'url', 'bearer_token_env_var', 'env_http_headers', 'enabled', 'required', 'startup_timeout_sec', 'tool_timeout_sec', 'enabled_tools', 'disabled_tools'];
    if (Object.keys(server).some((key) => !allowed.includes(key))) throw new Error('Unsupported MCP field. Use native env_vars/bearer_token_env_var/env_http_headers references instead of inline env, headers or tokens.');
    if (Boolean(server.command) === Boolean(server.url)) throw new Error('Each MCP server needs exactly one command (stdio) or url (Streamable HTTP).');
    for (const key of ['command', 'cwd', 'url', 'bearer_token_env_var']) if (server[key] !== undefined && (typeof server[key] !== 'string' || !server[key].trim() || /[\u0000-\u001f\u007f]/.test(server[key]))) throw new Error(`Invalid MCP ${key}.`);
    for (const key of ['args', 'env_vars', 'enabled_tools', 'disabled_tools']) if (server[key] !== undefined && (!Array.isArray(server[key]) || server[key].some((v) => typeof v !== 'string' || /[\u0000-\u001f\u007f]/.test(v)))) throw new Error(`MCP ${key} must be a string array.`);
    for (const key of ['enabled', 'required']) if (server[key] !== undefined && typeof server[key] !== 'boolean') throw new Error(`MCP ${key} must be boolean.`);
    for (const key of ['startup_timeout_sec', 'tool_timeout_sec']) if (server[key] !== undefined && (!Number.isFinite(server[key]) || server[key] <= 0)) throw new Error(`MCP ${key} must be positive.`);
    if (server.url) {
      const url = URL.canParse(server.url) ? new URL(server.url) : undefined;
      if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('MCP url must be HTTP(S) without credentials, query or fragment.');
      if (['args', 'cwd', 'env_vars'].some((key) => server[key] !== undefined)) throw new Error('stdio fields cannot be used with MCP url.');
    } else if (['bearer_token_env_var', 'env_http_headers'].some((key) => server[key] !== undefined)) throw new Error('HTTP fields cannot be used with MCP command.');
    if (server.env_http_headers !== undefined && (!server.env_http_headers || typeof server.env_http_headers !== 'object' || Array.isArray(server.env_http_headers) || Object.entries(server.env_http_headers).some(([k, v]) => !/^[A-Za-z0-9-]+$/.test(k) || typeof v !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(v)))) throw new Error('MCP env_http_headers must map header names to environment variable names.');
    if (server.env_vars?.some((name) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) || (server.bearer_token_env_var !== undefined && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(server.bearer_token_env_var))) throw new Error('MCP environment references must use environment variable names.');
    const id = `codexing_${name}`;
    names.push(id);
    args.push('-c', `mcp_servers.${id}=${toml(server)}`);
  }
  return { args, names };
}
