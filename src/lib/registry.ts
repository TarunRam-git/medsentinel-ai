import { z } from "zod";
import { audit, get, put, transaction } from "./db";
import { HttpError } from "./auth";
import type { Device, Patient } from "./types";
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
export const patientSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(100),
    age: z.number().int().min(0).max(130),
    ward: z.string().trim().min(1).max(60),
    bed: z.string().trim().min(1).max(30),
    vulnerability: z.number().min(0).max(1),
    context: z.string().trim().max(500),
    vitals: z
      .object({
        hr: z.number().min(0).max(300),
        spo2: z.number().min(0).max(100),
        systolic: z.number().min(0).max(300),
        temperature: z.number().min(20).max(45),
      })
      .strict(),
  })
  .strict();
export const deviceSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(100),
    type: z.enum(["Patient monitor", "Infusion pump", "Ventilator", "Other"]),
    patientId: id,
    ward: z.string().trim().min(1).max(60),
    status: z.enum(["online", "degraded", "offline"]),
    firmware: z.string().max(60),
    lastSeen: z.iso.datetime({ offset: true }),
  })
  .strict();
export function register(input: unknown, actor: string) {
  const data = z
    .discriminatedUnion("type", [
      z.object({ type: z.literal("patient"), record: patientSchema }),
      z.object({ type: z.literal("device"), record: deviceSchema }),
    ])
    .parse(input);
  return transaction(() => {
    const collection = data.type === "patient" ? "patients" : "devices";
    if (get(collection, data.record.id))
      throw new HttpError(409, "This identifier already exists.");
    if (data.type === "device") {
      const p = get<Patient>("patients", data.record.patientId);
      if (!p || p.ward !== data.record.ward)
        throw new HttpError(
          422,
          "Device patient and department must match the registered patient.",
        );
    }
    put<Patient | Device>(collection, data.record);
    audit(
      actor,
      `${data.type}.registered`,
      data.record.id,
      "Identity registered through the administrator workflow",
    );
    return { id: data.record.id };
  });
}
