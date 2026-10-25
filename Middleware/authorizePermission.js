const { hasPermission, isAcademyOwner } = require("../Utils/permissions");

/**
 * Middleware enforcing that the authenticated user possesses a specific permission.
 * - Platform Super Admins always pass.
 * - Academy Admins (owners) always pass.
 * - Academy Staff must have the specific permission in their user.permissions array.
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required permission: '${permission}'.`,
      });
    }

    next();
  };
};

/**
 * Middleware requiring at least one of the listed permissions.
 */
const requireAnyPermission = (...permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const hasAny = permissions.some((perm) => hasPermission(req.user, perm));
    if (!hasAny) {
      return res.status(403).json({
        success: false,
        message: `Access denied. One of the following permissions is required: ${permissions.join(", ")}.`,
      });
    }

    next();
  };
};

/**
 * Middleware allowing access if user either has one of the specified roles OR has the required permission.
 * E.g., requirePermissionOrRole("students.read", "teacher") allows teachers to view students,
 * while allowing academy_staff with 'students.read' to view them too.
 */
const requirePermissionOrRole = (permission, ...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    // Role check (teacher, student, parent, or admin)
    if (roles.includes(req.user.role)) {
      return next();
    }

    // Permission check (handles super_admin, admin, and academy_staff with permission)
    if (hasPermission(req.user, permission)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: `Access denied. Required permission: '${permission}' or role in [${roles.join(", ")}].`,
    });
  };
};

/**
 * Middleware strictly restricting the route to the verified academy owner (or platform super_admin).
 * Staff members, even with elevated permissions, CANNOT access owner-only routes.
 */
const requireAcademyOwner = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  if (!isAcademyOwner(req.user, req.academy)) {
    return res.status(403).json({
      success: false,
      message: "Access denied. This action is restricted to the academy owner.",
    });
  }

  next();
};

module.exports = {
  requirePermission,
  requireAnyPermission,
  requirePermissionOrRole,
  requireAcademyOwner,
};
