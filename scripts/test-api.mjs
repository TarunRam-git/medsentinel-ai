import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { DatabaseSync } from "node:sqlite";
const temp = mkdtempSync(join(tmpdir(), "medsentinel-api-"));
const allocation = createServer();
await new Promise((r) => allocation.listen(0, "127.0.0.1", r));
const port = allocation.address().port;
await new Promise((r) => allocation.close(r));
const origin = `http://127.0.0.1:${port}`;
const secret = () => randomBytes(32).toString("hex");
const env = {
  ...process.env,
  NODE_ENV: "production",
  APP_ORIGIN: origin,
  DATA_ENCRYPTION_KEY: secret(),
  ADMIN_PASSWORD: secret(),
  ADMIN_EMAIL: "admin@test.local",
  ENABLE_DEMO: "true",
  DATABASE_PATH: join(temp, "test.db"),
  ML_SERVICE_URL: "",
  ML_SERVICE_TOKEN: secret(),
  INGEST_API_KEY: secret(),
};
let child,
  logs = "",
  checks = 0;
async function start() {
  child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    { env, stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stdout.on("data", (b) => (logs += b));
  child.stderr.on("data", (b) => (logs += b));
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${origin}/api/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Test server did not start: ${logs}`);
}
async function stop() {
  if (child && child.exitCode === null) {
    const exited = new Promise((r) => child.once("exit", r));
    child.kill("SIGTERM");
    await exited;
  }
}
async function req(
  path,
  { method = "GET", body, cookie, key, requestOrigin = origin } = {},
) {
  const headers = { "Content-Type": "application/json", Origin: requestOrigin };
  if (cookie) headers.Cookie = cookie;
  if (key) headers.Authorization = `Bearer ${key}`;
  return fetch(origin + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
}
async function demo(role) {
  const r = await req("/api/auth/demo", { method: "POST", body: { role } });
  assert.equal(r.status, 200);
  return r.headers.get("set-cookie").split(";")[0];
}
async function expectStatus(name, response, status) {
  assert.equal(
    response.status,
    status,
    `${name}: ${await response.clone().text()}`,
  );
  checks++;
  console.log(`PASS ${name}`);
}
try {
  await start();
  await expectStatus(
    "anonymous reads are rejected",
    await req("/api/snapshot"),
    401,
  );
  await expectStatus(
    "foreign origins are rejected",
    await req("/api/auth/demo", {
      method: "POST",
      body: { role: "admin" },
      requestOrigin: "https://untrusted.invalid",
    }),
    403,
  );
  await expectStatus(
    "ingestion requires a valid key",
    await req("/api/ingest", { method: "POST", body: {}, key: "wrong" }),
    401,
  );
  await expectStatus(
    "wrong credentials fail",
    await req("/api/auth/login", {
      method: "POST",
      body: { email: "admin@test.local", password: "wrong" },
    }),
    401,
  );
  const login = await req("/api/auth/login", {
    method: "POST",
    body: { email: "admin@test.local", password: env.ADMIN_PASSWORD },
  });
  await expectStatus("password authentication succeeds", login, 200);
  assert.match(login.headers.get("set-cookie"), /HttpOnly/i);
  assert.match(login.headers.get("set-cookie"), /SameSite=strict/i);
  const admin = await demo("admin"),
    researcher = await demo("researcher"),
    security = await demo("security"),
    biomedical = await demo("biomedical"),
    clinician = await demo("clinician");
  const snapshot = await (await req("/api/snapshot", { cookie: admin })).json();
  assert.equal(snapshot.patients.length, 6);
  assert.equal(snapshot.devices.length, 12);
  assert.equal(snapshot.auditValid, true);
  checks++;
  console.log("PASS durable synthetic workspace and audit chain");
  const sec = await (await req("/api/snapshot", { cookie: security })).json();
  assert.equal(sec.patients.length, 0);
  assert.ok(sec.events.every((e) => ["security", "device"].includes(e.source)));
  assert.ok(
    sec.alerts.every((a) =>
      a.evidence.every((e) => ["security", "device"].includes(e.source)),
    ),
  );
  checks++;
  console.log("PASS security-role clinical minimization");
  const bio = await (await req("/api/snapshot", { cookie: biomedical })).json();
  assert.equal(bio.patients.length, 0);
  assert.equal(bio.audit.length, 0);
  assert.ok(bio.events.every((e) => e.source === "device"));
  checks++;
  console.log("PASS biomedical-role minimization");
  await expectStatus(
    "clinician cannot export SIEM data",
    await req("/api/export", { cookie: clinician }),
    403,
  );
  const alert = snapshot.alerts.find((a) => a.status === "open");
  const update = {
    status: "acknowledged",
    note: "Verified the synthetic evidence during API testing.",
    expectedUpdatedAt: alert.updatedAt,
  };
  await expectStatus(
    "researcher cannot mutate clinical reviews",
    await req(`/api/alerts/${alert.id}/state`, {
      method: "POST",
      cookie: researcher,
      body: update,
    }),
    403,
  );
  await expectStatus(
    "invalid status transition is rejected",
    await req(`/api/alerts/${alert.id}/state`, {
      method: "POST",
      cookie: admin,
      body: { ...update, status: "resolved" },
    }),
    409,
  );
  const ack = await req(`/api/alerts/${alert.id}/state`, {
    method: "POST",
    cookie: admin,
    body: update,
  });
  await expectStatus("human acknowledgement is recorded", ack, 200);
  const ackBody = await ack.json();
  assert.equal(ackBody.notes.length, 1);
  await expectStatus(
    "stale write is rejected",
    await req(`/api/alerts/${alert.id}/state`, {
      method: "POST",
      cookie: admin,
      body: update,
    }),
    409,
  );
  const event = {
    id: "test-device-event-001",
    source: "device",
    patientId: "PT-1024",
    deviceId: "PMP-001",
    timestamp: new Date().toISOString(),
    kind: "infusion telemetry",
    values: { deviceRate: 20, signalQuality: 0.99 },
    provenance: "api-test:v1",
  };
  await expectStatus(
    "identity mismatch is rejected",
    await req("/api/ingest", {
      method: "POST",
      key: env.INGEST_API_KEY,
      body: { ...event, patientId: "PT-1038" },
    }),
    422,
  );
  await expectStatus(
    "invalid range is rejected",
    await req("/api/ingest", {
      method: "POST",
      key: env.INGEST_API_KEY,
      body: { ...event, values: { spo2: 200 } },
    }),
    400,
  );
  const ingested = await req("/api/ingest", {
    method: "POST",
    key: env.INGEST_API_KEY,
    body: event,
  });
  await expectStatus("normalized ingestion produces an alert", ingested, 202);
  assert.ok((await ingested.json()).alertId);
  const duplicate = await (
    await req("/api/ingest", {
      method: "POST",
      key: env.INGEST_API_KEY,
      body: event,
    })
  ).json();
  assert.equal(duplicate.duplicate, true);
  checks++;
  console.log("PASS event deduplication");
  const fhir = {
    resourceType: "Observation",
    id: "test-spo2",
    status: "final",
    subject: { reference: "Patient/PT-1024" },
    device: { reference: "Device/MON-001" },
    effectiveDateTime: new Date().toISOString(),
    code: { coding: [{ system: "http://loinc.org", code: "59408-5" }] },
    valueQuantity: {
      value: 98,
      system: "http://unitsofmeasure.org",
      code: "%",
    },
  };
  await expectStatus(
    "FHIR adapter accepts valid observations",
    await req("/api/fhir", {
      method: "POST",
      key: env.INGEST_API_KEY,
      body: fhir,
    }),
    202,
  );
  const exported = await req("/api/export", { cookie: security });
  await expectStatus(
    "SIEM export is downloadable and minimized",
    exported,
    200,
  );
  assert.match(exported.headers.get("content-disposition"), /attachment/);
  const exportBody = await exported.text();
  assert.ok(!exportBody.includes("Patient A"));
  assert.ok(!exportBody.includes("spo2"));
  await stop();
  await start();
  const recovered = await (
    await req("/api/snapshot", { cookie: admin })
  ).json();
  assert.ok(recovered.alerts.find((a) => a.id === alert.id).notes.length);
  assert.equal(recovered.auditValid, true);
  checks++;
  console.log("PASS restart persistence and session recovery");
  const db = new DatabaseSync(env.DATABASE_PATH);
  const row = db
    .prepare("SELECT body FROM records WHERE collection='patients' LIMIT 1")
    .get();
  assert.ok(!row.body.includes("Patient"));
  assert.ok(
    !readFileSync(env.DATABASE_PATH).includes(Buffer.from("Patient A")),
  );
  assert.throws(
    () => db.prepare("UPDATE audit SET hash='tampered' WHERE id=1").run(),
    /append-only/,
  );
  db.close();
  checks++;
  console.log(
    "PASS encrypted payload storage and append-only audit enforcement",
  );
  await expectStatus(
    "logout revokes the session",
    await req("/api/auth/logout", { method: "POST", cookie: admin, body: {} }),
    200,
  );
  await expectStatus(
    "revoked session cannot read",
    await req("/api/snapshot", { cookie: admin }),
    401,
  );
  for (let i = 0; i < 9; i++)
    await req("/api/auth/login", {
      method: "POST",
      body: { email: "rate@test.local", password: "incorrect" },
    });
  await expectStatus(
    "login attempts are rate limited",
    await req("/api/auth/login", {
      method: "POST",
      body: { email: "rate@test.local", password: "incorrect" },
    }),
    429,
  );
  console.log(
    `\n${checks} API/security checks passed. Isolated test data: ${temp}`,
  );
} catch (error) {
  console.error(error);
  console.error(logs.slice(-4000));
  process.exitCode = 1;
} finally {
  await stop();
}
