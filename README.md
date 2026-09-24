# Drawboard Studio

A local-first ink workspace app — pens, touch and 2-in-1 laptops — built with Tauri, React and
TypeScript. Notebooks contain pages ("workspaces") that you draw, write, annotate and arrange on,
with layers, backgrounds, shapes and text. Everything is stored on your machine; there is no account
and no network traffic.

## Features

- **Ink** — pressure-sensitive freehand strokes (perfect-freehand), highlighter with multiply blend,
  stroke eraser, laser pointer trail that fades on its own.
- **Pages** — add, rename, reorder, duplicate and delete pages; thumbnails in the page strip; page
  size presets (Slide 16:9, Presentation 4:3, A4, Letter, Square) plus custom width/height.
- **Backgrounds** — blank, ruled, grid, graph and dotted, with paper colours.
- **Layers** — add, rename, reorder, merge down, delete, plus per-layer hide and lock. New objects go
  on the selected layer; a locked layer falls back to the top-most writable one.
- **Objects** — select, marquee select, move, duplicate, delete, align, reorder (front/back/forward/
  backward), and edit colours, widths and opacity in the properties panel.
- **Shapes & text** — rectangle, ellipse, triangle, diamond, line and arrow (Shift constrains to a
  square); text boxes created by clicking, edited by double-clicking.
- **View & input** — pan, zoom (buttons, `Ctrl` + `=/-`, fit page), input policy (pen only, pen +
  touch, any input), pressure toggle, two-finger pinch zoom, and light/dark theme.
- **Export** — current page or all pages as PNG (2× scale) and the whole notebook as
  `.drawboard.json`, which can be re-imported.
- **Native window chrome** — the app runs frameless with its own actions bar: Windows caption
  buttons on Windows and Linux, macOS traffic lights on macOS. The bar doubles as the toolbar, so
  the whole strip drags the window while the controls inside it stay clickable.

## Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| Select / Pan / Pen / Highlighter / Eraser / Text / Shape / Laser | `V` `H` `P` `G` `E` `T` `R` `L` |
| Undo / Redo | `Ctrl+Z` / `Ctrl+Y` (`Ctrl+Shift+Z`) |
| Select all / Duplicate / Delete | `Ctrl+A` / `Ctrl+D` / `Delete` |
| Zoom in / out / Fit page | `Ctrl+=` / `Ctrl+-` / `Ctrl+0` |
| Previous / Next page | `PageUp` / `PageDown` |
| Clear selection | `Escape` |

## Architecture

- [src/drawing/](src/drawing/) — framework-free engine: `store.ts` (state, history, mutations),
  `ink.ts` (stroke geometry and outline caching), `render.ts` (canvas rendering), `geometry.ts`
  (bounds and hit testing), `types.ts` (schema, presets, defaults), `persistence.ts` (IndexedDB),
  `export.ts` (PNG/JSON export).
- [src/components/studio/](src/components/studio/) — the UI shell: `studio.tsx` (layout, shortcuts),
  `canvas-stage.tsx` (pointer handling and painting), tool rail, properties panel, layers panel,
  page strip, top bar, library, dialogs and `window-chrome.tsx` (frameless title bar and window controls).
- Notebooks are persisted to IndexedDB (`drawboard-studio`) with debounced autosave, so the last
  notebook reopens where you left it.

## Window chrome

The Tauri window is undecorated (`"decorations": false` in [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json)),
so [src/components/studio/window-chrome.tsx](src/components/studio/window-chrome.tsx) draws the title bar
itself. `TitleBar` renders a `<header>` marked `data-tauri-drag-region="deep"` — the whole strip moves the
window, while buttons, inputs and other interactive elements inside it opt out automatically (Tauri maps
double-clicking the strip to maximize/restore on its own). `WindowControls` then adds:

- **Windows / Linux** — 46 px-wide minimize, maximize/restore and close buttons flush to the top-right
  corner, with Windows 11 hover and pressed colours (`#c42b1c` close hover).
- **macOS** — 12 px red/amber/green traffic lights inset 20 px from the left edge, showing their glyphs on
  hover.

The flavour is picked from the user agent (`navigator.userAgentData.platform` first) and can be previewed
on any machine with the `?chrome=macos`, `?chrome=windows` or `?chrome=linux` query parameter, for example
<http://localhost:1420/?chrome=macos>. Outside Tauri the controls render but do nothing.

Because the OS decorations are off, the window permissions the injected drag script needs are granted
explicitly in [src-tauri/capabilities/default.json](src-tauri/capabilities/default.json):
`core:window:allow-close`, `allow-minimize`, `allow-start-dragging` and `allow-toggle-maximize`
(`allow-is-maximized` and `allow-internal-toggle-maximize` already ship in `core:window:default`).
Edge resizing is handled natively for undecorated windows — worth re-checking on Windows and macOS when
building the desktop bundles.

## Development

Dependencies are managed with [Yarn](https://yarnpkg.com) (v4, via `.yarn/releases` — no global install required).

```sh
yarn install      # install dependencies
yarn dev          # run the Vite dev server on http://localhost:1420
yarn build        # type-check and build the frontend into dist/
yarn preview      # preview the production build
yarn tauri        # run the app in Tauri (starts the dev server automatically)
```

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Status

The web front-end is complete and runs in the browser (`yarn dev`) as well as in Tauri. Still to come
on the desktop side: writing `.drawboard.json` files and PDF export through the Tauri filesystem APIs
(today exports go through browser downloads).

## Notice

This program is made hand-in-hand with AI. It is not completely vibe-coded (ew!), just made with ai assistive coding and writing for the README.
