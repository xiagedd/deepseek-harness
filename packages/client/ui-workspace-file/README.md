# @deepseek-ai/dsh-client-ui-workspace-file

English | [中文](README.zh.md)

Workspace file and folder `@` reference source, browser half: registers the `@` trigger source named `workspace-file` into `ctx.inputTriggers` beside the existing subagent `@` source. The two seats are distinct `(trigger, name)` pairs, so subagent candidates stay in the same menu.

- **Empty `@` query** — `IApiClient.host.listEntries({ path, root })` at the session workspace root (`sessions.list` cwd). Passing `root` makes Host `.gitignore` / `.dshignore` / `.cursorignore` filtering identical during nested descent. One listing level is cached per `(session, path)` with a single-flight fetch.
- **Fuzzy query (no `/` or `\`)** — `host.searchEntries({ root, query, limit })`, the same RPC and host ranking as the explorer search box (limit 100 for the menu). No client-side walk and no second index.
- **Path descent (`src/` or `src\util`)** — still walks named directory children via `listEntries` using host-returned absolute paths (the client does not join segments).

`type === 'file'` and `type === 'directory'` rows become candidates; other entry types stay omitted. Menu rows show the basename with a gray relative path (`description`) when nested. Hidden files and folders on a listed level stay omitted unless the trailing segment starts with `.` (search ignore / hidden policy follows the host).

A pick lands a `ReferenceInsert` chip whose label is the workspace-relative spelling and whose `ref` / clipboard / model serialization is the host absolute path. The draft does not receive file bytes or a recursive directory listing; the model sees a path it can pass to tools. Paths with `/` and extensions cannot ride the plain-text lexicon `@([\w-]+)` scan, so this source implements no lexicon. A missing cwd returns an empty group; a failed `host.listEntries` / `host.searchEntries` throws from `candidates`, which the slash shell logs and folds into a silent menu-group drop.

The `/client` exports are the plugin body (`apply`/`inject`) only; the source object is internal to the registration effect.

## Model Experience

### Workspace path chip in the user prompt

#### What the model sees

A picked file or folder reaches the ordinary user message as the host absolute path (for example `/ws/README.md` or `/ws/src`) in place of the draft chip. No file body, directory tree, binary attachment, or extra host block is added.

#### Token effect

Conditional and append-only: the path literal adds tokens only to its new user message. Opening the menu and listing or searching add zero model tokens.

#### KV Cache effect

Append-only. This package never edits earlier request tokens.

## Known Limitations and Deferred Work

- **Chip deletion and drag** — removing an inserted chip is owned by the conversation input bar; tree-to-composer drag is a later explorer task.
- **Character-level match highlight** — MenuView renders plain `name` / `description` text; substring highlight needs a shared menu mark API (not owned by this package).
- **Host search quality** — ranking, ignore pruning, and index caching live in `host.searchEntries`; this package only consumes `{ root, query, limit? }` → `{ path, entries, truncated }`.
