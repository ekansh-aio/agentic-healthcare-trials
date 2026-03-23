import React, { useRef, useState } from "react";
import { Upload, X } from "lucide-react";

/**
 * Step 0 — Company Info
 * Collects company name, industry, and optional logo upload.
 *
 * Props:
 *   form         {object}    — shared form state { company_name, industry }
 *   updateForm   {function}  — (key, value) => void
 *   logoFile     {File|null} — lifted to OnboardingPage so handleTrain can upload it
 *   setLogoFile  {function}  — (File|null) => void
 *   onNext       {function}  — advance to step 1
 *   setError     {function}  — surface errors to parent
 */
export default function CompanyInfoStep({ form, updateForm, logoFile, setLogoFile, onNext, setError }) {
  const logoInputRef = useRef(null);

  // logoPreview is UI-only state — derived from logoFile, not needed by parent
  const [logoPreview, setLogoPreview] = useState(null);

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/jpg", "image/svg+xml"].includes(file.type)) {
      setError("Logo must be a JPEG, PNG, or SVG file.");
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
    setError("");
  };

  const clearLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    if (logoInputRef.current) logoInputRef.current.value = "";
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold" style={{ color: "var(--color-input-text)" }}>Company Info</h2>
        <p className="text-sm mt-1" style={{ color: "var(--color-sidebar-text)" }}>
          Set up your company profile.
        </p>
      </div>

      <input
        placeholder="Company Name *"
        value={form.company_name}
        onChange={(e) => updateForm("company_name", e.target.value)}
        className="field-input"
      />
      <input
        placeholder="Industry (e.g. SaaS, Retail, Finance)"
        value={form.industry}
        onChange={(e) => updateForm("industry", e.target.value)}
        className="field-input"
      />

      {/* Logo upload */}
      <div>
        <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-input-text)" }}>
          Company Logo (optional)
        </label>

        {!logoPreview ? (
          <button
            onClick={() => logoInputRef.current?.click()}
            className="w-full border-2 border-dashed rounded-lg py-8 flex flex-col items-center gap-2 transition-colors"
            style={{ borderColor: "var(--color-input-border)", backgroundColor: "transparent" }}
          >
            <Upload size={24} style={{ color: "var(--color-sidebar-text)" }} />
            <span className="text-sm" style={{ color: "var(--color-sidebar-text)" }}>
              Click to upload JPEG, PNG, or SVG
            </span>
          </button>
        ) : (
          <div
            className="flex items-center gap-3 p-3 rounded-lg border"
            style={{ borderColor: "var(--color-input-border)", backgroundColor: "var(--color-page-bg)" }}
          >
            <img src={logoPreview} alt="logo preview" className="w-10 h-10 rounded-lg object-cover" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: "var(--color-input-text)" }}>
                {logoFile?.name}
              </p>
              <p className="text-xs" style={{ color: "var(--color-sidebar-text)" }}>
                {(logoFile?.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <button onClick={clearLogo} className="btn--icon">
              <X size={14} />
            </button>
          </div>
        )}

        <input
          ref={logoInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/svg+xml"
          onChange={handleLogoChange}
          className="hidden"
        />
      </div>

      <button
        onClick={onNext}
        disabled={!form.company_name}
        className="btn--primary-full"
      >
        Next: Admin Account →
      </button>
    </div>
  );
}