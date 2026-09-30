# Agent plugin template

One GitLab repository for **Codex, Claude Code, pi, Cursor, and OpenCode V2**. Author skills, references, rules, agents, and MCP definitions once. The build produces native plugin manifests and configurations; pi and OpenCode use small native adapters.

The working example includes `inspect-change`, its review checklist, implementer and reviewer agents, persistent engineering rules, a public read-only OpenAI documentation MCP, and session/tool hooks. Native extras include output styles, themes, UI, LSP, workflows, channels, monitors, configuration inputs, and executable examples. See [the feature matrix](docs/FEATURES.md) for exact support and switches.

Direct custom tools and prompt-template resources are omitted. MCP servers provide tools; skills provide reusable instructions.

## Create your plugin

Use this repository as a GitLab project template, or copy it into a new repository. Requires Node **24.15+** and pnpm **10.33.0** for authoring.

1. Change `name`, `version`, `description`, `author`, and `license` in `plugin.json`. Use a lowercase hyphenated plugin name. Update `LICENSE` and the installation examples below for your project.
2. Edit `skills/`, `agents/`, `rules/`, and `mcp.json`. Add optional native features through `features.json` and the corresponding `harnesses/` files.
3. Run:

```sh
pnpm install
pnpm validate
```

Commit the generated native files and `pnpm-lock.yaml` together with the shared sources. GitLab CI runs `pnpm check`, which fails when generated files are stale. It validates schemas and references, checks the SDK types, and runs local adapter/hook/installation smoke checks. It does not execute model evaluations or connect to your MCP servers.

```text
plugin.json                 Identity and portable Agent Plugins manifest
mcp.json                    Shared stdio / Streamable HTTP server definitions
skills/<name>/SKILL.md       Shared Agent Skills instructions
skills/<name>/references/    Supporting documents, loaded when needed
agents/*.md                 Shared agent descriptions and role instructions
rules/*.md                  Persistent instructions
features.json               Explicit native feature switches
lib/                        Shared resource loading and redacted hook logic
harnesses/                  Native adapters, components, and generated resources
.agents/plugins/            Generated Codex marketplace
.claude-plugin/             Generated Claude plugin and marketplace
.cursor-plugin/             Generated Cursor plugin
scripts/                    Build, validation, hooks, and project configuration
```

Edit shared sources, then run `pnpm build`. Generated agent/rule directories, Claude workflows, and root `bin/` are replaced by the build. Keep handwritten sources outside those generated directories.

Skills use standard `name` and `description` frontmatter. Agents use the same fields plus Markdown role instructions. Add references under their owning skill; link them with paths such as `references/checklist.md`. Native agents receive the shared persistent rules as well as their own role instructions.

## MCP servers and hooks

