#!/usr/bin/env node
import { beforeTool, afterTool, sessionContext } from '../lib/hooks.mjs';

const [harness, phase] = process.argv.slice(2);
if (!['codex', 'claude', 'cursor'].includes(harness) || !['session', 'before', 'after', 'failure'].includes(phase)) {
  throw new Error('Usage: node scripts/hook.mjs <codex|claude|cursor> <session|before|after|failure>');
}
let input = '';
for await (const chunk of process.stdin) input += chunk;
const event = input.trim() ? JSON.parse(input) : {};
let output = {};
if (phase === 'session') {
  const context = await sessionContext(new URL('../', import.meta.url));
  output = harness === 'cursor' ? { additional_context: context }
    : { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } };
} else {
  const payload = { harness, tool_name: event.tool_name, status: phase === 'failure' ? 'error' : phase === 'after' ? 'completed' : undefined };
  await (phase === 'before' ? beforeTool(payload) : afterTool(payload));
  if (harness === 'cursor' && phase === 'before') output = { permission: 'allow' };
}
process.stdout.write(JSON.stringify(output) + '\n');
