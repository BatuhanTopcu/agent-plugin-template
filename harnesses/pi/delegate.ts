import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

const children = new Set<ChildProcess>();

export function stopDelegations() {
  for (const child of children) child.kill("SIGTERM");
}

export async function delegate(
  agent: { name: string; prompt: string },
  task: string,
  ctx: ExtensionCommandContext,
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "agent-plugin-pi-"));
  try {
    const prompt = join(directory, "agent.md");
    await writeFile(prompt, agent.prompt, { mode: 0o600 });
    const args = ["--print", "--no-session", "--append-system-prompt", prompt];
    if (ctx.model) args.push("--model", `${ctx.model.provider}/${ctx.model.id}`);
    if (ctx.thinkingLevel) args.push("--thinking", ctx.thinkingLevel);
    args.push(`Task: ${task}`);

    // Reuse the running harness, including its selected Node runtime. npm Pi
    // runs a CLI script; a standalone Pi executable accepts the arguments itself.
    if (/^(node|bun)(\.exe)?$/i.test(basename(process.execPath))) {
      const entry = process.argv[1];
      if (!entry || entry.startsWith("/$bunfs/")) {
        throw new Error("Cannot find the running Pi CLI entry point.");
      }
      args.unshift(entry);
    }

    return await new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, args, {
        cwd: ctx.cwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        signal: ctx.signal,
      });
      children.add(child);
      let output = "";
      let errors = "";
      child.stdout!.setEncoding("utf8").on("data", (chunk: string) => { output += chunk; });
      child.stderr!.setEncoding("utf8").on("data", (chunk: string) => { errors += chunk; });
      child.once("error", reject);
      child.once("close", (code, signal) => {
        children.delete(child);
        if (code === 0) {
          resolve(output.trim() || "The agent completed without a text response.");
        } else {
          reject(new Error(errors.trim() || `Pi exited with ${signal ?? `status ${code}`}.`));
        }
      });
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
