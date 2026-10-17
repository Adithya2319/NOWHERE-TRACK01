import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, existsSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from './db.js';
import { assignmentStatus, installAssignmentRoutes, taskViews } from './assignments.js';

async function fixture(t, disk = false) {
  const directory = disk ? mkdtempSync(join(tmpdir(), 'campus360-assignments-')) : null;
  const filename = directory ? join(directory, 'assignments.sqlite') : ':memory:';
  const db = openDatabase(filename);
  db.prepare('INSERT INTO classes(id,name) VALUES(?,?)').run('a', 'FE-A');
  db.prepare('INSERT INTO classes(id,name) VALUES(?,?)').run('b', 'FE-B');
  const users = [
    { id: 'student', name: 'A', role: 'student', classId: 'a', demo: false },
    { id: 'other', name: 'B', role: 'student', classId: 'a', demo: false },
    { id: 'moderator', name: 'Mentor', role: 'moderator', classId: 'a', demo: true },
    { id: 'outside', name: 'C', role: 'student', classId: 'b', demo: false },
  ];
  for (const user of users) db.prepare('INSERT INTO users(id,name,class_id,role,demo) VALUES(?,?,?,?,?)').run(user.id, user.name, user.classId, user.role, Number(user.demo));
  const notifications = [];
  const api = express.Router();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = users.find(user => user.id === req.get('x-test-user')) || users[0]; next(); });
  app.use(api);
  installAssignmentRoutes(api, { db, auth: { requireModerator(req, res, next) { if (req.user.role !== 'moderator') return res.status(403).json({ error: 'Moderator required.' }); next(); } }, notify(_db, userId, message) { notifications.push({ userId, ...message }); } });
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    db.close();
    if (directory) {
      for (const suffix of ['', '-wal', '-shm']) if (existsSync(filename + suffix)) unlinkSync(filename + suffix);
      rmdirSync(directory);
    }
  });
  const request = async (path, body, user = 'student') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-user': user }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  const create = async (overrides = {}) => {
    const result = await request('/tasks', { title: 'Arrays practice', deadline: new Date(Date.now() + 86400000).toISOString(), points: 10, description: 'Write and explain an array traversal.', subjectCode: '26ETES11', priority: 'high', maxMarks: 20, ...overrides }, 'moderator');
    assert.equal(result.status, 201, JSON.stringify(result.data));
    return result.data.id;
  };
  return { db, filename, users, notifications, request, create, views(user = 'student') { return taskViews(db, users.find(candidate => candidate.id === user)); } };
}

test('assignment status separates deadlines, saved submissions and reviewed results', () => {
  const now = Date.parse('2026-10-16T12:00:00Z');
  const task = { deadline: '2026-10-16T12:00:00Z' };
  assert.equal(assignmentStatus(task, null, now), 'Overdue');
  assert.equal(assignmentStatus({ deadline: '2026-10-17T12:00:00Z' }, null, now), 'Pending');
  assert.equal(assignmentStatus(task, { status: 'pending', grade: null }, now), 'Submitted');
  assert.equal(assignmentStatus(task, { status: 'rejected', grade: null }, now), 'Submitted');
  assert.equal(assignmentStatus(task, { status: 'approved', grade: null }, now), 'Graded');
  assert.equal(assignmentStatus(task, { status: 'approved', grade: 0 }, now), 'Graded');
});

test('assignment metadata, private submission history and grade survive database reopening', async t => {
  const f = await fixture(t, true);
  const id = await f.create();
  assert.equal(f.views()[0].subject, 'Fundamentals of Programming -C');
  assert.equal(f.views()[0].demo, true);
  assert.equal(f.views()[0].status, 'Pending');
  assert.equal((await f.request(`/tasks/${id}/submit`, { note: 'I tested empty and full arrays.' })).status, 201);
  const submission = f.views()[0].submissions[0];
  assert.equal(submission.status, 'pending');
  assert.ok(submission.submittedAt > 0);
  assert.equal(submission.history[0].action, 'submitted');
  assert.equal(f.views()[0].status, 'Submitted');
  assert.equal(f.views('other')[0].submissions.length, 0);
  assert.equal(f.views('outside').length, 0);
  assert.equal((await f.request(`/submissions/${submission.id}`, { action: 'approve', grade: 17.5, feedback: 'Clear boundary cases.' }, 'moderator')).status, 200);
  const reopened = openDatabase(f.filename);
  try {
    const task = taskViews(reopened, f.users[0])[0];
    assert.equal(task.status, 'Graded');
    assert.equal(task.maxMarks, 20);
    assert.equal(task.submissions[0].grade, 17.5);
    assert.deepEqual(task.submissions[0].history.map(event => event.action), ['submitted', 'approved']);
    assert.equal(reopened.prepare('SELECT COUNT(*) n FROM points_ledger').get().n, 1);
  } finally { reopened.close(); }
  assert.ok(f.notifications.some(message => message.userId === 'student' && message.title === 'Submission saved'));
});

