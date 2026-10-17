/* oxlint-disable react/only-export-components -- These small UI helpers are shared by all connected pages. */
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";

export const panel = "rounded-2xl border border-ink/15 bg-paper p-5";
const control = "rounded-md border border-ink/25 px-3 py-2";
export const input = `${control} bg-paper`;
export const button = `${input} transition hover:bg-ink hover:text-paper disabled:cursor-wait disabled:opacity-50`;
export const primary = `${control} bg-ink text-paper transition hover:bg-moss disabled:cursor-wait disabled:opacity-50`;
export function localDate(date = new Date(), timeZone = "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function timeRange(start, end) {
  const format = (value) =>
    new Date(value).toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
    });
  return `${format(start)}–${format(end)}`;
}
export function useWrite(onRefresh) {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const run = async (
    path,
    body,
    method = "POST",
    success = "Saved on the server.",
  ) => {
    // The ref closes the gap before React re-renders disabled buttons.
    if (inFlight.current) return null;
    inFlight.current = true;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result = await api(path, {
        method,
        ...(body !== undefined ? { body } : {}),
      });
      try {
        await onRefresh?.();
      } catch (refreshError) {
        setError(
          `The server accepted this action, but refreshing the records failed: ${refreshError.message}. Use Retry refresh before repeating it.`,
        );
        return result;
      }
      setNotice(success);
      return result;
    } catch (failure) {
      setError(failure.message);
      if (failure.status === 401 || failure.status === 409) {
        try {
          await onRefresh?.();
        } catch {
          // Keep the original mutation error; the shared cache reports refresh failures.
        }
      }
      return null;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };
  return { pending, error, notice, run, setError };
}
export function Feedback({ error, notice }) {
  return (
    <>
      {error && (
        <p
          role="alert"
          className="my-3 rounded-md border border-signal/30 p-3 text-sm text-signal"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="my-3 text-sm text-moss">
          {notice}
        </p>
      )}
    </>
  );
}
export function ConflictDialog({ review, pending, error, onCancel, onCommit }) {
  const dialog = useRef(null);
  const open = Boolean(review);
  const handleKey = useEffectEvent((event) => {
    if (event.key === "Escape" && !pending) {
      event.preventDefault();
      onCancel();
    }
    if (event.key === "Tab") {
      const controls = dialog.current?.querySelectorAll(
        "button:not([disabled]), a[href]",
      );
      if (!controls?.length) {
        event.preventDefault();
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === dialog.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          document.activeElement === dialog.current ||
          !dialog.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    }
  });
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    const keydown = (event) => handleKey(event);
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus?.();
    };
  }, [open]);
  if (!review) return null;
  const conflicts = review.result.conflicts || [];
  const affected = review.result.affected || [];
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto bg-ink/50 p-4">
      <section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-title"
        tabIndex={-1}
        className={`${panel} max-h-[90vh] w-full max-w-lg overflow-y-auto shadow-[8px_8px_0_0_rgba(20,19,15,1)]`}
      >
        <h2 id="review-title" className="font-display text-3xl">
          Review {review.title}
        </h2>
        {error && (
          <p role="alert" className="my-3 text-sm text-signal">
            {error} Go back and preview the current records again.
          </p>
        )}
        <p className="my-3 text-sm">
          {conflicts.length
            ? "This choice overlaps your day plan. Existing plans stay in place unless you change them yourself."
            : "No conflicts found in the current plan."}
        </p>
        {conflicts.map((item, index) => (
          <div
            key={item.id || index}
            className="my-2 rounded-md border border-signal/30 p-3"
          >
            <strong>{item.title || item.name}</strong>
            {item.start && (
              <p className="text-sm">{timeRange(item.start, item.end)}</p>
            )}
          </div>
        ))}
        {affected.length > 0 && (
          <>
            <h3 className="mt-4 font-semibold">Affected plans</h3>
            {affected.map((item, index) => (
              <p
                className="my-2 text-sm"
                key={`${item.userId || ""}-${item.id || index}`}
              >
                {item.title || item.name || item.userName || "Student plan"}{" "}
                {item.start && timeRange(item.start, item.end)}
              </p>
            ))}
          </>
        )}
        {(review.result.suggestions || []).map((item, index) => (
          <div className="my-2 text-sm" key={`${item.rideId || 'suggestion'}-${index}`}>
            <p>{item.reason || item.title || String(item)}</p>
            {item.rideId && (
              <Link
                className="mt-2 inline-block underline"
                to={`/rides?ride=${item.rideId}`}
              >
                Review this actual ride offer
              </Link>
            )}
            {(item.help || []).map((contact) => (
              <p key={contact.id} className="mt-2">
                <Link
                  className="underline"
                  to={`/directory?contact=${contact.id}`}
                >
                  {contact.name}
                </Link>{" "}
                · Help match for {(contact.interests || []).join(", ")}; no peer
                booking is made.
              </p>
            ))}
          </div>
        ))}
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={pending}
            className={button}
            onClick={onCancel}
          >
            Go back
          </button>
          <button
            type="button"
            disabled={pending}
            className={primary}
            onClick={onCommit}
          >
            {pending
              ? "Saving…"
              : conflicts.length || affected.length
                ? "Acknowledge conflicts and continue"
                : "Confirm and save"}
          </button>
        </div>
      </section>
    </div>
  );
}
