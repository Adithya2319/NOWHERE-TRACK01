import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSemester, DEFAULT_POLICY } from "../config/vesit";
import { api } from "../services/api";
import { localDate } from "../components/SharedUI";
import TodayPage from "./TodayPage";
import ProfilePage from "./ProfilePage";

vi.mock("../services/api", () => ({ api: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const later = (hours) => new Date(Date.now() + hours * 3600000).toISOString();
function fixture() {
  return {
    config: { timezone: "Asia/Kolkata", collegeName: "VESIT, Mumbai" },
    me: { id: "demo-adithya", name: "Adithya", role: "student", classId: "demo-fe-a", membership: "approved", subjects: ["Mathematics-1"], interests: ["Robotics"], academicDetails: { college: "VESIT, Mumbai", year: "First Year", branch: "EXTC", division: "FE-A", semester: 1, academicYear: "2026-27" }, contactPreferences: { emailNotifications: false, pushNotifications: false, preferredContact: "in-app" } },
    classes: [{ id: "demo-fe-a", name: "FE-A" }],
    academics: { semesters: { 1: createSemester(1), 2: createSemester(2) }, policy: DEFAULT_POLICY },
    tasks: [], schedule: [], rides: [], notifications: [],
  };
}
function dayApi(path) { return Promise.resolve(path.startsWith("/today") ? { date: path.split("=")[1], items: [], help: [], suggestions: [] } : { saved: true }); }

describe("record-derived demo dashboard", () => {
  it("updates assignment summaries, submissions and bookings from the refreshed records", async () => {
    api.mockImplementation(dayApi);
    const data = fixture();
    data.tasks = [
      { id: "p", title: "Matrix exercise", deadline: later(24), subject: "Mathematics-1", priority: "high", submissions: [] },
      { id: "o", title: "Logic practice", deadline: later(-24), submissions: [] },
      { id: "s", title: "C program", deadline: later(24), submissions: [{ userId: data.me.id, status: "pending", submittedAt: Date.now() }] },
      { id: "g", title: "Workshop file", deadline: later(-24), maxMarks: 25, submissions: [{ userId: data.me.id, status: "approved", grade: 21.5, feedback: "Clear work" }] },
    ];
    data.rides = [{ id: "ride", pickup: "Chembur", dropoff: "VESIT", start: later(3), end: later(4), demo: true, requests: [{ riderId: data.me.id, status: "confirmed" }] }];
    const view = render(<MemoryRouter><TodayPage data={data} /></MemoryRouter>);
    for (const status of ["Pending", "Overdue", "Submitted", "Graded"]) expect(screen.getByText(`${status}: 1`)).toBeInTheDocument();
    expect(screen.getByText("21.5/25 marks", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chembur → VESIT" })).toBeInTheDocument();
    expect(screen.getByText(/no transport arranged/)).toBeInTheDocument();
    data.tasks[0].submissions.push({ userId: data.me.id, status: "pending", submittedAt: Date.now() });
    data.rides[0].requests[0].status = "cancelled";
    view.rerender(<MemoryRouter><TodayPage data={{ ...data }} /></MemoryRouter>);
    expect(screen.getByText("Submitted: 2")).toBeInTheDocument();
    expect(screen.getByText("Pending: 0")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Chembur → VESIT" })).not.toBeInTheDocument();
    await screen.findByText("No joined events, timetable or confirmed rides on this day.");
  });
  it("keeps date navigation usable and labels upcoming sample sessions", async () => {
    api.mockImplementation(dayApi);
    const data = fixture();
    data.schedule = [{ id: "class", kind: "class", title: "Mathematics-1 lecture", start: later(24), end: later(25), location: "Room 204", lectureType: "theory", demo: true }];
    render(<MemoryRouter><TodayPage data={data} scheduleOnly /></MemoryRouter>);
    const today = localDate();
    expect(screen.getByLabelText("Day plan date")).toHaveValue(today);
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    expect(screen.getByLabelText("Day plan date").value).not.toBe(today);
    fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
    expect(screen.getByLabelText("Day plan date")).toHaveValue(today);
    expect(screen.getByText("Room 204 · theory · DEMO sample")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View this day" }));
    expect(screen.getByLabelText("Day plan date")).toHaveValue(localDate(new Date(data.schedule[0].start)));
    await waitFor(() => expect(api).toHaveBeenLastCalledWith(expect.stringContaining(`/today?date=${localDate(new Date(data.schedule[0].start))}`), expect.any(Object)));
  });
  it("shows and saves academic contact preferences without claiming delivery", async () => {
    api.mockResolvedValue({ saved: true });
    const data = fixture();
    render(<MemoryRouter><ProfilePage data={data} onRefresh={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText("2026-27")).toBeInTheDocument();
    expect(screen.getByText(/no external messages are sent/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Email update preference"));
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/profile", { method: "PUT", body: expect.objectContaining({ name: "Adithya", subjects: ["Mathematics-1"], contactPreferences: { emailNotifications: true, pushNotifications: false, preferredContact: "in-app" } }) }));
  });
});
