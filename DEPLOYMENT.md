# Prepared deployment — not published

A GitHub-based Vercel/Netlify frontend needs a reachable persistent HTTPS Node backend. Keep SQLite on private persistent disk with one application process and backups. Never use an ephemeral serverless filesystem. If only serverless hosting exists, plan an explicit managed-database migration first.

1. Pass install/lint/tests/build/browser checks. CI is prepared in .github/workflows/ci.yml with Node24.22.
2. Put source in an authorized GitHub repository, excluding .env/databases/backups/node_modules/test artifacts. No Git remote/CLI access was available; nothing pushed.
3. Provision an authorized Node24 persistent host. Set DB_PATH to durable disk; AUTH_MODE=provider; MINIMOTH_API_KEY server-only; PUBLIC_ORIGIN to frontend HTTPS; COOKIE_SECURE=true; NODE_ENV=production. Set HOST/PORT for hosting. Review TRUST_PROXY against the actual chain; true trusts one hop.
4. Run npm ci, db:migrate, configure campus/class records, build, then npm start. Synthetic seed is for rehearsals, not real accounts.
5. Once that persistent HTTPS origin exists, run:

```powershell
npm.cmd run deploy:prepare -- https://YOUR-ACTUAL-PERSISTENT-BACKEND
```

This writes API rewrites **before** SPA fallback and disables API caching. It publishes nothing. Checked-in placeholders use reserved .invalid so unconfigured API routes cannot silently return index.html.

6. Connect authorized GitHub source to Vercel/Netlify: npm run build, output dist. Provider keys never enter frontend variables.
7. Test login, token rotation, logout, backend restart/disk persistence, deep links and JSON API errors through the **public frontend origin**. Verify Cookie/Set-Cookie/Origin forwarding and no authenticated response caching. Cookies are HttpOnly, host-only and Secure under HTTPS. A static preview does not prove backend/cookie availability.

No MiniMoth key/sandbox/delivery rehearsal, persistent host or hosting account was available. Stubs prove contracts only. Real provider accounts start unverified/student-only; an operator may bootstrap a moderator using the guarded CLI after reviewing identity. Phone control never proves enrollment.

Production defaults to provider mode and requires HTTPS/Secure cookies. Public synthetic demo requires AUTH_MODE=demo plus explicit ALLOW_DEMO=true. Public deployment, GitHub access, persistent host, real delivery, public cookie forwarding and final live URL remain pending. No paid service provisioned or spending authorized. LAN rehearsal is backup, not the live-link deliverable.

