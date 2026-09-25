import { Navigate, useLocation } from "react-router-dom";
import { isModuleAuthenticated, clearModuleAuth, isProfileNameComplete } from "@food/utils/auth";

/**
 * Role-based Protected Route Component
 * Only allows access if user is authenticated for the specific module and profile is complete
 */
export default function ProtectedRoute({ children, requiredRole, loginPath }) {
  const location = useLocation();

  // If no role required, allow access
  if (!requiredRole) {
    return children;
  }

  const effectiveLoginPath = loginPath || (
    requiredRole === "seller" ? "/seller/auth" :
    requiredRole === "restaurant" ? "/food/restaurant/login" :
    requiredRole === "admin" ? "/admin/login" :
    requiredRole === "delivery" ? "/delivery/auth" :
    "/user/auth/login"
  );

  const isAuthenticated = isModuleAuthenticated(requiredRole);

  // If not authenticated for this module, redirect to login
  if (!isAuthenticated) {
    if (requiredRole === "user") {
      clearModuleAuth("user");
    }
    return <Navigate to={effectiveLoginPath} state={{ from: location.pathname }} replace />;
  }

  if (requiredRole === "user") {
    const userStr = localStorage.getItem("user_user") || localStorage.getItem("user");
    let user = null;
    if (userStr) {
      try { user = JSON.parse(userStr); } catch (e) {}
    }
    if (!isProfileNameComplete(user)) {
      clearModuleAuth("user");
      return <Navigate to={effectiveLoginPath} state={{ from: location.pathname }} replace />;
    }
  }

  return children;
}
