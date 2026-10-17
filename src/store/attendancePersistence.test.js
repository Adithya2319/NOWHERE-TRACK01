import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSemester, DEFAULT_POLICY } from '../config/vesit';

const ACADEMIC_KEY = 'campus360-vesit-r26-v1';
const LEGACY_KEY = 'campus360-state';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const previousValues = new Map();
let secureGetRandomValues;

beforeEach(() => {
  vi.resetModules();
  secureGetRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  for (const key of [ACADEMIC_KEY, LEGACY_KEY]) {
    previousValues.set(key, localStorage.getItem(key));
    localStorage.removeItem(key);
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [key, value] of previousValues) {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  }
  previousValues.clear();
  vi.resetModules();
});

function seedAttendance() {
  const firstSemester = createSemester(1);
  firstSemester.attendance['26ETBS11:theory'] = { present: 3, total: 4 };
  firstSemester.events.push({
    id: 'previous-attendance-id', code: '26ETBS11', type: 'theory', present: true, date: '2026-10-14',
  });
  const secondSemester = createSemester(2);
  secondSemester.attendance['26ETBS21:theory'] = { present: 1, total: 2 };
  secondSemester.marks['26ETBS21'] = { midterm: 12 };
  const academic = { semester: 1, semesters: { 1: firstSemester, 2: secondSemester }, policy: DEFAULT_POLICY };
  const legacy = { attendance: [{ subject: 'Existing attendance', present: 8, absent: 2, total: 10 }] };
  localStorage.setItem(ACADEMIC_KEY, JSON.stringify(academic));
  localStorage.setItem(LEGACY_KEY, JSON.stringify(legacy));
  return { academic, legacy };
}

async function verifyAttendancePersists() {
  const { academic, legacy } = seedAttendance();
  const { useCampusStore } = await import('./useCampusStore');
  const observedCounts = [];
  const unsubscribe = useCampusStore.subscribe(state => {
    observedCounts.push(state.semesters[1].attendance['26ETBS11:theory']);
  });
  try {
    useCampusStore.getState().recordLecture('26ETBS11', 'theory', true, '2026-10-16');
    expect(useCampusStore.getState().semesters[1].attendance['26ETBS11:theory']).toEqual({ present: 4, total: 5 });
    useCampusStore.getState().recordLecture('26ETBS11', 'theory', false, '2026-10-16');
    expect(useCampusStore.getState().semesters[1].attendance['26ETBS11:theory']).toEqual({ present: 4, total: 6 });
  } finally {
    unsubscribe();
  }

  expect(observedCounts).toEqual([{ present: 4, total: 5 }, { present: 4, total: 6 }]);
  const state = useCampusStore.getState();
  const events = state.semesters[1].events;
  expect(events).toHaveLength(3);
  expect(events[0]).toEqual(academic.semesters[1].events[0]);
  expect(events.slice(1).map(event => event.present)).toEqual([true, false]);
  for (const event of events.slice(1)) expect(event.id).toMatch(UUID_V4);
  expect(new Set(events.map(event => event.id)).size).toBe(3);
  expect(state.semesters[1].courses).toEqual(academic.semesters[1].courses);
  expect(state.semesters[2]).toEqual(academic.semesters[2]);
  expect(state.attendance).toEqual(legacy.attendance);
  expect(state.storageError).toBe('');
  const savedAcademic = JSON.parse(localStorage.getItem(ACADEMIC_KEY));
  expect(savedAcademic.semesters).toEqual(state.semesters);
  expect(JSON.parse(localStorage.getItem(LEGACY_KEY)).attendance).toEqual(legacy.attendance);

  vi.resetModules();
  const { useCampusStore: refreshedStore } = await import('./useCampusStore');
  expect(refreshedStore.getState().semesters).toEqual(savedAcademic.semesters);
  expect(refreshedStore.getState().semester).toBe(1);
  expect(refreshedStore.getState().attendance).toEqual(legacy.attendance);
  refreshedStore.getState().recordLecture('26ETBS11', 'theory', true, '2026-10-17');
  expect(refreshedStore.getState().semesters[1].attendance['26ETBS11:theory']).toEqual({ present: 5, total: 7 });
  expect(refreshedStore.getState().semesters[1].events).toHaveLength(4);
  expect(JSON.parse(localStorage.getItem(ACADEMIC_KEY)).semesters[1].events).toHaveLength(4);
}

describe('attendance UUID compatibility and persistence', () => {
  it('saves Present and Absent records when only crypto.getRandomValues is available', async () => {
    const getRandomValues = vi.fn(secureGetRandomValues);
    vi.stubGlobal('crypto', { getRandomValues });
    await verifyAttendancePersists();
    expect(getRandomValues).toHaveBeenCalled();
  });

  it('keeps development attendance usable when the crypto API is unavailable', async () => {
    expect(import.meta.env.DEV).toBe(true);
    vi.stubGlobal('crypto', undefined);
    await verifyAttendancePersists();
  });
});
