import { newId } from './db.js';

export function notify(db, userId, { title, body, kind = 'info', link = '/' }) {
  const id = newId();
  const demo = Boolean(db.prepare('SELECT demo FROM users WHERE id=?').get(userId)?.demo);
  const safeLink = typeof link === 'string' && /^\/(?!\/)/.test(link) && !/[\\\r\n]/.test(link) ? link : '/';
  db.prepare('INSERT INTO notifications(id,user_id,title,body,kind,link,created_at,demo) VALUES(?,?,?,?,?,?,?,?)')
    .run(id, userId, title.slice(0, 160), body.slice(0, 2000), kind, safeLink, new Date().toISOString(), Number(demo));
  return id;
}

export function notificationViews(db, userId) {
  return db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC,id DESC').all(userId)
    .map(row => ({ id: row.id, title: row.title, body: row.body, kind: row.kind, link: row.link,
      createdAt: row.created_at, readAt: row.read_at, demo: Boolean(row.demo) }));
}
