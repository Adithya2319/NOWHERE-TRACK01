# Campus360 — shared campus day plan

## Hackathon demo: start here

The presentation account is **Adithya · DEMO**, First Year EXTC, FE-A, VESIT Mumbai, Semester1, academic year2026–27. It is a separate persisted workspace; your original accounts and entered data remain unchanged.

```powershell
# From this directory, with Node24.22.0 or a newer Node24 release:
npm.cmd ci
npm.cmd run demo:load
npm.cmd run dev
```

If dependencies are already installed, skip `ci`. Stop running Vite processes before clean installation on Windows. Open **http://127.0.0.1:5174/login** and select **Adithya marked DEMO**. `npm.cmd run dev` starts frontend5174 and API4000 together. The login page also offers **Load Demo Data**. Existing accounts named Adithya remain separate, without the new DEMO badge.

The demo contains all seven existing Semester1 subjects, partial assessment marks, **8.78 projected SGPA**, a **9.44 maximum bound**, a target of8.5, eight theory/practical attendance histories, ten assignments, eight simulated Mumbai-area rides, fourteen days of sample classes, five fictional guide contacts and private notifications. Recorded SGPA remains Pending because final assessments are incomplete. Every view calculates its counts from saved records.

**Load Demo Data** is idempotent and preserves rehearsal edits. **Profile/Home → Reset Demo Data → Confirm reset DEMO data** explicitly restores the isolated demo workspace, including its rehearsal changes, while preserving all original accounts. Reset rebases dates to the current day in Asia/Kolkata and keeps the demo session signed in. The CLI equivalent is:

```powershell
$env:CONFIRM_DEMO_RESET='RESET_DEMO_DATA'
npm.cmd run demo:reset
Remove-Item Env:CONFIRM_DEMO_RESET
```

These tools require development mode and `AUTH_MODE=demo`; production/provider modes disable the endpoints. Existing origin checks, cookie sessions, permissions and conflict previews remain enforced. The new demo data was loaded locally and original account records verified unchanged; a prior database backup is under `data/backups/`.

Use [DEMO_WALKTHROUGH.md](DEMO_WALKTHROUGH.md) for the three-minute presentation, rehearsal/reset instructions, working features and explicit simulation limits. Assignments save notes/history, not uploaded files or LMS submissions. Notifications are in-app; email/push settings save preferences only. Rides are simulations with no transport arrangement, payment or real personal contacts. Institutional grades, timetable, enrollment and attendance eligibility are not claimed.

The active application uses Express and SQLite for shared accounts, plans, rides, task points, private marks and attendance. React/Vite/Tailwind, the original routes, paper/ink styling and verified VESIT FE EXTC subjects remain. Zustand is an API cache. Python is not required for the active application.

The interface presents a **Local workspace** with **Local accounts**. Saved profiles, marks, attendance, future plans and other records persist in `data/campus360.sqlite` across refresh, sign-out and server restarts. Session expiry requires signing in again; it does not delete records. Existing account names and sample data are retained. Sample contacts and grading assumptions stay identified as such. No data conversion or reset is needed to keep using the workspace.

## Current Windows setup

Use **Node 24.22.0** (`.nvmrc`). Built-in SQLite was tested on this machine; there is no native npm database driver, Docker or Redis dependency.

```powershell
Set-Location 'C:\Users\ASUS\Downloads\adi-d4a\adi-d4a'
node --version
npm.cmd ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm.cmd run dev
```

Open **http://127.0.0.1:5174** or **http://localhost:5174**. `npm.cmd run dev` starts Vite and Express together and initializes synthetic demo accounts only when the disk database is completely empty. Existing data is never reset or replaced; provider mode never creates demo accounts. Vite proxies `/api` to Express at **http://127.0.0.1:4000** by default. Health: `Invoke-RestMethod http://127.0.0.1:4000/api/health`. Ctrl+C stops both processes. Both bind to loopback by default. The separate `db:migrate` and idempotent `db:seed` commands remain available for deliberate setup.

The shared `.env` setting `DEV_FRONTEND_PORT` selects the frontend port (default **5174**); `PORT` selects the API/proxy port (default **4000**). Repeating `npm.cmd run dev` recognizes a matching healthy running app and prints its address. Unrelated occupied ports produce an actionable error; no processes are killed. Vite uses `strictPort` instead of silently switching ports. Either service exiting stops its sibling. Put shared settings in `.env` or the shell, not Vite-only `.env.development` files, and restart both services after changing them. Development requires a disk `DB_PATH`; an in-memory database cannot persist across processes or refreshes.

