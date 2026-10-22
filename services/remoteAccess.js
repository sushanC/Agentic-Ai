import { createRemoteJWKSet, jwtVerify } from "jose";
import { isIP } from "node:net";
import { runWithPrincipal } from "../core/security/PrincipalContext.js";
import { readDataOwnerManifest } from "../storage/dataOwnership.js";

function requiredHttpsUrl(value, name) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name} must be an absolute HTTPS URL.`); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error(`${name} must be an absolute HTTPS URL.`);
  return url;
}

export async function loadRemoteAccessConfig(env = process.env, { ownerManifestPath } = {}) {
  const mode = env.SAMGPT_AUTH_MODE || "local";
  if (mode === "local") return { mode: "local" };
  if (mode !== "oidc") throw new Error("SAMGPT_AUTH_MODE must be either local or oidc.");

  const issuerUrl = requiredHttpsUrl(env.SAMGPT_OIDC_ISSUER, "SAMGPT_OIDC_ISSUER");
  const jwksUrl = requiredHttpsUrl(env.SAMGPT_OIDC_JWKS_URI, "SAMGPT_OIDC_JWKS_URI");
  const audience = env.SAMGPT_OIDC_AUDIENCE?.trim();
  const ownerSubject = env.SAMGPT_DATA_OWNER_SUBJECT?.trim();
  if (!audience || !ownerSubject) throw new Error("OIDC mode requires SAMGPT_OIDC_AUDIENCE and SAMGPT_DATA_OWNER_SUBJECT.");
  const ownerScope = env.SAMGPT_OWNER_SCOPE?.trim() || "samgpt:owner";
  const adminScope = env.SAMGPT_ADMIN_SCOPE?.trim() || "samgpt:admin";
  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(ownerScope) || !/^[A-Za-z0-9:_-]{1,128}$/.test(adminScope) || ownerScope === adminScope) {
    throw new Error("OIDC owner and administrator scopes must be valid, distinct scope names.");
  }

  const publicOriginUrl = requiredHttpsUrl(env.SAMGPT_PUBLIC_ORIGIN, "SAMGPT_PUBLIC_ORIGIN");
  if (publicOriginUrl.pathname !== "/" || publicOriginUrl.search) throw new Error("SAMGPT_PUBLIC_ORIGIN must contain only the HTTPS origin.");
  const proxyAddresses = (env.SAMGPT_TRUSTED_PROXY_ADDRESSES || "").split(",").map(value => value.trim()).filter(Boolean);
  if (!proxyAddresses.length || proxyAddresses.some(value => {
    const address = value.replace(/^\[|\]$/g, "");
    return isIP(address) !== 6 ? !/^127\./.test(address) || isIP(address) !== 4 : address !== "::1";
  })) {
    throw new Error("OIDC mode requires explicit loopback-only SAMGPT_TRUSTED_PROXY_ADDRESSES; the backend remains loopback-bound.");
  }
  const origins = (env.SAMGPT_ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
  if (!origins.includes(publicOriginUrl.origin)) throw new Error("SAMGPT_PUBLIC_ORIGIN must be included in SAMGPT_ALLOWED_ORIGINS.");

  const owner = await readDataOwnerManifest(ownerManifestPath);
  const issuer = issuerUrl.href;
  if (owner.issuer !== issuer || owner.subject !== ownerSubject) {
    throw new Error("Configured OIDC issuer/subject does not match the recorded data owner.");
  }

  return {
    mode: "oidc",
    issuer,
    jwksUri: jwksUrl,
    audience,
    ownerSubject,
    ownerScope,
    adminScope,
    proxyAddresses: new Set(proxyAddresses),
    publicOrigin: publicOriginUrl.origin,
  };
}

const ROUTE_POLICIES = [
  ["administrator", "POST", /^\/chat$/], ["administrator", "POST", /^\/chat\/stream$/], ["owner", "GET", /^\/chat\/history$/], ["owner", "GET", /^\/history$/],
  ["administrator", "POST", /^\/voice$/], ["administrator", "GET", /^\/audio\/devices$/],
  ["owner", "GET", /^\/activities$/], ["owner", "GET", /^\/memory$/], ["owner", "DELETE", /^\/memory\/[^/]+$/],
  ["owner", "GET", /^\/notes$/], ["owner", "POST", /^\/notes$/], ["owner", "PUT", /^\/notes\/[^/]+$/], ["owner", "DELETE", /^\/notes\/[^/]+$/],
  ["owner", "GET", /^\/tasks$/], ["owner", "POST", /^\/tasks$/], ["owner", "PUT", /^\/tasks\/[^/]+$/], ["owner", "DELETE", /^\/tasks\/[^/]+$/],
  ["owner", "POST", /^\/pdf\/upload$/], ["owner", "GET", /^\/pdf\/list$/], ["owner", "POST", /^\/pdf\/ask$/],
  ["owner", "DELETE", /^\/pdf\/[^/]+$/], ["owner", "GET", /^\/pdf\/search$/], ["owner", "POST", /^\/pdf\/action$/],
  ["administrator", "GET", /^\/settings$/], ["administrator", "POST", /^\/settings$/], ["owner", "GET", /^\/stats$/],
  ["administrator", "GET", /^\/backup$/], ["administrator", "POST", /^\/restore$/], ["administrator", "POST", /^\/confirm$/],
  ["administrator", "GET", /^\/gmail\/status$/], ["administrator", "GET", /^\/gmail\/auth$/], ["public-oauth-callback", "GET", /^\/gmail\/callback$/],
  ["administrator", "GET", /^\/calendar\/status$/], ["administrator", "GET", /^\/google\/auth$/], ["public-oauth-callback", "GET", /^\/google\/callback$/],
  ["administrator", "POST", /^\/cancel$/], ["administrator", "GET", /^\/pending$/], ["administrator", "POST", /^\/email\/provide-input$/],
  ["administrator", "GET", /^\/models$/], ["administrator", "GET", /^\/models\/health$/], ["administrator", "POST", /^\/models\/test\/[^/]+$/],
  ["administrator", "GET", /^\/models\/capabilities$/], ["administrator", "GET", /^\/desktop\/history$/],
  ["administrator", "GET", /^\/desktop\/system-status$/], ["administrator", "GET", /^\/desktop\/screenshot\/[^/]+$/],
];

export function classifyApiRoute(method, path) {
  const policy = ROUTE_POLICIES.find(([access, allowed, pattern]) => allowed === method && pattern.test(path));
  return { access: policy?.[0] || "deny" };
}

function scopesFromClaims(payload) {
  const raw = payload.scope ?? payload.scp ?? [];
  if (Array.isArray(raw)) return new Set(raw.filter(value => typeof value === "string"));
  if (typeof raw === "string") return new Set(raw.split(/\s+/).filter(Boolean));
  return new Set();
}

export function createTokenVerifier(config, { verify = jwtVerify, jwks = createRemoteJWKSet(config.jwksUri) } = {}) {
  return async token => {
    const { payload } = await verify(token, jwks, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ["RS256", "ES256"],
      requiredClaims: ["exp", "iat", "sub"],
      clockTolerance: 5,
      maxTokenAge: "15m",
    });
    if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 512) throw new Error("Invalid subject.");
    return { issuer: config.issuer, subject: payload.sub, scopes: scopesFromClaims(payload) };
  };
}

function bearerToken(req) {
  const header = req.get?.("authorization") || req.headers?.authorization || "";
  const match = /^Bearer ([A-Za-z0-9._~-]{1,8192})$/.exec(header);
  return match?.[1];
}

export function createTrustedProxyGuard(config) {
  if (config.mode !== "oidc") return (_req, _res, next) => next();
  return (req, res, next) => {
    const peer = String(req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
    const forwardedProto = req.get?.("x-forwarded-proto") || req.headers?.["x-forwarded-proto"];
    const host = req.get?.("host") || req.headers?.host;
    const expectedHost = new URL(config.publicOrigin).host;
    if (!config.proxyAddresses.has(peer) || forwardedProto !== "https" || host !== expectedHost) {
      return res.status(403).json({ error: "Trusted HTTPS proxy required." });
    }
    next();
  };
}

export function createRemoteAuthorization(config, options = {}) {
  if (config.mode !== "oidc") return (_req, _res, next) => next();
  const verifyToken = options.verifyToken || createTokenVerifier(config);
  return async (req, res, next) => {
    if (req.method === "OPTIONS") return next();
    const route = classifyApiRoute(req.method, req.path);
    if (route.access === "deny") return res.status(403).json({ error: "Route is not available." });
    if (route.access === "public-oauth-callback") return next();

    const token = bearerToken(req);
    if (!token) return res.status(401).json({ error: "Authentication required." });
    try {
      const principal = await verifyToken(token);
      if (principal.issuer !== config.issuer || principal.subject !== config.ownerSubject) {
        return res.status(403).json({ error: "Access denied." });
      }
      if (!principal.scopes.has(config.ownerScope)) return res.status(403).json({ error: "Access denied." });
      if (route.access === "administrator" && !principal.scopes.has(config.adminScope)) {
        return res.status(403).json({ error: "Administrator permission required." });
      }
      req.auth = Object.freeze(principal);
      return runWithPrincipal({ kind: "request", ...principal }, next);
    } catch {
      return res.status(401).json({ error: "Invalid or expired credentials." });
    }
  };
}

export function createRemoteRateLimiter({ now = Date.now, generalLimit = 120, expensiveLimit = 20, restoreLimit = 3 } = {}) {
  const buckets = new Map();
  const windowMs = 60_000;
  return (req, res, next) => {
    if (req.method === "OPTIONS" || !req.auth) return next();
    const path = req.path;
    const limit = path === "/restore" ? restoreLimit : /^\/(chat|pdf\/(upload|ask|action)|models\/test)(\/|$)/.test(path) ? expensiveLimit : generalLimit;
    const key = `${req.auth.subject}:${limit}`;
    const currentTime = now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.expiresAt <= currentTime) bucket = { count: 0, expiresAt: currentTime + windowMs };
    bucket.count++;
    buckets.set(key, bucket);
    if (buckets.size > 10_000) {
      for (const [entry, value] of buckets) if (value.expiresAt <= currentTime) buckets.delete(entry);
    }
    if (bucket.count > limit) return res.status(429).json({ error: "Request limit exceeded." });
    next();
  };
}

