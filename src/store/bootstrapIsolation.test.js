import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../services/api";
import { useSharedStore } from "./useSharedStore";

vi.mock("../services/api", () => ({ api: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  useSharedStore.getState().clear();
});

describe("authentication bootstrap isolation", () => {
  it("does not fetch private state after logout while /me was pending", async () => {
    let resolve;
    api.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const pending = useSharedStore.getState().bootstrap();
    useSharedStore.getState().clear();
    resolve({ me: { id: "previous-account" } });
    await pending;
    expect(api).toHaveBeenCalledTimes(1);
    expect(useSharedStore.getState()).toMatchObject({ data: null, status: "anonymous" });
  });

  it("does not let an old bootstrap failure clear a newly signed-in account", async () => {
    let reject;
    api.mockImplementationOnce(() => new Promise((_resolve, done) => { reject = done; }));
    const pending = useSharedStore.getState().bootstrap();
    useSharedStore.getState().clear();
    useSharedStore.setState({ data: { me: { id: "new-account" } }, status: "ready" });
    reject(Object.assign(new Error("Sign in again"), { status: 401 }));
    await pending;
    expect(useSharedStore.getState().data.me.id).toBe("new-account");
    expect(useSharedStore.getState().status).toBe("ready");
  });

  it("loads current authenticated state after a valid bootstrap", async () => {
    api.mockResolvedValueOnce({ authenticated: true });
    api.mockResolvedValueOnce({ me: { id: "current-account" } });
    await useSharedStore.getState().bootstrap();
    expect(useSharedStore.getState()).toMatchObject({
      data: { me: { id: "current-account" } }, status: "ready",
    });
  });
});
