export interface Agent { name: string; description: string; prompt: string }
export interface StdioServer { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string>; cwd?: string }
export interface HttpServer { type: 'streamable-http'; url: string; headers?: Record<string, string> }
export type McpServer = StdioServer | HttpServer;
export interface Resources {
  manifest: { name: string; version: string; description: string; author: { name: string }; license: string };
  mcpServers: Record<string, McpServer>;
  rules: string;
  agents: Agent[];
  features: {
    claude: { outputStyles: boolean; themes: boolean; lsp: boolean; workflows: boolean; channels: boolean; monitors: boolean; executables: boolean; evals: boolean; mainAgent: boolean; statusLine: boolean };
    pi: { theme: boolean; ui: boolean };
    opencode: { theme: boolean; ui: boolean };
  };
}
export function loadResources(root: string | URL): Promise<Resources>;
export function expandMcpServers(root: string | URL, servers: Record<string, McpServer>): Record<string, McpServer>;
export function parseDocument(text: string): { metadata: Record<string, unknown>; body: string };
