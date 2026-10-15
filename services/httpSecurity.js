const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isLoopbackAddress(address = "") {
  const normalized = String(address).toLowerCase().replace(/^::ffff:/, "");
  return normalized === "127.0.0.1" || normalized === "::1" || normalized.startsWith("127.");
}

export function isAllowedLocalOrigin(origin, configuredOrigins = []) {
  if (typeof origin !== "string" || origin === "null") return false;
  if (configuredOrigins.includes(origin)) return true;
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && LOCAL_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function createLocalApiGuard(configuredOrigins = []) {
  return (req, res, next) => {
    if (!isLoopbackAddress(req.socket?.remoteAddress || req.ip)) {
      return res.status(403).json({ error: "Local access only." });
    }
    const origin = req.get?.("origin") || req.headers?.origin;
    if (origin && !isAllowedLocalOrigin(origin, configuredOrigins)) {
      return res.status(403).json({ error: "Origin is not allowed." });
    }
    next();
  };
}

export function safeErrorCode(err) {
  const code = err && typeof err.code === "string" ? err.code : "INTERNAL_ERROR";
  return /^[A-Z0-9_-]{1,64}$/.test(code) ? code : "INTERNAL_ERROR";
}

export function logSafeError(label, err) {
  console.error(label, { code: safeErrorCode(err) });
}
