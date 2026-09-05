# You've got a friend in md (and csv)

Let's write files that are easy for AI to read — and become better friends
with AI!

![friend-in-md screenshot](docs/images/frend_md.png)

Point it at any folder of markdown (and csv) files (nested folders preserved),
browse and edit them in a rich WYSIWYG editor right in the browser, and search
across the whole tree. Files default to **locked** (read-only) — unlock one
explicitly before editing, then lock it again when you're done.

## Features

- **WYSIWYG editing** — powered by [Milkdown](https://milkdown.dev)/Crepe. The
  editor is always in rendered form, not raw markdown text. Hover the left
  edge of any block for a **+** menu to insert headings, lists, tables, code
  blocks, quotes, and more.
- **Lock / Unlock** — every file starts locked. Click **Unlock** to make it
  editable, **Save** to write changes to disk, **Lock** to make it read-only
  again.
- **CSV editing** — csv files show up in the folder browser too, as an
  editable spreadsheet-style grid (add/remove rows and columns). Same
  lock/unlock/save flow as markdown. Files larger than 2 MB are shown in the
  tree but blocked from opening, so a huge CSV can't lock up the browser.
- **Search** — searches file names and file contents across every markdown and
  csv file under the selected folder, however deeply nested. Click a result to
  jump straight to that file.
- **Native folder picker** — "Browse for folder…" opens your OS's real folder
  dialog (Explorer / Finder / GTK), so you don't have to type a path. Works
  from Windows, macOS, Linux, and WSL2 (see below). The folder picker screen
  also remembers the last 8 folders you've opened (saved in the browser, per
  device) as one-click **Recent folders** shortcuts — click ✕ next to one to
  remove it from the list.
