/**
 * Auth Context
 * Owner: Frontend Dev 1
 *
 * Provides authentication state, role-based routing,
 * and company context to the entire application.
 *
 * Brand theming is applied here because every session entry point
 * (page refresh and explicit login) flows through this file.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authAPI, brandKitAPI } from "../services/api";
import { applyBrandTheme, resetBrandTheme, isDefaultThemeOverrideActive, getCachedBrandTheme } from "../services/theme";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token  = localStorage.getItem("token");
    const stored = localStorage.getItem("user");

    if (token && stored) {
      try {
        setUser(JSON.parse(stored));

        if (!isDefaultThemeOverrideActive()) {
          // 1. Restore cached theme instantly — zero flash on refresh.
          const cached = getCachedBrandTheme();
          if (cached) applyBrandTheme(cached);

          // 2. Refresh from API in the background; update if anything changed.
          brandKitAPI.get()
            .then((brandKit) => applyBrandTheme(brandKit))
            .catch(() => {});
        }
      } catch {
        localStorage.clear();
      }
    } else {
      // No active session — reset to platform default for the login page.
      // This ensures a logged-out browser never shows a previous company's theme.
      resetBrandTheme();
    }

    setLoading(false);
  }, []);

  const login = useCallback(async (email, password, company, role) => {
    const data = await authAPI.login(email, password, company, role);
    const userData = {
      id: data.user_id,
      role: data.role,
      companyId: data.company_id,
      companyName: data.company_name,
      companyIndustry: data.company_industry || null,
      token: data.access_token,
      onboarded: data.onboarded ?? false,
    };
    localStorage.setItem("token", data.access_token);
    localStorage.setItem("user", JSON.stringify(userData));
    setUser(userData);

    // Fetch and apply brand theme after login — skip if user prefers default.
    // applyBrandTheme also caches the kit in localStorage so it survives refresh.
    if (!isDefaultThemeOverrideActive()) {
      brandKitAPI.get()
        .then((brandKit) => applyBrandTheme(brandKit))
        .catch(() => {});
    }

    return userData;
  }, []);

  // Used by OnboardingPage after registration + login to hydrate the context
  // without making a second network call.
  // Theme is applied by OnboardingPage directly (it already has the brand data),
  // so no brand fetch needed here.
  const hydrateUser = useCallback((userData) => {
    localStorage.setItem("token", userData.token);
    localStorage.setItem("user", JSON.stringify(userData));
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.clear();
    // clearFlag=true removes the override so the next company starts fresh.
    resetBrandTheme({ clearFlag: true });
    setUser(null);
  }, []);

  const value = {
    user,
    loading,
    login,
    logout,
    hydrateUser,
    isAuthenticated: !!user,
    role: user?.role,
    companyId: user?.companyId,
    companyName: user?.companyName,
    companyIndustry: user?.companyIndustry || null,
    onboarded: user?.onboarded ?? true,  // default true for sessions predating this field
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}