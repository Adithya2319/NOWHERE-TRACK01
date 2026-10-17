import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_POLICY, assessCourse, cumulativeResult, planSemester, validatePolicy } from './planner.js';

const course = { code: 'PROJECT101', subject: 'Projection test subject', credits: 4, practicalCredits: 0, maxima: { internal: 40, endSem: 60 } };
const semester = (courses = [course], marks = {}) => ({ courses, marks, attendance: {}, events: [], target: 8, confirmed: false });
const unconfigured = () => ({ source: '', confirmed: false, attendanceThreshold: null, gradeBands: [], passRules: {} });
const auto = (record, policy = unconfigured()) => planSemester(record, policy, { planningMode: 'auto' });

test('missing default rules use a labelled planning assumption without creating recorded results', () => {
  const record = semester([course], { PROJECT101: { internal: 36 } });
  const policy = unconfigured();
  const before = structuredClone({ record, policy });
  const configured = planSemester(record, policy);
  assert.equal(configured.projectedSGPA, null);
  assert.equal(configured.maxSGPA, null);
  const result = auto(record, policy);
  assert.equal(result.currentSGPA, null);
  assert.equal(result.projectedSGPA, 10);
  assert.equal(result.maxSGPA, 10);
  assert.equal(result.projectionStatus, 'ready');
  assert.equal(result.maximumStatus, 'ready');
  assert.equal(result.planningBasis.mode, 'sample');
  assert.equal(result.planningBasis.fallback, true);
  assert.match(result.planningBasis.label, /sample/i);
  assert.equal(result.rows[0].projected.projectedMarks.endSem, 54);
  assert.deepEqual({ record, policy }, before);
});

test('usable configured bands and component minima determine credit-weighted projections', () => {
  const second = { ...course, code: 'PROJECT102', credits: 2 };
  const policy = { ...DEMO_POLICY, mode: 'official', confirmed: true, source: 'Synthetic test regulation' };
  const result = auto(semester([course, second], { PROJECT101: { internal: 32 }, PROJECT102: { internal: 28 } }), policy);
  assert.equal(result.currentSGPA, null);
  assert.equal(result.projectedSGPA, (4 * 9 + 2 * 8) / 6);
  assert.equal(result.maxSGPA, (4 * 10 + 2 * 9) / 6);
  assert.equal(result.planningBasis.mode, 'configured');
  assert.equal(result.planningBasis.fallback, false);
  assert.equal(result.rows[0].projected.projectedMarks.endSem, 48);
  assert.equal(result.rows[1].projected.projectedMarks.endSem, 42);
});

test('partially configured subject rules fall back as one labelled policy instead of mixing grade scales', () => {
  const second = { ...course, code: 'PROJECT102', credits: 2 };
  const policy = {
    mode: 'official', confirmed: true, source: 'Synthetic test rule with incomplete subject coverage',
    gradeBands: [{ grade: 'TEST', min: 40, points: 8 }, { grade: 'FAIL', min: 0, points: 0 }],
    passRules: { PROJECT101: { aggregate: 40, components: { internal: 40, endSem: 40 } } },
  };
  const record = semester([course, second], { PROJECT101: { internal: 36 }, PROJECT102: { internal: 32 } });
  const strict = planSemester(record, policy);
  assert.equal(strict.projectedSGPA, null);
  assert.equal(strict.maxSGPA, null);
  const result = auto(record, policy);
  assert.equal(result.planningBasis.mode, 'sample');
  assert.equal(result.planningBasis.fallback, true);
  assert.equal(result.projectedSGPA, (4 * 10 + 2 * 9) / 6);
  assert.equal(result.maxSGPA, 10);
});

test('the projection percentage weights assessed maxima instead of averaging component percentages', () => {
  const mixed = { ...course, maxima: { midterm: 20, internal: 40, endSem: 60 } };
  const result = auto(semester([mixed], { PROJECT101: { midterm: 18, internal: 20 } }));
  assert.equal(result.rows[0].actual.percentage, 100 * 38 / 60);
  assert.equal(result.rows[0].projected.projectedMarks.endSem, 38);
  assert.equal(result.projectedSGPA, 7);
  assert.equal(result.maxSGPA, 9);
  assert.equal(result.currentSGPA, null);
});

test('an unmarked credited subject blocks full SGPA and exposes only an explicitly partial estimate', () => {
  const second = { ...course, code: 'UNASSESSED', subject: 'Not assessed yet', credits: 2 };
  const audit = { ...course, code: 'AUDIT', credits: 0 };
  const result = auto(semester([course, second, audit], { PROJECT101: { internal: 36 } }));
  assert.equal(result.projectedSGPA, null);
  assert.equal(result.projectionStatus, 'insufficient-data');
  assert.equal(result.partialProjectedSGPA, 10);
  assert.equal(result.projectionCoverage.estimatedCredits, 4);
  assert.equal(result.projectionCoverage.totalCredits, 6);
  assert.equal(result.projectionCoverage.projectedSubjects, 1);
  assert.equal(result.projectionCoverage.totalSubjects, 2);
  assert.equal(result.projectionCoverage.missingSubjects.length, 1);
  assert.equal(result.projectionCoverage.missingSubjects[0].code, 'UNASSESSED');
  assert.match(result.projectionCoverage.missingSubjects[0].reason, /mark|assess|data/i);
  assert.equal(result.maxSGPA, 10);
  assert.equal(result.maximumStatus, 'ready');
});

