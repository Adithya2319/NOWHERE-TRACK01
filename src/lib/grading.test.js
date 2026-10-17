import { describe, expect, it } from 'vitest';
import { calculateSGPA, getAttendanceAlert, getAttendanceRecoveryAdvice, marksNeededForGrade, calculateGradeScore } from './grading';

describe('marks and grading', () => {
  it('calculates SGPA from weighted credits', () => {
    const sgpa = calculateSGPA([
      { credits: 4, gradePoints: 9 },
      { credits: 3, gradePoints: 8 },
      { credits: 4, gradePoints: 7 },
    ]);

    expect(sgpa).toBe(8);
  });

  it('flags the correct attendance thresholds', () => {
    expect(getAttendanceAlert({ present: 82, total: 100 })).toBe('safe');
    expect(getAttendanceAlert({ present: 70, total: 100 })).toBe('warning');
    expect(getAttendanceAlert({ present: 40, total: 100 })).toBe('critical');
  });

  it('calculates consecutive lectures needed to recover to 75% attendance', () => {
    expect(getAttendanceRecoveryAdvice({ present: 17, total: 24 })).toEqual({
      percentage: 70.8,
      lecturesToAttend: 4,
    });
    expect(getAttendanceRecoveryAdvice({ present: 15, total: 20 })).toBeNull();
    expect(getAttendanceRecoveryAdvice({ present: 0, total: 0 })).toMatchObject({
      lecturesToAttend: null,
    });
  });

  it('computes marks needed for a grade', () => {
    const result = marksNeededForGrade({ internal: 18, max: 100 }, 'A');
    expect(result.cutoff).toBe(80);
    expect(result.need).toBeGreaterThanOrEqual(0);
  });

  it('maps percentage to grade points', () => {
    expect(calculateGradeScore(92)).toMatchObject({ grade: 'O', points: 10 });
  });
});
