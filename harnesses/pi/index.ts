import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { expandMcpServers, loadResources } from "../../lib/resources.mjs";
import { afterTool, beforeTool, sessionContext } from "../../lib/hooks.mjs";
import { delegate, stopDelegations } from "./delegate.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));

export default async function (pi: ExtensionAPI) {
  const resources = await loadResources(root);
  const key = `plugin_${resources.manifest.name.replace(/[^a-z0-9_-]/g, "_")}`;
  const servers = expandMcpServers(root, resources.mcpServers);
  let previousTheme: ExtensionContext["ui"]["theme"] | undefined;

  for (const [name, server] of Object.entries(servers)) {
    const serverName = `${resources.manifest.name}:${name}`;
    if ("command" in server) {
      pi.registerMcpServer(serverName, { ...server, type: "stdio" });
    } else {
      pi.registerMcpServer(serverName, { ...server, type: "http" });
    }
  }

  pi.on("before_agent_start", async (event) => {
    event.systemPromptOptions.sections[key] = await sessionContext(root);
  });

  pi.on("tool_call", async (event) => {
    await beforeTool({
      harness: "pi",
      tool_name: event.toolName,
      tool_input: event.input,
      tool_use_id: event.toolCallId,
    });
  });

  pi.on("tool_result", async (event) => {
    await afterTool({
      harness: "pi",
      tool_name: event.toolName,
      tool_input: event.input,
      tool_use_id: event.toolCallId,
      tool_response: event.structuredContent ?? event.content,
      status: event.isError ? "error" : "completed",
      is_error: event.isError,
    });
  });

  pi.registerCommand("delegate", {
    description: "Run a bundled agent in a separate Pi session: /delegate <agent> <task>",
    getArgumentCompletions(prefix) {
      return resources.agents
        .filter((agent) => agent.name.startsWith(prefix))
        .map((agent) => ({ value: agent.name, label: agent.name, description: agent.description }));
    },
    async handler(args, ctx) {
      const [name, ...words] = args.trim().split(/\s+/);
      const task = words.join(" ");
      const agent = resources.agents.find((item) => item.name === name);
      if (!agent || !task) {
        pi.sendMessage({
          customType: `${key}_delegate`,
          content: `Usage: /delegate <agent> <task>\n\nAvailable agents:\n${resources.agents
            .map((item) => `- ${item.name}: ${item.description}`)
            .join("\n")}`,
          display: true,
        });
        return;
      }

      await ctx.waitForIdle();
      if (resources.features.pi.ui && ctx.mode === "tui") {
        ctx.ui.setStatus(key, `Running ${agent.name}`);
      }
      try {
        const answer = await delegate(agent, task, ctx);
        pi.sendMessage({
          customType: `${key}_delegate`,
          content: `Agent ${agent.name}\n\n${answer}`,
          display: true,
          details: { agent: agent.name, task },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        pi.sendMessage({
          customType: `${key}_delegate`,
          content: `Agent ${agent.name} failed: ${message}`,
          display: true,
          details: { agent: agent.name, task, error: message },
        });
      } finally {
        if (resources.features.pi.ui && ctx.mode === "tui") {
          ctx.ui.setStatus(key, resources.manifest.name);
        }
      }
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    if (resources.features.pi.theme) {
      const theme = ctx.ui.getTheme("agent-plugin");
      if (!theme) throw new Error("Bundled Pi theme agent-plugin was not discovered");
      previousTheme = ctx.ui.theme;
      const result = ctx.ui.setTheme(theme);
      if (!result.success) throw new Error(result.error);
    }
    if (resources.features.pi.ui) {
      ctx.ui.setStatus(key, resources.manifest.name);
      ctx.ui.setWidget(key, [
        `${resources.manifest.name} · ${Object.keys(resources.mcpServers).length} MCP servers`,
        `/delegate ${resources.agents.map((agent) => agent.name).join(" | ")} <task>`,
      ]);
    }
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    stopDelegations();
    if (previousTheme && ctx.mode === "tui") {
      ctx.ui.setTheme(previousTheme);
      previousTheme = undefined;
    }
    if (resources.features.pi.ui && ctx.mode === "tui") {
      ctx.ui.setStatus(key, undefined);
      ctx.ui.setWidget(key, undefined);
    }
  });
}
