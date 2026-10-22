import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import { createServer } from "node:http";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { requestPrincipalContextMiddleware } from "../../core/security/PrincipalContext.js";
import { createJsonFileStore } from "../../storage/jsonFile.js";
import { adoptExistingDataOwner, DATA_OWNER_ADOPTION_CONFIRMATION, readDataOwnerManifest } from "../../storage/dataOwnership.js";
import { classifyApiRoute, createRemoteAuthorization, createRemoteRateLimiter, createTokenVerifier, createTrustedProxyGuard, loadRemoteAccessConfig } from "../../services/remoteAccess.js";
import { createPdfUploadMiddleware, PDF_UPLOAD_LIMITS } from "../../features/pdf/pdfRoutes.js";
import { PDF_MAX_OCR_PAGES, PDF_MAX_PAGES } from "../../features/pdf/pdfParser.js";

const issuer = "https://idp.example.test/tenant/samgpt";
const owner = "subject-owner-001";
const audience = "samgpt-api";

async function withTempDir(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "samgpt-phase7-"));
  try { await run(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

async function withJwks(run) {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "test-key-1";
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";
  const server = createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=60" });
    res.end(JSON.stringify({ keys: [publicJwk] }));
  });
  server.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  try {
    const jwksUri = new URL(`http://127.0.0.1:${server.address().port}/jwks`);
    await run({ privateKey, jwksUri });
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

function makeToken(privateKey, { sub = owner, scope = "samgpt:owner", exp = Math.floor(Date.now() / 1000) + 300, tokenIssuer = issuer, tokenAudience = audience } = {}) {
  return new SignJWT({ scope })
    .setProtectedHeader({ alg: "RS256", kid: "test-key-1" })
    .setIssuer(tokenIssuer)
    .setAudience(tokenAudience)
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(privateKey);
}

test("explicit data-owner adoption creates a private, non-overwritable manifest", async () => {
  await withTempDir(async dir => {
    const filePath = path.join(dir, "data-owner.json");
    await assert.rejects(adoptExistingDataOwner({ issuer, subject: owner, confirmation: "", filePath }), error => error.code === "DATA_OWNER_ADOPTION_CONFIRMATION_REQUIRED");
    const created = await adoptExistingDataOwner({
      issuer, subject: owner, confirmation: DATA_OWNER_ADOPTION_CONFIRMATION, filePath,
      now: new Date("2026-10-18T00:00:00.000Z"),
    });
    assert.deepEqual(await readDataOwnerManifest(filePath), { issuer, subject: owner });
    assert.equal(created.adoptedAt, "2026-10-18T00:00:00.000Z");
    if (process.platform !== "win32") assert.equal((await fs.stat(filePath)).mode & 0o777, 0o600);
    await assert.rejects(adoptExistingDataOwner({ issuer, subject: "other", confirmation: DATA_OWNER_ADOPTION_CONFIRMATION, filePath }), error => error.code === "DATA_OWNER_ALREADY_CONFIGURED");
    assert.equal((await readDataOwnerManifest(filePath)).subject, owner);
  });
  await withTempDir(async dir => {
    if (process.platform === "win32") return;
    await fs.chmod(dir, 0o755);
    await assert.rejects(adoptExistingDataOwner({
      issuer, subject: owner, confirmation: DATA_OWNER_ADOPTION_CONFIRMATION, filePath: path.join(dir, "data-owner.json"),
    }), /private permissions/);
  });
});

test("OIDC mode fails closed until owner adoption/configuration matches exactly", async () => {
  await withTempDir(async dir => {
    const manifest = path.join(dir, "data-owner.json");
    const env = {
      SAMGPT_AUTH_MODE: "oidc",
      SAMGPT_OIDC_ISSUER: issuer,
      SAMGPT_OIDC_JWKS_URI: "https://idp.example.test/tenant/keys",
      SAMGPT_OIDC_AUDIENCE: audience,
      SAMGPT_DATA_OWNER_SUBJECT: owner,
      SAMGPT_PUBLIC_ORIGIN: "https://samgpt.example.test",
      SAMGPT_ALLOWED_ORIGINS: "https://samgpt.example.test",
      SAMGPT_TRUSTED_PROXY_ADDRESSES: "127.0.0.1",
    };
    await assert.rejects(loadRemoteAccessConfig(env, { ownerManifestPath: manifest }), error => error.code === "DATA_OWNER_NOT_CONFIGURED");
    await adoptExistingDataOwner({ issuer, subject: owner, confirmation: DATA_OWNER_ADOPTION_CONFIRMATION, filePath: manifest });
    const config = await loadRemoteAccessConfig(env, { ownerManifestPath: manifest });
    assert.equal(config.ownerSubject, owner);
    await assert.rejects(loadRemoteAccessConfig({ ...env, SAMGPT_DATA_OWNER_SUBJECT: "other" }, { ownerManifestPath: manifest }), /does not match/);
    await assert.rejects(loadRemoteAccessConfig({ ...env, SAMGPT_TRUSTED_PROXY_ADDRESSES: "0.0.0.0" }, { ownerManifestPath: manifest }), /loopback-only/);
    await assert.rejects(loadRemoteAccessConfig({ ...env, SAMGPT_ADMIN_SCOPE: "samgpt:owner" }, { ownerManifestPath: manifest }), /distinct scope names/);
  });
});

test("OIDC bearer verification rejects absent, invalid, expired and wrong-owner credentials", async () => {
  await withJwks(async ({ privateKey, jwksUri }) => {
    const config = { mode: "oidc", issuer, audience, jwksUri, ownerSubject: owner, ownerScope: "samgpt:owner", adminScope: "samgpt:admin" };
    const verifyToken = createTokenVerifier(config);
    const app = express();
    app.use(requestPrincipalContextMiddleware);
    app.use(createRemoteAuthorization(config, { verifyToken }));
    app.get("/notes", (_req, res) => res.json({ ok: true }));
    app.post("/restore", (_req, res) => res.json({ ok: true }));
    const server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    try {
      const missing = await fetch(`${baseUrl}/notes`);
      assert.equal(missing.status, 401);
      const invalid = await fetch(`${baseUrl}/notes`, { headers: { authorization: "Bearer not.a.valid.token" } });
      assert.equal(invalid.status, 401);
      const wrongAudience = await makeToken(privateKey, { tokenAudience: "another-api" });
      assert.equal((await fetch(`${baseUrl}/notes`, { headers: { authorization: `Bearer ${wrongAudience}` } })).status, 401);
      const wrongIssuer = await makeToken(privateKey, { tokenIssuer: "https://attacker.example/issuer" });
      assert.equal((await fetch(`${baseUrl}/notes`, { headers: { authorization: `Bearer ${wrongIssuer}` } })).status, 401);
      const expiredToken = await makeToken(privateKey, { exp: Math.floor(Date.now() / 1000) - 10 });
      const expired = await fetch(`${baseUrl}/notes`, { headers: { authorization: `Bearer ${expiredToken}` } });
      assert.equal(expired.status, 401);
      const otherUser = await makeToken(privateKey, { sub: "other-user" });
      const crossUser = await fetch(`${baseUrl}/notes`, { headers: { authorization: `Bearer ${otherUser}` } });
      assert.equal(crossUser.status, 403);
      const noOwnerScope = await makeToken(privateKey, { scope: "samgpt:admin" });
      const missingOwnerScope = await fetch(`${baseUrl}/notes`, { headers: { authorization: `Bearer ${noOwnerScope}` } });
      assert.equal(missingOwnerScope.status, 403);
      const ownerOnly = await makeToken(privateKey);
      const insufficient = await fetch(`${baseUrl}/restore`, { method: "POST", headers: { authorization: `Bearer ${ownerOnly}` } });
      assert.equal(insufficient.status, 403);
      const ownerAccess = await fetch(`${baseUrl}/notes`, { headers: { authorization: `Bearer ${ownerOnly}` } });
      assert.equal(ownerAccess.status, 200);
      const adminToken = await makeToken(privateKey, { scope: "samgpt:owner samgpt:admin" });
      const adminAccess = await fetch(`${baseUrl}/restore`, { method: "POST", headers: { authorization: `Bearer ${adminToken}` } });
      assert.equal(adminAccess.status, 200);
      const unclassified = await fetch(`${baseUrl}/unclassified`, { headers: { authorization: `Bearer ${adminToken}` } });
      assert.equal(unclassified.status, 403);
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  });
});

test("JSON data access rejects a different request principal at the storage layer", async () => {
  await withTempDir(async dir => {
    const originalMode = process.env.SAMGPT_AUTH_MODE;
    const originalOwner = process.env.SAMGPT_DATA_OWNER_SUBJECT;
    const originalIssuer = process.env.SAMGPT_OIDC_ISSUER;
    process.env.SAMGPT_AUTH_MODE = "oidc";
    process.env.SAMGPT_DATA_OWNER_SUBJECT = owner;
    process.env.SAMGPT_OIDC_ISSUER = issuer;
    try {
      const store = createJsonFileStore(path.join(dir, "notes.json"), { fallbackValue: [], validate: Array.isArray });
      await assert.rejects(import("../../core/security/PrincipalContext.js").then(({ runWithPrincipal }) =>
        runWithPrincipal({ kind: "request", subject: "other-user", issuer, scopes: new Set(["samgpt:owner"]) }, () => store.read())),
      error => error.code === "DATA_OWNER_FORBIDDEN");
      const { runWithPrincipal } = await import("../../core/security/PrincipalContext.js");
      assert.deepEqual(await runWithPrincipal({ kind: "request", subject: owner, issuer, scopes: new Set(["samgpt:owner"]) }, () => store.read()), []);
    } finally {
      if (originalMode === undefined) delete process.env.SAMGPT_AUTH_MODE; else process.env.SAMGPT_AUTH_MODE = originalMode;
      if (originalOwner === undefined) delete process.env.SAMGPT_DATA_OWNER_SUBJECT; else process.env.SAMGPT_DATA_OWNER_SUBJECT = originalOwner;
      if (originalIssuer === undefined) delete process.env.SAMGPT_OIDC_ISSUER; else process.env.SAMGPT_OIDC_ISSUER = originalIssuer;
    }
  });
});

test("route classification requires owner or administrator and leaves only OAuth callbacks public", () => {
  assert.equal(classifyApiRoute("GET", "/gmail/callback").access, "public-oauth-callback");
  assert.equal(classifyApiRoute("POST", "/gmail/callback").access, "deny");
  assert.equal(classifyApiRoute("GET", "/notes").access, "owner");
  assert.equal(classifyApiRoute("POST", "/chat").access, "administrator");
  assert.equal(classifyApiRoute("POST", "/gmail/callback").access, "deny");
  assert.equal(classifyApiRoute("POST", "/restore").access, "administrator");
  assert.equal(classifyApiRoute("GET", "/not-a-route").access, "deny");
});

test("local mode keeps the existing local-only authorization behavior without requiring a token", () => {
  let advanced = false;
  createRemoteAuthorization({ mode: "local" })({}, {}, () => { advanced = true; });
  assert.equal(advanced, true);
});

test("trusted proxy guard accepts only the configured loopback HTTPS proxy and public host", () => {
  const guard = createTrustedProxyGuard({ mode: "oidc", proxyAddresses: new Set(["127.0.0.1"]), publicOrigin: "https://samgpt.example.test" });
  const run = (remoteAddress, proto, host) => {
    const result = { status: null, body: null, advanced: false };
    const req = { socket: { remoteAddress }, headers: { "x-forwarded-proto": proto, host } };
    const res = { status(code) { result.status = code; return this; }, json(body) { result.body = body; return this; } };
    guard(req, res, () => { result.advanced = true; });
    return result;
  };
  assert.equal(run("10.1.2.3", "https", "samgpt.example.test").status, 403);
  assert.equal(run("127.0.0.1", "http", "samgpt.example.test").status, 403);
  assert.equal(run("127.0.0.1", "https", "internal").status, 403);
  assert.equal(run("127.0.0.1", "https", "samgpt.example.test").advanced, true);
});

test("authenticated rate limits and PDF upload limits reject excess requests and files", async () => {
  let now = 10_000;
  const limit = createRemoteRateLimiter({ generalLimit: 1, now: () => now });
  const request = { method: "GET", path: "/notes", auth: { subject: owner } };
  const first = { advanced: false };
  limit(request, { status(code) { first.status = code; return this; }, json() {} }, () => { first.advanced = true; });
  assert.equal(first.advanced, true);
  const second = { advanced: false };
  limit(request, { status(code) { second.status = code; return this; }, json() {} }, () => { second.advanced = true; });
  assert.equal(second.status, 429);
  now += 60_001;
  const afterWindow = { advanced: false };
  limit(request, { status(code) { afterWindow.status = code; return this; }, json() {} }, () => { afterWindow.advanced = true; });
  assert.equal(afterWindow.advanced, true);

  assert.equal(PDF_UPLOAD_LIMITS.fileSize, 10 * 1024 * 1024);
  assert.equal(PDF_MAX_PAGES, 100);
  assert.equal(PDF_MAX_OCR_PAGES, 25);
  await withTempDir(async dir => {
    const app = express();
    app.post("/upload", createPdfUploadMiddleware({ destination: dir }), (req, res) => res.json({ size: req.file.size }));
    app.use((error, _req, res, _next) => res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ code: error.code }));
    const server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const endpoint = `http://127.0.0.1:${server.address().port}/upload`;
    try {
      const invalid = new FormData();
      invalid.append("pdf", new Blob(["not pdf"]), "notes.txt");
      assert.equal((await fetch(endpoint, { method: "POST", body: invalid })).status, 400);
      const large = new FormData();
      large.append("pdf", new Blob([Buffer.alloc(PDF_UPLOAD_LIMITS.fileSize + 1)], { type: "application/pdf" }), "large.pdf");
      assert.equal((await fetch(endpoint, { method: "POST", body: large })).status, 413);
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
    assert.deepEqual(await fs.readdir(dir), []);
    if (process.platform !== "win32") assert.equal((await fs.stat(dir)).mode & 0o777, 0o700);
  });
});
