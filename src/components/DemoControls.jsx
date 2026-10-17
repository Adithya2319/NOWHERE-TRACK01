import { useState } from "react";
import { button, Feedback, primary, useWrite } from "./SharedUI";

export default function DemoControls({ demo, accountDemo = false, onRefresh, onEnter, login = false }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const write = useWrite(onRefresh);
  if (!demo?.enabled) return null;
  return (
    <section aria-label="DEMO data tools" className="rounded-xl border border-ochre/50 bg-ochre/5 p-4">
      <p className="font-semibold">DEMO rehearsal workspace</p>
      <p className="mt-2 text-xs leading-5 text-ink/70">
        Example marks, attendance, assignments, schedules and simulated rides live in separate DEMO accounts.
        Existing local accounts and their records are preserved. No college identity is verified.
      </p>
      {demo.loaded && <p className="mt-2 text-xs">DEMO data is loaded. Loading again preserves saved edits and avoids duplicates.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button disabled={write.pending} className={button} onClick={() => write.run("/demo/load", {}, "POST", "DEMO data is ready. Your existing records are preserved.")}>
          {write.pending ? "Please wait…" : "Load Demo Data"}
        </button>
        {demo.loaded && !accountDemo && onEnter && (
          <button disabled={write.pending} className={primary} onClick={onEnter}>Enter Adithya DEMO account</button>
        )}
        {demo.loaded && accountDemo && !login && !confirmReset && (
          <button disabled={write.pending} className={button} onClick={() => setConfirmReset(true)}>Reset Demo Data</button>
        )}
      </div>
      {confirmReset && (
        <div className="mt-3 rounded-md border border-signal/30 p-3">
          <p className="text-sm">Reset the isolated DEMO rehearsal? This replaces DEMO marks, attendance, submissions, bookings and notifications with the starting examples. Other local accounts are preserved.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button disabled={write.pending} className={button} onClick={() => setConfirmReset(false)}>Keep my DEMO changes</button>
            <button disabled={write.pending} className={primary} onClick={async () => {
              const result = await write.run("/demo/reset", { confirm: "RESET_DEMO_DATA" }, "POST", "DEMO rehearsal restored to its starting examples.");
              if (result) setConfirmReset(false);
            }}>Confirm reset DEMO data</button>
          </div>
        </div>
      )}
      <Feedback {...write} />
    </section>
  );
}
