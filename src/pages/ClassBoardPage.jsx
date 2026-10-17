import { useEffect, useState } from "react";
import {
  button,
  Feedback,
  input,
  panel,
  primary,
  useWrite,
} from "../components/SharedUI";

function ownSubmissionFor(task, userId) {
  return (task.submissions || []).find((submission) => submission.userId === userId);
}
function statusFor(task, userId, now) {
  const submission = ownSubmissionFor(task, userId);
  if (submission) return submission.grade != null || submission.status === "approved" ? "Graded" : "Submitted";
  return new Date(task.deadline).getTime() <= now ? "Overdue" : "Pending";
}
const blankForm = { title: "", description: "", subjectCode: "", priority: "medium", maxMarks: "", deadline: "", points: 10 };

export default function ClassBoardPage({ data, onRefresh }) {
  const [form, setForm] = useState(blankForm);
  const [notes, setNotes] = useState({});
  const [feedback, setFeedback] = useState({});
  const [grades, setGrades] = useState({});
  const [statusFilter, setStatusFilter] = useState("All");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  const write = useWrite(onRefresh);
  const moderator = data.me.role === "moderator";
  const tasks = data.tasks || [];
  const selectedTask = new URLSearchParams(window.location.search).get('task');
  useEffect(() => {
    if (!selectedTask) return;
    const card = document.getElementById(`task-${selectedTask}`);
    card?.querySelector('details')?.setAttribute('open', '');
    card?.scrollIntoView?.({ block: 'center' });
  }, [selectedTask]);
  const subjects = [...new Map(tasks.filter((task) => task.subjectCode).map((task) => [task.subjectCode, { code: task.subjectCode, subject: task.subject || task.subjectCode }])).values()];
  const courses = [...new Map(Object.values(data.academics?.semesters || {}).flatMap((semester) => semester.courses || []).map((course) => [course.code, course])).values()];
  const statuses = ["Pending", "Submitted", "Overdue", "Graded"];
  const visibleTasks = tasks.filter((task) => (statusFilter === "All" || statusFor(task, data.me.id, now) === statusFilter) && (!subjectFilter || task.subjectCode === subjectFilter));
  const create = async (event) => {
    event.preventDefault();
    const result = await write.run(
      "/tasks",
      {
        ...form,
        deadline: `${form.deadline}:00+05:30`,
        points: Number(form.points),
        maxMarks: form.maxMarks === "" ? null : Number(form.maxMarks),
      },
      "POST",
      "Class task published.",
    );
    if (result) setForm(blankForm);
  };
  return (
    <div className="space-y-6">
      <section className={panel}>
        <h1 className="font-display text-4xl">Class board</h1>
        <p className="my-3 text-sm">
          Assignments and class contributions. Complete a task, submit a note, and receive fixed points after
          moderator approval. Points are separate from academic credits.
          Repeated approvals award points once.
        </p>
        <p className="text-xs text-ink/65">
          Submission notes and history are saved in this workspace. File uploads and delivery to a college learning platform are not connected.
          {data.me.demo && " DEMO assignments and feedback are illustrative."}
        </p>
        <Feedback {...write} />
      </section>
      <section aria-label="Assignment summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statuses.map((status) => <div className={panel} key={status}><p className="text-sm">{status}</p><strong className="font-display text-3xl">{tasks.filter((task) => statusFor(task, data.me.id, now) === status).length}</strong></div>)}
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className={panel}>
          <h2 className="font-display text-3xl">Class totals</h2>
          <p className="my-2 text-xs text-ink/60">
            College-wide totals from the approved points ledger. Ties use a
            stable name order.
          </p>
          {!(data.leaderboard?.classes || []).length && (
            <p className="my-4">No class points yet.</p>
          )}
          <ol className="mt-4 space-y-3">
            {(data.leaderboard?.classes || []).map((group, index) => (
              <li
                className="flex justify-between gap-3 border-b border-ink/10 pb-3"
                key={group.id}
              >
                <span>
                  {index + 1}. {group.name}
                </span>
                <strong>{group.points} pts</strong>
              </li>
            ))}
          </ol>
        </section>
        <section className={panel}>
          <h2 className="font-display text-3xl">Your class contributions</h2>
          <p className="my-2 text-xs text-ink/60">
            Only your own class student contributions are listed.
          </p>
          <ol className="mt-4 space-y-3">
            {(data.leaderboard?.students || []).map((student, index) => (
              <li
                className="flex justify-between gap-3 border-b border-ink/10 pb-3"
                key={student.id}
              >
                <span>
                  {index + 1}. {student.name}
                </span>
                <strong>{student.points} pts</strong>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <section className="space-y-4">
        <h2 className="font-display text-3xl">Class tasks</h2>
        <div className="flex flex-wrap gap-4">
          <label className="grid gap-1 text-sm">Assignment status
            <select className={input} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              {["All", ...statuses].map((status) => <option key={status}>{status}</option>)}
            </select>
          </label>
          <label className="grid min-w-0 gap-1 text-sm sm:max-w-xs">Assignment subject
            <select className={`${input} w-full min-w-0`} value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}>
              <option value="">All subjects</option>
              {subjects.map((subject) => <option key={subject.code} value={subject.code}>{subject.subject}</option>)}
            </select>
          </label>
        </div>
        {!tasks.length && (
          <p className={panel}>No class tasks have been published.</p>
        )}
        {!!tasks.length && !visibleTasks.length && <p className={panel}>No assignments match these filters.</p>}
        {visibleTasks.map((task) => {
          const ownSubmission = ownSubmissionFor(task, data.me.id);
          const expired = new Date(task.deadline).getTime() <= now;
          return (
            <article id={`task-${task.id}`} className={`${panel} scroll-mt-40 ${selectedTask === task.id ? 'ring-2 ring-moss' : ''}`} key={task.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="min-w-0 break-words font-semibold">{task.title}</h3>
                <span className="rounded-full border border-ink/20 px-3 py-1 text-xs">
                  {task.points} fixed pts
                </span>
              </div>
              <p className="mt-2 flex flex-wrap gap-2 text-xs">
                {task.demo && <span className="rounded border border-moss/30 px-2 py-1 text-moss">DEMO</span>}
                <span className="rounded border border-ink/20 px-2 py-1">{statusFor(task, data.me.id, now)}</span>
                <span className="rounded border border-ink/20 px-2 py-1">{task.priority || "medium"} priority</span>
                {task.subjectCode && <span className="py-1">{task.subject || task.subjectCode}</span>}
              </p>
              <p className="my-2 text-sm">
                Due{" "}
                {new Date(task.deadline).toLocaleString("en-IN", {
                  timeZone: "Asia/Kolkata",
                })}{" "}
                · Asia/Kolkata
              </p>
              <details className="my-3 text-sm">
                <summary className="cursor-pointer font-semibold">Open assignment details</summary>
                <p className="mt-2 whitespace-pre-wrap break-words">{task.description || "Complete the task described in the title and save a completion note for review."}</p>
                {task.maxMarks != null && <p className="mt-2">Assignment maximum: {task.maxMarks} marks. This review does not write academic assessment marks.</p>}
              </details>
              {ownSubmission && (
                <div className="my-3 rounded-md border border-ink/15 p-3 text-sm">
                  <p>
                    Your submission: <strong>{ownSubmission.status}</strong>
                  </p>
                  <p className="mt-1 break-words">{ownSubmission.note}</p>
                  {ownSubmission.submittedAt && <p className="mt-1 text-xs text-ink/65">Saved {new Date(ownSubmission.submittedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} · Asia/Kolkata</p>}
                  {ownSubmission.grade != null && <p className="mt-2">Assignment grade: <strong>{ownSubmission.grade}/{task.maxMarks}</strong>{task.demo ? " · DEMO feedback" : ""}</p>}
                  {ownSubmission.feedback && (
                    <p className="mt-2">Feedback: {ownSubmission.feedback}</p>
                  )}
                  <details className="mt-3">
                    <summary className="cursor-pointer font-semibold">Submission history</summary>
                    {!(ownSubmission.history || []).length && <p className="mt-2 text-ink/65">This older submission has no detailed history.</p>}
                    <ol className="mt-2 space-y-2">
                      {(ownSubmission.history || []).map((entry) => <li key={entry.id} className="border-l-2 border-ink/15 pl-3"><p>{entry.action} · {new Date(entry.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>{entry.note && <p className="mt-1 break-words text-ink/65">{entry.note}</p>}</li>)}
                    </ol>
                  </details>
                </div>
              )}
              {!ownSubmission &&
                !expired &&
                (task.creatorId || task.creator_id) !== data.me.id && (
                  <form
                    className="my-4 space-y-3"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const result = await write.run(
                        `/tasks/${task.id}/submit`,
                        { note: notes[task.id] || "" },
                        "POST",
                        "Completion note submitted for review.",
                      );
                      if (result) setNotes((previous) => ({ ...previous, [task.id]: "" }));
                    }}
                  >
                    <label className="block text-sm">
                      Completion note or safe resource URL
                      <textarea
                        required
                        maxLength={1500}
                        className={`${input} mt-1 min-h-24 w-full`}
                        value={notes[task.id] || ""}
                        onChange={(event) =>
                          setNotes({ ...notes, [task.id]: event.target.value })
                        }
                      />
                    </label>
                    <button disabled={write.pending} className={button}>
                      Submit completion
                    </button>
                  </form>
                )}
              {expired && !ownSubmission && (
                <p className="text-sm text-ink/60">
                  This task has closed for submissions.
                </p>
              )}
              {(task.creatorId || task.creator_id) === data.me.id && (
                <p className="my-3 text-sm text-ink/60">
                  Task creators cannot submit their own task.
                </p>
              )}
              {moderator && (
                <div className="mt-4 border-t border-ink/15 pt-4">
                  <h4 className="font-semibold">Submission review</h4>
                  {!(task.submissions || []).length && (
                    <p className="mt-2 text-sm">No submissions yet.</p>
                  )}
                  {(task.submissions || []).map((submission) => (
                    <div
                      key={submission.id}
                      className="my-3 rounded-lg border border-ink/15 p-3"
                    >
                      <p className="text-sm font-semibold">
                        {submission.name} · {submission.status}
                      </p>
                      <p className="my-2 break-words text-sm">
                        {submission.note}
                      </p>
                      {submission.feedback && (
                        <p className="my-2 text-sm">
                          Feedback: {submission.feedback}
                        </p>
                      )}
                      {submission.grade != null && <p className="my-2 text-sm">Assignment grade: {submission.grade}/{task.maxMarks}</p>}
                      {submission.status === "pending" &&
                        submission.userId !== data.me.id && (
                          <>
                            <label className="block text-sm">
                              Feedback
                              <input
                                className={`${input} mt-1 w-full`}
                                maxLength={500}
                                value={feedback[submission.id] || ""}
                                onChange={(event) =>
                                  setFeedback({
                                    ...feedback,
                                    [submission.id]: event.target.value,
                                  })
                                }
                              />
                            </label>
                            {task.maxMarks != null && <label className="mt-3 block text-sm">Assignment grade (optional, out of {task.maxMarks})
                              <input type="number" min="0" max={task.maxMarks} step="0.5" className={`${input} mt-1 w-full`} value={grades[submission.id] ?? ""} onChange={(event) => setGrades({ ...grades, [submission.id]: event.target.value })} />
                            </label>}
                            <div className="mt-3 flex gap-2">
                              {["approve", "reject"].map((action) => (
                                <button
                                  disabled={write.pending}
                                  className={button}
                                  key={action}
                                  onClick={() =>
                                    write.run(
                                      `/submissions/${submission.id}`,
                                      {
                                        action,
                                        feedback: feedback[submission.id] || "",
                                        ...(action === "approve" && grades[submission.id] !== undefined && grades[submission.id] !== "" ? { grade: Number(grades[submission.id]) } : {}),
                                      },
                                      "POST",
                                      action === "approve"
                                        ? "Submission approved. Shared points updated."
                                        : "Submission rejected with feedback.",
                                    )
                                  }
                                >
                                  {action === "approve" ? "Approve" : "Reject"}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      {submission.userId === data.me.id && (
                        <p className="text-xs text-ink/60">
                          Another moderator must review your own submission.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </section>
      {moderator && (
        <section className={panel}>
          <h2 className="font-display text-3xl">Publish a class task</h2>
          <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={create}>
            <label className="text-sm sm:col-span-2">
              Title
              <input
                required
                maxLength={150}
                className={`${input} mt-1 w-full`}
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
              />
            </label>
            <label className="text-sm sm:col-span-2">Description
              <textarea maxLength={3000} className={`${input} mt-1 min-h-24 w-full`} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </label>
            <label className="min-w-0 text-sm">Subject (optional)
              <select className={`${input} mt-1 w-full`} value={form.subjectCode} onChange={(event) => setForm({ ...form, subjectCode: event.target.value })}><option value="">Class contribution</option>{courses.map((course) => <option key={course.code} value={course.code}>{course.subject}</option>)}</select>
            </label>
            <label className="text-sm">Priority
              <select className={`${input} mt-1 w-full`} value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>{["low", "medium", "high"].map((priority) => <option key={priority}>{priority}</option>)}</select>
            </label>
            <label className="text-sm">Assignment maximum marks (optional)
              <input type="number" min="0.5" max="1000" step="0.5" className={`${input} mt-1 w-full`} value={form.maxMarks} onChange={(event) => setForm({ ...form, maxMarks: event.target.value })} />
            </label>
            <label className="text-sm">
              Deadline (Asia/Kolkata)
              <input
                required
                type="datetime-local"
                className={`${input} mt-1 w-full`}
                value={form.deadline}
                onChange={(event) =>
                  setForm({ ...form, deadline: event.target.value })
                }
              />
            </label>
            <label className="text-sm">
              Fixed points
              <input
                required
                type="number"
                min="1"
                max="1000"
                className={`${input} mt-1 w-full`}
                value={form.points}
                onChange={(event) =>
                  setForm({ ...form, points: event.target.value })
                }
              />
            </label>
            <button
              disabled={write.pending}
              className={`${primary} sm:col-span-2`}
            >
              Publish task
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
