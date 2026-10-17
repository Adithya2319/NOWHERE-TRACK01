import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase, seedDatabase } from './db.js';
import { loadDemoData, resetDemoData, demoStatus, isDemoUser, isDemoRide, DEMO_STUDENT, DEMO_MODERATOR } from './demo.js';
import { CURRICULUM } from '../src/config/vesit.js';
import { planSemester, validatePolicy, validateSemester } from '../shared/planner.js';
import { availableSeats } from './domain.js';

const DATE = '2026-10-16';
const record = (db, id = DEMO_STUDENT, semester = 1) => JSON.parse(db.prepare('SELECT record FROM academics WHERE user_id=? AND semester=?').get(id, semester).record);
const policy = (db, id = DEMO_STUDENT) => JSON.parse(db.prepare('SELECT policy FROM user_settings WHERE user_id=?').get(id).policy);
const counts = db => Object.fromEntries(['users', 'academics', 'user_settings', 'schedule', 'tasks', 'submissions', 'submission_history', 'points_ledger', 'rides', 'ride_requests', 'notifications', 'directory'].map(table => [table, db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n]));
const withDB = (work, seed = false) => {
  const db = openDatabase(':memory:');
  try { if (seed) seedDatabase(db, DATE); return work(db); }
  finally { db.close(); }
};

test('presentation seed is idempotent, isolated and stable across different load dates', () => withDB(db => {
  assert.equal(demoStatus(db).loaded, false);
  const loaded = loadDemoData(db, { date: DATE });
  assert.deepEqual(loaded, { loaded: true, studentId: DEMO_STUDENT, moderatorId: DEMO_MODERATOR, date: DATE, version: 1 });
  const before = counts(db);
  const firstRecord = record(db);
  loadDemoData(db, { date: '2026-10-17' });
  assert.deepEqual(counts(db), before);
  assert.deepEqual(record(db), firstRecord);
  assert.equal(demoStatus(db).date, DATE);
  assert.equal(isDemoUser(db, DEMO_STUDENT), true);
  assert.equal(isDemoUser(db, 'student-a'), false);
  assert.equal(isDemoRide(db, 'demo-ride-1'), true);
  assert.equal(isDemoRide(db, 'unknown-ride'), false);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM tasks').get().n, 10);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rides').get().n, 8);
  assert.deepEqual(JSON.parse(db.prepare('SELECT contact_preferences FROM users WHERE id=?').get(DEMO_STUDENT).contact_preferences), { emailNotifications: false, pushNotifications: true, preferredContact: 'in-app' });
}));

test('existing users, marks, schedules, tasks, ride requests and directory rows survive loading and reset', () => withDB(db => {
  db.prepare('UPDATE users SET name=? WHERE id=?').run('Existing personal name', 'student-a');
  const priorRecord = record(db, 'student-a');
  priorRecord.marks['26ETBS11'] = { midterm: 11.5 };
  db.prepare('UPDATE academics SET record=? WHERE user_id=? AND semester=1').run(JSON.stringify(priorRecord), 'student-a');
  const originals = Object.fromEntries(['users', 'academics', 'classes', 'schedule', 'tasks', 'submissions', 'rides', 'ride_requests', 'directory', 'participation'].map(table => [table, db.prepare(`SELECT * FROM ${table}`).all()]));
  loadDemoData(db, { date: DATE });
  resetDemoData(db, { date: '2026-10-17' });
  for (const [table, rows] of Object.entries(originals)) {
    const current = db.prepare(`SELECT * FROM ${table}`).all();
    for (const row of rows) assert.ok(current.some(item => JSON.stringify(item) === JSON.stringify(row)), `preserved original ${table} row`);
  }
  assert.deepEqual(record(db, 'student-a'), priorRecord);
}, true));

