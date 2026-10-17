import { forecastAttendance } from './attendance.js';

// Deterministic planning only. These sample grade/pass rules are NOT VESIT policy.
export const DEMO_POLICY = {
  mode: 'demo', confirmed: false, source: 'Sample planning rules; not an official VESIT regulation', attendanceThreshold: 75,
  gradeBands: [
    { grade: 'O', min: 90, points: 10 }, { grade: 'A', min: 80, points: 9 },
    { grade: 'B', min: 70, points: 8 }, { grade: 'C', min: 60, points: 7 },
    { grade: 'D', min: 50, points: 6 }, { grade: 'P', min: 40, points: 4 },
    { grade: 'F', min: 0, points: 0 },
  ],
  passRules: { aggregate: 40, components: { internal: 40, endSem: 40, termWork: 40, practicalOral: 40 } },
};

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const present = value => value !== null && value !== undefined && value !== '';
const finite = value => typeof value === 'number' && Number.isFinite(value);
const halfStep = value => Number.isInteger(value * 2);
const ceilHalf = value => Math.ceil(value * 2) / 2;
// Check the candidate against the same percentage comparison used for grades.
// This corrects multiplication round-off (125 * 64.4 / 100 is slightly above
// 80.5 in JavaScript) without granting scores an epsilon below the real cutoff.
const marksForPercentage = (maximum, minimum, earned = 0) => {
  if (!maximum || minimum == null) return 0;
  let needed = Math.max(0, ceilHalf(maximum * minimum / 100 - earned));
  if (100 * (earned + needed) / maximum < minimum) needed += 0.5;
  if (needed >= 0.5 && 100 * (earned + needed - 0.5) / maximum >= minimum) needed -= 0.5;
  return needed;
};
const componentsOf = course => Object.entries(course.maxima).filter(([key]) => !(key === 'midterm' && course.midtermIncludedInInternal === true));
const usable = policy => Boolean(policy?.gradeBands?.length && (policy.confirmed === true || policy.mode === 'demo'));
const componentKeys = new Set(['midterm', 'internal', 'endSem', 'termWork', 'practicalOral']);
const ruleKeys = new Set(['aggregate', 'total', 'theory', 'components', ...componentKeys]);
const generalRules = rules => object(rules) && Object.keys(rules).some(key => ruleKeys.has(key));
const aggregationKeys = ['aggregation', 'gradeAggregation', 'theoryPracticalAggregation'];
const supportedAggregations = new Set(['combined', 'combined-components', 'combined-percentage']);
const aggregationIssues = (value, label) => aggregationKeys.flatMap(key => value?.[key] !== undefined && !supportedAggregations.has(value[key]) ? [`${label}${key}: unsupported grade aggregation; only combined assessment percentages are implemented.`] : []);
// Quantize the exact ratio in integer half-mark units. Computing a percentage
// first can turn an exact .25-mark tie into .249999... and round it downward.
const extrapolatedHalfMarks = (maximum, earned, assessedMax) => {
  const numerator = BigInt(maximum * 2) * BigInt(earned * 2);
  const denominator = BigInt(assessedMax * 2);
  return Number((2n * numerator + denominator) / (2n * denominator)) / 2;
};
const validDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export function validatePolicy(policy) {
  if (!object(policy) || typeof policy.confirmed !== 'boolean' || typeof policy.source !== 'string') throw Error('Policy requires a source and confirmation status.');
  const unsupportedAggregation = aggregationIssues(policy, 'Policy ');
  if (unsupportedAggregation.length) throw Error(unsupportedAggregation.join(' '));
  if (policy.attendanceThreshold != null && (!finite(policy.attendanceThreshold) || policy.attendanceThreshold <= 0 || policy.attendanceThreshold > 100)) throw Error('Attendance target must be greater than 0 and at most 100.');
  if (!Array.isArray(policy.gradeBands) || policy.gradeBands.some(b => !object(b) || typeof b.grade !== 'string' || !b.grade.trim() || !finite(b.min) || b.min < 0 || b.min > 100 || !finite(b.points) || b.points < 0 || b.points > 10)) throw Error('Invalid grade bands.');
  if (policy.gradeBands.length && (!policy.gradeBands.some(b => b.min === 0) || new Set(policy.gradeBands.map(b => b.min)).size !== policy.gradeBands.length || new Set(policy.gradeBands.map(b => b.grade)).size !== policy.gradeBands.length)) throw Error('Grade bands need distinct names/cutoffs and a zero cutoff.');
  const bands = [...policy.gradeBands].sort((a, b) => a.min - b.min);
  if (bands.some((b, index) => index > 0 && b.points < bands[index - 1].points)) throw Error('Grade points must increase with the cutoff.');
  if (!object(policy.passRules)) throw Error('Pass rules must be an object.');
  const checkRules = rules => {
    if (!object(rules)) throw Error('Each pass rule must be an object.');
    for (const [key, value] of Object.entries(rules)) {
      if (!ruleKeys.has(key)) throw Error(`Unsupported pass-rule key: ${key}.`);
      if (key === 'components') {
        if (!object(value)) throw Error('Component pass minima must be percentages.');
        if (Object.keys(value).some(component => !componentKeys.has(component))) throw Error('Unsupported component pass-rule key.');
        if (Object.values(value).some(v => !finite(v) || v < 0 || v > 100)) throw Error('Component pass minima must be percentages.');
      } else if (!finite(value) || value < 0 || value > 100) throw Error('Pass minima must be percentages from 0 to 100.');
    }
    if (rules.aggregate != null && rules.total != null && rules.aggregate !== rules.total) throw Error('Aggregate and total pass minima must agree when both are supplied.');
    for (const key of componentKeys) if (rules[key] != null && rules.components?.[key] != null && rules[key] !== rules.components[key]) throw Error(`Conflicting pass minima for ${key}.`);
  };
  if (generalRules(policy.passRules)) checkRules(policy.passRules);
  else Object.values(policy.passRules).forEach(checkRules);
  if (policy.confirmed && (!policy.source.trim() || !bands.length)) throw Error('Confirmed rules require an applicable source and grade bands.');
  return true;
}

