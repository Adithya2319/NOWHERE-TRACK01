import { openDatabase } from '../server/db.js';
import { readConfig } from '../server/config.js';
import { loadDemoData, resetDemoData } from '../server/demo.js';
import { devFrontendPort } from '../shared/origins.js';

const config = readConfig();
if (config.production || config.authMode !== 'demo') throw Error('Demo data tools require local development with AUTH_MODE=demo.');
const reset = process.argv[2] === 'reset';
if (reset && process.env.CONFIRM_DEMO_RESET !== 'RESET_DEMO_DATA') throw Error('Reset only affects the isolated DEMO rehearsal. Set CONFIRM_DEMO_RESET=RESET_DEMO_DATA to confirm.');
const db = openDatabase(config.dbPath);
try {
  const status = reset ? resetDemoData(db) : loadDemoData(db);
  console.log(`${reset ? 'Restored' : 'Loaded'} DEMO presentation data for Adithya (${status.date}). Existing local accounts are preserved.`);
  console.log(`Run npm.cmd run dev, open http://127.0.0.1:${devFrontendPort(process.env)}/login and choose the Adithya account marked DEMO.`);
} finally { db.close(); }
