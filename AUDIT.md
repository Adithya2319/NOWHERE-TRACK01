# Evidence review before expansion

Latest presentation follow-up, 16 October 2026: extended the existing Express/SQLite and React pages with an isolated DEMO college/account namespace. Source review covered every active route, auth/storage/API boundary and existing academic/attendance engines; legacy local sources remain preserved and inactive. Added a consistent real-curriculum dataset, task note/history workflows, in-app notifications and development-only simulated immediate booking. Existing real/user-entered records were backed up and verified unchanged after explicit demo loading. Validation:102 frontend+124server/domain tests and6real-browser scenarios, lint and build pass. See [DEMO_WALKTHROUGH.md](DEMO_WALKTHROUGH.md) for the3-minute presentation and honest limits; [CHANGES.md](CHANGES.md) lists exact files.

Current follow-up on 16 October 2026: corrected strict grade/pass/target boundary comparisons, blank imported theory marks, stale what-if estimates overriding actual marks, duplicate UI mutations, obsolete authentication/day-plan responses, modal focus and URL selection synchronization. Added exact attendance planning and independent durable forecast scenarios, plus a single development launcher that preserves existing databases. [CHANGES.md](CHANGES.md) lists the affected files and [TESTING.md](TESTING.md) records verification. Applicable official grade/pass/attendance rules and live provider validation remain unresolved; passing tests do not establish that every possible defect is absent.

Reviewed the actual root, manifest, routes, stores, services, schemas, tests and environment on 16 October 2026. No AGENTS.md or Git metadata was present. Source was backed up before editing. The supplied archive listing was inspected without extracting over this revision, which already included VESIT and UUID fixes absent from the archive.

| Area | Before expansion | Evidence / decision |
|---|---|---|
| Frontend | React19, Vite8, Tailwind3, Router, Zustand; large App.jsx | Keep stack/routes/paper-ink style; split connected pages |
| Storage | Browser-local state; unconnected Supabase seeds | Add Express/SQLite, preserve previous keys/files |
| Auth | Demo password and mock OTP/session | Active server-only provider adapter and opaque cookie sessions |
| Academics | Verified EXTC scheme; unknown grade policy | Preserve courses, add shared pass gates/upper bounds |
| UUID | Prior compatibility fix already present | Do not claim rediscovery; durable IDs now come from Node crypto |
| Rides | Single-browser offer state | Per-rider requests, permissions, atomic seats |
| Class board | Seeded rankings | Tasks, private submissions, approval/points ledger |
| Linked plans | Separate sample screens | Shared conflicts and actual-record alternatives |
| Runtime | Node24.22 | Built-in SQLite memory query verified on Windows |
| External access | No .env, MiniMoth key or GitHub CLI | Provider contracts and deployment preparation, live checks pending |

Rendered and visually read **genesis 2.0.pdf pages 3–4** because extraction was empty. Only PS-02 was used. It permits mock JSON/localStorage; shared persistence is the user's extra requirement. Read both NOWHERE_FE_Track01.pptx and the alternate NOWHERE_FE_Track01AAdit.pptx. The first describes the shared-day differentiator/event-ride example; the alternate describes the older prototype.

Zustand is kept instead of the deck's Context/useReducer. Express replaces its proposed small FastAPI auth API so one Node runtime owns shared persistence. Full peer credits, payments, chat, live tracking, official feeds and broad event discovery remain excluded as directed. Verified VESIT courses are preserved instead of generic Physics/Chemistry samples.

Primary technical references: [MiniMoth quickstart](https://minimoth.dev/docs/quickstart/), [sessions](https://minimoth.dev/docs/sessions/), [Node SQLite](https://nodejs.org/api/sqlite.html), [Vercel rewrites](https://vercel.com/docs/routing/rewrites). Documentation/stub tests are not provider or hosted verification. No external message was sent; no deployment attempted.

