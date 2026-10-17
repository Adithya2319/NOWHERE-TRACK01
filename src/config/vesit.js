export const SCHEME_SOURCE = 'https://cdn.vesit.ves.ac.in/assets/files/129094/r26_first_year_b__tech_teaching_and_examination_schema_18_august_docx-1.pdf';
export const SYLLABUS_SOURCE = 'https://cdn.vesit.ves.ac.in/assets/files/129098/extc_r26_nep_24-8-26_docx-1.pdf';
export const COMPONENTS = { midterm: 'Mid-term', internal: 'Continuous assessment', endSem: 'End semester', termWork: 'Term work', practicalOral: 'Practical / oral' };
const theory = { midterm: 20, internal: 20, endSem: 60 };
const course = (code, subject, credits, maxima, practicalCredits = 0) => ({ code, subject, credits, practicalCredits, maxima, schemeVerified: true });
export const CURRICULUM = {
  1: [
    course('26ETBS11', 'Mathematics-1', 4, theory),
    course('26ETES11', 'Fundamentals of Programming -C', 4, { ...theory, termWork: 25 }, 1),
    course('26ETPC11', 'Programme Core Course- Digital System', 2, theory),
    course('26ETIK11', 'Fundamentals of Vedic Mathematics', 2, { internal: 20 }),
    course('26VE11', 'Universal Human Values-1', 2, { internal: 20 }),
    course('26ETVS11', 'Basic Workshop Practice', 2, { termWork: 50 }, 2),
    course('26CC11', 'Co curricular Course -I', 2, { practicalOral: 25 }, 2),
  ],
  2: [
    course('26ETBS21', 'Mathematics-2', 4, theory),
    course('26ETBS22', 'Engineering Sciences', 5, { ...theory, termWork: 25 }, 1),
    course('26ETES21', 'Basic Electrical Engineering', 4, { ...theory, termWork: 25 }, 1),
    course('26ETES22', 'Engineering Mechanics', 3, theory),
    course('26ETVS21', 'Engineering visualization lab', 2, { termWork: 25, practicalOral: 25 }, 2),
    course('26AE21', 'Professional Communications and Ethics-I', 2, { midterm: 20, internal: 80 }, 1),
    course('26VE21', 'Universal Human Values-II', 2, { internal: 20 }),
    course('26CC21', 'Co curricular Course -II', 2, { practicalOral: 25 }, 2),
  ],
};
// No earlier MU ordinance is silently applied to R26. Configure from an applicable official regulation.
export const DEFAULT_POLICY = { source: '', confirmed: false, attendanceThreshold: null, gradeBands: [], passRules: {} };
export function createSemester(number) {
  return { courses: structuredClone(CURRICULUM[number]), marks: {}, attendance: {}, events: [], deadlines: [], timetable: [], target: 8, confirmed: false };
}