test('all-unmarked subjects have insufficient projection data while maximum remains an explicit upper bound', () => {
  const result = auto(semester());
  assert.equal(result.projectedSGPA, null);
  assert.equal(result.projectionStatus, 'insufficient-data');
  assert.equal(result.partialProjectedSGPA, null);
  assert.equal(result.projectionCoverage.estimatedCredits, 0);
  assert.equal(result.maxSGPA, 10);
  assert.equal(result.currentSGPA, null);
});

test('an actual zero is assessed evidence and failed component gates remain locked in the upper bound', () => {
  for (const internal of [0, 15.5]) {
    const result = auto(semester([course], { PROJECT101: { internal } }), DEMO_POLICY);
    assert.equal(result.projectedSGPA, 0);
    assert.equal(result.maxSGPA, 0);
    assert.equal(result.projectionStatus, 'ready');
    assert.equal(result.projectionCoverage.estimatedCredits, 4);
    assert.match(result.rows[0].projected.gateFailures.join(' '), /internal/);
    assert.equal(result.currentSGPA, null);
  }
});

test('blank and excluded marks cannot supply a projection percentage', () => {
  const excluded = { ...course, midtermIncludedInInternal: true, maxima: { midterm: 20, internal: 40, endSem: 60 } };
  for (const record of [
    semester([course], { PROJECT101: { internal: '', endSem: null } }),
    semester([excluded], { PROJECT101: { midterm: 20 } }),
  ]) {
    const result = auto(record);
    assert.equal(result.projectedSGPA, null);
    assert.equal(result.projectionStatus, 'insufficient-data');
    assert.equal(result.projectionCoverage.estimatedCredits, 0);
    assert.equal(result.maxSGPA, 10);
  }
});

test('complete marks under sample planning do not become an official recorded or cumulative result', () => {
  const record = { ...semester([course], { PROJECT101: { internal: 32, endSem: 48 } }), confirmed: true };
  const policy = unconfigured();
  const result = auto(record, policy);
  assert.equal(result.projectedSGPA, 9);
  assert.equal(result.maxSGPA, 9);
  assert.equal(result.currentSGPA, null);
  assert.equal(cumulativeResult({ 1: record }, policy), null);
  assert.equal(result.currentStatus, 'missing-rules');
});

test('half-mark projection ties round up exactly instead of losing a half mark to floating-point error', () => {
  const tiny = { ...course, maxima: { internal: 3, endSem: 97.5 } };
  const result = assessCourse(tiny, { internal: 2.5 }, DEMO_POLICY, { project: true });
  assert.equal(result.projectedMarks.endSem, 81.5); // 2.5 / 3 * 97.5 = 81.25 exactly.
  assert.equal(result.grade.grade, 'A');
});

test('projected grades honor exact cutoffs without a hidden tolerance', () => {
  const strict = { ...DEMO_POLICY, gradeBands: [{ grade: 'X', min: 90.0000000005, points: 10 }, { grade: 'A', min: 80, points: 9 }, { grade: 'F', min: 0, points: 0 }] };
  const boundary = auto(semester([course], { PROJECT101: { internal: 36 } }), DEMO_POLICY);
  const justAbove = auto(semester([course], { PROJECT101: { internal: 36 } }), strict);
  assert.equal(boundary.projectedSGPA, 10);
  assert.equal(justAbove.projectedSGPA, 9);
  assert.equal(justAbove.rows[0].projected.finalPercentage, 90);
});

test('decimal grade and pass boundaries retain exact half-mark values', () => {
  const equal = { ...course, maxima: { internal: 125, endSem: 125 } };
  const policy = { ...DEMO_POLICY, gradeBands: [{ grade: 'B', min: 64.4, points: 8 }, { grade: 'F', min: 0, points: 0 }], passRules: { aggregate: 64.4, components: { internal: 64.4, endSem: 64.4 } } };
  const at = auto(semester([equal], { PROJECT101: { internal: 80.5 } }), policy);
  const below = auto(semester([equal], { PROJECT101: { internal: 80 } }), policy);
  assert.equal(at.rows[0].projected.projectedMarks.endSem, 80.5);
  assert.equal(at.projectedSGPA, 8);
  assert.equal(below.projectedSGPA, 0);
  assert.equal(below.maxSGPA, 0);
});

test('zero-credit courses cannot block a credited projection or create a zero-credit SGPA', () => {
  const zero = { ...course, code: 'AUDIT', credits: 0 };
  const credited = auto(semester([course, zero], { PROJECT101: { internal: 36 } }));
  assert.equal(credited.projectedSGPA, 10);
  assert.equal(credited.projectionStatus, 'ready');
  const none = auto(semester([zero]));
  assert.equal(none.currentSGPA, null);
  assert.equal(none.projectedSGPA, null);
  assert.equal(none.maxSGPA, null);
  assert.equal(none.projectionStatus, 'no-credits');
  assert.equal(none.maximumStatus, 'no-credits');
});