- **Diagrams (Mermaid / PlantUML)** — fenced code blocks written as
  ` ```mermaid ` or ` ```plantuml ` render as live diagrams right in the
  editor. Each rendered diagram gets its own toolbar:
  - **Download PNG** — saves the diagram as a raster image, for both Mermaid
    and PlantUML diagrams.
  - **Download SVG** — Mermaid only. Mermaid renders entirely in your browser,
    so its SVG is trustworthy to save as-is. PlantUML source is instead sent
    to the public `plantuml.com` rendering server (proxied through the
    You've got a friend in md server, with `kroki.io` as a fallback) to come
    back as SVG — since that SVG is unsanitized third-party output,
    You've got a friend in md only offers the rasterized PNG download for it,
    not the raw SVG. Don't put sensitive diagram content in PlantUML blocks if
    that matters to you.
  - **Fullscreen** — expands the diagram to fill the screen (native browser
    fullscreen, `Esc` to exit).
- **Insert image from folder** — while editing, the **🖼 Insert image**
  toolbar button opens a browser scoped to your notes folder. Navigate into
  subfolders and click an image to insert it. The markdown file itself keeps
  an ordinary relative path (e.g. `![](../assets/photo.png)`), so it stays
  readable in any other markdown tool — You've got a friend in md just
  resolves that path to display the image live while you edit.
- **PDF export** — the **🖨 Export PDF** toolbar button opens your browser's
  print dialog scoped to just the note content (sidebar/toolbar/TOC hidden),
  so "Save as PDF" produces a clean copy of what's on screen.
- **Marp slide decks** — a markdown file with `marp: true` in its YAML front
  matter is treated as a [Marp](https://marp.app/) slide deck and opens
  read-only, rendered as actual slides (via
  [`@marp-team/marp-core`](https://github.com/marp-team/marp-core)) instead of
  the normal WYSIWYG editor — no lock/edit controls for these files, edit the
  markdown itself in another tool. A **Theme** dropdown in the toolbar
  switches between Marp's built-in `default` / `gaia` / `uncover` themes plus
  any custom ones, writing the choice back to the file's `theme:` front
  matter. Drop your own theme CSS files (using Marp's `/* @theme name */`
  convention) into a `.marp-themes/` folder at the root of your notes
  directory and they show up in the dropdown too — the same folder is passed
  to `marp-cli` for PowerPoint export, so custom themes render correctly
  there as well. A **🎞 Export PowerPoint** toolbar button converts it to `.pptx` (via
  [`@marp-team/marp-cli`](https://github.com/marp-team/marp-cli)) and
  downloads it — this requires a Chrome/Chromium install on the machine
  running the server.

## How it fits into your workflow

You've got a friend in md is a standalone tool, not something that lives
inside your notes repo. Your markdown notes stay in their own git repository
on GitHub/GitLab (or nowhere at all — git is optional);
You've got a friend in md just points at whatever local folder that repo
happens to be cloned into.

```mermaid
flowchart LR
    A["GitHub / GitLab\nyour-notes repo"] -->|git clone / pull| B["local folder\ne.g. ~/notes"]
    B -.->|npx friend-in-md ~/notes| C["You've got a friend in md server\nlocalhost:4317"]
    C --> D["Browser UI\nbrowse / edit / lock"]
    D -.->|your own git add/commit/push,\nwhenever you want| A
```

- The **notes repo** and the **You've got a friend in md tool** are two
  completely separate things — different repos, different lifecycles.
- You've got a friend in md doesn't need your notes folder to be a git repo at
  all; if it is one, committing/pushing back to GitHub/GitLab is still
  entirely up to you and your normal git tooling, outside of
  You've got a friend in md.

## Usage

```bash
npx friend-in-md
```

No clone, no `npm install` step — `npx` fetches the package from the npm
registry and runs it. Opens a local server (default `http://127.0.0.1:4317`)
and your browser. If you don't pass a folder, pick one from the in-browser
folder picker; you can also launch straight into a folder:

```bash
npx friend-in-md ~/notes
```

Options:

- `--port <n>` — port to listen on (default `4317`). If that port is already
  taken (e.g. by another app or Docker container), You've got a friend in md
  automatically tries the next port up instead of failing.
- `--no-open` — don't auto-open the browser
- `--verbose` — print raw per-request logs (method, status, timing) in
  addition to the normal friendly log. Off by default: everyday use only
  prints short emoji lines like "📄 Opened file: notes.md" for what you
  actually did (open/save/lock/search/etc).

## Desktop app (system tray)

Prefer a persistent icon in your taskbar/menu bar over a browser tab you have
to relaunch? Clone the repo and run the Electron wrapper:

```bash
git clone https://github.com/appare9999/friend-in-md.git
cd friend-in-md
npm install
npm run electron
```

This builds the server/client/electron bundles and launches a tray app.
Click the tray icon (or press **Ctrl/Cmd+Shift+M**) from anywhere to pop up a
small, read-only **quick note** window — for glancing at something you
flagged for recall, not editing. Right-click the tray icon for **Open full
app** (the full editor window), **Open notes folder…**, **Recent folders**,
**Start at login**, and **Quit**. Closing either window just hides it — the
server keeps running in the tray until you Quit.

### Quick note popup

Flag any markdown file as a quick note by adding this to the very top:

```markdown
---
quick: true
---
```

It'll show up in the popup (title = the file's first `# heading`, or its
filename). Flag more than one file and a small switcher appears so you can
flip between them. The popup is view-only by design — open the file in the
full app if you need to edit it.

It's not published as a ready-made installer yet — run `npm run
dist:electron` to build one for your own machine
(`.exe`/`.dmg`/`.AppImage`) via [electron-builder](https://www.electron.build/).
On Linux, some desktop environments (e.g. GNOME) need a tray-icon extension
(like "AppIndicator and KStatusNotifierItem Support") for the tray icon to
show at all.

### Developing the Electron app

`npm run electron` does a full production build every time, which is slow to
iterate on. For active development, use:

```bash
npm run electron:dev
```

This launches the API server, Vite's dev server (with HMR), a `tsc --watch`
for the Electron main-process code, and the Electron app itself — wired
together so that:

- React/UI changes (`QuickNoteApp`, `App`, etc.) hot-reload instantly via
  Vite, no restart.
- Changes to `electron/*.ts` or `src/server/**` recompile automatically and
  restart the Electron process (via [electronmon](https://github.com/catdad/electronmon)).

## Try it: a hands-on tutorial with `test_md/`

This repo ships a `test_md/` folder with a sample `test.md` containing Mermaid
and PlantUML diagrams, so you can try the diagram/image features without
setting up your own notes first. This step needs a clone of the repo (the
`test_md/` folder isn't published in the npm package) — everyday usage against
your own notes only needs `npx friend-in-md <dir>`, no clone.

1. Start You've got a friend in md pointed at the sample folder:

   ```bash
   npx friend-in-md test_md
   ```

2. In the file tree on the left, click **test.md**. It opens **locked**
   (read-only) — you'll see two Mermaid diagrams (a flowchart and a sequence
   diagram) and two PlantUML diagrams (a class diagram and a sequence diagram)
   already rendered.
3. Hover a diagram and try its toolbar:
   - Click **Fullscreen** to expand it, `Esc` to leave fullscreen.
   - Click **Download PNG** to save it as a file (the Mermaid one also offers
     **Download SVG**).
4. Click **Unlock** in the top toolbar to make the file editable. Each
   diagram's code block now shows the raw Mermaid/PlantUML source above the
   rendered preview — edit a line (e.g. change a label in the flowchart) and
   watch the diagram re-render automatically after a short pause.

5. Try image insertion: click **🖼 Insert image** in the toolbar. Since
   `test_md/` has no images yet, first drop an image file (e.g. `logo.png`)
   into the `test_md/` folder on disk, then reopen the picker — it'll show
   up and clicking it inserts it at the cursor.
6. Click **Save** to write your changes to `test_md/test.md`, then **Lock**
   to make it read-only again.

## How locking works

- Every file starts **locked** (read-only) by default.
- **Unlock** — makes the file editable.
- Edit, then **Save** — writes the change to disk.
- **Lock** — makes it read-only again, to guard against accidental edits.
