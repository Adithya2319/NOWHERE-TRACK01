# Validation and manual checklist

Run from the folder containing package.json with Node24.22.0:

```powershell
npm.cmd ci
npm.cmd run lint
npm.cmd test
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run test:e2e
npm.cmd audit --omit=dev
```

Stop this project's Vite processes before clean install on Windows; loaded native Rolldown modules otherwise produce EBUSY/EPERM. Browser tests use an isolated temporary disk database and future, visibly configured demo date. Server integration tests use temporary/memory databases and real HTTP requests. No test resets user records. Playwright prefers installed Chrome on this machine, otherwise its bundled Chromium.

## Automated coverage

Hackathon presentation follow-up (16 October 2026): **102 frontend tests, 124 server/domain tests and all six Playwright scenarios pass**; lint is clean and production build succeeds. The new end-to-end rehearsal loads the dataset through the real login UI, visits all eight main routes at390px, verifies8.78 projected SGPA with unfinished Recorded SGPA, records and reloads attendance, edits half marks with immediate projection change, submits an assignment and opens history, books a simulated seat and finds it in My Rides, refreshes/cancels/restores availability, persists notification read/unread/all-read state and preferences, repeats load without duplicates, and explicitly resets while preserving the original account. No page runtime or API>=400 errors occur in that rehearsal.

Ten seed tests cover empty databases, namespaced guide fixtures, ID collision preservation, repeated loads, resets, separate users, curriculum/mark bounds, exact attendance-event agreement, timetable consistency, statuses/points and database reopen. Six dedicated HTTP workflow tests cover development-only/provider/production/Origin guards, confirmed reset, original record preservation, private notifications, booking capacity/duplicate/stale-preview checks and cancellation idempotence. Existing authentication, scheduling, academic, attendance and shared-ride regressions remain passing. The real local data load was backed up and original records compared by content hash; no original account data was changed.

SGPA projection follow-up (16 October 2026): **88 frontend tests, 103 server/domain tests and all five browser scenarios pass**, with clean lint and a successful production build. Eighteen new calculation regressions cover default-rule fallback, configured rules/credits, mixed assessment maxima, partial and wholly unassessed subjects, blank versus zero, pass locks, complete versus projected results, excluded midterms, zero credits, exact half-mark ties, decimal cutoffs and unsupported/conflicting policy or aggregation rules. Five new AcademicPage cases cover displayed basis/status, insufficient data/partial credit coverage, strict mode, pass failures and preserving saved marks/policy in write payloads.

The new browser scenario saves internal marks under an empty saved policy, verifies labelled sample planning without saving fallback rules or projected final marks, confirms an available-subject estimate for4/18 credits, fills deliberate assessed inputs for remaining subjects, checks full projection10.00 while Recorded SGPA stays Pending, and crosses a boundary to9.78 at unchanged maximum10.00. It also checks refresh persistence, mobile bounds and runtime errors. The actual running Vite account was independently inspected at320/360/768/1280px: maximum10.00(sample), projected Insufficient data with4/18 covered credits, recorded Pending, no overflow or uncaught page errors. Saved academic rows/versions and policy content had an identical SHA-256 before and after the browser inspection. No save was performed on that account.

Local workspace wording follow-up (16 October 2026): all **83 frontend tests, 85 server/domain tests and four browser scenarios pass**, with clean lint and a successful production build. Browser login checks the Local accounts / Local workspace labels; existing scenarios verify private marks, actual attendance and future-plan persistence, approved ride flows, membership restrictions, sample-date scheduling, task points and mobile marks layout. The full existing SQLite content had an identical SHA-256 before and after this change. No account names, saved policies, marks, attendance or sessions were modified. The normal app and temporary browser-test server are stopped after verification; ports 5173, 5174, 4000 and 4174 are free.

Marks responsiveness follow-up: **all four production-browser scenarios pass**, including the new test at 320, 360, 768, 1024 and 1280px. It checks the bounds of all 14 applicable recorded inputs, visible card labels and 44px mobile inputs, rule/semester controls, expanded requirements and what-if inputs; long unbroken policy sources and JSON; mobile editing/save/refresh; and no page runtime errors. The 11 existing AcademicPage unit tests, lint and production build also pass. The active Vite frontend was separately checked at the same five widths with no document overflow, and mobile/desktop screenshots were visually inspected. Responsive styling is confined to the academic page; no recorded data or calculation behavior changed.

Latest frontend/calculation/attendance validation (16 October 2026): **83 frontend tests, 85 server/domain tests and all 3 Playwright scenarios passed**, with clean lint and a successful production build. The build retains a non-blocking warning about a bundle larger than 500 kB. Browser tests cover saved forecasts, refresh persistence, unchanged actual attendance, semester isolation and 360px layout. Origin regressions cover exact local ports/hostnames, configured ports, old environment settings, rejected origins, production restrictions and persisted sessions. Earlier real-browser login/refresh checks verified both localhost:5174 and 127.0.0.1:5174 with no uncaught page errors.

