import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import RecordMap from "../components/RecordMap";
import { input, panel } from "../components/SharedUI";

export default function DirectoryPage({ data }) {
  const [params, setParams] = useSearchParams();
  const selected = params.get("contact");
  const setSelected = (id) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("contact", id);
      return next;
    }, { replace: true });
  };
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const categories = [
    ...new Set(data.directory.map((entry) => entry.category)),
  ].sort();
  const entries = data.directory.filter(
    (entry) =>
      (!category || entry.category === category) &&
      `${entry.name} ${entry.location} ${(entry.subjects || []).join(" ")} ${(entry.interests || []).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="space-y-6">
      <section className={panel}>
        <h1 className="font-display text-4xl">Find your way. Find help.</h1>
        <p className="my-3 text-sm">
          Sample directory. Contacts and map pins are illustrative, not
          verified staff details, availability or campus coordinates.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Search subjects, interests or location
            <input
              aria-label="Search directory"
              className={`${input} mt-1 w-full`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try robotics or Mathematics"
            />
          </label>
          <label className="text-sm">
            Category
            <select
              aria-label="Directory category"
              className={`${input} mt-1 w-full`}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((value) => (
                <option value={value} key={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <RecordMap
        records={entries}
        selected={selected}
        onSelect={setSelected}
        label="Campus guide map"
      />
      <section className="grid gap-4 md:grid-cols-2">
        {!entries.length && (
          <p className={panel}>No directory entries match these filters.</p>
        )}
        {entries.map((entry) => (
          <article
            key={entry.id}
            className={`${panel} ${selected === entry.id ? "ring-2 ring-ink" : ""}`}
          >
            <button
              className="text-left font-display text-3xl underline decoration-ink/20"
              onClick={() => setSelected(entry.id)}
            >
              {entry.name}
            </button>
            <p className="my-2 text-xs uppercase tracking-[0.15em] text-ink/60">
              {entry.category}
            </p>
            <p className="text-sm">{entry.location}</p>
            {entry.subjects?.length > 0 && (
              <p className="mt-3 text-sm">
                Subjects: {entry.subjects.join(", ")}
              </p>
            )}
            {entry.interests?.length > 0 && (
              <p className="mt-2 text-sm">
                Interests: {entry.interests.join(", ")}
              </p>
            )}
            {entry.email && (
              <p className="mt-3 break-words text-sm">
                Sample contact: {entry.email}
              </p>
            )}
            <p className="mt-3 text-xs text-ink/60">
              This is a guide entry; no peer session or booking is created.
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}
