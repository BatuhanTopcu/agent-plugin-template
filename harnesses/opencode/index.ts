import { fileURLToPath } from "node:url";
import type { Plugin, Mcp } from "@opencode/plugin";
import { expandMcpServers, loadResources, type McpServer } from "../../lib/resources.mjs";
import { afterTool, beforeTool, sessionContext } from "../../lib/hooks.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const resources = await loadResources(root);
const servers = expandMcpServers(root, resources.mcpServers);

function mcpConfig(server: McpServer): Mcp.ServerConfig {
  switch (server.type) {
    case "stdio":
      return {
        type: "local",
        command: [server.command, ...(server.args ?? [])],
        ...(server.env ? { environment: server.env } : {}),
        ...(server.cwd ? { cwd: server.cwd } : {}),
      };
    case "streamable-http":
      return {
        type: "remote",
        url: server.url,
        ...(server.headers ? { headers: server.headers } : {}),
      };
    default:
      throw new Error("OpenCode adapter requires an stdio or streamable-http MCP server.");
  }
}

export default {
  id: resources.manifest.name,
  async setup(ctx) {
    await ctx.mcp.transform((editor) => {
      for (const [name, server] of Object.entries(servers)) {
        editor.set(`${resources.manifest.name}:${name}`, mcpConfig(server));
      }
    });

    await ctx.agent.transform((editor) => {
      for (const agent of resources.agents) {
        editor.update(`${resources.manifest.name}:${agent.name}`, (entry) => {
          entry.description = agent.description;
          entry.system = [resources.rules, agent.prompt].filter(Boolean).join("\n\n");
          entry.mode = "subagent";
        });
      }
    });

    await ctx.session.hook("context", async (event) => {
      const context = await sessionContext(root);
      if (context) event.system.push({ type: "text", text: context });
    });

    await ctx.tool.hook("execute.before", async (event) => {
      await beforeTool({
        harness: "opencode",
        tool_name: event.tool,
      });
    });

    await ctx.tool.hook("execute.after", async (event) => {
      await afterTool({
        harness: "opencode",
        tool_name: event.tool,
        status: event.status,
      });
    });
  },
} satisfies Plugin.Plugin;
