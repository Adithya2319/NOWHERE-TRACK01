import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../services/api";
import { useSharedStore } from "../store/useSharedStore";
import LoginPage from "./LoginPage";

vi.mock("../services/api", () => ({ api: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); useSharedStore.getState().clear(); });

describe("presentation account login", () => {
  it("loads data first, exposes the separate DEMO account, then enters only on selection", async () => {
    let loaded = false;
    api.mockImplementation(async (path) => {
      if (path === "/auth/status") return { authMode: "demo", configured: true, demoToolsEnabled: true, demoStatus: { loaded, studentId: "demo-adithya" }, demoAccounts: [{ id: "student-a", name: "Existing Student" }, ...(loaded ? [{ id: "demo-adithya", name: "Adithya", demo: true }] : [])] };
      if (path === "/demo/load") { loaded = true; return { loaded: true }; }
      if (path === "/auth/demo") return { user: { id: "demo-adithya", name: "Adithya", demo: true } };
      if (path === "/state") return { me: { id: "demo-adithya", name: "Adithya", demo: true } };
      throw Error(`Unexpected API ${path}`);
    });
    render(<MemoryRouter initialEntries={["/login"]}><Routes><Route path="/login" element={<LoginPage />} /><Route path="/" element={<h1>Dashboard opened</h1>} /></Routes></MemoryRouter>);
    expect(await screen.findByRole("button", { name: /Enter as Existing Student/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load Demo Data" }));
    const enter = await screen.findByRole("button", { name: /Enter as Adithya/ });
    expect(api.mock.calls.some(([path]) => path === "/auth/demo")).toBe(false);
    fireEvent.click(enter);
    expect(await screen.findByRole("heading", { name: "Dashboard opened" })).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith("/auth/demo", { method: "POST", body: { userId: "demo-adithya" } });
    expect(useSharedStore.getState().data.me.id).toBe("demo-adithya");
  });
  it("does not expose development seeding controls in provider mode", async () => {
    api.mockResolvedValue({ authMode: "provider", configured: false, demoToolsEnabled: false });
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/is not configured/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Load Demo Data" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send OTP" })).toBeDisabled();
  });
});
