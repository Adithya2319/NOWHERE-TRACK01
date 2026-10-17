import { useState } from "react";
import { attendanceAdvice } from "../../shared/attendance.js";
import FutureAttendancePlanner from "../components/FutureAttendancePlanner";
import {
  button,
  Feedback,
  input,
  localDate,
  panel,
  useWrite,
} from "../components/SharedUI";

export default function AttendancePage({ data, onRefresh }) {
  const [semester, setSemester] = useState(1);
  const [date, setDate] = useState(() => localDate());
  const current = data.academics.semesters[semester];
  const policy = data.academics.policy;
  const write = useWrite(onRefresh);
  const weeks = {};
  for (const event of current.events || []) {
    const day = new Date(`${event.date}T12:00:00Z`);
    day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
    const week = day.toISOString().slice(0, 10);
    weeks[week] ||= { total: 0, present: 0 };
    weeks[week].total += 1;
    weeks[week].present += Number(event.present);
  }
  return (
    <div className="space-y-6">
      <section className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-4xl">Attendance</h1>
          <label className="text-sm">
            Semester{" "}
            <select
              aria-label="Attendance semester"
              className={input}
              value={semester}
              onChange={(event) => setSemester(Number(event.target.value))}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </label>
        </div>
        <p className="my-3 text-sm">
          Self-reported lectures, saved to your private server account.
          Cancelled classes are excluded by leaving them unrecorded or undoing
          their entry. Attendance target:{" "}
          {policy.attendanceThreshold == null
            ? "unconfirmed"
            : `${policy.attendanceThreshold}% (planning rule; verify with college)`}
          .
        </p>
        {data.me?.demo && <p className="my-3 text-sm text-ink/70">DEMO attendance history and your rehearsal changes. These are example records, not official college attendance; the 75% planning target is illustrative.</p>}
        <label className="text-sm">
          Lecture date{" "}
          <input
            aria-label="Lecture date"
            required
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className={input}
          />
        </label>
        <Feedback {...write} />
        <div className="mt-4 space-y-3">
          {current.courses.flatMap((course) =>
            [
              ...(course.credits > course.practicalCredits ? ["theory"] : []),
              ...(course.practicalCredits > 0 ? ["practical"] : []),
            ].map((type) => {
              const count = current.attendance[`${course.code}:${type}`] || {
                present: 0,
                total: 0,
              };
              const advice = attendanceAdvice(
                count.present,
                count.total,
                policy.attendanceThreshold,
              );
              return (
                <article
                  className="rounded-xl border border-ink/15 p-4"
                  key={`${semester}:${course.code}:${type}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-semibold">
                        {course.subject} · {type}
                      </h2>
                      <p className="text-xs text-ink/60">{course.code}</p>
                      <p aria-live="polite">
                        {count.present}/{count.total} attended ·{" "}
                        {advice.percentage == null
                          ? "No lectures"
                          : `${advice.percentage.toFixed(1)}%`}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {["Present", "Absent"].map((status) => (
                        <button
                          key={status}
                          disabled={write.pending || !date}
                          aria-label={`${status}: ${course.subject} ${type}`}
                          className={button}
                          onClick={() =>
                            write.run(
                              "/attendance",
                              {
                                semester,
                                code: course.code,
                                type,
                                present: status === "Present",
                                date,
                              },
                              "POST",
                              `${status} saved. Counts updated.`,
                            )
                          }
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="my-3 h-2 bg-ink/10">
                    <div
                      className={`h-full transition-[width] ${advice.recover ? "bg-signal" : "bg-moss"}`}
                      style={{ width: `${advice.percentage || 0}%` }}
                    />
                  </div>
                  {advice.recover !== null && (
                    <p className="text-sm">
                      {advice.recover
                        ? Number.isFinite(advice.recover)
                          ? `Attend ${advice.recover} consecutive lectures to recover.`
                          : "A 100% target cannot be recovered after an absence."
                        : `May miss ${advice.miss} lecture(s) at this target.`}
                    </p>
                  )}
                  <FutureAttendancePlanner
                    present={count.present}
                    total={count.total}
                    policyTarget={policy.attendanceThreshold}
                    plan={current.attendancePlans?.[`${course.code}:${type}`]}
                    labelPrefix={`${course.subject} ${type}`}
                    pending={write.pending}
                    onSave={plan => write.run(
                      '/attendance/plan',
                      { semester, code: course.code, type, version: current.version, ...plan },
                      'POST',
                      'Attendance plan saved. Recorded attendance is unchanged.',
                    )}
                  />
                </article>
              );
            }),
          )}
        </div>
      </section>
      <section className={panel}>
        <h2 className="font-display text-3xl">Weekly trends</h2>
        {!Object.keys(weeks).length && (
          <p className="my-3">No dated lectures yet.</p>
        )}
        {Object.entries(weeks)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([week, count]) => (
            <p className="my-3" key={week}>
              Week of {week}: {((count.present / count.total) * 100).toFixed(1)}
              % · {count.present}/{count.total}
            </p>
          ))}
      </section>
      <section className={panel}>
        <h2 className="font-display text-3xl">Recent records</h2>
        {!(current.events || []).length && (
          <p className="my-3">
            No records yet. Use Present or Absent to begin.
          </p>
        )}
        {[...(current.events || [])]
          .reverse()
          .slice(0, 30)
          .map((event) => (
            <div
              key={event.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 py-3"
            >
              <span className="text-sm">
                {event.date} · {event.code} · {event.type} ·{" "}
                {event.present ? "Present" : "Absent"}
              </span>
              <button
                disabled={write.pending}
                className={button}
                onClick={() =>
                  write.run(
                    `/attendance/${event.id}?semester=${semester}`,
                    undefined,
                    "DELETE",
                    "Record undone and counts updated.",
                  )
                }
              >
                Undo record
              </button>
            </div>
          ))}
      </section>
    </div>
  );
}