export function validateSemester(record) {
  if (!object(record) || !Array.isArray(record.courses) || !record.courses.length || !object(record.marks) || !object(record.attendance) || !Array.isArray(record.events)) throw Error('A semester needs courses, marks, attendance counts and an attendance-record array.');
  const codes = new Set();
  for (const course of record.courses) {
    if (!object(course) || typeof course.code !== 'string' || !course.code.trim() || codes.has(course.code) || typeof course.subject !== 'string' || !course.subject.trim()) throw Error('Courses need unique codes and a subject name.');
    codes.add(course.code);
    if (!finite(course.credits) || course.credits < 0 || course.credits > 100) throw Error('Credits must be finite and nonnegative; zero-credit courses are excluded from SGPA.');
    if (course.practicalCredits != null && (!finite(course.practicalCredits) || course.practicalCredits < 0 || course.practicalCredits > course.credits)) throw Error('Practical credits must fit the course credits.');
    if (!object(course.maxima) || !Object.keys(course.maxima).length || Object.values(course.maxima).some(v => !finite(v) || v <= 0 || v > 10000 || !halfStep(v))) throw Error('Assessment maxima must be positive numbers in half-mark increments.');
    if (!componentsOf(course).length) throw Error('A course needs at least one counted assessment.');
    const marks = record.marks[course.code];
    if (marks != null && !object(marks)) throw Error('Course marks must be an object.');
    for (const [key, value] of Object.entries(marks || {})) {
      if (!(key in course.maxima)) throw Error(`Unknown assessment ${course.code}: ${key}.`);
      if (present(value) && (!finite(value) || value < 0 || value > course.maxima[key] || !halfStep(value))) throw Error(`${course.code} ${key}: enter 0–${course.maxima[key]} in half-mark increments, or leave blank.`);
    }
  }
  if (Object.keys(record.marks).some(code => !codes.has(code))) throw Error('Marks contain an unknown course.');
  if (record.target != null && (!finite(record.target) || record.target < 0 || record.target > 10)) throw Error('Target SGPA must be between 0 and 10.');
  if (record.confirmed != null && typeof record.confirmed !== 'boolean') throw Error('Semester confirmation must be true or false.');
  if (record.attendance != null) {
    if (!object(record.attendance)) throw Error('Attendance must be an object.');
    for (const [key, counts] of Object.entries(record.attendance)) {
      const match = /^(.+):(theory|practical)$/.exec(key);
      if (!match || !codes.has(match[1]) || !object(counts) || !Number.isSafeInteger(counts.present) || !Number.isSafeInteger(counts.total) || counts.present < 0 || counts.total < counts.present) throw Error('Attendance keys must identify a course and theory/practical, with valid counts.');
    }
  }
  if (record.attendancePlans !== undefined) {
    if (!object(record.attendancePlans)) throw Error('Attendance plans must be an object.');
    for (const [key, plan] of Object.entries(record.attendancePlans)) {
      const match = /^(.+):(theory|practical)$/.exec(key);
      const course = record.courses.find(entry => entry.code === match?.[1]);
      const conducted = match?.[2] === 'theory' ? course?.credits > course?.practicalCredits : course?.practicalCredits > 0;
      if (!match || !conducted || !object(plan) || !['remaining', 'plannedPresent', 'target'].every(field => finite(plan[field]))) throw Error('Attendance plans need a conducted course/type and numeric remaining, planned-present and target values.');
      const counts = record.attendance[key] || { present: 0, total: 0 };
      forecastAttendance({ ...counts, remaining: plan.remaining, plannedPresent: plan.plannedPresent, target: plan.target });
    }
  }
  if (record.events != null) {
    if (!Array.isArray(record.events)) throw Error('Attendance records must be an array.');
    const ids = new Set();
    const eventCounts = new Map();
    for (const event of record.events) {
      if (!object(event) || !codes.has(event.code) || !['theory', 'practical'].includes(event.type) || typeof event.present !== 'boolean' || !validDate(event.date) || typeof event.id !== 'string' || !event.id.trim() || event.id.length > 128 || ids.has(event.id)) throw Error('Attendance records need unique IDs, a valid course/type and a real calendar date.');
      ids.add(event.id);
      const key = `${event.code}:${event.type}`;
      const count = eventCounts.get(key) || { present: 0, absent: 0 };
      count[event.present ? 'present' : 'absent'] += 1;
      eventCounts.set(key, count);
    }
    for (const [key, counts] of eventCounts) {
      const saved = record.attendance[key];
      if (!saved || saved.present < counts.present || saved.total - saved.present < counts.absent) throw Error('Attendance counts must include every dated present and absent record; legacy baseline counts may be higher.');
    }
  }
  return true;
}

