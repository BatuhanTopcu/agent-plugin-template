# OpenCode V2 adapter

Use `@opencode/cli` 2.0.20 and `opencode2`. Point `opencode.json`'s `plugins` array at this directory and `skills` at the repository's shared skills directory. The adapter loads the shared MCPs, rules, and agents through V2 APIs. The package declares `index.ts` as its server entry and `tui.ts` as its TUI entry; SDK host resolution is covered by the runnable check.

Agent and MCP names are prefixed with `<plugin-name>:`. Agents inherit the user's model and receive the persistent rules. Native session context and tool hooks use `lib/hooks.mjs`. MCP stdio definitions become V2 local servers; Streamable HTTP definitions become remote servers.

`features.opencode.ui` enables a command-palette dialog showing loaded resources. It registers no prompt command. `features.opencode.theme` asks the project configuration script to install the optional theme. To install it manually, copy `themes/example-agent-plugin.json` to the project's `.opencode/themes/<plugin-name>.json`, then select it in the native theme menu. For a launch-scoped selection:

```sh
OPENCODE_CLI_CONFIG_CONTENT='{"theme":{"name":"<plugin-name>","mode":"dark"}}' opencode2
```

The setup script changes no global host settings. V2 loads TUI configuration from its global `cli.json` or the launch environment; it does not load a project `tui.json`. The theme menu persists a deliberate user selection. [V2 CLI configuration source](https://github.com/anomalyco/opencode/blob/84c9be93a56304a108f1a22df0c5d62c26d5b6ca/packages/cli/src/config/config.ts).

Restart OpenCode after changing flags or shared resources. Validate with `pnpm check`; the adapter smoke uses the real 2.0.20 host resolver plus a local context and makes no model or MCP requests.
