// Starts the local services KrorDas Docs needs: PostgreSQL, Redis-compatible
// cache, and the documentation server. Everything listens on 127.0.0.1 only.
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');
const http = require('http');

function freePort(preferred) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => {
      const s2 = net.createServer();
      s2.listen(0, '127.0.0.1', () => {
        const { port } = s2.address();
        s2.close(() => resolve(port));
      });
    });
    srv.listen(preferred, '127.0.0.1', () => {
      srv.close(() => resolve(preferred));
    });
  });
}

function waitForPort(port, timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const sock = net.connect(port, '127.0.0.1');
      sock.once('connect', () => {
        sock.destroy();
        resolve();
      });
      sock.once('error', () => {
        sock.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timed out waiting for port ${port}`));
        } else {
          setTimeout(tryOnce, 300);
        }
      });
    };
    tryOnce();
  });
}

function waitForHttp(url, timeoutMs = 180000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) resolve();
        else retry();
      });
      req.on('error', retry);
      req.setTimeout(3000, () => req.destroy());
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Server did not start in time (${url})`));
      } else {
        setTimeout(tryOnce, 500);
      }
    };
    tryOnce();
  });
}

function logStream(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return fs.createWriteStream(file, { flags: 'a' });
}

function pipeTo(child, stream) {
  child.stdout?.pipe(stream, { end: false });
  child.stderr?.pipe(stream, { end: false });
}

async function startPostgres({ dataDir, logDir, password }) {
  const EmbeddedPostgres = require('embedded-postgres').default;
  const port = await freePort(54329);
  const dbDir = path.join(dataDir, 'db');
  const firstRun = !fs.existsSync(path.join(dbDir, 'PG_VERSION'));
  const log = logStream(path.join(logDir, 'postgres.log'));

  // Some builds look for extensions in their compile-time path; point them
  // at the bundled library folder explicitly.
  const osName = process.platform === 'win32' ? 'windows' : process.platform;
  const platformPkg = `@embedded-postgres/${osName}-${process.arch}`;
  let libDir;
  try {
    const pkgDir = path.dirname(require.resolve(`${platformPkg}/package.json`));
    libDir = path.join(pkgDir, 'native', 'lib', 'postgresql');
  } catch {
    libDir = null;
  }

  const pg = new EmbeddedPostgres({
    databaseDir: dbDir,
    user: 'krordas',
    password,
    port,
    persistent: true,
    onLog: (m) => log.write(String(m) + '\n'),
    onError: (m) => log.write('ERR ' + String(m) + '\n'),
    postgresFlags: [
      '-c',
      'listen_addresses=127.0.0.1',
      ...(libDir && fs.existsSync(libDir)
        ? ['-c', `dynamic_library_path=${libDir}`]
        : []),
    ],
  });

  if (firstRun) {
    await pg.initialise();
  }
  await pg.start();
  if (firstRun) {
    await pg.createDatabase('krordas');
  }
  return { pg, port, url: `postgresql://krordas:${encodeURIComponent(password)}@127.0.0.1:${port}/krordas` };
}

async function startRedis({ resourcesDir, dataDir, logDir }) {
  const port = await freePort(63790);
  const exe = process.platform === 'win32' ? 'redis-server.exe' : 'redis-server';
  const bin = path.join(resourcesDir, 'redis', exe);
  const dir = path.join(dataDir, 'cache');
  fs.mkdirSync(dir, { recursive: true });
  const child = spawn(
    bin,
    [
      '--port', String(port),
      '--bind', '127.0.0.1',
      '--save', '',
      '--appendonly', 'no',
      '--protected-mode', 'yes',
      '--dir', dir,
    ],
    { cwd: path.dirname(bin), windowsHide: true },
  );
  pipeTo(child, logStream(path.join(logDir, 'redis.log')));
  await waitForPort(port, 30000);
  return { child, port, url: `redis://127.0.0.1:${port}` };
}

// The server rewrites the client's index.html at startup, so the client build
// is copied out of the read-only editor.asar into the data folder whenever
// the app is updated.
function prepareClientDir(resourcesDir, dataDir) {
  const asarPath = path.join(resourcesDir, 'editor.asar');
  const src = path.join(asarPath, 'apps', 'client', 'dist');
  const dest = path.join(dataDir, 'client');
  let stamp;
  try {
    const st = require('original-fs').statSync(asarPath);
    stamp = `${st.size}-${st.mtimeMs}`;
  } catch {
    stamp = String(Date.now());
  }
  const stampFile = path.join(dest, '.krordas-stamp');
  try {
    if (fs.readFileSync(stampFile, 'utf8') === stamp) return dest;
  } catch {}
  fs.rmSync(dest, { recursive: true, force: true });
  const copy = (from, to) => {
    fs.mkdirSync(to, { recursive: true });
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      const a = path.join(from, e.name);
      const b = path.join(to, e.name);
      if (e.isDirectory()) copy(a, b);
      else fs.writeFileSync(b, fs.readFileSync(a));
    }
  };
  copy(src, dest);
  fs.writeFileSync(stampFile, stamp);
  return dest;
}

async function startServer({ resourcesDir, dataDir, logDir, dbUrl, redisUrl, secret, drawioUrl }) {
  const port = await freePort(37210);
  const appUrl = `http://127.0.0.1:${port}`;
  // The server runs on Electron's own Node.js runtime, which can load the
  // packed editor.asar directly.
  const serverMain = path.join(resourcesDir, 'editor.asar', 'apps', 'server', 'dist', 'main.js');
  const clientDir = prepareClientDir(resourcesDir, dataDir);
  const workDir = path.join(dataDir, 'server');
  fs.mkdirSync(workDir, { recursive: true });
  const storageDir = path.join(dataDir, 'storage');
  fs.mkdirSync(storageDir, { recursive: true });

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    CLIENT_DIST_PATH: clientDir,
    NODE_ENV: 'production',
    APP_URL: appUrl,
    PORT: String(port),
    APP_SECRET: secret,
    JWT_TOKEN_EXPIRES_IN: '3650d',
    DATABASE_URL: dbUrl,
    REDIS_URL: redisUrl,
    STORAGE_DRIVER: 'local',
    LOCAL_STORAGE_PATH: storageDir,
    FILE_UPLOAD_SIZE_LIMIT: '200mb',
    FILE_IMPORT_SIZE_LIMIT: '200mb',
    MAIL_DRIVER: 'smtp',
    MAIL_FROM_NAME: 'KrorDas Docs',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: '2525',
    DISABLE_TELEMETRY: 'true',
    ...(drawioUrl ? { DRAWIO_URL: drawioUrl } : {}),
  };

  const child = spawn(process.execPath, [serverMain], {
    cwd: workDir,
    env,
    windowsHide: true,
  });
  pipeTo(child, logStream(path.join(logDir, 'server.log')));
  await waitForHttp(`${appUrl}/api/health`, 180000).catch(() =>
    waitForHttp(appUrl, 5000),
  );
  return { child, port, appUrl };
}

module.exports = { freePort, startPostgres, startRedis, startServer };
