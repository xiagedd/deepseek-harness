# Agent Note: Explorer preview editor theme settings

Status: implemented

English | [中文](2026-08-18-explorer-preview-editor-theme-settings.zh.md)

## Problem

The explorer CodeMirror preview used fixed `--dsw-*` / `--shiki-*` chrome. Users could not pick a preset, override syntax or chrome colors, or change typography, and any such choice would not survive a hard refresh. Selection visibility was already patched with a semi-transparent active line and overlay selection token; that fix needed to stay inside any new token system.

## Decision

Own a Host settings namespace `ui-explorer-preview` (`presetId` + `overrides`) registered by the ui-explorer node half. The browser half binds it through `settingsScope`, resolves presets (`default` / `vs-dark` / `vs-light` / `one-dark`) plus overrides into `--dsh-editor-*` CSS variables, and publishes them with `theme.overrideTokens` so the existing `ThemePresenter` writes body styles — no second DOM writer. CodeMirror reads those variables with `--dsw-*` / `--shiki-*` fallbacks; line numbers use a Compartment (CSS cannot disable `lineNumbers()`). A General Settings row (`settings.general.item`, id `editor-preview`) exposes preset Menu, color inputs, font/line-height Inputs, a line-number checkbox, and restore-defaults (`unset` overrides).

## Alternatives considered

- **localStorage for editor colors.** Rejected: product preference belongs with Host settings like Appearance, not browser browse-state.
- **Second body.style writer beside ThemePresenter.** Rejected: duplicates the presenter contract and races theme flips.
- **Props from ExplorerPanel into FilePreviewPanel.** Rejected: the seats are sibling slots with no parent/child props path.

## Consequences

Hard refresh keeps editor appearance. Default preset values are CSS var references so they track app light/dark. Absolute presets ignore app scheme. Remote non-loopback Host settings degrade to memory like other scopes. Monaco remains a later engine swap behind `TextPreviewEngineProps` (now includes optional `showLineNumbers`).
