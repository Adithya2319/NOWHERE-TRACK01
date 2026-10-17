import { bump, newId, transaction } from './db.js';
import { assert, integer, text } from './domain.js';
import { CURRICULUM } from '../src/config/vesit.js';

export function ensureAssignmentSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS submission_history(
    id TEXT PRIMARY KEY, submission_id TEXT NOT NULL REFERENCES submissions(id),
    actor_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL
  );`);
}

function coursesFor(db, userId) {
  const courses = Object.values(CURRICULUM).flat();
  for (const row of db.prepare('SELECT record FROM academics WHERE user_id=?').all(userId)) {
    courses.push(...(JSON.parse(row.record).courses || []));
  }
  return new Map(courses.map(course => [course.code, course]));
}

export function assignmentStatus(task, ownSubmission, now = Date.now()) {
  if (ownSubmission) return ownSubmission.grade != null || ownSubmission.status === 'approved' ? 'Graded' : 'Submitted';
  return Date.parse(task.deadline) <= now ? 'Overdue' : 'Pending';
}

export function taskViews(db, user) {
  ensureAssignmentSchema(db);
  const courses = coursesFor(db, user.id);
  return db.prepare('SELECT * FROM tasks WHERE class_id=? ORDER BY deadline, id').all(user.classId).map(task => {
    const submissions = db.prepare(`SELECT s.*,u.name FROM submissions s JOIN users u ON u.id=s.user_id
      WHERE s.task_id=? ORDER BY s.submitted_at,s.id`).all(task.id)
      .filter(submission => user.role === 'moderator' || submission.user_id === user.id)
      .map(submission => ({
        id: submission.id, userId: submission.user_id, classId: submission.class_id,
        name: submission.name, note: submission.note, status: submission.status,
        feedback: submission.feedback, submittedAt: submission.submitted_at,
        grade: submission.grade,
        history: db.prepare('SELECT h.*,u.name actor_name FROM submission_history h JOIN users u ON u.id=h.actor_id WHERE h.submission_id=? ORDER BY h.created_at,h.rowid').all(submission.id)
          .map(event => ({ id: event.id, actorId: event.actor_id, actorName: event.actor_name, action: event.action, note: event.note, createdAt: event.created_at })),
      }));
    const ownSubmission = submissions.find(submission => submission.userId === user.id);
    return {
      id: task.id, classId: task.class_id, creatorId: task.creator_id,
      title: task.title, deadline: task.deadline, points: task.points,
      description: task.description || '', subjectCode: task.subject_code || '',
      subject: courses.get(task.subject_code)?.subject || '', priority: ['low', 'medium', 'high'].includes(task.priority) ? task.priority : 'medium',
      maxMarks: task.max_marks, demo: Boolean(task.demo), status: assignmentStatus(task, ownSubmission),
      ownSubmissionStatus: ownSubmission?.status || null, submissions,
    };
  });
}

function history(db, submissionId, actorId, action, note = '') {
  db.prepare('INSERT INTO submission_history(id,submission_id,actor_id,action,note,created_at) VALUES(?,?,?,?,?,?)')
    .run(newId(), submissionId, actorId, action, note, Date.now());
}

function completionNote(value) {
  const note = text(value, 'completion note', 2000);
  // Notes are rendered as text, never HTML. Do not accept a standalone unsafe resource URL.
  assert(!/^(?:javascript|data|vbscript|file):/i.test(note), 400, 'Resource URLs must use http or https.');
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(note)) {
    let url;
    try { url = new URL(note); } catch { assert(false, 400, 'Invalid resource URL.'); }
    assert(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password, 400, 'Use a safe http or https resource URL without credentials.');
  }
  return note;
}

export function installAssignmentRoutes(api, { db, auth, notify = () => {} }) {
  ensureAssignmentSchema(db);
  api.post('/tasks', auth.requireModerator, (req, res) => {
    const deadline = req.body.deadline;
    assert(typeof deadline === 'string' && Number.isFinite(Date.parse(deadline)) && Date.parse(deadline) > Date.now(), 400, 'Future deadline required.');
    const title = text(req.body.title, 'title', 200);
    const description = req.body.description == null || req.body.description === '' ? '' : text(req.body.description, 'description', 3000);
    const subjectCode = req.body.subjectCode || '';
    assert(typeof subjectCode === 'string' && (!subjectCode || coursesFor(db, req.user.id).has(subjectCode)), 400, 'Choose an existing subject.');
    const priority = req.body.priority ?? 'medium';
    assert(['low', 'medium', 'high'].includes(priority), 400, 'Choose low, medium or high priority.');
    const maxMarks = req.body.maxMarks == null || req.body.maxMarks === '' ? null : req.body.maxMarks;
    assert(maxMarks === null || (Number.isFinite(maxMarks) && maxMarks > 0 && maxMarks <= 1000 && Number.isInteger(maxMarks * 2)), 400, 'Maximum assignment marks must be a positive half-mark increment up to 1000.');
    const points = integer(req.body.points, 'points', 1, 1000);
    const id = newId();
    transaction(db, () => {
      db.prepare('INSERT INTO tasks(id,class_id,creator_id,title,deadline,points,description,subject_code,priority,max_marks,demo) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        .run(id, req.user.classId, req.user.id, title, deadline, points, description, subjectCode, priority, maxMarks, Number(Boolean(req.user.demo)));
      for (const user of db.prepare('SELECT id FROM users WHERE class_id=? AND id!=?').all(req.user.classId, req.user.id)) {
        notify(db, user.id, { title: 'New class assignment', body: `${title} is due ${deadline}.`, kind: 'assignment', link: '/leaderboard' });
      }
      bump(db);
    });
    res.status(201).json({ id });
  });
  api.post('/tasks/:id/submit', (req, res) => {
    const task = db.prepare('SELECT * FROM tasks WHERE id=? AND class_id=?').get(req.params.id, req.user.classId);
    assert(task, 404, 'Task not found in your class.');
    assert(Date.parse(task.deadline) > Date.now(), 409, 'Task deadline passed.');
    assert(task.creator_id !== req.user.id, 403, 'Task creators cannot submit their own task.');
    const note = completionNote(req.body.note);
    transaction(db, () => {
      assert(!db.prepare('SELECT 1 FROM submissions WHERE task_id=? AND user_id=?').get(task.id, req.user.id), 409, 'You have already submitted this task.');
      const id = newId();
      db.prepare('INSERT INTO submissions(id,task_id,user_id,class_id,note,submitted_at) VALUES(?,?,?,?,?,?)').run(id, task.id, req.user.id, req.user.classId, note, Date.now());
      history(db, id, req.user.id, 'submitted', note);
      notify(db, req.user.id, { title: 'Submission saved', body: `${task.title}: your completion note is saved for review.`, kind: 'submission', link: '/leaderboard' });
      notify(db, task.creator_id, { title: 'Submission ready for review', body: `${req.user.name} submitted ${task.title}.`, kind: 'submission', link: '/leaderboard' });
      bump(db);
    });
    res.status(201).json({ submitted: true });
  });
  api.post('/submissions/:id', auth.requireModerator, (req, res) => {
    transaction(db, () => {
      const submission = db.prepare('SELECT s.*,t.points,t.max_marks,t.title FROM submissions s JOIN tasks t ON t.id=s.task_id WHERE s.id=? AND t.class_id=?').get(req.params.id, req.user.classId);
      assert(submission, 404, 'Submission not found.');
      assert(submission.user_id !== req.user.id, 403, 'Self-approval is not allowed.');
      assert(['approve', 'reject'].includes(req.body.action), 400, 'Invalid review action.');
      if (submission.status === 'approved' && req.body.action === 'approve') return;
      assert(submission.status === 'pending', 409, 'Submission already reviewed.');
      const grade = req.body.grade == null || req.body.grade === '' ? null : req.body.grade;
      assert(grade === null || (req.body.action === 'approve' && submission.max_marks != null && typeof grade === 'number' && Number.isFinite(grade) && grade >= 0 && grade <= submission.max_marks && Number.isInteger(grade * 2)), 400, 'A grade requires approval, configured assignment maxima and valid half-mark marks.');
      const status = req.body.action === 'approve' ? 'approved' : 'rejected';
      const feedback = String(req.body.feedback || '').slice(0, 500);
      db.prepare('UPDATE submissions SET status=?,feedback=?,grade=? WHERE id=?').run(status, feedback, grade, submission.id);
      history(db, submission.id, req.user.id, status, feedback);
      if (status === 'approved') db.prepare('INSERT OR IGNORE INTO points_ledger VALUES(?,?,?,?,?,?)').run(newId(), submission.id, submission.user_id, submission.class_id, submission.points, Date.now());
      notify(db, submission.user_id, { title: status === 'approved' ? 'Submission reviewed' : 'Submission needs revision', body: `${submission.title}: ${status}${feedback ? ` — ${feedback}` : ''}.`, kind: 'submission', link: '/leaderboard' });
      bump(db);
    });
    res.json({ saved: true });
  });
}

