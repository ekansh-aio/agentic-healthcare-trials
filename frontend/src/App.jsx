/**
 * App Entry — Routing Configuration
 *
 * All routes are role-protected. Each dashboard module is loaded independently.
 */

import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/shared/Layout";

// Auth
import LoginPage from "./components/auth/LoginPage";
import OnboardingPage from "./components/onboarding/OnboardingPage";

// Admin
import AdminDashboard from "./components/admin/AdminDashboard";
import CampaignCreator from "./components/admin/CampaignCreator";
import CampaignDetailPage from "./components/admin/CampaignDetailPage";
import UserManagement from "./components/admin/UserManagement";
import MyCompany from "./components/admin/MyCompany";

// Reviewer
import ReviewerDashboard from "./components/reviewer/ReviewerDashboard";

// Ethics
import EthicsDashboard from "./components/ethics/EthicsDashboard";

// Publisher
import PublisherDashboard from "./components/publisher/PublisherDashboard";

// Analytics (shared)
import AnalyticsPage from "./components/analytics/AnalyticsPage";

const ALL_ROLES = ["admin", "reviewer", "ethics_reviewer", "publisher"];

function AppRoutes() {
  const { isAuthenticated, role } = useAuth();

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />

      {/* Admin routes */}
      <Route path="/admin" element={<ProtectedRoute allowedRoles={["admin"]}><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/create" element={<ProtectedRoute allowedRoles={["admin"]}><CampaignCreator /></ProtectedRoute>} />
      <Route path="/admin/users" element={<ProtectedRoute allowedRoles={["admin"]}><UserManagement /></ProtectedRoute>} />
      <Route path="/admin/company" element={<ProtectedRoute allowedRoles={["admin"]}><MyCompany /></ProtectedRoute>} />
      <Route path="/admin/analytics" element={<ProtectedRoute allowedRoles={["admin"]}><AnalyticsPage /></ProtectedRoute>} />

      {/* Campaign detail — accessible by all roles since reviewer/publisher/ethics also need it */}
      <Route path="/admin/campaign/:id" element={<ProtectedRoute allowedRoles={ALL_ROLES}><CampaignDetailPage /></ProtectedRoute>} />

      {/* Reviewer routes */}
      <Route path="/reviewer" element={<ProtectedRoute allowedRoles={["reviewer"]}><ReviewerDashboard /></ProtectedRoute>} />
      <Route path="/reviewer/queue" element={<ProtectedRoute allowedRoles={["reviewer"]}><ReviewerDashboard /></ProtectedRoute>} />
      <Route path="/reviewer/analytics" element={<ProtectedRoute allowedRoles={["reviewer"]}><AnalyticsPage /></ProtectedRoute>} />

      {/* Ethics routes */}
      <Route path="/ethics" element={<ProtectedRoute allowedRoles={["ethics_reviewer"]}><EthicsDashboard /></ProtectedRoute>} />
      <Route path="/ethics/review" element={<ProtectedRoute allowedRoles={["ethics_reviewer"]}><EthicsDashboard /></ProtectedRoute>} />
      <Route path="/ethics/documents" element={<ProtectedRoute allowedRoles={["ethics_reviewer"]}><EthicsDashboard /></ProtectedRoute>} />

      {/* Publisher routes */}
      <Route path="/publisher" element={<ProtectedRoute allowedRoles={["publisher"]}><PublisherDashboard /></ProtectedRoute>} />
      <Route path="/publisher/ads" element={<ProtectedRoute allowedRoles={["publisher"]}><PublisherDashboard /></ProtectedRoute>} />
      <Route path="/publisher/website" element={<ProtectedRoute allowedRoles={["publisher"]}><PublisherDashboard /></ProtectedRoute>} />
      <Route path="/publisher/bots" element={<ProtectedRoute allowedRoles={["publisher"]}><PublisherDashboard /></ProtectedRoute>} />
      <Route path="/publisher/analytics" element={<ProtectedRoute allowedRoles={["publisher"]}><AnalyticsPage /></ProtectedRoute>} />

      {/* Unauthorized */}
      <Route path="/unauthorized" element={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900">403</h1>
            <p className="text-gray-500 mt-2">You don't have permission to access this page</p>
          </div>
        </div>
      } />

      {/* Default redirect */}
      <Route path="*" element={<Navigate to={isAuthenticated ? `/${role === "ethics_reviewer" ? "ethics" : role}` : "/login"} />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}