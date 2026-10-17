import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import FutureAttendancePlanner from "./FutureAttendancePlanner";

afterEach(cleanup);
const props = { present: 17, total: 24, policyTarget: null, labelPrefix: "Mathematics-1 theory" };
const field = (label) => screen.getByLabelText(`Mathematics-1 theory: ${label}`);
const open = () => fireEvent.click(screen.getByText("Future attendance planner"));

describe("future attendance planning", () => {
  it("shows transparent scenarios and saves a separate plan without mutating recorded attendance", async () => {
    const onSave = vi.fn().mockResolvedValue({ saved: true });
    render(<FutureAttendancePlanner {...props} onSave={onSave} />);
    open();
    expect(screen.getByText(/75% default is a personal, unverified target/)).toBeInTheDocument();
    fireEvent.change(field("Future conducted lectures"), { target: { value: "8" } });
    fireEvent.change(field("Planned attended lectures"), { target: { value: "7" } });
    expect(screen.getByText(/Projected attendance:/)).toHaveTextContent("75.0% (24/32)");
    expect(screen.getByText(/To reach 75%/)).toHaveTextContent("attend at least 7 of these 8 lectures");
    expect(screen.getByText(/To reach 75%/)).toHaveTextContent("miss at most 1");
    fireEvent.click(screen.getByRole("button", { name: "Save attendance plan" }));
    await screen.findByText("Attendance plan saved.");
    expect(onSave).toHaveBeenCalledExactlyOnceWith({ remaining: 8, plannedPresent: 7, target: 75 });
    expect(props.present).toBe(17);
    expect(props.total).toBe(24);
    expect(screen.getByText(/not a trained prediction/)).toBeInTheDocument();
  });

  it("rejects invalid drafts and explains an unreachable target rather than clamping it", () => {
    const onSave = vi.fn();
    render(<FutureAttendancePlanner {...props} onSave={onSave} />);
    open();
    fireEvent.change(field("Future conducted lectures"), { target: { value: "3" } });
    expect(screen.getByRole("alert")).toHaveTextContent("cannot exceed");
    expect(screen.getByRole("button", { name: "Save attendance plan" })).toBeDisabled();
    fireEvent.change(field("Planned attended lectures"), { target: { value: "3" } });
    expect(screen.getByText(/Target unreachable/)).toHaveTextContent("4 attended lectures would be required");
    expect(screen.getByText(/Attend 4 consecutive future lectures/)).toBeInTheDocument();
    fireEvent.change(field("Personal attendance target (%)"), { target: { value: "0" } });
    expect(screen.getByRole("alert")).toHaveTextContent("greater than 0 and at most 100");
    fireEvent.change(field("Personal attendance target (%)"), { target: { value: "" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Enter future lectures");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("keeps an unfinished draft during count refresh and offers an explicit reload for changed saved plans", () => {
    const original = { remaining: 8, plannedPresent: 7, target: 75 };
    const { rerender } = render(<FutureAttendancePlanner {...props} plan={original} />);
    open();
    fireEvent.change(field("Planned attended lectures"), { target: { value: "6" } });
    rerender(<FutureAttendancePlanner {...props} present={18} total={25} plan={{ ...original }} />);
    expect(field("Planned attended lectures")).toHaveValue(6);
    expect(screen.queryByText(/saved plan changed/)).not.toBeInTheDocument();
    rerender(<FutureAttendancePlanner {...props} plan={{ remaining: 20, plannedPresent: 20, target: 80 }} />);
    expect(field("Planned attended lectures")).toHaveValue(6);
    expect(screen.getByText(/saved plan changed/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reload saved plan" }));
    expect(field("Future conducted lectures")).toHaveValue(20);
    expect(field("Planned attended lectures")).toHaveValue(20);
    expect(field("Personal attendance target (%)")).toHaveValue(80);
  });

  it("handles no recorded lectures without inventing a trend", () => {
    render(<FutureAttendancePlanner {...props} present={0} total={0} plan={{ remaining: 0, plannedPresent: 0, target: 75 }} />);
    open();
    expect(screen.getByText(/Continue recorded rate:/)).toHaveTextContent("unavailable until a lecture is recorded");
    expect(screen.getByText(/Add conducted lectures/)).toBeInTheDocument();
    expect(screen.queryByText(/To reach 75%/)).not.toBeInTheDocument();
  });

  it("reports failed saves and preserves the draft for retry", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("Server unavailable"));
    render(<FutureAttendancePlanner {...props} onSave={onSave} />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save attendance plan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Server unavailable");
    expect(screen.queryByText("Attendance plan saved.")).not.toBeInTheDocument();
    expect(field("Future conducted lectures")).toHaveValue(10);
  });

  it("keeps an accepted save editable when its refresh fails without offering the stale cached plan", async () => {
    const original = { remaining: 8, plannedPresent: 7, target: 75 };
    const onSave = vi.fn().mockResolvedValue({ saved: true });
    render(<FutureAttendancePlanner {...props} plan={original} onSave={onSave} />);
    open();
    fireEvent.change(field("Planned attended lectures"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Save attendance plan" }));
    await screen.findByText("Attendance plan saved.");
    expect(screen.queryByRole("button", { name: "Reload saved plan" })).not.toBeInTheDocument();
    fireEvent.change(field("Planned attended lectures"), { target: { value: "5" } });
    expect(field("Planned attended lectures")).toHaveValue(5);
    expect(screen.queryByText("Attendance plan saved.")).not.toBeInTheDocument();
    expect(screen.queryByText(/saved plan changed/)).not.toBeInTheDocument();
  });

  it("accepts the refreshed saved plan as its baseline while preserving subsequent draft edits", async () => {
    const original = { remaining: 8, plannedPresent: 7, target: 75 };
    const saved = { ...original, plannedPresent: 6 };
    const onSave = vi.fn().mockResolvedValue({ saved: true });
    const { rerender } = render(<FutureAttendancePlanner {...props} plan={original} onSave={onSave} />);
    open();
    fireEvent.change(field("Planned attended lectures"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Save attendance plan" }));
    await screen.findByText("Attendance plan saved.");
    rerender(<FutureAttendancePlanner {...props} plan={saved} onSave={onSave} />);
    fireEvent.change(field("Planned attended lectures"), { target: { value: "5" } });
    expect(field("Planned attended lectures")).toHaveValue(5);
    expect(screen.queryByText(/saved plan changed/)).not.toBeInTheDocument();
    // After observing the new saved plan, a later change back to the original
    // values is a real external change and must no longer be suppressed.
    rerender(<FutureAttendancePlanner {...props} plan={original} onSave={onSave} />);
    expect(screen.getByText(/saved plan changed/)).toBeInTheDocument();
    expect(field("Planned attended lectures")).toHaveValue(5);
  });

  it("still warns about a distinct external plan while waiting for a successful save to refresh", async () => {
    const original = { remaining: 8, plannedPresent: 7, target: 75 };
    const external = { remaining: 20, plannedPresent: 20, target: 80 };
    const onSave = vi.fn().mockResolvedValue({ saved: true });
    const { rerender } = render(<FutureAttendancePlanner {...props} plan={original} onSave={onSave} />);
    open();
    fireEvent.change(field("Planned attended lectures"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Save attendance plan" }));
    await screen.findByText("Attendance plan saved.");
    rerender(<FutureAttendancePlanner {...props} plan={external} onSave={onSave} />);
    expect(screen.getByText(/saved plan changed/)).toBeInTheDocument();
    expect(field("Planned attended lectures")).toHaveValue(6);
    fireEvent.click(screen.getByRole("button", { name: "Reload saved plan" }));
    expect(field("Future conducted lectures")).toHaveValue(20);
    expect(field("Planned attended lectures")).toHaveValue(20);
    expect(screen.queryByText(/saved plan changed/)).not.toBeInTheDocument();
  });
});
