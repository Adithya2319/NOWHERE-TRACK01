import { bump, dateInCollege, transaction } from './db.js';
import { createSemester, CURRICULUM } from '../src/config/vesit.js';
import { DEMO_POLICY, validateSemester } from '../shared/planner.js';

// Presentation fixtures live in their own college and account namespace. Loading
// them never changes the original local accounts or imports a student's marks.
export const DEMO_COLLEGE = 'vesit-demo';
export const DEMO_CLASS = 'demo-fe-a';
export const DEMO_STUDENT = 'demo-adithya';
export const DEMO_MODERATOR = 'demo-moderator';
const VERSION = 1;
const META_KEY = 'demo.presentation';
const accounts = [
  [DEMO_STUDENT, 'Adithya', 'student'],
  [DEMO_MODERATOR, 'Riya Moderator · DEMO', 'moderator'],
  ['demo-student-meera', 'Meera · DEMO', 'student'],
  ['demo-driver-chembur', 'Rohan · DEMO', 'student'],
  ['demo-driver-kurla', 'Sana · DEMO', 'student'],
  ['demo-driver-thane', 'Nikhil · DEMO', 'student'],
];
const profile = { college: 'VESIT, Mumbai', year: 'First Year', branch: 'EXTC', division: 'FE-A', semester: 1, academicYear: '2026-27' };
const preferences = { emailNotifications: false, pushNotifications: true, preferredContact: 'in-app' };
const day = (date, offset) => new Date(Date.parse(`${date}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
const slot = (date, time) => `${date}T${time}:00+05:30`;
const epoch = (date, time = '12:00') => Date.parse(slot(date, time));
const validDate = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T12:00:00Z`)) && day(date, 0) === date;

export function demoStatus(db) {
  const value = db.prepare('SELECT value FROM meta WHERE key=?').get(META_KEY)?.value;
  const saved = value ? JSON.parse(value) : {};
  return { loaded: Boolean(saved.version && db.prepare('SELECT 1 FROM users WHERE id=? AND demo=1').get(DEMO_STUDENT)), studentId: DEMO_STUDENT, moderatorId: DEMO_MODERATOR, date: saved.date || null, version: saved.version || VERSION };
}

export function isDemoUser(db, id) {
  return Boolean(db.prepare('SELECT 1 FROM users u JOIN classes c ON c.id=u.class_id WHERE u.id=? AND u.demo=1 AND c.college_id=?').get(id, DEMO_COLLEGE));
}

export function isDemoRide(db, id) {
  return Boolean(db.prepare('SELECT 1 FROM rides r JOIN classes c ON c.id=r.class_id WHERE r.id=? AND r.demo=1 AND r.instant_demo=1 AND c.college_id=?').get(id, DEMO_COLLEGE));
}

const weekly = [
  ['26ETBS11', 'theory', '09:00', '10:00', 'Sample room A-101'],
  ['26ETES11', 'theory', '10:15', '11:15', 'Sample room A-101'],
  ['26ETPC11', 'theory', '11:30', '12:30', 'Sample room A-102'],
  ['26ETES11', 'practical', '13:15', '15:15', 'Sample programming lab'],
  ['26ETIK11', 'theory', '09:00', '10:00', 'Sample room A-101'],
  ['26VE11', 'theory', '10:15', '11:15', 'Sample seminar room'],
  ['26ETVS11', 'practical', '13:15', '15:15', 'Sample workshop'],
  ['26CC11', 'practical', '15:30', '16:30', 'Sample activity room'],
];

function scheduleForDate(date) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const indices = weekday === 0 ? [4, 7] : weekday % 2 ? [0, 1, 2, 3] : [0, 4, 5, 6];
  return indices.map((index, order) => {
    const [code, type, , , location] = weekly[index];
    const start = ['09:00', '10:15', '11:30', '13:15'][order];
    const end = ['10:00', '11:15', '12:30', type === 'practical' ? '15:15' : '14:15'][order];
    return { code, type, start, end, location, subject: CURRICULUM[1].find(course => course.code === code).subject };
  });
}

