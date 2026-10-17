import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_POLICY, assessCourse, requiredForGrade, planSemester, cumulativeResult, validatePolicy, validateSemester } from './planner.js';

const course = { code: 'DEMO101', subject: 'Synthetic subject', credits: 4, practicalCredits: 0, maxima: { internal: 40, endSem: 60 } };
const record = (courses = [course], marks = {}, target = 8) => ({ courses, marks, attendance: {}, events: [], target });
const grade = name => DEMO_POLICY.gradeBands.find(b => b.grade === name);

test('weighted totals use maxima, grade cutoffs and independent pass gates', () => {
  assert.equal(assessCourse(course, { internal: 36, endSem: 54 }, DEMO_POLICY).grade.grade, 'O');
  assert.equal(assessCourse(course, { internal: 36, endSem: 53.5 }, DEMO_POLICY).grade.grade, 'A');
  const failed = assessCourse(course, { internal: 15.5, endSem: 60 }, DEMO_POLICY);
  assert.equal(failed.grade.points, 0);
  assert.match(failed.gateFailures[0], /internal/);
  assert.equal(requiredForGrade(course, { internal: 15.5 }, grade('P'), DEMO_POLICY).reachable, false);
});

test('required external is scaled, includes external pass gate, and never clamps an impossibility', () => {
  assert.equal(requiredForGrade(course, { internal: 36 }, grade('O'), DEMO_POLICY).required, 54);
  assert.equal(requiredForGrade(course, { internal: 40 }, grade('P'), DEMO_POLICY).required, 24);
  const impossible = requiredForGrade(course, { internal: 16 }, grade('O'), DEMO_POLICY);
  assert.equal(impossible.required, 74);
  assert.equal(impossible.remainingMax, 60);
  assert.equal(impossible.reachable, false);
  const fifty = { ...course, maxima: { internal: 20, endSem: 30 } };
  assert.equal(requiredForGrade(fifty, { internal: 18 }, grade('O'), DEMO_POLICY).required, 27);
  assert.equal(requiredForGrade(fifty, { internal: 20 }, grade('P'), DEMO_POLICY).required, 12);
});

test('half-mark thresholds round up to the allowed precision', () => {
  const tiny = { ...course, maxima: { internal: 7.5, endSem: 12.5 } };
  assert.equal(requiredForGrade(tiny, { internal: 7.5 }, { grade: 'X', min: 81, points: 9 }, DEMO_POLICY).required, 9);
});

test('grade, pass and target cutoffs do not grant scores a hidden tolerance', () => {
  const strictBand = { grade: 'X', min: 90.0000000005, points: 10 };
  const policy = { ...DEMO_POLICY, gradeBands: [strictBand, grade('A'), grade('F')] };
  assert.equal(assessCourse(course, { internal: 36, endSem: 54 }, policy).grade.grade, 'A');
  assert.equal(requiredForGrade(course, { internal: 36 }, strictBand, policy).required, 54.5);
  const strictPass = { ...DEMO_POLICY, passRules: { aggregate: 90.0000000005 } };
  assert.equal(assessCourse(course, { internal: 36, endSem: 54 }, strictPass).grade.points, 0);
  const result = planSemester(record([course], { DEMO101: { internal: 32, endSem: 48 } }, 9.0000000005), DEMO_POLICY);
  assert.equal(result.maxSGPA, 9);
  assert.equal(result.targetReachable, false);
});

test('decimal pass cutoffs keep exact half-mark boundaries despite multiplication round-off', () => {
  const single = { ...course, maxima: { endSem: 125 } };
  const policy = { ...DEMO_POLICY, passRules: { aggregate: 64.4, theory: 64.4, components: { endSem: 64.4 } } };
  const requirement = requiredForGrade(single, {}, grade('P'), policy);
  assert.equal(requirement.required, 80.5);
  assert.equal(requirement.requiredByComponent.endSem, 80.5);
  assert.equal(assessCourse(single, { endSem: 80.5 }, policy).grade.grade, 'C');
  assert.equal(assessCourse(single, { endSem: 80 }, policy).grade.points, 0);
});

test('missing is unknown while an actual zero fails; projection states its assumption', () => {
  const missing = assessCourse(course, { internal: 36 }, DEMO_POLICY);
  assert.equal(missing.grade, null);
  assert.equal(missing.percentage, 90);
  const projected = assessCourse(course, { internal: 36 }, DEMO_POLICY, { project: true });
  assert.equal(projected.projectedMarks.endSem, 54);
  assert.equal(projected.grade.grade, 'O');
  assert.match(projected.assumptions, /Unknown/);
  assert.equal(assessCourse(course, {}, DEMO_POLICY, { project: true }).grade, null);
  assert.equal(assessCourse(course, { internal: 36, endSem: 0 }, DEMO_POLICY).grade.points, 0);
});