test('unsupported passing rules are blocked rather than silently ignored or automatically replaced', () => {
  const unsupported = { ...DEMO_POLICY, passRules: { aggregate: 40, components: { unsupported: 40 } } };
  assert.throws(() => validatePolicy(unsupported), /unsupported|unknown/i);
  const record = semester([course], { PROJECT101: { internal: 36 } });
  const blocked = auto(record, unsupported);
  assert.equal(blocked.projectedSGPA, null);
  assert.equal(blocked.maxSGPA, null);
  assert.equal(blocked.projectionStatus, 'unsupported-rules');
  assert.equal(blocked.maximumStatus, 'unsupported-rules');
  const explicit = planSemester(record, unsupported, { planningMode: 'sample' });
  assert.equal(explicit.currentSGPA, null);
  assert.equal(explicit.projectedSGPA, 10);
  assert.equal(explicit.maxSGPA, 10);
  assert.equal(explicit.planningBasis.mode, 'sample');
});

test('a declared separate policy aggregation is unsupported until the user explicitly chooses sample planning', () => {
  const policy = { ...DEMO_POLICY, aggregation: 'separate' };
  const record = semester([course], { PROJECT101: { internal: 36, endSem: 54 } });
  const before = structuredClone({ record, policy });
  assert.throws(() => validatePolicy(policy), /unsupported.*aggregation/i);
  const blocked = auto(record, policy);
  assert.equal(blocked.currentSGPA, null);
  assert.equal(blocked.currentStatus, 'unsupported-rules');
  assert.equal(blocked.projectedSGPA, null);
  assert.equal(blocked.maxSGPA, null);
  assert.equal(blocked.projectionStatus, 'unsupported-rules');
  assert.equal(blocked.maximumStatus, 'unsupported-rules');
  const explicit = planSemester(record, policy, { planningMode: 'sample' });
  assert.equal(explicit.currentSGPA, null);
  assert.equal(explicit.projectedSGPA, 10);
  assert.equal(explicit.maxSGPA, 10);
  assert.deepEqual({ record, policy }, before);
});

test('a course declaration requiring separate grade aggregation remains blocked even in explicit sample mode', () => {
  const separate = { ...course, gradeAggregation: 'separate' };
  const record = semester([separate], { PROJECT101: { internal: 36, endSem: 54 } });
  const policy = structuredClone(DEMO_POLICY);
  const before = structuredClone({ record, policy });
  for (const planningMode of ['auto', 'configured', 'sample']) {
    const result = planSemester(record, policy, { planningMode });
    assert.equal(result.currentSGPA, null);
    assert.equal(result.projectedSGPA, null);
    assert.equal(result.maxSGPA, null);
    assert.equal(result.currentStatus, 'unsupported-rules');
    assert.equal(result.projectionStatus, 'unsupported-rules');
    assert.equal(result.maximumStatus, 'unsupported-rules');
    assert.match(result.planningBasis.issues.join(' '), /PROJECT101.*aggregation/i);
  }
  assert.deepEqual({ record, policy }, before);
});

test('a subject-specific passing requirement cannot silently refer to an assessment that does not exist', () => {
  const internalOnly = { ...course, maxima: { internal: 20 } };
  const policy = { ...DEMO_POLICY, passRules: { PROJECT101: { aggregate: 40, components: { endSem: 40 } } } };
  const record = semester([internalOnly], { PROJECT101: { internal: 18 } });
  const before = structuredClone({ record, policy });
  const result = auto(record, policy);
  assert.equal(result.currentSGPA, null);
  assert.equal(result.projectedSGPA, null);
  assert.equal(result.maxSGPA, null);
  assert.equal(result.projectionStatus, 'unsupported-rules');
  assert.match(result.planningBasis.issues.join(' '), /endSem.*counted assessment/i);
  assert.deepEqual({ record, policy }, before);
});

test('conflicting aggregate aliases and unknown legacy rule keys are rejected and remain visible to planning', () => {
  const record = semester([course], { PROJECT101: { internal: 36 } });
  for (const passRules of [
    { aggregate: 40, total: 50 },
    { PROJECT101: { total: 40, unexpectedMinimum: 50 } },
  ]) {
    const policy = { ...DEMO_POLICY, passRules };
    const before = structuredClone({ record, policy });
    assert.throws(() => validatePolicy(policy), /agree|unsupported|unknown/i);
    const result = auto(record, policy);
    assert.equal(result.projectedSGPA, null);
    assert.equal(result.maxSGPA, null);
    assert.equal(result.projectionStatus, 'unsupported-rules');
    assert.equal(result.maximumStatus, 'unsupported-rules');
    assert.equal(result.planningBasis.fallback, false);
    assert.deepEqual({ record, policy }, before);
  }
});
