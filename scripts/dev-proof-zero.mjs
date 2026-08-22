import { existsSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const nasaDirectory = path.join(repositoryRoot, 'nasa-precip-engine');
const apiDirectory = path.join(repositoryRoot, 'apps', 'api');
const webDirectory = path.join(repositoryRoot, 'apps', 'web');
const nasaEnvironment = readEnvironmentFile(
  path.join(nasaDirectory, '.env'),
);
const children = [];
let shuttingDown = false;

const pythonExecutable = resolvePythonExecutable();
const temporaryDirectory =
  process.env.GEOLENS_TEMP_DIR ??
  nasaEnvironment.GEOLENS_TEMP_DIR;
const sharedEnvironment = {
  ...process.env,
  ...(temporaryDirectory
    ? {
        TEMP: temporaryDirectory,
        TMP: temporaryDirectory,
      }
    : {}),
};

process.on('SIGINT', () => {
  void shutdown(0);
});
process.on('SIGTERM', () => {
  void shutdown(0);
});

try {
  console.log('[GeoLens] Starting the canonical local Proof 0 chain.');
  console.log(`[GeoLens] Python: ${pythonExecutable}`);
  if (temporaryDirectory) {
    console.log(`[GeoLens] Temporary storage: ${temporaryDirectory}`);
  }

  startService(
    'IMERG',
    pythonExecutable,
    [
      '-m',
      'uvicorn',
      'src.main:app',
      '--host',
      '127.0.0.1',
      '--port',
      '8001',
    ],
    nasaDirectory,
    sharedEnvironment,
  );
  const nasaHealth = await waitForJsonHealth(
    'IMERG',
    'http://127.0.0.1:8001/health',
    (payload) =>
      payload.service === 'nasa-precip-engine' &&
      payload.status === 'healthy',
  );
  console.log(
    `[GeoLens] IMERG ready · credentials=${Boolean(
      nasaHealth.earthdataCredentialsConfigured,
    )} · persistent-cache=${Boolean(
      nasaHealth.persistentCacheConfigured,
    )}`,
  );

  startNpmService(
    'API',
    ['run', 'dev'],
    apiDirectory,
    sharedEnvironment,
  );
  const apiHealth = await waitForJsonHealth(
    'API',
    'http://127.0.0.1:3003/health',
    (payload) =>
      payload.service === 'geolens-proof-zero-api' &&
      payload.status === 'ok',
  );
  console.log(
    `[GeoLens] API ready · IMERG=${Boolean(
      apiHealth.runtime?.imergServiceConfigured,
    )} · CLC=${Boolean(
      apiHealth.runtime?.clcRasterConfigured,
    )}`,
  );

  startNpmService(
    'WEB',
    ['run', 'dev'],
    webDirectory,
    sharedEnvironment,
  );
  await waitForPage('WEB', 'http://127.0.0.1:3000');

  console.log('');
  console.log('[GeoLens] Proof 0 inspector: http://127.0.0.1:3000');
  console.log('[GeoLens] GeoLens API:        http://127.0.0.1:3003');
  console.log('[GeoLens] IMERG service:      http://127.0.0.1:8001');
  console.log('[GeoLens] Press Ctrl+C to stop the complete chain.');
} catch (error) {
  console.error(
    `[GeoLens] Startup failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  await shutdown(1);
}

await new Promise(() => {});

function startNpmService(name, args, cwd, environment) {
  const npmCliPath = process.env.npm_execpath;

  if (npmCliPath && existsSync(npmCliPath)) {
    return startService(
      name,
      process.execPath,
      [npmCliPath, ...args],
      cwd,
      environment,
    );
  }

  if (process.platform === 'win32') {
    return startService(
      name,
      process.env.ComSpec ?? 'cmd.exe',
      ['/d', '/s', '/c', ['npm', ...args].join(' ')],
      cwd,
      environment,
    );
  }

  return startService(name, 'npm', args, cwd, environment);
}
function startService(name, command, args, cwd, environment) {
  const child = spawn(command, args, {
    cwd,
    env: environment,
    stdio: 'inherit',
    windowsHide: true,
  });
  children.push({ name, child });

  child.on('error', (error) => {
    if (!shuttingDown) {
      console.error(`[GeoLens] ${name} failed to start: ${error.message}`);
      void shutdown(1);
    }
  });

  child.on('exit', (code, signal) => {
    if (!shuttingDown) {
      console.error(
        `[GeoLens] ${name} stopped unexpectedly ` +
          `(code=${code ?? 'none'}, signal=${signal ?? 'none'}).`,
      );
      void shutdown(code && code > 0 ? code : 1);
    }
  });
}

async function waitForJsonHealth(name, url, validate) {
  const deadline = Date.now() + 120_000;
  let lastReason = 'no response';

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(2_500),
        cache: 'no-store',
      });
      const payload = await response.json();

      if (response.ok && validate(payload)) {
        return payload;
      }

      lastReason = `HTTP ${response.status}`;
    } catch (error) {
      lastReason = error instanceof Error ? error.message : String(error);
    }

    await delay(750);
  }

  throw new Error(`${name} health timeout: ${lastReason}`);
}

async function waitForPage(name, url) {
  const deadline = Date.now() + 120_000;
  let lastReason = 'no response';

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5_000),
        cache: 'no-store',
      });
      if (response.ok) {
        console.log(`[GeoLens] ${name} ready.`);
        return;
      }
      lastReason = `HTTP ${response.status}`;
    } catch (error) {
      lastReason = error instanceof Error ? error.message : String(error);
    }

    await delay(750);
  }

  throw new Error(`${name} page timeout: ${lastReason}`);
}

function resolvePythonExecutable() {
  const configured =
    process.env.GEOLENS_PYTHON ??
    nasaEnvironment.GEOLENS_PYTHON;

  if (configured) {
    const resolved = path.isAbsolute(configured)
      ? configured
      : path.resolve(repositoryRoot, configured);

    if (!existsSync(resolved)) {
      throw new Error(
        `GEOLENS_PYTHON does not exist: ${resolved}`,
      );
    }

    return resolved;
  }

  const localCandidate =
    process.platform === 'win32'
      ? path.join(nasaDirectory, '.venv', 'Scripts', 'python.exe')
      : path.join(nasaDirectory, '.venv', 'bin', 'python');

  return existsSync(localCandidate) ? localCandidate : 'python';
}

function readEnvironmentFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const parsed = {};
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separator = trimmed.indexOf('=');
    if (separator <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function shutdown(exitCode) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log('\n[GeoLens] Stopping local Proof 0 services...');

  for (const { child } of [...children].reverse()) {
    if (child.exitCode !== null || child.pid === undefined) {
      continue;
    }

    if (process.platform === 'win32') {
      spawnSync(
        'taskkill.exe',
        ['/pid', String(child.pid), '/t', '/f'],
        { stdio: 'ignore', windowsHide: true },
      );
    } else {
      child.kill('SIGTERM');
    }
  }

  process.exit(exitCode);
}
