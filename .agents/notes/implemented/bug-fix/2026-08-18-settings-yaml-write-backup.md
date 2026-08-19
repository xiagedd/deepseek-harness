# Agent Note: Settings.yaml write-front backup

Status: implemented

English | [中文](2026-08-18-settings-yaml-write-backup.zh.md)

## Problem

A producer restart made General Settings look emptied. Investigation showed `~/.dsh/settings.yaml` had not been rewritten by MCP/`loader.update` or ignore `writeText` (mtime still 2026-08-14; live `settings.describe` and `host.describe` still served the persisted permission and default model). The file provider already patches one namespace under a lock, but a future bad writer or half-applied external tool still had no recoverable sibling of the last good document.

## Decision

Before each non-empty `settings.yaml` / `.json` atomic replace, `dsh-settings-file` writes the reconciled prior text to `<document>.bak` with the same owner-only mode. Sibling namespaces and unknown keys stay in the primary document through the existing comment-preserving leaf patch; the `.bak` is only a recoverable copy of the previous complete text.

## Alternatives considered

**Rotating numbered backups.** Rejected: one sibling is enough for the immediate undo case and avoids unbounded growth under the harness home.

**Backing up empty first creates.** Rejected: a zero-length `.bak` next to a first write adds noise without recoverable content.

## Consequences

Updating one namespace still cannot drop another section from the live document. Operators can copy `<document>.bak` over the primary file when a write goes wrong. MCP enablement continues to write only the profile `cordis.patch.yml` and does not touch `settings.yaml`.
