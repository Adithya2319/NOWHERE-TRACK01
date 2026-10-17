import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RecordMap from "./RecordMap";

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
  Marker: ({ children }) => <div data-testid="pin">{children}</div>,
  Popup: ({ children }) => <div>{children}</div>,
  TileLayer: () => null,
}));
afterEach(cleanup);

describe("record map coordinates", () => {
  it("keeps impossible coordinates out of the map while displaying valid records", () => {
    render(<RecordMap label="Directory" records={[
      { id: "valid", lat: 19.04, lng: 72.88, name: "Valid entry" },
      { id: "bad-latitude", lat: 100, lng: 72.88, name: "Invalid latitude" },
      { id: "bad-longitude", lat: 19.04, lng: -200, name: "Invalid longitude" },
      { id: "missing", lat: null, lng: null, name: "Missing location" },
    ]} />);
    expect(screen.getAllByTestId("pin")).toHaveLength(1);
    expect(screen.getByText("Valid entry")).toBeInTheDocument();
    expect(screen.queryByText("Invalid latitude")).not.toBeInTheDocument();
  });

  it("shows the text-list fallback when no supported coordinates exist", () => {
    render(<RecordMap label="Directory" records={[{ id: "bad", lat: Infinity, lng: 1 }]} />);
    expect(screen.queryByTestId("map")).not.toBeInTheDocument();
    expect(screen.getByText("No map coordinates for these records.")).toBeInTheDocument();
  });
});
