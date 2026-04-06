import React, { useState, useRef, useEffect } from "react";
import { MapPin, Plus, X, ChevronDown, Search } from "lucide-react";

/**
 * Step 3 — Operating Locations (optional)
 * Users can add the countries and cities they operate in.
 *
 * Props:
 *   locations        {Array}    — [{ country, cities: [] }]
 *   setLocations     {function} — update locations state
 *   onBack           {function}
 *   onNext           {function}
 *   onSkip           {function}
 */

const COUNTRIES = [
  "Afghanistan","Albania","Algeria","Argentina","Armenia","Australia","Austria",
  "Azerbaijan","Bahrain","Bangladesh","Belarus","Belgium","Bolivia","Bosnia and Herzegovina",
  "Brazil","Bulgaria","Cambodia","Cameroon","Canada","Chile","China","Colombia",
  "Costa Rica","Croatia","Cuba","Czech Republic","Denmark","Dominican Republic",
  "Ecuador","Egypt","El Salvador","Ethiopia","Finland","France","Georgia","Germany",
  "Ghana","Greece","Guatemala","Honduras","Hong Kong","Hungary","India","Indonesia",
  "Iran","Iraq","Ireland","Israel","Italy","Jamaica","Japan","Jordan","Kazakhstan",
  "Kenya","Kuwait","Lebanon","Libya","Malaysia","Mexico","Morocco","Myanmar",
  "Nepal","Netherlands","New Zealand","Nicaragua","Nigeria","North Korea","Norway",
  "Oman","Pakistan","Panama","Paraguay","Peru","Philippines","Poland","Portugal",
  "Qatar","Romania","Russia","Saudi Arabia","Senegal","Serbia","Singapore",
  "Slovakia","Slovenia","South Africa","South Korea","Spain","Sri Lanka","Sudan",
  "Sweden","Switzerland","Syria","Taiwan","Tanzania","Thailand","Tunisia","Turkey",
  "Uganda","Ukraine","United Arab Emirates","United Kingdom","United States",
  "Uruguay","Uzbekistan","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe",
];

