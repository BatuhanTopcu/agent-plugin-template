import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

export function parseDocument(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error('Markdown resource requires YAML frontmatter');
  return { metadata: parse(match[1]), body: match[2].trim() };
}

export async function loadResources(root) {
  root = resolve(root instanceof URL ? fileURLToPath(root) : root);
  const json = async (path) => JSON.parse(await readFile(join(root, path), 'utf8'));
  const [manifest, mcp, features, agentFiles, ruleFiles] = await Promise.all([
    json('plugin.json'), json('mcp.json'), json('features.json'),
    readdir(join(root, 'agents')), readdir(join(root, 'rules')),
  ]);
  const agents = await Promise.all(agentFiles.filter((file) => file.endsWith('.md')).sort().map(async (file) => {
    const { metadata, body } = parseDocument(await readFile(join(root, 'agents', file), 'utf8'));
    if (!/^[a-z][a-z0-9-]*$/.test(metadata?.name) || typeof metadata.description !== 'string' || !body) {
      throw new Error(`Invalid agent: ${file}`);
    }
    return { name: metadata.name, description: metadata.description, prompt: body };
  }));
  const rules = (await Promise.all(ruleFiles.filter((file) => file.endsWith('.md')).sort()
    .map((file) => readFile(join(root, 'rules', file), 'utf8')))).join('\n\n').trim();
  return { manifest, mcpServers: mcp.mcpServers, rules, agents, features };
}

export function expandMcpServers(root, servers) {
  root = resolve(root instanceof URL ? fileURLToPath(root) : root);
  const variables = {
    ...process.env,
    PLUGIN_ROOT: root,
    PLUGIN_DATA: process.env.PLUGIN_DATA ?? join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local/share'), 'agent-plugins', JSON.parse(readFileSync(join(root, 'plugin.json'), 'utf8')).name),
  };
  const expand = (value) => {
    if (typeof value === 'string') return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name) => {
      if (variables[name] === undefined) throw new Error(`MCP environment variable ${name} is not set`);
      return variables[name];
    });
    if (Array.isArray(value)) return value.map(expand);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expand(item)]));
    return value;
  };
  const contained = (base, target) => {
    const check = (from, to) => {
      const path = relative(from, to);
      if (path === '..' || path.startsWith('../') || path.startsWith('..\\') || isAbsolute(path)) throw new Error(`MCP path escapes its root: ${target}`);
    };
    check(base, target);
    if (existsSync(base) && existsSync(target)) check(realpathSync(base), realpathSync(target));
    return target;
  };
  return Object.fromEntries(Object.entries(servers).map(([name, server]) => {
    if (server.type === 'streamable-http') {
      if (JSON.stringify(server).includes('${')) throw new Error(`Portable HTTP server ${name} must use literal URL/headers; configure authenticated headers natively`);
      return [name, server];
    }
    if (server.type !== 'stdio') throw new Error(`Unsupported MCP transport ${server.type}; use stdio or streamable-http`);
    if (!server.command || server.command.includes('${') || (!server.command.startsWith('./') && /[\\/\s]/.test(server.command))) throw new Error(`MCP command must be a bare executable or ./plugin-relative path: ${server.command}`);
    const result = expand(server);
    if (server.command.startsWith('./')) result.command = contained(root, resolve(root, server.command));
    const base = server.cwd?.startsWith('${PLUGIN_DATA}') ? variables.PLUGIN_DATA : root;
    result.cwd = contained(base, resolve(root, result.cwd ?? root));
    result.env = { ...result.env, PLUGIN_ROOT: variables.PLUGIN_ROOT, PLUGIN_DATA: variables.PLUGIN_DATA };
    return [name, result];
  }));
}
