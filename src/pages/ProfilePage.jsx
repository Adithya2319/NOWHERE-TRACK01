import { useState } from "react";
import { useNavigate } from "react-router-dom";
import DemoControls from "../components/DemoControls";
import {
  button,
  Feedback,
  input,
  panel,
  primary,
  useWrite,
} from "../components/SharedUI";

export default function ProfilePage({ data, onRefresh, onboarding = false }) {
  const { me, classes } = data;
  const navigate = useNavigate();
  const [draft, setDraft] = useState(() => ({
    name: me.name,
    classId: me.classId || classes[0]?.id || "",
    subjects: (me.subjects || []).join(", "),
    interests: (me.interests || []).join(", "),
    contactPreferences: {
      emailNotifications: Boolean(me.contactPreferences?.emailNotifications),
      pushNotifications: Boolean(me.contactPreferences?.pushNotifications),
      preferredContact: "in-app",
    },
  }));
  const write = useWrite(onRefresh);
  const save = async (event) => {
    event.preventDefault();
    const list = (value) =>
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    await write.run(
      "/profile",
      {
        ...draft,
        subjects: list(draft.subjects),
        interests: list(draft.interests),
      },
      "PUT",
      "Profile saved. Your day plan and suggestions use these subjects and interests.",
    );
  };
  const membership =
    typeof me.membership === "object" ? me.membership.status : me.membership;
  const enterDemo = async () => {
    const result = await write.run("/auth/demo", { userId: data.demo.studentId }, "POST", "Entered the DEMO account.");
    if (result) navigate("/", { replace: true });
  };
  return (
    <div className="space-y-6">
      {!onboarding && <DemoControls demo={data.demo} accountDemo={me.demo || data.demo?.account} onRefresh={onRefresh} onEnter={enterDemo} />}
      <section className={panel}>
        <h1 className="font-display text-4xl">
          {onboarding ? "Make Campus360 yours" : "Your profile"}
        </h1>
        <p className="my-3 text-sm">
          {onboarding
            ? "Complete your profile before opening the shared day plan."
            : "Your account stays the same when you edit your profile."}{" "}
          {data.config.collegeName || "VESIT"} · {me.role}
        </p>
        <p className="mb-4 break-all text-xs text-ink/60">Account ID: {me.id}</p>
        {me.academicDetails && Object.keys(me.academicDetails).length > 0 && (
          <dl className="mb-5 grid grid-cols-2 gap-3 rounded-xl border border-ink/10 p-4 text-sm sm:grid-cols-3">
            {[["College", me.academicDetails.college], ["Year", me.academicDetails.year], ["Branch", me.academicDetails.branch], ["Division", me.academicDetails.division], ["Semester", me.academicDetails.semester], ["Academic year", me.academicDetails.academicYear]].filter(([, value]) => value != null && value !== "").map(([label, value]) => (
              <div className="min-w-0" key={label}><dt className="text-xs text-ink/60">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>
            ))}
          </dl>
        )}
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            Name
            <input
              required
              maxLength={80}
              value={draft.name}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
              className={`${input} mt-1 w-full`}
            />
          </label>
          <label className="text-sm">
            Class / division
            <select
              required
              disabled={membership === "approved"}
              value={draft.classId}
              onChange={(event) =>
                setDraft({ ...draft, classId: event.target.value })
              }
              className={`${input} mt-1 w-full`}
            >
              {classes.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            {membership === "approved" && (
              <span className="mt-1 block text-xs text-ink/60">
                Approved class changes require moderator review.
              </span>
            )}
          </label>
          <label className="text-sm">
            Subjects (comma separated)
            <input
              value={draft.subjects}
              onChange={(event) =>
                setDraft({ ...draft, subjects: event.target.value })
              }
              className={`${input} mt-1 w-full`}
              placeholder="Mathematics, Programming"
            />
          </label>
          <label className="text-sm">
            Interests (comma separated)
            <input
              value={draft.interests}
              onChange={(event) =>
                setDraft({ ...draft, interests: event.target.value })
              }
              className={`${input} mt-1 w-full`}
              placeholder="Robotics, design"
            />
          </label>
          <fieldset className="space-y-3 rounded-xl border border-ink/15 p-4 text-sm sm:col-span-2">
            <legend className="px-1 font-semibold">Contact preferences</legend>
            <p className="text-xs text-ink/60">Updates appear in your in-app notifications. Email and push choices are saved preferences; no external messages are sent.</p>
            <label className="flex items-center gap-2"><input type="checkbox" checked={draft.contactPreferences.emailNotifications} onChange={(event) => setDraft({ ...draft, contactPreferences: { ...draft.contactPreferences, emailNotifications: event.target.checked } })} />Email update preference</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={draft.contactPreferences.pushNotifications} onChange={(event) => setDraft({ ...draft, contactPreferences: { ...draft.contactPreferences, pushNotifications: event.target.checked } })} />Push update preference</label>
            <p className="text-xs">Current contact channel: In-app</p>
          </fieldset>
          <button
            disabled={write.pending}
            className={`${primary} sm:col-span-2`}
          >
            {write.pending
              ? "Saving…"
              : onboarding
                ? "Save and open my day"
                : "Save profile"}
          </button>
        </form>
        <Feedback {...write} />
      </section>
      <section className={panel}>
        <h2 className="font-display text-3xl">Campus membership</h2>
        <p className="my-3 text-sm">
          Phone control: {me.phoneVerified ? "verified" : "unverified"}.
          Membership: <strong>{membership || "unverified"}</strong>. Enrollment
          approval is reviewed separately by a moderator. Sample approvals do
          not certify college enrollment.
        </p>
        {membership !== "approved" && membership !== "pending" && (
          <button
            disabled={write.pending}
            className={button}
            onClick={() =>
              write.run(
                "/membership/request",
                {},
                "POST",
                "Membership review requested.",
              )
            }
          >
            Request membership review
          </button>
        )}
        {membership === "pending" && (
          <p role="status">Awaiting moderator review.</p>
        )}
      </section>
      {me.role === "moderator" && (
        <section className={panel}>
          <h2 className="font-display text-3xl">Membership review</h2>
          {!(data.members || []).length && (
            <p className="my-3">No memberships to review.</p>
          )}
          {(data.members || []).map((member) => (
            <div
              key={member.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 py-3"
            >
              <span>
                {member.name} ·{" "}
                {typeof member.membership === "object"
                  ? member.membership.status
                  : member.membership}
              </span>
              <div className="flex gap-2">
                <button
                  className={button}
                  disabled={write.pending}
                  onClick={() =>
                    write.run(`/membership/${member.id}`, {
                      status: "approved",
                    })
                  }
                >
                  Approve
                </button>
                <button
                  className={button}
                  disabled={write.pending}
                  onClick={() =>
                    write.run(`/membership/${member.id}`, {
                      status: "rejected",
                    })
                  }
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
