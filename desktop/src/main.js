const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  shell,
  session,
  ipcMain,
} = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { freePort, startPostgres, startRedis, startServer } = require('./services');
const { startKuflowServer } = require('./kuflow-server');
const { FolderSync } = require('./sync');

const APP_NAME = 'KrorDas Docs';
const CREDIT = 'Editor by SamrachDX';
app.setName(APP_NAME);

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const userData = app.getPath('userData');
const dataDir = path.join(userData, 'data');
const logDir = path.join(userData, 'logs');
const configFile = path.join(userData, 'config.json');
const resourcesDir = app.isPackaged
  ? process.resourcesPath
  : path.join(__dirname, '..', 'resources');

let mainWindow;
let splash;
let services = {};
let folderSync;
let syncTimer;
let quitting = false;
// Set when the app is opened again while this instance is still shutting down.
let relaunchAfterQuit = false;

const alive = (win) => !!win && !win.isDestroyed();
// Dialog parent, left out when the window is already closed.
const parentWin = () => (alive(mainWindow) ? [mainWindow] : []);

function log(msg) {
  fs.mkdirSync(logDir, { recursive: true });
  fs.appendFileSync(
    path.join(logDir, 'desktop.log'),
    `[${new Date().toISOString()}] ${msg}\n`,
  );
}

function loadConfig() {
  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  } catch {
    /* first run */
  }
  let changed = false;
  const rnd = () => crypto.randomBytes(32).toString('hex');
  if (!cfg.appSecret) (cfg.appSecret = rnd()), (changed = true);
  if (!cfg.dbPassword) (cfg.dbPassword = rnd()), (changed = true);
  if (!cfg.userPassword) (cfg.userPassword = rnd()), (changed = true);
  if (!cfg.email) (cfg.email = 'me@krordas.local'), (changed = true);
  if (changed) saveConfig(cfg);
  return cfg;
}

