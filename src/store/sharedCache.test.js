import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../services/api";
import { useSharedStore } from "./useSharedStore";

const json = (value, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => "application/json" },
  json: async () => value,
});
beforeEach(() => {
  useSharedStore.getState().clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});
describe("shared API cache", () => {
  it("propagates unavailable mutations and never fabricates a successful local record", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ error: "Database unavailable" }, 503)),
    );
    await expect(
      api("/attendance", { method: "POST", body: { present: true } }),
    ).rejects.toMatchObject({ status: 503, message: "Database unavailable" });
    expect(useSharedStore.getState().data).toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      "/api/attendance",
      expect.objectContaining({
        credentials: "same-origin",
        body: '{"present":true}',
      }),
    );
  });
  it("clears private account data when the server expires a session", async () => {
    useSharedStore.setState({
      data: { me: { id: "private-account" } },
      status: "ready",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ error: "Sign in again" }, 401)),
    );
    await expect(useSharedStore.getState().refresh()).rejects.toMatchObject({
      status: 401,
    });
    expect(useSharedStore.getState()).toMatchObject({
      data: null,
      status: "anonymous",
    });
  });
  it("ignores a delayed account response after logout", async () => {
    let resolve;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      ),
    );
    const pending = useSharedStore.getState().refresh();
    useSharedStore.getState().clear();
    resolve(json({ me: { id: "old-account" } }));
    await pending;
    expect(useSharedStore.getState()).toMatchObject({
      data: null,
      status: "anonymous",
    });
  });
  it("keeps the newest refresh when a slower earlier response arrives last", async () => {
    const resolve = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((done) => {
            resolve.push(done);
          }),
      ),
    );
    const first = useSharedStore.getState().refresh();
    const second = useSharedStore.getState().refresh();
    resolve[1](json({ me: { id: "new-version" } }));
    await second;
    resolve[0](json({ me: { id: "old-version" } }));
    await first;
    expect(useSharedStore.getState().data.me.id).toBe("new-version");
  });
});
