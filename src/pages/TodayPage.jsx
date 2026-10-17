import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { planSemester } from "../../shared/planner";
import DemoControls from "../components/DemoControls";
import {
  button,
  ConflictDialog,
  Feedback,
  input,
  localDate,
  panel,
  primary,
  timeRange,
  useWrite,
} from "../components/SharedUI";

const toInput = (value) =>
  new Date(new Date(value).getTime() + 330 * 60000).toISOString().slice(0, 16);
const toInstant = (value) => `${value}:00+05:30`;
export default function TodayPage({ data, onRefresh, scheduleOnly = false }) {
  const navigate = useNavigate();
  const [date, setDate] = useState(() =>
    localDate(new Date(), data.config.timezone || "Asia/Kolkata"),
  );
  const [response, setDay] = useState(null);
  const day = response?.date === date ? response : null;
  const [dayError, setDayError] = useState("");
  const [retry, setRetry] = useState(0);
  const [summarySemester, setSummarySemester] = useState(1);
  const [now, setNow] = useState(Date.now);
  const [review, setReview] = useState(null);
  const [form, setForm] = useState({
    title: "",
    start: `${date}T17:00`,
    end: `${date}T17:30`,
  });
  const write = useWrite(onRefresh);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  const record = data.academics.semesters[summarySemester];
  const summary = planSemester(record, data.academics.policy, { planningMode: 'auto' });
  const attendance = Object.values(record.attendance).reduce(
    (total, entry) => ({
      present: total.present + entry.present,
      total: total.total + entry.total,
    }),
    { present: 0, total: 0 },
  );
  const tasks = data.tasks.filter((task) => (task.creatorId || task.creator_id) !== data.me.id).map((task) => {
    const submission = (task.submissions || []).find((item) => (item.userId || item.user_id) === data.me.id);
    const status = submission ? submission.grade != null || submission.status === "approved" ? "Graded" : "Submitted" : Date.parse(task.deadline) < now ? "Overdue" : "Pending";
    return { ...task, submission, status };
  });
  const awaiting = tasks.filter((task) => !task.submission).sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline));
  const openTasks = awaiting.length;
  const recentSubmissions = tasks.filter((task) => task.submission).sort((a, b) => Number(b.submission.submittedAt || b.submission.created_at || 0) - Number(a.submission.submittedAt || a.submission.created_at || 0)).slice(0, 4);
  const bookedRide = (data.rides || []).filter((ride) => Date.parse(ride.end || ride.start) > now && (ride.requests || []).some((request) => request.riderId === data.me.id && request.status === "confirmed")).sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0];
  const upcomingClasses = data.schedule.filter((item) => item.kind === "class" && Date.parse(item.end) > now).sort((a, b) => Date.parse(a.start) - Date.parse(b.start)).slice(0, 5);
  const unreadNotifications = (data.notifications || []).filter((item) => !item.readAt);
  const formatDate = (value) => new Date(value).toLocaleString("en-IN", { timeZone: data.config.timezone || "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const format = (value) => (value == null ? "Pending" : value.toFixed(2));
  const planningFormat = (value, status) => value != null ? format(value)
    : ({ 'insufficient-data': 'Insufficient data', 'missing-rules': 'Missing grading rules', 'unsupported-rules': 'Unsupported rules', 'no-credits': 'No credited subjects' }[status] || 'Pending');
  const selectDate = (value) => {
    if (!value) return;
    setDate(value);
    setDayError("");
    if (!form.id)
      setForm({ ...form, start: `${value}T17:00`, end: `${value}T17:30` });
  };
  const changeDay = (amount) => {
    const next = new Date(`${date}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + amount);
    selectDate(next.toISOString().slice(0, 10));
  };
  const enterDemo = async () => {
    const result = await write.run("/auth/demo", { userId: data.demo.studentId }, "POST", "Entered the DEMO account.");
    if (result) navigate("/", { replace: true });
  };
  useEffect(() => {
    const controller = new AbortController();
    api(`/today?date=${date}`, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setDay(result);
        setDayError("");
      })
      .catch((error) => {
        if (!controller.signal.aborted && error.name !== "AbortError")
          setDayError(error.message);
      });
    return () => controller.abort();
  }, [date, data, retry]);
  const previewSave = async (event) => {
    event.preventDefault();
    const body = {
      ...form,
      start: toInstant(form.start),
      end: toInstant(form.end),
    };
    const result = await write.run(
      "/schedule/preview",
      body,
      "POST",
      "Review the schedule before saving.",
    );
    if (result)
      setReview({ title: "schedule change", result, body, path: "/schedule" });
  };
  const previewJoin = async (item) => {
    const result = await write.run(
      `/schedule/${item.id}/preview`,
      {},
      "POST",
      "Review this event against your day plan.",
    );
    if (result)
      setReview({
        title: item.title,
        result,
        path: `/schedule/${item.id}/join`,
        body: { version: result.version ?? item.version },
      });
  };
  const commit = async () => {
    const result = await write.run(review.path, {
      ...review.body,
      previewToken: review.result.previewToken,
      version: review.result.version ?? review.body.version,
      acknowledgeConflicts: true,
    });
    if (result) {
      setReview(null);
      if (review.path === "/schedule")
        setForm({ title: "", start: `${date}T17:00`, end: `${date}T17:30` });
    }
  };
  const daySchedule = data.schedule.filter(
    (item) =>
      localDate(
        new Date(item.start),
        data.config.timezone || "Asia/Kolkata",
      ) === date,
  );
  const deadlines = Object.values(data.academics.semesters)
    .flatMap((semester) => semester.deadlines || [])
    .filter(
      (deadline) =>
        (deadline.dueDate || deadline.deadline || "").slice(0, 10) === date,
    );
  const help = [
    ...new Map(
      [
        ...(day?.help || []),
        ...(day?.suggestions || []).flatMap((item) => item.help || []),
      ].map((contact) => [contact.id, contact]),
    ).values(),
  ];
  const suggestions = (day?.suggestions || []).filter((item, index, list) => list.findIndex(other => other.rideId === item.rideId) === index);
  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-ink/15 bg-[#F7F3EA] p-6 shadow-[6px_6px_0_0_rgba(20,19,15,1)]">
        <p className="text-xs uppercase tracking-[0.24em] text-ink/60">
          {data.me.demo ? "DEMO · Your campus day" : "Your shared campus day"}
        </p>
        <h1 className="my-3 font-display text-5xl">
          {scheduleOnly ? "Class schedule" : "A little room to plan."}
        </h1>
        {data.me.demo && <p className="mb-4 text-sm">{[data.me.name, data.me.academicDetails?.college, [data.me.academicDetails?.year, data.me.academicDetails?.branch].filter(Boolean).join(" "), data.me.academicDetails?.division, data.me.academicDetails?.semester && `Semester ${data.me.academicDetails.semester}`, data.me.academicDetails?.academicYear].filter(Boolean).join(" · ")}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button className={button} onClick={() => changeDay(-1)} aria-label="Previous day">← Previous</button>
          <label className="text-sm">
            Selected date{" "}
            <input
              aria-label="Day plan date"
              className={input}
              type="date"
              required
              value={date}
              onChange={(event) => {
                selectDate(event.target.value);
              }}
            />
          </label>
          <button className={button} onClick={() => changeDay(1)} aria-label="Next day">Next →</button>
          <button className={button} onClick={() => selectDate(localDate())}>
            Actual today
          </button>
          {data.config.demoDate && (
            <button
              className={button}
              onClick={() => selectDate(data.config.demoDate)}
            >
              Use saved sample date ({data.config.demoDate})
            </button>
          )}
        </div>
        <p className="mt-3 text-xs text-ink/60">
          Asia/Kolkata ·{" "}
          {date === localDate() ? "Actual current day" : "Selected day"} ·
          {data.me.demo ? "DEMO schedules are illustrative, not an official college timetable. Changes are saved." : "Starts with sample schedules, rides and contacts. Changes are saved."}
        </p>
      </section>
      <Feedback {...write} />
      {!scheduleOnly && <DemoControls demo={data.demo} accountDemo={data.me.demo || data.demo?.account} onRefresh={onRefresh} onEnter={enterDemo} />}
      {!scheduleOnly && (
        <section className={panel}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-3xl">Your semester at a glance</h2>
            <label className="text-sm">
              Summary semester{" "}
              <select
                aria-label="Summary semester"
                className={input}
                value={summarySemester}
                onChange={(event) =>
                  setSummarySemester(Number(event.target.value))
                }
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
            </label>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              ["Recorded SGPA", format(summary.currentSGPA)],
              ["Projected SGPA", planningFormat(summary.projectedSGPA, summary.projectionStatus)],
              ["Maximum reachable", planningFormat(summary.maxSGPA, summary.maximumStatus)],
              ["Target SGPA", format(record.target)],
              [
                "Self-reported attendance",
                attendance.total
                  ? `${((attendance.present / attendance.total) * 100).toFixed(1)}% (${attendance.present}/${attendance.total})`
                  : "No lectures",
              ],
              ["Tasks awaiting submission", openTasks],
            ].map(([label, value]) => (
              <div
                key={label}
                className="min-w-0 rounded-xl border border-ink/15 p-3"
              >
                <p className="text-xs text-ink/60">{label}</p>
                <p className="mt-2 break-words font-display text-2xl">
                  {value}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink/60">
            {summary.planningBasis?.mode === 'sample'
              ? "Projected and maximum SGPA use labelled sample planning rules, not official VESIT rules."
              : "Projected and maximum SGPA use your configured grading and passing rules."}{" "}
            Recorded SGPA requires final marks and saved applicable rules.
            Projections continue each subject's assessed percentage, rounding components to half marks; an unassessed credited subject means insufficient data. The maximum bound assumes full marks in remaining components and respects recorded pass-gate failures.{" "}
            {summary.targetReachable == null
              ? ""
              : summary.targetReachable
                ? "Target is within this mathematical upper bound."
                : "Target is above the reachable maximum."}
          </p>
          <div className="mt-3 flex flex-wrap gap-4 text-sm underline">
            <Link to="/marks">Plan marks and target</Link>
            <Link to="/attendance">Record attendance</Link>
            <Link to="/leaderboard">Open class tasks</Link>
          </div>
        </section>
      )}
      {!scheduleOnly && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className={panel}>
            <h2 className="font-display text-3xl">Assignments & deadlines</h2>
            <div className="my-3 flex flex-wrap gap-3 text-xs">
              {["Pending", "Submitted", "Overdue", "Graded"].map((status) => <span key={status}>{status}: {tasks.filter((task) => task.status === status).length}</span>)}
            </div>
            {!awaiting.length && <p className="my-4 text-sm">No assignments awaiting your submission.</p>}
            {awaiting.slice(0, 4).map((task) => <article className="border-b border-ink/10 py-3" key={task.id}>
              <Link to={`/leaderboard?task=${encodeURIComponent(task.id)}`} className="font-semibold underline decoration-ink/20">{task.title}</Link>
              <p className="mt-1 text-xs">{task.subject || task.subjectCode || "Class task"} · {task.status} · {task.priority || "medium"} priority</p>
              <p className="mt-1 text-xs text-ink/60">Due {formatDate(task.deadline)} {task.demo && "· DEMO"}</p>
            </article>)}
            <Link className="mt-4 inline-block text-sm underline" to="/leaderboard">Open all assignments</Link>
          </section>
          <section className={panel}>
            <h2 className="font-display text-3xl">Recent submissions</h2>
            {!recentSubmissions.length && <p className="my-4 text-sm">Your submitted work and feedback will appear here.</p>}
            {recentSubmissions.map((task) => <article className="border-b border-ink/10 py-3" key={task.id}>
              <Link to={`/leaderboard?task=${encodeURIComponent(task.id)}`} className="font-semibold underline decoration-ink/20">{task.title}</Link>
              <p className="mt-1 text-xs">{task.status}{task.submission.grade != null && ` · ${task.submission.grade}${task.maxMarks ? `/${task.maxMarks}` : ""} marks`}</p>
              {task.submission.feedback && <p className="mt-1 text-xs text-ink/60">{task.submission.feedback}</p>}
            </article>)}
            <h3 className="mt-5 font-semibold">Next booked ride</h3>
            {bookedRide ? <div className="mt-2 text-sm"><Link className="underline" to={`/rides?ride=${encodeURIComponent(bookedRide.id)}`}>{bookedRide.pickup} → {bookedRide.dropoff}</Link><p className="mt-1 text-xs">{formatDate(bookedRide.start)} · Confirmed{bookedRide.demo ? " · DEMO simulation; no transport arranged" : ""}</p></div> : <p className="mt-2 text-sm">No upcoming confirmed booking. <Link className="underline" to="/rides">Browse rides</Link></p>}
          </section>
        </div>
      )}
      {!scheduleOnly && unreadNotifications.length > 0 && <section className={panel}>
        <h2 className="font-display text-3xl">Useful alerts <span className="text-xl">({unreadNotifications.length} unread)</span></h2>
        {unreadNotifications.slice(0, 3).map((item) => <p className="mt-3 text-sm" key={item.id}><strong>{item.title}</strong> · {item.body}</p>)}
        <p className="mt-3 text-xs text-ink/60">Open Notifications in the header to read updates and follow their related pages.</p>
      </section>}
      {!scheduleOnly && (
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <section className={panel}>
            <h2 className="font-display text-3xl">Your day plan</h2>
            {!day && !dayError && (
              <p role="status" className="my-4">
                Loading selected day…
              </p>
            )}
            {dayError && (
              <>
                <Feedback error={dayError} />
                <button
                  className={button}
                  onClick={() => setRetry((value) => value + 1)}
                >
                  Retry day plan
                </button>
              </>
            )}
            {day?.items?.length === 0 && (
              <p className="my-4">
                No joined events, timetable or confirmed rides on this day.
              </p>
            )}
            {day?.items?.map((item) => (
              <article
                key={`${item.kind}-${item.id}`}
                className="border-b border-ink/10 py-4"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="font-semibold">{item.title}</h3>
                  <span className="text-xs uppercase text-ink/60">
                    {item.kind}
                  </span>
                </div>
                <p className="mt-1 text-sm">
                  {timeRange(item.start, item.end)}
                </p>
                {(() => { const details = data.schedule.find((event) => event.id === item.id) || item; return details.location || details.lectureType || details.demo ? <p className="mt-1 text-xs text-ink/60">{[details.location, details.lectureType || details.sessionType, details.demo ? "DEMO timetable" : null].filter(Boolean).join(" · ")}</p> : null; })()}
                {(item.conflicts || []).map((conflict, index) => (
                  <p
                    key={conflict.id || index}
                    className="mt-2 text-sm text-signal"
                  >
                    Overlaps {conflict.title || conflict.name}
                    {conflict.start &&
                      ` · ${timeRange(conflict.start, conflict.end)}`}
                    . Your booking remains in place.
                  </p>
                ))}
              </article>
            ))}
            {deadlines.map((deadline) => (
              <p
                key={deadline.id}
                className="border-b border-ink/10 py-3 text-sm"
              >
                Deadline: {deadline.title} · {deadline.subject}
              </p>
            ))}
            <Link className="mt-4 inline-block text-sm underline" to="/marks">
              Open academic planner
            </Link>
          </section>
          <section className={panel}>
            <h2 className="font-display text-3xl">Options that fit</h2>
            {day && !suggestions.length && (
              <p className="my-4 text-sm">
                No suitable alternative ride found in the current records.
              </p>
            )}
            {suggestions.map((suggestion, index) => (
              <article
                key={suggestion.rideId || index}
                className="border-b border-ink/10 py-4"
              >
                <p className="text-sm">{suggestion.reason}</p>
                {suggestion.rideId && (
                  <Link
                    className="mt-2 inline-block text-sm underline"
                    to={`/rides?ride=${suggestion.rideId}`}
                  >
                    Review this available ride
                  </Link>
                )}
              </article>
            ))}
            {help.map((contact) => (
              <p key={contact.id} className="mt-4 text-sm">
                <Link
                  className="underline"
                  to={`/directory?contact=${contact.id}`}
                >
                  {contact.name}
                </Link>{" "}
                · Matches your interests or the session tags:{" "}
                {(contact.interests || contact.subjects || []).join(", ")}.
                Finding help only; no peer booking is made.
              </p>
            ))}
            {day && !help.length && (
              <p className="mt-4 text-sm">No matching help contact found.</p>
            )}
          </section>
        </div>
      )}
      <section className={panel}>
        <h2 className="font-display text-3xl">Class events · {date}</h2>
        <p className="my-2 text-sm">
          Review conflicts before joining. Class timetable applies
          automatically; optional events use your participation.
        </p>
        {!daySchedule.length && (
          <p className="my-4">No class events on this day.</p>
        )}
        {daySchedule.map((item) => (
          <article
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 py-4"
          >
            <div>
              <h3 className="font-semibold">{item.title}</h3>
              <p className="text-sm">
                {timeRange(item.start, item.end)} ·{" "}
                {(item.tags || []).join(", ")}
              </p>
              {(item.location || item.lectureType || item.demo) && <p className="mt-1 text-xs text-ink/60">{[item.location, item.lectureType || item.sessionType, item.demo ? "DEMO sample schedule" : null].filter(Boolean).join(" · ")}</p>}
              <p className="text-xs text-ink/60">
                {item.kind === "class"
                  ? "Class timetable — in your day plan"
                  : item.joined
                    ? "In your day plan"
                    : "Not joined"}
              </p>
              {(item.conflicts || []).map((conflict, index) => (
                <p
                  key={`${conflict.id}-${index}`}
                  className="mt-1 text-sm text-signal"
                >
                  Overlaps {conflict.title} ·{" "}
                  {timeRange(conflict.start, conflict.end)}. Plans are
                  preserved.
                </p>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {!item.joined && item.kind !== "class" && (
                <button
                  disabled={write.pending}
                  className={button}
                  onClick={() => previewJoin(item)}
                >
                  Review and join
                </button>
              )}
              {data.me.role === "moderator" && (
                <button
                  className={button}
                  disabled={write.pending}
                  onClick={() =>
                    setForm({
                      id: item.id,
                      title: item.title,
                      start: toInput(item.start),
                      end: toInput(item.end),
                      tags: item.tags || [],
                      version: item.version,
                    })
                  }
                >
                  Edit event
                </button>
              )}
            </div>
          </article>
        ))}
      </section>
      <section className={panel}>
        <h2 className="font-display text-3xl">Upcoming sessions</h2>
        <p className="mt-2 text-xs text-ink/60">Next scheduled classes from the current time. Select a day to inspect its full timetable.</p>
        {!upcomingClasses.length && <p className="mt-4 text-sm">No upcoming classes are listed.</p>}
        {upcomingClasses.map((item) => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 py-3">
          <div className="min-w-0"><h3 className="font-semibold">{item.title}</h3><p className="mt-1 text-xs">{formatDate(item.start)} · {timeRange(item.start, item.end)}</p><p className="mt-1 text-xs text-ink/60">{[item.location, item.lectureType || item.sessionType, item.demo ? "DEMO sample" : null].filter(Boolean).join(" · ")}</p></div>
          <button className={`${button} text-xs`} onClick={() => selectDate(localDate(new Date(item.start), data.config.timezone || "Asia/Kolkata"))}>View this day</button>
        </article>)}
      </section>
      {data.me.role === "moderator" && (
        <section className={panel}>
          <h2 className="font-display text-3xl">
            {form.id ? "Edit class event" : "Add class event"}
          </h2>
          <p className="my-3 text-sm">
            Changing a class event preserves existing rides and flags affected
            plans. Times use Asia/Kolkata.
          </p>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={previewSave}>
            <label className="text-sm sm:col-span-2">
              Title
              <input
                required
                maxLength={120}
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
                className={`${input} mt-1 w-full`}
              />
            </label>
            <label className="text-sm">
              Starts
              <input
                required
                type="datetime-local"
                value={form.start}
                onChange={(event) =>
                  setForm({ ...form, start: event.target.value })
                }
                className={`${input} mt-1 w-full`}
              />
            </label>
            <label className="text-sm">
              Ends
              <input
                required
                type="datetime-local"
                value={form.end}
                onChange={(event) =>
                  setForm({ ...form, end: event.target.value })
                }
                className={`${input} mt-1 w-full`}
              />
            </label>
            <button disabled={write.pending} className={primary}>
              Preview affected plans
            </button>
            {form.id && (
              <button
                className={button}
                type="button"
                onClick={() =>
                  setForm({
                    title: "",
                    start: `${date}T17:00`,
                    end: `${date}T17:30`,
                  })
                }
              >
                Cancel edit
              </button>
            )}
          </form>
        </section>
      )}
      <ConflictDialog
        review={review}
        pending={write.pending}
        error={write.error}
        onCancel={() => setReview(null)}
        onCommit={commit}
      />
    </div>
  );
}
