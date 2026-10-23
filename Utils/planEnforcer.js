const mongoose = require("mongoose");
const AcademySubscription = require("../Modals/AcademySubscription");
const PlatformPlan = require("../Modals/PlatformPlan");
const Academy = require("../Modals/Academy");
const User = require("../Modals/User");
const Course = require("../Modals/Courses");
const Batch = require("../Modals/Batches");

/**
 * Normalizes feature key strings for robust matching.
 * e.g., "Fee Management" -> "feemanagement", "fee_management" -> "feemanagement"
 */
function normalizeFeatureKey(str) {
  const trimmed = String(str || "").trim().toLowerCase();
  if (trimmed === "*" || trimmed === "all") return "*";
  return trimmed.replace(/[^a-z0-9]/g, "");
}

/**
 * Checks if a feature is present in the plan's feature list.
 */
function isFeatureAllowed(featuresList, requestedFeature) {
  if (!Array.isArray(featuresList) || featuresList.length === 0) {
    return true; // If no features are explicitly configured, grant default access
  }

  const normalizedRequested = normalizeFeatureKey(requestedFeature);

  return featuresList.some((f) => {
    const norm = normalizeFeatureKey(f);
    return norm === "*" || norm === normalizedRequested;
  });
}

/**
 * Retrieves the effective subscription, plan, and limits for an academy.
 */
async function getAcademySubscription(academyId) {
  if (!academyId) {
    throw new Error("Academy ID is required for plan validation.");
  }

  // 1. Try to find the latest active or trialing subscription
  let subscription = await AcademySubscription.findOne({
    academyId,
    status: { $in: ["active", "trialing"] },
  })
    .sort({ createdAt: -1 })
    .populate("planId");

  const now = new Date();

  // 2. If found, verify time validity
  if (subscription) {
    // Check if trial has expired
    if (
      subscription.status === "trialing" &&
      subscription.trialEndsAt &&
      new Date(subscription.trialEndsAt) < now
    ) {
      return {
        subscription,
        plan: subscription.planId,
        limits: subscription.planId?.limits || {},
        features: subscription.planId?.features || [],
        isActive: false,
        code: "TRIAL_EXPIRED",
        reason:
          "Your academy free trial has expired. Please choose a subscription plan to continue adding students, courses, and batches.",
      };
    }

    // Check if subscription period has lapsed
    if (
      subscription.currentPeriodEnd &&
      new Date(subscription.currentPeriodEnd) < now
    ) {
      return {
        subscription,
        plan: subscription.planId,
        limits: subscription.planId?.limits || {},
        features: subscription.planId?.features || [],
        isActive: false,
        code: "SUBSCRIPTION_EXPIRED",
        reason:
          "Your academy subscription billing cycle has expired. Please renew your plan to continue creating resources.",
      };
    }

    const plan = subscription.planId;
    return {
      subscription,
      plan,
      limits: {
        students: plan?.limits?.students ?? 100,
        courses: plan?.limits?.courses ?? 10,
        batches: plan?.limits?.batches ?? 20,
        staff: plan?.limits?.staff ?? 10,
        branches: plan?.limits?.branches ?? 1,
      },
      features: Array.isArray(plan?.features) ? plan.features : ["*"],
      isActive: true,
    };
  }

  // 3. If no active subscription exists, check if there's any expired or cancelled subscription
  const pastSubscription = await AcademySubscription.findOne({
    academyId,
  })
    .sort({ createdAt: -1 })
    .populate("planId");

  if (pastSubscription) {
    return {
      subscription: pastSubscription,
      plan: pastSubscription.planId,
      limits: pastSubscription.planId?.limits || {},
      features: pastSubscription.planId?.features || [],
      isActive: false,
      code: "SUBSCRIPTION_INACTIVE",
      reason: `Your academy subscription status is currently '${pastSubscription.status}'. Please activate or renew your plan.`,
    };
  }

  // 4. Default fallback: Look for a public default active plan or apply standard starter allowance
  const defaultPlan = await PlatformPlan.findOne({ isActive: true }).sort({
    monthlyPrice: 1,
  });

  if (defaultPlan) {
    return {
      subscription: null,
      plan: defaultPlan,
      limits: {
        students: defaultPlan.limits?.students ?? 50,
        courses: defaultPlan.limits?.courses ?? 5,
        batches: defaultPlan.limits?.batches ?? 10,
        staff: defaultPlan.limits?.staff ?? 5,
        branches: defaultPlan.limits?.branches ?? 1,
      },
      features: Array.isArray(defaultPlan.features) ? defaultPlan.features : ["*"],
      isActive: true,
      isDefaultFallback: true,
    };
  }

  // Absolute safety fallback
  return {
    subscription: null,
    plan: { name: "Starter Trial", code: "starter" },
    limits: {
      students: 50,
      courses: 5,
      batches: 10,
      staff: 5,
      branches: 1,
    },
    features: ["*"],
    isActive: true,
    isDefaultFallback: true,
  };
}

/**
 * Asserts that the academy has not exceeded the designated resource quota.
 * Throws an HTTP 403 error if the quota is reached.
 */