In development only, origin validation merges explicit `PUBLIC_ORIGIN` entries with exact `localhost` and `127.0.0.1` origins on 5173, 5174, `DEV_FRONTEND_PORT` and `PORT`. Production uses **only** configured HTTPS origins; it never adds development origins. No wildcard ports, reflected Origin header or global CORS bypass is enabled. Login uses same-origin `/api` requests through Vite, so additional backend CORS headers are unnecessary. The HttpOnly, host-only, SameSite session cookie survives refresh/restart on the same hostname; localhost and 127.0.0.1 intentionally have separate browser cookies.

The port-5174 login fix addresses a reproduced 403 before authentication: duplicate Vite instances occupied 5173, Vite silently advanced to 5174, and the backend allowlist omitted that port. The fix changes `shared/origins.js`, `server/config.js`, `server/app.js`, `vite.config.js`, `.env.example`, `server/origins.test.js`, this README and `TESTING.md`. Both services were restarted and browser login/refresh verified on both loopback hostnames. After future configuration changes, stop the existing launcher with Ctrl+C and run `npm.cmd run dev` once; no data reset or reinstall is needed.

For a production-style local rehearsal run `npm.cmd run build`, then `npm.cmd start`, and open **http://localhost:4000**. This serves built React and API from one origin. Public production requires [DEPLOYMENT.md](DEPLOYMENT.md).

## Current flows

- Separate cookie-authenticated accounts, editable subject/interest profiles and moderator-reviewed membership.
- Actual-date Today in Asia/Kolkata, academic/attendance summaries, timetable, optional event participation, deadlines and explained ride/help suggestions.
- Event/booking previews list conflicts and affected plans. Tokens/versions reject stale commits; existing bookings remain until explicitly changed.
- Ride offers, per-rider requests, driver confirmation/rejection, cancellation and expiry. Pending requests consume no seats; transactions protect the final seat and retries do not double-reserve/release it.
- Class tasks, private submissions, moderator feedback and an idempotent approved-points ledger. Class totals and own-class contributions use the same ledger.
- Marks, pass gates, required-grade tables/locks, target upper bounds, separate what-if estimates, semester records and confirmed credit-weighted CGPA.
- Self-reported theory/practical attendance, recovery, safe misses, weekly trends, undo and private saved future scenarios. Durable IDs come from Node crypto.
- Searchable synthetic directory and Leaflet/OpenStreetMap campus/ride maps with bundled markers and text fallback when tiles fail.

All durable state goes through `/api` to `data/campus360.sqlite`. Foreign keys, prepared statements, unique constraints, indexes and transactions enforce server rules. API failures never become fake local success. The client refetches after writes, on focus and every 15 seconds; obsolete requests/timers are cleaned up and private cache cleared at logout/account change. A confirmed write followed by a failed refresh is reported separately to discourage duplicate actions.

Each attendance card has a **Future attendance planner**. Enter future conducted lectures, how many you plan to attend and a personal target. It shows the resulting percentage, minimum attendance needed, safe absences within that window, whether the target is reachable, an attend-all scenario and continuation of your recorded rate. For example, `1/2` recorded plus attending `5/6` future lectures yields `6/8 = 75%`. Decimal targets use exact rational comparisons at boundaries. With no recorded lectures there is no trend estimate; a 100% target stays unreachable after an absence. The default 75% is explicitly personal and unverified. These are arithmetic assumptions, not a trained prediction or an official eligibility decision. Saving a plan preserves actual counts, dated records, marks and curriculum; plans persist separately per account, semester, subject and lecture type. Stale versions require review before saving.

## Authentication and external status

`AUTH_MODE=demo` is the retained configuration value for the local account chooser; the visible interface calls this **Local accounts**. It preserves the existing account IDs, names and records and performs no phone or college identity verification. OTP endpoints refuse to pretend delivery. `AUTH_MODE=provider` disables the chooser and needs a server-only `MINIMOTH_API_KEY`. Opaque HttpOnly SameSite cookies identify persisted sessions; provider tokens never enter localStorage. The adapter validates protected operations, serializes refresh rotation and revokes provider/local sessions on logout, reporting provider failures honestly. Existing endpoint names and stored `mode: "demo"` policy values remain compatible.

**No MiniMoth key, sandbox or live delivery was available.** Contract tests are not live integration proof. Phone control does not verify enrollment. New provider accounts are unverified students, never moderators. A server operator can bootstrap moderation after reviewing an account identity:

