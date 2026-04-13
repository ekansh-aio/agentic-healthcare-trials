/**
 * Step 1 — Admin Account
 * Collects name, email, password for the primary admin user.
 * Validates fields locally, then checks email availability via API before advancing.
 * Actual full registration is deferred to Step 5 (handleTrain).
 *
 * Props:
 *   form         {object}   — shared form state { admin_name, admin_email, admin_password }
 *   updateForm   {function} — (key, value) => void
 *   loading      {boolean}  — unused here, kept for prop-shape consistency
 *   onBack       {function} — navigate back to step 0
 *   onRegister   {function} — advances to step 2
 *   setError     {function} — surface errors to parent (shown in parent's error banner)
 */
import { useState } from "react";
import { authAPI } from "../../../services/api";
import { Loader2 } from "lucide-react";

export default function AdminAccountStep({ form, updateForm, loading, onBack, onRegister, setError }) {
  const [checking, setChecking] = useState(false);

  const handleRegister = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!form.admin_name.trim()) {
      setError("Full name is required.");
      return;
    }
    if (!emailRegex.test(form.admin_email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (form.admin_password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    // Check email availability before advancing
    setChecking(true);
    setError("");
    try {
      await authAPI.checkEmail(form.admin_email);
    } catch (err) {
      if (err.message === "email_exists") {
        setError("An account with this email already exists. Please sign in instead.");
      } else {
        setError(err.message || "Unable to verify email. Please try again.");
      }
      setChecking(false);
      return;
    }
    setChecking(false);
    onRegister();
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold" style={{ color: "var(--color-input-text)" }}>Study Coordinator Account</h2>
        <p className="text-sm mt-1" style={{ color: "var(--color-sidebar-text)" }}>
          Register the primary study coordinator (required).
        </p>
      </div>

      <input
        placeholder="Full Name *"
        value={form.admin_name}
        onChange={(e) => updateForm("admin_name", e.target.value)}
        className="field-input"
      />
      <input
        placeholder="Email *"
        type="email"
        value={form.admin_email}
        onChange={(e) => updateForm("admin_email", e.target.value)}
        className="field-input"
      />
      <input
        placeholder="Password * (min. 8 characters)"
        type="password"
        value={form.admin_password}
        onChange={(e) => updateForm("admin_password", e.target.value)}
        className="field-input"
      />

      <div className="flex gap-3 pt-1">
        <button onClick={onBack} className="btn--ghost flex-1 py-3" disabled={checking}>
          ← Back
        </button>
        <button
          onClick={handleRegister}
          disabled={checking || !form.admin_email || !form.admin_password || !form.admin_name}
          className="btn--primary flex-1 py-3"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}
        >
          {checking
            ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Checking…</>
            : "Save & Continue →"}
        </button>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