function semesterFixtures(userId, date, index) {
  const record = createSemester(1);
  record.demo = true;
  record.target = 8.5;
  const variation = index === 0 ? 0 : (index % 3) * 0.5;
  record.marks = {
    '26ETBS11': { midterm: 17 - variation, internal: 16 },
    '26ETES11': { midterm: 15.5, internal: 17 - variation, termWork: 20 },
    '26ETPC11': { midterm: 12, internal: 13 - variation },
    '26ETIK11': { internal: 16 - variation },
    '26VE11': { internal: 18.5 - variation },
    '26ETVS11': { termWork: 38 - variation },
    '26CC11': { practicalOral: 20.5 - variation },
  };
  const attendancePresent = [13, 15, 17, 9, 19, 18, 7, 7];
  const attendanceTotals = [20, 20, 20, 10, 20, 20, 10, 8];
  weekly.forEach(([code, type], cardIndex) => {
    const total = attendanceTotals[cardIndex];
    const present = attendancePresent[cardIndex] - (index % 2);
    record.attendance[`${code}:${type}`] = { present, total };
    // Twenty theory sessions over five teaching weeks; the fewer practical
    // sessions span eight weeks. Absences are distributed across the period.
    for (let n = 0; n < total; n += 1) {
      const offset = type === 'practical' ? -56 + Math.floor(n * 49 / (total - 1)) : -35 + Math.floor(n / 4) * 7 + n % 4;
      record.events.push({ id: `${userId}-attendance-${cardIndex}-${n}`, code, type, date: day(date, offset), present: (n * 7 % total) < present, demo: true });
    }
    record.attendancePlans = { ...record.attendancePlans, [`${code}:${type}`]: { remaining: 10, plannedPresent: cardIndex === 0 ? 10 : 9, target: 75 } };
  });
  record.timetable = Array.from({ length: 7 }, (_, offset) => {
    const dateOfSession = day(date, offset);
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'long' }).format(new Date(`${dateOfSession}T12:00:00Z`));
    return scheduleForDate(dateOfSession).map(session => ({ ...session, day: weekday, date: dateOfSession, demo: true }));
  }).flat();
  validateSemester(record);
  return record;
}

function addAccounts(db, date) {
  const existingClass = db.prepare('SELECT college_id FROM classes WHERE id=?').get(DEMO_CLASS);
  if (existingClass && existingClass.college_id !== DEMO_COLLEGE) throw Error('The demo namespace is already used by another class; no records were changed.');
  db.prepare('INSERT OR IGNORE INTO classes(id,name,college_id) VALUES(?,?,?)').run(DEMO_CLASS, 'FE-A EXTC · DEMO', DEMO_COLLEGE);
  accounts.forEach(([id, name, role], index) => {
    const existing = db.prepare('SELECT class_id,demo FROM users WHERE id=?').get(id);
    if (existing && (existing.class_id !== DEMO_CLASS || existing.demo !== 1)) throw Error('A demo account ID is already used by another account; no records were changed.');
    db.prepare(`INSERT OR IGNORE INTO users(id,name,class_id,role,membership,subjects,interests,onboarding,academic_details,contact_preferences,demo)
      VALUES(?,?,?,?,'approved',?,?,1,?,?,1)`).run(id, name, DEMO_CLASS, role, JSON.stringify(CURRICULUM[1].map(course => course.code)), JSON.stringify(index % 2 ? ['electronics', 'design'] : ['robotics', 'programming']), JSON.stringify(profile), JSON.stringify(preferences));
    db.prepare('INSERT OR IGNORE INTO academics(user_id,semester,record) VALUES(?,1,?)').run(id, JSON.stringify(semesterFixtures(id, date, index)));
    db.prepare('INSERT OR IGNORE INTO academics(user_id,semester,record) VALUES(?,2,?)').run(id, JSON.stringify(createSemester(2)));
    db.prepare('INSERT OR IGNORE INTO user_settings(user_id,policy) VALUES(?,?)').run(id, JSON.stringify(DEMO_POLICY));
  });
}

