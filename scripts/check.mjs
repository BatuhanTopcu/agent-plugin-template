import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import Ajv from 'ajv/dist/2020.js';
import { generatedFiles, root } from './build.mjs';
import { configure } from './configure.mjs';
import { expandMcpServers, loadResources, parseDocument } from '../lib/resources.mjs';

const readJson = async (path) => JSON.parse(await readFile(join(root, path), 'utf8'));
const resources = await loadResources(root);
const ajv = new Ajv({ strict: false });
for (const name of ['plugin', 'mcp']) {
  const validate = ajv.compile(await readJson(`schemas/${name}.schema.json`));
  assert(validate(await readJson(`${name}.json`)), `${name}.json: ${JSON.stringify(validate.errors)}`);
}
assert(resources.rules, 'Persistent rules cannot be empty');
assert.equal(new Set(resources.agents.map((agent) => agent.name)).size, resources.agents.length, 'Agent names must be unique');
for (const [path, expected] of await generatedFiles()) assert.equal(await readFile(join(root, path), 'utf8'), expected, `${path} is stale; run pnpm build`);
const pkg = await readJson('package.json');
for (const key of ['name', 'version', 'description', 'license']) assert.equal(pkg[key], resources.manifest[key], `package.json ${key} is stale`);
for (const name of await readdir(join(root, 'skills'))) {
  const { metadata, body } = parseDocument(await readFile(join(root, 'skills', name, 'SKILL.md'), 'utf8'));
  assert.equal(metadata.name, name);
  assert(typeof metadata.description === 'string' && metadata.description.length && body);
  for (const match of body.matchAll(/\]\((references\/[^)]+)\)/g)) {
    const path = resolve(root, 'skills', name, match[1]);
    assert(!relative(join(root, 'skills', name), path).startsWith('..'), 'Skill reference escapes its skill');
    assert((await readFile(path, 'utf8')).length, `Empty skill reference: ${path}`);
  }
}
for (const harness of ['claude', 'cursor']) {
  const manifest = await readJson(`.${harness}-plugin/plugin.json`);
  const paths = ['skills', 'agents', 'hooks', 'rules', 'outputStyles', 'workflows', 'lspServers'];
  for (const key of paths) if (manifest[key]) {
    for (const path of Array.isArray(manifest[key]) ? manifest[key] : [manifest[key]]) {
      assert(path.startsWith('./') && !path.split('/').includes('..'), `Invalid ${harness} component path ${path}`);
      await readdir(join(root, path)).catch(async (error) => { if (error.code !== 'ENOTDIR') throw error; await readFile(join(root, path)); });
    }
  }
}
assert.throws(() => expandMcpServers(root, { example: { type: 'stdio', command: 'node', env: { MISSING: '${AGENT_PLUGIN_MISSING_CHECK_VAR}' } } }), /not set/);
assert.throws(() => expandMcpServers(root, { example: { type: 'stdio', command: '${PLUGIN_ROOT}/server.mjs' } }), /bare executable/);
const relativeServer = expandMcpServers(root, { example: { type: 'stdio', command: './scripts/hook.mjs', cwd: './scripts' } }).example;
assert.equal(relativeServer.command, join(root, 'scripts/hook.mjs'));
assert.equal(relativeServer.cwd, join(root, 'scripts'));
assert.equal(expandMcpServers(root, { example: { type: 'stdio', command: 'node' } }).example.cwd, resolve(root));
assert.throws(() => expandMcpServers(root, { example: { type: 'stdio', command: './../../../outside' } }), /escapes its root/);
for (const section of Object.values(resources.features)) for (const flag of Object.values(section)) assert.equal(typeof flag, 'boolean', 'Feature flags must be boolean');
const formatter = execFileSync(process.execPath, [join(root, 'harnesses/claude/status-line.mjs')], { encoding: 'utf8', input: JSON.stringify({ columns: 40, tasks: [{ id: 'one', name: 'reviewer\n', status: 'running', tokenCount: 100, contextWindowSize: 10000 }] }) });
const row = JSON.parse(formatter);
assert.equal(row.id, 'one');
assert(row.content.includes('1% context') && !row.content.includes('\n') && row.content.length <= 40);
const allFeatures = Object.fromEntries(Object.entries(resources.features).map(([harness, flags]) => [harness, Object.fromEntries(Object.keys(flags).map((flag) => [flag, true]))]));
const optionalFiles = await generatedFiles(allFeatures);
const optionalClaude = JSON.parse(optionalFiles.get('.claude-plugin/plugin.json'));
const statusOutput = execFileSync(optionalClaude.settings.subagentStatusLine.command, { shell: true, encoding: 'utf8', input: JSON.stringify({ tasks: [{ id: 'quoted', name: 'reviewer', status: 'running' }] }) });
assert.equal(JSON.parse(statusOutput).id, 'quoted', 'Generated status-line shell quoting must work');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
// Native workflows permit exported metadata and a top-level return inside their async runtime.
new AsyncFunction(optionalFiles.get('harnesses/claude/workflows/review-scope.js').replace('export const meta', 'const meta'));
assert(optionalClaude.experimental.evals && optionalClaude.channels.length && optionalClaude.mcpServers[0] === './.mcp.json');

