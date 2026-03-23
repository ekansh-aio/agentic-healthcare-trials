/**
 * Auth Context
 * Owner: Frontend Dev 1
 *
 * Provides authentication state, role-based routing,
 * and company context to the entire application.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authAPI } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore session from localStorage
    const token = localStorage.getItem("token");
    const stored = localStorage.getItem("user");
    if (token && stored) {
      try {
        setUser(JSON.parse(stored));
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
      token: data.access_token,
    };
    localStorage.setItem("token", data.access_token);
    localStorage.setItem("user", JSON.stringify(userData));
    setUser(userData);
    return userData;
  }, []);

  // Used by OnboardingPage after registration + login to hydrate the context
  // without making a second network call.
  const hydrateUser = useCallback((userData) => {
    localStorage.setItem("token", userData.token);
    localStorage.setItem("user", JSON.stringify(userData));
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.clear();
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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}