import test from "node:test";
import assert from "node:assert/strict";
import { analyze, features, tier } from "../src/lib/engine";
import { patients, scenario } from "../src/lib/scenarios";
import { eventSchema, fhirObservation } from "../src/lib/ingest";
const p = patients[0];
test("benign order and telemetry do not raise an alert", () => {
  assert.equal(analyze(scenario("benign", p, "PMP-001"), p), null);
});
test("infusion mismatch prioritizes patient harm and traces competing causes", () => {
  const events = scenario("infusion", p, "PMP-001");
  const a = analyze(events, p)!;
  assert.equal(a.tier, "critical");
  assert.equal(a.hypotheses[0].cause, "Cyberattack");
  assert.equal(a.hypotheses.length, 5);
  assert.equal(a.model.attackProbability, null);
  assert.equal(a.evidence.length, events.length);
  assert.ok(
    a.hypotheses[0].evidence.every((id) => events.some((e) => e.id === id)),
  );
});
test("sensor discordance favors equipment failure over cyberattack", () => {
  const a = analyze(scenario("sensor", p, "MON-001"), p)!;
  assert.equal(a.hypotheses[0].cause, "Device failure");
  assert.equal(a.tier, "critical");
});
test("network degradation is identified as a competing non-cyber cause", () => {
  const a = analyze(scenario("network", p, "MON-001"), p)!;
  assert.equal(a.hypotheses[0].cause, "Network issue");
});
test("risk is independent of classifier attack probability", () => {
  const events = scenario("infusion", p, "PMP-001");
  const low = analyze(events, p, {
    version: "test",
    attackProbability: 0,
    novelty: 0,
    contributions: {},
  })!;
  const high = analyze(events, p, {
    version: "test",
    attackProbability: 1,
    novelty: 0,
    contributions: {},
  })!;
  assert.equal(low.score, high.score);
});
test("event ordering is based on timestamps, not ingestion order", () => {
  const events = scenario("infusion", p, "PMP-001");
  assert.deepEqual(features(events), features([...events].reverse()));
});
test("tier boundaries are explicit", () => {
  assert.deepEqual([0, 14, 15, 34, 35, 59, 60, 79, 80, 100].map(tier), [
    "informational",
    "informational",
    "low",
    "low",
    "medium",
    "medium",
    "high",
    "high",
    "critical",
    "critical",
  ]);
});
test("invalid values, future timestamps, and extra fields are rejected", () => {
  const { receivedAt: _, ...valid } = scenario("benign", p, "PMP-001")[0];
  void _;
  assert.equal(eventSchema.safeParse(valid).success, true);
  assert.equal(
    eventSchema.safeParse({ ...valid, values: { spo2: 101 } }).success,
    false,
  );
  assert.equal(
    eventSchema.safeParse({
      ...valid,
      timestamp: new Date(Date.now() + 120000).toISOString(),
    }).success,
    false,
  );
  assert.equal(
    eventSchema.safeParse({ ...valid, role: "admin" }).success,
    false,
  );
});
test("FHIR validates units and identity references", () => {
  const obs = {
    resourceType: "Observation",
    id: "test",
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
  const result = fhirObservation(obs);
  assert.equal(result.patientId, "PT-1024");
  assert.deepEqual(result.values, { spo2: 98 });
  assert.throws(() =>
    fhirObservation({
      ...obs,
      valueQuantity: { ...obs.valueQuantity, code: "mmHg" },
    }),
  );
});
