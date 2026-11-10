// Builds resources/kuflow.asar: the KuFlow diagram editor (the draw.io webapp
// with KuFlow's customisation) that the desktop app serves locally, so
// diagrams work with no internet connection.
//
// The draw.io webapp (Apache-2.0, JGraph Ltd / draw.io AG) is taken from the
// same commit KuFlow pins as its `drawio` submodule. Set KUFLOW_DRAWIO_DIR to a
// checkout of jgraph/drawio to skip the download.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DRAWIO_COMMIT = '84487b4891cbc0f32d7e30f34cf878c87cb1f414';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, '..');
const out = path.join(desktop, 'resources');
const stage = path.join(out, 'kuflow');

let drawio = process.env.KUFLOW_DRAWIO_DIR;
if (!drawio) {
  drawio = path.join(desktop, '.cache', 'drawio');
  const head = fs.existsSync(path.join(drawio, '.git'))
    ? execSync('git rev-parse HEAD', { cwd: drawio }).toString().trim()
    : '';
  if (head !== DRAWIO_COMMIT) {
    console.log(`Fetching draw.io webapp @ ${DRAWIO_COMMIT.slice(0, 8)}…`);
    fs.rmSync(drawio, { recursive: true, force: true });
    fs.mkdirSync(drawio, { recursive: true });
    const git = (cmd) => execSync(`git ${cmd}`, { cwd: drawio, stdio: 'inherit' });
    git('init -q');
    git('remote add origin https://github.com/jgraph/drawio.git');
    git('sparse-checkout set src/main/webapp');
    git(`fetch -q --depth 1 origin ${DRAWIO_COMMIT}`);
    git('checkout -q FETCH_HEAD');
  }
}
const webapp = path.join(drawio, 'src', 'main', 'webapp');
if (!fs.existsSync(path.join(webapp, 'js', 'app.min.js'))) {
  throw new Error(`No draw.io webapp at ${webapp}`);
}

// Same exclusions as KuFlow's own installer: sources that are already in the
// minified bundles, server-side files and source maps.
const skip = [
  /^WEB-INF(\/|$)/,
  /^shapes(\/|$)/,
  /^js\/diagramly(\/|$)/,
  /^js\/grapheditor(\/|$)/,
  /^mxgraph\/src(\/|$)/,
  /^mxgraph\/mxClient\.js$/,
  /^stencils\/.*\.xml$/,
  /\.map$/,
];

fs.rmSync(stage, { recursive: true, force: true });
fs.cpSync(webapp, stage, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(webapp, src).split(path.sep).join('/');
    return !rel || !skip.some((re) => re.test(rel));
  },
});
fs.copyFileSync(path.join(desktop, 'kuflow', 'PostConfig.js'), path.join(stage, 'js', 'PostConfig.js'));
fs.copyFileSync(path.join(webapp, '..', '..', '..', 'LICENSE'), path.join(stage, 'LICENSE-drawio.txt'));

console.log('Packing kuflow.asar…');
const asar = await import('@electron/asar');
const asarFile = path.join(out, 'kuflow.asar');
fs.rmSync(asarFile, { force: true });
await asar.createPackage(stage, asarFile);
fs.rmSync(stage, { recursive: true, force: true });
console.log(`Wrote ${asarFile} (${(fs.statSync(asarFile).size / 1e6).toFixed(1)} MB)`);
