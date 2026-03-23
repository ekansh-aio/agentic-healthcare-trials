/**
 * M9: Onboarding UI
 * Owner: Frontend Dev 1
 * Dependencies: onboardingAPI, authAPI, brandKitAPI, AuthContext
 *
 * Orchestrator only — state, API calls, and navigation logic.
 * Each step's UI lives in its own file under ./steps/.
 *
 * "Start Training" sequence (handleTrain):
 *   1. Register company + admin
 *   2. Login with company + role → set token in localStorage → hydrate AuthContext
 *   3. Upload logo (if provided)
 *   4. Upload documents one by one
 *   5. Create brand kit
 *   6. [PENDING] Trigger skill training — skipped until backend skills are ready
 */

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { onboardingAPI, authAPI, brandKitAPI } from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";
import { X } from "lucide-react";

import StepIndicator       from "./StepIndicator";
import CompanyInfoStep     from "./steps/CompanyInfoStep";
import AdminAccountStep    from "./steps/AdminAccountStep";
import UploadDocumentsStep from "./steps/UploadDocumentsStep";
import BrandKitStep        from "./steps/BrandKitStep";
import AITrainingStep      from "./steps/AiTrainingStep";
import ErrorBoundary       from "./ErrorBoundary";

function useHighWaterMark(step) {
  const [hwm, setHwm] = useState(0);
  React.useEffect(() => {
    setHwm((prev) => Math.max(prev, step));
  }, [step]);
  return hwm;
}