function addSchedule(db, date) {
  // This two-week sample is intentionally a presentation schedule, not a
  // purported college timetable. Weekend example sessions keep date navigation
  // demonstrable even when a mentor opens the app on Saturday or Sunday.
  for (let offset = 0; offset < 14; offset += 1) {
    const current = day(date, offset);
    scheduleForDate(current).forEach(({ code, type, location, start, end, subject }, order) => {
      db.prepare(`INSERT OR IGNORE INTO schedule(id,class_id,title,start,end,kind,tags,location,lecture_type,subject_code,demo)
        VALUES(?,?,?,?,?,'class',?,?,?,?,1)`).run(`demo-schedule-${offset}-${order}`, DEMO_CLASS, `${subject} · ${type} · DEMO`, slot(current, start), slot(current, end), JSON.stringify([code, 'DEMO sample timetable']), location, type, code);
    });
  }
  db.prepare(`INSERT OR IGNORE INTO schedule(id,class_id,title,start,end,kind,tags,location,demo)
    VALUES('demo-electronics-club',?,?,?,?,'event',?,?,1)`).run(DEMO_CLASS, 'Electronics club: logic puzzle lab · DEMO', slot(day(date, 1), '16:00'), slot(day(date, 1), '16:45'), JSON.stringify(['electronics', 'DEMO']), 'Sample innovation room');
  db.prepare('INSERT OR IGNORE INTO participation(schedule_id,user_id) VALUES(?,?)').run('demo-electronics-club', DEMO_STUDENT);
}

const tasks = [
  ['Matrices: engineering applications', '26ETBS11', 'Solve five matrix problems and explain one practical application. Submit your reasoning as a completion note.', 1, 'high', 20],
  ['C programming: loops and patterns', '26ETES11', 'Write and test three loop-based pattern programs. Include a sample input and output in your note.', 2, 'high', 20],
  ['Digital systems: truth tables', '26ETPC11', 'Construct truth tables for AND, OR, XOR and a two-input circuit. This example is overdue.', -1, 'high', 10],
  ['Vedic mathematics: calculation journal', '26ETIK11', 'Describe two mental calculation methods with worked examples. This example is overdue.', -2, 'medium', 10],
  ['C programming: functions and arrays', '26ETES11', 'Design a function to summarize an array. Explain boundary cases and provide test examples.', 3, 'medium', 20],
  ['Mathematics: differentiation worksheet', '26ETBS11', 'Complete the differentiation worksheet and describe a step that you found challenging.', -2, 'medium', 20],
  ['Human values: reflection note', '26VE11', 'Write a short reflection about teamwork and responsible use of technology.', -1, 'low', 10],
  ['Workshop: safety and measurement log', '26ETVS11', 'Document sample workshop safety checks and a measurement exercise. Graded sample only.', -4, 'medium', 20],
  ['Digital systems: binary arithmetic', '26ETPC11', 'Demonstrate binary addition, subtraction and a simple representation conversion. Graded sample only.', -5, 'medium', 10],
  ['Co curricular: activity reflection', '26CC11', 'Summarize a sample campus club activity and the skills practiced.', 5, 'low', 10],
];

