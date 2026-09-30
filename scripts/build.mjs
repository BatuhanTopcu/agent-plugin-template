import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadResources } from '../lib/resources.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
const json = (value) => JSON.stringify(value, null, 2) + '\n';

function nativeMcp(servers, harness) {
  const variables = (value) => {
    if (typeof value === 'string') return value.replaceAll('${PLUGIN_ROOT}', harness === 'cursor' ? '${CURSOR_PLUGIN_ROOT}' : '${CLAUDE_PLUGIN_ROOT}').replaceAll('${PLUGIN_DATA}', '${CLAUDE_PLUGIN_DATA}');
    if (Array.isArray(value)) return value.map(variables);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, variables(item)]));
    return value;
  };
  return Object.fromEntries(Object.entries(servers).map(([name, server]) => {
    if (harness === 'cursor' && JSON.stringify(server).includes('${PLUGIN_DATA}')) throw new Error('Cursor has no PLUGIN_DATA expansion; configure a concrete data path in mcp.json');
    const native = variables(server);
    if (native.type === 'streamable-http') native.type = 'http';
    if (native.type === 'stdio') {
      const pluginRoot = harness === 'cursor' ? '${CURSOR_PLUGIN_ROOT}' : '${CLAUDE_PLUGIN_ROOT}';
      if (native.command.startsWith('./')) native.command = `${pluginRoot}/${native.command.slice(2)}`;
      native.cwd = native.cwd?.startsWith('./') ? `${pluginRoot}/${native.cwd.slice(2)}` : native.cwd ?? pluginRoot;
      native.env = { ...native.env, PLUGIN_ROOT: pluginRoot, ...(harness === 'claude' && { PLUGIN_DATA: '${CLAUDE_PLUGIN_DATA}' }) };
    }
    return [name, native];
  }));
}

