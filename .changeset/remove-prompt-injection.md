---
"@actionbookdev/openclaw-plugin": patch
---

Remove unconditional system prompt injection via before_prompt_build hook. Agent guidance is now provided exclusively through the bundled SKILL.md, which OpenClaw activates on demand based on user intent.