function addTasks(db, date) {
  tasks.forEach(([title, code, description, offset, priority, maximum], index) => {
    db.prepare(`INSERT OR IGNORE INTO tasks(id,class_id,creator_id,title,deadline,points,description,subject_code,priority,max_marks,demo)
      VALUES(?,?,?,?,?,?,?,?,?,?,1)`).run(`demo-task-${index + 1}`, DEMO_CLASS, DEMO_MODERATOR, `${title} · DEMO`, slot(day(date, offset), '23:59'), index % 2 ? 15 : 10, description, code, priority, maximum);
  });
  for (const [userIndex, [userId]] of accounts.entries()) {
    if (userId === DEMO_MODERATOR) continue;
    for (const taskIndex of [5, 6, 7, 8, 9]) {
      const id = `${userId}-submission-${taskIndex + 1}`;
      const approved = [7, 8].includes(taskIndex);
      const submitted = epoch(day(date, -6 + taskIndex % 3), '18:00');
      const grade = approved ? (taskIndex === 7 ? 17 - userIndex * 0.5 : 7.5) : null;
      const feedback = approved ? 'DEMO feedback: clear explanation; show intermediate steps and check edge cases.' : '';
      db.prepare(`INSERT OR IGNORE INTO submissions(id,task_id,user_id,class_id,note,status,feedback,submitted_at,grade)
        VALUES(?,?,?,?,?,?,?,?,?)`).run(id, `demo-task-${taskIndex + 1}`, userId, DEMO_CLASS, 'DEMO local submission: completed the exercise and added a written explanation. No external file was uploaded.', approved ? 'approved' : 'pending', feedback, submitted, grade);
      db.prepare('INSERT OR IGNORE INTO submission_history(id,submission_id,actor_id,action,note,created_at) VALUES(?,?,?,?,?,?)').run(`${id}-submitted`, id, userId, 'submitted', 'DEMO completion note submitted locally.', submitted);
      if (approved) {
        db.prepare('INSERT OR IGNORE INTO submission_history(id,submission_id,actor_id,action,note,created_at) VALUES(?,?,?,?,?,?)').run(`${id}-approved`, id, DEMO_MODERATOR, 'approved', feedback, submitted + 3600000);
        db.prepare('INSERT OR IGNORE INTO points_ledger(id,submission_id,user_id,class_id,points,created_at) VALUES(?,?,?,?,?,?)').run(`${id}-points`, id, userId, DEMO_CLASS, taskIndex % 2 ? 15 : 10, submitted + 3600000);
      }
    }
  }
}

function addRides(db, date) {
  const routes = [
    ['Chembur station', 'VESIT campus gate', '08:00', 3, 'Estimated example contribution ₹20; no payment collected.'],
    ['Kurla station', 'VESIT campus gate', '08:15', 2, 'Estimated example contribution ₹25; no payment collected.'],
    ['Ghatkopar station', 'VESIT campus gate', '08:20', 3, 'Estimated example contribution ₹35; no payment collected.'],
    ['Thane station', 'VESIT campus gate', '07:30', 3, 'Estimated example contribution ₹60; no payment collected.'],
    ['VESIT campus gate', 'Chembur station', '17:45', 3, 'Estimated example contribution ₹20; no payment collected.'],
    ['VESIT campus gate', 'Kurla station', '18:15', 2, 'Estimated example contribution ₹25; no payment collected.'],
    ['VESIT campus gate', 'Ghatkopar station', '18:30', 1, 'Full simulated ride; no transport arranged.'],
    ['VESIT campus gate', 'Thane station', '19:00', 3, 'Estimated example contribution ₹60; no payment collected.'],
  ];
  routes.forEach(([pickup, dropoff, departure, capacity, cost], index) => {
    const rideDate = day(date, [1, 2, 3, 4, 1, 2, 3, 4][index]);
    const start = slot(rideDate, departure);
    db.prepare(`INSERT OR IGNORE INTO rides(id,owner_id,class_id,pickup,dropoff,date,departure,start,end,capacity,buffer_minutes,cost_note,lat,lng,demo,instant_demo)
      VALUES(?,?,?,?,?,?,?,?,?,?,10,?,?,?,1,1)`).run(`demo-ride-${index + 1}`, accounts[3 + index % 3][0], DEMO_CLASS, pickup, dropoff, rideDate, departure, start, new Date(Date.parse(start) + 30 * 60000).toISOString(), capacity, `DEMO simulated ride. ${cost}`, 19.045 + index * 0.001, 72.889 + index * 0.001);
  });
  const created = epoch(date, '08:00');
  for (const [id, ride, rider] of [['demo-booked-adithya', 'demo-ride-5', DEMO_STUDENT], ['demo-full-ride', 'demo-ride-7', 'demo-student-meera']]) {
    db.prepare(`INSERT OR IGNORE INTO ride_requests(id,ride_id,rider_id,status,created_at,expires_at,confirmed_at)
      VALUES(?,?,?,'confirmed',?,?,?)`).run(id, ride, rider, created, created + 900000, created);
  }
}