export default function LocationStep({ locations, setLocations, onBack, onNext, onSkip }) {
  const [query, setQuery]           = useState("");
  const [dropdownOpen, setDropdown] = useState(false);
  const [activeCountry, setActive]  = useState(null);
  const [cityInput, setCityInput]   = useState("");
  const dropdownRef                 = useRef(null);

  const filtered = query.trim()
    ? COUNTRIES.filter((c) => c.toLowerCase().includes(query.toLowerCase()))
    : COUNTRIES;

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const addCountry = (country) => {
    if (locations.find((l) => l.country === country)) {
      setActive(country);
      setDropdown(false);
      setQuery("");
      return;
    }
    setLocations((prev) => [...prev, { country, cities: [] }]);
    setActive(country);
    setDropdown(false);
    setQuery("");
  };

  const removeCountry = (country) => {
    setLocations((prev) => prev.filter((l) => l.country !== country));
    if (activeCountry === country) setActive(null);
  };

  const addCity = (country) => {
    const city = cityInput.trim();
    if (!city) return;
    setLocations((prev) =>
      prev.map((l) =>
        l.country === country
          ? { ...l, cities: l.cities.includes(city) ? l.cities : [...l.cities, city] }
          : l
      )
    );
    setCityInput("");
  };

  const removeCity = (country, city) => {
    setLocations((prev) =>
      prev.map((l) =>
        l.country === country
          ? { ...l, cities: l.cities.filter((c) => c !== city) }
          : l
      )
    );
  };

  const handleCityKeyDown = (e, country) => {
    if (e.key === "Enter") { e.preventDefault(); addCity(country); }
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <h2 className="text-xl font-bold" style={{ color: "var(--color-input-text)" }}>
          Operating Locations
        </h2>
        <p className="text-sm mt-1" style={{ color: "var(--color-sidebar-text)" }}>
          Add the countries and cities where you operate to personalise content for regional audiences.
        </p>
      </div>

      {/* Country picker */}
      <div ref={dropdownRef} style={{ position: "relative", marginBottom: "16px" }}>
        <label
          className="block text-sm font-medium mb-1.5"
          style={{ color: "var(--color-input-text)" }}
        >
          Add a country
        </label>
        <button
          type="button"
          onClick={() => setDropdown((o) => !o)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 12px",
            borderRadius: "8px",
            border: "1px solid var(--color-input-border)",
            backgroundColor: "var(--color-input-bg)",
            color: "var(--color-input-placeholder)",
            fontSize: "0.875rem",
            cursor: "pointer",
            transition: "border-color 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#d1d5db")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = dropdownOpen ? "var(--color-accent)" : "var(--color-input-border)")}
        >
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Search size={14} /> Select a country…
          </span>
          <ChevronDown
            size={14}
            style={{ transform: dropdownOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
          />
        </button>

        {dropdownOpen && (
          <div style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 50,
            backgroundColor: "#ffffff",
            border: "1px solid var(--color-input-border)",
            borderRadius: "8px",
            boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
            overflow: "hidden",
          }}>
            <div style={{ padding: "8px", borderBottom: "1px solid var(--color-input-border)" }}>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search countries…"
                className="field-input"
                style={{ padding: "6px 10px", fontSize: "0.8rem" }}
              />
            </div>
            <ul style={{ maxHeight: "180px", overflowY: "auto", margin: 0, padding: "4px 0", listStyle: "none" }}>
              {filtered.length === 0 && (
                <li style={{ padding: "8px 12px", color: "var(--color-sidebar-text)", fontSize: "0.8rem" }}>
                  No results
                </li>
              )}
              {filtered.map((country) => {
                const already = locations.some((l) => l.country === country);
                return (
                  <li
                    key={country}
                    onClick={() => addCountry(country)}
                    style={{
                      padding: "8px 12px",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                      color: already ? "var(--color-accent)" : "var(--color-input-text)",
                      backgroundColor: "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      transition: "background-color 0.1s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-input-bg)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                  >
                    {country}
                    {already && (
                      <span style={{ fontSize: "0.7rem", color: "var(--color-accent)" }}>✓ Added</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Country + cities list */}
      {locations.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
          {locations.map(({ country, cities }) => (
            <div
              key={country}
              style={{
                borderRadius: "10px",
                border: "1px solid",
                borderColor: activeCountry === country ? "var(--color-accent)" : "var(--color-input-border)",
                backgroundColor: activeCountry === country
                  ? "rgba(var(--color-accent-r), var(--color-accent-g), var(--color-accent-b), 0.04)"
                  : "var(--color-input-bg)",
                overflow: "hidden",
                transition: "border-color 0.15s, background-color 0.15s",
              }}
            >
              {/* Country header row */}
              <div
                onClick={() => setActive(activeCountry === country ? null : country)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <MapPin size={14} color="var(--color-accent)" />
                  <span style={{ color: "var(--color-input-text)", fontWeight: 600, fontSize: "0.875rem" }}>
                    {country}
                  </span>
                  {cities.length > 0 && (
                    <span style={{
                      fontSize: "0.7rem",
                      color: "var(--color-sidebar-text)",
                      backgroundColor: "#e5e7eb",
                      padding: "2px 6px",
                      borderRadius: "999px",
                    }}>
                      {cities.length} {cities.length === 1 ? "city" : "cities"}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeCountry(country); }}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--color-sidebar-text)",
                    padding: "2px",
                    display: "flex",
                    borderRadius: "4px",
                  }}
                  title="Remove country"
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-sidebar-text)")}
                >
                  <X size={14} />
                </button>
              </div>

              {/* Expanded: city chips + input */}
              {activeCountry === country && (
                <div style={{ padding: "0 12px 12px", borderTop: "1px solid var(--color-input-border)" }}>
                  {cities.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", margin: "10px 0" }}>
                      {cities.map((city) => (
                        <span
                          key={city}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            padding: "3px 8px",
                            borderRadius: "999px",
                            backgroundColor: "rgba(var(--color-accent-r), var(--color-accent-g), var(--color-accent-b), 0.10)",
                            border: "1px solid rgba(var(--color-accent-r), var(--color-accent-g), var(--color-accent-b), 0.25)",
                            color: "var(--color-accent)",
                            fontSize: "0.75rem",
                          }}
                        >
                          {city}
                          <button
                            type="button"
                            onClick={() => removeCity(country, city)}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, display: "flex" }}
                          >
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: "6px", marginTop: cities.length > 0 ? "0" : "10px" }}>
                    <input
                      value={cityInput}
                      onChange={(e) => setCityInput(e.target.value)}
                      onKeyDown={(e) => handleCityKeyDown(e, country)}
                      placeholder="Type a city and press Enter…"
                      className="field-input"
                      style={{ flex: 1, padding: "7px 10px", fontSize: "0.8rem" }}
                    />
                    <button
                      type="button"
                      onClick={() => addCity(country)}
                      className="btn btn--primary"
                      style={{ padding: "7px 12px", fontSize: "0.8rem", gap: "4px", display: "flex", alignItems: "center" }}
                    >
                      <Plus size={13} /> Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty state hint */}
      {locations.length === 0 && (
        <div style={{
          textAlign: "center",
          padding: "24px 16px",
          borderRadius: "10px",
          border: "1px dashed var(--color-input-border)",
          color: "var(--color-sidebar-text)",
          fontSize: "0.8rem",
          marginBottom: "16px",
        }}>
          <MapPin size={24} style={{ marginBottom: "8px", opacity: 0.35, display: "inline-block" }} />
          <p style={{ margin: 0 }}>No locations added yet. Select a country above to get started.</p>
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
        <button type="button" onClick={onBack}  className="btn btn--ghost" style={{ flex: 1 }}>Back</button>
        <button type="button" onClick={onSkip}  className="btn btn--ghost" style={{ flex: 1 }}>Skip</button>
        <button type="button" onClick={onNext}  className="btn btn--primary" style={{ flex: 2 }}>Continue</button>
      </div>
    </div>
  );
}