The actual `npm.cmd run dev` command was also launched with an isolated, initially empty disk database on ports 5191/4191. Both services started and demo accounts initialized automatically. A real Chrome session verified login, a recorded lecture, saved future-plan values, authenticated refresh, no horizontal overflow at 360px and no uncaught page errors. Ctrl+C stopped both services. Development-support tests cover existing-record preservation, provider mode, partial/directory-only databases, matching-instance reuse, unrelated occupied ports and invalid in-memory storage. The main app was restarted on 5174/4000; all academic records and versions had an identical SHA-256 before and after startup. Repeating the command returned the existing app URL without creating another pair of servers.

Earlier full-application validation passed clean npm ci. Production dependency audit previously reported zero vulnerabilities; seven inherited Tailwind 3 development transitive advisories remain for a separate reviewed upgrade. No live provider delivery or public deployment verification is implied by these tests.

- Academic maxima, half-mark precision, missing versus zero, pass gates, non100 totals, unreachable grades/targets, multiple missing components, failed/zero credits, confirmed CGPA and legacy attendance validation.
- Strict cutoff comparisons, blank imported theory marks, recorded marks taking precedence over stale what-if estimates, simulation reset and excluded midterm handling.
- Exact integer/decimal attendance boundaries, exhaustive small-count forecast inequalities, zero lectures, 100% after an absence, unreachable horizons, overflow and invalid inputs. Private versioned plan persistence across SQLite close/reopen leaves counts, events, marks and policy unchanged; unavailable subject/type pairs are rejected.
- Provider request contracts, invalid OTP, identity stability, strict session validation, expiry/restart, serialized rotating refresh, network outages, logout/refresh races and cross-mode rejection. These are provider **stubs**, not sandbox/delivery evidence.
- Direct API membership/ownership/class permissions; private marks/submissions; public class aggregates; session/attendance survival across actual SQLite close/reopen.
- Duplicate/self ride requests, last-seat contention, idempotent approval/cancellation, expiry preserving history/offers, stale/account-bound previews.
- Event changes retaining affected bookings, actual fitting alternatives and timetable effects on students without participation rows.
- Task approval awarding one ledger entry and preserving the submitting class; no self-approval.
- UI routes, private-cache clearing/race protection, unavailable API behavior, deliberate legacy import, attendance without browser crypto, and unsaved what-if isolation.
- API timeouts/unreadable responses, double-click suppression, stale auth/day-plan cancellation, modal keyboard/focus restoration, URL selection, invalid map coordinates and preserving forecast drafts during refresh failures/external changes.
- Real browser flows: separate-account ride request/approval/cancellation, persisted attendance, narrow360px navigation, schedule conflict preview, task approval/points, planner saving, membership restrictions, map failure and API write failure. Browser test assertions catch uncaught page errors.

## Manual steps and expected results

| Action | Expected |
|---|---|
| Open Alex in normal and Jules in InPrivate | Different account IDs; shared offers, private marks |
| Alex creates a future one-seat offer after preview | All accounts see the same offer/seat count |
| Two students request; Alex confirms one | Exactly one confirmed seat, later attempt409; repeated confirmation cannot consume twice |
| Rider cancels confirmed booking twice | Seat released once; rejected membership does not prevent cancelling own booking |
| New Student requests a ride | Blocked until moderator approval; phone control alone is insufficient |
| Student requests membership; own-class moderator reviews | Status updates; another class cannot review |
| Reload browser/restart server | Same saved records/session until expiry; no reseed/reset |
| Riya moves Robotics17:00–17:30 | Preview names affected16:45 booking; save preserves it and flags conflict |
| Sam explicitly cancels16:45 and requests17:45; Alex confirms | Today reflects real decision; no invented booking/availability |
| Sam submits a class task; Riya approves twice | One award in both student contribution and class total |
| Taylor opens FE-B | College class aggregates visible, FE-A private submissions/marks absent |
| Planner internal/external pass gate fails | Passing grades locked even if total target seems reachable |
| Enter invalid mark/precision or stale saved version | Clear validation/conflict; no silent overwrite |
| Change what-if estimates | Saved marks untouched |
| Record a mark previously estimated in what-if | Actual mark takes precedence immediately and after refresh |
| Actual attendance1/2; plan attending5of6future lectures at75% | Projection6/8=75%; saved actual counter stays1/2 |
| Save a forecast, refresh, then change semester or account | Saved inputs return only for the matching account/semester/course/type |
| Plan target100% after an absence, or too few future lectures | Explicit unreachable outcome; no safe-miss claim |
| Import earlier browser semester | Preview + explicit action; existing server records block overwrite; browser copy retained |
| API or map network fails | Honest message, no fake successful mutation, text remains usable |
| Keyboard at360px/tablet/desktop | Focus visible, modal focus/escape works, nav scrolls, tables contain overflow |
| Invalid OTP/expired provider session | No authentication granted; configured provider refresh/logout follow contracts |
| Public hosted login/deep link/API404/restart | Verify through public origin after deployment, including cookies and persistent disk |

Public provider/sandbox delivery, enrollment certification and hosted-origin checks remain **not performed** until credentials/access exist.

