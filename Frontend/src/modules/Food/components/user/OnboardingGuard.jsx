import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useProfile } from "@food/context/ProfileContext";

/**
 * OnboardingGuard checks if preferences have been set.
 * @param {string} mode - 'requirePreferences' (for /home) or 'preventPreferences' (for /preferences)
 */
export default function OnboardingGuard({ children, mode }) {
  const { userProfile, loading } = useProfile();
  const location = useLocation();

  // Retrieve token status from localStorage synchronously
  const isAuthenticated = localStorage.getItem("user_authenticated") === "true";

  // Allow already-onboarded users to revisit preferences via ?edit=true
  const isEditMode = new URLSearchParams(location.search).get("edit") === "true";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/user/auth/login" state={{ from: location.pathname }} replace />;
  }

  // Check preferences status from reactive userProfile
  const hasSetPrefs = userProfile?.hasSetPreferences === true;

  if (mode === "requirePreferences" && !hasSetPrefs) {
    // User hasn't finished onboarding: send them to preferences
    return <Navigate to="/food/user/preferences" replace />;
  }

  if (mode === "preventPreferences" && hasSetPrefs && !isEditMode) {
    // User already finished onboarding and not in edit mode: send them to home
    return <Navigate to="/food/user" replace />;
  }

  return children;
}
