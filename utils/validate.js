// Each validator returns an error message, or null when the value is fine.
// Everything is type-checked first so object payloads like {"$ne": ""} never reach a query.
const isString = (v) => typeof v === "string";

export const checkUsername = (v) =>
  !isString(v) || !/^[A-Za-z0-9_]{3,20}$/.test(v.trim())
    ? "Username must be 3-20 characters: letters, numbers or underscores."
    : null;

export const checkEmail = (v) =>
  !isString(v) || v.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
    ? "Please enter a valid email address."
    : null;

// bcrypt ignores everything past 72 bytes, so cap there.
export const checkPassword = (v) => {
  if (!isString(v) || v.length < 6) return "Password must be at least 6 characters long.";
  if (Buffer.byteLength(v) > 72) return "Password must be at most 72 bytes long.";
  return null;
};

export const CATEGORIES = ["3x3", "oll", "pll"];

export const checkCategory = (v, { allowAll = false } = {}) =>
  CATEGORIES.includes(v) || (allowAll && v === "all")
    ? null
    : `Category must be one of: ${[...CATEGORIES, ...(allowAll ? ["all"] : [])].join(", ")}.`;

// Keep only failed checks as { field: message }.
export const collect = (checks) =>
  Object.fromEntries(Object.entries(checks).filter(([, msg]) => msg));

export const sendInvalid = (res, errors) =>
  res.status(400).json({
    success: false,
    message: Object.values(errors)[0],
    errors,
  });