export async function generatedFiles(featureOverrides) {
  const { manifest, mcpServers, rules, agents, features: configuredFeatures } = await loadResources(root);
  const features = featureOverrides ?? configuredFeatures;
  const { name, version, description, author, license } = manifest;
  const catalog = `${name}-marketplace`;
  const files = new Map();
  const put = (path, value) => files.set(path, typeof value === 'string' ? value : json(value));
  put('.agents/plugins/marketplace.json', {
    name: catalog, interface: { displayName: `${name} plugins` },
    plugins: [{ name, source: { source: 'local', path: './' }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' }],
  });
  put('.claude-plugin/marketplace.json', { name: catalog, owner: author, metadata: { description }, plugins: [{ name, source: '.' }] });
  const claude = { name, version, description, author, license, skills: ['./skills/'], agents: agents.map((agent) => `./harnesses/claude/agents/${agent.name}.md`), hooks: './harnesses/claude/hooks.json', mcpServers: './.mcp.json' };
  if (features.claude.outputStyles) claude.outputStyles = './harnesses/claude/output-styles/';
  if (features.claude.lsp) claude.lspServers = './harnesses/claude/lsp.json';
  if (features.claude.workflows) claude.workflows = './harnesses/claude/workflows/';
  if (features.claude.themes || features.claude.monitors || features.claude.evals) claude.experimental = {
    ...(features.claude.themes && { themes: './harnesses/claude/themes/' }),
    ...(features.claude.monitors && { monitors: './harnesses/claude/monitors.json' }),
    ...(features.claude.evals && { evals: './harnesses/claude/evals/' }),
  };
  if (features.claude.mainAgent || features.claude.statusLine) {
    claude.settings = {};
    if (features.claude.mainAgent) Object.assign(claude.settings, JSON.parse(await readFile(join(root, 'harnesses/claude/settings-main-agent.json'), 'utf8')));
    if (features.claude.statusLine) {
      const source = await readFile(join(root, 'harnesses/claude/status-line.mjs'), 'utf8');
      claude.settings.subagentStatusLine = { type: 'command', command: `node --input-type=module -e '${source.replaceAll("'", "'\\''")}'` };
    }
  }
  if (features.claude.channels) {
    const channel = JSON.parse(await readFile(join(root, 'harnesses/claude/channels.json'), 'utf8'));
    Object.assign(claude, channel, { mcpServers: ['./.mcp.json', channel.mcpServers] });
  }
  put('.claude-plugin/plugin.json', claude);
  put('.mcp.json', { mcpServers: nativeMcp(mcpServers, 'claude') });
  const cursor = {
    name, version, description, author, license, displayName: name,
    skills: './skills/', agents: './harnesses/cursor/agents/', rules: './harnesses/cursor/rules/',
    hooks: './harnesses/cursor/hooks.json', mcpServers: './harnesses/cursor/mcp.json',
  };
  const variables = JSON.parse(await readFile(join(root, 'harnesses/cursor/variables.json'), 'utf8'));
  if (Object.keys(variables.properties).length) cursor.variables = variables;
  put('.cursor-plugin/plugin.json', cursor);
  put('harnesses/cursor/mcp.json', { mcpServers: nativeMcp(mcpServers, 'cursor') });
  put('harnesses/cursor/rules/engineering.mdc', `---\ndescription: Persistent engineering rules\nalwaysApply: true\n---\n\n${rules}\n`);
  for (const agent of agents) {
    put(`harnesses/codex/agents/${agent.name}.toml`, `# Generated by pnpm build. Edit agents/${agent.name}.md.\nname = ${JSON.stringify(`${name}-${agent.name}`)}\ndescription = ${JSON.stringify(agent.description)}\ndeveloper_instructions = ${JSON.stringify(`${rules}\n\n${agent.prompt}`)}\n`);
    for (const harness of ['claude', 'cursor']) put(`harnesses/${harness}/agents/${agent.name}.md`, `---\nname: ${agent.name}\ndescription: ${JSON.stringify(agent.description)}\n---\n\n${rules}\n\n${agent.prompt}\n`);
  }
  for (const harness of ['codex', 'claude']) {
    const variable = harness === 'codex' ? 'PLUGIN_ROOT' : 'CLAUDE_PLUGIN_ROOT';
    const hook = (phase) => [{ hooks: [{ type: 'command', command: `node "\${${variable}}/scripts/hook.mjs" ${harness} ${phase}`, timeout: 10 }] }];
    put(`harnesses/${harness}/hooks.json`, { hooks: { SessionStart: hook('session'), PreToolUse: hook('before'), PostToolUse: hook('after') } });
  }
  const cursorHook = (phase) => [{ command: `node "\${CURSOR_PLUGIN_ROOT}/scripts/hook.mjs" cursor ${phase}` }];
  put('harnesses/cursor/hooks.json', { version: 1, hooks: {
    sessionStart: cursorHook('session'), preToolUse: cursorHook('before'), postToolUse: cursorHook('after'), postToolUseFailure: cursorHook('failure'),
  } });
  if (features.claude.executables) put(`bin/${name}-info`, await readFile(join(root, 'harnesses/claude/bin/example-agent-plugin-info'), 'utf8'));
  if (features.claude.workflows) put('harnesses/claude/workflows/review-scope.js', (await readFile(join(root, 'harnesses/claude/workflows-source/review-scope.js'), 'utf8')).replaceAll('__PLUGIN_NAME__', name));
  return files;
}

export async function build() {
  const resources = await loadResources(root);
  const files = await generatedFiles();
  const pkgPath = join(root, 'package.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
  Object.assign(pkg, { name: resources.manifest.name, version: resources.manifest.version, description: resources.manifest.description, license: resources.manifest.license });
  await writeFile(pkgPath, json(pkg));
  // These directories contain generated files only; removing them also removes renamed agents.
  for (const path of ['harnesses/codex/agents', 'harnesses/claude/agents', 'harnesses/cursor/agents', 'harnesses/cursor/rules', 'harnesses/claude/workflows', 'bin']) await rm(join(root, path), { recursive: true, force: true });
  for (const [path, value] of files) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), value);
    if (path.startsWith('bin/')) await chmod(join(root, path), 0o755);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await build();
  console.log('Built native plugin manifests, catalogs, agents, MCP configurations, rules, and hooks.');
}
