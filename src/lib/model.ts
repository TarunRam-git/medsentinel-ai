import { featureNames, features, type ModelOutput } from "./engine";
import type { Event, Snapshot } from "./types";
export async function modelHealth(): Promise<Snapshot["modelHealth"]> {
  try {
    if (!process.env.ML_SERVICE_URL) return { available: false };
    const response = await fetch(`${process.env.ML_SERVICE_URL}/health`, {
      headers: { Authorization: `Bearer ${process.env.ML_SERVICE_TOKEN}` },
      signal: AbortSignal.timeout(1500),
      cache: "no-store",
    });
    if (!response.ok) return { available: false };
    return { available: true, ...(await response.json()) };
  } catch {
    return { available: false };
  }
}
export async function infer(events: Event[]): Promise<ModelOutput | undefined> {
  if (!process.env.ML_SERVICE_URL) return;
  try {
    const f = features(events);
    const response = await fetch(`${process.env.ML_SERVICE_URL}/predict`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.ML_SERVICE_TOKEN}`,
      },
      body: JSON.stringify({
        features: featureNames.map((k) => f[k as keyof typeof f]),
      }),
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return;
    return await response.json();
  } catch {
    return;
  }
}
