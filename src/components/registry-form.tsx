"use client";
import { useState } from "react";
import type { Patient } from "@/lib/types";
export default function RegistryForm({
  type,
  patients,
  onSave,
}: {
  type: "patient" | "device";
  patients: Patient[];
  onSave: (body: unknown) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [patientId, setPatientId] = useState(patients[0]?.id ?? "");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const text = (k: string) => String(f.get(k) ?? "").trim();
        const num = (k: string) => Number(f.get(k));
        setBusy(true);
        setError("");
        try {
          const record =
            type === "patient"
              ? {
                  id: text("id"),
                  name: text("name"),
                  age: num("age"),
                  ward: text("ward"),
                  bed: text("bed"),
                  context: text("context"),
                  vulnerability: num("vulnerability"),
                  vitals: {
                    hr: num("hr"),
                    spo2: num("spo2"),
                    systolic: num("systolic"),
                    temperature: num("temperature"),
                  },
                }
              : {
                  id: text("id"),
                  name: text("name"),
                  type: text("deviceType"),
                  patientId,
                  ward: patients.find((p) => p.id === patientId)?.ward,
                  status: "offline",
                  firmware: text("firmware"),
                  lastSeen: new Date().toISOString(),
                };
          await onSave({ type, record });
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <span className="eyebrow">WORKSPACE REGISTRY</span>
      <h2>
        {type === "patient" ? "Register a patient" : "Add a connected device"}
      </h2>
      <p className="muted">
        Register identifiers before sending observations to the evidence engine.
      </p>
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
      <label>
        Identifier
        <input
          name="id"
          required
          pattern="[a-zA-Z0-9_-]+"
          maxLength={64}
          placeholder={type === "patient" ? "PT-1080" : "MON-007"}
        />
      </label>
      <label>
        {type === "patient" ? "Display name" : "Device name"}
        <input name="name" required maxLength={100} />
      </label>
      {type === "patient" ? (
        <>
          <div className="form-grid">
            <label>
              Age
              <input name="age" type="number" required min="0" max="130" />
            </label>
            <label>
              Department
              <input name="ward" required maxLength={60} />
            </label>
            <label>
              Bed
              <input name="bed" required maxLength={30} />
            </label>
            <label>
              Research vulnerability factor (0–1)
              <input
                name="vulnerability"
                type="number"
                step="0.01"
                min="0"
                max="1"
                required
                defaultValue="0.5"
              />
            </label>
          </div>
          <label>
            Care context
            <textarea name="context" maxLength={500} rows={2} />
          </label>
          <h3>Baseline observations</h3>
          <div className="form-grid">
            <label>
              Heart rate (bpm)
              <input name="hr" type="number" required min="0" max="300" />
            </label>
            <label>
              SpO₂ (%)
              <input name="spo2" type="number" required min="0" max="100" />
            </label>
            <label>
              Systolic BP (mmHg)
              <input name="systolic" type="number" required min="0" max="300" />
            </label>
            <label>
              Temperature (°C)
              <input
                name="temperature"
                type="number"
                step="0.1"
                required
                min="20"
                max="45"
              />
            </label>
          </div>
        </>
      ) : (
        <>
          <label>
            Patient
            <select
              required
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} · {p.ward}
                </option>
              ))}
            </select>
          </label>
          <label>
            Device type
            <select name="deviceType">
              <option>Patient monitor</option>
              <option>Infusion pump</option>
              <option>Ventilator</option>
              <option>Other</option>
            </select>
          </label>
          <label>
            Firmware version
            <input name="firmware" maxLength={60} />
          </label>
          <p className="small-note">
            New devices start offline until telemetry is received.
          </p>
        </>
      )}
      <button
        className="btn primary"
        disabled={busy || (type === "device" && !patients.length)}
      >
        {busy
          ? "Saving…"
          : type === "patient"
            ? "Register patient"
            : "Add device"}
      </button>
    </form>
  );
}
