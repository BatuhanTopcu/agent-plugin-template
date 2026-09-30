import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { load, resolve } from '@opencode/plugin/host';
import { parseThemeDocument } from '@opencode/theme/tui';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = {
  manifest: { name: 'fixture-plugin', version: '0.1.0' },
  rules: 'Respect the shared engineering rules.',
  agents: [{ name: 'reviewer', description: 'Review the change.', prompt: 'Find actionable issues.' }],
  mcpServers: {
    local: { type: 'stdio', command: 'node', args: ['server.mjs'], env: { MODE: 'safe' }, cwd: '/fixture' },
    remote: { type: 'streamable-http', url: 'https://example.invalid/mcp', headers: { Authorization: 'fixture' } },
  },
  features: { opencode: { ui: false, theme: false } },
};
const moduleUrl = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
const resourcesUrl = moduleUrl(`
  export const resources = ${JSON.stringify(fixture)};
  export async function loadResources(root) {
    if (root !== ${JSON.stringify(root)}) throw new Error('Adapter resolved the wrong plugin root');
    return resources;
  }
  export function expandMcpServers(root, servers) {
    if (root !== ${JSON.stringify(root)}) throw new Error('Adapter expanded the wrong plugin root');
    return servers;
  }
`);
const hooksUrl = moduleUrl(`
  export const events = [];
  export async function sessionContext() { return ${JSON.stringify(fixture.rules)}; }
  export async function beforeTool(event) { events.push({ phase: 'before', ...event }); }
  export async function afterTool(event) { events.push({ phase: 'after', ...event }); }
`);
const resourcesPath = new URL('../../lib/resources.mjs', import.meta.url).href;
const hooksPath = new URL('../../lib/hooks.mjs', import.meta.url).href;
const imports = registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    if (resolved.url === resourcesPath) return { ...resolved, url: resourcesUrl };
    if (resolved.url === hooksPath) return { ...resolved, url: hooksUrl };
    return resolved;
  },
});

try {
  const entrypoints = resolve({ directory: fileURLToPath(new URL('./', import.meta.url)) });
  assert.equal(entrypoints.server, new URL('./index.ts', import.meta.url).href);
  assert.equal(entrypoints.tui, new URL('./tui.ts', import.meta.url).href);
  const [{ default: plugin }, { default: tui }, { resources }, { events }] = await Promise.all([
    load(entrypoints.server), load(entrypoints.tui), import(resourcesUrl), import(hooksUrl),
  ]);
  const servers = new Map();
  const agents = new Map();
  const sessionHooks = new Map();
  const toolHooks = new Map();
  await plugin.setup({
    mcp: { transform: async (run) => run({ set: (name, server) => servers.set(name, server) }) },
    agent: {
      transform: async (run) => run({
        update(name, update) {
          const agent = {};
          update(agent);
          agents.set(name, agent);
        },
      }),
    },
    session: { hook: async (name, run) => sessionHooks.set(name, run) },
    tool: { hook: async (name, run) => toolHooks.set(name, run) },
  });
  assert.equal(plugin.id, fixture.manifest.name);
  assert.deepEqual(servers.get('fixture-plugin:local'), {
    type: 'local', command: ['node', 'server.mjs'], environment: { MODE: 'safe' }, cwd: '/fixture',
  });
  assert.deepEqual(servers.get('fixture-plugin:remote'), {
    type: 'remote', url: fixture.mcpServers.remote.url, headers: fixture.mcpServers.remote.headers,
  });
  assert.deepEqual(agents.get('fixture-plugin:reviewer'), {
    description: fixture.agents[0].description,
    system: `${fixture.rules}\n\n${fixture.agents[0].prompt}`,
    mode: 'subagent',
  });
  const context = { system: [{ type: 'text', text: 'Host instructions.' }] };
  await sessionHooks.get('context')(context);
  assert.deepEqual(context.system, [
    { type: 'text', text: 'Host instructions.' }, { type: 'text', text: fixture.rules },
  ]);
  await toolHooks.get('execute.before')({ tool: 'read', input: { secret: 'excluded' } });
  await toolHooks.get('execute.after')({ tool: 'read', status: 'completed', result: 'excluded' });
  await toolHooks.get('execute.after')({ tool: 'write', status: 'error', error: 'excluded' });
  assert.deepEqual(events, [
    { phase: 'before', harness: 'opencode', tool_name: 'read' },
    { phase: 'after', harness: 'opencode', tool_name: 'read', status: 'completed' },
    { phase: 'after', harness: 'opencode', tool_name: 'write', status: 'error' },
  ]);

  const layers = [];
  const dialogs = [];
  const ui = {
    keymap: { layer: (layer) => layers.push(layer()) },
    ui: { dialog: { alert: async (dialog) => dialogs.push(dialog) } },
  };
  tui.setup(ui);
  assert.equal(layers.length, 0);
  resources.features.opencode.ui = true;
  tui.setup(ui);
  assert.equal(layers.length, 1);
  const [command] = layers[0].commands;
  assert.equal(command.palette, true);
  assert.equal(command.slash, undefined);
  await command.run();
  assert.match(dialogs[0].message, /Subagents: reviewer/);
  assert.match(dialogs[0].message, /MCP servers: local, remote/);
  assert.ok(!dialogs[0].message.includes('Authorization'));

  const theme = JSON.parse(await readFile(new URL('./themes/example-agent-plugin.json', import.meta.url), 'utf8'));
  parseThemeDocument(theme, 'example-agent-plugin');
  console.log('OpenCode adapter: native TS import, MCP transports, subagent rules, context, redacted hooks, optional UI, and V2 theme passed.');
} finally {
  imports.deregister();
}
