"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import RegistryForm from "./registry-form";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Cpu,
  Database,
  FlaskConical,
  HeartPulse,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  Network,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldAlert,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import type { Alert, Device, Patient, Snapshot, Status } from "@/lib/types";
type Section =
  | "overview"
  | "alerts"
  | "patients"
  | "devices"
  | "insights"
  | "integrations"
  | "audit";
const nav = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "alerts", label: "Integrity alerts", icon: ShieldAlert },
  { id: "patients", label: "Patients", icon: Users },
  { id: "devices", label: "Connected devices", icon: HeartPulse },
  { id: "insights", label: "Model insights", icon: Activity },
  { id: "integrations", label: "Integrations", icon: Network },
  { id: "audit", label: "Audit trail", icon: BookOpen },
] as const;
const names: Record<string, string> = {
  no_alerts: "No alerts",
  open: "Open",
  acknowledged: "Acknowledged",
  investigating: "Investigating",
  resolved: "Resolved",
  false_positive: "False positive",
};
function time(value: string) {
  return new Date(value).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
function date(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
function label(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
}
async function post(path: string, body: unknown) {
  const r = await fetch(`/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Request failed");
  return data;
}
function Pill({ value }: { value: string }) {
  return (
    <span className={`pill ${value}`}>
      <i />
      {names[value] ?? label(value)}
    </span>
  );
}
function Empty({
  message = "No matching records",
  detail = "Try another search or clear your filters.",
}: {
  message?: string;
  detail?: string;
}) {
  return (
    <div className="empty">
      <ShieldCheck size={30} />
      <h3>{message}</h3>
      <p>{detail}</p>
    </div>
  );
}
export default function Workspace({ section }: { section: Section }) {
  const router = useRouter();
  const [registry, setRegistry] = useState<"patient" | "device" | null>(null);
  const [data, setData] = useState<Snapshot>();
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [ward, setWard] = useState("all");
  const [tier, setTier] = useState("all");
  const [status, setStatus] = useState("active");
  const [menu, setMenu] = useState(false);
  const [selected, setSelected] = useState<Alert | Patient | Device | null>(
    null,
  );
  const [simulate, setSimulate] = useState(false);
  const [scenario, setScenario] = useState("infusion");
  const [patientId, setPatientId] = useState("PT-1024");
  const [deviceId, setDeviceId] = useState("PMP-001");
  const [note, setNote] = useState("");
  const [action, setAction] = useState<Status>("acknowledged");
  const dialog = useRef<HTMLDialogElement>(null);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/snapshot", { cache: "no-store" });
      if (r.status === 401) {
        router.replace("/login");
        router.refresh();
        return;
      }
      if (!r.ok)
        throw new Error("Could not refresh the workspace. Please try again.");
      setData(await r.json());
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [router]);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const timer = setInterval(refresh, 30000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [refresh]);
  useEffect(() => {
    if (selected || simulate || registry) {
      dialog.current?.showModal();
    } else {
      dialog.current?.close();
    }
  }, [selected, simulate, registry]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  const notify = (message: string) => {
    setToast(message);
    void refresh();
  };
  const openAlert = (a: Alert) => {
    setNote("");
    setAction(
      a.status === "open"
        ? "acknowledged"
        : a.status === "investigating"
          ? "resolved"
          : "investigating",
    );
    setSelected(a);
  };
  const close = () => {
    setSelected(null);
    setSimulate(false);
    setRegistry(null);
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!data)
    return (
      <main className="loading-page">
        <ShieldCheck size={36} />
        <h1>MedSentinel AI</h1>
        <p>{error || "Preparing your clinical integrity workspace…"}</p>
        {error && (
          <button className="btn" onClick={refresh}>
            Try again
          </button>
        )}
      </main>
    );
  const active = data.alerts.filter(
    (a) => !["resolved", "false_positive"].includes(a.status),
  );
  const visibleAlerts = data.alerts
    .filter(
      (a) =>
        (ward === "all" || a.ward === ward) &&
        (tier === "all" || a.tier === tier) &&
        (status === "all" ||
          (status === "active"
            ? !["resolved", "false_positive"].includes(a.status)
            : a.status === status)) &&
        `${a.id} ${a.title} ${a.patientId} ${a.deviceId}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => b.score - a.score);
  const visiblePatients = data.patients.filter(
    (p) =>
      (ward === "all" || p.ward === ward) &&
      `${p.id} ${p.name} ${p.bed}`.toLowerCase().includes(query.toLowerCase()),
  );
  const visibleDevices = data.devices.filter(
    (d) =>
      (ward === "all" || d.ward === ward) &&
      `${d.id} ${d.name} ${d.type} ${d.patientId}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const canSimulate =
    data.demo && ["admin", "researcher"].includes(data.user.role);
  const canExport =
    ["admin", "security"].includes(data.user.role) ||
    (data.demo && data.user.role === "researcher");
  const navItems = nav.filter(
    (n) =>
      (n.id !== "patients" ||
        ["admin", "clinician"].includes(data.user.role) ||
        (n.id === "patients" &&
          data.demo &&
          data.user.role === "researcher")) &&
      (n.id !== "audit" || ["admin", "security"].includes(data.user.role)),
  );
  const alertSelected = selected && "hypotheses" in selected ? selected : null;
  const countByTier = [
    "critical",
    "high",
    "medium",
    "low",
    "informational",
  ].map((t) => ({ tier: t, count: active.filter((a) => a.tier === t).length }));
  const latestEvents = [...data.events].sort((a, b) =>
    b.timestamp.localeCompare(a.timestamp),
  );
  const pageTitle = {
    overview: "Clinical integrity, at a glance.",
    alerts: "Every alert. The full context.",
    patients: "Care starts with the patient.",
    devices: "Your connected care environment.",
    insights: "Understand the engine.",
    integrations: "Bring the evidence together.",
    audit: "Every action, accounted for.",
  }[section];
  const pageSubtitle = {
    overview: "A shared view of patient safety, device health, and security.",
    alerts:
      "Prioritize, investigate, and document with evidence at every step.",
    patients: data.demo
      ? "Synthetic patient context and the devices supporting their care."
      : "Registered patient context and the devices supporting their care.",
    devices: "Track equipment, patient associations, and telemetry continuity.",
    insights:
      "Transparent model provenance, evaluation, and practical limitations.",
    integrations:
      "Secure ingestion and focused exports for your hospital systems.",
    audit: "An append-only, tamper-evident record of workspace activity.",
  }[section];
  function alertTable(alerts: Alert[]) {
    return alerts.length ? (
      <>
        <div className="mobile-alerts">
          {alerts.map((a) => (
            <button
              className="mobile-alert-card"
              key={a.id}
              onClick={() => openAlert(a)}
            >
              <span>
                <Pill value={a.tier} />
                <small>{time(a.createdAt)}</small>
              </span>
              <b>{a.title}</b>
              <small>
                {a.patientId} · {a.deviceId} · {a.ward}
              </small>
              <span>
                {names[a.status]}
                <span>
                  Investigate <ChevronRight size={14} />
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="table-scroll alert-desktop">
          <table>
            <thead>
              <tr>
                <th>Alert & evidence</th>
                <th>Patient / device</th>
                <th>Risk level</th>
                <th>Status</th>
                <th>Detected</th>
                <th>
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id}>
                  <td>
                    <button
                      className="alert-title"
                      onClick={() => openAlert(a)}
                    >
                      {a.title}
                    </button>
                    <small>
                      {a.id}
                      <span className="dot-separator">·</span>
                      {a.evidence.length} evidence events
                    </small>
                  </td>
                  <td>
                    <span className="medium-text">{a.patientId}</span>
                    <small>
                      {a.ward} · {a.deviceId}
                    </small>
                  </td>
                  <td>
                    <Pill value={a.tier} />
                  </td>
                  <td>
                    <span className={`status-text ${a.status}`}>
                      {names[a.status]}
                    </span>
                  </td>
                  <td className="muted">{time(a.createdAt)}</td>
                  <td>
                    <button
                      className="icon-btn"
                      aria-label={`Investigate ${a.id}`}
                      onClick={() => openAlert(a)}
                    >
                      <ChevronRight size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    ) : (
      <Empty />
    );
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {menu && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`sidebar ${menu ? "is-open" : ""}`}>
        <Link className="brand" href="/overview">
          <span className="brand-mark">
            <ShieldCheck size={22} />
          </span>
          <span>
            MedSentinel<span className="brand-ai">AI</span>
          </span>
        </Link>
        <div className="workspace-switch">
          <span className="hospital-icon">
            <Plus size={18} />
          </span>
          <div>
            <b>Smart Hospital</b>
            <small>
              {data.demo ? "Research workspace" : "Clinical workspace"}
            </small>
          </div>
          <ChevronDown size={14} />
        </div>
        <span className="nav-caption">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {navItems.map((n) => (
            <Link
              key={n.id}
              href={`/${n.id}`}
              className={section === n.id ? "active" : ""}
              aria-current={section === n.id ? "page" : undefined}
              onClick={() => setMenu(false)}
            >
              <n.icon size={18} />
              <span>{n.label}</span>
              {n.id === "alerts" && active.length > 0 && (
                <span className="nav-count">{active.length}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="human-note">
            <ShieldCheck size={20} />
            <b>Human judgment. Always.</b>
            <p>
              Evidence to support your team.
              <br />
              Every response stays in your hands.
            </p>
          </div>
          <Link href="/insights" className="help-link">
            <CircleHelp size={17} /> About this prototype
            <ArrowRight size={14} />
          </Link>
          <div className="profile">
            <div className="avatar">{data.user.name.slice(0, 1)}</div>
            <div>
              <b>{data.user.name}</b>
              <small>{label(data.user.role)}</small>
            </div>
            <button
              className="icon-btn"
              aria-label="Sign out"
              onClick={() =>
                run(async () => {
                  await post("auth/logout", {});
                  router.replace("/login");
                  router.refresh();
                })
              }
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-btn mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMenu(true)}
          >
            <Menu size={21} />
          </button>
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <span>{nav.find((n) => n.id === section)?.label}</span>
          </div>
          <div className="topbar-right">
            <span className="connection">
              <span className="live-dot" />{" "}
              {error ? "Connection interrupted" : "Workspace connected"}
            </span>
            <span className="top-divider" />
            <Link
              className="icon-btn bell"
              href="/alerts"
              aria-label={`${active.length} active alerts`}
            >
              <Bell size={19} />
              {active.length > 0 && <i />}
            </Link>
            <div className="avatar small-avatar">
              {data.user.name.slice(0, 1)}
            </div>
          </div>
        </header>
        <main id="main" className="main-content">
          <div className="heading-row">
            <div>
              <div className="eyebrow">
                {section === "overview"
                  ? "HOSPITAL OVERVIEW"
                  : "CLINICAL INTEGRITY WORKSPACE"}
              </div>
              <h1>{pageTitle}</h1>
              <p>{pageSubtitle}</p>
            </div>
            <div className="heading-actions">
              {data.user.role === "admin" &&
                ["patients", "devices"].includes(section) && (
                  <button
                    className="btn primary"
                    onClick={() =>
                      setRegistry(section === "patients" ? "patient" : "device")
                    }
                  >
                    <Plus size={15} />
                    {section === "patients" ? "Register patient" : "Add device"}
                  </button>
                )}
              {canExport && (
                <a className="btn" href="/api/export" download>
                  <ArrowDownToLine size={15} /> Export report
                </a>
              )}
              {canSimulate && (
                <button
                  className="btn primary"
                  onClick={() => {
                    setSimulate(true);
                    setPatientId(data.patients[0]?.id ?? "");
                    setDeviceId(
                      data.devices.find(
                        (d) => d.patientId === data.patients[0]?.id,
                      )?.id ?? "",
                    );
                  }}
                >
                  <Play size={14} /> Run scenario
                </button>
              )}
            </div>
          </div>
          {data.demo && (
            <div className="demo-ribbon">
              <FlaskConical size={15} />
              <span>
                <b>Research prototype</b>{" "}
                <span className="ribbon-divider">/</span> Synthetic patient
                data. For evaluation, not clinical use.
              </span>
              <span className="ribbon-tag">DEMO ENVIRONMENT</span>
            </div>
          )}
          {error && (
            <div className="error-message" role="alert">
              {error}
              <button className="text-button" onClick={refresh}>
                Retry
              </button>
            </div>
          )}
          {["overview", "alerts", "patients", "devices"].includes(section) && (
            <div className="filter-row">
              <div className="filters-left">
                <label className="select-wrap">
                  <SlidersHorizontal size={14} />
                  <span className="sr-only">Ward</span>
                  <select
                    aria-label="Ward"
                    value={ward}
                    onChange={(e) => setWard(e.target.value)}
                  >
                    <option value="all">All departments</option>
                    {[...new Set(data.devices.map((d) => d.ward))].map((w) => (
                      <option key={w}>{w}</option>
                    ))}
                  </select>
                </label>
                <span className="date-label">
                  <Clock3 size={14} />
                  {date(data.generatedAt)}
                </span>
              </div>
              <div className="filters-right">
                <label className="search-box">
                  <Search size={15} />
                  <input
                    aria-label="Search records"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search records…"
                  />
                </label>
                <button
                  className="icon-btn refresh"
                  aria-label="Refresh workspace"
                  onClick={() =>
                    run(async () => {
                      await refresh();
                      setToast("Workspace refreshed");
                    })
                  }
                >
                  <RefreshCw size={16} className={busy ? "spin" : ""} />
                </button>
              </div>
            </div>
          )}
          {section === "overview" && (
            <>
              <div className="stats-grid">
                <Stat
                  icon={ShieldAlert}
                  label="Active integrity alerts"
                  value={active.length}
                  note={`${active.filter((a) => ["critical", "high"].includes(a.tier)).length} require priority review`}
                  tone="red"
                />
                <Stat
                  icon={Users}
                  label="Patients monitored"
                  value={new Set(data.devices.map((d) => d.patientId)).size}
                  note={`Across ${new Set(data.devices.map((d) => d.ward)).size} care departments`}
                  tone="teal"
                />
                <Stat
                  icon={HeartPulse}
                  label="Connected devices"
                  value={data.devices.length}
                  note={`${data.devices.filter((d) => d.status === "online").length} reporting as online`}
                  tone="blue"
                />
                <Stat
                  icon={Network}
                  label="Evidence streams"
                  value={new Set(data.events.map((e) => e.source)).size}
                  note={`${data.events.length} events available to your role`}
                  tone="purple"
                />
              </div>
              <div className="overview-grid">
                <section className="panel priority-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Where attention is needed</h2>
                      <p>Patient risk across active alerts</p>
                    </div>
                    <ShieldCheck size={18} className="muted" />
                  </div>
                  <div className="risk-content">
                    <div
                      className="risk-ring"
                      style={{
                        background: `conic-gradient(#cf4e51 0 ${active.length ? (countByTier[0].count / active.length) * 100 : 0}%,#de9b51 0 ${active.length ? ((countByTier[0].count + countByTier[1].count) / active.length) * 100 : 0}%,#e6bd68 0 ${active.length ? ((countByTier[0].count + countByTier[1].count + countByTier[2].count) / active.length) * 100 : 0}%,#80b8ac 0 100%)`,
                      }}
                    >
                      <div>
                        <strong>{active.length}</strong>
                        <span>active alerts</span>
                      </div>
                    </div>
                    <div className="risk-legend">
                      {countByTier.map((t) => (
                        <button
                          key={t.tier}
                          onClick={() => {
                            setTier(t.tier);
                            document
                              .getElementById("alert-queue")
                              ?.scrollIntoView({ behavior: "smooth" });
                          }}
                        >
                          <span className={`legend-dot ${t.tier}`} />
                          <span>{label(t.tier)}</span>
                          <b>{t.count}</b>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="panel-foot">
                    <ShieldCheck size={14} />
                    <span>
                      Risk reflects potential care impact, not attack
                      likelihood.
                    </span>
                  </div>
                </section>
                <section className="panel evidence-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Evidence activity</h2>
                      <p>Events received by source · current workspace</p>
                    </div>
                    <span className="subtle-tag">
                      {data.events.length} events
                    </span>
                  </div>
                  <div
                    className="source-chart"
                    role="img"
                    aria-label={[
                      "device",
                      "vitals",
                      "ehr",
                      "security",
                      "workflow",
                    ]
                      .map(
                        (s) =>
                          `${s}: ${data.events.filter((e) => e.source === s).length}`,
                      )
                      .join(", ")}
                  >
                    {["device", "vitals", "ehr", "security", "workflow"].map(
                      (s) => {
                        const count = data.events.filter(
                          (e) => e.source === s,
                        ).length;
                        return (
                          <div className="chart-column" key={s}>
                            <span>{count}</span>
                            <div className="bar-track">
                              <div
                                className={`chart-bar ${s}`}
                                style={{
                                  height: `${Math.max(2, (count / Math.max(1, ...["device", "vitals", "ehr", "security", "workflow"].map((k) => data.events.filter((e) => e.source === k).length))) * 100)}%`,
                                }}
                              />
                            </div>
                            <small>{s === "ehr" ? "EHR" : label(s)}</small>
                          </div>
                        );
                      },
                    )}
                  </div>
                  <div className="panel-foot">
                    <span className="live-dot" />
                    <span>Time-aligned evidence with source provenance</span>
                  </div>
                </section>
                <section className="panel focus-panel">
                  <div className="focus-icon">
                    <ShieldCheck size={24} />
                  </div>
                  <span className="eyebrow">EVIDENCE BEFORE ACTION</span>
                  <h2>
                    See the connection.
                    <br />
                    Make an informed call.
                  </h2>
                  <p>
                    Investigate the signals behind each alert, compare likely
                    causes, and record your next step.
                  </p>
                  <Link href="/alerts">
                    Review alert queue <ArrowRight size={16} />
                  </Link>
                  <div className="focus-bottom">
                    <span className="live-dot" /> Human review required
                  </div>
                </section>
              </div>
              <section className="panel" id="alert-queue">
                <div className="panel-heading">
                  <div className="heading-inline">
                    <h2>Priority alert queue</h2>
                    <span className="count-badge">{visibleAlerts.length}</span>
                    {tier !== "all" && (
                      <button
                        className="text-button"
                        onClick={() => setTier("all")}
                      >
                        Clear {tier} filter
                      </button>
                    )}
                  </div>
                  <Link className="text-link" href="/alerts">
                    View all alerts <ArrowRight size={14} />
                  </Link>
                </div>
                {alertTable(visibleAlerts.slice(0, 5))}
              </section>
              <div className="bottom-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Care environment</h2>
                    <Link className="text-link" href="/devices">
                      View devices <ArrowRight size={14} />
                    </Link>
                  </div>
                  <div className="ward-grid">
                    {[...new Set(data.devices.map((d) => d.ward))].map((w) => (
                      <button
                        className="ward-card"
                        key={w}
                        onClick={() => setWard(ward === w ? "all" : w)}
                        aria-pressed={ward === w}
                      >
                        <span className="ward-icon">
                          <HeartPulse size={18} />
                        </span>
                        <b>{w}</b>
                        <small>
                          {data.devices.filter((d) => d.ward === w).length}{" "}
                          devices · {active.filter((a) => a.ward === w).length}{" "}
                          active alerts
                        </small>
                        <span
                          className={`ward-state ${active.some((a) => a.ward === w) ? "attention" : ""}`}
                        >
                          <i />
                          {active.some((a) => a.ward === w)
                            ? "Review needed"
                            : "No active alerts"}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Latest evidence</h2>
                    <Radio size={17} className="muted" />
                  </div>
                  <div className="activity-list">
                    {latestEvents.slice(0, 3).map((e) => (
                      <div key={e.id}>
                        <span className={`event-dot ${e.source}`} />
                        <div>
                          <b>{e.kind}</b>
                          <small>
                            {e.deviceId} · {label(e.source)}
                          </small>
                        </div>
                        <time>{time(e.timestamp)}</time>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </>
          )}
          {section === "alerts" && (
            <section className="panel">
              <div className="alert-toolbar">
                <div className="tabs" role="group" aria-label="Risk tier">
                  {[
                    "all",
                    "critical",
                    "high",
                    "medium",
                    "low",
                    "informational",
                  ].map((t) => (
                    <button
                      key={t}
                      className={tier === t ? "selected" : ""}
                      onClick={() => setTier(t)}
                    >
                      {t === "all" ? "All alerts" : label(t)}
                    </button>
                  ))}
                </div>
                <select
                  aria-label="Alert status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="active">Active alerts</option>
                  <option value="all">All statuses</option>
                  {Object.entries(names).map(([v, n]) => (
                    <option key={v} value={v}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              {alertTable(visibleAlerts)}
              <div className="panel-foot">
                {visibleAlerts.length} matching alerts · Sorted by patient risk
              </div>
            </section>
          )}
          {section === "patients" && (
            <div className="patient-grid">
              {visiblePatients.map((p) => {
                const risk = active
                  .filter((a) => a.patientId === p.id)
                  .sort((a, b) => b.score - a.score)[0];
                return (
                  <button
                    className="panel patient-card"
                    key={p.id}
                    onClick={() => setSelected(p)}
                  >
                    <div className="patient-card-top">
                      <span className="patient-avatar">
                        <Users size={21} />
                      </span>
                      {risk ? (
                        <Pill value={risk.tier} />
                      ) : (
                        <Pill value="no_alerts" />
                      )}
                    </div>
                    <h2>{p.id}</h2>
                    <p>
                      {p.name} · {p.age} years · {p.bed}
                    </p>
                    <div className="vital-row">
                      <div>
                        <small>Heart rate</small>
                        <b>
                          {p.vitals.hr}
                          <em>bpm</em>
                        </b>
                      </div>
                      <div>
                        <small>SpO₂</small>
                        <b>
                          {p.vitals.spo2}
                          <em>%</em>
                        </b>
                      </div>
                      <div>
                        <small>Systolic BP</small>
                        <b>
                          {p.vitals.systolic}
                          <em>mmHg</em>
                        </b>
                      </div>
                    </div>
                    <div className="patient-card-foot">
                      <span>{p.ward}</span>
                      <span>
                        View context <ArrowRight size={14} />
                      </span>
                    </div>
                  </button>
                );
              })}
              {!visiblePatients.length && <Empty />}
            </div>
          )}
          {section === "devices" && (
            <section className="panel">
              <div className="panel-heading">
                <h2>Device inventory</h2>
                <span className="subtle-tag">
                  {visibleDevices.length} devices
                </span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Device</th>
                      <th>Type</th>
                      <th>Patient</th>
                      <th>Department</th>
                      <th>Status</th>
                      <th>Last seen</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleDevices.map((d) => (
                      <tr key={d.id}>
                        <td>
                          <button
                            className="alert-title"
                            onClick={() => setSelected(d)}
                          >
                            {d.name}
                          </button>
                          <small>{d.id}</small>
                        </td>
                        <td>{d.type}</td>
                        <td>{d.patientId}</td>
                        <td>{d.ward}</td>
                        <td>
                          <Pill value={d.status} />
                        </td>
                        <td>{time(d.lastSeen)}</td>
                        <td>
                          <button
                            className="icon-btn"
                            aria-label={`View ${d.id}`}
                            onClick={() => setSelected(d)}
                          >
                            <ChevronRight size={17} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!visibleDevices.length && <Empty />}
              </div>
            </section>
          )}
          {section === "insights" && (
            <>
              <div className="info-banner">
                <FlaskConical size={22} />
                <div>
                  <b>
                    {data.modelHealth.available
                      ? "Model service connected"
                      : "Rules engine active · model service unavailable"}
                  </b>
                  <p>
                    {data.modelHealth.available
                      ? `${data.modelHealth.version} · ${data.modelHealth.dataset}`
                      : "Alerts continue using explicit consistency rules. Start the optional Python model service to enable XGBoost and Isolation Forest inference."}{" "}
                    Model scores and hypothesis support are not clinically
                    calibrated probabilities.
                  </p>
                </div>
              </div>
              <div className="three-grid">
                {[
                  {
                    icon: Cpu,
                    title: "XGBoost",
                    tag: "Supervised fusion",
                    text: "Classifies known patterns across eight normalized cross-domain features. Tree contributions show how each feature affects the output.",
                  },
                  {
                    icon: Activity,
                    title: "Isolation Forest",
                    tag: "Novelty detection",
                    text: "Scores unusual feature combinations relative to benign training examples. Novelty is distinct from an established attack.",
                  },
                  {
                    icon: Network,
                    title: "Consistency rules",
                    tag: "Always available",
                    text: "Checks order–device agreement, signal concordance, network continuity, and device health. Ranks five competing hypotheses.",
                  },
                ].map((m) => (
                  <section className="panel model-card" key={m.title}>
                    <m.icon size={25} />
                    <span className="subtle-tag">{m.tag}</span>
                    <h2>{m.title}</h2>
                    <p>{m.text}</p>
                  </section>
                ))}
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Evaluation results</h2>
                    <p>
                      Grouped holdout ·{" "}
                      {data.modelHealth.synthetic === false
                        ? "Operator-provided dataset"
                        : "Synthetic data only"}
                    </p>
                  </div>
                  <span className="badge">Research benchmark</span>
                </div>
                {data.modelHealth.metrics ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Model</th>
                          <th>Precision</th>
                          <th>Recall</th>
                          <th>F1</th>
                          <th>AUROC</th>
                          <th>AUPRC</th>
                          <th>Brier score ↓</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(data.modelHealth.metrics).map(
                          ([name, m]) => (
                            <tr key={name}>
                              <td>{name}</td>
                              {[
                                "precision",
                                "recall",
                                "f1",
                                "auroc",
                                "auprc",
                                "brier",
                              ].map((k) => (
                                <td key={k}>
                                  {m[k] === undefined ? "—" : m[k].toFixed(3)}
                                </td>
                              ))}
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    message="No trained benchmark loaded"
                    detail="Run the documented training workflow and start the model service to load actual evaluation results."
                  />
                )}
                <div className="panel-foot">
                  These retrospective benchmarks do not establish prospective
                  clinical performance.
                </div>
              </section>
              <section className="panel prose-panel">
                <h2>What this prototype can—and cannot—tell you</h2>
                <p>
                  Patient risk is computed independently from attack likelihood
                  using severity, exposure, vulnerability, and affected
                  function. Evidence quality is shown separately so missing
                  streams do not hide a potentially serious issue.
                </p>
                <p>
                  Root causes are competing hypotheses scored by auditable
                  rules; they are not causal diagnoses. Recommendations are
                  verification steps requiring human review. The system never
                  changes treatment, device settings, or network controls.
                </p>
                <h3>Public-data evaluation path</h3>
                <p>
                  Use WUSTL-EHMS-2020 for cyber-biometric fusion, CICIoMT2024
                  for IoMT detection, and separately authorized MIMIC-IV records
                  for clinical context. Do not join unrelated datasets as if
                  they described the same patient. Group splits by patient,
                  device, or scenario, and validate calibration and subgroup
                  performance before prospective use.
                </p>
              </section>
            </>
          )}
          {section === "integrations" && (
            <>
              <div className="three-grid">
                {[
                  {
                    icon: HeartPulse,
                    title: "Normalized event API",
                    tag: "Ready for ingestion",
                    text: "Device, vital, EHR, security, and workflow events share validated identities and timestamps.",
                    endpoint: "POST /api/ingest",
                  },
                  {
                    icon: Database,
                    title: "FHIR observations",
                    tag: "FHIR R4 subset",
                    text: "Accepts final SpO₂ and heart-rate observations with LOINC codes and UCUM units.",
                    endpoint: "POST /api/fhir",
                  },
                  {
                    icon: Network,
                    title: "SIEM handoff",
                    tag: "JSON export",
                    text: "Export minimal alert summaries and workflow status without patient names or vital signs.",
                    endpoint: "GET /api/export",
                  },
                ].map((c) => (
                  <section className="panel model-card" key={c.title}>
                    <c.icon size={25} />
                    <span className="badge">{c.tag}</span>
                    <h2>{c.title}</h2>
                    <p>{c.text}</p>
                    <code>{c.endpoint}</code>
                  </section>
                ))}
              </div>
              <section className="panel prose-panel">
                <h2>Connection contract</h2>
                <p>
                  Ingestion requires a server-issued bearer key. Provision the
                  key through the deployment environment; it is never exposed in
                  this dashboard. Register patient and device associations
                  before sending data. Event IDs are idempotent, timestamps are
                  normalized to UTC, and unknown or mismatched identities are
                  rejected.
                </p>
                <div className="contract-grid">
                  <div>
                    <h3>Supported sources</h3>
                    <p>
                      Device telemetry
                      <br />
                      Patient vitals
                      <br />
                      EHR intent
                      <br />
                      Security events
                      <br />
                      Clinical workflow
                    </p>
                  </div>
                  <div>
                    <h3>Operational controls</h3>
                    <p>
                      64 KB request limit
                      <br />
                      120 ingestion requests/minute
                      <br />
                      Five-minute correlation window
                      <br />
                      UTC timestamps and provenance
                      <br />
                      Durable, encrypted event payloads
                    </p>
                  </div>
                </div>
                <h3>Example normalized event</h3>
                <pre>
                  {JSON.stringify(
                    {
                      id: "monitor-observation-001",
                      source: "device",
                      patientId: "PT-1024",
                      deviceId: "PMP-001",
                      timestamp: data.generatedAt,
                      kind: "infusion telemetry",
                      values: { deviceRate: 5, signalQuality: 0.98 },
                      provenance: "test-connector:v1",
                    },
                    null,
                    2,
                  )}
                </pre>
                <p>
                  These are implemented interfaces, not live hospital
                  connections. External SIEM delivery, hospital credentials, and
                  TLS are configured by the deployment operator.
                </p>
                {canExport && (
                  <a className="btn" href="/api/export" download>
                    <ArrowDownToLine size={15} /> Download SIEM sample
                  </a>
                )}
              </section>
            </>
          )}
          {section === "audit" && (
            <>
              <div
                className={`info-banner ${data.auditValid ? "" : "warning"}`}
              >
                <ShieldCheck size={23} />
                <div>
                  <b>
                    {data.auditValid
                      ? "Audit chain verified"
                      : "Audit verification failed"}
                  </b>
                  <p>
                    Records are append-only in the application and linked with
                    keyed hashes. Export to independent immutable storage for
                    production retention.
                  </p>
                </div>
                <span className="badge">
                  {data.auditValid ? "Verified" : "Review required"}
                </span>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Workspace activity</h2>
                  <span className="subtle-tag">
                    Latest {data.audit.length} records
                  </span>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Actor</th>
                        <th>Action</th>
                        <th>Target</th>
                        <th>Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.audit.map((a) => (
                        <tr key={a.id}>
                          <td>
                            {time(a.at)}
                            <small>{date(a.at)}</small>
                          </td>
                          <td>{a.actor}</td>
                          <td>
                            <code>{a.action}</code>
                          </td>
                          <td>{a.target}</td>
                          <td className="audit-detail">{a.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          <footer className="page-footer">
            <span>
              <ShieldCheck size={13} /> MedSentinel AI · Clinical integrity
              research
            </span>
            <span>
              Last refreshed {time(data.generatedAt)} · Auto-refresh every 30s
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button
            className="icon-btn"
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      )}
      <dialog
        ref={dialog}
        aria-label={
          alertSelected?.title ??
          (simulate
            ? "Run a synthetic scenario"
            : registry
              ? `Register ${registry}`
              : "Record details")
        }
        className="detail-dialog"
        onCancel={close}
        onClose={close}
      >
        <button
          className="icon-btn dialog-close"
          aria-label="Close detail"
          onClick={close}
        >
          <X size={20} />
        </button>
        {registry && (
          <RegistryForm
            type={registry}
            patients={data.patients}
            onSave={async (body) => {
              await post("registry", body);
              close();
              notify("Registry record saved.");
            }}
          />
        )}
        {simulate && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const result = await post("scenarios", {
                  scenario,
                  patientId,
                  deviceId,
                });
                close();
                notify(
                  `${result.ingested} synthetic events ingested. ${result.alertIds.length} alerts created or updated.`,
                );
              });
            }}
          >
            <span className="eyebrow">CONTROLLED EVALUATION</span>
            <h2>Run a synthetic scenario</h2>
            <p className="muted">
              Generate reproducible evidence and observe how the integrity
              engine responds.
            </p>
            <label>
              Scenario
              <select
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
              >
                <option value="infusion">
                  Infusion order mismatch + unusual access
                </option>
                <option value="sensor">Conflicting oxygen signals</option>
                <option value="network">Network degradation</option>
                <option value="device">Device failure</option>
                <option value="benign">Benign baseline</option>
              </select>
            </label>
            <label>
              Patient
              <select
                value={patientId}
                onChange={(e) => {
                  setPatientId(e.target.value);
                  setDeviceId(
                    data.devices.find((d) => d.patientId === e.target.value)
                      ?.id ?? "",
                  );
                }}
              >
                {data.patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id} · {p.bed}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Associated device
              <select
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
              >
                {data.devices
                  .filter((d) => d.patientId === patientId)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.id} · {d.type}
                    </option>
                  ))}
              </select>
            </label>
            <div className="info-banner compact">
              <FlaskConical size={18} />
              <p>
                Writes synthetic events to this workspace. Does not contact or
                control medical equipment.
              </p>
            </div>
            <button className="btn primary" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Play size={16} />
              )}{" "}
              Run scenario
            </button>
          </form>
        )}
        {alertSelected && (
          <>
            <span className="eyebrow">
              ALERT INVESTIGATION · {alertSelected.id}
            </span>
            <h2>{alertSelected.title}</h2>
            <div className="detail-badges">
              <Pill value={alertSelected.tier} />
              <Pill value={alertSelected.status} />
              <span>
                {alertSelected.patientId} · {alertSelected.deviceId}
              </span>
            </div>
            <p>{alertSelected.summary}</p>
            <div className="detail-stats">
              <div>
                <small>Patient risk</small>
                <strong>
                  {alertSelected.score}
                  <em>/100</em>
                </strong>
              </div>
              <div>
                <small>Evidence quality</small>
                <strong>
                  {alertSelected.quality}
                  <em>%</em>
                </strong>
              </div>
              <div>
                <small>Attack model output</small>
                <strong>
                  {alertSelected.model.attackProbability === null
                    ? "—"
                    : `${Math.round(alertSelected.model.attackProbability * 100)}%`}
                </strong>
              </div>
            </div>
            <span className="model-note">
              {alertSelected.model.mode} · {alertSelected.model.version}
            </span>
            <h3>Risk factors</h3>
            <div className="factor-grid">
              {Object.entries(alertSelected.riskFactors).map(([k, v]) => (
                <div key={k}>
                  <span>{label(k)}</span>
                  <b>{v}</b>
                  <meter min="0" max="100" value={v} aria-label={label(k)} />
                </div>
              ))}
            </div>
            <h3>Competing root causes</h3>
            <p className="small-note">
              Relative heuristic support; not calibrated causal probabilities.
            </p>
            <div className="hypotheses">
              {alertSelected.hypotheses.map((h, i) => (
                <div key={h.cause}>
                  <span className="rank">0{i + 1}</span>
                  <b>{h.cause}</b>
                  <div className="hypothesis-track">
                    <i style={{ width: `${h.score}%` }} />
                  </div>
                  <span>{h.score}%</span>
                </div>
              ))}
            </div>
            <h3>Evidence timeline</h3>
            <div className="timeline">
              {alertSelected.evidence.map((e) => (
                <div key={e.eventId}>
                  <time>{time(e.timestamp)}</time>
                  <div>
                    <span className="subtle-tag">{label(e.source)}</span>
                    <p>{e.summary}</p>
                    <small>Evidence ID: {e.eventId}</small>
                    {e.supports.length > 0 && (
                      <small>Supports: {e.supports.join(", ")}</small>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {Object.keys(alertSelected.model.contributions).length > 0 && (
              <>
                <h3>Model feature contributions</h3>
                <p className="small-note">
                  Signed contributions to XGBoost log-odds. Positive values
                  increase the model score.
                </p>
                <div className="factor-grid">
                  {Object.entries(alertSelected.model.contributions).map(
                    ([k, v]) => (
                      <div key={k}>
                        <span>{label(k)}</span>
                        <b>{v.toFixed(3)}</b>
                      </div>
                    ),
                  )}
                </div>
              </>
            )}
            <h3>Suggested verification steps</h3>
            {alertSelected.recommendations.length ? (
              alertSelected.recommendations.map((r) => (
                <div className="recommendation" key={r.id}>
                  <Check size={17} />
                  <div>
                    <b>{r.action}</b>
                    <p>{r.rationale}</p>
                    <small>{r.caution}</small>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">
                Operational actions are shown to the responsible clinical,
                security, or biomedical role.
              </p>
            )}
            {alertSelected.notes.length > 0 && (
              <>
                <h3>Review history</h3>
                {alertSelected.notes.map((n, i) => (
                  <div className="review-note" key={i}>
                    <b>
                      {n.actor} · {names[n.status]}
                    </b>
                    <p>{n.note}</p>
                    <small>
                      {date(n.at)} {time(n.at)}
                    </small>
                  </div>
                ))}
              </>
            )}
            {data.user.role !== "researcher" &&
              !["resolved", "false_positive"].includes(
                alertSelected.status,
              ) && (
                <form
                  className="review-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      const updated = await post(
                        `alerts/${alertSelected.id}/state`,
                        {
                          status: action,
                          note,
                          expectedUpdatedAt: alertSelected.updatedAt,
                        },
                      );
                      setSelected(updated);
                      setNote("");
                      setAction(
                        updated.status === "investigating"
                          ? "resolved"
                          : "investigating",
                      );
                      notify("Human review recorded in the audit trail.");
                    });
                  }}
                >
                  <h3>Record your review</h3>
                  <label>
                    Next status
                    <select
                      value={action}
                      onChange={(e) => setAction(e.target.value as Status)}
                    >
                      {(alertSelected.status === "open"
                        ? ["acknowledged"]
                        : alertSelected.status === "acknowledged"
                          ? ["investigating", "resolved", "false_positive"]
                          : ["resolved", "false_positive"]
                      ).map((s) => (
                        <option key={s} value={s}>
                          {names[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Review note
                    <textarea
                      required
                      minLength={5}
                      maxLength={2000}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Document what you verified and the next step…"
                      rows={3}
                    />
                  </label>
                  <button className="btn primary" disabled={busy}>
                    {busy ? (
                      <LoaderCircle className="spin" size={15} />
                    ) : (
                      <Check size={15} />
                    )}{" "}
                    Save review
                  </button>
                  <p className="small-note">
                    Records your decision only. Does not execute treatment or
                    containment.
                  </p>
                </form>
              )}
          </>
        )}
        {selected && "vitals" in selected && (
          <>
            <span className="eyebrow">
              PATIENT CONTEXT{data.demo ? " · SYNTHETIC RECORD" : ""}
            </span>
            <h2>
              {selected.id} · {selected.name}
            </h2>
            <p>
              {selected.age} years · {selected.ward} · {selected.bed}
            </p>
            <div className="info-banner">
              <HeartPulse size={22} />
              <p>{selected.context}</p>
            </div>
            <h3>Latest reported observations</h3>
            <p className="small-note">
              Reported signals may be unverified. Review conflicting evidence
              before interpreting them.
            </p>
            <div className="detail-stats">
              <div>
                <small>Heart rate</small>
                <strong>
                  {selected.vitals.hr}
                  <em>bpm</em>
                </strong>
              </div>
              <div>
                <small>SpO₂</small>
                <strong>
                  {selected.vitals.spo2}
                  <em>%</em>
                </strong>
              </div>
              <div>
                <small>Temperature</small>
                <strong>
                  {selected.vitals.temperature}
                  <em>°C</em>
                </strong>
              </div>
            </div>
            <h3>Associated devices</h3>
            {data.devices
              .filter((d) => d.patientId === selected.id)
              .map((d) => (
                <button
                  className="related-item"
                  key={d.id}
                  onClick={() => setSelected(d)}
                >
                  <HeartPulse size={17} />
                  <span>
                    {d.name}
                    <small>{d.id}</small>
                  </span>
                  <Pill value={d.status} />
                  <ChevronRight size={16} />
                </button>
              ))}
            <h3>Integrity alerts</h3>
            {data.alerts
              .filter((a) => a.patientId === selected.id)
              .map((a) => (
                <button
                  className="related-item"
                  key={a.id}
                  onClick={() => openAlert(a)}
                >
                  <span>{a.title}</span>
                  <Pill value={a.tier} />
                  <ChevronRight size={16} />
                </button>
              ))}
            {!data.alerts.some((a) => a.patientId === selected.id) && (
              <p className="muted">
                No integrity alerts recorded for this patient.
              </p>
            )}
          </>
        )}
        {selected && "firmware" in selected && (
          <>
            <span className="eyebrow">CONNECTED DEVICE</span>
            <h2>{selected.name}</h2>
            <p>
              {selected.id} · {selected.type}
            </p>
            <Pill value={selected.status} />
            <div className="device-facts">
              <div>
                <span>Patient</span>
                <b>{selected.patientId}</b>
              </div>
              <div>
                <span>Department</span>
                <b>{selected.ward}</b>
              </div>
              <div>
                <span>Firmware</span>
                <b>{selected.firmware}</b>
              </div>
              <div>
                <span>Last telemetry</span>
                <b>
                  {date(selected.lastSeen)} {time(selected.lastSeen)}
                </b>
              </div>
            </div>
            <h3>Related integrity alerts</h3>
            {data.alerts
              .filter((a) => a.deviceId === selected.id)
              .map((a) => (
                <button
                  className="related-item"
                  key={a.id}
                  onClick={() => openAlert(a)}
                >
                  <span>{a.title}</span>
                  <Pill value={a.tier} />
                  <ChevronRight size={16} />
                </button>
              ))}
            {!data.alerts.some((a) => a.deviceId === selected.id) && (
              <p className="muted">
                No integrity alerts recorded for this device.
              </p>
            )}
            <div className="info-banner compact">
              <ShieldCheck size={19} />
              <p>
                Device status is reported telemetry. This workspace does not
                remotely control equipment.
              </p>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
function Stat({
  icon: Icon,
  label: caption,
  value,
  note,
  tone,
}: {
  icon: typeof Activity;
  label: string;
  value: number;
  note: string;
  tone: string;
}) {
  return (
    <section className="stat-card">
      <div className="stat-top">
        <span>{caption}</span>
        <span className={`stat-icon ${tone}`}>
          <Icon size={18} />
        </span>
      </div>
      <strong>{value.toString().padStart(2, "0")}</strong>
      <p>
        <span className={`tiny-dot ${tone}`} />
        {note}
      </p>
    </section>
  );
}
