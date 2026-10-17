import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

const json = (value) => ({
  ok: true,
  status: 200,
  headers: { get: () => "application/json" },
  json: async () => value,
});
const untilAborted = (_path, { signal }) =>
  new Promise((_resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("API request lifecycle", () => {
  it("bounds a stalled save and warns that it may have reached the server", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(untilAborted));
    const pending = api("/attendance", { method: "POST", body: {} });
    const failure = expect(pending).rejects.toMatchObject({
      name: "TimeoutError",
      message: expect.stringContaining("may already have been saved"),
    });
    await vi.advanceTimersByTimeAsync(20000);
    await failure;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps caller cancellation distinct from server timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(untilAborted));
    const controller = new AbortController();
    const pending = api("/today", { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("removes its timer after a successful response", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ saved: true })));
    await expect(api("/state")).resolves.toEqual({ saved: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports invalid JSON as an unreadable response without claiming a saved action failed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ...json(null),
      json: async () => { throw new SyntaxError("Unexpected end of JSON"); },
    }));
    await expect(api("/state")).rejects.toThrow("refresh your records before repeating an action");
  });
});
