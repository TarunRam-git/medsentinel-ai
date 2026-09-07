import { randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  all,
  audit,
  auditLog,
  db,
  get,
  put,
  transaction,
  verifyAudit,
} from "@/lib/db";
import {
  apiError,
  currentUser,
  HttpError,
  jsonBody,
  rateLimit,
  requireUser,
  sameOrigin,
} from "@/lib/auth";
import { digest, verifyPassword } from "@/lib/crypto";
import { modelHealth } from "@/lib/model";
import { fhirObservation, ingest } from "@/lib/ingest";
import { register } from "@/lib/registry";
import { scenario, scenarioNames } from "@/lib/scenarios";
import {
  roles,
  type Alert,
  type Device,
  type Event,
  type Patient,
  type Role,
  type Status,
  type User,
} from "@/lib/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
const clinical = (role: Role) => ["admin", "clinician"].includes(role);
function visibleAlert(alert: Alert, role: Role) {
  const allowed =
    role === "security"
      ? ["security", "device"]
      : role === "biomedical"
        ? ["device"]
        : [];
  return {
    ...alert,
    evidence:
      clinical(role) || role === "researcher"
        ? alert.evidence
        : alert.evidence.filter((e) => allowed.includes(e.source)),
    recommendations:
      role === "admin"
        ? alert.recommendations
        : alert.recommendations.filter((r) => r.role === role),
    notes: clinical(role)
      ? alert.notes
      : alert.notes.map((n) => ({
          ...n,
          note: "Recorded in the authorized investigation view.",
        })),
  };
}
async function startSession(user: User) {
  const token = randomBytes(32).toString("hex");
  transaction(() => {
    db().prepare("DELETE FROM sessions WHERE expires_at<?").run(Date.now());
    db()
      .prepare("INSERT INTO sessions VALUES (?,?,?)")
      .run(digest(token), user.id, Date.now() + 8 * 3600000);
    audit(user.id, "session.started", "auth", `Role: ${user.role}`);
  });
  (await cookies()).set("medsentinel_session", token, {
    httpOnly: true,
    secure: (process.env.APP_ORIGIN ?? "").startsWith("https://"),
    sameSite: "strict",
    path: "/",
    maxAge: 8 * 3600,
  });
  return Response.json({ user });
}
export async function GET(request: Request, context: Context) {
  try {
    const path = (await context.params).path.join("/");
    if (path === "health")
      return Response.json({
        status: "ok",
        service: "medsentinel",
        version: "1.0.0",
      });
    if (path === "auth/session")
      return Response.json({ user: await currentUser() });
    const user = await requireUser();
    rateLimit(`read:${user.id}`, 240);
    if (path === "snapshot") {
      const health = await modelHealth();
      // Real-data research access is model-only until governed de-identification is configured.
      const restrictedResearch = user.role === "researcher" && process.env.ENABLE_DEMO !== "true";
      return Response.json(
        {
          user,
          patients:
            !restrictedResearch && (clinical(user.role) || user.role === "researcher")
              ? all<Patient>("patients")
              : [],
          devices: restrictedResearch ? [] : all<Device>("devices"),
          alerts: restrictedResearch ? [] : all<Alert>("alerts").map((a) => visibleAlert(a, user.role)),
          events: restrictedResearch ? [] : all<Event>("events")
            .filter(
              (e) =>
                clinical(user.role) ||
                user.role === "researcher" ||
                (user.role === "security" && e.source === "security") ||
                e.source === "device",
            )
            .slice(0, 150),
          audit: ["admin", "security"].includes(user.role) ? auditLog() : [],
          auditValid: verifyAudit(),
          demo: process.env.ENABLE_DEMO === "true",
          modelHealth: health,
          generatedAt: new Date().toISOString(),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (path === "export") {
      await requireUser(["admin", "security", "researcher"]);
      if (user.role === "researcher" && process.env.ENABLE_DEMO !== "true") throw new HttpError(403,"Research exports require a governed de-identified dataset.");
      const alerts = all<Alert>("alerts").map((a) => ({
        id: a.id,
        severity: a.tier,
        riskScore: a.score,
        status: a.status,
        deviceId: a.deviceId,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        modelVersion: a.model.version,
        cause: a.hypotheses[0]?.cause,
      }));
      audit(
        user.id,
        "siem.exported",
        "alerts",
        `${alerts.length} minimized alert records`,
      );
      return Response.json(
        {
          format: "medsentinel-siem-v1",
          generatedAt: new Date().toISOString(),
          synthetic: process.env.ENABLE_DEMO === "true",
          alerts,
        },
        {
          headers: {
            "Content-Disposition": "attachment; filename=medsentinel-siem.json",
            "Cache-Control": "no-store",
          },
        },
      );
    }
    throw new HttpError(404, "Endpoint not found.");
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const path = (await context.params).path.join("/");
    if (path === "ingest" || path === "fhir") {
      const expected = process.env.INGEST_API_KEY;
      const provided =
        request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
      if (
        !expected ||
        Buffer.byteLength(provided) !== Buffer.byteLength(expected) ||
        !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
      )
        throw new HttpError(401, "Valid ingestion credentials are required.");
      rateLimit("integration:ingest", 120);
      const body = await jsonBody(request);
      return Response.json(
        await ingest(
          path === "fhir" ? fhirObservation(body) : body,
          "integration",
        ),
        { status: 202 },
      );
    }
    sameOrigin(request);
    if (path === "auth/login") {
      rateLimit("login:global", 40);
      const data = z
        .object({
          email: z.email().max(200),
          password: z.string().min(1).max(256),
        })
        .parse(await jsonBody(request));
      rateLimit(`login:${digest(data.email.toLowerCase())}`, 8, 300000);
      const user = db()
        .prepare("SELECT * FROM users WHERE email=?")
        .get(data.email.toLowerCase()) as
        (User & { password: string }) | undefined;
      if (!user || !verifyPassword(data.password, user.password)) {
        audit("anonymous", "session.failed", "auth", "Invalid credentials");
        throw new HttpError(401, "Incorrect email or password.");
      }
      const { password: _, ...safe } = user;
      void _;
      return startSession(safe);
    }
    if (path === "auth/demo") {
      if (process.env.ENABLE_DEMO !== "true")
        throw new HttpError(404, "Demo access is disabled.");
      rateLimit("demo:global", 60);
      const { role } = z
        .object({ role: z.enum(roles) })
        .parse(await jsonBody(request));
      const user = db()
        .prepare("SELECT id,email,name,role FROM users WHERE id=?")
        .get(`demo-${role}`) as User;
      return startSession(user);
    }
    const user = await requireUser();
    rateLimit(`write:${user.id}`, 60);
    if (path === "registry") {
      await requireUser(["admin"]);
      return Response.json(register(await jsonBody(request), user.id), {
        status: 201,
      });
    }
    if (path === "auth/logout") {
      const token = (await cookies()).get("medsentinel_session")?.value;
      transaction(() => {
        if (token)
          db().prepare("DELETE FROM sessions WHERE token=?").run(digest(token));
        audit(user.id, "session.ended", "auth", "Signed out");
      });
      (await cookies()).delete("medsentinel_session");
      return Response.json({ ok: true });
    }
    if (path === "scenarios") {
      await requireUser(["admin", "researcher"]);
      if (process.env.ENABLE_DEMO !== "true")
        throw new HttpError(
          403,
          "Scenarios are available only in the synthetic demo.",
        );
      const data = z
        .object({
          scenario: z.enum(scenarioNames),
          patientId: z.string(),
          deviceId: z.string(),
        })
        .parse(await jsonBody(request));
      const patient = get<Patient>("patients", data.patientId);
      const device = get<Device>("devices", data.deviceId);
      if (!patient || !device || device.patientId !== patient.id)
        throw new HttpError(422, "Choose an associated patient and device.");
      const events = scenario(data.scenario, patient, device.id);
      const results = [];
      for (const { receivedAt: _, ...event } of events) {
        void _;
        results.push(await ingest(event, user.id));
      }
      return Response.json({
        ingested: results.length,
        alertIds: [...new Set(results.map((r) => r.alertId).filter(Boolean))],
      });
    }
    if (path.match(/^alerts\/[^/]+\/state$/)) {
      await requireUser(["admin", "clinician", "security", "biomedical"]);
      const id = path.split("/")[1];
      const data = z
        .object({
          status: z.enum([
            "acknowledged",
            "investigating",
            "resolved",
            "false_positive",
          ]),
          note: z.string().trim().min(5).max(2000),
          expectedUpdatedAt: z.string(),
        })
        .parse(await jsonBody(request));
      const updated = transaction(() => {
        const alert = get<Alert>("alerts", id);
        if (!alert) throw new HttpError(404, "Alert not found.");
        if (alert.updatedAt !== data.expectedUpdatedAt)
          throw new HttpError(
            409,
            "This alert changed. Refresh it before saving.",
          );
        const transitions: Record<Status, Status[]> = {
          open: ["acknowledged"],
          acknowledged: ["investigating", "resolved", "false_positive"],
          investigating: ["resolved", "false_positive"],
          resolved: [],
          false_positive: [],
        };
        if (!transitions[alert.status].includes(data.status))
          throw new HttpError(409, "This status transition is not permitted.");
        const at = new Date().toISOString();
        const result = {
          ...alert,
          status: data.status,
          updatedAt: at,
          notes: [
            ...alert.notes,
            { actor: user.id, status: data.status, note: data.note, at },
          ],
        };
        put("alerts", result);
        audit(
          user.id,
          `alert.${data.status}`,
          id,
          `Evidence version ${alert.updatedAt}; human review recorded`,
        );
        return result;
      });
      return Response.json(visibleAlert(updated, user.role));
    }
    throw new HttpError(404, "Endpoint not found.");
  } catch (error) {
    return apiError(error);
  }
}
