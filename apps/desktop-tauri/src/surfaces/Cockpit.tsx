import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  BootstrapState,
  DiskStatsSnapshot,
  ProcessStatsSnapshot,
  ProviderUsageSnapshot,
  SystemStatsSnapshot,
} from "../types/bridge";
import { useProviders } from "../hooks/useProviders";
import { useSettings } from "../hooks/useSettings";
import { useSystemStats } from "../hooks/useSystemStats";
import { openSettingsWindow, setSurfaceMode } from "../lib/tauri";
import { ProviderIcon } from "../components/providers/ProviderIcon";
import {
  appendHistory,
  clampPercent,
  formatBytes,
  formatFrequency,
  formatPercent,
  formatRate,
} from "./cockpit/format";
import "./cockpit.css";

const COCKPIT_PROVIDER_IDS = ["claude", "codex", "gemini", "ollama"];

interface MetricHistory {
  cpu: number[];
  memory: number[];
  network: number[];
}

export default function Cockpit({ state }: { state: BootstrapState }) {
  const {
    providers,
    isRefreshing,
    refresh,
    hasCachedData,
  } = useProviders();
  const { settings } = useSettings(state.settings);
  const { stats, error: statsError, isLoading: statsLoading } = useSystemStats();
  const [history, setHistory] = useState<MetricHistory>({
    cpu: [],
    memory: [],
    network: [],
  });

  useEffect(() => {
    if (!stats) {
      return;
    }
    setHistory((current) => ({
      cpu: appendHistory(current.cpu, stats.cpu.usagePercent),
      memory: appendHistory(current.memory, stats.memory.usedPercent),
      network: appendHistory(
        current.network,
        stats.network.receivedBytesPerSec + stats.network.transmittedBytesPerSec,
      ),
    }));
  }, [stats]);

  const catalog = useMemo(
    () => new Map(state.providers.map((provider) => [provider.id, provider])),
    [state.providers],
  );
  const providerMap = useMemo(
    () => new Map(providers.map((provider) => [provider.providerId, provider])),
    [providers],
  );
  const enabled = useMemo(
    () => new Set(settings.enabledProviders),
    [settings.enabledProviders],
  );

  const openSettings = useCallback(() => {
    openSettingsWindow("providers");
  }, []);
  const backToTray = useCallback(() => {
    setSurfaceMode("trayPanel", { kind: "summary" });
  }, []);

  const busiestDisk = useMemo(() => pickBusiestDisk(stats), [stats]);

  return (
    <main className="cockpit" aria-label="Cockpit">
      <header className="cockpit__header">
        <div>
          <h1>Cockpit</h1>
          <p>
            {providers.length} providers
            {isRefreshing ? " - refreshing" : ""}
            {stats ? ` - sampled ${formatSampleTime(stats.collectedAt)}` : ""}
          </p>
        </div>
        <div className="cockpit__actions">
          <button
            className="cockpit-icon-button"
            type="button"
            title="Refresh providers"
            onClick={refresh}
            disabled={isRefreshing}
          >
            <span className={isRefreshing ? "spin" : ""}>
              <RefreshIcon />
            </span>
          </button>
          <button
            className="cockpit-icon-button"
            type="button"
            title="Back to tray panel"
            onClick={backToTray}
          >
            <TrayIcon />
          </button>
          <button
            className="cockpit-icon-button"
            type="button"
            title="Provider settings"
            onClick={openSettings}
          >
            <SettingsIcon />
          </button>
        </div>
      </header>

      <section className="cockpit-section cockpit-section--ai">
        <div className="cockpit-section__title">AI plans</div>
        <div className="cockpit-ai-grid">
          {COCKPIT_PROVIDER_IDS.map((providerId) => (
            <AiProviderTile
              key={providerId}
              providerId={providerId}
              displayName={catalog.get(providerId)?.displayName ?? providerId}
              snapshot={providerMap.get(providerId)}
              enabled={enabled.has(providerId)}
              hideEmail={settings.hidePersonalInfo}
              loading={isRefreshing && !hasCachedData}
            />
          ))}
        </div>
      </section>

      <section className="cockpit-section cockpit-section--system">
        <div className="cockpit-section__title">System</div>
        {statsError ? (
          <div className="cockpit-error">{statsError}</div>
        ) : (
          <div className="cockpit-system-grid" aria-busy={statsLoading}>
            <MetricPanel
              label="CPU"
              value={stats ? formatPercent(stats.cpu.usagePercent) : "..."
              }
              detail={stats ? formatFrequency(stats.cpu.averageFrequencyMhz) : "sampling"}
              history={history.cpu}
            />
            <MetricPanel
              label="Memory"
              value={stats ? formatPercent(stats.memory.usedPercent) : "..."}
              detail={
                stats
                  ? `${formatBytes(stats.memory.usedBytes)} / ${formatBytes(stats.memory.totalBytes)}`
                  : "sampling"
              }
              history={history.memory}
            />
            <MetricPanel
              label="Network"
              value={
                stats
                  ? formatRate(
                      stats.network.receivedBytesPerSec +
                        stats.network.transmittedBytesPerSec,
                    )
                  : "..."
              }
              detail={
                stats
                  ? `Rx ${formatRate(stats.network.receivedBytesPerSec)} - Tx ${formatRate(stats.network.transmittedBytesPerSec)}`
                  : "sampling"
              }
              history={history.network}
              scaleMode="rate"
            />
            <MetricPanel
              label="Disk"
              value={busiestDisk ? formatPercent(busiestDisk.usedPercent) : "..."}
              detail={busiestDisk ? diskLabel(busiestDisk) : "sampling"}
              history={busiestDisk ? [busiestDisk.usedPercent] : []}
            />
          </div>
        )}
      </section>

      <section className="cockpit-bottom-grid">
        <ProcessPanel
          title="Top CPU"
          processes={stats?.topProcessesByCpu ?? []}
          mode="cpu"
        />
        <ProcessPanel
          title="Top Memory"
          processes={stats?.topProcessesByMemory ?? []}
          mode="memory"
        />
        <DiskPanel disks={stats?.disks ?? []} />
      </section>

      {stats?.unavailable.length ? (
        <footer className="cockpit__unavailable">
          Unavailable: {stats.unavailable.join(", ")}
        </footer>
      ) : null}
    </main>
  );
}

