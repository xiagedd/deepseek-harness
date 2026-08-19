# Agent Note: The explorer folder glyph has three states driven by a background emptiness probe

Status: implemented

English | [中文](2026-08-18-explorer-three-state-folder-glyph.zh.md)

## Problem

A collapsed folder in the explorer looked identical whether it held children or was empty; only expanding it revealed the difference. Producers wanted the glyph to carry that fact before a click. The hard part is knowing emptiness for an unexpanded folder without a synchronous `host.listEntries` per row, which would block the tree on every render.

## Decision

The folder glyph has three states, all drawn in `explorer-icons.tsx` in the same folded-paper style as the file-type glyphs (`currentColor`, `strokeWidth="1.15"`, rounded joins, `viewBox="0 0 16 16"`): a filled folder when the directory has visible children, an outline folder when it is empty, and an open folder while expanded. `ExplorerGlyph` maps `kind === 'folderEmpty'` to the outline, and `kind === 'folder'` to open-vs-filled by the `open` flag. These three folder faces are owned locally instead of imported from `dsh-client-ui-primitives`, so the three-state distinction lives in one file.

Emptiness for a collapsed, visible folder comes from a client-side background probe (channel (c)), not the host index or an RPC change. `ExplorerPanel` keeps a dedicated `probed` cache (`Record<string, readonly FsEntry[]>`) separate from the `dirs` expansion state. An effect walks the visible tree order and, for each visible directory that is neither listed (`dirs`) nor already probed nor in flight, issues one abortable `host.listEntries`; the result feeds only the glyph. Until a probe resolves — or if it fails — the glyph stays filled, the conservative default, so it never flickers. The probe is skipped in search mode, and the cache is dropped on refresh, on a mutation, and on a workspace change.

The glyph emptiness is carried on a new `ExplorerTreeNode.iconEmpty` field, kept distinct from the structural `empty` (a listed directory with zero visible children). `empty` still drives `aria-expanded` and the empty-folder hint; `iconEmpty` drives only the glyph. This keeps `dirs` semantics — "did the user expand this?" — untouched, so selection, rename, paste, and drag behavior is unchanged by probing.

`.meta` hiding and ignore rules are unchanged: the probe reuses the same list path, so a folder holding only hidden entries reads as empty exactly as an expand would show it.

## Alternatives considered

**Host-side lazy index (`search-entries.ts`).** The fuzzy index already walks the whole workspace, so a "has visible children" bit could be derived there. Rejected: its ignore/`.meta` filtering is tuned for search and does not match the explorer's per-listing rules one-for-one, so the glyph could disagree with what expanding shows; it also couples the glyph to an index built for a different feature.

**Extend the host RPC (`FsEntry.hasChildren` / `childCount`).** The cleanest long-term signal and it would remove the probe calls, but it means changing the whole chain (`host.ts`, `host.schema.ts`, `rpc-map.ts`, `fetch/client.ts`, `fetch/handler.ts`, `api-proxy.ts`) plus every fixture and fake-api, risking the 384-green apiproxy baseline for a cosmetic glyph. Deferred and recorded as the way to retire the probe (README Known Limitations).

**Derive emptiness from the parent's `listEntries`.** A parent listing says a child is a directory but not whether that child has its own visible children, so it cannot answer the question without a second listing. It is exactly the probe, just un-cached.

**Write probe results into `dirs`.** The first attempt. It made a probed-but-collapsed folder look "listed", corrupting the user-expansion invariant that selection/rename/paste/drag depend on, and exhausted per-call test mocks. Rejected in favor of the separate `probed` cache and `iconEmpty` flag.

## Consequences

- A collapsed folder shows filled vs outline before the user expands it; the state is stable and never flickers because unknown falls back to filled.
- The glyph costs one background `host.listEntries` per visible collapsed directory, cached until refresh or a mutation. On a wide tree this is more listings than before; a host `hasChildren` field would remove them.
- `dirs` still means only user-driven expansion, so no structural interaction (selection, rename, paste, drag, the empty-leaf hint) changed.
- The explorer no longer imports folder glyphs from `dsh-client-ui-primitives`; the three folder faces are local.

## Testing

`tests/explorer-icons.client.spec.tsx` asserts the three folder SVGs are visually distinct (fill attributes, path counts) and that `ExplorerGlyph` renders outline for `folderEmpty` and open-vs-filled for `folder`. `tests/explorer-panel.client.spec.tsx` asserts an unexpanded non-empty folder is filled, an empty one turns to the outline glyph after its probe resolves, an expanded folder is open, and a folder with a still-pending probe stays filled. Both specs are green; the touched-package `test:gui` count is unchanged apart from the added cases.