test('loading preserves edits and read state; explicit reset restores only demo workspace while retaining sessions', () => withDB(db => {
  loadDemoData(db, { date: DATE });
  const edited = record(db);
  edited.marks['26ETBS11'].midterm = 18.5;
  db.prepare('UPDATE academics SET record=?,version=4 WHERE user_id=? AND semester=1').run(JSON.stringify(edited), DEMO_STUDENT);
  db.prepare('UPDATE notifications SET read_at=? WHERE user_id=?').run('2026-10-16T10:30:00.000Z', DEMO_STUDENT);
  db.prepare('UPDATE users SET name=? WHERE id=?').run('Rehearsal edit', DEMO_STUDENT);
  db.prepare('INSERT INTO sessions(id_hash,user_id,expires_at) VALUES(?,?,?)').run('retained-demo-session', DEMO_STUDENT, Date.now() + 3600000);
  db.prepare('INSERT INTO tasks(id,class_id,creator_id,title,deadline,points) VALUES(?,?,?,?,?,?)').run('rehearsal-task', 'demo-fe-a', DEMO_MODERATOR, 'My rehearsal task', '2026-10-20T23:59:00+05:30', 5);
  loadDemoData(db, { date: DATE });
  assert.equal(record(db).marks['26ETBS11'].midterm, 18.5);
  assert.equal(db.prepare('SELECT name FROM users WHERE id=?').get(DEMO_STUDENT).name, 'Rehearsal edit');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read_at IS NULL').get(DEMO_STUDENT).n, 0);
  const status = resetDemoData(db, { date: '2026-10-17' });
  assert.equal(status.date, '2026-10-17');
  assert.equal(record(db).marks['26ETBS11'].midterm, 17);
  assert.equal(db.prepare('SELECT name FROM users WHERE id=?').get(DEMO_STUDENT).name, 'Adithya');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions WHERE id_hash=?').get('retained-demo-session').n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM tasks WHERE id=?').get('rehearsal-task').n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read_at IS NULL').get(DEMO_STUDENT).n, 4);
}));

test('every demo student has valid private partial marks using the existing curriculum and explicit sample policy', () => withDB(db => {
  loadDemoData(db, { date: DATE });
  const students = db.prepare("SELECT id FROM users WHERE demo=1 AND role='student'").all();
  for (const { id } of students) {
    const academic = record(db, id);
    assert.deepEqual(academic.courses, CURRICULUM[1]);
    assert.equal(validateSemester(academic), true);
    assert.equal(validatePolicy(policy(db, id)), true);
    assert.equal(policy(db, id).mode, 'demo');
    assert.match(policy(db, id).source, /not an official VESIT/);
    assert.equal(academic.confirmed, false);
    assert.equal(Object.keys(academic.marks).length, CURRICULUM[1].length);
    assert.equal(academic.marks['26ETBS11'].endSem, undefined);
    assert.equal(academic.marks['26ETES11'].endSem, undefined);
    const plan = planSemester(academic, policy(db, id));
    assert.equal(plan.currentSGPA, null);
    assert.ok(Number.isFinite(plan.projectedSGPA));
    assert.ok(plan.projectedSGPA > 6 && plan.projectedSGPA < 10);
    assert.ok(plan.maxSGPA >= plan.projectedSGPA);
    assert.equal(plan.credits, 18);
    assert.deepEqual(record(db, id, 2).marks, {});
  }
  const meera = record(db, 'demo-student-meera');
  assert.notDeepEqual(meera.events.map(event => event.id), record(db).events.map(event => event.id));
}));

