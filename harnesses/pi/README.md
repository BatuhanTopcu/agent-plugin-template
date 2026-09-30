# Pi adapter

Requires Pi 0.99.1 or later (`@earendil-works/pi-coding-agent`). The package
manifest loads `index.ts` and the shared skills. Pi supplies the extension API;
the adapter does not register custom model tools or prompt templates.

The adapter registers the servers from the root `mcp.json`, adds shared rules
as a structured system-prompt section on every turn, and runs the shared
before/after tool hooks for Pi tools, including MCP tools. Bundled MCP names use
`<plugin-name>:<server-name>` so they do not replace unrelated user registrations.

Use `/delegate <agent> <task>` to run an agent from the root `agents/` directory
in a separate Pi process. `/delegate` without arguments lists available agents.
The child uses the running Pi executable, current model and thinking level,
working directory, and normal Pi skills/MCP configuration. Its role is scoped
to that child; its session is not saved. The result or failure appears as a
message in the parent session. Delegation does not automatically start another
parent model turn. Closing the parent session terminates active children.

In `features.json`, set `pi.ui` to `true` for a terminal widget showing the
installed plugin, MCP server count, and delegation command. Set `pi.theme` to
`true` to select the included `agent-plugin` theme for the current session.
The adapter restores the previous theme on shutdown and does not change Pi's
saved theme setting. Both options default to
`false` and only affect interactive terminal sessions. After editing shared
resources or feature options, run `/reload`.
