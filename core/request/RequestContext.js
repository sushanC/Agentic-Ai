import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const requestStorage = new AsyncLocalStorage();
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function isValidRequestId(value) {
  return typeof value === "string" && REQUEST_ID_PATTERN.test(value);
}

export function createRequestContext(candidate) {
  const requestId = isValidRequestId(candidate) ? candidate : randomUUID();
  return Object.freeze({ requestId });
}

export function getCurrentRequestContext() {
  return requestStorage.getStore() || null;
}

export function runWithRequestContext(context, operation) {
  const safeContext = createRequestContext(context?.requestId);
  return requestStorage.run(safeContext, operation);
}

/** Express middleware: accept safe trace IDs, otherwise generate one. */
export function requestContextMiddleware(req, res, next) {
  const supplied = req.get?.("x-request-id") || req.headers?.["x-request-id"];
  const context = createRequestContext(supplied);
  req.requestContext = context;
  res.setHeader("X-Request-Id", context.requestId);
  requestStorage.run(context, next);
}
