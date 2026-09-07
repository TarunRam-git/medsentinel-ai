import { z } from "zod";
import { analyze } from "./engine";
import { all, audit, get, put, transaction, windowEvents } from "./db";
import { HttpError } from "./auth";
import { infer } from "./model";
import type { Alert, Device, Event, Patient } from "./types";
const id = z.string().regex(/^[a-zA-Z0-9_.:-]{1,120}$/);
export const eventSchema = z
  .object({
    id,
    source: z.enum(["device", "vitals", "ehr", "security", "workflow"]),
    patientId: id,
    deviceId: id,
    timestamp: z.iso.datetime({ offset: true }),
    kind: z.string().min(1).max(100),
    values: z
      .record(
        z.string().min(1).max(50),
        z.union([z.number().finite(), z.string().max(200), z.boolean()]),
      )
      .refine((v) => Object.keys(v).length <= 30),
    provenance: z.string().min(1).max(200),
  })
  .strict()
  .superRefine((e, ctx) => {
    for (const [key, value] of Object.entries(e.values)) {
      const range: Record<string, [number, number]> = {
        hr: [0, 300],
        systolic: [0, 300],
        temperature: [20, 45],
        spo2: [0, 100],
        independentSpo2: [0, 100],
        signalQuality: [0, 1],
        deviceError: [0, 1],
        configChange: [0, 1],
        packetLoss: [0, 100],
        authFailures: [0, 100000],
        latency: [0, 3600000],
        orderRate: [0, 100000],
        deviceRate: [0, 100000],
      };
      if (
        range[key] &&
        (typeof value !== "number" ||
          value < range[key][0] ||
          value > range[key][1])
      )
        ctx.addIssue({
          code: "custom",
          message: `Invalid ${key}`,
          path: ["values", key],
        });
    }
    if (Date.parse(e.timestamp) > Date.now() + 60000)
      ctx.addIssue({
        code: "custom",
        message: "Timestamp is in the future",
        path: ["timestamp"],
      });
  });
export async function ingest(input: unknown, actor: string) {
  const parsed = eventSchema.parse(input);
  const patient = get<Patient>("patients", parsed.patientId);
  const device = get<Device>("devices", parsed.deviceId);
  if (!patient || !device || device.patientId !== patient.id)
    throw new HttpError(
      422,
      "Patient and device identities must match an existing association.",
    );
  if (get<Event>("events", parsed.id))
    return { duplicate: true, eventId: parsed.id, alertId: null };
  const event: Event = {
    ...parsed,
    timestamp: new Date(parsed.timestamp).toISOString(),
    receivedAt: new Date().toISOString(),
  };
  const events = [
    ...windowEvents(patient.id, device.id, event.timestamp),
    event,
  ];
  const model = await infer(events);
  return transaction(() => {
    if (get<Event>("events", event.id))
      return { duplicate: true, eventId: event.id, alertId: null };
    const currentEvents = [
      ...windowEvents(patient.id, device.id, event.timestamp),
      event,
    ];
    const result = analyze(
      currentEvents,
      patient,
      currentEvents.length === events.length ? model : undefined,
    );
    put("events", event);
    if (event.source === "vitals") {
      const currentPatient = get<Patient>("patients", patient.id)!;
      const updated = {
        ...currentPatient,
        vitals: { ...currentPatient.vitals },
        vitalTimestamps: { ...currentPatient.vitalTimestamps },
      };
      for (const key of ["hr", "spo2", "systolic", "temperature"] as const) {
        const value = event.values[key];
        if (
          typeof value === "number" &&
          event.timestamp >= (updated.vitalTimestamps[key] ?? "")
        ) {
          updated.vitals[key] = value;
          updated.vitalTimestamps[key] = event.timestamp;
        }
      }
      put("patients", updated);
    }
    const currentDevice = get<Device>("devices", device.id)!;
    if (event.source === "device" && event.timestamp >= currentDevice.lastSeen)
      put("devices", {
        ...currentDevice,
        lastSeen: event.timestamp,
        status:
          Number(event.values.deviceError ?? 0) > 0.5 ? "degraded" : "online",
      });
    let alertId: string | null = null;
    if (result) {
      const existing = all<Alert>("alerts").find(
        (a) =>
          a.fingerprint === result.fingerprint &&
          !["resolved", "false_positive"].includes(a.status),
      );
      alertId =
        existing?.id ?? `ALT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const at = new Date().toISOString();
      put("alerts", {
        ...result,
        id: alertId,
        createdAt: existing?.createdAt ?? at,
        updatedAt: at,
        status: existing?.status ?? "open",
        notes: existing?.notes ?? [],
      } as Alert);
    }
    audit(
      actor,
      "event.ingested",
      event.id,
      `${event.source}; provenance=${event.provenance}; alert=${alertId ?? "none"}`,
    );
    return { duplicate: false, eventId: event.id, alertId };
  });
}
export function fhirObservation(input: unknown) {
  const data = z
    .object({
      resourceType: z.literal("Observation"),
      id,
      status: z.enum(["final", "amended", "corrected"]),
      subject: z.object({ reference: z.string() }),
      device: z.object({ reference: z.string() }),
      effectiveDateTime: z.iso.datetime({ offset: true }),
      code: z.object({
        coding: z
          .array(
            z.object({
              system: z.literal("http://loinc.org"),
              code: z.string(),
            }),
          )
          .min(1),
      }),
      valueQuantity: z.object({
        value: z.number(),
        system: z.literal("http://unitsofmeasure.org"),
        code: z.string(),
      }),
    })
    .parse(input);
  const coding = data.code.coding.find((c) =>
    ["59408-5", "8867-4"].includes(c.code),
  );
  if (!coding)
    throw new HttpError(
      422,
      "Supported LOINC codes are 59408-5 (SpO2) and 8867-4 (heart rate).",
    );
  const key = coding.code === "59408-5" ? "spo2" : "hr";
  if (data.valueQuantity.code !== (key === "spo2" ? "%" : "/min"))
    throw new HttpError(422, "The UCUM unit does not match the observation.");
  if (
    !data.subject.reference.startsWith("Patient/") ||
    !data.device.reference.startsWith("Device/")
  )
    throw new HttpError(422, "Use local Patient/ and Device/ references.");
  return {
    id: `fhir:${data.id}`,
    source: "vitals",
    patientId: data.subject.reference.slice(8),
    deviceId: data.device.reference.slice(7),
    timestamp: data.effectiveDateTime,
    kind: `FHIR ${key} observation`,
    values: { [key]: data.valueQuantity.value },
    provenance: `FHIR R4 Observation/${data.id}`,
  };
}