// Map backend error codes to user-friendly messages.
// Both cases tell the user to sign in — they already have an account.
const REGISTRATION_ERRORS = {
  company_exists: "This company is already registered. Please sign in instead.",
  email_exists:   "An account with this email already exists. Please sign in instead.",
};

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { hydrateUser } = useAuth();

  // ── Wizard state ──────────────────────────────────────────────────────────
  const [step,      setStep]      = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [companyId, setCompanyId] = useState(null);

  // When true, show "Sign in" CTA alongside the error message
  const [showSignIn, setShowSignIn] = useState(false);

  const highWaterMark = useHighWaterMark(step);

  // ── Step 0 & 1: shared form ───────────────────────────────────────────────
  const [form, setForm] = useState({
    company_name:   "",
    industry:       "",
    admin_email:    "",
    admin_password: "",
    admin_name:     "",
  });
  const updateForm = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  // logoFile lifted from CompanyInfoStep — needed in handleTrain for upload
  const [logoFile, setLogoFile] = useState(null);

  // ── Step 2: documents ─────────────────────────────────────────────────────
  // Each entry: { doc_type, title, file, file_name, file_size, file_type }
  const [docs, setDocs] = useState([]);

  // ── Step 3: brand kit ─────────────────────────────────────────────────────
  const [brand, setBrand] = useState({
    primaryColor:   "#10b981",
    secondaryColor: "#0f172a",
    accentColor:    "#6366f1",
    primaryFont:    "DM Sans",
    secondaryFont:  "Merriweather",
    adjectives:     "",
    dos:            "",
    donts:          "",
  });
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [brandPdfFile,   setBrandPdfFile]   = useState(null);

  // ── Step 4: training ──────────────────────────────────────────────────────
  const [trainingDone, setTrainingDone] = useState(false);

  // ── Navigation ────────────────────────────────────────────────────────────
  const goToStep = (i) => {
    if (i <= highWaterMark) { setError(""); setShowSignIn(false); setStep(i); }
  };

  // Step 1 — validation is handled inside AdminAccountStep.
  // This only runs after validation passes.
  const handleAdvanceFromAdmin = () => {
    setError("");
    setShowSignIn(false);
    setStep(2);
  };

  // ── Finish Setup ──────────────────────────────────────────────────────────
  const handleTrain = async () => {
    setLoading(true);
    setError("");
    setShowSignIn(false);
    try {
      // 1. Register company + admin.
      //    Backend returns 409 with detail "company_exists" or "email_exists"
      //    for duplicates — both are handled below in the catch block.
      const registerRes = await onboardingAPI.register({
        company_name:   form.company_name,
        industry:       form.industry,
        logo_url:       null,
        admin_email:    form.admin_email,
        admin_password: form.admin_password,
        admin_name:     form.admin_name,
      });
      setCompanyId(registerRes.company_id);

      // 2. Login — backend verifies company name and role.
      const loginRes = await authAPI.login(
        form.admin_email,
        form.admin_password,
        form.company_name,
        "admin",
      );

      // 3. Persist token to localStorage immediately so that uploadLogo and
      //    uploadDocument can read it synchronously.
      localStorage.setItem("token", loginRes.access_token);

      // 4. Hydrate AuthContext so ProtectedRoute allows the /admin redirect.
      hydrateUser({
        id:          loginRes.user_id,
        role:        loginRes.role,
        companyId:   loginRes.company_id,
        companyName: loginRes.company_name,
        token:       loginRes.access_token,
      });

      // 5. Upload logo — token is now in localStorage so auth header is set.
      if (logoFile) {
        await onboardingAPI.uploadLogo(logoFile);
      }

      // 6. Upload documents one by one.
      for (const doc of docs) {
        await onboardingAPI.uploadDocument(
          doc.doc_type,
          doc.title,
          null,
          doc.file,
        );
      }

      // 7. Create brand kit.
      await brandKitAPI.create({
        primary_color:   brand.primaryColor,
        secondary_color: brand.secondaryColor,
        accent_color:    brand.accentColor,
        primary_font:    brand.primaryFont,
        secondary_font:  brand.secondaryFont,
        adjectives:      brand.adjectives || null,
        dos:             brand.dos || null,
        donts:           brand.donts || null,
        preset_name:     selectedPreset || null,
      });

      // 8. TODO: Trigger AI skill initialization.
      //    Skipped until skill templates are available on the backend.
      //    Re-enable once /api/onboarding/train is fully implemented:
      //    await onboardingAPI.triggerTraining();

      setTrainingDone(true);
    } catch (err) {
      const code = err?.message?.trim();
      if (REGISTRATION_ERRORS[code]) {
        setError(REGISTRATION_ERRORS[code]);
        setShowSignIn(true);
      } else {
        setError(code || "Setup failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "1.5rem",
      backgroundColor: "var(--color-sidebar-bg)",
      backgroundImage: `linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)`,
      backgroundSize: "48px 48px",
    }}>
      <div style={{ width: "100%", maxWidth: "32rem" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginBottom: "40px" }}>
          <div style={{
            width: "32px", height: "32px", borderRadius: "8px",
            backgroundColor: "var(--color-accent)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{ width: "12px", height: "12px", borderRadius: "3px", backgroundColor: "var(--color-sidebar-bg)" }} />
          </div>
          <span style={{ color: "#ffffff", fontWeight: 600, fontSize: "1.125rem", letterSpacing: "-0.02em" }}>
            AgenticMarketing
          </span>
        </div>

        <StepIndicator currentStep={step} onStepClick={goToStep} />

        <div className="onboarding-card">
          <div className="onboarding-card__accent-bar" />
          <div className="onboarding-card__body">

            {error && (
              <div className="alert--error mb-6" style={{ flexDirection: "column", alignItems: "flex-start", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <X size={14} className="shrink-0" /> {error}
                </div>
                {showSignIn && (
                  <a
                    href="/login"
                    style={{
                      fontSize: "0.8rem", fontWeight: 600,
                      color: "var(--color-sidebar-text-active)",
                      textDecoration: "underline", marginLeft: "20px",
                    }}
                  >
                    Go to Sign In →
                  </a>
                )}
              </div>
            )}

            <ErrorBoundary>
              {step === 0 && (
                <CompanyInfoStep
                  form={form}
                  updateForm={updateForm}
                  logoFile={logoFile}
                  setLogoFile={setLogoFile}
                  onNext={() => setStep(1)}
                  setError={setError}
                />
              )}

              {step === 1 && (
                <AdminAccountStep
                  form={form}
                  updateForm={updateForm}
                  loading={loading}
                  onBack={() => goToStep(0)}
                  onRegister={handleAdvanceFromAdmin}
                  setError={setError}
                />
              )}

              {step === 2 && (
                <UploadDocumentsStep
                  docs={docs}
                  onAddDoc={(entry) => setDocs((p) => [...p, entry])}
                  onRemoveDoc={(i) => setDocs((p) => p.filter((_, idx) => idx !== i))}
                  loading={loading}
                  onBack={() => goToStep(1)}
                  onNext={() => setStep(3)}
                />
              )}

              {step === 3 && (
                <BrandKitStep
                  industry={form.industry}
                  brand={brand}
                  setBrand={setBrand}
                  selectedPreset={selectedPreset}
                  setSelectedPreset={setSelectedPreset}
                  brandPdfFile={brandPdfFile}
                  setBrandPdfFile={setBrandPdfFile}
                  setError={setError}
                  onBack={() => goToStep(2)}
                  onNext={() => setStep(4)}
                  onSkip={() => setStep(4)}
                />
              )}

              {step === 4 && (
                <AITrainingStep
                  loading={loading}
                  trainingDone={trainingDone}
                  onTrain={handleTrain}
                  onBack={() => goToStep(3)}
                  onFinish={() => navigate("/admin")}
                />
              )}
            </ErrorBoundary>

          </div>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: "#4b5563" }}>
          Already have an account?{" "}
          <a href="/login" className="font-medium" style={{ color: "var(--color-sidebar-text-active)" }}>
            Sign in
          </a>
        </p>

      </div>
    </div>
  );
}