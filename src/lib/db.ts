import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, chmodSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { auditHash, decrypt, encrypt, hashPassword } from "./crypto";
import { analyze } from "./engine";
import { devices, patients, scenario } from "./scenarios";
import { roles, type Alert, type Audit, type Event } from "./types";
const globalDb = globalThis as unknown as { medsentinelDb?: DatabaseSync };
export function db(): DatabaseSync {
  if (globalDb.medsentinelDb) return globalDb.medsentinelDb;
  const path = resolve(
    /* turbopackIgnore: true */ process.env.DATABASE_PATH ??
      "./data/medsentinel.db",
  );
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const connection = new DatabaseSync(path);
  chmodSync(path, 0o600);
  connection.exec(readFileSync(resolve("db/schema.sql"), "utf8"));
  globalDb.medsentinelDb = connection;
  if (!connection.prepare("SELECT id FROM users LIMIT 1").get()) {
    const password = process.env.ADMIN_PASSWORD;
    if (!password || password.length < 16)
      throw new Error(
        "ADMIN_PASSWORD must have at least 16 characters. Run npm run setup.",
      );
    transaction(() => {
      connection
        .prepare("INSERT INTO users VALUES (?,?,?,?,?)")
        .run(
          "admin",
          process.env.ADMIN_EMAIL ?? "admin@medsentinel.local",
          "Administrator",
          "admin",
          hashPassword(password),
        );
      if (process.env.ENABLE_DEMO === "true")
        for (const role of roles) {
          connection
            .prepare("INSERT INTO users VALUES (?,?,?,?,?)")
            .run(
              `demo-${role}`,
              `${role}@demo.medsentinel.local`,
              `${role[0].toUpperCase() + role.slice(1)} demo`,
              role,
              hashPassword(crypto.randomUUID()),
            );
        }
      audit(
        "system",
        "system.initialized",
        "workspace",
        "Database schema version 2",
      );
    });
  }
  if (
    process.env.ENABLE_DEMO === "true" &&
    !connection
      .prepare("SELECT id FROM records WHERE collection='patients' LIMIT 1")
      .get()
  )
    seed();
  return connection;
}
export function transaction<T>(fn: () => T): T {
  const c = db();
  c.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    c.exec("COMMIT");
    return result;
  } catch (e) {
    c.exec("ROLLBACK");
    throw e;
  }
}
export function all<T>(collection: string): T[] {
  return (
    db()
      .prepare(
        "SELECT body FROM records WHERE collection=? ORDER BY updated_at DESC,id",
      )
      .all(collection) as { body: string }[]
  ).map((r) => decrypt<T>(r.body));
}
export function get<T>(collection: string, id: string): T | undefined {
  const row = db()
    .prepare("SELECT body FROM records WHERE collection=? AND id=?")
    .get(collection, id) as { body: string } | undefined;
  return row ? decrypt<T>(row.body) : undefined;
}
export function put<T extends { id: string }>(collection: string, value: T) {
  if (collection === "alerts")
    db()
      .prepare("INSERT INTO alert_versions VALUES (?,?,?,?)")
      .run(
        crypto.randomUUID(),
        value.id,
        new Date().toISOString(),
        encrypt(value),
      );
  db()
    .prepare(
      "INSERT INTO records VALUES (?,?,?,?) ON CONFLICT(collection,id) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at",
    )
    .run(collection, value.id, encrypt(value), new Date().toISOString());
}
export function audit(
  actor: string,
  action: string,
  target: string,
  detail: string,
) {
  const c = db();
  const prev =
    (
      c.prepare("SELECT hash FROM audit ORDER BY id DESC LIMIT 1").get() as
        { hash: string } | undefined
    )?.hash ?? "genesis";
  const at = new Date().toISOString();
  const body = encrypt({ actor, action, target, detail });
  const hash = auditHash(`${prev}|${at}|${body}`);
  c.prepare("INSERT INTO audit(at,body,prev_hash,hash) VALUES (?,?,?,?)").run(
    at,
    body,
    prev,
    hash,
  );
}
export function auditLog() {
  return (
    db().prepare("SELECT * FROM audit ORDER BY id DESC LIMIT 200").all() as {
      id: number;
      at: string;
      body: string;
      prev_hash: string;
      hash: string;
    }[]
  ).map(
    (r) =>
      ({
        id: r.id,
        at: r.at,
        ...decrypt<{
          actor: string;
          action: string;
          target: string;
          detail: string;
        }>(r.body),
        prevHash: r.prev_hash,
        hash: r.hash,
      }) satisfies Audit,
  );
}
export function verifyAudit() {
  let prev = "genesis";
  for (const r of db().prepare("SELECT * FROM audit ORDER BY id").all() as {
    at: string;
    body: string;
    prev_hash: string;
    hash: string;
  }[]) {
    if (
      r.prev_hash !== prev ||
      auditHash(`${prev}|${r.at}|${r.body}`) !== r.hash
    )
      return false;
    prev = r.hash;
  }
  return true;
}
function seed() {
  transaction(() => {
    for (const p of patients) put("patients", p);
    for (const d of devices()) put("devices", d);
    for (const [i, name] of (
      ["infusion", "sensor", "network", "device", "benign"] as const
    ).entries()) {
      const events = scenario(
        name,
        patients[i],
        `${i === 0 ? "PMP" : "MON"}-${String(i + 1).padStart(3, "0")}`,
      );
      events.forEach((e) => put("events", e));
      const result = analyze(events, patients[i]);
      if (result) {
        const at = new Date(Date.now() - i * 180000).toISOString();
        put("alerts", {
          ...result,
          id: `ALT-${2026 + i}`,
          createdAt: at,
          updatedAt: at,
          status: i === 2 ? "investigating" : "open",
          notes: [],
        } as Alert);
      }
    }
    audit(
      "system",
      "demo.seeded",
      "workspace",
      "Six synthetic patients, twelve devices, and controlled scenarios. No real patient data.",
    );
  });
}
export function windowEvents(
  patientId: string,
  deviceId: string,
  at: string,
): Event[] {
  const time = Date.parse(at);
  return all<Event>("events")
    .filter(
      (e) =>
        e.patientId === patientId &&
        e.deviceId === deviceId &&
        Math.abs(time - Date.parse(e.timestamp)) <= 300000,
    )
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
