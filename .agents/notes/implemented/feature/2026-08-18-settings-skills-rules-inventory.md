# Agent Note: Web Settings Skills and Rules inventory pages

Status: implemented

English | [中文](2026-08-18-settings-skills-rules-inventory.zh.md)

## Problem

Web Settings already had an MCP inventory page, but users could not list or edit product Skills (filesystem `SKILL.md`) or Rules (`AGENTS.md`-compatible instruction files) without leaving the GUI.

## Decision

Ship two Host Remotes and two Settings sections, isomorphic to MCP:

1. **Skills authority** — project/user skill roots owned by `@deepseek-ai/dsh-skill-filesystem` (`.dsh/skills`, `.agents/skills`). Web disables the host `skill-filesystem` Loader row, so `@deepseek-ai/dsh-host-skill-inventory` scans those directories directly. `setModelInvocable` rewrites `disable-model-invocation` frontmatter. Edit opens the file via `host.openPath`.
2. **Rules authority** — `@deepseek-ai/dsh-agent-instructions` discovery (`$DSH_HOME/AGENTS.md` plus project `AGENTS.md` / `CLAUDE.md` and local overlays). `@deepseek-ai/dsh-host-rules-inventory` lists candidates and can create a missing user-global or project-root `AGENTS.md`. No enable toggle: presence is enablement. Not Cursor `.cursor/rules`.
3. **Client** — `@deepseek-ai/dsh-client-ui-settings-skills` (`settings.section` id `skills`, order 15) and `@deepseek-ai/dsh-client-ui-settings-rules` (id `rules`, order 16) via `slots.inject`, mounted beside MCP (order 18).

## Alternatives considered

- **Re-enable host `skill-filesystem` solely for Settings** — rejected: would duplicate preset-layer discovery for agents.
- **Reuse session `skills.list` RPC** — rejected: session-scoped, filters to user-invocable only, omits paths, and cannot write frontmatter.
- **One combined Skills & Rules section** — rejected: separate nav rows match MCP/Ignore and keep empty states clearer.

## Consequences

- Settings nav gains Skills and Rules rows.
- Skill model toggles take effect on the next filesystem discovery by preset `skill-filesystem`.
- Rules create writes starter Markdown; opening uses the OS handoff.
- Deferred: skill create wizard, `user-invocable` toggle, inline editors, re-enabling web `agent-instructions` injection.

## Required verification

- Host unit: skill scan + frontmatter rewrite; rules list + create.
- Client vitest: section registration, list/toggle/open/create, empty state.
- Client bundle: no `.cjs` shards; `require("./` count is 0.
