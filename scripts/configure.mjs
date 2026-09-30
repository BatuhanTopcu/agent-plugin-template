#!/usr/bin/env node
import { access, copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const exists = async (path) => access(path).then(() => true, (error) => { if (error.code === 'ENOENT') return false; throw error; });

export async function configure(harness, project) {
  const manifest = JSON.parse(await readFile(join(root, 'plugin.json'), 'utf8'));
  const features = JSON.parse(await readFile(join(root, 'features.json'), 'utf8'));
  project = resolve(project);
  if (harness === 'codex') {
    const destination = join(project, '.codex/agents');
    const agents = (await readdir(join(root, 'harnesses/codex/agents'))).filter((file) => file.endsWith('.toml'));
    const files = await Promise.all(agents.map(async (file) => ({
      target: join(destination, `${manifest.name}-${file}`),
      content: await readFile(join(root, 'harnesses/codex/agents', file), 'utf8'),
    })));
    for (const { target, content } of files) {
      if (await exists(target) && await readFile(target, 'utf8') !== content) throw new Error(`Refusing to overwrite ${target}. Review and remove the previous plugin agent before installing its replacement.`);
    }
    await mkdir(destination, { recursive: true });
    for (const { target, content } of files) if (!await exists(target)) await writeFile(target, content, { flag: 'wx' });
    return `Installed ${files.length} Codex agents in ${destination}.`;
  }
  if (harness !== 'opencode') throw new Error('Supported project configuration targets: codex, opencode');
  const path = join(project, 'opencode.json');
  const addition = { plugins: [join(root, 'harnesses/opencode')], skills: [join(root, 'skills')] };
  if (await exists(join(project, 'opencode.jsonc'))) throw new Error(`This project uses opencode.jsonc. Merge these entries into that file manually:\n${JSON.stringify(addition, null, 2)}`);
  const config = await exists(path) ? JSON.parse(await readFile(path, 'utf8')) : {};
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('OpenCode configuration must be a JSON object');
  for (const key of ['plugins', 'skills']) {
    if (config[key] !== undefined && (!Array.isArray(config[key]) || !config[key].every((item) => typeof item === 'string'))) throw new Error(`Existing ${key} must be an array of strings`);
    config[key] = [...new Set([...(config[key] ?? []), ...addition[key]])];
  }
  await mkdir(project, { recursive: true });
  if (features.opencode.theme) {
    const themeDir = join(project, '.opencode/themes');
    const target = join(themeDir, `${manifest.name}.json`);
    const source = join(root, 'harnesses/opencode/themes/example-agent-plugin.json');
    const installed = await exists(target);
    if (installed && await readFile(target, 'utf8') !== await readFile(source, 'utf8')) throw new Error(`Refusing to overwrite theme: ${target}`);
    await mkdir(themeDir, { recursive: true });
    if (!installed) await copyFile(source, target, constants.COPYFILE_EXCL);
  }
  await writeFile(path, JSON.stringify(config, null, 2) + '\n');
  return `Configured OpenCode V2 in ${path}. Keep the plugin checkout at ${root}.`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { project: { type: 'string' } } });
  if (positionals.length !== 1 || !values.project) throw new Error('Usage: node scripts/configure.mjs <codex|opencode> --project /absolute/project');
  console.log(await configure(positionals[0], values.project));
}
