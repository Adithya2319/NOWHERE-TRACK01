import { useId, useState } from "react";
import { attendanceAdvice, forecastAttendance } from "../../shared/attendance.js";
import { button, input } from "./SharedUI";

const planKey = (plan) => JSON.stringify(plan ?? null);
const draftFor = (plan, policyTarget) => ({
  remaining: String(plan?.remaining ?? 10),
  plannedPresent: String(plan?.plannedPresent ?? plan?.remaining ?? 10),
  target: String(plan?.target ?? policyTarget ?? 75),
});
const displayPercentage = (value) => value == null ? "No lectures" : `${value.toFixed(1)}%`;

export default function FutureAttendancePlanner({
  present,
  total,
  policyTarget,
  plan,
  onSave,
  pending = false,
  labelPrefix = "Attendance",
}) {
  const id = useId();
  const [draft, setDraft] = useState(() => draftFor(plan, policyTarget));
  const [loadedPlan, setLoadedPlan] = useState(() => planKey(plan));
  const [saveError, setSaveError] = useState("");
  const [savedDraft, setSavedDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [awaitingRefreshFrom, setAwaitingRefreshFrom] = useState(null);
  const currentPlan = planKey(plan);
  let forecast;
  let advice;
  let validationError = "";
  let normalized;

  try {
    if (Object.values(draft).some((value) => !value.trim())) {
      throw new Error("Enter future lectures, planned attendance and a personal target.");
    }
    normalized = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, Number(value)]));
    forecast = forecastAttendance({ present, total, ...normalized });
    advice = attendanceAdvice(present, total, normalized.target);
  } catch (error) {
    validationError = error.message;
  }

  // A successful write can precede its refresh. Do not offer the previous cached
  // plan as an external change while that refresh is still outstanding.
  if (awaitingRefreshFrom !== null && currentPlan !== awaitingRefreshFrom)
    setAwaitingRefreshFrom(null);

  // Background count refreshes must not erase a student's unfinished plan.
  const changedElsewhere = currentPlan !== loadedPlan && currentPlan !== planKey(normalized) && currentPlan !== awaitingRefreshFrom;
  const saved = savedDraft !== null && savedDraft === planKey(normalized);
  const update = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaveError("");
  };
  const save = async () => {
    if (!forecast || !onSave) return;
    setSaving(true);
    setSaveError("");
    setSavedDraft(null);
    try {
      const result = await onSave(normalized);
      if (result !== null && result !== false) {
        setSavedDraft(planKey(normalized));
        setLoadedPlan(planKey(normalized));
        setAwaitingRefreshFrom(currentPlan === planKey(normalized) ? null : currentPlan);
      }
    } catch (error) {
      setSaveError(error.message || "The attendance plan could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <details className="mt-4 border-t border-ink/10 pt-3">
      <summary className="cursor-pointer font-semibold">Future attendance planner</summary>
      <p className="mt-3 text-xs text-ink/70">
        Personal planning scenarios for this subject and lecture type. {policyTarget == null
          ? "The 75% default is a personal, unverified target; confirm college requirements."
          : "The configured target is a planning rule; verify it with college."}
      </p>
      <div className="my-3 grid gap-3 sm:grid-cols-3">
        {[
          ["remaining", "Future conducted lectures", "1", "0", undefined],
          ["plannedPresent", "Planned attended lectures", "1", "0", Number.isSafeInteger(normalized?.remaining) && normalized.remaining >= 0 ? normalized.remaining : undefined],
          ["target", "Personal attendance target (%)", "any", "0", "100"],
        ].map(([key, label, step, min, max]) => (
          <label key={key} className="min-w-0 text-xs" htmlFor={`${id}-${key}`}>
            {label}
            <input
              id={`${id}-${key}`}
              aria-label={`${labelPrefix}: ${label}`}
              type="number"
              required
              min={min}
              max={max}
              step={step}
              className={`${input} mt-1 w-full min-w-0`}
              value={draft[key]}
              onChange={(event) => update(key, event.target.value)}
            />
          </label>
        ))}
      </div>
      {validationError && <p role="alert" className="text-sm text-signal">{validationError}</p>}
      {forecast && (
        <div aria-live="polite" className="space-y-2 text-sm">
          <p>
            Your plan: attend {normalized.plannedPresent} of the next {normalized.remaining} conducted lectures.
            {" "}Projected attendance: <strong>{displayPercentage(forecast.projectedPercentage)}</strong>
            {" "}({forecast.projectedPresent}/{forecast.projectedTotal}).
          </p>
          {forecast.reachable === true && (
            <p>
              To reach {normalized.target}%, attend at least {forecast.minimumRequired} of these {normalized.remaining} lectures.
              {" "}You may miss at most {forecast.maxMisses} within this plan.
              {forecast.projectedMeetsTarget === false && " Your chosen attendance falls short of this target."}
            </p>
          )}
          {forecast.reachable === false && (
            <p className="text-signal">
              Target unreachable within the next {normalized.remaining} lectures: {forecast.minimumRequired} attended lectures
              {" "}would be required within that window. Attend all to reach {displayPercentage(forecast.allAttendPercentage)}.
            </p>
          )}
          <p>
            Attend-all scenario: {displayPercentage(forecast.allAttendPercentage)}.
            {" "}Continue recorded rate: {forecast.scenarios.recordedRate
              ? `${displayPercentage(forecast.scenarios.recordedRate.percentage)} (assumes your recorded rate continues).`
              : "unavailable until a lecture is recorded."}
          </p>
          {total > 0 && advice.recover > 0 && (
            <p>
              {Number.isFinite(advice.recover)
                ? `Attend ${advice.recover} consecutive future lectures to recover to ${normalized.target}%.`
                : "A 100% target cannot be recovered after an absence."}
            </p>
          )}
          {!forecast.projectedTotal && <p>Add conducted lectures to calculate a percentage.</p>}
        </div>
      )}
      <p className="mt-3 text-xs text-ink/60">
        This arithmetic scenario does not change attendance records. Scheduled or cancelled classes and exam eligibility
        {" "}are not inferred; include only lectures you expect to be conducted. This is not a trained prediction.
      </p>
      {changedElsewhere && (
        <p className="mt-3 text-sm">
          The saved plan changed. Your draft is preserved.{" "}
          <button type="button" className="underline" onClick={() => {
            setDraft(draftFor(plan, policyTarget));
            setLoadedPlan(planKey(plan));
            setSavedDraft(null);
            setAwaitingRefreshFrom(null);
          }}>Reload saved plan</button>
        </p>
      )}
      {onSave && (
        <button
          type="button"
          className={`${button} mt-3 text-sm`}
          disabled={pending || saving || !forecast}
          onClick={save}
        >{saving ? "Saving attendance plan..." : "Save attendance plan"}</button>
      )}
      {saved && <p role="status" className="mt-2 text-sm text-moss">Attendance plan saved.</p>}
      {saveError && <p role="alert" className="mt-2 text-sm text-signal">{saveError}</p>}
    </details>
  );
}