test('attendance counts exactly match individual dated records and actual theory/practical course structure', () => withDB(db => {
  loadDemoData(db, { date: DATE });
  for (const { id } of db.prepare('SELECT id FROM users WHERE demo=1').all()) {
    const academic = record(db, id);
    assert.equal(Object.keys(academic.attendance).length, 8);
    for (const [key, saved] of Object.entries(academic.attendance)) {
      const [code, type] = key.split(':');
      const course = academic.courses.find(course => course.code === code);
      assert.ok(type === 'theory' ? course.credits > course.practicalCredits : course.practicalCredits > 0);
      const events = academic.events.filter(event => event.code === code && event.type === type);
      assert.equal(events.length, saved.total);
      assert.equal(events.filter(event => event.present).length, saved.present);
      assert.ok(events.every(event => event.date < DATE));
      if (type === 'practical') assert.ok(saved.total <= 10);
    }
    assert.equal(new Set(academic.events.map(event => event.id)).size, academic.events.length);
  }
  const percentages = Object.values(record(db).attendance).map(value => 100 * value.present / value.total);
  for (const percentage of [65, 75, 85, 95]) assert.ok(percentages.includes(percentage));
}));

test('sample timetable spans navigation dates and rides have future availability, one booking and a full example', () => withDB(db => {
  loadDemoData(db, { date: DATE });
  const schedule = db.prepare('SELECT * FROM schedule').all();
  assert.ok(schedule.some(item => item.start.startsWith(DATE)));
  assert.ok(schedule.some(item => item.start.startsWith('2026-10-17')));
  assert.ok(schedule.some(item => item.start.startsWith('2026-10-29')));
  assert.ok(schedule.every(item => /DEMO/.test(item.title) && item.demo === 1 && item.location));
  for (const item of schedule) assert.ok(Date.parse(item.end) > Date.parse(item.start));
  for (const entry of record(db).timetable) {
    assert.ok(schedule.some(item => item.start === `${entry.date}T${entry.start}:00+05:30` && item.end === `${entry.date}T${entry.end}:00+05:30` && item.subject_code === entry.code && item.lecture_type === entry.type && item.location === entry.location));
  }
  const rides = db.prepare('SELECT * FROM rides').all();
  assert.ok(rides.every(ride => Date.parse(ride.start) > Date.parse('2026-10-16T23:59:59+05:30') && ride.demo && ride.instant_demo));
  assert.ok(new Set(rides.map(ride => ride.date)).size >= 3);
  assert.equal(availableSeats(db, rides.find(ride => ride.id === 'demo-ride-5')), 2);
  assert.equal(availableSeats(db, rides.find(ride => ride.id === 'demo-ride-7')), 0);
  const own = db.prepare("SELECT * FROM ride_requests WHERE rider_id=? AND status='confirmed'").all(DEMO_STUDENT);
  assert.equal(own.length, 1);
  assert.ok(rides.every(ride => /DEMO simulated ride/.test(ride.cost_note)));
}));

test('tasks have a realistic mix of pending, overdue, submitted and graded with histories and matching points', () => withDB(db => {
  loadDemoData(db, { date: DATE });
  const tasks = db.prepare('SELECT * FROM tasks').all();
  const statusCounts = { Pending: 0, Overdue: 0, Submitted: 0, Graded: 0 };
  for (const task of tasks) {
    assert.ok(CURRICULUM[1].some(course => course.code === task.subject_code));
    assert.ok(task.description && ['low', 'medium', 'high'].includes(task.priority) && task.demo);
    const submission = db.prepare('SELECT * FROM submissions WHERE task_id=? AND user_id=?').get(task.id, DEMO_STUDENT);
    const status = submission ? (submission.status === 'approved' && submission.grade !== null ? 'Graded' : 'Submitted') : task.deadline.slice(0, 10) < DATE ? 'Overdue' : 'Pending';
    statusCounts[status] += 1;
    if (submission) {
      assert.ok(submission.submitted_at > 0);
      assert.ok(db.prepare('SELECT COUNT(*) n FROM submission_history WHERE submission_id=?').get(submission.id).n > 0);
      if (submission.grade !== null) assert.ok(submission.grade >= 0 && submission.grade <= task.max_marks);
    }
  }
  assert.deepEqual(statusCounts, { Pending: 3, Overdue: 2, Submitted: 3, Graded: 2 });
  assert.equal(db.prepare('SELECT SUM(points) n FROM points_ledger WHERE user_id=?').get(DEMO_STUDENT).n, 25);
}));

