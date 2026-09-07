export const roles = [
  "admin",
  "clinician",
  "security",
  "biomedical",
  "researcher",
] as const;
export type Role = (typeof roles)[number];
export type User = { id: string; name: string; email: string; role: Role };
export type Tier = "critical" | "high" | "medium" | "low" | "informational";
export type Status =
  "open" | "acknowledged" | "investigating" | "resolved" | "false_positive";
export type Patient = {
  id: string;
  name: string;
  age: number;
  ward: string;
  bed: string;
  vulnerability: number;
  context: string;
  vitals: { hr: number; spo2: number; systolic: number; temperature: number };
};
export type Device = {
  id: string;
  name: string;
  type: string;
  patientId: string;
  ward: string;
  status: "online" | "degraded" | "offline";
  firmware: string;
  lastSeen: string;
};
export type Event = {
  id: string;
  source: "device" | "vitals" | "ehr" | "security" | "workflow";
  patientId: string;
  deviceId: string;
  timestamp: string;
  receivedAt: string;
  kind: string;
  values: Record<string, number | string | boolean>;
  provenance: string;
};
export type Evidence = {
  eventId: string;
  source: Event["source"];
  timestamp: string;
  summary: string;
  supports: string[];
};
export type Hypothesis = { cause: string; score: number; evidence: string[] };
export type Recommendation = {
  id: string;
  role: Role;
  action: string;
  rationale: string;
  caution: string;
};
export type Alert = {
  id: string;
  title: string;
  patientId: string;
  deviceId: string;
  ward: string;
  score: number;
  tier: Tier;
  status: Status;
  createdAt: string;
  updatedAt: string;
  summary: string;
  hypotheses: Hypothesis[];
  evidence: Evidence[];
  recommendations: Recommendation[];
  riskFactors: Record<string, number>;
  model: {
    version: string;
    mode: string;
    attackProbability: number | null;
    novelty: number | null;
    contributions: Record<string, number>;
  };
  quality: number;
  fingerprint: string;
  notes: { actor: string; status: Status; note: string; at: string }[];
};
export type Audit = {
  id: number;
  at: string;
  actor: string;
  action: string;
  target: string;
  detail: string;
  prevHash: string;
  hash: string;
};
export type Snapshot = {
  user: User;
  patients: Patient[];
  devices: Device[];
  alerts: Alert[];
  events: Event[];
  audit: Audit[];
  auditValid: boolean;
  demo: boolean;
  modelHealth: {
    available: boolean;
    version?: string;
    metrics?: Record<string, Record<string, number>>;
    dataset?: string;
  };
  generatedAt: string;
};
