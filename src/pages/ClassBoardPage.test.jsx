import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createSemester } from "../config/vesit";
import { api } from "../services/api";
import ClassBoardPage from "./ClassBoardPage";

vi.mock("../services/api", () => ({ api: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

function fixture(overrides = {}) {
  const future = new Date(Date.now() + 86400000).toISOString();
  const past = new Date(Date.now() - 86400000).toISOString();
  const base = { creatorId: "mentor", subjectCode: "26ETBS11", subject: "Mathematics-1", points: 10, priority: "medium", maxMarks: 20, description: "Use the assessed examples.", demo: true, submissions: [] };
  return {
    me: { id: "adithya", role: "student", demo: true },
    academics: { semesters: { 1: createSemester(1) } },
    leaderboard: { classes: [], students: [] },
    tasks: [
      { ...base, id: "pending", title: "Matrices practice", deadline: future },
      { ...base, id: "overdue", title: "Truth tables", subjectCode: "26ETPC11", subject: "Digital System", deadline: past },
      { ...base, id: "submitted", title: "Loop trace", deadline: past, submissions: [{ id: "sub-1", userId: "adithya", name: "Adithya", status: "pending", note: "Traced three loops.", submittedAt: Date.now() - 1000, grade: null, history: [{ id: "history-1", action: "submitted", createdAt: Date.now() - 1000, note: "Local work saved." }] }] },
      { ...base, id: "graded", title: "Vectors exercise", deadline: past, submissions: [{ id: "sub-2", userId: "adithya", status: "approved", note: "Worked all examples.", feedback: "Clear diagrams.", grade: 17.5, history: [] }] },
    ],
    ...overrides,
  };
}

it("derives four assignment states and filters subjects without changing totals", () => {
  render(<ClassBoardPage data={fixture()} onRefresh={vi.fn()} />);
  const summary = screen.getByRole("region", { name: "Assignment summary" });
  for (const name of ["Pending", "Submitted", "Overdue", "Graded"]) expect(within(summary).getByText(name).parentElement).toHaveTextContent("1");
  expect(screen.getByText(/File uploads and delivery/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Assignment status"), { target: { value: "Overdue" } });
  expect(screen.getByRole("heading", { name: "Truth tables" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Matrices practice" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Assignment subject"), { target: { value: "26ETBS11" } });
  expect(screen.getByText("No assignments match these filters.")).toBeInTheDocument();
  expect(within(summary).getByText("Pending").parentElement).toHaveTextContent("1");
});

it("saves an honest completion note and immediately refreshes dependent data", async () => {
  api.mockResolvedValue({ submitted: true });
  const onRefresh = vi.fn();
  render(<ClassBoardPage data={fixture()} onRefresh={onRefresh} />);
  fireEvent.change(screen.getByLabelText("Completion note or safe resource URL"), { target: { value: "Explained all matrix row operations." } });
  fireEvent.click(screen.getByRole("button", { name: "Submit completion" }));
  await waitFor(() => expect(api).toHaveBeenCalledWith("/tasks/pending/submit", { method: "POST", body: { note: "Explained all matrix row operations." } }));
  expect(onRefresh).toHaveBeenCalledOnce();
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Completion note submitted for review."));
});

it("shows saved grade, feedback and submission history while preserving legacy review statuses", () => {
  render(<ClassBoardPage data={fixture()} onRefresh={vi.fn()} />);
  expect(screen.getByText("pending", { exact: true })).toBeInTheDocument();
  expect(screen.getByText("approved", { exact: true })).toBeInTheDocument();
  expect(screen.getByText("17.5/20")).toBeInTheDocument();
  expect(screen.getByText("Feedback: Clear diagrams.")).toBeInTheDocument();
  const article = screen.getByRole("heading", { name: "Loop trace" }).closest("article");
  fireEvent.click(within(article).getByText("Submission history"));
  expect(within(article).getByText("Local work saved.")).toBeVisible();
  expect(screen.getByText(/This task has closed for submissions/)).toBeInTheDocument();
});

it("passes optional assignment marks only on approval and preserves fixed point reviews", async () => {
  api.mockResolvedValue({ saved: true });
  const data = fixture();
  data.me = { id: "mentor", role: "moderator" };
  data.tasks = [data.tasks[2]];
  render(<ClassBoardPage data={data} onRefresh={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Feedback"), { target: { value: "Good tracing." } });
  fireEvent.change(screen.getByLabelText("Assignment grade (optional, out of 20)"), { target: { value: "18.5" } });
  fireEvent.click(screen.getByRole("button", { name: "Approve", exact: true }));
  await waitFor(() => expect(api).toHaveBeenCalledWith("/submissions/sub-1", { method: "POST", body: { action: "approve", feedback: "Good tracing.", grade: 18.5 } }));
});
