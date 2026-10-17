import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createSemester, DEFAULT_POLICY } from '../src/config/vesit.js';

export function openDatabase(filename = 'data/campus360.sqlite') {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS classes(id TEXT PRIMARY KEY, name TEXT NOT NULL, college_id TEXT NOT NULL DEFAULT 'vesit');
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, provider_id TEXT UNIQUE, phone TEXT, name TEXT NOT NULL,
      class_id TEXT NOT NULL REFERENCES classes(id), role TEXT NOT NULL DEFAULT 'student', membership TEXT NOT NULL DEFAULT 'unverified',
      subjects TEXT NOT NULL DEFAULT '[]', interests TEXT NOT NULL DEFAULT '[]', phone_verified INTEGER NOT NULL DEFAULT 0, onboarding INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sessions(id_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL,
      provider_access TEXT, provider_refresh TEXT, provider_expires INTEGER, revoked INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT OR IGNORE INTO meta VALUES('revision','1');
    CREATE TABLE IF NOT EXISTS academics(user_id TEXT NOT NULL REFERENCES users(id), semester INTEGER NOT NULL CHECK(semester IN(1,2)),
      record TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(user_id,semester));
    CREATE TABLE IF NOT EXISTS user_settings(user_id TEXT PRIMARY KEY REFERENCES users(id), policy TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS schedule(id TEXT PRIMARY KEY, class_id TEXT NOT NULL REFERENCES classes(id), title TEXT NOT NULL,
      start TEXT NOT NULL, end TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'event', tags TEXT NOT NULL DEFAULT '[]', version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS participation(schedule_id TEXT NOT NULL REFERENCES schedule(id), user_id TEXT NOT NULL REFERENCES users(id),
      PRIMARY KEY(schedule_id,user_id));
    CREATE TABLE IF NOT EXISTS rides(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), class_id TEXT NOT NULL REFERENCES classes(id),
      pickup TEXT NOT NULL, dropoff TEXT NOT NULL, date TEXT NOT NULL, departure TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL,
      capacity INTEGER NOT NULL CHECK(capacity>0), buffer_minutes INTEGER NOT NULL DEFAULT 10, cost_note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'available', version INTEGER NOT NULL DEFAULT 1, lat REAL, lng REAL);
    CREATE TABLE IF NOT EXISTS ride_requests(id TEXT PRIMARY KEY, ride_id TEXT NOT NULL REFERENCES rides(id), rider_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL CHECK(status IN('pending','confirmed','rejected','cancelled','expired')), created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL, confirmed_at INTEGER, cancelled_at INTEGER);
    CREATE UNIQUE INDEX IF NOT EXISTS active_ride_request ON ride_requests(ride_id,rider_id) WHERE status IN('pending','confirmed');
    CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, class_id TEXT NOT NULL REFERENCES classes(id), creator_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL, deadline TEXT NOT NULL, points INTEGER NOT NULL CHECK(points>0));
    CREATE TABLE IF NOT EXISTS submissions(id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), user_id TEXT NOT NULL REFERENCES users(id),
      class_id TEXT NOT NULL REFERENCES classes(id), note TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', feedback TEXT NOT NULL DEFAULT '',
      UNIQUE(task_id,user_id));
    CREATE TABLE IF NOT EXISTS points_ledger(id TEXT PRIMARY KEY, submission_id TEXT NOT NULL UNIQUE REFERENCES submissions(id),
      user_id TEXT NOT NULL REFERENCES users(id), class_id TEXT NOT NULL REFERENCES classes(id), points INTEGER NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS directory(id TEXT PRIMARY KEY, record TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS session_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS request_ride_status ON ride_requests(ride_id,status);
    CREATE INDEX IF NOT EXISTS schedule_class ON schedule(class_id,start);
    CREATE INDEX IF NOT EXISTS task_class ON tasks(class_id);
    INSERT OR IGNORE INTO schema_migrations VALUES(1);`);
  // Additive migrations preserve existing records and support the optional,
  // separately owned presentation fixtures. Never replace an existing table.
  const addColumn = (table, name, definition) => {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some(column => column.name === name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  };
  for (const [table, name, definition] of [
    ['users', 'academic_details', "TEXT NOT NULL DEFAULT '{}'"],
    ['users', 'contact_preferences', "TEXT NOT NULL DEFAULT '{}'"],
    ['users', 'demo', 'INTEGER NOT NULL DEFAULT 0'],
    ['tasks', 'description', "TEXT NOT NULL DEFAULT ''"],
    ['tasks', 'subject_code', "TEXT NOT NULL DEFAULT ''"],
    ['tasks', 'priority', "TEXT NOT NULL DEFAULT 'normal'"],
    ['tasks', 'max_marks', 'REAL'],
    ['tasks', 'demo', 'INTEGER NOT NULL DEFAULT 0'],
    ['submissions', 'submitted_at', 'INTEGER'],
    ['submissions', 'grade', 'REAL'],
    ['schedule', 'location', "TEXT NOT NULL DEFAULT ''"],
    ['schedule', 'lecture_type', "TEXT NOT NULL DEFAULT ''"],
    ['schedule', 'subject_code', "TEXT NOT NULL DEFAULT ''"],
    ['schedule', 'demo', 'INTEGER NOT NULL DEFAULT 0'],
    ['rides', 'demo', 'INTEGER NOT NULL DEFAULT 0'],
    ['rides', 'instant_demo', 'INTEGER NOT NULL DEFAULT 0'],
  ]) addColumn(table, name, definition);
  db.exec(`CREATE TABLE IF NOT EXISTS notifications(
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,body TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'info',link TEXT NOT NULL DEFAULT '/',created_at TEXT NOT NULL,read_at TEXT,demo INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS notification_user ON notifications(user_id,created_at);
    CREATE TABLE IF NOT EXISTS submission_history(
      id TEXT PRIMARY KEY,submission_id TEXT NOT NULL REFERENCES submissions(id),actor_id TEXT NOT NULL REFERENCES users(id),
      action TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL);
    INSERT OR IGNORE INTO schema_migrations VALUES(2);`);
  return db;
}

export function transaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = work(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function bump(db) { db.prepare("UPDATE meta SET value=CAST(value AS INTEGER)+1 WHERE key='revision'").run(); }
export function revision(db) { return Number(db.prepare("SELECT value FROM meta WHERE key='revision'").get().value); }
export function ensureAcademics(db, userId) {
  for (const semester of [1, 2]) db.prepare('INSERT OR IGNORE INTO academics(user_id,semester,record) VALUES(?,?,?)').run(userId, semester, JSON.stringify(createSemester(semester)));
}
export function dateInCollege(now = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
export function seedDatabase(db, date = dateInCollege()) {
  transaction(db, () => {
    db.prepare("INSERT OR IGNORE INTO meta VALUES('config',?)").run(JSON.stringify({collegeName:'VESIT',timezone:'Asia/Kolkata',demoDate:date,synthetic:true,policy:DEFAULT_POLICY}));
    for (const [id,name] of [['fe-a','FE-A EXTC'],['fe-b','FE-B EXTC']]) db.prepare('INSERT OR IGNORE INTO classes(id,name) VALUES(?,?)').run(id,name);
    const users = [['student-a','Alex Demo','fe-a','student','approved'],['student-b','Sam Demo','fe-a','student','approved'],['student-c','Jules Demo','fe-a','student','approved'],['moderator-a','Riya Moderator','fe-a','moderator','approved'],['student-d','Taylor Demo','fe-b','student','approved'],['new-student','New Student','fe-a','student','unverified']];
    for (const [id,name,cl,role,membership] of users) {
      db.prepare('INSERT OR IGNORE INTO users(id,name,class_id,role,membership,subjects,interests,onboarding) VALUES(?,?,?,?,?,?,?,1)').run(id,name,cl,role,membership,JSON.stringify(['26ETBS11','26ETES11','26ETPC11']),JSON.stringify(['robotics','electronics']));
      ensureAcademics(db,id);
    }
    const slot = (time) => `${date}T${time}:00+05:30`;
    for (const [id,title,start,end,kind,tags] of [['robotics','Robotics session','16:00','16:30','event',['robotics']],['mathematics','Mathematics-1 — sample timetable','09:00','10:00','class',['26ETBS11']]]) {
      db.prepare('INSERT OR IGNORE INTO schedule(id,class_id,title,start,end,kind,tags) VALUES(?,?,?,?,?,?,?)').run(id,'fe-a',title,slot(start),slot(end),kind,JSON.stringify(tags));
    }
    db.prepare('INSERT OR IGNORE INTO participation VALUES(?,?)').run('robotics','student-b');
    for (const [id,time] of [['ride-1645','16:45'],['ride-1745','17:45']]) {
      const end = new Date(Date.parse(slot(time))+30*60000).toISOString();
      db.prepare('INSERT OR IGNORE INTO rides(id,owner_id,class_id,pickup,dropoff,date,departure,start,end,capacity,lat,lng) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,'student-a','fe-a','Campus gate (illustrative)','Station (illustrative)',date,time,slot(time),end,1,19.045,72.889);
    }
    // A clearly synthetic existing booking makes the schedule-change scenario reproducible.
    db.prepare("INSERT OR IGNORE INTO ride_requests(id,ride_id,rider_id,status,created_at,expires_at,confirmed_at) VALUES('demo-booking','ride-1645','student-b','confirmed',?,?,?)").run(Date.now(),Date.now()+900000,Date.now());
    db.prepare("INSERT OR IGNORE INTO tasks(id,class_id,creator_id,title,deadline,points) VALUES('robotics-task','fe-a','moderator-a','Explain a robotics circuit',?,20)").run(`${date}T23:59:00+05:30`);
    const entries = [
      {id:'senior-robotics',name:'Demo robotics senior',category:'Senior',subjects:['26ETPC11'],interests:['robotics','electronics'],location:'Illustrative lab',email:'robotics@example.test',lat:19.046,lng:72.888},
      {id:'faculty-maths',name:'Demo mathematics mentor',category:'Faculty',subjects:['26ETBS11'],interests:['mathematics'],location:'Illustrative academic block',email:'maths@example.test',lat:19.045,lng:72.888},
      ...['Lab','Library','Canteen'].map((category,index)=>({id:category.toLowerCase(),name:`Demo ${category}`,category,subjects:[],interests:[],location:'Illustrative campus location',email:`${category.toLowerCase()}@example.test`,lat:19.045+index*.0003,lng:72.889+index*.0003})),
    ];
    for (const entry of entries) db.prepare('INSERT OR IGNORE INTO directory VALUES(?,?)').run(entry.id,JSON.stringify({...entry,illustrative:true}));
  });
}
export const newId = () => randomUUID();