```powershell
$env:CONFIRM_ADMIN='PROMOTE_ACCOUNT'
npm.cmd run admin:promote -- ACCOUNT_ID_FROM_MY_PROFILE
Remove-Item Env:CONFIRM_ADMIN
```

Registration never grants that role. Approved class changes need moderator review. Origin checks, rate limits and resend cooldown are server enforced. Production requires HTTPS origins/Secure cookies; a public synthetic demo additionally needs explicit ALLOW_DEMO=true.

## Preservation and academic rules

Original seeds, legacy stores and browser records remain. Source before expansion is archived in `.project-backups/before-shared-server-*.zip`. Marks → Preview earlier browser records allows an intentional copy into an **empty** account semester; the server refuses overwrites and retains the browser copy. Export a backup before changes.

`src/config/vesit.js` retains verified R26 courses, maxima and credits. Grade cutoffs, pass minima, attendance eligibility and theory/practical grade aggregation still need an applicable regulation. Official mode withholds unknown grades; **Sample planning rules** are explicitly unofficial. `shared/planner.js` drives UI/server validation: blank differs from zero, pass gates lock grades, half marks are validated, failed credits remain in SGPA, and zero-credit subjects are excluded. Maximum reachable SGPA is a mathematical upper bound, not ML probability. CGPA includes saved confirmed complete semesters with actual credit weighting; policy changes invalidate confirmations. Existing saved policies and their source descriptions are preserved.

The Python service remains optional archived source, with no active dependency or accuracy claim. Historical notes below describe the **earlier prototype**, not current auth/storage/startup.

### SGPA outlook and missing results

The Marks page separates recorded results from planning assumptions. **Recorded SGPA** and confirmed CGPA require complete credited-subject results and applicable saved grading/pass rules. A projection never fills or saves missing recorded marks.

**Projected SGPA** assumes each subject's assessed percentage continues into that subject's remaining components. The percentage is `sum(assessed marks) / sum(assessed maxima)`, not an average of component percentages. For example, `36/40` assessed projects `54/60` on a remaining assessment. Projected component marks round to the nearest half mark, with exact ties upward; the resulting total percentage is compared directly with grade cutoffs, without extra tolerance. Configured component, theory and aggregate pass gates still apply. A recorded failure cannot be erased by projecting full marks elsewhere.

The default **Projection grading basis** is **Configured rules or sample fallback**. It uses complete, supported configured rules when available; missing, incomplete or unconfirmed rules instead produce a visibly labelled sample scenario for all planning subjects. This does not change the saved policy, Recorded SGPA or CGPA. Select **Configured rules only** to withhold the scenario until those rules are supplied, or **Sample planning rules only** to explicitly compare against the sample scale. The displayed sample bands/pass minima are assumptions, not official VESIT regulations. Unsupported rules are reported rather than automatically replaced. Separate theory/practical grade units are not implemented; courses explicitly requesting that aggregation remain blocked.

An entirely unassessed credited subject produces **Insufficient data** for full-semester projection. The UI lists the subjects and may show an **available-subject estimate** with its covered credit count, explicitly not a full-semester SGPA. Enter assessed results or deliberate what-if values to cover those subjects. Zero is assessed evidence; blank is missing. Zero-credit subjects do not block SGPA. Every complete semester calculation uses `sum(subject credits × grade points) / sum(subject credits)`, retaining failed-subject credits at zero grade points.

**Maximum reachable SGPA** is a different calculation: every remaining assessment earns its maximum, while recorded marks, component failures and configured credits stay fixed. It can be available even when a subject has no assessment data. It is an upper bound, not a forecast or an official result. The same basis and missing-data explanations appear in Today.

