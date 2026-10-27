/**
 * Timezone-aware date & time utilities for MyAcademy
 */

const DEFAULT_TIMEZONE = "Asia/Kolkata";

/**
 * Returns YYYY-MM-DD string for a given date in the specified timezone.
 */
function formatDateKey(date, timezone = DEFAULT_TIMEZONE) {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";

  // Using Intl to extract local year, month, day in target timezone
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(d); // en-CA produces YYYY-MM-DD
}

/**
 * Normalizes a date to UTC midnight representing the local calendar day YYYY-MM-DD.
 */
function normalizeDate(date, timezone = DEFAULT_TIMEZONE) {
  const key = formatDateKey(date, timezone);
  if (!key) return null;
  return new Date(`${key}T00:00:00.000Z`);
}

/**
 * Returns day of the week index (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
 * in the specified timezone.
 */
function getDayOfWeek(date, timezone = DEFAULT_TIMEZONE) {
  const d = new Date(date);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  });
  const shortName = formatter.format(d).toLowerCase();
  const map = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  return map[shortName] !== undefined ? map[shortName] : d.getUTCDay();
}

/**
 * Returns lowercase weekday name (e.g. "monday", "tuesday")
 */
function getDayName(date, timezone = DEFAULT_TIMEZONE) {
  const d = new Date(date);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
  });
  return formatter.format(d).toLowerCase();
}

/**
 * Converts a "HH:mm" 24-hour string to total minutes from midnight.
 */
function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return 0;
  const parts = timeStr.trim().split(":");
  if (parts.length < 2) return 0;
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  return hours * 60 + minutes;
}

/**
 * Checks if two time intervals on the same day overlap.
 * start1, end1, start2, end2 are strings like "09:00", "10:30"
 */
function doTimesOverlap(start1, end1, start2, end2) {
  const s1 = parseTimeToMinutes(start1);
  const e1 = parseTimeToMinutes(end1);
  const s2 = parseTimeToMinutes(start2);
  const e2 = parseTimeToMinutes(end2);

  // An interval overlaps if start1 < end2 and end1 > start2
  return s1 < e2 && e1 > s2;
}

/**
 * Checks whether targetDate falls between startDate and endDate (inclusive of whole calendar days).
 */
function isDateInRange(targetDate, startDate, endDate, timezone = DEFAULT_TIMEZONE) {
  const targetKey = formatDateKey(targetDate, timezone);
  const startKey = formatDateKey(startDate, timezone);
  const endKey = formatDateKey(endDate, timezone);

  if (!targetKey || !startKey) return false;
  if (!endKey) return targetKey >= startKey;
  return targetKey >= startKey && targetKey <= endKey;
}

/**
 * Adds N days to a Date object.
 */
function addDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Maps day name to index.
 */
const DAY_NAME_TO_INDEX = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

module.exports = {
  DEFAULT_TIMEZONE,
  formatDateKey,
  normalizeDate,
  getDayOfWeek,
  getDayName,
  parseTimeToMinutes,
  doTimesOverlap,
  isDateInRange,
  addDays,
  DAY_NAME_TO_INDEX,
};
