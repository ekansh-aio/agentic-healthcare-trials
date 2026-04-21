/**
 * M10: Auth UI — Login Page
 * Owner: Frontend Dev 1
 * Dependencies: AuthContext, api.js
 *
 * Role-based sign-in page. Routes to appropriate dashboard after login.
 * Styles: use classes from index.css only — no raw Tailwind color utilities.
 */

import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { LogIn } from "lucide-react";

const ROLE_ROUTES = {
  study_coordinator: "/study-coordinator",
  project_manager: "/project-manager",
  ethics_manager: "/ethics",
  publisher: "/publisher",
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("study_coordinator");
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const user = await login(email, password, company, role);
      navigate(ROLE_ROUTES[user.role] || "/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1.5rem",
      backgroundColor: "var(--color-sidebar-bg)",
      backgroundImage: `linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)`,
      backgroundSize: "48px 48px",
    }}>
      <div style={{ width: "100%", maxWidth: "28rem" }}>

        {/* Brand mark */}
        <div className="flex items-center justify-center mb-10">
          <img src="/alt1_trails_logo.svg" alt="ALT Trials" style={{ height: "56px", width: "auto", display: "block", margin: "0 auto" }} />
        </div>

        {/* Login card */}
        <div className="onboarding-card">
          <div className="onboarding-card__accent-bar" />
          <div className="onboarding-card__body space-y-5">

            <div className="text-center">
              <h1 className="text-xl font-bold" style={{ color: "var(--color-input-text)" }}>
                Sign in to your dashboard
              </h1>
              <p className="text-sm mt-1" style={{ color: "var(--color-sidebar-text)" }}>
                Enter your credentials to continue
              </p>
            </div>

            {error && (
              <div className="alert--error">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-input-text)" }}>
                  Company
                </label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Your company name"
                  required
                  className="field-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-input-text)" }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  className="field-input"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-input-text)" }}>
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="field-input"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-input-text)" }}>
                  Role
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "study_coordinator", label: "Study Coordinator" },
                    { value: "project_manager",   label: "Project Manager" },
                    { value: "ethics_manager",    label: "Ethics Manager" },
                    { value: "publisher",         label: "Publisher" },
                  ].map((r) => {
                    const active = role === r.value;
                    return (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setRole(r.value)}
                        style={{
                          display:         "flex",
                          alignItems:      "center",
                          gap:             "10px",
                          padding:         "10px 14px",
                          borderRadius:    "10px",
                          border:          `1.5px solid ${active ? "var(--color-accent)" : "var(--color-input-border)"}`,
                          backgroundColor: active ? "var(--color-accent-subtle)" : "var(--color-input-bg)",
                          transition:      "border-color 0.15s, background-color 0.15s",
                          textAlign:       "left",
                          width:           "100%",
                        }}
                      >
                        {/* Custom radio dot */}
                        <div style={{
                          width:           "14px",
                          height:          "14px",
                          borderRadius:    "50%",
                          border:          `solid ${active ? "var(--color-accent)" : "var(--color-input-border)"}`,
                          backgroundColor: active ? "var(--color-accent)" : "transparent",
                          display:         "flex",
                          alignItems:      "center",
                          justifyContent:  "center",
                          flexShrink:      0,
                          transition:      "border-color 0.15s, background-color 0.15s",
                          boxShadow:       active ? "0 0 0 3px var(--color-accent-subtle)" : "none",
                        }}>
                          {active && (
                            <div style={{
                              width:           "5px",
                              height:          "5px",
                              borderRadius:    "50%",
                              backgroundColor: "white",
                            }} />
                          )}
                        </div>
                        <span className="text-sm font-medium" style={{ color: "var(--color-input-text)" }}>
                          {r.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button type="submit" disabled={loading || !company || !email || !password} className="btn--primary-full mt-2">
                <LogIn size={18} />
                {loading ? "Signing in…" : "Sign In"}
              </button>
            </form>

            <p className="text-center text-sm" style={{ color: "var(--color-sidebar-text)" }}>
              New company?{" "}
              <Link to="/onboarding" className="font-medium transition-colors"
                style={{ color: "var(--color-accent)" }}>
                Get Started
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}