function courseRules(course, policy) {
  const rules = policy?.passRules || {};
  const direct = generalRules(rules);
  const selected = direct ? rules : rules[course.code];
  if (!selected || !Object.keys(selected).length) return null;
  const componentRules = { ...(selected.components || {}) };
  for (const [key, value] of Object.entries(selected)) if (!['aggregate', 'total', 'theory', 'components'].includes(key)) componentRules[key] = value;
  return { aggregate: selected.aggregate ?? selected.total ?? 0, aggregateConfigured: selected.aggregate != null || selected.total != null, theory: selected.theory, components: componentRules };
}

function gradingState(course, policy) {
  const unsupported = aggregationIssues(course, `${course.code} `);
  // Missing configuration is different from a malformed or unsupported rule.
  // The former may use an explicitly labelled planning fallback; the latter
  // must remain visible instead of being silently replaced.
  if (!object(policy)) return { status: unsupported.length ? 'unsupported-rules' : 'missing-rules', issues: unsupported.length ? unsupported : ['No grading policy is configured.'], rules: null };
  try {
    validatePolicy({ ...policy, source: policy.source ?? '', confirmed: typeof policy.confirmed === 'boolean' ? false : policy.confirmed ?? false, gradeBands: policy.gradeBands ?? [], passRules: policy.passRules ?? {} });
  } catch (failure) {
    unsupported.push(failure.message);
  }
  if (unsupported.length) return { status: 'unsupported-rules', issues: unsupported, rules: null };
  let rules = courseRules(course, policy);
  if (rules && !generalRules(policy.passRules)) {
    const counted = new Set(componentsOf(course).map(([key]) => key));
    for (const key of Object.keys(rules.components)) if (!counted.has(key)) unsupported.push(`${course.code}: pass minimum for ${key} does not match a counted assessment.`);
    if (rules.theory != null && ![...counted].some(key => ['midterm', 'internal', 'endSem'].includes(key))) unsupported.push(`${course.code}: theory pass minimum has no counted theory assessments.`);
  }
  if (unsupported.length) return { status: 'unsupported-rules', issues: unsupported, rules: null };
  const counted = componentsOf(course);
  if (rules && !rules.aggregateConfigured && !counted.some(([key]) => rules.components[key] != null || (rules.theory != null && ['midterm', 'internal', 'endSem'].includes(key)))) rules = null;
  const missing = [];
  if (!policy.gradeBands?.length) missing.push('Grade bands are not configured.');
  if (policy.mode !== 'demo' && policy.confirmed !== true) missing.push('Configured grading rules have not been confirmed against an applicable source.');
  if (policy.confirmed === true && !policy.source?.trim()) missing.push('A confirmed grading policy needs an applicable source.');
  if (!rules) missing.push(`${course.code}: applicable passing requirements are not configured.`);
  return { status: missing.length ? 'missing-rules' : 'known', issues: missing, rules };
}

