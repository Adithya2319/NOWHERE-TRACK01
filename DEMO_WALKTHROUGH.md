# Campus360: three-minute presentation

For the 17 October 2026 hackathon rehearsal. All schedules, contacts, marks, approvals and rides in the separate Adithya workspace are labelled DEMO. The VESIT FE EXTC R26 subjects, assessment maxima and credits are the existing curriculum; sample grading/pass rules are illustrative.

## Prepare before presenting

Use Node **24.22.0** or a newer Node 24 release. From this project root:

```powershell
npm.cmd ci
npm.cmd run demo:load
npm.cmd run dev
```

Stop any running Vite process before `npm.cmd ci` on Windows. Dependencies already installed need no reinstall. `npm.cmd run dev` starts both Vite (5174) and Express (4000), so no second terminal or Python service is required. Open **http://127.0.0.1:5174/login**, choose **Adithya** marked **DEMO**. An existing account named Adithya is preserved separately: select the one with the DEMO badge. Alternatively use **Load Demo Data** on the login screen.

At the start of the presentation day, use **Profile → Reset Demo Data → Confirm reset DEMO data** once if you want fresh examples and dates relative to that day. This restores only the isolated DEMO workspace, including rehearsal edits; other accounts remain untouched. Loading again is idempotent and preserves edits. Reset stays signed in. Keep a separate browser profile for Riya Moderator · DEMO if you want to show grading or a timetable edit.

## Three-minute flow

| Time | Show and say |
|---|---|
| 0:00–0:30 | Home: “This is Adithya, First Year EXTC, FE-A, VESIT Mumbai. The DEMO workspace has a single persisted set of records behind every view.” Point out projected SGPA **8.78**, pending Recorded SGPA, attendance, assignments and the next simulated booked ride. |
| 0:30–1:00 | Attendance: Mathematics starts **13/20 = 65%**. Its future planner shows **8 consecutive classes** to reach the illustrative 75% target. Click Present: **14/21**, counters and advice update. Refresh to prove persistence. Cancelled lectures are not recorded. |
| 1:00–1:35 | Marks: enable editing; change Mathematics Continuous assessment **16 → 19.5 out of 20**. Projection rises from **8.78 to 9.00** under sample rules. Save. “We extend each subject’s assessed percentage to unfinished components, apply pass gates, and weight by credits. Blank finals keep Recorded SGPA pending. The maximum is a bound, not an AI prediction.” |
| 1:35–2:00 | Class board: open **Matrices: engineering applications · DEMO**. Enter a short completion note, e.g. “Solved the five examples and checked the inverse by multiplication.” Submit. Show Submitted, saved history and the updated home counts. This is a local note submission, not a file sent to college. |
| 2:00–2:35 | Rides: choose the available Chembur-station example; click **Book DEMO Ride**, review conflicts, then confirm. Seats drop by one, the booking appears in **My Rides**, and a notification is created. Cancel and show the seat restored. “This is a simulation: no real transport or payment is arranged.” |
| 2:35–3:00 | Open Notifications; mark one read and refresh to show the count persists. Open Schedule, move to the next date and show named classes/practicals and sample rooms. End on Home: all summaries derive from saved records, not fixed counters. |

## What is functional

- Separate local accounts, persistent SQLite records and authenticated session refresh.
- Idempotent DEMO load and confirmed isolated reset.
- Marks editing, partial-result projections, grade/pass boundaries, targets and maximum bounds.
- Subject/type attendance, dated history, Present/Absent, undo, recovery and saved future plans.
- Assignment details, status filters, due dates, note submissions, history, moderator feedback/optional marks and an idempotent class-points ledger.
- Date navigation, two weeks of sample timetable, moderator conflict-reviewed changes and updated day plans.
- Simulated immediate booking on marked DEMO rides, full/duplicate prevention, My Rides, cancellation and seat restoration. Other ride offers retain the existing driver-confirmation workflow.
- In-app notifications with private read/unread state; action notifications for marks, attendance, submissions, rides and schedule changes.
- Profile academic details and saved contact preferences; directory/maps retain text fallback if tiles are unavailable.

## Simulation and limits

- Local account selection does not verify phone ownership or college enrollment. Public provider authentication still requires separate credentials and testing.
- Example timetable, people, contacts, attendance and marks are not institutional records. Sample grade/pass rules are not official VESIT policy.
- Assignment storage supports written notes and optional resource text, not binary uploads or delivery to a college LMS. Assignment grading does not change academic assessment marks automatically.
- Rides and contributions are examples only: no real dispatch, payments, tracking or personal contact details.
- Notifications are in-app only. Email/push choices are saved preferences, not connected delivery services.
- Maps depend on external tiles; if unavailable, all location text and primary workflows still work.

## Recovery commands

```powershell
# Add missing DEMO examples without overwriting rehearsal edits:
npm.cmd run demo:load

# Explicitly restore only the isolated DEMO workspace, rebasing dates to today:
$env:CONFIRM_DEMO_RESET='RESET_DEMO_DATA'
npm.cmd run demo:reset
Remove-Item Env:CONFIRM_DEMO_RESET

# Verify the API:
Invoke-RestMethod http://127.0.0.1:4000/api/health
```

Avoid the older `db:reset` command for this walkthrough: it is a separate full synthetic-installation reset. **demo:reset** is the scoped rehearsal reset. If the frontend/API ports are occupied, stop the original launcher with Ctrl+C; the launcher never silently switches ports. Restart with `npm.cmd run dev` and reopen the same hostname to retain its session cookie.
