import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSemester, DEFAULT_POLICY } from "../config/vesit";
import { useSharedStore } from "../store/useSharedStore";
import AttendancePage from "./AttendancePage";

const json = (value) => ({
  ok: true,
  status: 200,
  headers: { get: () => "application/json" },
  json: async () => structuredClone(value),
});
function Harness() {
  const { data, refresh } = useSharedStore();
  return data ? (
    <AttendancePage data={data} onRefresh={refresh} />
  ) : (
    <p>Not loaded</p>
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useSharedStore.getState().clear();
});
describe("server-backed attendance", () => {
  it("saves Present/Absent, updates the subject immediately and reloads durable records without UUID browser support", async () => {
    const durable = {
      academics: {
        semesters: { 1: createSemester(1), 2: createSemester(2) },
        policy: DEFAULT_POLICY,
      },
    };
    vi.stubGlobal("crypto", {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path, options) => {
        if (options?.method === "POST") {
          const event = {
            ...JSON.parse(options.body),
            id: `server-id-${durable.academics.semesters[1].events.length}`,
          };
          const semester = durable.academics.semesters[event.semester];
          const key = `${event.code}:${event.type}`;
          const count = semester.attendance[key] || { present: 0, total: 0 };
          semester.attendance[key] = {
            present: count.present + Number(event.present),
            total: count.total + 1,
          };
          semester.events.push(event);
          return json({ saved: true });
        }
        expect(path).toBe("/api/state");
        return json(durable);
      }),
    );
    useSharedStore.setState({
      data: structuredClone(durable),
      status: "ready",
    });
    const view = render(<Harness />);
    fireEvent.click(
      screen.getByRole("button", { name: "Present: Mathematics-1 theory" }),
    );
    await screen.findByText("1/1 attended · 100.0%");
    fireEvent.click(
      screen.getByRole("button", { name: "Absent: Mathematics-1 theory" }),
    );
    await screen.findByText("1/2 attended · 50.0%");
    expect(durable.academics.semesters[1].events).toHaveLength(2);
    view.unmount();
    useSharedStore.getState().clear();
    await act(async () => {
      await useSharedStore.getState().refresh();
    });
    render(<Harness />);
    expect(screen.getByText("1/2 attended · 50.0%")).toBeInTheDocument();
    expect(screen.getAllByText(/26ETBS11 · theory ·/)).toHaveLength(2);
  });
  it("does not change counts or show a saved result when the API is offline", async () => {
    const data = {
      academics: {
        semesters: { 1: createSemester(1), 2: createSemester(2) },
        policy: DEFAULT_POLICY,
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    render(<AttendancePage data={data} onRefresh={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Present: Mathematics-1 theory" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Failed to fetch",
    );
    expect(data.academics.semesters[1].events).toHaveLength(0);
    expect(screen.queryByText("1/1 attended · 100.0%")).not.toBeInTheDocument();
  });
});
