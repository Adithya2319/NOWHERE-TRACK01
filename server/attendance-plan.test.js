import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app.js";
import { openDatabase, seedDatabase } from "./db.js";

const ORIGIN = "http://127.0.0.1:5174";
const MATHS = "26ETBS11";
const KEY = `${MATHS}:theory`;
const PLAN = { remaining: 12, plannedPresent: 10, target: 75 };

async function fixture(t, { disk = false } = {}) {
  const directory = disk ? mkdtempSync(join(tmpdir(), "campus360-attendance-plan-")) : null;
  const filename = directory ? join(directory, "test.sqlite") : ":memory:";
  let db = openDatabase(filename);
  seedDatabase(db, "2026-10-16");
  let server;
  let address;
  const start = async () => {
    const app = createApp(db, { authMode: "demo", publicOrigin: ORIGIN, cookieSecure: false });
    server = await new Promise((resolve) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    address = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  };
  await start();
  t.after(async () => {
    await stop();
    db.close();
    if (directory) {
      // Delete only the exact disposable database paths created by this fixture.
      for (const suffix of ["", "-wal", "-shm"]) {
        if (existsSync(filename + suffix)) unlinkSync(filename + suffix);
      }
      rmdirSync(directory);
    }
  });
  const request = async (path, { method = "GET", body, cookie, origin = ORIGIN } = {}) => {
    const response = await fetch(address + path, {
      method,
      headers: {
        ...(origin ? { Origin: origin } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json(), cookie: response.headers.get("set-cookie") };
  };
  const post = (path, cookie, body) => request(path, { method: "POST", cookie, body });
  const login = async (userId = "student-a") => {
    const result = await post("/api/auth/demo", null, { userId });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    return result.cookie;
  };
  const state = async (cookie) => {
    const result = await request("/api/state", { cookie });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    return result.data;
  };
  return {
    request,
    post,
    login,
    state,
    async reopen() {
      assert.ok(disk);
      await stop();
      db.close();
      db = openDatabase(filename);
      await start();
    },
  };
}

const bodyFor = (record, overrides = {}) => ({
  semester: 1,
  code: MATHS,
  type: "theory",
  version: record.version,
  ...PLAN,
  ...overrides,
});

test("attendance plans round-trip and survive database reopening without changing marks or actual lectures", async (t) => {
  const f = await fixture(t, { disk: true });
  const cookie = await f.login();
  for (const present of [true, false]) {
    const result = await f.post("/api/attendance", cookie, {
      semester: 1, code: MATHS, type: "theory", present, date: "2026-10-16",
    });
    assert.equal(result.status, 201);
  }
  let record = (await f.state(cookie)).academics.semesters[1];
  const markResult = await f.post("/api/academics", cookie, {
    semester: 1,
    version: record.version,
    record: { ...record, marks: { [MATHS]: { midterm: 15, internal: 18 } } },
  });
  assert.equal(markResult.status, 200, JSON.stringify(markResult.data));
  const before = (await f.state(cookie)).academics;
  record = before.semesters[1];
  const result = await f.post("/api/attendance/plan", cookie, bodyFor(record));
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.deepEqual(result.data, { saved: true, plan: PLAN });
  const after = (await f.state(cookie)).academics;
  assert.deepEqual(after.semesters[1], {
    ...record, version: record.version + 1, attendancePlans: { [KEY]: PLAN },
  });
  assert.deepEqual(after.semesters[1].attendance[KEY], { present: 1, total: 2 });
  assert.equal(after.semesters[1].events.length, 2);
  assert.deepEqual(after.semesters[1].marks[MATHS], { midterm: 15, internal: 18 });
  assert.deepEqual(after.semesters[2], before.semesters[2]);
  assert.deepEqual(after.policy, before.policy);

  await f.reopen();
  assert.deepEqual((await f.state(cookie)).academics, after);
});

test("attendance plans are isolated by authenticated student and semester", async (t) => {
  const f = await fixture(t);
  const a = await f.login("student-a");
  const b = await f.login("student-b");
  const beforeA = (await f.state(a)).academics;
  const beforeB = (await f.state(b)).academics;
  const saveA = await f.post("/api/attendance/plan", a, bodyFor(beforeA.semesters[1]));
  assert.equal(saveA.status, 200);
  assert.deepEqual((await f.state(b)).academics, beforeB);
  assert.deepEqual((await f.state(a)).academics.semesters[2], beforeA.semesters[2]);

  const saveB = await f.post("/api/attendance/plan", b, bodyFor(beforeB.semesters[2], {
    semester: 2, code: "26ETBS21", target: 80, userId: "student-a",
  }));
  assert.equal(saveB.status, 200);
  const afterA = (await f.state(a)).academics;
  const afterB = (await f.state(b)).academics;
  assert.deepEqual(afterA.semesters[1].attendancePlans, { [KEY]: PLAN });
  assert.deepEqual(afterA.semesters[2], beforeA.semesters[2]);
  assert.deepEqual(afterB.semesters[1], beforeB.semesters[1]);
  assert.deepEqual(afterB.semesters[2].attendancePlans, {
    "26ETBS21:theory": { ...PLAN, target: 80 },
  });
});

test("invalid attendance plan counts, targets, subjects and lecture types return 400 without writing", async (t) => {
  const f = await fixture(t);
  const cookie = await f.login();
  const before = (await f.state(cookie)).academics;
  const invalid = [
    { remaining: -1 },
    { remaining: 1.5 },
    { remaining: "12" },
    { remaining: Number.MAX_SAFE_INTEGER + 1 },
    { plannedPresent: -1 },
    { plannedPresent: 0.5 },
    { plannedPresent: 13 },
    { plannedPresent: null },
    { target: 0 },
    { target: -1 },
    { target: 100.1 },
    { target: "75" },
    { target: null },
    { target: undefined },
    { target: Infinity },
    { code: "unknown-course" },
    { code: "26ETBS21" },
    { type: "seminar" },
    { type: "practical" },
    { code: "26ETVS11", type: "theory" },
    { semester: 0 },
    { semester: 3 },
    { semester: "1" },
  ];
  for (const overrides of invalid) {
    const result = await f.post("/api/attendance/plan", cookie, bodyFor(before.semesters[1], overrides));
    assert.equal(result.status, 400, `Accepted ${JSON.stringify(overrides)}: ${JSON.stringify(result.data)}`);
  }
  assert.deepEqual((await f.state(cookie)).academics, before);
});

test("stale plan versions return 409 and preserve both the newer plan and lecture history", async (t) => {
  const f = await fixture(t);
  const cookie = await f.login();
  const stale = (await f.state(cookie)).academics.semesters[1];
  assert.equal((await f.post("/api/attendance/plan", cookie, bodyFor(stale))).status, 200);
  const lecture = await f.post("/api/attendance", cookie, {
    semester: 1, code: MATHS, type: "theory", present: true, date: "2026-10-16",
  });
  assert.equal(lecture.status, 201);
  const beforeRetry = (await f.state(cookie)).academics;
  const result = await f.post("/api/attendance/plan", cookie, bodyFor(stale, { target: 90 }));
  assert.equal(result.status, 409);
  assert.match(result.data.error, /changed|refresh/i);
  assert.deepEqual((await f.state(cookie)).academics, beforeRetry);
});

test("plan writes still require authentication and an allowed request origin", async (t) => {
  const f = await fixture(t);
  const cookie = await f.login();
  const before = (await f.state(cookie)).academics;
  const body = bodyFor(before.semesters[1]);
  const unauthenticated = await f.post("/api/attendance/plan", null, body);
  assert.equal(unauthenticated.status, 401);
  for (const origin of ["https://attacker.example", "http://127.0.0.1:9999", null]) {
    const result = await f.request("/api/attendance/plan", { method: "POST", cookie, origin, body });
    assert.equal(result.status, 403);
    assert.match(result.data.error, /Origin not allowed/);
  }
  assert.deepEqual((await f.state(cookie)).academics, before);
});
