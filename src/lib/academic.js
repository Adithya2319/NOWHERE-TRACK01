export function validatePolicy(policy) {
  if (!policy || typeof policy.confirmed !== 'boolean' || typeof policy.source !== 'string') throw Error('Policy requires source and confirmed fields.');
  if (policy.attendanceThreshold !== null && (!Number.isFinite(policy.attendanceThreshold) || policy.attendanceThreshold <= 0 || policy.attendanceThreshold > 100)) throw Error('Attendance target must be greater than 0 and at most 100.');
  if (!Array.isArray(policy.gradeBands) || policy.gradeBands.some(b => !b.grade || !Number.isFinite(b.min) || b.min < 0 || b.min > 100 || !Number.isFinite(b.points) || b.points < 0 || b.points > 10)) throw Error('Invalid grade bands.');
  if (policy.gradeBands.length && (!policy.gradeBands.some(b => b.min === 0) || new Set(policy.gradeBands.map(b => b.min)).size !== policy.gradeBands.length)) throw Error('Grade bands need unique cutoffs including zero.');
  if (!policy.passRules || typeof policy.passRules !== 'object' || Array.isArray(policy.passRules)) throw Error('passRules must be an object keyed by course code.');
  for (const rules of Object.values(policy.passRules)) {
    if (!rules || typeof rules !== 'object' || Array.isArray(rules) || !Object.keys(rules).length) throw Error('Each course needs explicit pass minima.');
    for (const [key,value] of Object.entries(rules)) if (!['total','theory','midterm','internal','endSem','termWork','practicalOral'].includes(key) || !Number.isFinite(value) || value < 0 || value > 100) throw Error('Pass minima must use valid assessment keys and percentages from 0 to 100.');
  }
  if (policy.confirmed && (!policy.source.trim() || !policy.gradeBands.length)) throw Error('Confirming grading requires an official source and complete grade bands.');
  return policy;
}
export { attendanceAdvice } from '../../shared/attendance.js';
export function performance(course, marks = {}, policy, simulate = false) {
  const components = Object.entries(course.maxima);
  const entered = components.filter(([key]) => marks[key] !== null && marks[key] !== undefined && marks[key] !== '');
  const earned = entered.reduce((sum, [key]) => sum + marks[key], 0);
  const assessedMax = entered.reduce((sum, [, max]) => sum + max, 0);
  const maximum = components.reduce((sum, [, max]) => sum + max, 0);
  const complete = entered.length === components.length;
  const percentage = assessedMax ? earned / assessedMax * 100 : null;
  const grade = policy?.confirmed && percentage !== null && (complete || simulate) ? [...policy.gradeBands].sort((a,b) => b.min-a.min).find(b => percentage >= b.min) : null;
  const rules = policy?.passRules?.[course.code];
  const failed = complete && rules && Object.entries(rules).some(([key, min]) => key === 'total' ? percentage < min : key === 'theory' ? (['midterm','internal','endSem'].reduce((s,k) => s+(marks[k] ?? 0),0) / ['midterm','internal','endSem'].reduce((s,k) => s+(course.maxima[k] ?? 0),0)*100 < min) : course.maxima[key] && marks[key]/course.maxima[key]*100 < min);
  return { percentage, maximum, earned, complete, coverage: maximum ? assessedMax/maximum*100 : 0, grade: policy?.confirmed && failed ? {grade: 'F', points: 0} : grade, projected: !complete, rulesKnown: Boolean(policy?.confirmed && rules && Object.keys(rules).length) };
}
export function semesterResult(semester, policy, projected = false) {
  const rows = semester.courses.map(c => ({ ...c, ...performance(c, semester.marks[c.code], policy, projected) }));
  const valid = rows.length && rows.every(r => r.grade && (projected || (r.complete && r.rulesKnown)));
  const credits = rows.reduce((s,r) => s+r.credits,0);
  const points = valid ? rows.reduce((s,r) => s+r.credits*r.grade.points,0) : null;
  return { rows, credits, points, sgpa: valid && credits ? points/credits : null };
}
export function cumulativeResult(semesters, policy) {
  const completed = Object.values(semesters).filter(s => s.confirmed).map(s => semesterResult(s,policy));
  if (!completed.length || completed.some(s => s.sgpa === null)) return null;
  return completed.reduce((s,r) => s+r.points,0)/completed.reduce((s,r) => s+r.credits,0);
}
export function requiredMarks(course, marks, percentage) {
  const result = performance(course, marks);
  const remaining = Object.entries(course.maxima).filter(([k]) => marks?.[k] == null || marks[k] === '').reduce((s,[,m]) => s+m,0);
  const needed = Math.max(0, result.maximum*percentage/100-result.earned);
  return { needed, remaining, reachable: needed <= remaining };
}
