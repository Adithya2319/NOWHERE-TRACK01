import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
} from "react-router-dom";
import {
  Bell,
  CarFront,
  ChartColumn,
  GraduationCap,
  LogOut,
  Phone,
  UserRound,
  Users,
  BriefcaseBusiness,
} from "lucide-react";
import { useSharedStore } from "./store/useSharedStore";
import { api } from "./services/api";
import { button, Feedback, panel } from "./components/SharedUI";
import LoginPage from "./pages/LoginPage";
import TodayPage from "./pages/TodayPage";
import AcademicPage from "./pages/AcademicPage";
import AttendancePage from "./pages/AttendancePage";
import RidesPage from "./pages/RidesPage";
import ClassBoardPage from "./pages/ClassBoardPage";
import DirectoryPage from "./pages/DirectoryPage";
import ProfilePage from "./pages/ProfilePage";
import NotificationCenter from "./components/NotificationCenter";

const navItems = [
  { to: "/", label: "Today", icon: ChartColumn },
  { to: "/attendance", label: "Attendance", icon: BriefcaseBusiness },
  { to: "/marks", label: "Marks", icon: GraduationCap },
  { to: "/rides", label: "Rides", icon: CarFront },
  { to: "/leaderboard", label: "Class board", icon: Users },
  { to: "/directory", label: "Directory", icon: Phone },
  { to: "/updates", label: "Schedule", icon: Bell },
  { to: "/profile", label: "Profile", icon: UserRound },
];
function BoundPage({ component: Component, ...props }) {
  const data = useSharedStore((state) => state.data);
  const refresh = useSharedStore((state) => state.refresh);
  return <Component data={data} onRefresh={refresh} {...props} />;
}
function ProtectedLayout() {
  const { data, status, error, bootstrap, refresh, clear } = useSharedStore();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    bootstrap(controller.signal);
    return () => controller.abort();
  }, [bootstrap]);
  const authenticated = Boolean(data);
  useEffect(() => {
    if (!authenticated) return undefined;
    let controller = new AbortController();
    const reload = () => {
      if (document.visibilityState === "hidden") return;
      controller.abort();
      controller = new AbortController();
      refresh(controller.signal).catch(() => {});
    };
    window.addEventListener("focus", reload);
    const timer = window.setInterval(reload, 15000);
    return () => {
      window.removeEventListener("focus", reload);
      window.clearInterval(timer);
      controller.abort();
    };
  }, [authenticated, refresh]);
  if (status === "anonymous") return <Navigate to="/login" replace />;
  if (!data)
    return (
      <div className="mx-auto max-w-lg px-5 py-16">
        <h1 className="font-display text-5xl">Campus360</h1>
        {status === "loading" ? (
          <p className="mt-4" role="status">
            Loading your shared day plan…
          </p>
        ) : (
          <>
            <Feedback error={error} />
            <button className={button} onClick={() => bootstrap()}>
              Retry connection
            </button>
            <Link className="ml-4 underline" to="/login">
              Sign in
            </Link>
          </>
        )}
      </div>
    );
  const logout = async () => {
    setLoggingOut(true);
    setLogoutError("");
    try {
      await api("/auth/logout", { method: "POST", body: {} });
      clear();
    } catch (failure) {
      if (failure.details?.loggedOut)
        clear(
          `Your app session ended. Provider logout could not be confirmed: ${failure.message}`,
        );
      else setLogoutError(failure.message);
    } finally {
      setLoggingOut(false);
    }
  };
  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="mx-auto flex max-w-[1600px]">
        <aside className="hidden min-h-screen w-64 shrink-0 border-r border-ink/10 lg:flex lg:flex-col">
          <div className="border-b border-ink/10 px-6 py-5">
            <div className="font-display text-4xl">Campus360</div>
            <p className="mt-2 text-xs uppercase tracking-[0.24em] text-ink/50">
              VESIT · FE
            </p>
          </div>
          <nav aria-label="Main navigation" className="flex-1 space-y-2 p-4">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                end={to === "/"}
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-md border px-4 py-3 text-sm ${isActive ? "border-ink bg-ink text-paper shadow-[4px_4px_0_0_rgba(20,19,15,0.3)]" : "border-transparent hover:border-ink/20"}`
                }
              >
                <Icon size={18} />
                {label}
              </NavLink>
            ))}
          </nav>
          <button
            disabled={loggingOut}
            className={`${button} m-5 flex items-center justify-between`}
            onClick={logout}
          >
            {loggingOut ? "Signing out…" : "Log out"}
            <LogOut size={16} />
          </button>
        </aside>
        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-ink/10 bg-paper/95 px-4 py-4 backdrop-blur-sm sm:px-6">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-3xl">What needs you now</p>
                <p className="text-xs text-ink/60">
                  {data.me.name} ·{" "}
                  {data.classes.find((group) => group.id === data.me.classId)
                    ?.name || "Class not selected"}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
              <span className="rounded-full border border-ink/15 px-2 py-1 text-[10px] sm:px-3 sm:py-2 sm:text-xs">
                {data.me.demo ? "DEMO account" : data.config.authMode === "demo"
                  ? "Local workspace"
                  : data.me.phoneVerified
                    ? "Phone verified"
                    : "Phone unverified"}
              </span>
              <NotificationCenter notifications={data.notifications} onRefresh={refresh} />
              </div>
            </div>
          </header>
          <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 pb-32 sm:px-6 lg:px-8 lg:pb-8">
            {error && (
              <div className={panel}>
                <Feedback
                  error={`Connection interrupted. The displayed records may be out of date. ${error}`}
                />
                <button
                  className={button}
                  onClick={() => refresh().catch(() => {})}
                >
                  Retry refresh
                </button>
              </div>
            )}
            <Feedback error={logoutError} />
            {!data.me.onboarding ? (
              <ProfilePage data={data} onRefresh={refresh} onboarding />
            ) : (
              <Outlet />
            )}
          </div>
        </main>
      </div>
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 flex gap-1 overflow-x-auto border-t border-ink/15 bg-paper px-2 py-2 lg:hidden"
      >
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            end={to === "/"}
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex min-w-[72px] shrink-0 flex-col items-center gap-1 rounded-md px-2 py-2 text-[10px] ${isActive ? "bg-ink text-paper" : "text-ink/70"}`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
        <button
          disabled={loggingOut}
          className="min-w-[72px] shrink-0 text-[10px]"
          onClick={logout}
        >
          <LogOut className="mx-auto mb-1" size={18} />
          Log out
        </button>
      </nav>
    </div>
  );
}
function LegalPage({ type }) {
  const copy = {
    terms: [
      "Terms",
      "Campus360 supports student planning. Academic calculations and self-reported attendance do not replace official results or college decisions. Sample schedules, people, contacts, locations and membership approvals are illustrative. Confirm important plans with the people involved.",
    ],
    privacy: [
      "Privacy",
      "Shared application records are stored in the server SQLite database. Your marks are private to your account. Class events, ride offers and approved class points are shared within their permitted scope. Moderators review membership and task submissions. In provider mode, phone identity and provider tokens are handled on the server. Contact the deployment operator to request account or record deletion.",
    ],
    cookies: [
      "Cookies",
      "Campus360 uses an HttpOnly session cookie to keep you signed in. Logging out revokes the application session and clears the current browser cache. No optional advertising or analytics cookies are enabled by this application. Older browser-only records remain on this device until you choose to remove them.",
    ],
  };
  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      <h1 className="font-display text-5xl">{copy[type][0]}</h1>
      <p className="my-6 leading-8">{copy[type][1]}</p>
      <Link to="/login" className="underline">
        Back to sign in
      </Link>
    </main>
  );
}
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<BoundPage component={TodayPage} />} />
          <Route
            path="/attendance"
            element={<BoundPage component={AttendancePage} />}
          />
          <Route
            path="/marks"
            element={<BoundPage component={AcademicPage} />}
          />
          <Route path="/rides" element={<BoundPage component={RidesPage} />} />
          <Route
            path="/leaderboard"
            element={<BoundPage component={ClassBoardPage} />}
          />
          <Route
            path="/updates"
            element={<BoundPage component={TodayPage} scheduleOnly />}
          />
          <Route
            path="/directory"
            element={<BoundPage component={DirectoryPage} />}
          />
          <Route
            path="/profile"
            element={<BoundPage component={ProfilePage} />}
          />
        </Route>
        {["terms", "privacy", "cookies"].map((type) => (
          <Route
            key={type}
            path={`/${type}`}
            element={<LegalPage type={type} />}
          />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