function gates(course, marks, policy, state = gradingState(course, policy)) {
  const rules = state.rules;
  if (!rules || state.status !== 'known') return { known: false, failures: [] };
  const failures = [];
  const components = componentsOf(course);
  for (const [key, max] of components) {
    const minimum = rules.components[key];
    if (minimum != null && present(marks[key]) && 100 * marks[key] / max < minimum) failures.push(`${key} ${marks[key]}/${max} is below its ${minimum}% pass minimum`);
  }
  const testAggregate = (entries, min, label) => {
    if (min == null || !entries.length || entries.some(([key]) => !present(marks[key]))) return;
    const maximum = entries.reduce((sum, [, max]) => sum + max, 0);
    const score = entries.reduce((sum, [key]) => sum + marks[key], 0);
    if (100 * score / maximum < min) failures.push(`${label} is below its ${min}% pass minimum`);
  };
  testAggregate(components, rules.aggregate, 'Aggregate');
  testAggregate(components.filter(([key]) => ['midterm', 'internal', 'endSem'].includes(key)), rules.theory, 'Theory aggregate');
  return { known: true, failures };
}

export function assessCourse(course, marks = {}, policy, { project = false } = {}) {
  const components = componentsOf(course);
  const maximum = components.reduce((sum, [, max]) => sum + max, 0);
  const recorded = components.filter(([key]) => present(marks[key]));
  const earned = recorded.reduce((sum, [key]) => sum + marks[key], 0);
  const assessedMax = recorded.reduce((sum, [, max]) => sum + max, 0);
  const percentage = assessedMax ? 100 * earned / assessedMax : null;
  const complete = recorded.length === components.length;
  const projectedMarks = { ...marks };
  if (project && percentage !== null) for (const [key, max] of components) if (!present(projectedMarks[key])) projectedMarks[key] = Math.min(max, extrapolatedHalfMarks(max, earned, assessedMax));
  const canAssess = complete || (project && percentage !== null);
  const evaluated = project ? projectedMarks : marks;
  const state = gradingState(course, policy);
  const pass = gates(course, evaluated, policy, state);
  const finalPercentage = canAssess ? 100 * components.reduce((sum, [key]) => sum + evaluated[key], 0) / maximum : null;
  let grade = usable(policy) && pass.known && canAssess ? [...policy.gradeBands].sort((a, b) => b.min - a.min).find(b => finalPercentage >= b.min) || null : null;
  if (grade && pass.failures.length) grade = { grade: 'F', min: 0, points: 0 };
  const status = project && percentage === null ? 'insufficient-data' : state.status !== 'known' ? state.status : canAssess ? 'ready' : 'incomplete-results';
  return { percentage, finalPercentage, earned, maximum, assessedMax, coverage: 100 * assessedMax / maximum, complete, grade, status, rulesStatus: state.status, ruleIssues: state.issues, rulesKnown: usable(policy) && pass.known, gateFailures: pass.failures, projected: !complete && project, projectedMarks, assumptions: !complete && project ? (percentage == null ? 'No recorded marks: insufficient data for a projection.' : 'Unknown components use the recorded percentage, rounded to half marks with exact ties rounded up; this is a what-if estimate.') : '' };
}

