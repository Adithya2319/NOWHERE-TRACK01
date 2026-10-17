import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../services/api";
import DemoControls from "./DemoControls";
import NotificationCenter from "./NotificationCenter";

vi.mock("../services/api", () => ({ api: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe("development DEMO controls", () => {
  it("hides development actions when the server disables them", () => {
    render(<DemoControls demo={{ enabled: false, loaded: true }} accountDemo />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("loads persistent samples through the API and refreshes without switching accounts", async () => {
    const refresh = vi.fn();
    const enter = vi.fn();
    api.mockResolvedValue({ loaded: true });
    render(<DemoControls demo={{ enabled: true, loaded: true }} onRefresh={refresh} onEnter={enter} />);
    fireEvent.click(screen.getByRole("button", { name: "Load Demo Data" }));
    await screen.findByText("DEMO data is ready. Your existing records are preserved.");
    expect(api).toHaveBeenCalledWith("/demo/load", { method: "POST", body: {} });
    expect(refresh).toHaveBeenCalledOnce();
    expect(enter).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Reset Demo Data" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enter Adithya DEMO account" }));
    expect(enter).toHaveBeenCalledOnce();
  });
  it("requires an explicit isolated-workspace confirmation before resetting", async () => {
    api.mockResolvedValue({ reset: true });
    render(<DemoControls demo={{ enabled: true, loaded: true }} accountDemo onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Reset Demo Data" }));
    expect(api).not.toHaveBeenCalled();
    expect(screen.getByText(/Other local accounts are preserved/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep my DEMO changes" }));
    expect(screen.queryByRole("button", { name: "Confirm reset DEMO data" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset Demo Data" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm reset DEMO data" }));
    await screen.findByText("DEMO rehearsal restored to its starting examples.");
    expect(api).toHaveBeenCalledWith("/demo/reset", { method: "POST", body: { confirm: "RESET_DEMO_DATA" } });
  });
});

describe("notifications", () => {
  it("derives unread counts, persists read actions and rejects external links", async () => {
    const onRefresh = vi.fn();
    api.mockResolvedValue({ saved: true });
    render(<MemoryRouter><NotificationCenter onRefresh={onRefresh} notifications={[
      { id: "a", title: "Marks saved", body: "Your marks changed", readAt: null, link: "/marks", demo: true },
      { id: "b", title: "Old note", body: "Earlier", readAt: 123, link: "//untrusted.example" },
    ]} /></MemoryRouter>);
    fireEvent.click(screen.getByLabelText("Notifications (1 unread)"));
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/marks");
    fireEvent.click(screen.getByRole("button", { name: "Mark Marks saved as read" }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledOnce());
    expect(api).toHaveBeenCalledWith("/notifications/a/read", { method: "POST", body: { read: true } });
  });
  it("supports unread and mark-all operations, with a real empty state", async () => {
    api.mockResolvedValue({ saved: true });
    const view = render(<MemoryRouter><NotificationCenter onRefresh={vi.fn()} notifications={[{ id: "a", title: "Class moved", body: "Room changed", readAt: 123 }]} /></MemoryRouter>);
    fireEvent.click(screen.getByLabelText("Notifications (0 unread)"));
    expect(screen.getByRole("button", { name: "Mark all read" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Mark Class moved as unread" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/notifications/a/read", { method: "POST", body: { read: false } }));
    view.rerender(<MemoryRouter><NotificationCenter onRefresh={vi.fn()} notifications={[{ id: "a", title: "Class moved", body: "Room changed", readAt: null }]} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Mark all read" })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/notifications/read-all", { method: "POST", body: {} }));
    view.rerender(<MemoryRouter><NotificationCenter notifications={[]} /></MemoryRouter>);
    expect(screen.getByText(/You’re all caught up/)).toBeInTheDocument();
  });
});
