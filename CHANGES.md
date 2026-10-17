# Changes from the source backup

## Hackathon presentation dataset and connected workflows — 16 October 2026

Inspected the actual active pages, routes, API/authentication, SQLite schemas, Zustand cache, academic/attendance engines and legacy sources. Extended existing components rather than rebuilding the app. Existing user data was backed up and retained; the new college/account namespace contains only labelled presentation examples.

- `server/demo.js`, `server/demo.test.js`: idempotent isolated seed and confirmed reset, six separate demo accounts, actual configured Semester1 courses, valid partial marks, matching dated attendance/counts, consistent timetable, ten assignments with mixed states/history, eight simulated Mumbai rides, fictional guide entries and private notifications. A second load preserves edits; reset only restores the owned DEMO workspace and retains sessions.
- `server/db.js`: additive schema migration for profile details/preferences, assignment metadata/history/grades, timetable locations/types, demo provenance and notifications. Original baseline inserts use explicit columns; no existing tables or data are replaced.
- `server/app.js`, `server/config.js`, `server/auth.js`: development-only seed tools, authenticated/confirmed scoped reset, demo status, richer private state, profile preference saving, notification read/unread actions, action notifications and marked simulated immediate bookings. Production, origin, account/class permissions, capacity and preview validation stay enforced. Login identifies DEMO accounts and actual roles accurately.
- `server/assignments.js`, `server/assignments.test.js`: existing task routes extracted with metadata, four derived assignment states, private note submissions/history, optional bounded grading and idempotent points. No file-upload or college-delivery claim.
- `server/notifications.js`: per-user persistent notifications and complete unread counts; related links are internal paths.
- `server/demo-workflows.test.js`: HTTP security, isolated reset, account privacy, idempotence, notifications, action updates, simulated last-seat/duplicate protections, cancellation and SQLite reopening.
- `scripts/demo.js`, `package.json`, `server/cli.js`: `demo:load` and confirmed `demo:reset` commands; legacy full reset updated for additive foreign-key children. No dependencies added.
- `src/App.jsx`, `src/pages/LoginPage.jsx`: preserved navigation/identity, explicit DEMO account badges, notification center, load action and unambiguous accessible login labels.
- `src/components/DemoControls.jsx`, `NotificationCenter.jsx`: explicit load/reset controls, scoped-reset explanation, read/unread/all-read actions, counts and internal links.
- `src/pages/TodayPage.jsx`: underlying-record academic/attendance summaries, assignment statuses/deadlines/recent submissions, booked ride, useful alerts, today/upcoming timetable, metadata and previous/next date navigation.
- `src/pages/ProfilePage.jsx`: demo academic identity and persisted contact preferences; only in-app delivery is implemented.
- `src/pages/ClassBoardPage.jsx`: assignment details/status/subject filters, dashboard links opening the matching task, note submission/history/feedback and moderator grading.
- `src/pages/RidesPage.jsx`: marked simulated Book DEMO Ride flow, My Rides, full-ride state and existing confirmation/cancellation flows. Instant simulated booking applies only to designated demo rides in development.
- `src/pages/AttendancePage.jsx`, `AcademicPage.jsx`: explicit DEMO provenance while preserving curriculum, formulas, attendance plans, marks editing and responsive layout.
- `src/components/demoTools.test.jsx`, `src/pages/demoDashboard.test.jsx`, `LoginPage.test.jsx`, `ClassBoardPage.test.jsx`: UI controls, derived counts, notification state, login and assignment workflow tests.
- `e2e/demo-presentation.spec.js`, `e2e/shared-workflows.spec.js`: full presentation rehearsal plus original workflows; account labels and attendance assertions distinguish notification content from visible counters.
- `DEMO_WALKTHROUGH.md`, `README.md`, `TESTING.md`, `AUDIT.md`: exact commands, three-minute flow, verified behavior, simulation boundaries and remaining integration limits.

Verified: **102 frontend tests, 124 server/domain tests and all six browser scenarios pass**, with clean lint and successful production build. Browser rehearsal covers all eight main routes at390px, actual half-mark edits, attendance, assignment submission/history, booking/My Rides/cancellation, notifications, refresh, repeat load and reset. Original users/academic records/schedules/tasks/rides/directory content hashes were identical immediately before and after loading the real local DEMO dataset. Backup: `data/backups/before-presentation-2026-10-16T11-32-14-517Z.sqlite`.

Simulated: identity/enrollment, institutional grades/timetable, transport, contributions, directory contacts and seeded feedback. Incomplete external integrations: file storage/LMS delivery, email/push delivery, real provider credentials/live verification and hosted deployment. In-app workflows remain functional; optional map tile failure retains text fallback.

## SGPA projection and maximum-bound correction — 16 October 2026

Actual cause: the existing saved semester had empty grade bands/pass rules and only one of seven subjects assessed. The calculation withheld grades without a usable policy and required every credited subject for a full projection. The UI collapsed those different states into Pending. Percentage extrapolation already existed, but exact half-mark ties could round downward due to binary arithmetic.