## Checks and troubleshooting

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run test:e2e
npm.cmd audit --omit=dev
```

Tests use isolated temporary databases. Browser tests prefer installed Chrome, otherwise Playwright Chromium. See [TESTING.md](TESTING.md), [ACCEPTANCE.md](ACCEPTANCE.md), [AUDIT.md](AUDIT.md), [DEMO.md](DEMO.md) and [CHANGES.md](CHANGES.md).

- ENOENT: check Get-Location and Test-Path package.json; change to this root instead of npm init.
- PowerShell policy errors: use npm.cmd/npx.cmd.
- Occupied frontend port/EADDRINUSE: stop the previous app with Ctrl+C before restarting. To use another frontend port set DEV_FRONTEND_PORT in the shared .env and restart both services. PORT controls both the backend and Vite proxy target; add any intended non-loopback origin explicitly to PUBLIC_ORIGIN.
- Windows EBUSY/EPERM during clean install: stop this project's Vite/Node processes first; loaded native modules cannot be replaced. Do not delete data.
- API unavailable: start the server and Retry without clearing records.
- Empty demo account list: fresh empty demo databases initialize with `npm.cmd run dev`. Partly configured databases are preserved; review them before deliberately running `db:seed`. Provider mode needs credentials.
- Past seeded rides remain history. Set DEMO_DATE deliberately before a synthetic reset and use the visible configured-date button.

For private LAN rehearsal set HOST=0.0.0.0 and PUBLIC_ORIGIN to exact PC LAN origins (port 5174 or your configured frontend port, and/or 4000), restart, and use the same host on every device. A phone's localhost is the phone. Permit only intended private-network firewall access. Local HTTP deliberately uses non-Secure cookies; public HTTPS requires Secure cookies.

Synthetic reset is explicit and guarded. Stop all writers and back up the database first. Use only on demonstration records:

```powershell
Copy-Item data/campus360.sqlite data/campus360-before-reset.sqlite
$env:CONFIRM_RESET='DELETE_SYNTHETIC_DATA'
npm.cmd run db:reset
Remove-Item Env:CONFIRM_RESET
```

Normal startup/seed never reset data. Production dependency audit is clean after removing unused XLSX; inherited Tailwind 3 development transitive advisories remain for a separately reviewed toolchain upgrade. Deployment preparation never publishes or spends money; the public URL awaits account access and a persistent backend host.

---

# Historical prototype notes

Existing React/Vite, Tailwind, React Router and Zustand application adapted in place for academic year 2026–27, R26. Existing navigation, typography, palette, cards, rides, profiles and legal routes remain.

## Start on Windows (PowerShell)

```powershell
npm.cmd install
Copy-Item .env.example .env  # only if you do not already have .env
npm.cmd run dev
```

Open http://localhost:5173. The existing demo login remains available: phone `+91 98765 43210`, password `Campus360@123`. Authentication is a demo wrapper, not a production identity system. No external credentials are required for local academics.

In a second terminal at the project root:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r ml-service/requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir ml-service --host 127.0.0.1 --port 8000 --reload
```

`VITE_ML_SERVICE_URL=http://localhost:8000` controls the optional Python connection. The forecast card in Marks calls `/predict`; all other academic features work without Python. CORS permits the local Vite origins. Update the explicit origin allowlist for a deployed frontend. The service exposes `/health` and OpenAPI `/docs`.

## Curriculum provenance and limits

Official source index: https://vesit.ves.ac.in/academics/undergraduate/humanities-applied-sciences/

- R26 teaching/examination scheme: https://cdn.vesit.ves.ac.in/assets/files/129094/r26_first_year_b__tech_teaching_and_examination_schema_18_august_docx-1.pdf (EXTC tables, PDF pages 12–14).
- EXTC syllabus: https://cdn.vesit.ves.ac.in/assets/files/129098/extc_r26_nep_24-8-26_docx-1.pdf

The configured credits are 18 and 24; assessment maximum totals are 440 and 645. Course names, codes, credits and component maxima are transcribed from the scheme, rather than from the previous sample data. Practical/oral is one combined published assessment, not two independent maxima. CA is continuous assessment and MT is mid-term; there is no extra internal assessment added to those marks.

**Not verified for R26:** grade cutoffs/points, applicable pass minima, attendance eligibility rules, and whether theory/practical results require separate grade units. The older 2024–25 autonomous regulation could not be retrieved and has not been silently applied to R26. Automatic grade/SGPA/CGPA values stay pending until the necessary rules are supplied. The app does not claim that an unconfirmed target is an institutional requirement.

In Marks → Curriculum settings, edit the policy JSON. Supply `source`, `gradeBands` (`grade`, `min` percentage, `points`), `passRules` keyed by course code, and optionally `attendanceThreshold`. Each course needs explicit pass criteria. Allowed criteria keys are assessment keys, `theory` (MT+CA+ESE), and `total`, all as percentages. Set `confirmed: true` only after checking the applicable official regulation, including grade aggregation. The editor validates values. It cannot independently authenticate a user-entered source.

The curriculum JSON editor allows changes/additions without deleting courses or invalidating saved marks. If regulations require separate theory/practical grade units, configure those units and credits from the regulation before confirming a result. Until then, combined-course percentages are performance indicators, not official grades. Timetable entries can also be configured through the stored semester model; no fabricated class schedule is displayed.

