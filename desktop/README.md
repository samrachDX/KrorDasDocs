# KrorDas Docs – desktop app

Offline, single-user desktop build of KrorDas Docs for Windows and macOS.
Everything runs on your own computer: the app starts a private database,
a cache server and the editor in the background, and signs you in
automatically. Nothing is sent to the internet.

## Features

- **UI Spec table** (`/UI Spec table`, `/UI Spec screen` in the editor):
  ID, Items, Description, Displayed Content / Context and a list of
  Specification fields (Format, Position, Alignment, Text Color, Background,
  Shadow, Image Link, Value, Value Color, …). Colors show a swatch and
  Image Links show a preview.
- **Word import/export**: tables in the
  `ID | Items | Description | Displayed Content / Context | Specification`
  layout import as UI Spec tables, and export back to Word in the same layout.
- **File → Export PDF…** saves the current page as a PDF.
- **File → Sync to Folder (OneDrive)…**: pick a folder inside OneDrive.
  Every page is saved as `.docx` and `.md`, mirroring your page tree, plus a
  full backup per space in `_Backup/<Space>.zip` (import it with
  *Import → Zip* to restore). Sync runs every 10 minutes and when you quit.

Your database lives in the app's data folder (**File → Open Data Folder**),
not in OneDrive: live database files must not be synced by OneDrive.

## Download

Installers are built by GitHub Actions (`.github/workflows/desktop.yml`).
Every build uploads them to the **desktop-dev** pre-release on the repo's
Releases page. Push a tag like `desktop-v1.0.0` to publish a proper release
with:

- `KrorDas-Docs-Setup-<version>.exe` (Windows x64)
- `KrorDas-Docs-<version>-arm64.dmg` (Apple Silicon Mac)
- `KrorDas-Docs-<version>-x64.dmg` (Intel Mac)

The apps are not code-signed. On Windows choose *More info → Run anyway*.
On macOS right-click the app and choose *Open* the first time (or run
`xattr -cr "/Applications/KrorDas Docs.app"`).

## Build locally

```bash
pnpm install && pnpm build                 # from the repo root
desktop/scripts/build-redis-mac.sh         # macOS (Windows: build-redis-win.sh in MSYS2)
cd desktop && npm ci
node scripts/prepare-resources.mjs
node scripts/prepare-kuflow.mjs           # KuFlow diagram editor (draw.io webapp), served offline
npx electron-builder --publish never       # installers land in desktop/release
```

## License

The bundled KuFlow diagram editor is the draw.io webapp (Apache-2.0, Copyright JGraph Ltd and draw.io AG; its licence is shipped as LICENSE-drawio.txt inside kuflow.asar) with KuFlow's customisation from github.com/samrachDX/kuflow.


KrorDas Docs is based on open-source software licensed under the GNU AGPL v3
(see `LICENSE`). If you distribute the app or let others use it over a
network, you must make your modified source code available to them.
The bundled cache server is Valkey (BSD) and the database is PostgreSQL
(PostgreSQL License).
