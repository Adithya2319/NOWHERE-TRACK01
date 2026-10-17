import test from "node:test";
import assert from "node:assert/strict";
import { attendanceAdvice, forecastAttendance } from "./attendance.js";

test("attendance recovery and safe absences are exact at integer and decimal boundaries", () => {
  assert.deepEqual(attendanceAdvice(17, 24, 75), {
    percentage: (17 / 24) * 100, recover: 4, miss: 0,
  });
  assert.equal(attendanceAdvice(3, 4, 75).miss, 0);
  assert.equal(attendanceAdvice(4, 4, 75).miss, 1);
  assert.equal(attendanceAdvice(667, 1000, 66.7).recover, 0);
  assert.equal(attendanceAdvice(667, 1000, 66.7).miss, 0);
  assert.equal(attendanceAdvice(2, 3, 66.7).recover, 1);
  assert.equal(attendanceAdvice(2, 3, 66.66666666666667).recover, 1);
  assert.equal(attendanceAdvice(3, 4, 75.00000000000001).recover, 1);
  assert.equal(attendanceAdvice(3, 4, 74.99999999999999).recover, 0);
});

test("zero lectures, unknown targets and 100% targets do not manufacture a percentage", () => {
  assert.deepEqual(attendanceAdvice(0, 0, null), { percentage: null, recover: null, miss: null });
  assert.deepEqual(attendanceAdvice(0, 0, 75), { percentage: null, recover: 0, miss: 0 });
  assert.equal(attendanceAdvice(2, 3, 100).recover, Infinity);
  assert.deepEqual(attendanceAdvice(3, 3, 100), { percentage: 100, recover: 0, miss: 0 });
  const empty = forecastAttendance({ present: 0, total: 0, remaining: 0, plannedPresent: 0, target: 75 });
  assert.equal(empty.projectedPercentage, null);
  assert.equal(empty.allAttendPercentage, null);
  assert.equal(empty.minimumRequired, null);
  assert.equal(empty.reachable, null);
  assert.equal(empty.scenarios.recordedRate, null);
  const firstLectures = forecastAttendance({ present: 0, total: 0, remaining: 4, plannedPresent: 3, target: 75 });
  assert.equal(firstLectures.projectedPercentage, 75);
  assert.equal(firstLectures.minimumRequired, 3);
  assert.equal(firstLectures.maxMisses, 1);
  assert.equal(firstLectures.scenarios.recordedRate, null);
  const unknown = forecastAttendance({ present: 1, total: 2, remaining: 2, plannedPresent: 1 });
  assert.equal(unknown.projectedPercentage, 50);
  assert.equal(unknown.minimumRequired, null);
  assert.equal(unknown.reachable, null);
});

test("horizon reachability is separate from the student's chosen attendance", () => {
  const base = { present: 17, total: 24, remaining: 8, target: 75 };
  const good = forecastAttendance({ ...base, plannedPresent: 7 });
  assert.equal(good.minimumRequired, 7);
  assert.equal(good.maxMisses, 1);
  assert.equal(good.projectedPercentage, 75);
  assert.equal(good.reachable, true);
  assert.equal(good.projectedMeetsTarget, true);
  assert.equal(good.scenarios.recordedRate.percentage, (17 / 24) * 100);
  const short = forecastAttendance({ ...base, plannedPresent: 6 });
  assert.equal(short.reachable, true);
  assert.equal(short.projectedMeetsTarget, false);
  const impossible = forecastAttendance({ ...base, remaining: 3, plannedPresent: 3 });
  assert.equal(impossible.minimumRequired, 4);
  assert.equal(impossible.reachable, false);
  assert.equal(impossible.maxMisses, null);
  assert.equal(impossible.projectedMeetsTarget, false);
  assert.equal(impossible.allAttendPercentage, (20 / 27) * 100);
});

