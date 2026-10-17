export class HttpError extends Error { constructor(status,message) { super(message); this.status=status; } }
export function assert(value,status,message) { if (!value) throw new HttpError(status,message); }
export function text(value,name,max=200) { assert(typeof value==='string' && value.trim().length>0 && value.trim().length<=max,400,`Invalid ${name}.`); return value.trim(); }
export function integer(value,name,min,max) { assert(Number.isInteger(value)&&value>=min&&value<=max,400,`Invalid ${name}.`); return value; }
export function instant(value) {
  assert(typeof value==='string'&&validDate(value.slice(0,10))&&/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/.test(value)&&Number.isFinite(Date.parse(value)),400,'A valid dated time with timezone is required.');
  return value;
}
export function validDate(value) { return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(`${value}T12:00:00Z`))&&new Date(`${value}T12:00:00Z`).toISOString().slice(0,10)===value; }
export function interval(start,end) { instant(start);instant(end);assert(Date.parse(end)>Date.parse(start),400,'End must follow start.');assert(Date.parse(end)-Date.parse(start)<=24*3600000,400,'Intervals must be at most one day.'); }
export function overlaps(a,b,buffer=0) { return Date.parse(a.start)<Date.parse(b.end)+buffer*60000 && Date.parse(b.start)<Date.parse(a.end)+buffer*60000; }
export function userPlan(db,userId,excludeSchedule=null) {
  const user=db.prepare('SELECT class_id FROM users WHERE id=?').get(userId);
  const schedule=db.prepare("SELECT s.* FROM schedule s WHERE s.class_id=? AND (s.kind='class' OR EXISTS(SELECT 1 FROM participation p WHERE p.schedule_id=s.id AND p.user_id=?))").all(user.class_id,userId).filter(s=>s.id!==excludeSchedule).map(s=>({...s,kind:s.kind,title:s.title}));
  const rides=db.prepare("SELECT r.* FROM rides r WHERE r.status='available' AND (r.owner_id=? OR EXISTS(SELECT 1 FROM ride_requests q WHERE q.ride_id=r.id AND q.rider_id=? AND q.status='confirmed'))").all(userId,userId).map(r=>({...r,kind:'ride',title:`Ride ${r.pickup} → ${r.dropoff}`}));
  return [...schedule,...rides];
}
export function conflictsFor(db,userId,item,{excludeSchedule=null,excludeRide=null,buffer=0}={}) {
  return userPlan(db,userId,excludeSchedule).filter(p=>!(p.kind==='ride'&&p.id===excludeRide)).filter(p=>overlaps(p,item,Math.max(buffer,p.buffer_minutes||0))).map(p=>({id:p.id,title:p.title,start:p.start,end:p.end,kind:p.kind}));
}
export function availableSeats(db,ride) { return ride.capacity-Number(db.prepare("SELECT COUNT(*) count FROM ride_requests WHERE ride_id=? AND status='confirmed'").get(ride.id).count); }
export function expireRequests(db,now=Date.now()) {
  const ids=db.prepare("SELECT DISTINCT ride_id FROM ride_requests WHERE status='pending' AND (expires_at<=? OR ride_id IN(SELECT id FROM rides WHERE julianday(start)<=julianday(?)))").all(now,new Date(now).toISOString());
  db.prepare("UPDATE ride_requests SET status='expired' WHERE status='pending' AND (expires_at<=? OR ride_id IN(SELECT id FROM rides WHERE julianday(start)<=julianday(?)))").run(now,new Date(now).toISOString());
  for (const {ride_id} of ids) db.prepare('UPDATE rides SET version=version+1 WHERE id=?').run(ride_id);
}