function saveConfig(cfg) {
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

let config;

function defaultOneDriveFolder() {
  const env = process.env.OneDrive || process.env.OneDriveConsumer || process.env.OneDriveCommercial;
  if (env && fs.existsSync(env)) return path.join(env, APP_NAME);
  if (process.platform === 'darwin') {
    const cloud = path.join(os.homedir(), 'Library', 'CloudStorage');
    try {
      const od = fs.readdirSync(cloud).find((d) => d.startsWith('OneDrive'));
      if (od) return path.join(cloud, od, APP_NAME);
    } catch {
      /* none */
    }
  }
  return path.join(app.getPath('documents'), APP_NAME);
}

function createSplash() {
  splash = new BrowserWindow({
    width: 460,
    height: 300,
    frame: false,
    resizable: false,
    show: true,
    backgroundColor: '#ffffff',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
  });
  splash.on('closed', () => {
    splash = null;
  });
  splash.loadFile(path.join(__dirname, 'splash.html'));
}

function splashStatus(text) {
  if (!alive(splash)) return;
  splash.webContents
    .executeJavaScript(`window.setStatus && window.setStatus(${JSON.stringify(text)})`)
    .catch(() => {});
}

async function api(route, body, cookie) {
  return fetch(`${services.server.appUrl}/api/${route}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body || {}),
  });
}

function tokenFrom(res) {
  const raw = res.headers.getSetCookie?.() || [res.headers.get('set-cookie') || ''];
  for (const c of raw) {
    const m = /authToken=([^;]+)/.exec(c);
    if (m) return m[1];
  }
  return null;
}

let authToken = null;

// Single-user app: create the workspace on first run and sign in silently.
async function signIn() {
  if (!config.setupDone) {
    const name = (os.userInfo().username || 'Me').slice(0, 50);
    const res = await api('auth/setup', {
      name,
      email: config.email,
      password: config.userPassword,
      workspaceName: APP_NAME,
    });
    if (res.ok || res.status === 400 || res.status === 403) {
      config.setupDone = true;
      saveConfig(config);
    }
    const t = res.ok && tokenFrom(res);
    if (t) authToken = t;
  }
  if (!authToken) {
    const res = await api('auth/login', {
      email: config.email,
      password: config.userPassword,
    });
    authToken = tokenFrom(res);
    if (!authToken) throw new Error(`Sign-in failed (${res.status})`);
  }
  await session.defaultSession.cookies.set({
    url: services.server.appUrl,
    name: 'authToken',
    value: authToken,
    httpOnly: true,
    expirationDate: Math.floor(Date.now() / 1000) + 3600 * 24 * 3650,
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    title: APP_NAME,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.on('page-title-updated', (e, title) => {
    if (!title.includes(APP_NAME)) {
      e.preventDefault();
      mainWindow.setTitle(title ? `${title} - ${APP_NAME}` : APP_NAME);
    }
  });
  // Open external links in the default browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(services.server.appUrl)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
  // Downloads (Word/Markdown/PDF export) ask where to save.
  session.defaultSession.on('will-download', (_e, item) => {
    item.setSaveDialogOptions({
      defaultPath: path.join(
        config.syncFolder || app.getPath('documents'),
        item.getFilename(),
      ),
    });
  });
  mainWindow.loadURL(services.server.appUrl + '/home');
  mainWindow.once('ready-to-show', () => {
    if (alive(mainWindow)) mainWindow.show();
    if (alive(splash)) splash.close();
    splash = null;
  });
}

async function exportPdf() {
  if (!alive(mainWindow)) return;
  const title = (mainWindow.webContents.getTitle() || 'Document')
    .replace(` - ${APP_NAME}`, '')
    .replace(/[<>:"/\\|?*]/g, '-');
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export PDF',
    defaultPath: path.join(config.syncFolder || app.getPath('documents'), `${title}.pdf`),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return;
  const pdf = await mainWindow.webContents.printToPDF({
    printBackground: true,
    pageSize: 'A4',
    margins: { marginType: 'default' },
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate:
      `<div style="font-size:8px;width:100%;text-align:center;color:#888">${APP_NAME} · <span class="pageNumber"></span>/<span class="totalPages"></span></div>`,
  });
  fs.writeFileSync(filePath, pdf);
  shell.showItemInFolder(filePath);
}

async function chooseSyncFolder() {
  const { canceled, filePaths } = await dialog.showOpenDialog(...parentWin(), {
    title: 'Choose a folder to keep your documents in (e.g. OneDrive)',
    defaultPath: config.syncFolder || defaultOneDriveFolder(),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (canceled || !filePaths[0]) return;
  config.syncFolder = filePaths[0];
  saveConfig(config);
  buildMenu();
  await runSync({ notify: true, force: true });
}

async function runSync({ notify = false, force = false } = {}) {
  if (!config.syncFolder || !folderSync) {
    if (notify) await chooseSyncFolder();
    return;
  }
  try {
    const res = await folderSync.sync(config.syncFolder, { force });
    log(`sync ok: ${res.written} page(s) written`);
    if (notify) {
      dialog.showMessageBox(...parentWin(), {
        type: 'info',
        message: 'Sync finished',
        detail: `${res.written} page(s) saved to\n${config.syncFolder}`,
      });
    }
  } catch (err) {
    log(`sync failed: ${err.stack || err}`);
    if (notify) dialog.showErrorBox('Sync failed', String(err.message || err));
  }
}

function about() {
  dialog.showMessageBox(...parentWin(), {
    type: 'info',
    title: `About ${APP_NAME}`,
    message: `${APP_NAME} ${app.getVersion()}`,
    detail: `Technical documentation and UI spec editor.\n${CREDIT}\n\nOpen-source software licensed under the GNU AGPL v3.`,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
  });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [
          {
            label: APP_NAME,
            submenu: [
              { label: `About ${APP_NAME}`, click: about },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'Export PDF…', accelerator: 'CmdOrCtrl+Shift+E', click: exportPdf },
        { type: 'separator' },
        { label: 'Sync to Folder (OneDrive)…', click: chooseSyncFolder },
        {
          label: 'Sync Now',
          accelerator: 'CmdOrCtrl+Shift+S',
          enabled: !!config?.syncFolder,
          click: () => runSync({ notify: true }),
        },
        {
          label: 'Open Sync Folder',
          enabled: !!config?.syncFolder,
          click: () => shell.openPath(config.syncFolder),
        },
        { type: 'separator' },
        { label: 'Open Data Folder', click: () => shell.openPath(userData) },
        ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit' }]),
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    { role: 'windowMenu' },
    ...(isMac ? [] : [{ label: 'Help', submenu: [{ label: `About ${APP_NAME}`, click: about }] }]),
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle('krordas:export-pdf', () => exportPdf());
ipcMain.handle('krordas:sync-now', () => runSync({ notify: true }));
ipcMain.handle('krordas:choose-sync-folder', () => chooseSyncFolder());

// Child processes left behind by a crash would hold ports and the database.
const pidFile = path.join(userData, 'children.json');
function killStaleChildren() {
  try {
    for (const pid of JSON.parse(fs.readFileSync(pidFile, 'utf8'))) {
      try {
        process.kill(pid);
      } catch {}
    }
  } catch {}
  try {
    const pm = path.join(dataDir, 'db', 'postmaster.pid');
    const pid = parseInt(fs.readFileSync(pm, 'utf8').split('\n')[0], 10);
    if (pid) process.kill(pid);
  } catch {}
}
function recordChildren() {
  const pids = [services.redis?.child?.pid, services.server?.child?.pid].filter(Boolean);
  fs.writeFileSync(pidFile, JSON.stringify(pids));
}

// The KuFlow diagram editor is bundled and served locally. Without it (a dev
// run that skipped prepare-kuflow), diagrams fall back to the online editor.
async function startKuflow() {
  const root = path.join(resourcesDir, 'kuflow.asar');
  if (!fs.existsSync(root)) {
    log('kuflow.asar not found; diagrams use the online editor');
    return null;
  }
  try {
    const port = await freePort(37280);
    services.kuflow = await startKuflowServer({ root, port });
    log(`KuFlow editor at ${services.kuflow.url}`);
    return `${services.kuflow.url}/`;
  } catch (err) {
    log(`KuFlow editor failed to start: ${err.stack || err}`);
    return null;
  }
}

async function boot() {
  config = loadConfig();
  killStaleChildren();
  await new Promise((r) => setTimeout(r, 500));
  buildMenu();
  createSplash();
  try {
    splashStatus('Starting database…');
    services.pg = await startPostgres({ dataDir, logDir, password: config.dbPassword });
    splashStatus('Starting cache…');
    services.redis = await startRedis({ resourcesDir, dataDir, logDir });
    splashStatus('Starting editor…');
    const drawioUrl = await startKuflow();
    services.server = await startServer({
      resourcesDir,
      dataDir,
      logDir,
      dbUrl: services.pg.url,
      redisUrl: services.redis.url,
      secret: config.appSecret,
      drawioUrl,
    });
    recordChildren();
    splashStatus('Signing in…');
    await signIn();
    folderSync = new FolderSync({
      appUrl: services.server.appUrl,
      getCookie: async () => `authToken=${authToken}`,
      stateFile: path.join(userData, 'sync-state.json'),
      log,
    });
    createMainWindow();
    syncTimer = setInterval(() => runSync(), 10 * 60 * 1000);
  } catch (err) {
    log(`startup failed: ${err.stack || err}`);
    dialog.showErrorBox(
      `${APP_NAME} could not start`,
      `${err.message || err}\n\nLogs: ${logDir}`,
    );
    await shutdown();
    app.exit(1);
  }
}

async function shutdown() {
  clearInterval(syncTimer);
  try {
    services.server?.child?.kill();
  } catch {}
  try {
    services.redis?.child?.kill();
  } catch {}
  try {
    await services.pg?.pg?.stop();
  } catch {}
}

app.on('second-instance', () => {
  // Opened again while still saving and closing: start again once closed.
  if (quitting) {
    relaunchAfterQuit = true;
    return;
  }
  const win = alive(mainWindow) ? mainWindow : alive(splash) ? splash : null;
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(boot);

app.on('window-all-closed', () => app.quit());

app.on('before-quit', async (e) => {
  if (quitting) return;
  e.preventDefault();
  quitting = true;
  if (config?.syncFolder && folderSync) {
    await Promise.race([runSync(), new Promise((r) => setTimeout(r, 20000))]);
  }
  await shutdown();
  if (relaunchAfterQuit) app.relaunch();
  app.exit(0);
});