function addNotifications(db, date) {
  const items = [
    ['deadline', 'Assignment due tomorrow · DEMO', 'Matrices: engineering applications is due tomorrow at 23:59. Open the class board to submit a completion note.', '/leaderboard'],
    ['attendance', 'Mathematics attendance needs attention · DEMO', 'Your sample Mathematics attendance is 13/20 (65%). The illustrative target is 75%; use the future attendance planner.', '/attendance'],
    ['marks', 'Sample assessment marks available · DEMO', 'Semester 1 marks are populated. Projected SGPA extends assessed percentages using explicitly labelled sample rules.', '/marks'],
    ['schedule', 'FE-A sample timetable available · DEMO', 'Two weeks of example lectures and practicals are ready. Room names and times are unverified presentation fixtures.', '/'],
    ['ride', 'Simulated ride seat confirmed · DEMO', 'An example seat to Chembur is saved in My Rides. No transport is arranged and no payment is collected.', '/rides'],
    ['submission', 'Workshop submission graded · DEMO', 'Example feedback and marks are available on the workshop task. Class points are separate from academic marks.', '/leaderboard'],
  ];
  accounts.forEach(([userId], index) => {
    items.forEach(([kind, title, body, link], itemIndex) => {
      if (kind === 'ride' && userId !== DEMO_STUDENT) return;
      const personalBody = kind === 'attendance' && index % 2 ? body.replace('13/20 (65%)', '12/20 (60%)') : body;
      db.prepare('INSERT OR IGNORE INTO notifications(id,user_id,title,body,kind,link,created_at,read_at,demo) VALUES(?,?,?,?,?,?,?,?,1)').run(`${userId}-notification-${kind}`, userId, title, personalBody, kind, link, new Date(epoch(date, '08:00') + itemIndex * 60000).toISOString(), itemIndex >= 4 ? new Date(epoch(date, '09:00')).toISOString() : null);
    });
  });
}

const directoryFixtures = [
  { id: 'demo-directory-mathematics-mentor', name: 'DEMO Mathematics mentor', category: 'Faculty', subjects: ['26ETBS11'], interests: ['mathematics'], location: 'Sample academic block, room A-101', email: 'maths-mentor@example.test', lat: 19.045, lng: 72.888 },
  { id: 'demo-directory-programming-senior', name: 'DEMO Programming and robotics senior', category: 'Senior', subjects: ['26ETES11', '26ETPC11'], interests: ['programming', 'robotics', 'electronics'], location: 'Sample innovation room', email: 'programming-senior@example.test', lat: 19.046, lng: 72.888 },
  { id: 'demo-directory-programming-lab', name: 'DEMO Programming lab', category: 'Lab', subjects: ['26ETES11'], interests: ['programming'], location: 'Sample lab block, first floor', email: 'programming-lab@example.test', lat: 19.0453, lng: 72.889 },
  { id: 'demo-directory-library', name: 'DEMO Campus library', category: 'Library', subjects: [], interests: ['reading', 'study'], location: 'Sample library block', email: 'library@example.test', lat: 19.0456, lng: 72.8893 },
  { id: 'demo-directory-canteen', name: 'DEMO Campus canteen', category: 'Canteen', subjects: [], interests: [], location: 'Sample courtyard area', email: 'canteen@example.test', lat: 19.0459, lng: 72.8896 },
];

function addDirectory(db) {
  for (const fixture of directoryFixtures) {
    db.prepare('INSERT OR IGNORE INTO directory(id,record) VALUES(?,?)').run(fixture.id, JSON.stringify({ ...fixture, demo: true, illustrative: true, collegeId: DEMO_COLLEGE }));
  }
}

