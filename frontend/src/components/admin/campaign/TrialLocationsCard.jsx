import React, { useState, useEffect } from "react";
import { MapPin, Plus, ChevronDown, X as XIcon, Loader2, CheckCircle2 } from "lucide-react";
import { SectionCard } from "../../shared/Layout";
import { adsAPI } from "../../../services/api";

// ─── Trial Locations Card ─────────────────────────────────────────────────────
export default function TrialLocationsCard({ ad, companyLocations, onSave }) {
  // locations = [{ country, city }] flat array
  const [locations, setLocations] = useState(ad.trial_location || []);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [error,     setError]     = useState("");

  // Picker state
  const [selCountry, setSelCountry] = useState("");
  const [selCity,    setSelCity]    = useState("");

  useEffect(() => { setLocations(ad.trial_location || []); }, [ad.trial_location]);

  // Group flat array into { country → Set<city> } for display
  const grouped = locations.reduce((acc, loc) => {
    if (!acc[loc.country]) acc[loc.country] = [];
    if (loc.city) acc[loc.country].push(loc.city);
    return acc;
  }, {});
  const groupedCountries = Object.keys(grouped);

  // Cities already added for the selected country
  const addedCitiesForSel = new Set(
    locations.filter((l) => l.country === selCountry && l.city).map((l) => l.city)
  );

  // Available cities from company config for selected country (minus already added)
  const companyCitiesForSel = (
    companyLocations.find((c) => c.country === selCountry)?.cities || []
  ).filter((c) => !addedCitiesForSel.has(c));

  // Whether this country already appears in the flat list (no city entry = whole country)
  const countryHasNoCityEntry = (country) =>
    locations.some((l) => l.country === country && !l.city);

  const handleAdd = () => {
    if (!selCountry) return;
    // Prevent exact duplicate
    const isDup = locations.some(
      (l) => l.country === selCountry && (l.city || "") === (selCity || "")
    );
    if (isDup) { setSelCity(""); return; }
    setLocations((prev) => [...prev, { country: selCountry, city: selCity }]);
    setSelCity("");
    setSaved(false);
  };

  // Remove a specific city entry for a country
  const handleRemoveCity = (country, city) => {
    setLocations((prev) =>
      prev.filter((l) => !(l.country === country && (l.city || "") === (city || "")))
    );
    setSaved(false);
  };

  // Remove all entries for a country
  const handleRemoveCountry = (country) => {
    setLocations((prev) => prev.filter((l) => l.country !== country));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true); setError(""); setSaved(false);
    try {
      const updated = await adsAPI.update(ad.id, { trial_location: locations });
      onSave(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message || "Failed to save locations.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title="Trial Locations"
      subtitle="Countries and cities where this trial is taking place"
    >
      {/* Grouped display */}
      {groupedCountries.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
          {groupedCountries.map((country) => (
            <div
              key={country}
              style={{
                borderRadius: "10px",
                border: "1px solid var(--color-card-border)",
                overflow: "hidden",
              }}
            >
              {/* Country header */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px",
                backgroundColor: "rgba(16,185,129,0.07)",
                borderBottom: grouped[country].length > 0
                  ? "1px solid var(--color-card-border)" : "none",
              }}>
                <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.82rem", fontWeight: 600, color: "var(--color-accent)" }}>
                  <MapPin size={12} />
                  {country}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveCountry(country)}
                  title="Remove country"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-sidebar-text)", display: "flex", padding: "2px" }}
                >
                  <XIcon size={13} />
                </button>
              </div>

              {/* City chips */}
              {grouped[country].length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", padding: "10px 12px" }}>
                  {grouped[country].map((city) => (
                    <span
                      key={city}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: "5px",
                        padding: "3px 9px", borderRadius: "999px", fontSize: "0.76rem",
                        backgroundColor: "var(--color-card-bg)",
                        border: "1px solid var(--color-card-border)",
                        color: "var(--color-text)", fontWeight: 500,
                      }}
                    >
                      {city}
                      <button
                        type="button"
                        onClick={() => handleRemoveCity(country, city)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-sidebar-text)", padding: 0, display: "flex" }}
                      >
                        <XIcon size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "12px 14px", borderRadius: "8px", marginBottom: "16px",
          border: "1px dashed var(--color-card-border)",
          color: "var(--color-sidebar-text)", fontSize: "0.82rem",
        }}>
          <MapPin size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
          No trial locations assigned yet.
        </div>
      )}

      {/* Add picker */}
      {companyLocations.length === 0 ? (
        <p style={{ fontSize: "0.8rem", color: "var(--color-sidebar-text)", marginBottom: "16px" }}>
          No locations configured in My Company. Add them first under <strong>My Company → Operating Locations</strong>.
        </p>
      ) : (
        <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", marginBottom: "16px", flexWrap: "wrap" }}>
          {/* Country */}
          <div style={{ flex: "1 1 150px" }}>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--color-sidebar-text)", marginBottom: "4px" }}>
              Country
            </label>
            <div style={{ position: "relative" }}>
              <select
                value={selCountry}
                onChange={(e) => { setSelCountry(e.target.value); setSelCity(""); }}
                className="field-input"
                style={{ appearance: "none", paddingRight: "28px", marginBottom: 0 }}
              >
                <option value="">Select…</option>
                {companyLocations.map((l) => (
                  <option key={l.country} value={l.country}>{l.country}</option>
                ))}
              </select>
              <ChevronDown size={12} style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", color: "var(--color-sidebar-text)", pointerEvents: "none" }} />
            </div>
          </div>

          {/* City */}
          <div style={{ flex: "1 1 150px" }}>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--color-sidebar-text)", marginBottom: "4px" }}>
              City <span style={{ fontWeight: 400, opacity: 0.7 }}>(optional)</span>
            </label>
            {selCountry && companyCitiesForSel.length > 0 ? (
              <div style={{ position: "relative" }}>
                <select
                  value={selCity}
                  onChange={(e) => setSelCity(e.target.value)}
                  className="field-input"
                  style={{ appearance: "none", paddingRight: "28px", marginBottom: 0 }}
                >
                  <option value="">Whole country</option>
                  {companyCitiesForSel.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown size={12} style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", color: "var(--color-sidebar-text)", pointerEvents: "none" }} />
              </div>
            ) : (
              <input
                value={selCity}
                onChange={(e) => setSelCity(e.target.value)}
                disabled={!selCountry}
                placeholder={selCountry ? "Enter city (optional)…" : "Select country first"}
                className="field-input"
                style={{ marginBottom: 0 }}
              />
            )}
          </div>

          <button
            type="button"
            onClick={handleAdd}
            disabled={!selCountry}
            className="btn--accent"
            style={{ padding: "9px 16px", flexShrink: 0 }}
          >
            <Plus size={14} /> Add
          </button>
        </div>
      )}

      {/* Error */}
      {error && <div className="alert--error mb-3">{error}</div>}

      {/* Save row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "12px" }}>
        {saved && (
          <div className="alert--success py-2 px-3">
            <CheckCircle2 size={13} strokeWidth={2.5} /> Locations saved
          </div>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn--accent"
          style={{ padding: "8px 20px" }}
        >
          {saving ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : "Save Locations"}
        </button>
      </div>
    </SectionCard>
  );
}
