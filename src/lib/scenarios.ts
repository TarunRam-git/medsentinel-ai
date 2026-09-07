import type { Device, Event, Patient } from "./types";
export const patients: Patient[] = [
  {
    id: "PT-1024",
    name: "Patient A",
    age: 67,
    ward: "ICU",
    bed: "ICU-04",
    vulnerability: 0.9,
    context: "Postoperative monitoring · infusion support",
    vitals: { hr: 86, spo2: 97, systolic: 118, temperature: 36.8 },
  },
  {
    id: "PT-1038",
    name: "Patient B",
    age: 54,
    ward: "ICU",
    bed: "ICU-08",
    vulnerability: 0.8,
    context: "Respiratory observation",
    vitals: { hr: 92, spo2: 96, systolic: 124, temperature: 37.1 },
  },
  {
    id: "PT-1042",
    name: "Patient C",
    age: 72,
    ward: "Cardiology",
    bed: "CRD-12",
    vulnerability: 0.7,
    context: "Cardiac telemetry observation",
    vitals: { hr: 74, spo2: 98, systolic: 132, temperature: 36.6 },
  },
  {
    id: "PT-1056",
    name: "Patient D",
    age: 43,
    ward: "General",
    bed: "GEN-06",
    vulnerability: 0.3,
    context: "Routine recovery monitoring",
    vitals: { hr: 78, spo2: 99, systolic: 116, temperature: 36.9 },
  },
  {
    id: "PT-1061",
    name: "Patient E",
    age: 61,
    ward: "Cardiology",
    bed: "CRD-03",
    vulnerability: 0.65,
    context: "Continuous cardiac observation",
    vitals: { hr: 81, spo2: 97, systolic: 128, temperature: 37 },
  },
  {
    id: "PT-1073",
    name: "Patient F",
    age: 36,
    ward: "General",
    bed: "GEN-09",
    vulnerability: 0.2,
    context: "Postoperative recovery",
    vitals: { hr: 72, spo2: 99, systolic: 112, temperature: 36.7 },
  },
];
export function devices(): Device[] {
  return patients.flatMap((p, i) => [
    {
      id: `MON-${String(i + 1).padStart(3, "0")}`,
      name: `Bedside monitor ${i + 1}`,
      type: "Patient monitor",
      patientId: p.id,
      ward: p.ward,
      status: i === 2 ? "degraded" : "online",
      firmware: "4.2.1",
      lastSeen: new Date().toISOString(),
    },
    {
      id: `PMP-${String(i + 1).padStart(3, "0")}`,
      name: `Infusion pump ${i + 1}`,
      type: "Infusion pump",
      patientId: p.id,
      ward: p.ward,
      status: "online",
      firmware: "3.8.0",
      lastSeen: new Date().toISOString(),
    },
  ]);
}
export const scenarioNames = [
  "infusion",
  "sensor",
  "network",
  "device",
  "benign",
] as const;
export function scenario(
  name: (typeof scenarioNames)[number],
  patient: Patient,
  deviceId: string,
): Event[] {
  const run = crypto.randomUUID();
  const now = Date.now();
  const make = (
    source: Event["source"],
    kind: string,
    values: Event["values"],
    offset: number,
  ): Event => ({
    id: `${run}-${source}`,
    source,
    kind,
    values,
    patientId: patient.id,
    deviceId,
    timestamp: new Date(now + offset).toISOString(),
    receivedAt: new Date(now).toISOString(),
    provenance: `synthetic-scenario:${name}:v1`,
  });
  const base = [
    make("ehr", "active infusion order", { orderRate: 5 }, -240000),
    make("workflow", "order confirmed", { confirmed: true }, -200000),
  ];
  if (name === "infusion")
    return [
      ...base,
      make(
        "security",
        "unusual access",
        { authFailures: 9, configChange: 1 },
        -120000,
      ),
      make(
        "device",
        "infusion telemetry",
        { deviceRate: 12, signalQuality: 0.98 },
        -60000,
      ),
      make(
        "vitals",
        "independent observation",
        { spo2: 97, independentSpo2: 98 },
        0,
      ),
    ];
  if (name === "sensor")
    return [
      ...base,
      make(
        "device",
        "sensor signal quality",
        { deviceError: 0.4, signalQuality: 0.3 },
        -120000,
      ),
      make(
        "vitals",
        "oxygen saturation comparison",
        { spo2: 79, independentSpo2: 97 },
        0,
      ),
    ];
  if (name === "network")
    return [
      make(
        "security",
        "network flow",
        { packetLoss: 48, latency: 1400 },
        -240000,
      ),
      make("device", "delayed telemetry", { signalQuality: 0.9 }, 0),
    ];
  if (name === "device")
    return [
      ...base,
      make(
        "device",
        "self-test warning",
        { deviceError: 1, signalQuality: 0.65 },
        0,
      ),
    ];
  return [
    ...base,
    make(
      "device",
      "infusion telemetry",
      { deviceRate: 5, signalQuality: 1 },
      -60000,
    ),
    make(
      "vitals",
      "independent observation",
      { spo2: 98, independentSpo2: 98 },
      0,
    ),
  ];
}