function resetOwnedDirectory(db) {
  for (const { id } of directoryFixtures) {
    const row = db.prepare('SELECT record FROM directory WHERE id=?').get(id);
    if (!row) continue;
    // An ID prefix alone is not permission to remove a pre-existing guide row.
    let saved;
    try { saved = JSON.parse(row.record); } catch { continue; }
    if (saved.demo === true && saved.collegeId === DEMO_COLLEGE) db.prepare('DELETE FROM directory WHERE id=?').run(id);
  }
}

function load(db, date) {
  addAccounts(db, date);
  addSchedule(db, date);
  addTasks(db, date);
  addRides(db, date);
  addNotifications(db, date);
  addDirectory(db);
  db.prepare('INSERT OR IGNORE INTO meta(key,value) VALUES(?,?)').run(META_KEY, JSON.stringify({ version: VERSION, date }));
  bump(db);
  return demoStatus(db);
}

export function loadDemoData(db, { date = dateInCollege() } = {}) {
  if (process.env.NODE_ENV === 'production') throw Error('Presentation data is available only in development.');
  if (!validDate(date)) throw Error('A valid YYYY-MM-DD demo date is required.');
  const existing = demoStatus(db);
  return transaction(db, () => load(db, existing.loaded ? existing.date : date));
}

export function resetDemoData(db, { date = dateInCollege() } = {}) {
  if (process.env.NODE_ENV === 'production') throw Error('Presentation data is available only in development.');
  if (!validDate(date)) throw Error('A valid YYYY-MM-DD demo date is required.');
  return transaction(db, () => {
    // Delete children before parents. Scope includes actions made in the isolated
    // rehearsal workspace, while original accounts/classes remain untouched.
    const users = `SELECT u.id FROM users u JOIN classes c ON c.id=u.class_id WHERE u.demo=1 AND c.college_id='vesit-demo'`;
    const ownedTasks = `SELECT id FROM tasks WHERE class_id='demo-fe-a'`;
    const ownedSubmissions = `SELECT id FROM submissions WHERE task_id IN(${ownedTasks}) OR user_id IN(${users})`;
    db.exec(`DELETE FROM submission_history WHERE submission_id IN(${ownedSubmissions});
      DELETE FROM points_ledger WHERE submission_id IN(${ownedSubmissions}) OR user_id IN(${users});
      DELETE FROM submissions WHERE id IN(${ownedSubmissions});
      DELETE FROM tasks WHERE class_id='demo-fe-a';
      DELETE FROM ride_requests WHERE ride_id IN(SELECT id FROM rides WHERE class_id='demo-fe-a') OR rider_id IN(${users});
      DELETE FROM rides WHERE class_id='demo-fe-a';
      DELETE FROM participation WHERE schedule_id IN(SELECT id FROM schedule WHERE class_id='demo-fe-a') OR user_id IN(${users});
      DELETE FROM schedule WHERE class_id='demo-fe-a';
      DELETE FROM notifications WHERE user_id IN(${users});
      DELETE FROM academics WHERE user_id IN(${users});
      DELETE FROM user_settings WHERE user_id IN(${users});`);
    resetOwnedDirectory(db);
    // Keep account IDs and live sessions stable so reset can be demonstrated
    // without logging out. Only the six known presentation profiles are reset.
    accounts.forEach(([id, name, role], index) => {
      if (isDemoUser(db, id)) db.prepare(`UPDATE users SET name=?,role=?,membership='approved',subjects=?,interests=?,onboarding=1,
        academic_details=?,contact_preferences=? WHERE id=?`).run(name, role, JSON.stringify(CURRICULUM[1].map(course => course.code)), JSON.stringify(index % 2 ? ['electronics', 'design'] : ['robotics', 'programming']), JSON.stringify(profile), JSON.stringify(preferences), id);
    });
    db.prepare('DELETE FROM meta WHERE key=?').run(META_KEY);
    return load(db, date);
  });
}
