import { appendFile, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function sessionContext(root) {
  root = root instanceof URL ? fileURLToPath(root) : root;
  const manifest = JSON.parse(await readFile(join(root, 'plugin.json'), 'utf8'));
  const files = (await readdir(join(root, 'rules'))).filter((file) => file.endsWith('.md')).sort();
  const rules = (await Promise.all(files.map((file) => readFile(join(root, 'rules', file), 'utf8')))).join('\n\n').trim();
  return `Persistent rules from ${manifest.name}:\n\n${rules}`;
}

async function audit(phase, event) {
  if (!process.env.AGENT_PLUGIN_AUDIT_FILE) return;
  await appendFile(process.env.AGENT_PLUGIN_AUDIT_FILE, JSON.stringify({
    time: new Date().toISOString(), phase,
    harness: event.harness, tool: event.tool_name, status: event.status,
  }) + '\n', { mode: 0o600 });
}

export const beforeTool = (event) => audit('before', event);
export const afterTool = (event) => audit('after', event);
