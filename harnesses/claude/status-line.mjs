let input = "";
for await (const chunk of process.stdin) input += chunk;
const event = input.trim() ? JSON.parse(input) : {};
const columns = Number.isInteger(event.columns) ? Math.max(1, Math.min(300, event.columns)) : 80;
const clean = (value) => String(value ?? "").replace(/[\x00-\x1f\x7f]/g, " ");

for (const task of event.tasks ?? []) {
  if (typeof task.id !== "string") continue;
  const tokens = Number.isFinite(task.tokenCount) ? Math.max(0, Math.round(task.tokenCount)) : undefined;
  const capacity = Number.isFinite(task.contextWindowSize) && task.contextWindowSize > 0 ? task.contextWindowSize : undefined;
  const usage = tokens === undefined ? "" : capacity ? ` · ${Math.round(tokens / capacity * 100)}% context` : ` · ${tokens} tokens`;
  const content = `${clean(task.name ?? task.type ?? "agent")} · ${clean(task.status ?? "running")}${usage}`;
  console.log(JSON.stringify({ id: task.id, content: content.slice(0, columns) }));
}
