import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, existsSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { developmentIdentity, inspectDevelopmentServers, prepareDevelopmentDatabase } from './dev-support.js';
import { openDatabase } from './db.js';

function temporaryDatabase(t) {
  const directory = mkdtempSync(join(tmpdir(), 'campus360-dev-'));
  const path = join(directory, 'demo.sqlite');
  t.after(() => {
    for (const suffix of ['', '-wal', '-shm']) if (existsSync(path + suffix)) unlinkSync(path + suffix);
    rmdirSync(directory);
  });
  return path;
}

test('one-command demo initialization seeds only an empty database and preserves all subsequent changes', t => {
  const config = { dbPath: temporaryDatabase(t), authMode: 'demo' };
  assert.equal(prepareDevelopmentDatabase(config).initialized, true);
  let db = openDatabase(config.dbPath);
  db.prepare("UPDATE users SET name='My existing profile' WHERE id='student-a'").run();
  const record = JSON.parse(db.prepare("SELECT record FROM academics WHERE user_id='student-a' AND semester=1").get().record);
  record.marks = { '26ETBS11': { midterm: 12.5 } };
  db.prepare("UPDATE academics SET record=? WHERE user_id='student-a' AND semester=1").run(JSON.stringify(record));
  db.close();
  assert.equal(prepareDevelopmentDatabase(config).initialized, false);
  db = openDatabase(config.dbPath);
  assert.equal(db.prepare("SELECT name FROM users WHERE id='student-a'").get().name, 'My existing profile');
  assert.deepEqual(JSON.parse(db.prepare("SELECT record FROM academics WHERE user_id='student-a' AND semester=1").get().record).marks, record.marks);
  db.close();
});

test('provider mode never creates synthetic accounts and partly configured databases are preserved', t => {
  const dbPath = temporaryDatabase(t);
  assert.equal(prepareDevelopmentDatabase({ dbPath, authMode: 'provider' }).initialized, false);
  let db = openDatabase(dbPath);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM users').get().count, 0);
  db.prepare("INSERT INTO classes(id,name) VALUES('custom','Existing class')").run();
  db.close();
  assert.equal(prepareDevelopmentDatabase({ dbPath, authMode: 'demo' }).initialized, false);
  db = openDatabase(dbPath);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM users').get().count, 0);
  assert.equal(db.prepare('SELECT name FROM classes').get().name, 'Existing class');
  db.close();
});

test('development requires durable storage and does not seed a directory-only database', t => {
  assert.throws(() => prepareDevelopmentDatabase({ dbPath: ':memory:', authMode: 'demo' }), /disk DB_PATH/);
  const dbPath = temporaryDatabase(t);
  let db = openDatabase(dbPath);
  db.prepare('INSERT INTO directory VALUES(?,?)').run('existing-contact', JSON.stringify({ name: 'Existing contact' }));
  db.close();
  assert.equal(prepareDevelopmentDatabase({ dbPath, authMode: 'demo' }).initialized, false);
  db = openDatabase(dbPath);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM users').get().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM directory').get().count, 1);
  db.close();
});

async function healthServer(t, data) {
  const server = createServer((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return server.address().port;
}

test('a second launcher reuses only the matching healthy app without starting duplicates', async t => {
  const config = { dbPath: 'data/test.sqlite', publicOrigin: 'http://localhost:5174', authMode: 'demo', cookieSecure: false, host: '127.0.0.1' };
  const health = { app: 'Campus360', status: 'ok', developmentInstance: developmentIdentity(config) };
  config.port = await healthServer(t, health);
  const webPort = await healthServer(t, health);
  assert.deepEqual(await inspectDevelopmentServers(config, webPort), { running: true, frontendURL: `http://127.0.0.1:${webPort}` });
  await assert.rejects(inspectDevelopmentServers({ ...config, dbPath: 'data/another.sqlite' }, webPort), /already in use/);
  await assert.rejects(inspectDevelopmentServers(config, config.port), /must be different/);
});

test('occupied ports belonging to another service produce actionable errors', async t => {
  const config = { host: '127.0.0.1', dbPath: 'data/test.sqlite', publicOrigin: 'http://localhost:5174', authMode: 'demo' };
  config.port = await healthServer(t, { status: 'another-service' });
  const webPort = await healthServer(t, { status: 'another-service' });
  await assert.rejects(inspectDevelopmentServers(config, webPort), /Stop the previous launcher/);
});
