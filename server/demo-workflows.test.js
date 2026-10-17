import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, unlinkSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from './app.js';
import { openDatabase, seedDatabase, dateInCollege } from './db.js';
import { DEMO_STUDENT } from './demo.js';

const ORIGIN = 'http://127.0.0.1:5174';
const MEERA = 'demo-student-meera';
const counts = db => Object.fromEntries(['users', 'academics', 'tasks', 'submissions', 'submission_history', 'schedule', 'rides', 'ride_requests', 'notifications'].map(table => [table, db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n]));
const unread = state => state.notifications.filter(notification => !notification.readAt).length;

async function fixture(t, { disk = false, options = {} } = {}) {
  const directory = disk ? mkdtempSync(join(tmpdir(), 'campus360-demo-http-')) : null;
  const filename = directory ? join(directory, 'test.sqlite') : ':memory:';
  let db = openDatabase(filename);
  seedDatabase(db, dateInCollege(new Date(Date.now() + 86400000)));
  let server;
  let address;
  const start = async (overrides = {}) => {
    const app = createApp(db, { authMode: 'demo', publicOrigin: ORIGIN, cookieSecure: false, ...options, ...overrides });
    server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
    address = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); };
  await start();
  t.after(async () => {
    await stop();
    db.close();
    if (directory) {
      for (const suffix of ['', '-wal', '-shm']) if (existsSync(filename + suffix)) unlinkSync(filename + suffix);
      rmdirSync(directory);
    }
  });
  const request = async (path, { body, cookie, origin = ORIGIN, method = body === undefined ? 'GET' : 'POST' } = {}) => {
    const response = await fetch(address + path, {
      method,
      headers: { ...(origin === null ? {} : { Origin: origin }), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') };
  };
  const post = (path, cookie, body = {}) => request(path, { cookie, body });
  const login = async (id) => {
    const result = await post('/api/auth/demo', null, { userId: id });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    return result.cookie;
  };
  const state = async cookie => {
    const result = await request('/api/state', { cookie });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    return result.data;
  };
  const load = async () => {
    const result = await post('/api/demo/load');
    assert.equal(result.status, 200, JSON.stringify(result.data));
    return result.data;
  };
  const preview = async (cookie, rideId) => {
    const result = await post('/api/rides/preview', cookie, { rideId });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    return result.data;
  };
  return {
    get db() { return db; }, request, post, login, state, load, preview,
    async restart(overrides = {}) { await stop(); await start(overrides); },
    async reopen() { assert.ok(disk); await stop(); db.close(); db = openDatabase(filename); await start(); },
  };
}

test('demo tools keep origin, authentication, production and provider guards', async t => {
  const f = await fixture(t);
  const before = counts(f.db);
  for (const origin of [null, 'https://foreign.example', 'http://127.0.0.1:9999']) {
    assert.equal((await f.request('/api/demo/load', { body: {}, origin })).status, 403);
    assert.equal((await f.request('/api/demo/reset', { body: { confirm: 'RESET_DEMO_DATA' }, origin })).status, 403);
  }
  assert.deepEqual(counts(f.db), before);
  assert.equal((await f.post('/api/demo/reset', null, { confirm: 'RESET_DEMO_DATA' })).status, 401);
  await f.restart({ production: true });
  assert.equal((await f.post('/api/demo/load')).status, 404);
  const local = await f.login('student-a');
  assert.equal((await f.post('/api/demo/reset', local, { confirm: 'RESET_DEMO_DATA' })).status, 404);
  assert.equal((await f.request('/api/auth/status')).data.demoToolsEnabled, false);
  await f.restart({ authMode: 'provider', apiKey: '' });
  assert.equal((await f.post('/api/demo/load')).status, 404);
  assert.equal((await f.post('/api/auth/demo', null, { userId: 'student-a' })).status, 404);
  assert.equal((await f.post('/api/demo/reset', local, { confirm: 'RESET_DEMO_DATA' })).status, 401);
  assert.equal((await f.request('/api/auth/status')).data.demoToolsEnabled, false);
  assert.deepEqual(counts(f.db), before);
});

test('explicit load is idempotent and keeps independently saved marks and attendance after refresh and restart', async t => {
  const f = await fixture(t, { disk: true });
  const status = await f.load();
  assert.equal(status.loaded, true);
  assert.equal(status.studentId, DEMO_STUDENT);
  assert.equal(status.date, dateInCollege());
  const cookie = await f.login(DEMO_STUDENT);
  const initial = await f.state(cookie);
  assert.equal(initial.me.name, 'Adithya');
  assert.equal(initial.me.demo, true);
  assert.equal(initial.me.academicDetails.academicYear, '2026-27');
  assert.equal(initial.tasks.length, 10);
  assert.equal(initial.rides.length, 8);
  const sem = structuredClone(initial.academics.semesters[1]);
  sem.marks['26ETBS11'].midterm = 18.5;
  assert.equal((await f.post('/api/academics', cookie, { semester: 1, record: sem, version: sem.version })).status, 200);
  assert.equal((await f.post('/api/attendance', cookie, { semester: 1, code: '26ETBS11', type: 'theory', present: true, date: status.date })).status, 201);
  const afterEdit = await f.state(cookie);
  const countAfterEdit = counts(f.db);
  await f.load();
  await f.load();
  assert.deepEqual(counts(f.db), countAfterEdit);
  assert.deepEqual((await f.state(cookie)).academics, afterEdit.academics);
  await f.reopen();
  const persisted = await f.state(cookie);
  assert.deepEqual(persisted.academics, afterEdit.academics);
  assert.deepEqual(persisted.notifications, afterEdit.notifications);
  assert.equal((await f.request('/api/me', { cookie })).data.user.id, DEMO_STUDENT);
});

test('reset requires explicit confirmation and a demo account while preserving original local records and active demo session', async t => {
  const f = await fixture(t);
  const local = await f.login('student-a');
  const personal = structuredClone((await f.state(local)).academics.semesters[1]);
  personal.marks['26ETBS11'] = { midterm: 11.5 };
  assert.equal((await f.post('/api/academics', local, { semester: 1, record: personal, version: personal.version })).status, 200);
  const originals = f.db.prepare("SELECT * FROM academics WHERE user_id='student-a'").all();
  await f.load();
  assert.equal((await f.post('/api/demo/reset', local, { confirm: 'RESET_DEMO_DATA' })).status, 403);
  const cookie = await f.login(DEMO_STUDENT);
  const sem = structuredClone((await f.state(cookie)).academics.semesters[1]);
  sem.marks['26ETBS11'].midterm = 19;
  await f.post('/api/academics', cookie, { semester: 1, record: sem, version: sem.version });
  const edited = (await f.state(cookie)).academics;
  for (const confirm of [undefined, true, 'RESET', 'reset_demo_data']) {
    assert.equal((await f.post('/api/demo/reset', cookie, { confirm })).status, 400);
    assert.deepEqual((await f.state(cookie)).academics, edited);
  }
  assert.equal((await f.post('/api/demo/reset', cookie, { confirm: 'RESET_DEMO_DATA' })).status, 200);
  const reset = await f.state(cookie);
  assert.equal(reset.me.id, DEMO_STUDENT);
  assert.equal(reset.academics.semesters[1].marks['26ETBS11'].midterm, 17);
  assert.equal(unread(reset), 4);
  assert.deepEqual(f.db.prepare("SELECT * FROM academics WHERE user_id='student-a'").all(), originals);
  assert.equal((await f.state(local)).academics.semesters[1].marks['26ETBS11'].midterm, 11.5);
});

test('state and notification read/unread actions stay private for each demo user', async t => {
  const f = await fixture(t);
  await f.load();
  const a = await f.login(DEMO_STUDENT);
  const b = await f.login(MEERA);
  const local = await f.login('student-a');
  const initialA = await f.state(a);
  const initialB = await f.state(b);
  assert.equal(initialB.me.id, MEERA);
  assert.notDeepEqual(initialA.academics.semesters[1].events, initialB.academics.semesters[1].events);
  assert.equal(initialA.tasks.every(task => task.submissions.every(submission => submission.userId === DEMO_STUDENT)), true);
  assert.equal(initialB.tasks.every(task => task.submissions.every(submission => submission.userId === MEERA)), true);
  assert.equal(initialA.notifications.some(notification => initialB.notifications.some(other => other.id === notification.id)), false);
  const originalState = await f.state(local);
  assert.equal(originalState.tasks.some(task => task.demo), false);
  assert.equal(originalState.rides.some(ride => ride.demo), false);
  assert.equal(originalState.schedule.some(item => item.demo), false);
  assert.deepEqual(originalState.notifications, []);
  const notification = initialA.notifications.find(item => !item.readAt);
  assert.equal((await f.post(`/api/notifications/${notification.id}/read`, b, { read: true })).status, 404);
  assert.equal((await f.post(`/api/notifications/${notification.id}/read`, a, { read: 'true' })).status, 400);
  assert.equal((await f.post(`/api/notifications/${notification.id}/read`, a, { read: true })).status, 200);
  assert.equal(unread(await f.state(a)), unread(initialA) - 1);
  assert.equal((await f.post(`/api/notifications/${notification.id}/read`, a, { read: false })).status, 200);
  assert.equal(unread(await f.state(a)), unread(initialA));
  assert.equal((await f.post('/api/notifications/read-all', a)).status, 200);
  assert.equal(unread(await f.state(a)), 0);
  assert.equal(unread(await f.state(b)), unread(initialB));
});

test('attendance, academic edits and honest local assignment submissions generate private persistent notifications', async t => {
  const f = await fixture(t, { disk: true });
  const status = await f.load();
  const a = await f.login(DEMO_STUDENT);
  const b = await f.login(MEERA);
  const initialA = await f.state(a);
  const initialB = await f.state(b);
  assert.equal((await f.post('/api/attendance', a, { semester: 1, code: '26ETBS11', type: 'theory', present: false, date: status.date })).status, 201);
  const sem = structuredClone((await f.state(a)).academics.semesters[1]);
  sem.marks['26ETES11'].midterm = 16.5;
  assert.equal((await f.post('/api/academics', a, { semester: 1, record: sem, version: sem.version })).status, 200);
  const submitted = await f.post('/api/tasks/demo-task-1/submit', a, { note: 'DEMO: I solved five matrices and checked each determinant.' });
  assert.equal(submitted.status, 201);
  const after = await f.state(a);
  assert.equal(after.notifications.length, initialA.notifications.length + 3);
  assert.equal(unread(after), unread(initialA) + 3);
  for (const kind of ['attendance', 'marks', 'submission']) assert.equal(after.notifications.filter(notification => notification.kind === kind).length, initialA.notifications.filter(notification => notification.kind === kind).length + 1);
  assert.equal(after.tasks.find(task => task.id === 'demo-task-1').status, 'Submitted');
  assert.equal(after.tasks.find(task => task.id === 'demo-task-1').submissions[0].history.length, 1);
  assert.deepEqual((await f.state(b)).notifications, initialB.notifications);
  assert.equal((await f.post('/api/tasks/demo-task-1/submit', a, { note: 'Duplicate' })).status, 409);
  assert.equal((await f.state(a)).notifications.length, after.notifications.length);
  await f.reopen();
  assert.deepEqual((await f.state(a)).notifications, after.notifications);
  assert.deepEqual((await f.state(a)).tasks, after.tasks);
});

test('simulated bookings reserve seats, block duplicate/full rides, enforce preview and cancel atomically', async t => {
  const f = await fixture(t, { disk: true });
  await f.load();
  const a = await f.login(DEMO_STUDENT);
  const b = await f.login(MEERA);
  const local = await f.login('student-a');
  const rideId = 'demo-ride-2';
  const initial = (await f.state(a)).rides.find(ride => ride.id === rideId);
  assert.ok(Date.parse(initial.start) > Date.now());
  assert.equal(initial.instantDemo, true);
  assert.equal(initial.remainingSeats, 2);
  assert.equal((await f.post('/api/rides/preview', local, { rideId })).status, 403);
  assert.equal((await f.post(`/api/rides/${rideId}/requests`, null)).status, 401);
  const stale = await f.preview(a, rideId);
  await f.post('/api/notifications/read-all', a); // A preview is bound to the shared revision.
  assert.equal((await f.post(`/api/rides/${rideId}/requests`, a, { ...stale, acknowledgeConflicts: true })).status, 409);
  const previewA = await f.preview(a, rideId);
  assert.equal((await f.post(`/api/rides/${rideId}/requests`, b, { ...previewA, acknowledgeConflicts: true })).status, 409);
  const booked = await f.post(`/api/rides/${rideId}/requests`, a, { ...previewA, acknowledgeConflicts: true });
  assert.equal(booked.status, 201, JSON.stringify(booked.data));
  assert.equal(booked.data.confirmed, true);
  let saved = (await f.state(a)).rides.find(ride => ride.id === rideId);
  assert.equal(saved.remainingSeats, 1);
  assert.equal(saved.requests.find(request => request.id === booked.data.id).status, 'confirmed');
  const duplicate = await f.preview(a, rideId);
  assert.equal((await f.post(`/api/rides/${rideId}/requests`, a, { ...duplicate, acknowledgeConflicts: true })).status, 409);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM ride_requests WHERE ride_id=? AND rider_id=? AND status='confirmed'").get(rideId, DEMO_STUDENT).n, 1);
  const previewB = await f.preview(b, rideId);
  assert.equal((await f.post(`/api/rides/${rideId}/requests`, b, { ...previewB, acknowledgeConflicts: true })).status, 201);
  assert.equal((await f.state(a)).rides.find(ride => ride.id === rideId).remainingSeats, 0);
  const full = await f.preview(a, 'demo-ride-7');
  assert.equal((await f.post('/api/rides/demo-ride-7/requests', a, { ...full, acknowledgeConflicts: true })).status, 409);
  assert.equal((await f.post(`/api/requests/${booked.data.id}`, b, { action: 'cancel' })).status, 403);
  assert.equal((await f.post(`/api/requests/${booked.data.id}`, a, { action: 'cancel' })).status, 200);
  saved = (await f.state(a)).rides.find(ride => ride.id === rideId);
  assert.equal(saved.remainingSeats, 1);
  assert.equal(saved.requests.find(request => request.id === booked.data.id).status, 'cancelled');
  const afterCancel = counts(f.db);
  assert.equal((await f.post(`/api/requests/${booked.data.id}`, a, { action: 'cancel' })).status, 200);
  assert.deepEqual(counts(f.db), afterCancel);
  await f.reopen();
  assert.equal((await f.state(a)).rides.find(ride => ride.id === rideId).remainingSeats, 1);
  assert.ok((await f.state(a)).notifications.some(notification => notification.title === 'DEMO ride booking confirmed'));
  assert.ok((await f.state(a)).notifications.some(notification => notification.title === 'Ride booking cancelled'));
});
