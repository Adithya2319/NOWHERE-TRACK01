import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import RecordMap from "../components/RecordMap";
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

export default function RidesPage({ data, onRefresh }) {
  const [params, setParams] = useSearchParams();
  const selected = params.get("ride");
  const setSelected = (id) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("ride", id);
      return next;
    }, { replace: true });
  };
  const [date, setDate] = useState("");
  const [view, setView] = useState('all');
  const [review, setReview] = useState(null);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  const [form, setForm] = useState({
    pickup: "",
    dropoff: "",
    date: localDate(),
    departure: "17:45",
    capacity: 2,
    bufferMinutes: 15,
    costNote: "",
  });
  const write = useWrite(onRefresh);
  const approved =
    (typeof data.me.membership === "object"
      ? data.me.membership.status
      : data.me.membership) === "approved";
  const myRide = ride => ride.ownerId === data.me.id || (ride.requests || []).some(request => request.riderId === data.me.id);
  const activeBookings = data.rides.filter(ride => (ride.requests || []).some(request => request.riderId === data.me.id && request.status === 'confirmed') && Date.parse(ride.start) > now).length;
  const rides = data.rides.filter((ride) => (!date || ride.date === date) && (view === 'all' || myRide(ride)));
  const previewRequest = async (ride) => {
    const result = await write.run(
      "/rides/preview",
      { rideId: ride.id },
      "POST",
      "Review this ride against your current plan.",
    );
    if (result)
      setReview({
        title: ride.instantDemo ? 'simulated ride booking' : "ride request",
        demo: Boolean(ride.instantDemo),
        result,
        path: `/rides/${ride.id}/requests`,
        body: { version: result.version ?? ride.version },
      });
  };
  const previewConfirm = async (ride, request) => {
    const result = await write.run(
      `/requests/${request.id}/preview`,
      {},
      "POST",
      "Review the rider’s current conflicts before confirming.",
    );
    if (result)
      setReview({
        title: `request from ${request.riderName}`,
        result,
        path: `/requests/${request.id}`,
        body: { action: "confirm", version: result.version ?? ride.version },
      });
  };
  const commit = async () => {
    const result = await write.run(review.path, {
      ...review.body,
      previewToken: review.result.previewToken,
      acknowledgeConflicts: true,
    }, 'POST', review.demo ? 'DEMO booking confirmed. One simulated seat reserved; no real transport is arranged.' : 'Saved on the server.');
    if (result) {
      setReview(null);
      if (review.path === "/rides")
        setForm({ ...form, pickup: "", dropoff: "", costNote: "" });
    }
  };
  const create = async (event) => {
    event.preventDefault();
    const body = {
      ...form,
      capacity: Number(form.capacity),
      bufferMinutes: Number(form.bufferMinutes),
    };
    const result = await write.run(
      "/rides/offer-preview",
      body,
      "POST",
      "Review the offer against your day plan before saving.",
    );
    if (result)
      setReview({ title: "ride offer", result, path: "/rides", body });
  };
  return (
    <div className="space-y-6">
      <section className={panel}>
        <h1 className="font-display text-4xl">Rides, with room to plan.</h1>
        <p className="my-3 text-sm">
          Available → Requested → Confirmed. Pending requests do not reserve a
          seat. Confirmation reserves one seat; cancellation releases it. No
          payments or live tracking.
        </p>
        {data.me.demo && <p className="my-3 rounded-md border border-ochre/50 p-3 text-sm"><strong>DEMO simulation.</strong> Book a marked example ride to reserve a simulated seat immediately after conflict review. No transport is arranged, no money is charged, and driver names are fictional.</p>}
        <div className="my-4 flex flex-wrap gap-2" aria-label="Ride views">
          <button className={button} aria-pressed={view === 'all'} onClick={() => setView('all')}>All rides</button>
          <button className={button} aria-pressed={view === 'my'} onClick={() => setView('my')}>My Rides ({activeBookings} upcoming bookings)</button>
        </div>
        {!approved && (
          <p className="my-3 text-sm text-signal">
            Approved campus membership is needed to offer or request rides.{" "}
            <Link className="underline" to="/profile">
              Request review in Profile
            </Link>
            .
          </p>
        )}
        <label className="text-sm">
          Filter date{" "}
          <input
            aria-label="Filter ride date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className={input}
          />
        </label>
        {date && (
          <button className={`${button} ml-2`} onClick={() => setDate("")}>
            All dates
          </button>
        )}
        <Feedback {...write} />
      </section>
      <RecordMap
        records={rides}
        selected={selected}
        onSelect={setSelected}
        label="Ride pickup map"
      />
      <section className="grid gap-4 xl:grid-cols-2">
        {!rides.length && (
          <p className={panel}>No ride offers match this date.</p>
        )}
        {rides.map((ride) => {
          const owner = ride.ownerId === data.me.id;
          const requests = ride.requests || [];
          const ownRequest = [...requests]
            .reverse()
            .find((request) => request.riderId === data.me.id);
          const active =
            ownRequest && ["pending", "confirmed"].includes(ownRequest.status);
          const past =
            new Date(
              ride.start || `${ride.date}T${ride.departure}:00+05:30`,
            ).getTime() <= now;
          return (
            <article
              id={`ride-${ride.id}`}
              key={ride.id}
              className={`${panel} ${selected === ride.id ? "ring-2 ring-ink" : ""}`}
            >
              {ride.demo && <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ochre">DEMO · simulated ride</p>}
              <button
                className="text-left font-display text-3xl underline decoration-ink/20"
                onClick={() => setSelected(ride.id)}
              >
                {ride.pickup} → {ride.dropoff}
              </button>
              <p className="mt-2 text-sm">
                {ride.ownerName} · {ride.date} ·{" "}
                {ride.departure || timeRange(ride.start, ride.end)}
              </p>
              <p className="mt-1 text-sm">
                {ride.remainingSeats}/{ride.capacity} seats available ·{" "}
                {ride.bufferMinutes} minute travel buffer · {ride.status}
              </p>
              {ride.costNote && (
                <p className="mt-2 text-sm">Cost note: {ride.costNote}</p>
              )}
              <p className="mt-2 text-xs text-ink/60">
                {past
                  ? "Departure has passed; retained as history."
                  : owner
                    ? "Your ride offer"
                    : active
                      ? ownRequest.status === "confirmed"
                        ? "Confirmed — in your day plan"
                        : "Requested — waiting for the driver"
                      : ownRequest
                        ? `Previous request: ${ownRequest.status}`
                        : "Available"}
              </p>
              {!owner && !active && !past && ride.remainingSeats > 0 && (
                <button
                  disabled={
                    write.pending || !approved || ride.status !== "available"
                  }
                  className={`${button} mt-4`}
                  onClick={() => previewRequest(ride)}
                >
                  {ride.instantDemo ? 'Book DEMO Ride' : 'Review and request'}
                </button>
              )}
              {!owner && !active && !past && ride.remainingSeats <= 0 && <button disabled className={`${button} mt-4`}>Ride full</button>}
              {!owner && active && (
                <button
                  disabled={write.pending}
                  className={`${button} mt-4`}
                  onClick={() =>
                    write.run(
                      `/requests/${ownRequest.id}`,
                      { action: "cancel" },
                      "POST",
                      "Request cancelled. Any reserved seat is released.",
                    )
                  }
                >
                  Cancel{" "}
                  {ownRequest.status === "confirmed" ? "booking" : "request"}
                </button>
              )}
              {owner && (
                <div className="mt-4 border-t border-ink/15 pt-3">
                  <h3 className="text-sm font-semibold">Incoming requests</h3>
                  {!requests.length && (
                    <p className="my-2 text-sm">No requests yet.</p>
                  )}
                  {requests.map((request) => (
                    <div
                      className="my-3 rounded-md border border-ink/15 p-3"
                      key={request.id}
                    >
                      <p className="text-sm">
                        {request.riderName} · {request.status}
                      </p>
                      {request.status === "pending" && (
                        <>
                          <p className="mt-1 text-xs text-ink/60">
                            Expires{" "}
                            {new Date(request.expiresAt).toLocaleString(
                              "en-IN",
                              { timeZone: "Asia/Kolkata" },
                            )}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              disabled={write.pending || !approved || past}
                              className={button}
                              onClick={() => previewConfirm(ride, request)}
                            >
                              Review and confirm
                            </button>
                            <button
                              disabled={write.pending}
                              className={button}
                              onClick={() =>
                                write.run(`/requests/${request.id}`, {
                                  action: "reject",
                                })
                              }
                            >
                              Reject
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </section>
      <section className={panel}>
        <h2 className="font-display text-3xl">Offer a ride</h2>
        <form onSubmit={create} className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            Pickup
            <input
              required
              maxLength={100}
              className={`${input} mt-1 w-full`}
              value={form.pickup}
              onChange={(event) =>
                setForm({ ...form, pickup: event.target.value })
              }
            />
          </label>
          <label className="text-sm">
            Drop-off
            <input
              required
              maxLength={100}
              className={`${input} mt-1 w-full`}
              value={form.dropoff}
              onChange={(event) =>
                setForm({ ...form, dropoff: event.target.value })
              }
            />
          </label>
          <label className="text-sm">
            Date
            <input
              type="date"
              required
              className={`${input} mt-1 w-full`}
              value={form.date}
              onChange={(event) =>
                setForm({ ...form, date: event.target.value })
              }
            />
          </label>
          <label className="text-sm">
            Departure (Asia/Kolkata)
            <input
              type="time"
              required
              className={`${input} mt-1 w-full`}
              value={form.departure}
              onChange={(event) =>
                setForm({ ...form, departure: event.target.value })
              }
            />
          </label>
          <label className="text-sm">
            Passenger capacity
            <input
              type="number"
              min="1"
              max="8"
              required
              className={`${input} mt-1 w-full`}
              value={form.capacity}
              onChange={(event) =>
                setForm({ ...form, capacity: event.target.value })
              }
            />
          </label>
          <label className="text-sm">
            Travel buffer (minutes)
            <input
              type="number"
              min="0"
              max="120"
              required
              className={`${input} mt-1 w-full`}
              value={form.bufferMinutes}
              onChange={(event) =>
                setForm({ ...form, bufferMinutes: event.target.value })
              }
            />
          </label>
          <label className="text-sm sm:col-span-2">
            Optional cost note
            <input
              maxLength={200}
              className={`${input} mt-1 w-full`}
              value={form.costNote}
              onChange={(event) =>
                setForm({ ...form, costNote: event.target.value })
              }
            />
          </label>
          <button
            disabled={write.pending || !approved}
            className={`${primary} sm:col-span-2`}
          >
            {write.pending ? "Saving…" : "Create shared ride offer"}
          </button>
        </form>
      </section>
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
