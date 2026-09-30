import { fileURLToPath } from "node:url";
import type { Plugin } from "@opencode/plugin/tui";
import { loadResources } from "../../lib/resources.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const resources = await loadResources(root);

export default {
  id: resources.manifest.name,
  setup(ctx) {
    if (!resources.features.opencode.ui) return;

    ctx.keymap.layer(() => ({
      commands: [
        {
          id: `${resources.manifest.name}.status`,
          title: `${resources.manifest.name}: show plugin resources`,
          description: "Show the shared instructions, subagents, and MCP registrations.",
          group: "Plugins",
          palette: true,
          async run() {
            await ctx.ui.dialog.alert({
              title: resources.manifest.name,
              message: [
                `Version: ${resources.manifest.version}`,
                `Shared rules: ${resources.rules ? "loaded" : "none"}`,
                `Subagents: ${resources.agents.map((agent) => agent.name).join(", ") || "none"}`,
                `MCP servers: ${Object.keys(resources.mcpServers).join(", ") || "none"}`,
                `Source: ${root}`,
              ].join("\n"),
            });
          },
        },
      ],
    }));
  },
} satisfies Plugin.Definition;
