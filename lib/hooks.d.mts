export function sessionContext(root: string | URL): Promise<string>;
export interface HookEvent { harness: string; tool_name?: string; status?: string; [key: string]: unknown }
export function beforeTool(event: HookEvent): Promise<void>;
export function afterTool(event: HookEvent): Promise<void>;
