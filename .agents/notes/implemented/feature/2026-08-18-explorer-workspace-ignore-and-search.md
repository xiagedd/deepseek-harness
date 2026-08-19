# Agent Note: Explorer workspace ignore and search

Status: implemented

English | [中文](2026-08-18-explorer-workspace-ignore-and-search.zh.md)

## Problem

The Explorer exposed whole-workspace fuzzy search before the deployed browser carrier contained `host.searchEntries`, so the UI reported that the runtime did not support workspace search even though the Host RPC implementation existed in source. Tree listing, fuzzy search, and `@` workspace-file candidates also applied different ignore behavior; ignored large directories could still be enumerated before client filtering.

## Decision

`host.listEntries` and `host.searchEntries` are the authoritative enumeration paths. Both read workspace-root ignore files through `ctx.fs`: the built-in `.git/` rule, then `.gitignore` when present, then `.dshignore` or `.cursorignore` when `.dshignore` is absent. If neither a Git nor product ignore file exists, Unity-oriented defaults omit `Library/`, `Temp/`, `Logs/`, `obj/`, and `*.meta`. The maintained `ignore` package defines comments, empty lines, `*`, `**`, root-relative paths, directory patterns, and `!` negation. `.meta` files remain an unconditional Host omission.

`listEntries` accepts an optional workspace `root`; the Explorer and `@` workspace-file source pass it so nested listings use one matcher root. Ignored directories are removed before the search walk pushes them, so their descendants are never enumerated. Search keeps a lazy per-root index keyed by the loaded ignore texts; every search request re-reads those texts and rebuilds when they change. Listings re-read rules per request. Host filesystem mutations invalidate all search indexes.

The web bundle already registers the API gateway, connection, Explorer, and workspace-file client packages. The runtime failure came from stale built `dsh-client-connection` output that lacked the source-declared `searchEntries` property, not from missing profile registration. Rebuilding the connection and client bundles publishes the existing RPC method to the browser.

## Alternatives considered

**Client-only filtering.** Rejected because it still walks ignored directories, gives search and `@` different results, and cannot protect large Unity `Library/` trees.

**A file watcher for ignore changes.** Rejected because request-time reads give deterministic next-request updates without another lifecycle owner. Search index keys retain caching when the file texts are unchanged.

**Hand-written glob matching.** Rejected because the maintained `ignore` package covers the required Git-style syntax and negation with less owned parsing code.

## Consequences

Tree expansion, whole-workspace search, and `@` candidates now share Host filtering. Ignore edits take effect on the next search or refreshed listing without restarting the Host; an already rendered tree still requires Refresh to issue that listing request. Product rules may negate `.gitignore` rules because they are applied later. `.dshignore` and `.cursorignore` do not stack with each other: `.dshignore` wins.
