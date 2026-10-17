import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { useSharedStore } from "../store/useSharedStore";
import { button, Feedback, input, primary } from "../components/SharedUI";
import DemoControls from "../components/DemoControls";

export default function LoginPage() {
  const navigate = useNavigate();
  const authNotice = useSharedStore((state) => state.authNotice);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api("/auth/status", { signal: controller.signal })
      .then(setStatus)
      .catch((failure) => {
        if (failure.name !== "AbortError") setError(failure.message);
      });
    return () => controller.abort();
  }, [retry]);
  const enter = async (path, body) => {
    setPending(true);
    setError("");
    useSharedStore.getState().clear();
    try {
      await api(path, { method: "POST", body });
      await useSharedStore.getState().refresh();
      navigate("/", { replace: true });
    } catch (failure) {
      setError(failure.message);
    } finally {
      setPending(false);
    }
  };
  const send = async (event) => {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await api("/auth/otp/send", { method: "POST", body: { phone } });
      setSent(true);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 py-12 text-ink">
      <section className="w-full max-w-md rounded-[2rem] border border-ink/15 bg-[#F7F3EA] p-6 shadow-[8px_8px_0_0_rgba(20,19,15,1)]">
        <h1 className="font-display text-5xl">Campus360</h1>
        <p className="my-3 text-sm text-ink/70">Your campus day, connected.</p>
        {!status && !error && <p role="status">Connecting to the server…</p>}
        {status?.authMode === "demo" ? (
          <>
            <p className="my-4 rounded-md border border-ochre/50 p-3 text-sm">
              <strong>Local accounts.</strong> Accounts and saved records stay
              on this server. No phone or college identity verification occurs.
            </p>
            <div className="space-y-3">
              <DemoControls login demo={{ ...status.demoStatus, enabled: status.demoToolsEnabled }} onRefresh={async () => setStatus(await api("/auth/status"))} />
              {(status.demoAccounts || []).map((account) => (
                <button
                  key={account.id}
                  aria-label={`Enter as ${account.name}${account.demo && !account.name.includes('DEMO') ? ' · DEMO' : ''}`}
                  disabled={pending}
                  className={`${button} w-full text-left`}
                  onClick={() => enter("/auth/demo", { userId: account.id })}
                >
                  Enter as {account.name}
                  {account.demo && <span className="ml-2 rounded border border-ochre/60 px-1 text-[10px]">DEMO</span>}
                  <span className="mt-1 block text-xs opacity-70">
                    {account.role || "Student"} {account.classId || ""}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          status && (
            <>
              <p className="my-4 text-sm">
                MiniMoth phone verification{" "}
                {status.configured
                  ? "is configured on the server."
                  : "is not configured. Set the server credentials before signing in."}{" "}
                Phone control does not verify student enrollment.
              </p>
              <form onSubmit={send} className="space-y-3">
                <label className="block text-sm">
                  Phone number
                  <input
                    type="tel"
                    required
                    autoComplete="tel"
                    className={`${input} mt-1 w-full`}
                    value={phone}
                    placeholder="+91…"
                    onChange={(event) => setPhone(event.target.value)}
                  />
                </label>
                <button
                  disabled={pending || !status.configured}
                  className={`${primary} w-full`}
                >
                  {pending ? "Please wait…" : sent ? "Resend OTP" : "Send OTP"}
                </button>
              </form>
              {sent && (
                <form
                  className="mt-4 space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    enter("/auth/otp/verify", { phone, code });
                  }}
                >
                  <label className="block text-sm">
                    Verification code
                    <input
                      required
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      className={`${input} mt-1 w-full`}
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                    />
                  </label>
                  <button disabled={pending} className={`${primary} w-full`}>
                    Verify and enter
                  </button>
                </form>
              )}
            </>
          )
        )}
        <Feedback error={error || authNotice} />
        {!status && error && (
          <button
            className={button}
            onClick={() => {
              setError("");
              setRetry((value) => value + 1);
            }}
          >
            Retry connection
          </button>
        )}
        <div className="mt-6 flex flex-wrap gap-4 text-xs underline">
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/cookies">Cookies</Link>
        </div>
      </section>
    </div>
  );
}
