import type { Alert, Event, Patient, Recommendation, Tier } from "./types";
export const MODEL_VERSION = "integrity-rules-1.0.0";
export const featureNames = [
  "orderMismatch",
  "vitalDiscordance",
  "authFailures",
  "packetLoss",
  "deviceError",
  "configChange",
  "latency",
  "signalQuality",
];
const clamp = (x: number, min = 0, max = 1) => Math.max(min, Math.min(max, x));
export function features(events: Event[]) {
  const latest: Record<string, number> = {};
  for (const event of [...events].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  )) {
    for (const [key, value] of Object.entries(event.values))
      if (typeof value === "number") latest[key] = value;
  }
  return {
    orderMismatch:
      latest.orderRate !== undefined && latest.deviceRate !== undefined
        ? clamp(
            Math.abs(latest.deviceRate - latest.orderRate) /
              Math.max(latest.orderRate, 1),
          )
        : 0,
    vitalDiscordance:
      latest.spo2 !== undefined && latest.independentSpo2 !== undefined
        ? clamp(Math.abs(latest.spo2 - latest.independentSpo2) / 15)
        : 0,
    authFailures: clamp((latest.authFailures ?? 0) / 10),
    packetLoss: clamp((latest.packetLoss ?? 0) / 100),
    deviceError: clamp(latest.deviceError ?? 0),
    configChange: clamp(latest.configChange ?? 0),
    latency: clamp((latest.latency ?? 0) / 2000),
    signalQuality: clamp(latest.signalQuality ?? 1),
  };
}
export function tier(score: number): Tier {
  return score >= 80
    ? "critical"
    : score >= 60
      ? "high"
      : score >= 35
        ? "medium"
        : score >= 15
          ? "low"
          : "informational";
}
const library: Recommendation[] = [
  {
    id: "verify",
    role: "clinician",
    action: "Verify observations against an independent source",
    rationale:
      "Cross-check the signal before interpreting a device anomaly as a patient change.",
    caution:
      "Follow the local escalation protocol. Do not delay urgent bedside assessment.",
  },
  {
    id: "order",
    role: "clinician",
    action: "Reconcile the active order and device settings",
    rationale:
      "Confirm recorded intent with the responsible clinician and current workflow.",
    caution: "This system does not authorize changes to therapy or settings.",
  },
  {
    id: "device",
    role: "biomedical",
    action: "Inspect device health, connections, and recent changes",
    rationale:
      "Distinguish equipment failure from upstream communication or configuration issues.",
    caution:
      "Coordinate with bedside staff before disconnecting or replacing equipment.",
  },
  {
    id: "security",
    role: "security",
    action: "Review access logs and the affected endpoint",
    rationale:
      "Correlate identity events and configuration changes within the evidence window.",
    caution:
      "Any containment requires clinical coordination and established procedures.",
  },
];
export type ModelOutput = {
  version: string;
  attackProbability: number;
  novelty: number;
  contributions: Record<string, number>;
};
export function analyze(
  events: Event[],
  patient: Patient,
  model?: ModelOutput,
): Omit<Alert, "id" | "status" | "createdAt" | "updatedAt" | "notes"> | null {
  if (!events.length) return null;
  const f = features(events);
  const sources = new Set(events.map((e) => e.source));
  const quality = clamp(sources.size / 4) * (0.65 + 0.35 * f.signalQuality);
  const causes = [
    {
      cause: "Cyberattack",
      weight:
        0.05 +
        f.authFailures * 0.55 +
        f.configChange * 0.25 +
        f.orderMismatch * f.authFailures * 0.4,
      keys: ["authFailures", "configChange"],
    },
    {
      cause: "Device failure",
      weight:
        0.05 +
        f.deviceError * 0.65 +
        (1 - f.signalQuality) * 0.4 +
        f.vitalDiscordance * 0.2,
      keys: ["deviceError", "signalQuality", "spo2"],
    },
    {
      cause: "Software fault",
      weight:
        0.05 + f.configChange * 0.3 + f.orderMismatch * 0.2 + f.latency * 0.1,
      keys: ["configChange", "deviceRate"],
    },
    {
      cause: "Network issue",
      weight: 0.05 + f.packetLoss * 0.7 + f.latency * 0.4,
      keys: ["packetLoss", "latency"],
    },
    {
      cause: "Human error",
      weight:
        0.05 +
        f.orderMismatch * 0.5 * (1 - f.authFailures) +
        f.configChange * 0.1,
      keys: ["orderRate", "deviceRate"],
    },
  ];
  const strength = Math.max(
    f.orderMismatch,
    f.vitalDiscordance,
    f.authFailures * 0.8,
    f.packetLoss,
    f.deviceError,
    (1 - f.signalQuality) * 0.6,
    model?.novelty ?? 0,
    (model?.attackProbability ?? 0) * 0.8,
  );
  if (strength < 0.2) return null;
  const timestamps = events.map((e) => Date.parse(e.timestamp));
  const duration = Math.max(...timestamps) - Math.min(...timestamps);
  const factors = {
    severity: Math.round(
      clamp(
        Math.max(
          f.orderMismatch,
          f.vitalDiscordance,
          f.deviceError * 0.7,
          f.packetLoss * 0.6,
        ),
      ) * 100,
    ),
    confidence: Math.round(quality * 100),
    exposure: Math.round(clamp(duration / 300000) * 100),
    vulnerability: Math.round(patient.vulnerability * 100),
    affectedFunction: events.some((e) => e.kind.includes("infusion")) ? 90 : 65,
    evidenceQuality: Math.round(quality * 100),
  };
  // Confidence is reported separately: missing evidence must not suppress a severe warning.
  const risk = Math.round(
    clamp(
      (factors.severity * 0.45 +
        factors.exposure * 0.15 +
        factors.vulnerability * 0.2 +
        factors.affectedFunction * 0.2) /
        100,
    ) * 100,
  );
  const total = causes.reduce((s, c) => s + c.weight, 0);
  const hypotheses = causes
    .map((c) => ({
      cause: c.cause,
      score: Math.round((c.weight / total) * 100),
      evidence: events
        .filter((e) => c.keys.some((k) => k in e.values))
        .map((e) => e.id),
    }))
    .sort((a, b) => b.score - a.score);
  const title =
    f.orderMismatch > 0.25
      ? "Order–device rate mismatch"
      : f.vitalDiscordance > 0.3
        ? "Conflicting oxygen saturation signals"
        : f.deviceError > 0.3
          ? "Device health requires review"
          : f.packetLoss > 0.2
            ? "Telemetry continuity interrupted"
            : "Unusual access and configuration activity";
  return {
    title,
    patientId: patient.id,
    deviceId: events[0].deviceId,
    ward: patient.ward,
    score: risk,
    tier: tier(risk),
    summary: `${sources.size} evidence streams indicate a consistency issue. ${hypotheses[0].cause} has the highest heuristic support; this is a hypothesis, not an established cause.`,
    hypotheses,
    evidence: events.map((e) => ({
      eventId: e.id,
      source: e.source,
      timestamp: e.timestamp,
      summary: `${e.kind}: ${Object.entries(e.values)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")}`,
      supports: hypotheses
        .filter((h) => h.evidence.includes(e.id))
        .map((h) => h.cause),
    })),
    recommendations: library,
    riskFactors: factors,
    model: {
      version: model?.version ?? MODEL_VERSION,
      mode: model ? "XGBoost + Isolation Forest + rules" : "Rules only",
      attackProbability: model?.attackProbability ?? null,
      novelty: model?.novelty ?? null,
      contributions: model?.contributions ?? {},
    },
    quality: Math.round(quality * 100),
    fingerprint: `${patient.id}:${events[0].deviceId}:${title}`,
  };
}
