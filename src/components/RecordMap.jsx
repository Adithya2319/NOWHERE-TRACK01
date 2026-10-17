import { useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import marker from "leaflet/dist/images/marker-icon.png";
import markerRetina from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

const icon = L.icon({
  iconUrl: marker,
  iconRetinaUrl: markerRetina,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
export default function RecordMap({ records, selected, onSelect, label }) {
  const [failed, setFailed] = useState(false);
  const pins = records.filter(
    (record) =>
      Number.isFinite(record.lat) &&
      Math.abs(record.lat) <= 90 &&
      Number.isFinite(record.lng) &&
      Math.abs(record.lng) <= 180,
  );
  const focus = pins.find((record) => record.id === selected) || pins[0];
  return (
    <div className="relative z-0 overflow-hidden rounded-xl border border-ink/15">
      <p className="border-b border-ink/10 px-4 py-3 text-xs">
        {label} · Illustrative locations, not verified VESIT coordinates.
      </p>
      {focus ? (
        <MapContainer
          key={focus.id}
          center={[focus.lat, focus.lng]}
          zoom={14}
          scrollWheelZoom={false}
          style={{ height: 280, width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            eventHandlers={{ tileerror: () => setFailed(true) }}
          />
          {pins.map((record) => (
            <Marker
              key={record.id}
              position={[record.lat, record.lng]}
              icon={icon}
              eventHandlers={{ click: () => onSelect?.(record.id) }}
            >
              <Popup>
                <strong>{record.name || record.pickup}</strong>
                <p>{record.location || record.dropoff}</p>
                <p>Illustrative location.</p>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      ) : (
        <p className="p-4 text-sm">No map coordinates for these records.</p>
      )}
      {failed && (
        <p role="status" className="border-t border-ink/15 p-3 text-sm">
          Map tiles are unavailable. All locations and actions remain available
          in the text list.
        </p>
      )}
    </div>
  );
}
