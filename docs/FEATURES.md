# Features and support

The repository authors skills, references, agents, rules, and MCP configuration once. `pnpm build` generates the native registrations needed by each harness. A matching feature name does not imply matching APIs, permissions, or session behavior. The portable [Agent Plugins format](https://agent-plugins.org/specification) supplies the skills and MCP core; the native adapters supply the other features.

Direct custom model-callable tools and prompt templates are deliberately omitted. Add external tools through MCP and reusable instructions through skills.

## Shared features

| Feature | Authored source | Working example |
| --- | --- | --- |
| Skills | `skills/<name>/SKILL.md` | Invoke `inspect-change`, or describe a change review so the harness can select it. |
| References | Files inside the skill directory | `inspect-change` links to `references/checklist.md`; the agent reads it when following the skill. |
| Agents | `agents/*.md` | Delegate implementation to `implementer` and independent review to `reviewer`. |
| Persistent rules | `rules/*.md` | The engineering rules enter the main session through native rules or a session hook, and accompany the bundled agents. |
| MCP | `mcp.json` | `openai-docs` connects to the public OpenAI documentation MCP service. Replace or extend the server map with your real servers. |
| Lifecycle and tool hooks | `lib/hooks.mjs` | Session initialization supplies rules. Tool events can append a compact audit record when `AGENT_PLUGIN_AUDIT_FILE` is set. |

Audit logging is disabled unless the process environment names a file. It records time, harness, tool name, phase, and status; it does not record tool arguments, results, or conversation content. The supplied hooks do not block tools. Customize the shared hook functions to implement an intentional policy.

## Harness routes

| Capability | Codex | Claude Code | Cursor | pi | OpenCode V2 |
| --- | --- | --- | --- | --- | --- |
| Skills and references | Root Agent Plugins package | Native manifest points to shared `skills/` | Native manifest points to shared `skills/`; root standard format also supports these | `pi.skills` points to shared `skills/` | Install configuration registers shared `skills/` |
| MCP | Root standard `mcp.json` | Generated `.mcp.json` | Generated native MCP configuration | Extension registers servers with native MCP API | Server plugin transforms MCP registrations |
| Agents and delegation | Generated agent TOML definitions registered by installation | Native plugin agents, namespaced as `<plugin>:<agent>` | Native plugin agent Markdown files | `/delegate <agent> <task>` launches a separate pi process | Native subagents, namespaced as `<plugin>:<agent>` |
| Persistent rules | Session hook and agent instructions | Session hook and agent instructions | Native `alwaysApply` rule and agent instructions | Extension system-prompt section | Server plugin session context and agent instructions |
| Hooks | Native `com.openai` hook extension | Native command hooks | Native command hooks | Extension events | Server plugin hooks |
| Theme example | No theme component in this template | Optional experimental terminal theme | No agent-plugin theme component documented | Optional native package theme | Optional native TUI theme |
| UI example | No plugin UI code in this template | Output style; no arbitrary plugin UI code | No arbitrary UI code in this template; MCP Apps are a separate MCP capability | Optional status and widget via extension API | Optional command-palette action and dialog via TUI plugin API |

Codex's portable plugin manifest does not replace agent registration in its host configuration. Cursor's root `plugin.json` supports skills and MCP; its `.cursor-plugin/plugin.json` is used here because rules, agents, hooks, and variables require the native format. pi delegation is an explicit slash command rather than a registered model-callable tool. OpenCode targets the current V2 plugin contract and `opencode2`; it does not include V1 compatibility paths. [Codex authoring](https://developers.openai.com/plugins/build/plugins), [Cursor format reference](https://cursor.com/docs/reference/plugins), [pi packages](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md), [OpenCode V2 plugin source](https://github.com/anomalyco/opencode/tree/84c9be93a56304a108f1a22df0c5d62c26d5b6ca/packages/plugin).

Delegated agents use the current repository and its available tools. The supplied prompts scope their work; they are not sandbox boundaries. In pi, the child starts a fresh session with the bundled agent prompt, the current working directory, model, and thinking level. It does not inherit the parent's conversation history. Native subagent controls and availability remain harness-specific.

## Optional feature controls

Edit `features.json`, run `pnpm build && pnpm check`, and reload the plugin or start a new session. The default enables Claude output styles. Additional dependencies, background processes, terminal changes, and UI examples are disabled until selected.

| Setting | Default | Example and prerequisite |
| --- | --- | --- |
| `claude.outputStyles` | `true` | `Concise engineering` appears in `/output-style`. Coding instructions are retained; the style is not forced on the session. |
| `claude.themes` | `false` | `Example midnight` appears in `/theme`. Uses the experimental native theme component and documented color tokens. |
| `claude.lsp` | `false` | TypeScript/JavaScript code intelligence through `typescript-language-server --stdio`. Both the language server and TypeScript must already be available in the host environment. |
| `claude.workflows` | `false` | The native `review-scope` workflow runs one reviewer, then a second reviewer when there are findings. Pass `args` as `{"paths":["src/file.ts"]}`. Workflows require the host's workflow permission and consume model requests. |
| `claude.channels` | `false` | A native `team-channel` binding asks for the absolute path to an actual Node.js MCP channel server. The repository does not provide a chat service, credentials, or active endpoint. |
| `claude.monitors` | `false` | `working-tree` starts when `inspect-change` first runs and reports changes to the launch repository's tracked Git status. |
| `claude.executables` | `false` | Build materializes `bin/<plugin-name>-info`; Bash can run it to print local plugin metadata and feature settings. |
| `claude.evals` | `false` | Native `inspect-assignment` eval case checks the shared review skill with deterministic graders. Running it still makes model requests. |
| `claude.mainAgent` | `false` | Uses the bundled `implementer` as the main conversation agent through the plugin's native settings default. |
| `claude.statusLine` | `false` | Displays each subagent's name, status, and context usage through a local stdin/stdout command. |
| `pi.theme` | `false` | Applies the bundled `agent-plugin` theme in TUI mode and restores the previous theme on extension shutdown. |
| `pi.ui` | `false` | Shows plugin resources in a TUI widget and delegation state in the status line. |
| `opencode.theme` | `false` | Installation copies the bundled TUI theme and selects its dark variant when no TUI configuration exists. Existing theme settings require manual selection. |
| `opencode.ui` | `false` | TUI command palette offers `<plugin-name>: show plugin resources`, which opens a local resource-information dialog. |

The flags control this repository's registrations and adapters. They do not enable unsupported host features, install binaries, set permissions, or configure a user's global settings. Theme and UI features affect interactive terminals only. [Claude components](https://code.claude.com/docs/en/plugins/components), [Claude output styles](https://code.claude.com/docs/en/output-styles), [Claude workflows](https://code.claude.com/docs/en/workflows), [pi extensions](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md).

### Claude workflow

`harnesses/claude/workflows-source/review-scope.js` is the authored source. Build substitutes the plugin identity and writes the enabled native workflow. Ask Claude to run `review-scope` with an explicit `paths` argument, or use the host's `Workflow` tool with the saved workflow name and that argument. The example accepts one to ten relative repository paths and makes no edits. A skipped or failed review produces an incomplete result rather than a success claim.

Native workflow JavaScript is a restricted, replayable runtime with `agent()` and workflow globals. Its top-level `return` is valid for that runtime and is not a normal Node module. It cannot import filesystem APIs or read `process.env`. The `agentType` option uses the same registry as native subagents; this template resolves it during build. Availability and approval flows depend on the Claude version and account. [Workflow runtime](https://code.claude.com/docs/en/workflows).

### Claude channel

`harnesses/claude/channels.json` is a native binding, not a channel implementation. Enable the flag only when you have a real Node.js MCP server that advertises the `claude/channel` capability and handles authentication, pairing, and authorized senders. Configure its path through the native plugin configuration prompt. Supply any server credentials through that server's own supported secret configuration.

The generated manifest retains the canonical MCP servers and adds `team-channel`. A plugin from a custom marketplace normally requires the per-session flag `--dangerously-load-development-channels plugin:<plugin-name>@<marketplace-name>`. An organization's `allowedChannelPlugins` policy can provide a different approved route. Installing the plugin alone does not start a channel. Team/Enterprise policy and research-preview availability also apply. [Channel implementation and packaging](https://code.claude.com/docs/en/channels-reference), [Channel availability and policy](https://code.claude.com/docs/en/channels).

### Claude monitor and executable

The monitor captures the session's launch directory, verifies that it belongs to a Git repository, and stops if that directory no longer resolves to the same repository. It polls tracked status every ten seconds with optional Git locks disabled. It reports changed-path counts, reads no file contents, and writes no project state. For a single manual check, run `node <plugin-root>/harnesses/claude/monitor.mjs --once` from a Git repository.

Monitors run in interactive sessions. They are not supported in print mode or on all model-provider backends. Disabling a plugin during a session does not terminate an already-running monitor; stop its task or end the session. Monitor shell commands cannot interpolate `user_config`. [Monitor component](https://code.claude.com/docs/en/plugins/components#background-monitors), [Monitor manifest schema](https://code.claude.com/docs/en/plugins/manifest-reference).

Claude automatically adds an enabled plugin's root `bin/` to its Bash tool's path after the existing user path. There is no executable manifest field. The generated info executable performs only local reads. Root `bin/` executables are a Claude CLI feature; claude.ai and Cowork reject plugins containing that directory. [Plugin executables](https://code.claude.com/docs/en/plugins/components).

### Claude eval and native settings

The `inspect-assignment` eval is a self-contained authorization-code review. Its prompt allows only read and skill tools. Regex graders check the assignment defect and proposed comparison; a `tool_used` grader checks whether `inspect-change` ran. These checks are an example, not a substitute for a representative suite. No eval runs during build or validation.

After enabling `claude.evals`, an intentional local run is `claude plugin eval . --case inspect-assignment --runs 1 --ablation none --no-publish`. This consumes model usage even though its graders need no judge model. The host requires Claude Code v2.1.269 or later, supported Git, authentication, and plugin-directory trust. Real MCP servers are not started by the eval runner unless separately authorized with its server flags. [Native eval schema and runner](https://code.claude.com/docs/en/plugin-evals).

`claude.mainAgent` and `claude.statusLine` populate the native manifest's `settings` object. Only `agent` and `subagentStatusLine` take effect there. User settings override plugin defaults, and a root `settings.json` overrides the inline object. The build embeds the status-line formatter in its command, so it can run from the session directory without a plugin-root environment variable. It formats host-provided task data without accessing files, the network, or models, emits one JSON row per task, and strips control characters from displayed names and status. Host trust and hook-management policies apply. [Default plugin settings](https://code.claude.com/docs/en/plugins/components#default-settings), [Subagent status lines](https://code.claude.com/docs/en/statusline#subagent-status-lines).

## Host configuration and omitted components

Native Claude `userConfig` and Cursor `variables` describe user-supplied values; they are not secret storage in this repository. MCP environment placeholders must resolve in the host process. Persistent plugin data belongs in a host-supported data directory, not the installed plugin version. For Cursor, the generated MCP configuration uses `${CURSOR_PLUGIN_ROOT}`; the portable `${PLUGIN_ROOT}` and `${PLUGIN_DATA}` variables are not expanded by Cursor. [Claude manifest](https://code.claude.com/docs/en/plugins/manifest-reference), [Cursor variables and MCP](https://cursor.com/docs/reference/plugins).

The optional Claude settings keep the main agent user-selected unless its flag is enabled, and model evaluations require an explicit runner invocation. Cursor commands, pi prompt files, and OpenCode commands are omitted because shared skills cover the requested reusable instructions. Custom model-callable tools and an arbitrary UI framework are omitted as requested. Host theme systems, Cursor SDK custom tools, and MCP Apps can be separate projects; they are not interchangeable with a portable agent-plugin component.

Validate syntax, native manifests, paths, SDK types, and local callback behavior before publication. Authentication, actual MCP connectivity, workflow model execution, channel delivery, and private GitLab installation still require smoke checks in each real client. Record the client versions used; a generated valid file does not establish a successful remote installation.
