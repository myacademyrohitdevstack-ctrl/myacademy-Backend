const asyncHandler = require("../Utils/asyncHandler");
const {
  assertResourceLimit,
  assertFeatureEnabled,
  getAcademySubscription,
} = require("../Utils/planEnforcer");

/**
 * Middleware that blocks any write operations if the academy subscription is expired or inactive.
 */
const requireActiveSubscription = asyncHandler(async (req, res, next) => {
  // Super Admins operate globally and are not bound by tenant subscriptions
  if (req.user?.platformRole === "super_admin") {
    return next();
  }

  if (!req.academy?._id) {
    return res.status(403).json({
      success: false,
      message: "No academy context found for subscription check.",
    });
  }

  const subInfo = await getAcademySubscription(req.academy._id);

  if (!subInfo.isActive) {
    return res.status(403).json({
      success: false,
      code: subInfo.code || "SUBSCRIPTION_INACTIVE",
      message: subInfo.reason,
    });
  }

  req.subscriptionInfo = subInfo;
  next();
});

/**
 * Higher-order middleware to enforce specific resource quotas.
 */
const requireResourceQuota = (resourceType, getCount = () => 1) => {
  return asyncHandler(async (req, res, next) => {
    if (req.user?.platformRole === "super_admin") {
      return next();
    }

    const count = typeof getCount === "function" ? getCount(req) : getCount;
    await assertResourceLimit(req.academy._id, resourceType, count);
    next();
  });
};

/**
 * Higher-order middleware to enforce feature flag permissions.
 */
const requireFeature = (featureKey) => {
  return asyncHandler(async (req, res, next) => {
    if (req.user?.platformRole === "super_admin") {
      return next();
    }

    await assertFeatureEnabled(req.academy._id, featureKey);
    next();
  });
};

module.exports = {
  requireActiveSubscription,
  requireResourceQuota,
  requireFeature,
};