test('fixtures and edited records persist after closing and reopening SQLite without automatic replacement', () => {
  const directory = mkdtempSync(join(tmpdir(), 'campus360-demo-'));
  const filename = join(directory, 'test.sqlite');
  let db;
  try {
    db = openDatabase(filename);
    loadDemoData(db, { date: DATE });
    const edited = record(db);
    edited.marks['26ETBS11'].internal = 18;
    db.prepare('UPDATE academics SET record=? WHERE user_id=? AND semester=1').run(JSON.stringify(edited), DEMO_STUDENT);
    const expectedCounts = counts(db);
    db.close();
    db = openDatabase(filename);
    assert.equal(demoStatus(db).loaded, true);
    assert.equal(record(db).marks['26ETBS11'].internal, 18);
    assert.deepEqual(counts(db), expectedCounts);
    loadDemoData(db, { date: '2026-10-17' });
    assert.equal(record(db).marks['26ETBS11'].internal, 18);
  } finally {
    db?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('namespace conflicts roll back and invalid dates do not seed any records', () => withDB(db => {
  assert.throws(() => loadDemoData(db, { date: '2026-02-30' }), /valid.*date/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM users').get().n, 0);
  db.prepare('INSERT INTO classes(id,name,college_id) VALUES(?,?,?)').run('demo-fe-a', 'Existing class', 'another-college');
  assert.throws(() => loadDemoData(db, { date: DATE }), /namespace/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM users').get().n, 0);
  assert.equal(db.prepare('SELECT name FROM classes WHERE id=?').get('demo-fe-a').name, 'Existing class');
}));

test('fresh demo has honest directory examples, loading keeps edits and reset preserves unrelated guide rows', () => withDB(db => {
  loadDemoData(db, { date: DATE });
  const entries = db.prepare('SELECT * FROM directory').all().map(row => JSON.parse(row.record));
  assert.equal(entries.length, 5);
  assert.deepEqual(new Set(entries.map(entry => entry.category)), new Set(['Faculty', 'Senior', 'Lab', 'Library', 'Canteen']));
  assert.ok(entries.every(entry => entry.demo && entry.illustrative && entry.collegeId === 'vesit-demo' && entry.name.startsWith('DEMO ') && entry.email.endsWith('@example.test')));
  const library = entries.find(entry => entry.category === 'Library');
  library.location = 'Edited rehearsal library location';
  db.prepare('UPDATE directory SET record=? WHERE id=?').run(JSON.stringify(library), library.id);
  const original = { id: 'personal-directory-entry', name: 'My saved guide entry', location: 'User-entered location' };
  db.prepare('INSERT INTO directory(id,record) VALUES(?,?)').run(original.id, JSON.stringify(original));
  // Even a colliding reserved-looking ID must retain a non-demo record.
  const canteenId = entries.find(entry => entry.category === 'Canteen').id;
  const collision = { id: canteenId, name: 'Earlier user-entered canteen guide', demo: false };
  db.prepare('UPDATE directory SET record=? WHERE id=?').run(JSON.stringify(collision), canteenId);
  loadDemoData(db, { date: DATE });
  assert.equal(JSON.parse(db.prepare('SELECT record FROM directory WHERE id=?').get(library.id).record).location, library.location);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM directory').get().n, 6);
  resetDemoData(db, { date: '2026-10-17' });
  assert.notEqual(JSON.parse(db.prepare('SELECT record FROM directory WHERE id=?').get(library.id).record).location, library.location);
  assert.deepEqual(JSON.parse(db.prepare('SELECT record FROM directory WHERE id=?').get(original.id).record), original);
  assert.deepEqual(JSON.parse(db.prepare('SELECT record FROM directory WHERE id=?').get(canteenId).record), collision);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM directory').get().n, 6);
}));
