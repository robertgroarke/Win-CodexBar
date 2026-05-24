import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const providerHook = vi.hoisted(() => ({
  useProviders: vi.fn(),
}));

const settingsHook = vi.hoisted(() => ({
  useSettings: vi.fn(),
}));

const systemStatsHook = vi.hoisted(() => ({
  useSystemStats: vi.fn(),
}));

vi.mock("../hooks/useProviders", () => providerHook);
vi.mock("../hooks/useSettings", () => settingsHook);
vi.mock("../hooks/useSystemStats", () => systemStatsHook);
vi.mock("../lib/tauri", () => ({
  openSettingsWindow: vi.fn(),
  setSurfaceMode: vi.fn(),
}));

import Cockpit from "./Cockpit";
import type {
  BootstrapState,
  ProviderCatalogEntry,
  ProviderUsageSnapshot,
  SettingsSnapshot,
  SystemStatsSnapshot,
} from "../types/bridge";

function settings(overrides: Partial<SettingsSnapshot> = {}): SettingsSnapshot {
  return {
    enabledProviders: ["claude", "codex", "gemini", "ollama"],
    refreshIntervalSecs: 300,
    startAtLogin: false,
    startMinimized: false,
    showNotifications: true,
    soundEnabled: true,
    soundVolume: 100,
    highUsageThreshold: 70,
    criticalUsageThreshold: 90,
    trayIconMode: "single",
    switcherShowsIcons: true,
    menuBarShowsHighestUsage: false,
    menuBarShowsPercent: false,
    showAsUsed: true,
    showCreditsExtraUsage: true,
    showAllTokenAccountsInMenu: false,
    surpriseAnimations: false,
    enableAnimations: true,
    resetTimeRelative: true,
    menuBarDisplayMode: "detailed",
    hidePersonalInfo: false,
    updateChannel: "stable",
    autoDownloadUpdates: false,
    installUpdatesOnQuit: false,
    globalShortcut: "Ctrl+Shift+U",
    uiLanguage: "english",
    theme: "dark",
    claudeAvoidKeychainPrompts: false,
    disableKeychainAccess: false,
    showDebugSettings: false,
    providerMetrics: {},
    floatBarEnabled: true,
    floatBarOpacity: 80,
    floatBarOrientation: "horizontal",
    floatBarClickThrough: false,
    floatBarProviderIds: [],
    floatBarDarkText: false,
    ...overrides,
  };
}

function providerCatalog(): ProviderCatalogEntry[] {
  return ["claude", "codex", "gemini", "ollama"].map((id) => ({
    id,
    displayName: id[0].toUpperCase() + id.slice(1),
    cookieDomain: null,
  }));
}

function bootstrap(): BootstrapState {
  return {
    contractVersion: "v1",
    surfaceModes: [],
    commands: [],
    events: [],
    providers: providerCatalog(),
    settings: settings(),
  };
}

function usageSnapshot(
  providerId: string,
  displayName: string,
  remainingPercent: number,
): ProviderUsageSnapshot {
  return {
    providerId,
    displayName,
    primary: {
      usedPercent: 100 - remainingPercent,
      remainingPercent,
      windowMinutes: null,
      resetsAt: null,
      resetDescription: null,
      isExhausted: false,
      reservePercent: null,
      reserveDescription: null,
    },
    primaryLabel: "Session",
    secondary: null,
    modelSpecific: null,
    tertiary: null,
    extraRateWindows: [],
    cost: null,
    planName: "Pro",
    accountEmail: null,
    sourceLabel: "Ready",
    updatedAt: "2026-05-24T00:00:00Z",
    error: null,
    pace: null,
    accountOrganization: null,
    trayStatusLabel: null,
  };
}

function systemStats(): SystemStatsSnapshot {
  return {
    collectedAt: "2026-05-24T00:00:00Z",
    cpu: {
      usagePercent: 42,
      averageFrequencyMhz: 4740,
      logicalCoreCount: 32,
      physicalCoreCount: 24,
      brand: "Test CPU",
    },
    memory: {
      totalBytes: 64 * 1024 ** 3,
      usedBytes: 32 * 1024 ** 3,
      availableBytes: 32 * 1024 ** 3,
      usedPercent: 50,
    },
    disks: [
      {
        name: "System",
        mountPoint: "C:\\",
        kind: "SSD",
        totalBytes: 1024 * 1024 ** 3,
        availableBytes: 512 * 1024 ** 3,
        usedBytes: 512 * 1024 ** 3,
        usedPercent: 50,
      },
    ],
    network: {
      receivedBytesPerSec: 1024,
      transmittedBytesPerSec: 2048,
      totalReceivedBytes: 4096,
      totalTransmittedBytes: 8192,
      interfaces: [],
    },
    topProcessesByCpu: [
      {
        pid: 100,
        name: "codex.exe",
        cpuUsagePercent: 12.5,
        memoryBytes: 256 * 1024 ** 2,
        memoryPercent: 0.4,
      },
    ],
    topProcessesByMemory: [
      {
        pid: 200,
        name: "chrome.exe",
        cpuUsagePercent: 2.1,
        memoryBytes: 1024 * 1024 ** 2,
        memoryPercent: 1.5,
      },
    ],
    unavailable: [],
  };
}

describe("Cockpit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    providerHook.useProviders.mockReturnValue({
      providers: [usageSnapshot("claude", "Claude", 60)],
      isRefreshing: false,
      refresh: vi.fn(),
      lastRefresh: null,
      hasCachedData: true,
    });
    settingsHook.useSettings.mockReturnValue({
      settings: settings(),
      saving: false,
      error: null,
      update: vi.fn(),
    });
    systemStatsHook.useSystemStats.mockReturnValue({
      stats: systemStats(),
      error: null,
      isLoading: false,
    });
  });

  it("renders provider usage and local system stats in one surface", () => {
    render(<Cockpit state={bootstrap()} />);

    expect(screen.getByRole("main", { name: "Cockpit" })).toBeInTheDocument();
    expect(screen.getByText("AI plans")).toBeInTheDocument();
    expect(screen.getByText("Claude")).toBeInTheDocument();
    expect(screen.getByText("60% left")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.getByText("4.74 GHz")).toBeInTheDocument();
    expect(screen.getByText("Top CPU")).toBeInTheDocument();
    expect(screen.getByText("codex.exe")).toBeInTheDocument();
    expect(screen.getByText("chrome.exe")).toBeInTheDocument();
    expect(screen.getByText("Disks")).toBeInTheDocument();
  });
});