function AiProviderTile({
  providerId,
  displayName,
  snapshot,
  enabled,
  hideEmail,
  loading,
}: {
  providerId: string;
  displayName: string;
  snapshot?: ProviderUsageSnapshot;
  enabled: boolean;
  hideEmail: boolean;
  loading: boolean;
}) {
  const state = providerState(snapshot, enabled, loading);
  const primaryPercent = snapshot ? clampPercent(snapshot.primary.remainingPercent) : 0;
  const secondaryPercent = snapshot?.secondary
    ? clampPercent(snapshot.secondary.remainingPercent)
    : null;

  return (
    <article className={`cockpit-ai cockpit-ai--${state.kind}`}>
      <div className="cockpit-ai__header">
        <ProviderIcon providerId={providerId} size={20} />
        <div className="cockpit-ai__title">
          <strong>{displayName}</strong>
          <span>{state.label}</span>
        </div>
      </div>
      <div className="cockpit-ai__meter">
        <div className="cockpit-ai__meter-label">
          <span>{snapshot?.primaryLabel ?? "Primary"}</span>
          <strong>{snapshot ? `${Math.round(primaryPercent)}% left` : "n/a"}</strong>
        </div>
        <div className="cockpit-bar">
          <span style={{ width: `${primaryPercent}%` }} />
        </div>
      </div>
      {secondaryPercent !== null && (
        <div className="cockpit-ai__meter cockpit-ai__meter--small">
          <div className="cockpit-ai__meter-label">
            <span>{snapshot?.secondaryLabel ?? "Secondary"}</span>
            <strong>{Math.round(secondaryPercent)}% left</strong>
          </div>
          <div className="cockpit-bar cockpit-bar--muted">
            <span style={{ width: `${secondaryPercent}%` }} />
          </div>
        </div>
      )}
      <div className="cockpit-ai__meta">
        <span>{hideEmail ? null : snapshot?.accountEmail}</span>
        <span>{snapshot?.planName}</span>
      </div>
    </article>
  );
}

function MetricPanel({
  label,
  value,
  detail,
  history,
  scaleMode = "percent",
}: {
  label: string;
  value: string;
  detail: string;
  history: number[];
  scaleMode?: "percent" | "rate";
}) {
  return (
    <article className="cockpit-metric">
      <div className="cockpit-metric__text">
        <span>{label}</span>
        <strong>{value}</strong>
        <em>{detail}</em>
      </div>
      <Sparkline values={history} scaleMode={scaleMode} />
    </article>
  );
}

