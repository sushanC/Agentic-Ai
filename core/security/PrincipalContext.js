import { AsyncLocalStorage } from "node:async_hooks";

const principalContext = new AsyncLocalStorage();

export function runWithPrincipal(principal, operation) {
  return principalContext.run(principal, operation);
}

export function getPrincipal() {
  return principalContext.getStore();
}

export function requestPrincipalContextMiddleware(req, res, next) {
  return runWithPrincipal({ kind: "request", subject: null, issuer: null, scopes: [] }, next);
}

/** Data stores enforce owner identity as well as the HTTP authorization middleware. */
export function assertOwnerDataAccess(filePath) {
  if (process.env.SAMGPT_AUTH_MODE !== "oidc") return;
  const resolved = String(filePath).replaceAll("\\", "/");
  const basename = resolved.split("/").pop();
  // Provider credentials and the ownership manifest have their own handling and are not user tables.
  if (basename === "gmail_token.json" || basename === "data-owner.json") return;

  const principal = getPrincipal();
  // No request context means trusted in-process maintenance/startup work. Every HTTP request has one.
  if (!principal || principal.kind !== "request") return;

  const expectedSubject = process.env.SAMGPT_DATA_OWNER_SUBJECT;
  const expectedIssuer = process.env.SAMGPT_OIDC_ISSUER;
  if (!expectedSubject || principal.subject !== expectedSubject || principal.issuer !== expectedIssuer) {
    const err = new Error("Data access is not authorized.");
    err.code = "DATA_OWNER_FORBIDDEN";
    throw err;
  }
}
