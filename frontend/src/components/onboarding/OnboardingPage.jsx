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
import { X } from "lucide-react";

import { onboardingAPI, authAPI, brandKitAPI, companyAPI } from "../../services/api";
import { applyBrandTheme } from "../../services/theme";

import { useAuth } from "../../contexts/AuthContext";

import StepIndicator       from "./StepIndicator";
import CompanyInfoStep     from "./steps/CompanyInfoStep";
import AdminAccountStep    from "./steps/AdminAccountStep";
import UploadDocumentsStep from "./steps/UploadDocumentsStep";
import LocationStep        from "./steps/LocationStep";
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

  // ── Step 3: locations ─────────────────────────────────────────────────────
  // Each entry: { country: string, cities: string[] }
  const [locations, setLocations] = useState([]);

  // ── Step 4: brand kit ─────────────────────────────────────────────────────
  const [brand, setBrand] = useState({
    primaryColor:   null,
    secondaryColor: null,
    accentColor:    null,
    primaryFont:    null,
    secondaryFont:  null,
    adjectives:     "",
    dos:            "",
    donts:          "",
  });
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [brandPdfFile,   setBrandPdfFile]   = useState(null);

  // ── Step 5: training ──────────────────────────────────────────────────────
  const [trainingDone,   setTrainingDone]   = useState(false);

  // ── Retry-safe completion flags ───────────────────────────────────────────
  // Track what was saved so a retry skips only truly completed steps and
  // never duplicates uploads. Persists across clicks (component stays mounted).
  const [registered,    setRegistered]    = useState(false);
  const [locationsSaved, setLocationsSaved] = useState(false);
  const [logoSaved,      setLogoSaved]     = useState(false);
  const [savedDocCount,  setSavedDocCount] = useState(0);  // docs uploaded so far
  const [brandKitSaved,  setBrandKitSaved] = useState(false);

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
      // 1. Register company + admin (skip on retry — company already exists).
      if (!registered) {
        const registerRes = await onboardingAPI.register({
          company_name:   form.company_name,
          industry:       form.industry,
          logo_url:       null,
          admin_email:    form.admin_email,
          admin_password: form.admin_password,
          admin_name:     form.admin_name,
        });
        setCompanyId(registerRes.company_id);
        setRegistered(true);
      }

      // 2. Login — always re-login to get a fresh token on each attempt.
      const loginRes = await authAPI.login(
        form.admin_email,
        form.admin_password,
        form.company_name,
        "study_coordinator",
      );

      // 3. Persist token immediately so subsequent API calls use it.
      localStorage.setItem("token", loginRes.access_token);

      // 4. Hydrate AuthContext.
      hydrateUser({
        id:              loginRes.user_id,
        role:            loginRes.role,
        companyId:       loginRes.company_id,
        companyName:     loginRes.company_name,
        companyIndustry: form.industry || null,
        token:           loginRes.access_token,
        onboarded:       false,
      });

      // 5. Save locations (idempotent PATCH — safe to retry).
      //    Skipped only if it already succeeded.
      if (!locationsSaved && locations.length > 0) {
        await companyAPI.updateLocations(locations);
        setLocationsSaved(true);
      }

      // 6. Upload logo (skip on retry if already uploaded).
      if (logoFile && !logoSaved) {
        await onboardingAPI.uploadLogo(logoFile);
        setLogoSaved(true);
      }

      // 7. Upload documents — resume from where we left off on retry.
      //    savedDocCount tracks how many were successfully uploaded.
      for (let i = savedDocCount; i < docs.length; i++) {
        const doc = docs[i];
        await onboardingAPI.uploadDocument(doc.doc_type, doc.title, null, doc.file);
        setSavedDocCount(i + 1);
      }

      // 7. Save operating locations — only if the user added any.
      //    Skipped on retry — locations were already saved.
      if (!companyId && locations.length > 0) {
        await companyAPI.updateLocations(locations);
      }

      // 8. Create brand kit — only if the user made a selection or uploaded a PDF.
      //    If the user skipped, all color fields are null and there is nothing
      //    meaningful to save, so we skip the API call entirely and leave the
      //    platform running on its default theme.
      //    Skipped on retry — brand kit was already created.
      if (!companyId) {
        const hasBrandData = brand.primaryColor || brand.accentColor || brandPdfFile || selectedPreset;
        if (hasBrandData) {
          const createdBrandKit = await brandKitAPI.create({
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
          applyBrandTheme(createdBrandKit);
        }
        setBrandKitSaved(true);
      }

      // 9. Trigger AI skill initialization — marks company onboarded + runs in background.
      //    Always run on every attempt (idempotent — backend checks onboarded flag).
      await onboardingAPI.triggerTraining();

      // Mark onboarded in context so ProtectedRoute allows dashboard access.
      hydrateUser({
        id:              loginRes.user_id,
        role:            loginRes.role,
        companyId:       loginRes.company_id,
        companyName:     loginRes.company_name,
        companyIndustry: form.industry || null,
        token:           loginRes.access_token,
        onboarded:       true,
      });

      setTrainingDone(true);
    } catch (err) {
      const code = err?.message?.trim();
      if (REGISTRATION_ERRORS[code]) {
        setError(REGISTRATION_ERRORS[code]);
        setShowSignIn(true);
      } else if (!code || code === "Failed to fetch" || code === "NetworkError when attempting to fetch resource.") {
        setError("Cannot connect to the server. Make sure the backend is running on port 8000.");
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
            ClinAds Pro
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
                <LocationStep
                  locations={locations}
                  setLocations={setLocations}
                  onBack={() => goToStep(2)}
                  onNext={() => setStep(4)}
                  onSkip={() => setStep(4)}
                />
              )}

              {step === 4 && (
                <BrandKitStep
                  industry={form.industry}
                  brand={brand}
                  setBrand={setBrand}
                  selectedPreset={selectedPreset}
                  setSelectedPreset={setSelectedPreset}
                  brandPdfFile={brandPdfFile}
                  setBrandPdfFile={setBrandPdfFile}
                  setError={setError}
                  onBack={() => goToStep(3)}
                  onNext={() => setStep(5)}
                  onSkip={() => setStep(5)}
                />
              )}

              {step === 5 && (
                <AITrainingStep
                  loading={loading}
                  trainingDone={trainingDone}
                  onTrain={handleTrain}
                  onBack={() => goToStep(4)}
                  onFinish={() => navigate("/study-coordinator")}
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