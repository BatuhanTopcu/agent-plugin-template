---
max_turns: 8
timeout_seconds: 120
allowed_tools: [Read, Glob, Grep, Skill]
tags: [smoke, review]
---

Review this proposed authorization helper. Explain any concrete correctness or security problem and the smallest fix. Do not create or modify files.

```js
function canAccess(user, ownerId) {
  return user.id = ownerId;
}
```