test('duplicate submissions, unsafe resource URLs, cross-class writes and self approval are rejected', async t => {
  const f = await fixture(t);
  const id = await f.create();
  assert.equal((await f.request(`/tasks/${id}/submit`, { note: 'javascript:alert(1)' })).status, 400);
  assert.equal((await f.request(`/tasks/${id}/submit`, { note: 'ftp://example.test/file' })).status, 400);
  assert.equal((await f.request(`/tasks/${id}/submit`, { note: 'https://user:password@example.test/file' })).status, 400);
  assert.equal((await f.request(`/tasks/${id}/submit`, { note: 'Complete' }, 'outside')).status, 404);
  assert.equal((await f.request(`/tasks/${id}/submit`, { note: 'Complete' }, 'moderator')).status, 403);
  assert.equal((await f.request(`/tasks/${id}/submit`, { note: 'https://example.test/work' })).status, 201);
  assert.equal((await f.request(`/tasks/${id}/submit`, { note: 'Duplicate' })).status, 409);
  const submission = f.views()[0].submissions[0];
  assert.equal((await f.request(`/submissions/${submission.id}`, { action: 'approve' })).status, 403);
  // A moderator who is the submitter still cannot self-approve.
  f.users[0].role = 'moderator';
  assert.equal((await f.request(`/submissions/${submission.id}`, { action: 'approve' })).status, 403);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM submission_history').get().n, 1);
});

test('grade validation cannot exceed maxima; repeated approval grants points and history once', async t => {
  const f = await fixture(t);
  const id = await f.create();
  await f.request(`/tasks/${id}/submit`, { note: 'Completed with examples.' });
  const submission = f.views()[0].submissions[0];
  for (const grade of [-0.5, 20.5, 7.25, '10']) assert.equal((await f.request(`/submissions/${submission.id}`, { action: 'approve', grade }, 'moderator')).status, 400);
  assert.equal((await f.request(`/submissions/${submission.id}`, { action: 'reject', grade: 10 }, 'moderator')).status, 400);
  const results = await Promise.all([1, 2].map(() => f.request(`/submissions/${submission.id}`, { action: 'approve', grade: 0 }, 'moderator')));
  assert.deepEqual(results.map(result => result.status), [200, 200]);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM points_ledger').get().n, 1);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM submission_history WHERE action=\'approved\'').get().n, 1);
  assert.equal(f.views()[0].submissions[0].grade, 0);
});

test('publishing validates metadata and keeps legacy class contributions compatible', async t => {
  const f = await fixture(t);
  const body = { title: 'Legacy contribution', deadline: new Date(Date.now() + 86400000).toISOString(), points: 5 };
  assert.equal((await f.request('/tasks', body)).status, 403);
  for (const override of [{ subjectCode: 'NO-COURSE' }, { priority: 'urgent' }, { maxMarks: 0 }, { maxMarks: 0.25 }, { description: 'x'.repeat(3001) }]) {
    assert.equal((await f.request('/tasks', { ...body, ...override }, 'moderator')).status, 400);
  }
  const id = await f.create({ subjectCode: '', maxMarks: null });
  assert.equal(f.views()[0].maxMarks, null);
  f.db.prepare('UPDATE tasks SET deadline=? WHERE id=?').run('2020-01-01T00:00:00Z', id);
  assert.equal(f.views()[0].status, 'Overdue');
  assert.equal((await f.request(`/tasks/${id}/submit`, { note: 'Too late' })).status, 409);
});