- `shared/planner.js`: separate planning-only configured/automatic/sample modes; recorded SGPA/CGPA continue using the saved policy. Adds missing-rule, unsupported-rule, insufficient-data and coverage diagnostics, and an explicitly partial available-subject estimate. Exact rational half-mark rounding fixes tie errors. Unknown/conflicting pass keys and unsupported aggregation declarations no longer silently yield grades. Maximum bounds retain recorded component failures and subject credits. Strict default behavior remains for server confirmation checks.
- `src/pages/AcademicPage.jsx`: grading-basis selector, visible sample labels, distinct missing/unsupported/data states, per-subject projections, partial credit coverage, formulas, applicable pass-rule details and maximum-bound explanation. Planning choices do not dirty or replace the saved policy or marks; recorded and what-if results remain separate.
- `src/pages/TodayPage.jsx`: consistent planning basis, values and insufficient-data explanations in the summary.
- `shared/projections.test.js`, `src/pages/AcademicPage.test.jsx`: partial marks, mixed assessment maxima, unassessed/zero-credit subjects, failed components, complete versus projected results, exact half-mark/grade boundaries, configuration failures and input preservation.
- `e2e/sgpa-projection.spec.js`: default empty policy with partial marks, labelled fallback, missing-subject coverage, configured-only mode, save/refresh without projected-mark or policy leakage, a 10.00 → 9.78 boundary change, and mobile layout.
- `README.md`, `TESTING.md`, `CHANGES.md`: causes, formulas, assumptions, supported rules and verification.

No saved marks, policies, attendance or curriculum are migrated or overwritten. Existing VESIT credits/components and responsive styling remain. Current Vite/Node watchers load the source changes; a normal browser refresh is sufficient.

Validation: 88 frontend tests, 103 server/domain tests, all five browser scenarios, lint and the production build pass. Real Vite inspection confirms sample maximum10.00 with missing-subject coverage instead of unexplained Pending. Academic data and policy hashes are unchanged by the inspection.

## Persistent local workspace presentation — 16 October 2026

User selected keeping persistent local accounts and sample data while simplifying demo wording. The running Campus360 launcher and both child services were stopped; the normal app remains stopped after verification.

- `src/App.jsx`, `src/pages/LoginPage.jsx`: Local workspace / Local accounts presentation; concise account and saved-record explanation, with identity-verification status preserved.
- `src/pages/TodayPage.jsx`, `src/pages/ProfilePage.jsx`, `src/pages/DirectoryPage.jsx`: saved sample date, concise sample-content and membership notices, no repeated demo badges. Existing names and content remain unchanged.
- `src/pages/AcademicPage.jsx`, `src/pages/AcademicPage.test.jsx`, `shared/planner.js`: Sample planning rules / Confirmed CGPA · sample rules wording; unofficial-grade notice remains. New default policy source wording changes only the provided sample template. Existing stored policies are not rewritten.
- `server/auth.js`, `server/index.js`, `scripts/dev.js`, `server/dev-support.js`: local-account wording in errors and launcher output. Authentication, expiry, origin validation, permissions and production guards are unchanged.
- `.env.example`, `README.md`: explain that the retained `AUTH_MODE=demo` value selects the persistent local account chooser. Existing routes, identifiers and configuration remain compatible.
- `e2e/shared-workflows.spec.js`, `TESTING.md`: login/header/date labels and regression verification.

SQLite already provides durable storage; no database migration, seed replacement, account rename or session extension was performed. Records persist across refresh, sign-out and restart; expiring a login session does not erase them. Verified VESIT curriculum and responsive layouts are preserved.

Validation: 83 frontend tests, 85 server/domain tests, all four browser scenarios, lint and production build pass. The full saved database content hash is unchanged. Both app and test services are confirmed stopped.

## Marks responsiveness follow-up — 16 October 2026

- `src/pages/AcademicPage.jsx`: the same recorded inputs and grade-requirement rows adapt into labelled course cards below 1280px, accounting for tablet widths and the desktop sidebar. Large screens retain tables. Semester/rule controls fit narrow screens, metrics and what-if inputs use responsive grids, and save actions fill the mobile width. Native table roles and existing input labels are retained. Calculation and persistence logic are unchanged.
- `src/index.css`: academic-page-only card layout, wrapped long text, aligned field labels, larger mobile inputs and touch targets. No global overflow clipping or duplicated forms.
- `e2e/marks-responsive.spec.js`: real-browser layout checks at 320/360/768/1024/1280px, every applicable recorded input inside the viewport, visible card labels, mobile touch targets, expanded requirements/policy controls, long source text, edit/save/refresh, and separation of what-if estimates from actual marks. All four browser scenarios, eleven AcademicPage unit tests, lint and the production build pass.
- `TESTING.md`: responsive verification evidence. Existing marks, attendance, curriculum and other pages are preserved; Vite updates these source changes without a backend restart.

## Frontend, calculations and attendance follow-up — 16 October 2026

