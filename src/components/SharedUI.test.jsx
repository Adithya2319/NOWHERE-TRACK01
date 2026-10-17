import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../services/api";
import { ConflictDialog, Feedback, useWrite } from "./SharedUI";

vi.mock("../services/api", () => ({ api: vi.fn() }));

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

describe("shared write feedback", () => {
  it("prevents duplicate saves before pending buttons have rendered", async () => {
    let resolve;
    api.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const refresh = vi.fn().mockResolvedValue({});
    const { result } = renderHook(() => useWrite(refresh));
    let first;
    let duplicate;
    act(() => {
      first = result.current.run("/attendance", { present: true });
      duplicate = result.current.run("/attendance", { present: true });
    });
    expect(api).toHaveBeenCalledTimes(1);
    expect(await duplicate).toBeNull();
    await act(async () => {
      resolve({ saved: true });
      await first;
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(false);
  });

  it("reports an accepted action with refresh failure without encouraging duplicate writes", async () => {
    api.mockResolvedValue({ saved: true });
    const refresh = vi.fn().mockRejectedValue(new Error("Connection interrupted"));
    const { result } = renderHook(() => useWrite(refresh));
    await act(async () => { await result.current.run("/attendance", {}); });
    render(<Feedback error={result.current.error} notice={result.current.notice} />);
    expect(screen.getByRole("alert")).toHaveTextContent("server accepted this action");
    expect(screen.getByRole("alert")).toHaveTextContent("Use Retry refresh");
    expect(screen.getByRole("alert")).not.toHaveTextContent("Try the action again");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps the mutation error if a caller has a synchronous refresh callback", async () => {
    api.mockRejectedValue(Object.assign(new Error("Records changed. Preview again."), { status: 409 }));
    const { result } = renderHook(() => useWrite(() => {}));
    await act(async () => {
      expect(await result.current.run("/rides", {})).toBeNull();
    });
    expect(result.current.error).toBe("Records changed. Preview again.");
  });
});

describe("conflict review keyboard behavior", () => {
  const review = { title: "ride offer", result: { conflicts: [] } };

  it("preserves focused controls across parent renders and restores the opener only on close", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { rerender, unmount } = render(<ConflictDialog review={review} onCancel={() => {}} onCommit={() => {}} />);
    const confirm = screen.getByRole("button", { name: "Confirm and save" });
    confirm.focus();
    rerender(<ConflictDialog review={review} error="Review updated" onCancel={() => {}} onCommit={() => {}} />);
    expect(confirm).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
    opener.remove();
  });

  it("cycles Tab from the dialog container and uses current pending state for Escape", () => {
    const firstCancel = vi.fn();
    const currentCancel = vi.fn();
    const { rerender } = render(<ConflictDialog review={review} pending onCancel={firstCancel} onCommit={() => {}} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(firstCancel).not.toHaveBeenCalled();
    rerender(<ConflictDialog review={review} pending={false} onCancel={currentCancel} onCommit={() => {}} />);
    screen.getByRole("dialog").focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Go back" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "Confirm and save" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(currentCancel).toHaveBeenCalledTimes(1);
  });
});
