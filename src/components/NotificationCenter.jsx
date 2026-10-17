import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { button, Feedback, useWrite } from "./SharedUI";

export default function NotificationCenter({ notifications = [], onRefresh }) {
  const unread = notifications.filter((item) => !item.readAt).length;
  const write = useWrite(onRefresh);
  return (
    <details className="relative">
      <summary aria-label={`Notifications (${unread} unread)`} className={`${button} flex cursor-pointer list-none items-center gap-2`}>
        <Bell size={18} aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">Notifications</span>
        <span aria-hidden="true" className="min-w-4 text-center text-xs">{unread}</span>
      </summary>
      <section aria-label="Notifications" className="absolute -right-4 top-full z-30 mt-3 max-h-[70vh] w-[min(360px,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-ink/20 bg-paper p-4 shadow-lg sm:right-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-2xl">Notifications</h2>
          <button disabled={!unread || write.pending} className={`${button} text-xs`} onClick={() => write.run("/notifications/read-all", {}, "POST", "All notifications marked read.")}>Mark all read</button>
        </div>
        <Feedback {...write} />
        {!notifications.length && <p className="mt-4 text-sm">You’re all caught up. Updates from your campus actions will appear here.</p>}
        {notifications.map((item) => {
          const safeLink = typeof item.link === "string" && item.link.startsWith("/") && !item.link.startsWith("//") && !/[\\\r\n]/.test(item.link) ? item.link : null;
          return (
            <article key={item.id} className={`mt-3 rounded-lg border p-3 ${item.readAt ? "border-ink/10" : "border-ochre/60 bg-ochre/5"}`}>
              <p className="text-sm font-semibold">{item.title} {item.demo && <span className="text-[10px] text-ink/60">DEMO</span>}</p>
              <p className="mt-1 text-xs leading-5">{item.body}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                {safeLink && <Link className="underline" to={safeLink} onClick={() => { if (!item.readAt) write.run(`/notifications/${item.id}/read`, { read: true }); }}>Open related page</Link>}
                <button className="underline disabled:opacity-50" disabled={write.pending} aria-label={`Mark ${item.title} as ${item.readAt ? "unread" : "read"}`} onClick={() => write.run(`/notifications/${item.id}/read`, { read: !item.readAt })}>
                  Mark {item.readAt ? "unread" : "read"}
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </details>
  );
}
