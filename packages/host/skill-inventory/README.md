# @deepseek-ai/dsh-host-skill-inventory

English | [中文](README.zh.md)

Host Remote for filesystem skills shown in Web Settings. `SkillInventoryGateway` registers the `skillInventory` service and publishes `skillInventory/list` and `skillInventory/setModelInvocable`. Listing scans the same project and user roots as `@deepseek-ai/dsh-skill-filesystem` (`<project>/.dsh/skills`, `<project>/.agents/skills`, `$DSH_HOME/skills`, `$DSH_AGENTS_HOME/skills`) without mounting that provider, because the web profile disables the host `skill-filesystem` row while presets still discover those directories for agents.

`setModelInvocable` rewrites the skill file's YAML frontmatter (`disable-model-invocation`) and re-scans. Only paths returned by the latest list for the supplied cwd are accepted. Runtime or non-file skills are outside this inventory.

Public payload types live under `./types`. Typert generates the Host and Client Remote artifacts exposed by `./typert` and `./remote`.

## Model Experience

None, as this Host-only inventory projection registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **No create wizard** — adding a skill still means creating a `SKILL.md` or flat `.md` under a skill root.
- **No `user-invocable` toggle** — Settings toggles only model-facing enablement; human-command policy stays in frontmatter.
- **Host provider remains disabled on web** — agents still discover skills through preset-mounted `skill-filesystem`; this Remote only reads and edits the shared directories.