export function requiredForGrade(course, marks = {}, band, policy) {
  const components = componentsOf(course);
  const remaining = components.filter(([key]) => !present(marks[key]));
  const maximum = components.reduce((sum, [, max]) => sum + max, 0);
  const earned = components.reduce((sum, [key]) => sum + (present(marks[key]) ? marks[key] : 0), 0);
  const remainingMax = remaining.reduce((sum, [, max]) => sum + max, 0);
  const state = gradingState(course, policy);
  const rules = state.rules;
  const pass = gates(course, marks, policy, state);
  const passing = band.points > 0;
  const base = { grade: band.grade, points: band.points, remainingMax, component: remaining.length === 1 ? remaining[0][0] : null, maximum: remaining.length === 1 ? remaining[0][1] : remainingMax, locked: remaining.length === 0, gateFailures: pass.failures };
  if (!usable(policy) || state.status !== 'known') return { ...base, required: null, needed: null, reachable: null, reason: state.issues.join(' ') || 'Applicable grading and passing rules are unverified.' };
  if (passing && pass.failures.length) return { ...base, required: null, needed: null, reachable: false, reason: `Locked pass gate: ${pass.failures.join('; ')}.` };
  const requiredByComponent = Object.fromEntries(remaining.map(([key, max]) => [key, passing ? marksForPercentage(max, rules.components[key] ?? 0) : 0]));
  let needed = Math.max(0, marksForPercentage(maximum, band.min, earned), passing ? marksForPercentage(maximum, rules.aggregate, earned) : 0, Object.values(requiredByComponent).reduce((a, b) => a + b, 0));
  if (passing && rules.theory != null) {
    const theory = components.filter(([key]) => ['midterm', 'internal', 'endSem'].includes(key));
    const theoryMissing = theory.filter(([key]) => !present(marks[key]));
    const theoryRequired = marksForPercentage(theory.reduce((s, [, m]) => s + m, 0), rules.theory, theory.reduce((s, [key]) => s + (present(marks[key]) ? marks[key] : 0), 0));
    const outsideRequired = remaining.filter(([key]) => !theoryMissing.some(([theoryKey]) => theoryKey === key)).reduce((s, [key]) => s + requiredByComponent[key], 0);
    needed = Math.max(needed, theoryRequired + outsideRequired);
    if (theoryRequired > theoryMissing.reduce((s, [, max]) => s + max, 0)) return { ...base, required: needed, needed, requiredByComponent, reachable: false, reason: 'The theory pass minimum cannot be reached with the remaining theory marks.' };
  }
  const atMaximum = Object.fromEntries(components.map(([key, max]) => [key, present(marks[key]) ? marks[key] : max]));
  const best = assessCourse(course, atMaximum, policy);
  const reachable = needed <= remainingMax && (!passing || best.grade?.points >= band.points);
  return { ...base, required: needed, needed, requiredByComponent, reachable, reason: remaining.length === 0 ? (reachable ? 'Recorded result already reaches this grade.' : 'Recorded marks are locked below this grade.') : reachable ? (remaining.length === 1 ? `Need ${needed}/${remainingMax} in ${remaining[0][0]}; applicable pass gates included.` : `Need at least ${needed}/${remainingMax} across remaining components, meeting each pass gate.`) : `Needs ${needed}/${remainingMax} remaining marks or an unmet pass gate; unreachable.` };
}