The shipped `openai-docs` server uses `https://developers.openai.com/mcp` and needs no credentials. Replace it or add your own servers in `mcp.json`:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcpServers": {
    "team-service": {
      "type": "stdio",
      "command": "your-mcp-server",
      "args": ["--stdio"],
      "env": { "SERVICE_TOKEN": "${SERVICE_TOKEN}" }
    },
    "remote-service": {
      "type": "streamable-http",
      "url": "https://mcp.example.com/mcp"
    }
  }
}
```

Install stdio server binaries separately. Supply credentials through the launching environment or the harness's native authentication/configuration flow. The portable format does not allow secret interpolation in HTTP headers; use the native component when a server needs a client-specific header or configuration input. Never commit tokens.

`${PLUGIN_ROOT}` is translated to the native install root. pi/OpenCode adapters also expand environment variables and fail clearly when a required variable is missing. Their `${PLUGIN_DATA}` defaults to `$XDG_DATA_HOME/agent-plugins/<plugin-name>` or `~/.local/share/agent-plugins/<plugin-name>`; no directory is created until your server uses it. Cursor has no standard `PLUGIN_DATA` expansion, so a shared server definition using it fails the build. Use a concrete data directory or a native server definition instead.

Cursor input definitions live in `harnesses/cursor/variables.json`; nonempty definitions are added to its generated native manifest. Use the documented JSON Schema subset and matching `${VARIABLE}` placeholders in the server configuration. Claude's optional channel example demonstrates native `userConfig` inputs. [Portable MCP reference](https://agent-plugins.org/plugin-authors/mcp-servers), [Cursor inputs](https://cursor.com/docs/reference/plugins), [Claude inputs](https://code.claude.com/docs/en/plugins-reference).

Session hooks load `rules/*.md`. Customize `lib/hooks.mjs` for tool lifecycle behavior. The example allows tool execution and writes an audit only when `AGENT_PLUGIN_AUDIT_FILE` points to a writable file. The audit records timestamp, harness, tool name, phase, and status; arguments, outputs, and conversation text are omitted. Native Codex/Claude/Cursor hooks use only Node built-ins and work in plugin-manager Git caches without installing npm dependencies.

## Publish on custom GitLab

Replace `gitlab.example.com`, `group`, repository name, plugin name, and tag in these examples. Use SSH; prepare the user's SSH key and trusted host key before running a noninteractive installer.

```sh
git init -b main
git add .
git commit -m "Create agent plugin"
git remote add origin git@gitlab.example.com:group/example-agent-plugin.git
git push -u origin main
git tag v0.1.0
git push origin v0.1.0
```

Publish each release as a new immutable tag after `pnpm validate` passes. All five clients consume the same repository and tag; there are no separate release repositories or registry publication requirements.

## Codex installation

Targets the current native plugin CLI (verified with Codex **0.159.0**). The repository contains its marketplace catalog.

```sh
codex plugin marketplace add git@gitlab.example.com:group/example-agent-plugin.git --ref v0.1.0
codex plugin add example-agent-plugin@example-agent-plugin-marketplace
```

Enable/trust the plugin's command hooks in Codex. Codex must be orchestrating the local session for these hooks to run.

Custom agents are host configuration rather than a native plugin component. Clone the same release and install its generated agents into each project that needs them:

```sh
git clone --branch v0.1.0 --depth 1 git@gitlab.example.com:group/example-agent-plugin.git
cd example-agent-plugin
node scripts/configure.mjs codex --project /absolute/path/to/your-project
```

No dependency install is required for this Codex setup command. Start a fresh Codex session in that project; ask it to use `example-agent-plugin-reviewer` or `example-agent-plugin-implementer`. Skills are discoverable through the plugin. The setup command preserves other agents and refuses to overwrite a differing existing file.

For a tagged update, remove the old plugin and marketplace, add the new tag, then install again:

```sh
codex plugin remove example-agent-plugin@example-agent-plugin-marketplace
codex plugin marketplace remove example-agent-plugin-marketplace
codex plugin marketplace add git@gitlab.example.com:group/example-agent-plugin.git --ref v0.2.0
codex plugin add example-agent-plugin@example-agent-plugin-marketplace
```

Update project agent files from the same release. Review and remove the previous named plugin agent files before replacing differing versions. To uninstall, remove the plugin/marketplace and those named files from `.codex/agents/`. [Codex plugin docs](https://developers.openai.com/plugins/build/plugins), [custom agents](https://developers.openai.com/codex/agent-configuration/subagents).

## Claude Code installation

Use the latest Claude Code for optional experimental components; see the feature guide for requirements. The standard plugin components also validate with **2.1.247**.

```sh
claude plugin marketplace add 'git@gitlab.example.com:group/example-agent-plugin.git#v0.1.0' --scope user
claude plugin install example-agent-plugin@example-agent-plugin-marketplace --scope user
```

Start a new session. Invoke `/example-agent-plugin:inspect-change`, ask for the plugin's reviewer agent, and select `Concise engineering` in `/output-style` if desired. Hooks load the persistent rules. A plugin-root `CLAUDE.md` is not a persistent rule source, so this template uses native session hooks and agent instructions.

For local authoring, build the repository and start `claude --plugin-dir /absolute/path/to/example-agent-plugin`. Validate native manifests explicitly:

```sh
claude plugin validate .claude-plugin/plugin.json --strict
claude plugin validate .claude-plugin/marketplace.json --strict
```

For a pinned update:

```sh
claude plugin uninstall example-agent-plugin@example-agent-plugin-marketplace --scope user --keep-data
claude plugin marketplace remove example-agent-plugin-marketplace --scope user
claude plugin marketplace add 'git@gitlab.example.com:group/example-agent-plugin.git#v0.2.0' --scope user
claude plugin install example-agent-plugin@example-agent-plugin-marketplace --scope user
```

Marketplace removal uninstalls its plugins; this template's marketplace has one plugin. Omit `--keep-data` only when you intend to discard its stored data. [Git marketplace sources](https://code.claude.com/docs/en/plugins/marketplace-reference), [installation](https://code.claude.com/docs/en/discover-plugins).

## Cursor installation

Clone the tagged repository directly into Cursor's local plugin directory. External symlinks are not an installation method.

```sh
mkdir -p "$HOME/.cursor/plugins/local"
git clone --branch v0.1.0 --depth 1 git@gitlab.example.com:group/example-agent-plugin.git "$HOME/.cursor/plugins/local/example-agent-plugin"
```

Reload the window, open **Customize**, and enable/verify the plugin's skills, rules, agents, hooks, and MCP. Node must be on Cursor's process PATH for command hooks. Teams/Enterprise admins may need to enable **Allow Local Plugin Imports** in Dashboard → Settings → Security & Identity → Marketplace and Plugins.

An admin can also import a Git repository into a team marketplace if the custom GitLab is reachable. Verify that route against your organization's policy and hosting setup; the local clone route above works without a hosted marketplace import. GitLab imports need manual refresh; Cursor's documented automatic refresh is GitHub-specific.

To update the clone:

```sh
git -C "$HOME/.cursor/plugins/local/example-agent-plugin" fetch --depth 1 origin tag v0.2.0
git -C "$HOME/.cursor/plugins/local/example-agent-plugin" checkout --detach v0.2.0
```

Reload Cursor. To uninstall, remove this plugin's checkout and reload. Hook root expansion was additionally verified in the official installed Cursor **3.21.9** loader. [Cursor plugin installation](https://cursor.com/docs/plugins), [native format](https://cursor.com/docs/reference/plugins).

## pi installation

Requires pi **0.99.1+**, which supplies built-in MCP registration. Install the Git source:

```sh
pi install 'git:git@gitlab.example.com:group/example-agent-plugin.git@v0.1.0'
```

Use `--local` for a project-local package and the same scope for later operations. Restart pi, invoke `/skill:inspect-change`, or run `/delegate reviewer <task>`. `/delegate implementer <task>` starts a separate pi process with the agent's role, shared rules, current model, and thinking level. This command is explicit delegation; it registers no model-callable tool.

For a tagged update, run `pi install` with the new tag; pi replaces the same Git repository's package identity. `pi update --extensions` reconciles the already-selected reference. Remove with `pi remove '<installed-git-source>'`, using `--local` if installed locally. [pi adapter details](harnesses/pi/README.md), [native packages](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md).

## OpenCode V2 installation

Targets **`@opencode/cli` 2.0.20**, using the **`opencode2`** executable and V2 plugin API. Install that harness through its official distribution, then clone this release and install its runtime dependency:

```sh
git clone --branch v0.1.0 --depth 1 git@gitlab.example.com:group/example-agent-plugin.git
cd example-agent-plugin
pnpm install --prod --frozen-lockfile
node scripts/configure.mjs opencode --project /absolute/path/to/your-project
```

Start `opencode2` in that project. The setup merges these V2 configuration entries into `opencode.json`, preserves other settings, and avoids duplicate paths:

```json
{
  "plugins": ["/absolute/path/to/example-agent-plugin/harnesses/opencode"],
  "skills": ["/absolute/path/to/example-agent-plugin/skills"]
}
```

If the project uses `opencode.jsonc`, the command prints the entries for a manual merge so comments are preserved. Keep the checkout at the configured path. Agents and MCP IDs are namespaced as `example-agent-plugin:reviewer` and `example-agent-plugin:openai-docs`. No model override is imposed.

Optional UI is controlled by `opencode.ui`. Optional theme setup copies the bundled theme into `.opencode/themes/<plugin-name>.json`; select it through the native theme menu. For a launch-scoped selection, use `OPENCODE_CLI_CONFIG_CONTENT='{"theme":{"name":"<plugin-name>","mode":"dark"}}' opencode2`. V2 stores persistent TUI selections in its global `cli.json`, so the setup command installs the theme file and lets you choose it. Existing differing theme files are preserved. See [OpenCode adapter notes](harnesses/opencode/README.md).

Update the checkout to the new tag, run `pnpm install --prod --frozen-lockfile`, and restart `opencode2`. To uninstall, remove the two configured path entries, the optional theme selection/file, and then the checkout. [Official V2 plugin API](https://github.com/anomalyco/opencode/tree/84c9be93a56304a108f1a22df0c5d62c26d5b6ca/packages/plugin), [V2 config schema source](https://github.com/anomalyco/opencode/blob/84c9be93a56304a108f1a22df0c5d62c26d5b6ca/packages/schema/src/config.ts).