function ProcessPanel({
  title,
  processes,
  mode,
}: {
  title: string;
  processes: ProcessStatsSnapshot[];
  mode: "cpu" | "memory";
}) {
  return (
    <section className="cockpit-list-panel">
      <h2>{title}</h2>
      <div className="cockpit-process-list">
        {processes.length === 0 ? (
          <div className="cockpit-empty-row">No process data</div>
        ) : (
          processes.map((process) => (
            <div className="cockpit-process-row" key={`${mode}-${process.pid}`}>
              <span className="cockpit-process-row__name" title={process.name}>
                {process.name}
              </span>
              <span className="cockpit-process-row__value">
                {mode === "cpu"
                  ? `${process.cpuUsagePercent.toFixed(1)}%`
                  : formatBytes(process.memoryBytes)}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function DiskPanel({ disks }: { disks: DiskStatsSnapshot[] }) {
  return (
    <section className="cockpit-list-panel cockpit-list-panel--wide">
      <h2>Disks</h2>
      <div className="cockpit-disk-list">
        {disks.length === 0 ? (
          <div className="cockpit-empty-row">No disk data</div>
        ) : (
          disks.slice(0, 4).map((disk) => (
            <div className="cockpit-disk-row" key={disk.mountPoint}>
              <div>
                <strong>{disk.mountPoint}</strong>
                <span>{disk.kind}</span>
              </div>
              <div className="cockpit-disk-row__meter">
                <span>{formatPercent(disk.usedPercent)}</span>
                <div className="cockpit-bar cockpit-bar--muted">
                  <span style={{ width: `${clampPercent(disk.usedPercent)}%` }} />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function Sparkline({
  values,
  scaleMode,
}: {
  values: number[];
  scaleMode: "percent" | "rate";
}) {
  const width = 126;
  const height = 42;
  const points = sparklinePoints(values, width, height, scaleMode);

  return (
    <svg
      className="cockpit-sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Recent values"
    >
      <path d={`M0 ${height - 1} H${width}`} className="cockpit-sparkline__base" />
      {points && <polyline points={points} className="cockpit-sparkline__line" />}
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M13.5 5.2A5.7 5.7 0 0 0 3.1 3.8M2.5 2.1v3.7h3.7M2.5 10.8a5.7 5.7 0 0 0 10.4 1.4m.6 1.7v-3.7H9.8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function TrayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <rect
        x="2.5"
        y="3"
        width="11"
        height="10"
        rx="1.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M5 10.5h6M6.5 7.5h3"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.3"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M6.9 2.2h2.2l.4 1.5 1.3.5 1.4-.8 1.1 1.9-1.1 1.1.2 1.6 1.2 1-.9 2-1.6-.3-1.1.9-.2 1.6H6.2L6 11.2l-1.1-.9-1.6.3-.9-2 1.2-1 .2-1.6-1.1-1.1 1.1-1.9 1.4.8 1.3-.5.4-1.5Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.1"
      />
      <circle
        cx="8"
        cy="8"
        r="1.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
      />
    </svg>
  );
}

function sparklinePoints(
  values: number[],
  width: number,
  height: number,
  scaleMode: "percent" | "rate",
): string | null {
  if (values.length < 2) {
    return null;
  }
  const max = scaleMode === "percent"
    ? 100
    : Math.max(...values, 1);
  const step = width / Math.max(values.length - 1, 1);

  return values
    .map((value, index) => {
      const normalized = clampPercent((value / max) * 100) / 100;
      const x = index * step;
      const y = height - normalized * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function providerState(
  snapshot: ProviderUsageSnapshot | undefined,
  enabled: boolean,
  loading: boolean,
): { kind: "ok" | "warn" | "error" | "idle"; label: string } {
  if (!enabled) {
    return { kind: "idle", label: "Disabled" };
  }
  if (!snapshot) {
    return { kind: "idle", label: loading ? "Refreshing" : "No data" };
  }
  if (snapshot.error) {
    return { kind: "error", label: "Error" };
  }
  if (snapshot.primary.remainingPercent <= 20 || snapshot.primary.isExhausted) {
    return { kind: "warn", label: "Low" };
  }
  return { kind: "ok", label: snapshot.sourceLabel || "Ready" };
}

function pickBusiestDisk(stats: SystemStatsSnapshot | null): DiskStatsSnapshot | null {
  if (!stats || stats.disks.length === 0) {
    return null;
  }
  return [...stats.disks].sort((a, b) => b.usedPercent - a.usedPercent)[0];
}

function diskLabel(disk: DiskStatsSnapshot): string {
  return `${disk.mountPoint} - ${formatBytes(disk.usedBytes)} / ${formatBytes(disk.totalBytes)}`;
}

function formatSampleTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "now";
  }
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}