export function planSemester(record, policy, { planningMode = 'configured' } = {}) {
  if (!['configured', 'auto', 'sample'].includes(planningMode)) throw Error('Planning mode must be configured, auto or sample.');
  const creditedCourses = record.courses.filter(course => course.credits > 0);
  const configuredStates = creditedCourses.map(course => gradingState(course, policy));
  const unsupported = configuredStates.some(state => state.status === 'unsupported-rules');
  const missing = configuredStates.some(state => state.status === 'missing-rules');
  const fallback = planningMode === 'auto' && missing && !unsupported;
  const planningPolicy = planningMode === 'sample' || fallback ? DEMO_POLICY : policy;
  const sample = planningPolicy?.mode === 'demo';
  const planningBasis = {
    mode: sample ? 'sample' : 'configured', fallback,
    label: sample ? 'Sample planning rules (not official VESIT rules)' : 'Configured grading rules',
    issues: [...new Set(configuredStates.flatMap(state => state.issues))],
  };
  const rows = record.courses.map(course => {
    const marks = record.marks?.[course.code] || {};
    const maximumMarks = Object.fromEntries(componentsOf(course).map(([key, max]) => [key, present(marks[key]) ? marks[key] : max]));
    return { course, actual: assessCourse(course, marks, policy), projected: assessCourse(course, marks, planningPolicy, { project: true }), maximum: assessCourse(course, maximumMarks, planningPolicy), requirements: (Array.isArray(planningPolicy?.gradeBands) ? planningPolicy.gradeBands : []).filter(b => object(b) && b.points > 0).map(band => requiredForGrade(course, marks, band, planningPolicy)) };
  });
  const credited = rows.filter(row => row.course.credits > 0);
  const credits = credited.reduce((sum, row) => sum + row.course.credits, 0);
  const weighted = key => credits && credited.every(row => row[key].grade !== null) ? credited.reduce((sum, row) => sum + row.course.credits * row[key].grade.points, 0) / credits : null;
  const currentSGPA = weighted('actual');
  const projectedSGPA = weighted('projected');
  const maxSGPA = weighted('maximum');
  const estimated = credited.filter(row => row.projected.grade !== null);
  const estimatedCredits = estimated.reduce((sum, row) => sum + row.course.credits, 0);
  const partialProjectedSGPA = estimatedCredits ? estimated.reduce((sum, row) => sum + row.course.credits * row.projected.grade.points, 0) / estimatedCredits : null;
  const aggregateStatus = key => {
    if (!credits) return 'no-credits';
    if (credited.some(row => row[key].rulesStatus === 'unsupported-rules')) return 'unsupported-rules';
    if (credited.some(row => row[key].rulesStatus === 'missing-rules')) return 'missing-rules';
    if (key === 'projected' && credited.some(row => row.projected.status === 'insufficient-data')) return 'insufficient-data';
    return credited.every(row => row[key].grade !== null) ? 'ready' : 'incomplete-results';
  };
  const projectionCoverage = {
    estimatedCredits, totalCredits: credits, projectedSubjects: estimated.length, totalSubjects: credited.length,
    missingSubjects: credited.filter(row => row.projected.grade === null).map(row => ({ code: row.course.code, subject: row.course.subject, reason: row.projected.status === 'insufficient-data' ? 'No assessed marks: insufficient data for a projection.' : row.projected.ruleIssues.join(' ') || 'A projection is unavailable.' })),
  };
  return { currentSGPA, projectedSGPA, maxSGPA, partialProjectedSGPA, currentStatus: aggregateStatus('actual'), projectionStatus: aggregateStatus('projected'), maximumStatus: aggregateStatus('maximum'), projectionCoverage, planningBasis, planningPolicy, targetReachable: maxSGPA === null || record.target == null ? null : record.target <= maxSGPA, credits, rows };
}

// Only saved, explicitly confirmed complete results contribute. Do not average SGPAs:
// semesters may carry different credit totals, including credits for failed courses.
export function cumulativeResult(semesters, policy) {
  const confirmed = Object.values(semesters || {}).filter(record => record.confirmed === true);
  if (!confirmed.length) return null;
  const results = confirmed.map(record => planSemester(record, policy));
  if (results.some(result => result.currentSGPA === null)) return null;
  const credits = results.reduce((sum, result) => sum + result.credits, 0);
  return credits > 0 ? results.reduce((sum, result) => sum + result.currentSGPA * result.credits, 0) / credits : null;
}
