import { execFile } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);
const { name } = JSON.parse(await readFile(new URL("../../plugin.json", import.meta.url), "utf8"));
const launchDirectory = await realpath(process.cwd());
const options = {
  cwd: launchDirectory,
  env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  encoding: "utf8",
  timeout: 5000,
  maxBuffer: 1024 * 1024,
};

let repository;
try {
  repository = (await run("git", ["rev-parse", "--show-toplevel"], options)).stdout.trim();
} catch {
  console.error(`${name}: working-tree monitor requires a Git repository at the session's launch directory.`);
  process.exit(1);
}

let previous;
let timer;
async function poll() {
  try {
    const currentRepository = (await run("git", ["rev-parse", "--show-toplevel"], options)).stdout.trim();
    if (currentRepository !== repository) throw new Error("The launch directory no longer belongs to the original repository.");
    const status = (await run("git", ["status", "--porcelain=v1", "--untracked-files=no"], options)).stdout;
    if (status !== previous) {
      const count = status.trimEnd() ? status.trimEnd().split("\n").length : 0;
      console.log(`${name}: ${count} tracked path(s) changed in ${repository}`);
      previous = status;
    }
    if (!process.argv.includes("--once")) timer = setTimeout(poll, 10000);
  } catch (error) {
    console.error(`${name}: working-tree monitor stopped: ${error.message}`);
    process.exitCode = 1;
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    clearTimeout(timer);
    process.exit(0);
  });
}
await poll();