const temporary = await mkdtemp(join(tmpdir(), 'agent-plugin-check-'));
try {
  const hook = (harness, phase, event, env = {}) => JSON.parse(execFileSync(process.execPath, [join(root, 'scripts/hook.mjs'), harness, phase], {
    input: JSON.stringify(event), encoding: 'utf8', env: { ...process.env, AGENT_PLUGIN_AUDIT_FILE: '', ...env },
  }));
  for (const harness of ['codex', 'claude', 'cursor']) {
    const result = hook(harness, 'session', {});
    assert((harness === 'cursor' ? result.additional_context : result.hookSpecificOutput.additionalContext).includes(resources.rules));
    hook(harness, 'before', { tool_name: 'Read', tool_input: { secret: 'never-log' } }, { AGENT_PLUGIN_AUDIT_FILE: join(temporary, 'audit.jsonl') });
    hook(harness, 'after', { tool_name: 'Read', tool_response: 'never-log' }, { AGENT_PLUGIN_AUDIT_FILE: join(temporary, 'audit.jsonl') });
  }
  const audit = await readFile(join(temporary, 'audit.jsonl'), 'utf8');
  assert.equal(audit.trim().split('\n').length, 6);
  assert(!audit.includes('never-log'), 'Audit must omit tool input/output');
  await configure('codex', temporary);
  await configure('codex', temporary);
  const agentPath = join(temporary, '.codex/agents', `${resources.manifest.name}-${resources.agents[0].name}.toml`);
  await writeFile(agentPath, 'user customization');
  await assert.rejects(configure('codex', temporary), /Refusing to overwrite/);
  assert.equal(await readFile(agentPath, 'utf8'), 'user customization');
  await writeFile(join(temporary, 'opencode.json'), JSON.stringify({ model: 'existing/model', plugins: ['existing-plugin'] }));
  await configure('opencode', temporary);
  await configure('opencode', temporary);
  const config = JSON.parse(await readFile(join(temporary, 'opencode.json'), 'utf8'));
  assert.equal(config.model, 'existing/model');
  assert.deepEqual(config.plugins, ['existing-plugin', join(root, 'harnesses/opencode')]);
  await writeFile(join(temporary, 'opencode.jsonc'), '{ /* preserve */ }');
  await assert.rejects(configure('opencode', temporary), /Merge these entries/);
  assert.equal(await readFile(join(temporary, 'opencode.jsonc'), 'utf8'), '{ /* preserve */ }');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
execFileSync(join(root, 'node_modules/.bin/tsc'), ['--noEmit'], { cwd: root, stdio: 'inherit' });
for (const harness of ['pi', 'opencode']) execFileSync(process.execPath, [join(root, `harnesses/${harness}/check.mjs`)], { cwd: root, stdio: 'inherit' });
console.log('Validated portable schemas, generated packages, skill references, hooks, safe installation, and current SDK adapters.');
