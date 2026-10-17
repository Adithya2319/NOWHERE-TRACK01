import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Link, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import DirectoryPage from "./DirectoryPage";
import RidesPage from "./RidesPage";

vi.mock("../components/RecordMap", () => ({ default: () => <div>Map</div> }));
afterEach(cleanup);

function SelectionHarness({ type, children }) {
  const location = useLocation();
  return <>
    <Link to={`?${type}=second&view=list`}>Open second result</Link>
    <output data-testid="search">{location.search}</output>
    {children}
  </>;
}

describe("linked record selection", () => {
  it("updates directory highlighting for same-page links and keeps selection in the URL", () => {
    const data = { directory: [
      { id: "first", name: "First contact", category: "Faculty", location: "A" },
      { id: "second", name: "Second contact", category: "Faculty", location: "B" },
    ] };
    render(<MemoryRouter initialEntries={["/?contact=first&view=list"]}>
      <SelectionHarness type="contact"><DirectoryPage data={data} /></SelectionHarness>
    </MemoryRouter>);
    expect(screen.getByRole("button", { name: "First contact" }).closest("article")).toHaveClass("ring-2");
    fireEvent.click(screen.getByRole("link", { name: "Open second result" }));
    expect(screen.getByRole("button", { name: "Second contact" }).closest("article")).toHaveClass("ring-2");
    expect(screen.getByRole("button", { name: "First contact" }).closest("article")).not.toHaveClass("ring-2");
    fireEvent.click(screen.getByRole("button", { name: "First contact" }));
    expect(screen.getByTestId("search")).toHaveTextContent("contact=first&view=list");
  });

  it("updates ride highlighting for same-page links and retains other URL parameters", () => {
    const data = {
      me: { id: "student", membership: "unverified" },
      rides: ["first", "second"].map((id) => ({
        id, pickup: `${id} pickup`, dropoff: "Campus", ownerId: "driver",
        date: "2099-01-01", departure: "17:45", requests: [], capacity: 2,
        remainingSeats: 2, bufferMinutes: 15, status: "available",
      })),
    };
    render(<MemoryRouter initialEntries={["/?ride=first&view=list"]}>
      <SelectionHarness type="ride"><RidesPage data={data} /></SelectionHarness>
    </MemoryRouter>);
    const first = screen.getByRole("button", { name: /first pickup/ }).closest("article");
    const second = screen.getByRole("button", { name: /second pickup/ }).closest("article");
    expect(first).toHaveClass("ring-2");
    fireEvent.click(screen.getByRole("link", { name: "Open second result" }));
    expect(second).toHaveClass("ring-2");
    expect(first).not.toHaveClass("ring-2");
    fireEvent.click(screen.getByRole("button", { name: /first pickup/ }));
    expect(screen.getByTestId("search")).toHaveTextContent("ride=first&view=list");
  });
});