test("100% remains unreachable after a recorded absence for every finite horizon", () => {
  const result = forecastAttendance({ present: 2, total: 3, remaining: 10, plannedPresent: 10, target: 100 });
  assert.equal(result.minimumRequired, 11);
  assert.equal(result.reachable, false);
  assert.equal(result.maxMisses, null);
  assert.equal(result.projectedMeetsTarget, false);
  const perfect = forecastAttendance({ present: 3, total: 3, remaining: 10, plannedPresent: 10, target: 100 });
  assert.equal(perfect.minimumRequired, 10);
  assert.equal(perfect.maxMisses, 0);
  assert.equal(perfect.projectedPercentage, 100);
});

test("invalid, fractional, unsafe or inconsistent counts and targets are rejected", () => {
  for (const bad of [-1, 0.5, NaN, Infinity, "3", Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => attendanceAdvice(bad, 10, 75));
    assert.throws(() => attendanceAdvice(0, bad, 75));
    assert.throws(() => forecastAttendance({ present: 0, total: 0, remaining: bad, plannedPresent: 0, target: 75 }));
    assert.throws(() => forecastAttendance({ present: 0, total: 0, remaining: 10, plannedPresent: bad, target: 75 }));
  }
  for (const bad of [0, -1, 100.1, NaN, Infinity, "75", false]) {
    assert.throws(() => attendanceAdvice(1, 2, bad));
    assert.throws(() => forecastAttendance({ present: 1, total: 2, remaining: 2, plannedPresent: 1, target: bad }));
  }
  assert.throws(() => attendanceAdvice(3, 2, 75));
  assert.throws(() => forecastAttendance({ present: 0, total: 0, remaining: 2, plannedPresent: 3, target: 75 }));
  assert.throws(() => forecastAttendance({ present: 0, total: Number.MAX_SAFE_INTEGER, remaining: 1, plannedPresent: 0, target: 75 }));
});

test("exhaustive small-count plans agree with exact target inequalities", () => {
  for (const [target, numerator, denominator] of [[31.25, 3125, 100], [66.7, 667, 10], [75, 75, 1], [100, 100, 1]]) {
    for (let total = 0; total <= 12; total += 1) {
      for (let present = 0; present <= total; present += 1) {
        const advice = attendanceAdvice(present, total, target);
        const meets = (p, t) => p * 100 * denominator >= numerator * t;
        if (Number.isFinite(advice.recover)) {
          assert.equal(meets(present + advice.recover, total + advice.recover), true);
          if (advice.recover > 0) assert.equal(meets(present + advice.recover - 1, total + advice.recover - 1), false);
        }
        if (meets(present, total)) {
          assert.equal(meets(present, total + advice.miss), true);
          assert.equal(meets(present, total + advice.miss + 1), false);
        }
        for (let remaining = 0; remaining <= 8; remaining += 1) {
          for (let plannedPresent = 0; plannedPresent <= remaining; plannedPresent += 1) {
            const result = forecastAttendance({ present, total, remaining, plannedPresent, target });
            if (!result.projectedTotal) continue;
            const attainable = meets(present + remaining, total + remaining);
            assert.equal(result.reachable, attainable);
            assert.equal(result.projectedMeetsTarget, meets(present + plannedPresent, total + remaining));
            assert.equal(meets(present + result.minimumRequired, total + remaining), true);
            if (result.minimumRequired > 0) assert.equal(meets(present + result.minimumRequired - 1, total + remaining), false);
            if (attainable) assert.equal(result.maxMisses, remaining - result.minimumRequired);
          }
        }
      }
    }
  }
});

test("very large safe inputs cannot round an advertised absence count upward", () => {
  const present = Number.MAX_SAFE_INTEGER;
  const target = 66.7;
  const result = attendanceAdvice(present, present, target);
  assert.ok(BigInt(result.miss) <= (1000n * BigInt(present) - 667n * BigInt(present)) / 667n);
  assert.ok(Number.isFinite(attendanceAdvice(1, 1, Number.MIN_VALUE).miss));
});