test('SGPA keeps failed credits, excludes zero-credit courses and computes reachable upper bound', () => {
  const second = { ...course, code: 'DEMO102', credits: 2 };
  const zero = { ...course, code: 'AUDIT', credits: 0 };
  const result = planSemester(record([course, second, zero], { DEMO101: { internal: 40, endSem: 60 }, DEMO102: { internal: 0, endSem: 60 } }, 7), DEMO_POLICY);
  assert.equal(result.credits, 6);
  assert.equal(result.currentSGPA, 40 / 6);
  assert.equal(result.maxSGPA, 40 / 6);
  assert.equal(result.targetReachable, false);
  const unknown = planSemester(record([course, second], { DEMO101: { internal: 15 } }, 8), DEMO_POLICY);
  assert.equal(unknown.currentSGPA, null);
  assert.equal(unknown.projectedSGPA, null);
  assert.equal(unknown.maxSGPA, 20 / 6);
});

test('recorded components lock maximum grade and an unverified official mode withholds grades', () => {
  assert.equal(requiredForGrade(course, { internal: 32, endSem: 48 }, grade('O'), DEMO_POLICY).reachable, false);
  assert.equal(requiredForGrade(course, { internal: 32, endSem: 48 }, grade('A'), DEMO_POLICY).locked, true);
  const withheld = { ...DEMO_POLICY, mode: 'official', confirmed: false };
  const result = planSemester(record([course], { DEMO101: { internal: 40, endSem: 60 } }), withheld);
  assert.equal(result.currentSGPA, null);
  assert.equal(result.maxSGPA, null);
});

test('midterm counted separately by default, excluded when explicitly included in internal', () => {
  const independent = { ...course, maxima: { midterm: 20, internal: 20, endSem: 60 } };
  assert.equal(assessCourse(independent, { midterm: 10, internal: 20, endSem: 60 }, DEMO_POLICY).finalPercentage, 90);
  assert.equal(assessCourse({ ...independent, midtermIncludedInInternal: true }, { midterm: 10, internal: 20, endSem: 60 }, DEMO_POLICY).finalPercentage, 100);
});

test('validation rejects invalid marks/credits/targets but accepts zero credits and blanks', () => {
  assert.equal(validatePolicy(DEMO_POLICY), true);
  assert.equal(validateSemester(record([{ ...course, credits: 0 }], { DEMO101: { internal: null, endSem: 0 } })), true);
  for (const value of [-1, 41, 1.2, 1.5000000001, Infinity, '20']) assert.throws(() => validateSemester(record([course], { DEMO101: { internal: value } })));
  assert.throws(() => validateSemester(record([{ ...course, credits: -1 }])));
  assert.throws(() => validateSemester(record([course], {}, 11)));
  assert.throws(() => validatePolicy({ ...DEMO_POLICY, gradeBands: [{ grade: 'A', min: 90, points: 9 }] }));
});

test('legacy course-specific percentage pass rules remain readable', () => {
  const policy = { ...DEMO_POLICY, passRules: { DEMO101: { total: 40, internal: 40, endSem: 40 } } };
  assert.equal(validatePolicy(policy), true);
  assert.equal(assessCourse(course, { internal: 40, endSem: 60 }, policy).grade.points, 10);
});

test('attendance validation rejects invalid calendar dates, duplicate IDs and unknown types', () => {
  const lecture = { id: 'event-one', code: course.code, type: 'theory', present: true, date: '2028-02-29' };
  assert.equal(validateSemester({ ...record(), events: [lecture], attendance: { 'DEMO101:theory': { total: 1, present: 1 } } }), true);
  for (const date of ['2026-02-29', '2026-02-30', '2026-13-01', 'not-a-date', '0000-01-01']) assert.throws(() => validateSemester({ ...record(), events: [{ ...lecture, date }] }));
  assert.throws(() => validateSemester({ ...record(), events: [lecture, lecture] }));
  assert.throws(() => validateSemester({ ...record(), events: [{ ...lecture, id: '' }] }));
  assert.throws(() => validateSemester({ ...record(), events: [lecture] }));
  assert.throws(() => validateSemester({ ...record(), events: [{ ...lecture, present: false }], attendance: { 'DEMO101:theory': { total: 1, present: 1 } } }));
  assert.equal(validateSemester({ ...record(), events: [lecture], attendance: { 'DEMO101:theory': { total: 10, present: 8 } } }), true);
  assert.throws(() => validateSemester({ ...record(), attendance: { 'DEMO101:workshop': { total: 1, present: 1 } } }));
  assert.throws(() => validateSemester({ ...record(), confirmed: 'false' }));
});

test('optional saved attendance plans validate without altering recorded attendance', () => {
  const saved = {
    ...record([{ ...course, practicalCredits: 1 }]),
    attendance: { 'DEMO101:theory': { present: 8, total: 10 } },
    events: [{ id: 'preserved', code: 'DEMO101', type: 'theory', present: true, date: '2026-10-16' }],
    attendancePlans: {
      'DEMO101:theory': { remaining: 12, plannedPresent: 10, target: 75 },
      'DEMO101:practical': { remaining: 0, plannedPresent: 0, target: 100 },
    },
  };
  const before = structuredClone(saved);
  assert.equal(validateSemester(saved), true);
  assert.deepEqual(saved, before);
  assert.equal(validateSemester(record()), true);
});

