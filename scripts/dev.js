import { concurrently } from 'concurrently';
import { readConfig } from '../server/config.js';
import { devFrontendPort } from '../shared/origins.js';
import { inspectDevelopmentServers, prepareDevelopmentDatabase } from '../server/dev-support.js';

async function main() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major !== 24 || minor < 22) throw new Error('Campus360 requires Node 24.22.0 or a newer Node 24 release.');
  if (process.env.NODE_ENV === 'production') throw new Error('Use npm.cmd start for production. npm.cmd run dev is the local development launcher.');
  const config = readConfig();
  const status = await inspectDevelopmentServers(config, devFrontendPort(process.env));
  if (status.running) {
    console.log(`Campus360 is already running: ${status.frontendURL}`);
    console.log('Reuse that address. To reload environment settings, stop the original launcher with Ctrl+C and run this command again.');
    return;
  }
  const database = prepareDevelopmentDatabase(config);
  if (database.initialized) console.log('Initialized local accounts and sample data in an empty database. Existing databases are never reset.');
  console.log(`Starting Campus360: ${status.frontendURL}`);
  const { result } = concurrently([
    { command: 'node --watch server/index.js', name: 'api' },
    { command: 'vite', name: 'web' },
  ], { killOthersOn: ['failure', 'success'], killTimeout: 5000, prefix: 'name' });
  try { await result; }
  catch (events) {
    if (!Array.isArray(events) || events.some(event => event.exitCode !== 0 && !event.killed)) {
      process.exitCode = 1;
    }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
