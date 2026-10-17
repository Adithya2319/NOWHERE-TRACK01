import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSemester, DEFAULT_POLICY } from "../config/vesit";
import { api } from "../services/api";
import TodayPage from "./TodayPage";

vi.mock("../services/api", () => ({ api: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe("day plan request cancellation", () => {
  it("does not let a cancelled response hide a newer day's loading error", async () => {
    let resolveOld;
    let rejectCurrent;
    api.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    api.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectCurrent = reject; }));
    const data = {
      config: { timezone: "Asia/Kolkata" },
      me: { id: "student", role: "student" },
      academics: {
        semesters: { 1: createSemester(1), 2: createSemester(2) },
        policy: DEFAULT_POLICY,
      },
      tasks: [], schedule: [],
    };
    render(<MemoryRouter><TodayPage data={data} /></MemoryRouter>);
    const oldDate = screen.getByLabelText("Day plan date").value;
    fireEvent.change(screen.getByLabelText("Day plan date"), { target: { value: "2099-01-01" } });
    await act(async () => { rejectCurrent(new Error("Current day unavailable")); });
    expect(screen.getByRole("alert")).toHaveTextContent("Current day unavailable");
    await act(async () => { resolveOld({ date: oldDate, items: [], help: [], suggestions: [] }); });
    expect(screen.getByRole("alert")).toHaveTextContent("Current day unavailable");
    expect(screen.getByLabelText("Day plan date")).toHaveValue("2099-01-01");
  });
});