async function assertResourceLimit(academyId, resourceType, requestedCount = 1) {
  const subInfo = await getAcademySubscription(academyId);

  if (!subInfo.isActive) {
    const err = new Error(subInfo.reason);
    err.statusCode = 403;
    err.code = subInfo.code || "SUBSCRIPTION_INACTIVE";
    throw err;
  }

  const limit = subInfo.limits[resourceType];

  // -1 signifies unlimited entitlement
  if (limit === -1 || limit === undefined) {
    return true;
  }

  let currentCount = 0;

  switch (resourceType) {
    case "students":
      currentCount = await User.countDocuments({
        academyId,
        role: "student",
        isDeleted: false,
      });
      break;

    case "courses":
      currentCount = await Course.countDocuments({
        academyId,
        isDeleted: false,
      });
      break;

    case "batches":
      currentCount = await Batch.countDocuments({
        academyId,
        isDeleted: false,
      });
      break;

    case "staff":
      currentCount = await User.countDocuments({
        academyId,
        role: "teacher",
        isDeleted: false,
      });
      break;

    default:
      return true;
  }

  if (currentCount + requestedCount > limit) {
    const resourceLabel =
      resourceType === "staff"
        ? "teachers/staff"
        : resourceType === "courses"
        ? "courses"
        : resourceType === "batches"
        ? "batches"
        : "students";

    const planName = subInfo.plan?.name || "current plan";
    const available = Math.max(0, limit - currentCount);

    const message =
      requestedCount > 1
        ? `SaaS Plan Limit Exceeded: Importing ${requestedCount} ${resourceLabel} would exceed your plan limit of ${limit} (currently used: ${currentCount}, available slots: ${available}). Please upgrade your SaaS plan.`
        : `SaaS Plan Limit Exceeded: You have reached the maximum allowance of ${limit} ${resourceLabel} on your ${planName}. Please upgrade your SaaS plan to add more.`;

    const err = new Error(message);
    err.statusCode = 403;
    err.code = "PLAN_LIMIT_EXCEEDED";
    err.details = {
      resource: resourceType,
      current: currentCount,
      limit,
      requested: requestedCount,
      available,
      planName,
    };
    throw err;
  }

  return true;
}

/**
 * Asserts that the requested feature is unlocked in the academy's plan.
 */
async function assertFeatureEnabled(academyId, featureKey) {
  const subInfo = await getAcademySubscription(academyId);

  if (!subInfo.isActive) {
    const err = new Error(subInfo.reason);
    err.statusCode = 403;
    err.code = subInfo.code || "SUBSCRIPTION_INACTIVE";
    throw err;
  }

  if (!isFeatureAllowed(subInfo.features, featureKey)) {
    const planName = subInfo.plan?.name || "current plan";
    const err = new Error(
      `Feature Not Permitted: The '${featureKey}' module is not included in your ${planName}. Please upgrade your subscription to access this feature.`
    );
    err.statusCode = 403;
    err.code = "FEATURE_NOT_PERMITTED";
    err.details = {
      feature: featureKey,
      planName,
    };
    throw err;
  }

  return true;
}

/**
 * Returns comprehensive plan and quota usage statistics for an academy.
 */
async function getUsageSummary(academyId) {
  const subInfo = await getAcademySubscription(academyId);

  const [studentCount, courseCount, batchCount, staffCount] = await Promise.all([
    User.countDocuments({ academyId, role: "student", isDeleted: false }),
    Course.countDocuments({ academyId, isDeleted: false }),
    Batch.countDocuments({ academyId, isDeleted: false }),
    User.countDocuments({ academyId, role: "teacher", isDeleted: false }),
  ]);

  const limits = subInfo.limits;

  const calculateQuota = (current, limit) => {
    if (limit === -1 || limit === undefined) {
      return {
        current,
        limit: "Unlimited",
        remaining: "Unlimited",
        percent: 0,
        isUnlimited: true,
      };
    }
    const remaining = Math.max(0, limit - current);
    const percent = limit > 0 ? Math.min(100, Math.round((current / limit) * 100)) : 100;
    return {
      current,
      limit,
      remaining,
      percent,
      isUnlimited: false,
      isExceeded: current >= limit,
    };
  };

  return {
    plan: {
      id: subInfo.plan?._id || null,
      name: subInfo.plan?.name || "Standard Plan",
      code: subInfo.plan?.code || "standard",
      monthlyPrice: subInfo.plan?.monthlyPrice || 0,
      annualPrice: subInfo.plan?.annualPrice || 0,
    },
    subscription: subInfo.subscription
      ? {
          id: subInfo.subscription._id,
          status: subInfo.subscription.status,
          billingCycle: subInfo.subscription.billingCycle,
          startsAt: subInfo.subscription.startsAt,
          currentPeriodEnd: subInfo.subscription.currentPeriodEnd,
          trialEndsAt: subInfo.subscription.trialEndsAt,
          isTrial: subInfo.subscription.status === "trialing",
        }
      : null,
    isActive: subInfo.isActive,
    statusReason: subInfo.reason || null,
    statusCode: subInfo.code || "OK",
    usage: {
      students: calculateQuota(studentCount, limits.students),
      courses: calculateQuota(courseCount, limits.courses),
      batches: calculateQuota(batchCount, limits.batches),
      staff: calculateQuota(staffCount, limits.staff),
    },
    features: subInfo.features,
  };
}

module.exports = {
  getAcademySubscription,
  assertResourceLimit,
  assertFeatureEnabled,
  getUsageSummary,
};
