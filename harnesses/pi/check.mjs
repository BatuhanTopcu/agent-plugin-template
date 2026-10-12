import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import adapter from './index.ts';
import { delegate } from './delegate.ts';
import { expandMcpServers, loadResources } from '../../lib/resources.mjs';

// The delegated child runs this same entry point as a harmless CLI fixture.
if (process.argv.includes('--print')) {
  assert(process.argv.includes('--no-session'));
  const prompt = process.argv[process.argv.indexOf('--append-system-prompt') + 1];
  assert.equal(await readFile(prompt, 'utf8'), 'Scoped agent role');
  assert.equal(process.argv[process.argv.indexOf('--model') + 1], 'provider/model');
  assert.equal(process.argv[process.argv.indexOf('--thinking') + 1], 'medium');
  if (process.argv.at(-1) === 'Task: fail') {
    console.error('Expected child failure');
    process.exitCode = 7;
  } else {
    console.log('Delegated response');
  }
} else {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const resources = await loadResources(root);
  // Secrets referenced by mcp.json are not needed for this smoke check; scripts/check.mjs tests the missing-variable error.
  for (const [, name] of JSON.stringify(resources.mcpServers).matchAll(/\$\{(\w+)\}/g)) {
    if (name !== 'PLUGIN_ROOT' && name !== 'PLUGIN_DATA') process.env[name] ??= 'pnpm-check-placeholder';
  }
  const servers = new Map();
  const handlers = new Map();
  const commands = new Map();
  const messages = [];
  await adapter({
    registerMcpServer: (name, server) => servers.set(name, server),
    on: (name, handler) => handlers.set(name, handler),
    registerCommand: (name, command) => commands.set(name, command),
    sendMessage: (message) => messages.push(message),
    registerTool: () => assert.fail('The template must not register model tools'),
  });

  const expected = expandMcpServers(root, resources.mcpServers);
  assert.equal(servers.size, Object.keys(expected).length);
  for (const [name, server] of Object.entries(expected)) {
    assert.deepEqual(servers.get(`${resources.manifest.name}:${name}`), {
      ...server, type: 'command' in server ? 'stdio' : 'http',
    });
  }
  const start = { systemPromptOptions: { sections: { existing: 'Keep existing context' } } };
  await handlers.get('before_agent_start')(start);
  assert.equal(start.systemPromptOptions.sections.existing, 'Keep existing context');
  assert(Object.values(start.systemPromptOptions.sections).some((text) => text.includes(resources.rules)));

  const directory = await mkdtemp(join(tmpdir(), 'agent-plugin-pi-check-'));
  const previousAudit = process.env.AGENT_PLUGIN_AUDIT_FILE;
  try {
    const audit = join(directory, 'audit.jsonl');
    process.env.AGENT_PLUGIN_AUDIT_FILE = audit;
    await handlers.get('tool_call')({ toolName: 'mcp_example', input: {}, toolCallId: 'call-1' });
    await handlers.get('tool_result')({ toolName: 'mcp_example', input: {}, toolCallId: 'call-1', content: [], isError: false });
    const entries = (await readFile(audit, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.deepEqual(entries.map(({ phase, harness, tool, status }) => ({ phase, harness, tool, status })), [
      { phase: 'before', harness: 'pi', tool: 'mcp_example', status: undefined },
      { phase: 'after', harness: 'pi', tool: 'mcp_example', status: 'completed' },
    ]);

    const previousTheme = {};
    const bundledTheme = {};
    const appliedThemes = [];
    const ctx = {
      cwd: process.cwd(), mode: 'tui',
      model: { provider: 'provider', id: 'model' }, thinkingLevel: 'medium', signal: undefined,
      waitForIdle: async () => {},
      ui: {
        theme: previousTheme,
        getTheme: () => bundledTheme,
        setTheme: (theme) => { appliedThemes.push(theme); return { success: true }; },
        setStatus: () => {}, setWidget: () => {},
      },
    };
    await handlers.get('session_start')({}, ctx);
    await commands.get('delegate').handler('', ctx);
    assert(messages.at(-1).content.includes('Usage: /delegate'));
    const agent = { name: 'reviewer', prompt: 'Scoped agent role' };
    assert.equal(await delegate(agent, 'review', ctx), 'Delegated response');
    await assert.rejects(delegate(agent, 'fail', ctx), /Expected child failure/);
    await handlers.get('session_shutdown')({}, ctx);
    if (resources.features.pi.theme) assert.deepEqual(appliedThemes, [bundledTheme, previousTheme]);
    else assert.equal(appliedThemes.length, 0);
  } finally {
    if (previousAudit === undefined) delete process.env.AGENT_PLUGIN_AUDIT_FILE;
    else process.env.AGENT_PLUGIN_AUDIT_FILE = previousAudit;
    await rm(directory, { recursive: true, force: true });
  }
  console.log('Pi adapter MCP/rules/hooks/delegation smoke passed');
}