- `shared/planner.js`, `shared/planner.test.js`, `src/pages/AcademicPage.jsx`, `src/pages/AcademicPage.test.jsx`: strict cutoffs, half-mark requirements, blank imported marks, actual-versus-what-if precedence and confirmation reset; optional validated attendance plans.
- `shared/attendance.js`, `shared/attendance.test.js`, `src/lib/academic.js`: shared exact recovery/safe-miss and future-window arithmetic, decimal boundaries, empty/unreachable scenarios and input validation.
- `src/components/FutureAttendancePlanner.jsx`, `src/components/FutureAttendancePlanner.test.jsx`, `src/pages/AttendancePage.jsx`: future scenarios, draft-preserving feedback and saved plans per semester/course/type alongside unchanged actual records.
- `server/app.js`, `server/attendance-plan.test.js`: authenticated, origin-checked and versioned private attendance-plan saves; reject lecture types absent from the course; verify database reopen and record preservation. Development health metadata identifies a matching running instance.
- `src/services/api.js`, `src/services/api.test.js`: bounded requests and clear timeout/unreadable-response errors.
- `src/store/useSharedStore.js`, `src/store/bootstrapIsolation.test.js`: ignore obsolete authentication results after account changes.
- `src/components/SharedUI.jsx`, `src/components/SharedUI.test.jsx`: synchronous duplicate-write guard, accepted-write/failed-refresh feedback, stable modal focus, keyboard behavior and scroll restoration.
- `src/components/RecordMap.jsx`, `src/components/RecordMap.test.jsx`: reject invalid coordinate ranges while retaining text fallback.
- `src/pages/DirectoryPage.jsx`, `src/pages/RidesPage.jsx`, `src/pages/recordSelection.test.jsx`: selected record follows URL navigation.
- `src/pages/TodayPage.jsx`, `src/pages/TodayPage.test.jsx`: cancelled requests cannot replace the selected day plan or its feedback.
- `package.json`, `scripts/dev.js`, `server/dev-support.js`, `server/dev-support.test.js`: one-command frontend/API startup, empty-database-only demo initialization, occupied-port checks, matching-instance reuse and paired shutdown. No dependencies added.
- `shared/origins.js`, `server/origins.test.js`, `vite.config.js`: proxy follows configured backend binding, including explicit IPv6; production origin validation remains explicit HTTPS only.
- `e2e/shared-workflows.spec.js`: saved forecast, refresh, unchanged actual attendance, semester isolation and mobile regression coverage.
- `README.md`, `TESTING.md`, `AUDIT.md`, `CHANGES.md`: startup, calculations, changed files and validation evidence.

Restart both services once to load the new launcher/configuration: stop the original terminal with Ctrl+C, then run `npm.cmd run dev`. Subsequent source changes use the existing Vite and Node watchers. Existing attendance, marks, sessions, verified VESIT FE-A subjects, original seeds and styling are preserved. No database reset or automatic import is performed.

The remaining sections describe the earlier expansion against the original archive.

Original source and old browser keys were preserved. Current business state uses Express/SQLite rather than the legacy local store. This compares against the pre-expansion archive; generated dist/build output and local database/test artifacts are excluded.

## Modified

- `.env.example`
- `.gitignore`
- `README.md`
- `netlify.toml`
- `package-lock.json`
- `package.json`
- `src/App.jsx`
- `src/App.test.jsx`
- `src/index.css`
- `vercel.json`
- `vite.config.js`

## Added

- `.github/workflows/ci.yml`
- `.nvmrc`
- `ACCEPTANCE.md`
- `AUDIT.md`
- `CHANGES.md`
- `DEMO.md`
- `DEPLOYMENT.md`
- `TESTING.md`
- `e2e/shared-workflows.spec.js`
- `playwright.config.js`
- `scripts/prepare-deployment.js`
- `server/app.js`
- `server/auth.js`
- `server/auth.test.js`
- `server/business.test.js`
- `server/cli.js`
- `server/config.js`
- `server/db.js`
- `server/domain.js`
- `server/domain.test.js`
- `server/e2eServer.js`
- `server/index.js`
- `server/provider.js`
- `shared/planner.js`
- `shared/planner.test.js`
- `src/components/RecordMap.jsx`
- `src/components/SharedUI.jsx`
- `src/pages/AcademicPage.jsx`
- `src/pages/AcademicPage.test.jsx`
- `src/pages/AttendancePage.jsx`
- `src/pages/ClassBoardPage.jsx`
- `src/pages/DirectoryPage.jsx`
- `src/pages/LoginPage.jsx`
- `src/pages/ProfilePage.jsx`
- `src/pages/RidesPage.jsx`
- `src/pages/TodayPage.jsx`
- `src/pages/connectedAttendance.test.jsx`
- `src/services/api.js`
- `src/store/sharedCache.test.js`
- `src/store/useSharedStore.js`

## Preserved

Verified VESIT courses in src/config/vesit.js, original seed.json/seed.sql, previous local academic records and optional ml-service remain. Existing local records are never silently imported or overwritten. New server database uses its own data directory. No deployment, provider message or database reset was performed.
