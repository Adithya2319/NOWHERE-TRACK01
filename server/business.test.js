import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, unlinkSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from './app.js'
import { openDatabase, seedDatabase, dateInCollege } from './db.js'

const ORIGIN = 'http://localhost:5173'

async function fixture(t, { disk = false } = {}) {
  const directory = disk ? mkdtempSync(join(tmpdir(), 'campus360-business-')) : null
  const filename = directory ? join(directory, 'test.sqlite') : ':memory:'
  let db = openDatabase(filename)
  const date = dateInCollege(new Date(Date.now() + 86400000))
  seedDatabase(db, date)
  let server
  let address
  const start = async () => {
    const app = createApp(db, { authMode: 'demo', publicOrigin: ORIGIN, cookieSecure: false, sessionHours: 8 })
    server = await new Promise((resolve) => { const value = app.listen(0, '127.0.0.1', () => resolve(value)) })
    address = `http://127.0.0.1:${server.address().port}`
  }
  const stop = async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)) }
  await start()
  t.after(async () => {
    await stop()
    db.close()
    if (directory) {
      // Remove only the exact temporary database files created by this fixture.
      for (const suffix of ['', '-wal', '-shm']) if (existsSync(filename + suffix)) unlinkSync(filename + suffix)
      rmdirSync(directory)
    }
  })
  const request = async (path, { method = 'GET', body, cookie, origin = ORIGIN } = {}) => {
    const response = await fetch(address + path, {
      method,
      headers: { Origin: origin, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
    const data = await response.json()
    return { status: response.status, data, cookie: response.headers.get('set-cookie'), contentType: response.headers.get('content-type') }
  }
  const post = (path, cookie, body = {}) => request(path, { method: 'POST', cookie, body })
  const login = async (userId) => {
    const response = await post('/api/auth/demo', null, { userId })
    assert.equal(response.status, 200, JSON.stringify(response.data))
    return response.cookie
  }
  const state = async (cookie) => {
    const response = await request('/api/state', { cookie })
    assert.equal(response.status, 200, JSON.stringify(response.data))
    return response.data
  }
  const createRide = async (cookie, overrides = {}) => {
    const body = { pickup: 'Test campus gate', dropoff: 'Test station', date, departure: '18:30', capacity: 1, bufferMinutes: 10, ...overrides }
    const preview = await post('/api/rides/offer-preview', cookie, body)
    assert.equal(preview.status, 200, JSON.stringify(preview.data))
    const response = await post('/api/rides', cookie, { ...body, version: preview.data.version, previewToken: preview.data.previewToken })
    assert.equal(response.status, 201, JSON.stringify(response.data))
    return response.data.id
  }
  const ride = async (cookie, id) => (await state(cookie)).rides.find((row) => row.id === id)
  const requestRide = async (cookie, rideId) => {
    const preview = await post('/api/rides/preview', cookie, { rideId })
    assert.equal(preview.status, 200)
    return post(`/api/rides/${rideId}/requests`, cookie, { version: preview.data.version, previewToken: preview.data.previewToken, acknowledgeConflicts: true })
  }
  return {
    get db() { return db }, date, request, post, login, state, createRide, ride, requestRide,
    async reopen() { assert.ok(disk); await stop(); db.close(); db = openDatabase(filename); await start() },
  }
}

test('mutations reject foreign origins and unknown API routes remain JSON', async (t) => {
  const f = await fixture(t)
  const bad = await f.request('/api/auth/demo', { method: 'POST', origin: 'https://attacker.example', body: { userId: 'student-a' } })
  assert.equal(bad.status, 403)
  const cookie = await f.login('student-a')
  const unknown = await f.request('/api/does-not-exist', { cookie })
  assert.equal(unknown.status, 404)
  assert.match(unknown.contentType, /application\/json/)
})

test('ride requests enforce ownership, no self-booking, no duplicates, and private request details', async (t) => {
  const f = await fixture(t)
  const a = await f.login('student-a'), b = await f.login('student-b'), c = await f.login('student-c')
  const id = await f.createRide(a)
  assert.equal((await f.requestRide(a, id)).status, 400)
  assert.equal((await f.requestRide(b, id)).status, 201)
  const request = (await f.ride(b, id)).requests[0]
  assert.equal(request.status, 'pending')
  assert.equal((await f.ride(a, id)).remainingSeats, 1)
  assert.equal((await f.ride(c, id)).requests.length, 0)
  assert.equal((await f.requestRide(b, id)).status, 409)
  assert.equal((await f.post(`/api/requests/${request.id}`, c, { action: 'confirm' })).status, 403)
  assert.equal((await f.post(`/api/requests/${request.id}`, b, { action: 'confirm' })).status, 403)
  assert.equal((await f.post(`/api/requests/${request.id}`, a, { action: 'cancel' })).status, 403)
})

test('simultaneous final-seat approvals have one winner; confirmation and cancellation retries are idempotent', async (t) => {
  const f = await fixture(t)
  const a = await f.login('student-a'), b = await f.login('student-b'), c = await f.login('student-c')
  const id = await f.createRide(a)
  assert.equal((await f.requestRide(b, id)).status, 201)
  assert.equal((await f.requestRide(c, id)).status, 201)
  const ride = await f.ride(a, id)
  assert.equal(ride.remainingSeats, 1)
  const previews = await Promise.all(ride.requests.map((row) => f.post(`/api/requests/${row.id}/preview`, a)))
  const results = await Promise.all(ride.requests.map((row, index) => f.post(`/api/requests/${row.id}`, a, { action: 'confirm', version: previews[index].data.version, previewToken: previews[index].data.previewToken, acknowledgeConflicts: true })))
  assert.deepEqual(results.map((row) => row.status).sort(), [200, 409])
  const filled = await f.ride(a, id)
  assert.equal(filled.remainingSeats, 0)
  assert.equal(filled.requests.filter((row) => row.status === 'confirmed').length, 1)
  const confirmed = filled.requests.find((row) => row.status === 'confirmed')
  assert.equal((await f.post(`/api/requests/${confirmed.id}`, a, { action: 'confirm', version: 0 })).status, 200)
  assert.equal((await f.ride(a, id)).remainingSeats, 0)
  const riderCookie = confirmed.riderId === 'student-b' ? b : c
  assert.equal((await f.post(`/api/requests/${confirmed.id}`, riderCookie, { action: 'cancel' })).status, 200)
  assert.equal((await f.post(`/api/requests/${confirmed.id}`, riderCookie, { action: 'cancel' })).status, 200)
  assert.equal((await f.ride(a, id)).remainingSeats, 1)
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM ride_requests WHERE ride_id=? AND status='confirmed'").get(id).n, 0)
})

test('pending request expiration preserves the ride offer, history, and available seat', async (t) => {
  const f = await fixture(t)
  const a = await f.login('student-a'), b = await f.login('student-b')
  const id = await f.createRide(a)
  assert.equal((await f.requestRide(b, id)).status, 201)
  const before = await f.ride(a, id)
  f.db.prepare('UPDATE ride_requests SET expires_at=? WHERE id=?').run(Date.now() - 1, before.requests[0].id)
  const after = await f.ride(a, id)
  assert.equal(after.status, 'available')
  assert.equal(after.remainingSeats, 1)
  assert.equal(after.requests[0].status, 'expired')
  assert.ok(after.version > before.version)
  assert.equal((await f.post(`/api/requests/${after.requests[0].id}`, a, { action: 'confirm', version: after.version })).status, 409)
  assert.equal((await f.requestRide(b, id)).status, 201)
})

test('unapproved membership cannot create, request, or confirm rides; approval is class-scoped', async (t) => {
  const f = await fixture(t)
  const a = await f.login('student-a'), unapproved = await f.login('new-student'), moderator = await f.login('moderator-a')
  const id = await f.createRide(a)
  assert.equal((await f.post('/api/rides', unapproved, { pickup: 'A', dropoff: 'B', date: f.date, departure: '19:30', capacity: 1 })).status, 403)
  assert.equal((await f.requestRide(unapproved, id)).status, 403)
  assert.equal((await f.post('/api/membership/new-student', a, { status: 'approved' })).status, 403)
  assert.equal((await f.post('/api/membership/student-d', moderator, { status: 'approved' })).status, 404)
  assert.equal((await f.post('/api/membership/request', unapproved)).status, 200)
  assert.equal((await f.state(unapproved)).me.membership, 'pending')
  assert.equal((await f.post('/api/membership/new-student', moderator, { status: 'approved' })).status, 200)
  assert.equal((await f.requestRide(unapproved, id)).status, 201)
  const pending = (await f.ride(a, id)).requests.find((row) => row.riderId === 'new-student')
  assert.equal((await f.post('/api/membership/new-student', moderator, { status: 'rejected' })).status, 200)
  const current = await f.post(`/api/requests/${pending.id}/preview`, a)
  assert.equal((await f.post(`/api/requests/${pending.id}`, a, { action: 'confirm', version: current.data.version, previewToken: current.data.previewToken })).status, 403)
})

test('a rider whose membership was rejected can still cancel an existing confirmed booking', async (t) => {
  const f = await fixture(t)
  const b = await f.login('student-b'), moderator = await f.login('moderator-a')
  assert.equal((await f.post('/api/membership/student-b', moderator, { status: 'rejected' })).status, 200)
  assert.equal((await f.post('/api/requests/demo-booking', b, { action: 'cancel' })).status, 200)
  assert.equal((await f.ride(b, 'ride-1645')).remainingSeats, 1)
  assert.equal(f.db.prepare("SELECT status FROM ride_requests WHERE id='demo-booking'").get().status, 'cancelled')
})

test('invalid dates and missing JSON payloads return validation errors instead of runtime failures', async (t) => {
  const f = await fixture(t)
  const a = await f.login('student-a'), moderator = await f.login('moderator-a')
  const futureYear = new Date().getUTCFullYear() + 1
  for (const path of ['/api/rides', '/api/academics', '/api/schedule/preview']) {
    const response = await f.request(path, { method: 'POST', cookie: path.includes('schedule') ? moderator : a })
    assert.ok([400, 415].includes(response.status), `${path}: ${response.status} ${JSON.stringify(response.data)}`)
  }
  assert.equal((await f.post('/api/attendance', a, { semester: 1, code: '26ETBS11', type: 'theory', present: true, date: `${futureYear}-02-30` })).status, 400)
  const base = { pickup: 'Gate', dropoff: 'Station', capacity: 1, bufferMinutes: 10, date: f.date, departure: '18:30' }
  assert.equal((await f.post('/api/rides/offer-preview', a, { ...base, date: `${futureYear}-02-30` })).status, 400)
  assert.equal((await f.post('/api/rides/offer-preview', a, { ...base, departure: '24:00' })).status, 400)
})

test('ride previews bind the viewing account and current plan, and participation requires a preview', async (t) => {
  const f = await fixture(t)
  const a = await f.login('student-a'), b = await f.login('student-b'), c = await f.login('student-c')
  const id = await f.createRide(a)
  const preview = await f.post('/api/rides/preview', b, { rideId: id })
  const payload = { version: preview.data.version, previewToken: preview.data.previewToken }
  assert.equal((await f.post(`/api/rides/${id}/requests`, c, payload)).status, 409)
  assert.equal((await f.post(`/api/rides/${id}/requests`, b, { version: payload.version, acknowledgeConflicts: true })).status, 409)
  assert.equal((await f.post('/api/attendance', b, { semester: 1, code: '26ETBS11', type: 'theory', present: true, date: f.date })).status, 201)
  assert.equal((await f.post(`/api/rides/${id}/requests`, b, payload)).status, 409)
  assert.equal((await f.requestRide(b, id)).status, 201)
  const event = (await f.state(c)).schedule.find((row) => row.id === 'robotics')
  assert.equal((await f.post(`/api/schedule/${event.id}/join`, c, { version: event.version, acknowledgeConflicts: true })).status, 409)
  const participation = await f.post(`/api/schedule/${event.id}/preview`, c)
  assert.equal((await f.post(`/api/schedule/${event.id}/join`, c, { version: participation.data.version, previewToken: participation.data.previewToken })).status, 200)
})

test('class timetable edit previews include students who have no explicit participation row', async (t) => {
  const f = await fixture(t)
  const moderator = await f.login('moderator-a')
  const event = (await f.state(moderator)).schedule.find((row) => row.id === 'mathematics')
  const preview = await f.post('/api/schedule/preview', moderator, { id: event.id, title: event.title, start: `${f.date}T16:50:00+05:30`, end: `${f.date}T17:20:00+05:30`, tags: event.tags, version: event.version })
  assert.equal(preview.status, 200)
  assert.ok(preview.data.affected.some((row) => row.userId === 'student-b' && row.id === 'ride-1645'))
})

test('task reviews award one ledger entry, reject self-approval, and keep submissions private', async (t) => {
  const f = await fixture(t)
  const a = await f.login('student-a'), b = await f.login('student-b'), otherClass = await f.login('student-d'), moderator = await f.login('moderator-a')
  assert.equal((await f.post('/api/tasks', a, { title: 'Unauthorized task', deadline: `${f.date}T23:59:00+05:30`, points: 50 })).status, 403)
  assert.equal((await f.post('/api/tasks/robotics-task/submit', otherClass, { note: 'Cross-class attempt' })).status, 404)
  assert.equal((await f.post('/api/tasks/robotics-task/submit', moderator, { note: 'Self submission' })).status, 403)
  assert.equal((await f.post('/api/tasks/robotics-task/submit', a, { note: 'Private completion note' })).status, 201)
  assert.equal((await f.post('/api/tasks/robotics-task/submit', a, { note: 'Duplicate note' })).status, 409)
  const submission = (await f.state(a)).tasks.find((row) => row.id === 'robotics-task').submissions[0]
  assert.equal((await f.state(b)).tasks.find((row) => row.id === 'robotics-task').submissions.length, 0)
  assert.equal((await f.state(otherClass)).tasks.length, 0)
  assert.equal((await f.post(`/api/submissions/${submission.id}`, a, { action: 'approve' })).status, 403)
  const results = await Promise.all([1, 2].map(() => f.post(`/api/submissions/${submission.id}`, moderator, { action: 'approve', feedback: 'Checked demo evidence' })))
  assert.deepEqual(results.map((row) => row.status), [200, 200])
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM points_ledger WHERE submission_id=?').get(submission.id).n, 1)
  const same = await f.state(a), other = await f.state(otherClass)
  assert.equal(same.leaderboard.classes.find((row) => row.id === 'fe-a').points, 20)
  assert.equal(same.leaderboard.students.find((row) => row.id === 'student-a').points, 20)
  assert.equal(other.leaderboard.classes.find((row) => row.id === 'fe-a').points, 20)
  assert.equal(other.leaderboard.students.some((row) => row.id === 'student-a'), false)
  assert.equal(JSON.stringify(other).includes('Private completion note'), false)
  assert.equal((await f.post('/api/tasks/robotics-task/submit', b, { note: 'Needs correction' })).status, 201)
  const rejected = (await f.state(b)).tasks[0].submissions[0]
  assert.equal((await f.post(`/api/submissions/${rejected.id}`, moderator, { action: 'reject', feedback: 'Please revise' })).status, 200)
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM points_ledger WHERE submission_id=?').get(rejected.id).n, 0)
})

test('schedule changes require fresh preview, preserve affected bookings, and suggest only an actual fitting ride', async (t) => {
  const f = await fixture(t)
  const a = await f.login('student-a'), b = await f.login('student-b'), moderator = await f.login('moderator-a')
  const event = (await f.state(moderator)).schedule.find((row) => row.id === 'robotics')
  const input = { id: event.id, title: event.title, start: `${f.date}T17:00:00+05:30`, end: `${f.date}T17:30:00+05:30`, tags: event.tags, version: event.version }
  assert.equal((await f.post('/api/schedule/preview', a, input)).status, 403)
  const preview = await f.post('/api/schedule/preview', moderator, input)
  assert.equal(preview.status, 200)
  assert.ok(preview.data.affected.some((row) => row.id === 'ride-1645' && row.userId === 'student-b'))
  assert.ok(preview.data.suggestions.some((row) => row.rideId === 'ride-1745' && row.reason.includes('10 minutes')))
  assert.equal((await f.post('/api/schedule', moderator, { ...input, previewToken: preview.data.previewToken })).status, 409)
  // Any intervening durable change invalidates the optimistic preview token.
  assert.equal((await f.post('/api/attendance', a, { semester: 1, code: '26ETBS11', type: 'theory', present: true, date: f.date })).status, 201)
  assert.equal((await f.post('/api/schedule', moderator, { ...input, previewToken: preview.data.previewToken, acknowledgeConflicts: true })).status, 409)
  const refreshed = await f.post('/api/schedule/preview', moderator, input)
  assert.equal((await f.post('/api/schedule', moderator, { ...input, previewToken: refreshed.data.previewToken, acknowledgeConflicts: true })).status, 200)
  assert.equal(f.db.prepare("SELECT status FROM ride_requests WHERE id='demo-booking'").get().status, 'confirmed')
  const today = await f.request(`/api/today?date=${f.date}`, { cookie: b })
  assert.equal(today.status, 200)
  const moved = today.data.items.find((row) => row.id === 'robotics')
  assert.equal(moved.start, input.start)
  assert.ok(moved.conflicts.some((row) => row.id === 'ride-1645'))
  assert.ok(today.data.suggestions.some((row) => row.rideId === 'ride-1745'))
  assert.equal((await f.post('/api/requests/demo-booking', b, { action: 'cancel' })).status, 200)
  assert.equal((await f.requestRide(b, 'ride-1745')).status, 201)
  const alternate = await f.ride(a, 'ride-1745')
  const pending = alternate.requests.find((row) => row.riderId === 'student-b')
  const confirmation = await f.post(`/api/requests/${pending.id}/preview`, a)
  assert.equal((await f.post(`/api/requests/${pending.id}`, a, { action: 'confirm', version: confirmation.data.version, previewToken: confirmation.data.previewToken })).status, 200)
  const updatedToday = await f.request(`/api/today?date=${f.date}`, { cookie: b })
  assert.equal(updatedToday.data.items.some((row) => row.id === 'ride-1645'), false)
  assert.equal(updatedToday.data.items.some((row) => row.id === 'ride-1745'), true)
})

test('private academic edits, attendance counts, undo, and session survive an actual SQLite reopen', async (t) => {
  const f = await fixture(t, { disk: true })
  const a = await f.login('student-a'), b = await f.login('student-b')
  const before = (await f.state(a)).academics.semesters[1]
  const record = structuredClone(before)
  delete record.version
  record.marks['26ETBS11'] = { midterm: 18, internal: 17 }
  assert.equal((await f.post('/api/academics', a, { semester: 1, version: before.version, record, userId: 'student-b' })).status, 200)
  assert.deepEqual((await f.state(b)).academics.semesters[1].marks, {})
  const lecture = { semester: 1, code: '26ETBS11', type: 'theory', date: f.date }
  assert.equal((await f.post('/api/attendance', a, { ...lecture, present: true })).status, 201)
  assert.equal((await f.post('/api/attendance', a, { ...lecture, present: false })).status, 201)
  let current = (await f.state(a)).academics.semesters[1]
  assert.deepEqual(current.attendance['26ETBS11:theory'], { present: 1, total: 2 })
  assert.equal(current.events.length, 2)
  assert.deepEqual((await f.state(b)).academics.semesters[1].attendance, {})
  const event = current.events.find((row) => !row.present)
  assert.equal((await f.request(`/api/attendance/${event.id}?semester=1`, { method: 'DELETE', cookie: b })).status, 404)
  await f.reopen()
  current = (await f.state(a)).academics.semesters[1]
  assert.deepEqual(current.marks['26ETBS11'], { midterm: 18, internal: 17 })
  assert.deepEqual(current.attendance['26ETBS11:theory'], { present: 1, total: 2 })
  assert.equal((await f.request(`/api/attendance/${event.id}?semester=1`, { method: 'DELETE', cookie: a })).status, 200)
  assert.deepEqual((await f.state(a)).academics.semesters[1].attendance['26ETBS11:theory'], { present: 1, total: 1 })
  assert.equal((await f.post('/api/academics/import', a, { confirm: true, semesters: { 1: before } })).status, 409)
})

test('server enforces marks bounds, locked attendance edits, and approved class immutability', async (t) => {
  const f = await fixture(t)
  const a = await f.login('student-a')
  const data = await f.state(a)
  const semester = data.academics.semesters[1]
  const invalid = structuredClone(semester)
  invalid.marks['26ETBS11'] = { midterm: 21 }
  assert.equal((await f.post('/api/academics', a, { semester: 1, version: semester.version, record: invalid })).status, 400)
  const tampered = structuredClone(semester)
  tampered.attendance['26ETBS11:theory'] = { present: 99, total: 99 }
  assert.equal((await f.post('/api/academics', a, { semester: 1, version: semester.version, record: tampered })).status, 400)
  assert.equal((await f.request('/api/profile', { method: 'PUT', cookie: a, body: { name: 'Still Alex', classId: 'fe-b', subjects: [], interests: [] } })).status, 403)
  assert.equal((await f.state(a)).me.classId, 'fe-a')
})
