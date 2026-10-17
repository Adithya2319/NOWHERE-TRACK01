import { MU_GRADE_CUTOFFS, MU_GRADE_SCALE } from '../config/muGrading';

export function getAttendancePercentage({ present, total }) {
  if (!total) return 0;
  return Number(((present / total) * 100).toFixed(1));
}

export function getAttendanceAlert(entry) {
  const percentage = getAttendancePercentage(entry);
  if (percentage < 50) return 'critical';
  if (percentage < 75) return 'warning';
  return 'safe';
}

export function getAttendanceRecoveryAdvice(entry, threshold = 75) {
  const total = Number(entry.total);
  const present = Number(entry.present);
  const percentage = getAttendancePercentage({ present, total });
  if (percentage >= threshold) return null;
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(present) || present < 0) {
    return { percentage, lecturesToAttend: null };
  }

  const lecturesToAttend = Math.max(
    0,
    Math.ceil((threshold * total - 100 * present) / (100 - threshold)),
  );
  return { percentage, lecturesToAttend };
}

export function calculateGradeScore(percentage) {
  const grades = Object.entries(MU_GRADE_CUTOFFS).sort((a, b) => Number(b[1]) - Number(a[1]));
  for (const [grade, cutoff] of grades) {
    if (percentage >= cutoff) return { grade, points: MU_GRADE_SCALE[grade] };
  }
  return { grade: 'F', points: 0 };
}

export function calculateSGPA(subjects) {
  const valid = subjects.filter((subject) => Number.isFinite(subject.credits) && Number.isFinite(subject.gradePoints));
  const credits = valid.reduce((acc, subject) => acc + Number(subject.credits), 0);
  const weighted = valid.reduce((acc, subject) => acc + Number(subject.credits) * Number(subject.gradePoints), 0);
  if (!credits) return 0;
  return Number((weighted / credits).toFixed(2));
}

export function calculateCGPA(semesters) {
  const items = Array.isArray(semesters) ? semesters : [semesters];
  const totalCredits = items.reduce((sum, semester) => sum + (semester.credits || 0), 0);
  const totalPoints = items.reduce((sum, semester) => sum + (semester.points || 0), 0);
  if (!totalCredits) return 0;
  return Number((totalPoints / totalCredits).toFixed(2));
}

export function marksNeededForGrade(subject, grade = 'A') {
  const maxMarks = Number(subject.max || 100);
  const cutoff = MU_GRADE_CUTOFFS[grade] ?? MU_GRADE_CUTOFFS.A;
  const currentInternal = Number(subject.internal || 0);
  const totalNeeded = (maxMarks * cutoff) / 100;
  const needed = Math.max(0, totalNeeded - currentInternal);
  const reachable = needed <= maxMarks;
  return {
    grade,
    cutoff,
    totalNeeded: Number(totalNeeded.toFixed(1)),
    currentInternal,
    need: Number(needed.toFixed(1)),
    reachable,
    reason: reachable ? 'On track.' : 'Grade is no longer reachable with current internal score.',
  };
}

export function getGradeLockState(subject) {
  const gradeCheck = marksNeededForGrade(subject, 'A');
  return {
    canReachA: gradeCheck.reachable,
    locked: !gradeCheck.reachable,
    reason: gradeCheck.reason,
  };
}
