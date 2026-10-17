import { createHash } from 'node:crypto';
import { connect } from 'node:net';
import { resolve } from 'node:path';
import { openDatabase, seedDatabase } from './db.js';

export function developmentIdentity(config) {
  return createHash('sha256').update(JSON.stringify({
    database: resolve(config.dbPath || 'data/campus360.sqlite'),
    origins: config.publicOrigin.split(',').map(origin => origin.trim()).sort(),
    authMode: config.authMode,
    cookieSecure: Boolean(config.cookieSecure),
  })).digest('hex');
}

export function prepareDevelopmentDatabase(config) {
  if (config.dbPath === ':memory:') throw new Error('npm.cmd run dev requires a disk DB_PATH so records and sessions persist. Remove DB_PATH=:memory: from your development settings.');
  const db = openDatabase(config.dbPath);
  try {
    const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('schema_migrations','meta')").all();
    const empty = !db.prepare("SELECT 1 FROM meta WHERE key!='revision' OR value!='1' LIMIT 1").get()
      && tables.every(({ name }) => !db.prepare(`SELECT 1 FROM "${name.replaceAll('"', '""')}" LIMIT 1`).get());
    if (config.authMode === 'demo' && empty) {
      seedDatabase(db, process.env.DEMO_DATE);
      return { initialized: true };
    }
    return { initialized: false };
  } finally { db.close(); }
}

function portOccupied(host, port) {
  return new Promise((resolveOccupied, reject) => {
    const socket = connect({ host, port });
    socket.setTimeout(1500);
    socket.once('connect', () => { socket.destroy(); resolveOccupied(true); });
    socket.once('error', error => {
      socket.destroy();
      if (error.code === 'ECONNREFUSED') resolveOccupied(false);
      else reject(new Error(`Cannot inspect port ${port}: ${error.code || error.message}`));
    });
    socket.once('timeout', () => { socket.destroy(); reject(new Error(`Timed out checking port ${port}.`)); });
  });
}

export async function inspectDevelopmentServers(config, frontendPort) {
  if (frontendPort === config.port) throw new Error('DEV_FRONTEND_PORT and PORT must be different.');
  const host = ['0.0.0.0', '::'].includes(config.host) ? '127.0.0.1' : config.host;
  const urlHost = host.includes(':') ? `[${host}]` : host;
  const frontendURL = `http://${urlHost}:${frontendPort}`;
  const apiURL = `http://${urlHost}:${config.port}`;
  const [frontendBusy, apiBusy] = await Promise.all([
    portOccupied(host, frontendPort), portOccupied(host, config.port),
  ]);
  if (!frontendBusy && !apiBusy) return { running: false, frontendURL };
  const healthy = async url => {
    try {
      const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1500) });
      const data = await response.json();
      return response.ok && data.app === 'Campus360' && data.status === 'ok'
        && data.developmentInstance === developmentIdentity(config);
    } catch { return false; }
  };
  if (frontendBusy && apiBusy && (await Promise.all([healthy(frontendURL), healthy(apiURL)])).every(Boolean)) {
    return { running: true, frontendURL };
  }
  throw new Error(`Cannot start Campus360: ${[frontendBusy ? `frontend port ${frontendPort}` : '', apiBusy ? `API port ${config.port}` : ''].filter(Boolean).join(' and ')} already in use. Stop the previous launcher with Ctrl+C, or configure distinct DEV_FRONTEND_PORT and PORT in .env. No existing process or data was changed.`);
}