## Calculations

- Assessed percentage = sum of entered marks / sum of maxima for entered components × 100. Blank is missing; zero is a recorded zero. Coverage uses the complete course maximum.
- Completed-course grade follows the user-confirmed bands and pass minima. Failed courses retain their credit denominator and receive zero points.
- SGPA = sum(credits × grade points) / sum(credits). Full actual SGPA requires complete marks and passing rules for every configured grade unit. Display rounds only at the end.
- CGPA uses credit-weighted points from semesters explicitly confirmed against issued results. It never averages semester SGPAs without weighting. Editing marks, curriculum or policy invalidates confirmation.
- What-if inputs stay in component state and never overwrite actual marks. Target percentage planning reports marks needed out of the unassessed maximum, including unreachable targets. Target SGPA is editable and compared with the simulation; grade bands are shown through course results. This is planning, not an optimization guarantee.
- Attendance uses conducted lectures only. For target fraction `t`, recovery = ceil((t × total − attended)/(1−t)); safe misses = floor(attended/t − total), both bounded below by zero. Zero lectures display no percentage. A 100% target after an absence cannot be recovered. Theory and practical have separate records, dated events, weekly trends and undo.

## Forecasts

The original Python implementation trained linear/logistic models on generated synthetic data. There was no evidence of a validated fourth-year or first-year training set. It has been replaced with an auditable baseline: carry the assessed percentage into remaining assessments. The service returns coverage, projected percentage and a study recommendation; it does not return accuracy, calibrated probabilities or confidence intervals. Attendance is contextual rather than an invented marks penalty. The frontend handles unavailable service and timeout states. Future validated models can replace the service behind the same client boundary.

## Storage and migration

- `campus360-state`: legacy state/profile/rides preserved; previous academic sample records remain archived here and are not shown as R26 results.
- `campus360-vesit-r26-v1`: independent semester course schemes, marks, attendance/events, reminders, target, confirmations and policy. Refresh and logout retain records.
- Academic backup export is available in Curriculum settings. Browser storage is local to the browser/device, shared by this demo installation, and is not cloud sync or multi-user secure storage. Clearing browser storage still deletes local data. Storage failures surface in the header.
- Existing SQL/JSON seeds remain untouched. `migrations/001_vesit_r26.sql` is an optional, additive, RLS-protected future Supabase snapshot table. It has not been executed; no frontend Supabase adapter existed or has been represented as working cloud persistence.
- Demo profiles, directory/map and leaderboard remain sample features, not verified VESIT records. Official updates are links to institutional pages, not a live feed. Personal identity fields are preserved; existing saved profiles are not forcibly rewritten.

## Verification

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
.\.venv\Scripts\python.exe -m unittest discover -s ml-service -p test_api.py
```

Tests cover source totals, credit weighting including failed courses, missing versus zero marks, attendance boundaries/recovery, unreachable targets, malformed policies, mark entry/editing and validation, semester switching, serialized persistence, logout retention, attendance undo, frontend API payload/error handling, and Python API validation. Route smoke tests cover every existing route with Leaflet rendering mocked. These are not a substitute for a real browser visual/mobile/console check; no browser automation runtime was available in this session.

## Changed files

- `src/config/vesit.js`: source links, both semester schemes, unresolved policy and semester defaults.
- `src/lib/academic.js`, `src/lib/academic.test.js`: R26 calculation layer and tests.
- `src/components/Academics.jsx`, `src/components/Academics.test.jsx`: semester control, dashboard summary, marks, simulation, curriculum editor/backup, reminders, attendance/trends and workflow tests.
- `src/services/predictions.js`, `src/services/predictions.test.js`: Python API client and contract tests.
- `src/store/useCampusStore.js`: independent academic persistence, validation and non-destructive logout.
- `src/App.jsx`, `src/App.test.jsx`: existing route integration, policy-aware alerts and route smoke tests.
- `src/data/mockData.js`, `src/services/auth.js`: VESIT defaults/reference links and profile-preserving login/logout.
- `ml-service/app/main.py`, `ml-service/requirements.txt`, `ml-service/test_api.py`: validated rule-based API replacing synthetic models.
- `migrations/001_vesit_r26.sql`: optional future database table.
- `.env.example`, `.gitignore`, `README.md`: configuration, local environment exclusions and documentation.

Legacy `src/lib/grading.js` and `src/config/muGrading.js` are retained for compatibility with old tests/data; active R26 pages do not use their grade cutoffs.
