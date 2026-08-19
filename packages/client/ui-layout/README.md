# @deepseek-ai/dsh-client-ui-layout

English | [中文](README.zh.md)

Shell plugin: three-column AppFrame (drag handles and concession chain) plus the `ctx.layout` panel-geometry service; it registers into the runtime-owned `root` slot and declares `sidebar`, `conversation`, `details`, and `conversation.empty`. The sidebar resize boundary is an invisible hit strip, while the details boundary retains its floating pill; only details shrinks during concession and then auto-closes. A closed sidebar retains a 56px control rail while details closes to zero width. The package also seats the theme presenter: it consumes resolved `ctx.theme` snapshots and projects them onto the document (`html { color-scheme }` for native UA chrome, `body[data-ds-dark-theme]` from the active color scheme, the theme's alias tokens as inline variables on body, and one owned `<meta name="theme-color">` whose content follows the computed body background). Measuring after palette and token application keeps the rendered background as the single color authority; disposing the presenter removes its metadata node with its other global writes.

AppFrame always mounts the conversation and details columns; a connected Session renders through `SessionProvider`. The layout store starts the sidebar at its default width and both side columns closed. It persists only the three column widths (`sidebar`, `details`, `preview`; `0` = closed) to `localStorage` under `dsh.layout.panels.v1`, so a page reload restores the last-shown panel layout; the viewport-derived narrow pair stays in memory (AppFrame re-derives it from the live viewport). The homepage (no current Session) derives a zero rendered details/preview width. Any current Session — including a blank one — can open the explorer (details) and CM6 preview columns; selecting a different Session or workspace leaves those columns open so every workspace keeps the same capability, while `ExplorerPanel` rebinds to the new session cwd and browse state stays bucketed per cwd. A user close is persisted as last-shown layout. The conversation owner share is empty, while the sidebar owner share contains only `collapsed` and `width`; registrants obtain business data from standard hooks and actions from their own inject faces.

The `/client` exports are the plugin body (`apply`/`inject`), `LayoutController`, and the four owner-share interfaces. AppFrame, the panel store, and the concession solver remain package-internal.

## Model Experience

None, as the layout shell manages browser viewing state; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Panel widths persist across reload; the viewport pair does not** — the three column widths survive a reload under `dsh.layout.panels.v1` (last-shown layout, including a user-closed panel), while `narrow`/`narrowExpanded` are re-derived from the live viewport. Switching Session / workspace keeps open explorer and preview columns; the homepage (no current Session) still renders those tracks at zero width without modifying the stored geometry.
- **Concession-chain auto-close derives a zero width without touching the preferred width** — the panel restores itself when the window widens; consumers must not read the stored details width as the rendered truth.
- **No scroll anchoring during squeeze reflow** — layout changes may move the reader's viewport.
