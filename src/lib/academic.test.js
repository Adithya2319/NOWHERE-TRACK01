import { describe, it, expect } from 'vitest';
import { CURRICULUM, createSemester, DEFAULT_POLICY } from '../config/vesit';
import { attendanceAdvice, performance, semesterResult, cumulativeResult, requiredMarks, validatePolicy } from './academic';

describe('VESIT R26 academic calculations', () => {
  it('matches official credit and marks totals', () => {
    expect(CURRICULUM[1].reduce((s,c)=>s+c.credits,0)).toBe(18);
    expect(CURRICULUM[2].reduce((s,c)=>s+c.credits,0)).toBe(24);
    expect(CURRICULUM[1].reduce((s,c)=>s+Object.values(c.maxima).reduce((a,b)=>a+b,0),0)).toBe(440);
    expect(CURRICULUM[2].reduce((s,c)=>s+Object.values(c.maxima).reduce((a,b)=>a+b,0),0)).toBe(645);
  });
  it('uses assessment maxima, preserves missing versus zero, and blocks unverified grades', () => {
    const c=CURRICULUM[1][0];
    expect(performance(c,{midterm:10,internal:20},DEFAULT_POLICY)).toMatchObject({percentage:75,complete:false,coverage:40,grade:null});
    expect(performance(c,{},DEFAULT_POLICY).percentage).toBeNull();
    expect(performance(c,{midterm:0},DEFAULT_POLICY).percentage).toBe(0);
    expect(semesterResult(createSemester(1),DEFAULT_POLICY).sgpa).toBeNull();
    expect(performance(c,{midterm:0,internal:0,endSem:0},{confirmed:false,passRules:{[c.code]:{total:50}}}).grade).toBeNull();
  });
  it('weights credits and includes failed credits; only confirmed semesters contribute to CGPA', () => {
    const policy={confirmed:true,gradeBands:[{grade:'X',min:50,points:10},{grade:'F',min:0,points:0}],passRules:{a:{total:50},b:{total:50}}};
    const s={confirmed:false,courses:[{code:'a',credits:4,maxima:{internal:100}},{code:'b',credits:2,maxima:{internal:100}}],marks:{a:{internal:80},b:{internal:20}}};
    expect(semesterResult(s,policy).sgpa).toBeCloseTo(6.66667);
    expect(cumulativeResult({1:s},policy)).toBeNull();
    expect(cumulativeResult({1:{...s,confirmed:true}},policy)).toBeCloseTo(6.66667);
  });
  it('uses exact attendance ratios at boundaries and handles 100%, no data, invalid counts', () => {
    expect(attendanceAdvice(17,24,75).recover).toBe(4);
    expect(attendanceAdvice(3,4,75).miss).toBe(0);
    expect(attendanceAdvice(4,4,75).miss).toBe(1);
    expect(attendanceAdvice(2,3,100).recover).toBe(Infinity);
    expect(attendanceAdvice(0,0,null).percentage).toBeNull();
    expect(()=>attendanceAdvice(-1,2,75)).toThrow();
    expect(()=>attendanceAdvice(3,2,75)).toThrow();
  });
  it('bounds required marks by remaining components', () => {
    expect(requiredMarks(CURRICULUM[1][0],{midterm:0,internal:0},80)).toEqual({needed:80,remaining:60,reachable:false});
  });
  it('rejects malformed grading policies', () => {
    expect(()=>validatePolicy({...DEFAULT_POLICY,attendanceThreshold:101})).toThrow();
    expect(()=>validatePolicy({...DEFAULT_POLICY,confirmed:true})).toThrow();
  });
});
