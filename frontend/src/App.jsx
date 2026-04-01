/**
 * App Entry — Routing Configuration
 *
 * All routes are role-protected. Each dashboard module is loaded independently.
 */

import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { GenerationProvider } from "./contexts/GenerationContext";
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
import ReviewerCampaignDetail from "./components/reviewer/ReviewDetailPage";

// Ethics
import EthicsDashboard from "./components/ethics/EthicsDashboard";

// Publisher
import PublisherDashboard from "./components/publisher/PublisherDashboard";

// Analytics (shared)
import AnalyticsPage from "./components/analytics/AnalyticsPage";

const ALL_ROLES = ["study_coordinator", "project_manager", "ethics_manager", "publisher"];

function AppRoutes() {
  const { isAuthenticated, role } = useAuth();

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />

      {/* Study Coordinator routes */}
      <Route path="/study-coordinator" element={<ProtectedRoute allowedRoles={["study_coordinator"]}><AdminDashboard /></ProtectedRoute>} />
      <Route path="/study-coordinator/create" element={<ProtectedRoute allowedRoles={["study_coordinator"]}><CampaignCreator /></ProtectedRoute>} />
      <Route path="/study-coordinator/users" element={<ProtectedRoute allowedRoles={["study_coordinator"]}><UserManagement /></ProtectedRoute>} />
      <Route path="/study-coordinator/company" element={<ProtectedRoute allowedRoles={["study_coordinator"]}><MyCompany /></ProtectedRoute>} />
      <Route path="/study-coordinator/analytics" element={<ProtectedRoute allowedRoles={["study_coordinator"]}><AnalyticsPage /></ProtectedRoute>} />

      {/* Campaign detail — accessible by all roles since project_manager/publisher/ethics also need it */}
      <Route path="/study-coordinator/campaign/:id" element={<ProtectedRoute allowedRoles={ALL_ROLES}><CampaignDetailPage /></ProtectedRoute>} />

      {/* Project Manager routes */}
      <Route path="/project-manager" element={<ProtectedRoute allowedRoles={["project_manager"]}><ReviewerDashboard /></ProtectedRoute>} />
      <Route path="/project-manager/queue" element={<ProtectedRoute allowedRoles={["project_manager"]}><ReviewerDashboard /></ProtectedRoute>} />
      <Route path="/project-manager/analytics" element={<ProtectedRoute allowedRoles={["project_manager"]}><AnalyticsPage /></ProtectedRoute>} />
      <Route path="/project-manager/campaign/:id" element={<ProtectedRoute allowedRoles={["project_manager"]}><ReviewerCampaignDetail /></ProtectedRoute>} />

      {/* Ethics routes */}
      <Route path="/ethics" element={<ProtectedRoute allowedRoles={["ethics_manager"]}><EthicsDashboard /></ProtectedRoute>} />
      <Route path="/ethics/review" element={<ProtectedRoute allowedRoles={["ethics_manager"]}><EthicsDashboard /></ProtectedRoute>} />
      <Route path="/ethics/documents" element={<ProtectedRoute allowedRoles={["ethics_manager"]}><EthicsDashboard /></ProtectedRoute>} />
      <Route path="/ethics/campaign/:id" element={<ProtectedRoute allowedRoles={["ethics_manager"]}><CampaignDetailPage /></ProtectedRoute>} />

      {/* Publisher routes */}
      <Route path="/publisher" element={<ProtectedRoute allowedRoles={["publisher"]}><PublisherDashboard /></ProtectedRoute>} />
      <Route path="/publisher/deploy" element={<ProtectedRoute allowedRoles={["publisher"]}><PublisherDashboard /></ProtectedRoute>} />
      <Route path="/publisher/distribute" element={<ProtectedRoute allowedRoles={["publisher"]}><PublisherDashboard /></ProtectedRoute>} />
      <Route path="/publisher/analytics" element={<ProtectedRoute allowedRoles={["publisher"]}><PublisherDashboard /></ProtectedRoute>} />
      <Route path="/publisher/campaign/:id" element={<ProtectedRoute allowedRoles={["publisher"]}><CampaignDetailPage /></ProtectedRoute>} />

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
      <Route path="*" element={<Navigate to={isAuthenticated ? `/${role === "ethics_manager" ? "ethics" : role === "study_coordinator" ? "study-coordinator" : role === "project_manager" ? "project-manager" : role}` : "/login"} />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <GenerationProvider>
          <AppRoutes />
        </GenerationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}