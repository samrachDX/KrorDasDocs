// Builds desktop/resources from an already-built repo (`pnpm build`):
//   resources/app   – server + client build with production node_modules
//   resources/editor.asar – the same, packed into one archive
//   resources/redis – must be filled by scripts/fetch-redis.* beforehand
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, '..');
const repo = path.resolve(desktop, '..');
const out = path.join(desktop, 'resources');
const app = path.join(out, 'editor');

const copy = (rel) => {
  const src = path.join(repo, rel);
  if (!fs.existsSync(src)) throw new Error(`Missing ${rel}. Run "pnpm build" first.`);
  fs.cpSync(src, path.join(app, rel), { recursive: true });
};

fs.rmSync(app, { recursive: true, force: true });
fs.mkdirSync(app, { recursive: true });

for (const rel of [
  'apps/server/dist',
  'apps/server/package.json',
  'apps/client/dist',
  'apps/client/package.json',
  'packages/editor-ext/dist',
  'packages/editor-ext/package.json',
  'packages/base-formula/dist',
  'packages/base-formula/package.json',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'patches',
]) {
  copy(rel);
}

console.log('Installing production dependencies…');
execSync(
  "pnpm install --frozen-lockfile --prod --filter \"!./apps/client\" --config.node-linker=hoisted --config.allow-unused-patches=true --ignore-scripts=false",
  { cwd: app, stdio: 'inherit', env: { ...process.env, CI: 'true' } },
);

// Workspace self-links are not needed at runtime.
for (const name of ['server', 'client', 'docmost']) {
  fs.rmSync(path.join(app, 'node_modules', name), { recursive: true, force: true });
}

// Replace symlinks with real copies so installers work on every OS.
function dereference(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.name === '.bin') {
      fs.rmSync(p, { recursive: true, force: true });
      continue;
    }
    if (entry.isSymbolicLink()) {
      let real;
      try {
        real = fs.realpathSync(p);
      } catch {
        fs.rmSync(p, { force: true });
        continue;
      }
      fs.rmSync(p, { recursive: true, force: true });
      fs.cpSync(real, p, { recursive: true, dereference: true });
      if (fs.statSync(p).isDirectory()) dereference(p);
    } else if (entry.isDirectory()) {
      dereference(p);
    }
  }
}
for (const nm of [
  'node_modules',
  'apps/server/node_modules',
  'packages/editor-ext/node_modules',
  'packages/base-formula/node_modules',
]) {
  dereference(path.join(app, nm));
}

// Trim type definitions and source maps.
function prune(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) prune(p);
    else if (/\.(d\.[cm]?ts|d\.[cm]?ts\.map|map)$/.test(entry.name)) fs.rmSync(p);
  }
}
prune(path.join(app, 'node_modules'));
for (const f of ['pnpm-lock.yaml', 'pnpm-workspace.yaml']) fs.rmSync(path.join(app, f), { force: true });
fs.mkdirSync(path.join(app, 'data'), { recursive: true });

// Pack the editor into one archive: installing ~30,000 loose files is slow
// on Windows (antivirus scans each one). Native modules stay unpacked.
// The server runs on Electron's own Node.js, which reads .asar archives.
console.log('Packing editor.asar…');
const asar = await import('@electron/asar');
const asarFile = path.join(out, 'editor.asar');
fs.rmSync(asarFile, { force: true });
fs.rmSync(`${asarFile}.unpacked`, { recursive: true, force: true });
await asar.createPackageWithOptions(app, asarFile, { unpack: '*.{node,dll,so,dylib,exe}' });
fs.rmSync(path.join(out, 'node'), { recursive: true, force: true });

const redis = path.join(out, 'redis', process.platform === 'win32' ? 'redis-server.exe' : 'redis-server');
if (!fs.existsSync(redis)) {
  console.warn(`WARNING: ${redis} is missing. Run the fetch-redis script for this platform.`);
}
console.log('Resources ready in', out);