test('attendance plans reject invalid subject keys, values and projected count overflow', () => {
  const plan = { remaining: 5, plannedPresent: 4, target: 75 };
  for (const attendancePlans of [null, [], 'invalid', { 'UNKNOWN:theory': plan }, { 'DEMO101:workshop': plan }, { 'DEMO101:theory': null }]) {
    assert.throws(() => validateSemester({ ...record(), attendancePlans }));
  }
  assert.throws(() => validateSemester({ ...record(), attendancePlans: { 'DEMO101:practical': plan } }), /conducted course/);
  assert.throws(() => validateSemester({ ...record([{ ...course, practicalCredits: 4 }]), attendancePlans: { 'DEMO101:theory': plan } }), /conducted course/);
  // Historical counters for older course/type combinations remain readable.
  assert.equal(validateSemester({ ...record(), attendance: { 'DEMO101:practical': { present: 1, total: 1 } } }), true);
  for (const invalid of [
    { remaining: -1 }, { remaining: 1.5 }, { remaining: Number.MAX_SAFE_INTEGER + 1 },
    { plannedPresent: 6 }, { plannedPresent: '4' }, { plannedPresent: null },
    { target: 0 }, { target: 101 }, { target: Infinity }, { target: null }, { target: '75' },
  ]) {
    assert.throws(() => validateSemester({ ...record(), attendancePlans: { 'DEMO101:theory': { ...plan, ...invalid } } }));
  }
  assert.throws(() => validateSemester({
    ...record(),
    attendance: { 'DEMO101:theory': { present: 0, total: Number.MAX_SAFE_INTEGER } },
    attendancePlans: { 'DEMO101:theory': plan },
  }), /Projected total lectures/);
});

test('multiple remaining components honor combined theory and individual minima', () => {
  const mixed = { ...course, maxima: { internal: 40, endSem: 60, termWork: 25 } };
  const policy = { ...DEMO_POLICY, passRules: { aggregate: 40, theory: 60, components: { internal: 40, endSem: 40, termWork: 40 } } };
  const needed = requiredForGrade(mixed, { internal: 20 }, grade('P'), policy);
  assert.equal(needed.required, 50); // 40 external for theory + 10 term-work gate.
  assert.equal(needed.reachable, true);
  const impossibleTheory = { ...policy, passRules: { ...policy.passRules, theory: 90 } };
  assert.equal(requiredForGrade(mixed, { internal: 20 }, grade('P'), impossibleTheory).reachable, false);
});

test('blank imported theory marks behave like missing marks instead of concatenating recorded scores', () => {
  const mixed = { ...course, maxima: { midterm: 20, internal: 20, endSem: 60, termWork: 25 } };
  const policy = { ...DEMO_POLICY, passRules: { aggregate: 40, theory: 60, components: { internal: 40, endSem: 40, termWork: 40 } } };
  const withBlank = requiredForGrade(mixed, { midterm: 10, internal: '', endSem: 30 }, grade('P'), policy);
  const withMissing = requiredForGrade(mixed, { midterm: 10, endSem: 30 }, grade('P'), policy);
  assert.equal(withBlank.required, 30); // 20 internal to reach 60 theory, plus 10 term work.
  assert.deepEqual(withBlank, withMissing);
  assert.equal(withBlank.reachable, true);
});

test('confirmed cumulative result weights credits across semesters and retains failed credits', () => {
  const first = { ...record([course], { DEMO101: { internal: 40, endSem: 60 } }), confirmed: true };
  const secondCourse = { ...course, code: 'SECOND', credits: 6 };
  const failedCourse = { ...course, code: 'FAILED', credits: 2 };
  const second = { ...record([secondCourse, failedCourse], { SECOND: { internal: 32, endSem: 48 }, FAILED: { internal: 0, endSem: 60 } }), confirmed: true };
  assert.equal(cumulativeResult({ 1: first, 2: second }, DEMO_POLICY), 94 / 12);
  assert.equal(cumulativeResult({ 1: first, 2: { ...second, confirmed: false } }, DEMO_POLICY), 10);
  assert.equal(cumulativeResult({ 1: { ...first, confirmed: false } }, DEMO_POLICY), null);
});

test('cumulative result withholds incomplete confirmed records and unverified official rules', () => {
  const first = { ...record([course], { DEMO101: { internal: 40, endSem: 60 } }), confirmed: true };
  const incomplete = { ...record([course], { DEMO101: { internal: 40 } }), confirmed: true };
  assert.equal(cumulativeResult({ 1: first, 2: incomplete }, DEMO_POLICY), null);
  assert.equal(cumulativeResult({ 1: first }, { ...DEMO_POLICY, mode: 'official', confirmed: false }), null);
  assert.equal(cumulativeResult({ 1: { ...first, courses: [{ ...course, credits: 0 }] } }, DEMO_POLICY), null);
});
