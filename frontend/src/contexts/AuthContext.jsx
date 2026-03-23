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
import { applyBrandTheme, resetBrandTheme } from "../services/theme";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Always start from a clean default theme. This ensures the login page
    // never inherits a previous session's brand colors. Theme is only applied
    // after a confirmed valid session is found below.
    resetBrandTheme();

    const token = localStorage.getItem("token");
    const stored = localStorage.getItem("user");

    if (token && stored) {
      try {
        setUser(JSON.parse(stored));
        // Fire-and-forget — theme application is non-critical.
        // If the brand kit fetch fails, the app still loads with default theme.
        brandKitAPI.get()
          .then((brandKit) => applyBrandTheme(brandKit))
          .catch(() => {});
      } catch {
        localStorage.clear();
      }
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
    };
    localStorage.setItem("token", data.access_token);
    localStorage.setItem("user", JSON.stringify(userData));
    setUser(userData);

    // Fetch and apply brand theme after login.
    // Token is already in localStorage so brandKitAPI.get() is authenticated.
    brandKitAPI.get()
      .then((brandKit) => applyBrandTheme(brandKit))
      .catch(() => {});

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
    resetBrandTheme();
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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}