import { create } from 'zustand';
import { createSemester, DEFAULT_POLICY } from '../config/vesit';
import { validatePolicy } from '../lib/academic';
import { generateUUID } from '../lib/uuid';
import {
  attendanceRecords,
  deadlines,
  demoProfiles,
  leaderboard,
  marks,
  officialUpdates,
  profile,
  recommendationLinks,
  rideOptions,
  timetable,
} from '../data/mockData';
import { isRideRequestExpired } from '../lib/rideMachine';

const STORAGE_KEY = 'campus360-state';

function readPersistedState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

const savedState = readPersistedState();
const ACADEMIC_KEY = 'campus360-vesit-r26-v1';
let academic;
try { academic = JSON.parse(localStorage.getItem(ACADEMIC_KEY) || 'null'); } catch { /* Legacy data remains untouched. */ }
const academicInitial = academic || { semester: 1, semesters: { 1: createSemester(1), 2: createSemester(2) }, policy: DEFAULT_POLICY };
const initialState = {
  auth: { session: null, isAuthenticated: false },
  profile,
  profiles: demoProfiles,
  attendance: attendanceRecords,
  timetable,
  deadlines,
  marks,
  leaderboard,
  updates: officialUpdates,
  recommendations: recommendationLinks,
  rides: rideOptions,
  ...(savedState || {}),
};

initialState.profile = initialState.profile || profile;
initialState.profiles = initialState.profiles || demoProfiles;
initialState.attendance = (Array.isArray(initialState.attendance) ? initialState.attendance : attendanceRecords).filter(
  (entry) => entry && !(/^New Subject \d+$/.test(entry.subject) && !entry.total && !entry.present && !entry.absent),
);
initialState.rides = (Array.isArray(initialState.rides) ? initialState.rides : rideOptions).filter(
  (ride) => !isRideRequestExpired(ride),
);
initialState.auth = { ...initialState.auth, session: initialState.auth?.session || null, isAuthenticated: Boolean(initialState.auth?.session) };

export const useCampusStore = create((set) => ({
  ...initialState,
  ...academicInitial,
  storageError: '',
  setSemester: (semester) => set({ semester: Number(semester) }),
  editSemester: (edit) => set(state => ({ semesters: { ...state.semesters, [state.semester]: { ...state.semesters[state.semester], ...edit, confirmed: false } } })),
  confirmSemester: (confirmed) => set(state => ({ semesters: { ...state.semesters, [state.semester]: { ...state.semesters[state.semester], confirmed } } })),
  setPolicy: (policy) => { validatePolicy(policy); set(state => ({ policy, semesters: Object.fromEntries(Object.entries(state.semesters).map(([id,s]) => [id, { ...s, confirmed: false }])) })); },
  recordMark: (code, field, value) => set(state => {
    const semester = state.semesters[state.semester];
    const course = semester.courses.find(c => c.code === code);
    if (!course || !(field in course.maxima) || (value !== null && (!Number.isFinite(value) || value < 0 || value > course.maxima[field]))) throw Error('Marks must be within the assessment maximum.');
    return { semesters: { ...state.semesters, [state.semester]: { ...semester, confirmed: false, marks: { ...semester.marks, [code]: { ...semester.marks[code], [field]: value } } } } };
  }),
  recordLecture: (code, type, present, date) => set(state => {
    const semester = state.semesters[state.semester];
    const course = semester.courses.find(c => c.code === code);
    if (!course || !['theory','practical'].includes(type) || typeof present !== 'boolean' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error('Invalid lecture.');
    const key = `${code}:${type}`;
    const entry = semester.attendance[key] || { present: 0, total: 0 };
    return { semesters: { ...state.semesters, [state.semester]: { ...semester, attendance: { ...semester.attendance, [key]: { total: entry.total+1, present: entry.present+Number(present) } }, events: [...semester.events, { code, type, present, date, id: generateUUID() }] } } };
  }),
  undoLecture: (id) => set(state => {
    const semester = state.semesters[state.semester];
    const event = semester.events.find(e => e.id === id);
    if (!event) return {};
    const key = `${event.code}:${event.type}`;
    const entry = semester.attendance[key];
    return { semesters: { ...state.semesters, [state.semester]: { ...semester, attendance: { ...semester.attendance, [key]: { total: entry.total-1, present: entry.present-Number(event.present) } }, events: semester.events.filter(e => e.id !== id) } } };
  }),
  setSession: (session) => set((state) => ({ auth: { ...state.auth, session, isAuthenticated: Boolean(session) } })),
  setProfile: (nextProfile) => set({ profile: nextProfile }),
  logout: () => {
    localStorage.removeItem('campus360-session');
    set({ auth: { session: null, isAuthenticated: false } });
  },
  updateAttendance: (subject, payload) => {
    set((state) => ({
      attendance: state.attendance.map((entry) =>
        entry.subject === subject ? { ...entry, ...payload } : entry,
      ),
    }));
  },
  addAttendanceEntry: (entry) => set((state) => ({ attendance: [...state.attendance, entry] })),
  updateMarks: (subject, payload) => {
    set((state) => ({
      marks: state.marks.map((entry) =>
        entry.subject === subject ? { ...entry, ...payload } : entry,
      ),
    }));
  },
  addMarksEntry: (entry) => set((state) => ({ marks: [...state.marks, entry] })),
  addDeadline: (deadline) => set((state) => ({ deadlines: [deadline, ...state.deadlines] })),
  addRide: (ride) => set((state) => ({ rides: [ride, ...state.rides] })),
  requestRide: (id) => set((state) => ({
    rides: state.rides.map((ride) => ride.id === id && ride.state === 'Available'
      ? { ...ride, state: 'Requested', requestedAt: new Date().toISOString() }
      : ride),
  })),
  acceptRideRequest: (id) => set((state) => ({
    rides: state.rides.map((ride) => ride.id === id && ride.state === 'Requested'
      ? { ...ride, state: 'Confirmed', confirmedAt: new Date().toISOString() }
      : ride),
  })),
  expireStaleRideRequests: (now = Date.now()) => set((state) => ({
    rides: state.rides.filter((ride) => !isRideRequestExpired(ride, now)),
  })),
  seedDemoProfiles: () => set({ profiles: demoProfiles }),
}));

useCampusStore.subscribe((state) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(Object.entries(state).filter(([key]) => !['semester','semesters','policy','storageError'].includes(key)))));
    localStorage.setItem(ACADEMIC_KEY, JSON.stringify({ semester: state.semester, semesters: state.semesters, policy: state.policy }));
  } catch { if (!state.storageError) useCampusStore.setState({ storageError: 'Browser storage is unavailable or full. Export your records before leaving.' }); }
});

export const selectors = {
  getSession: () => useCampusStore.getState().auth.session,
  isAuthenticated: () => useCampusStore.getState().auth.isAuthenticated,
};
