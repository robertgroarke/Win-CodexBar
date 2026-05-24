use std::sync::Mutex;
use std::time::Instant;

use serde::Serialize;
use sysinfo::{Disks, Networks, ProcessesToUpdate, System};

const TOP_PROCESS_LIMIT: usize = 5;
const MAX_DISKS: usize = 8;
const MAX_NETWORK_INTERFACES: usize = 4;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStatsSnapshot {
    pub collected_at: String,
    pub cpu: CpuStatsSnapshot,
    pub memory: MemoryStatsSnapshot,
    pub disks: Vec<DiskStatsSnapshot>,
    pub network: NetworkStatsSnapshot,
    pub top_processes_by_cpu: Vec<ProcessStatsSnapshot>,
    pub top_processes_by_memory: Vec<ProcessStatsSnapshot>,
    pub unavailable: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuStatsSnapshot {
    pub usage_percent: f64,
    pub average_frequency_mhz: Option<u64>,
    pub logical_core_count: usize,
    pub physical_core_count: Option<usize>,
    pub brand: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryStatsSnapshot {
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub available_bytes: u64,
    pub used_percent: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskStatsSnapshot {
    pub name: String,
    pub mount_point: String,
    pub kind: String,
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub used_bytes: u64,
    pub used_percent: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkStatsSnapshot {
    pub received_bytes_per_sec: u64,
    pub transmitted_bytes_per_sec: u64,
    pub total_received_bytes: u64,
    pub total_transmitted_bytes: u64,
    pub interfaces: Vec<NetworkInterfaceStatsSnapshot>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkInterfaceStatsSnapshot {
    pub name: String,
    pub received_bytes_per_sec: u64,
    pub transmitted_bytes_per_sec: u64,
    pub total_received_bytes: u64,
    pub total_transmitted_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessStatsSnapshot {
    pub pid: u32,
    pub name: String,
    pub cpu_usage_percent: f64,
    pub memory_bytes: u64,
    pub memory_percent: f64,
}

pub(crate) struct SystemStatsCollector {
    system: System,
    disks: Disks,
    networks: Networks,
    last_network_sample: Instant,
}

impl SystemStatsCollector {
    pub(crate) fn new() -> Self {
        let mut system = System::new();
        system.refresh_cpu_all();
        system.refresh_memory();
        system.refresh_processes(ProcessesToUpdate::All, true);

        Self {
            system,
            disks: Disks::new_with_refreshed_list(),
            networks: Networks::new_with_refreshed_list(),
            last_network_sample: Instant::now(),
        }
    }

    fn sample(&mut self) -> SystemStatsSnapshot {
        let now = Instant::now();
        let elapsed_secs = now
            .duration_since(self.last_network_sample)
            .as_secs_f64()
            .max(0.001);

        self.system.refresh_cpu_all();
        self.system.refresh_memory();
        self.system.refresh_processes(ProcessesToUpdate::All, true);
        self.disks.refresh(true);
        self.networks.refresh(true);
        self.last_network_sample = now;

        let mut unavailable = Vec::new();
        let cpu = cpu_snapshot(&self.system);
        let memory = memory_snapshot(&self.system);
        let disks = disk_snapshots(&self.disks);
        let network = network_snapshot(&self.networks, elapsed_secs);
        let processes = process_snapshots(&self.system, memory.total_bytes);

        if cpu.average_frequency_mhz.is_none() {
            unavailable.push("CPU frequency".to_string());
        }
        if disks.is_empty() {
            unavailable.push("disk usage".to_string());
        }
        if network.interfaces.is_empty() {
            unavailable.push("network interfaces".to_string());
        }

        SystemStatsSnapshot {
            collected_at: chrono::Utc::now().to_rfc3339(),
            cpu,
            memory,
            disks,
            network,
            top_processes_by_cpu: top_processes_by_cpu(&processes, TOP_PROCESS_LIMIT),
            top_processes_by_memory: top_processes_by_memory(&processes, TOP_PROCESS_LIMIT),
            unavailable,
        }
    }
}

#[tauri::command]
pub fn get_system_stats(
    collector: tauri::State<'_, Mutex<SystemStatsCollector>>,
) -> Result<SystemStatsSnapshot, String> {
    collector
        .lock()
        .map_err(|e| e.to_string())
        .map(|mut guard| guard.sample())
}

fn cpu_snapshot(system: &System) -> CpuStatsSnapshot {
    let frequencies = system
        .cpus()
        .iter()
        .map(|cpu| cpu.frequency())
        .filter(|frequency| *frequency > 0)
        .collect::<Vec<_>>();

    let average_frequency_mhz = if frequencies.is_empty() {
        None
    } else {
        Some(frequencies.iter().sum::<u64>() / frequencies.len() as u64)
    };

    CpuStatsSnapshot {
        usage_percent: clamp_percent(system.global_cpu_usage() as f64),
        average_frequency_mhz,
        logical_core_count: system.cpus().len(),
        physical_core_count: System::physical_core_count(),
        brand: system
            .cpus()
            .first()
            .map(|cpu| cpu.brand().trim().to_string())
            .filter(|brand| !brand.is_empty()),
    }
}

fn memory_snapshot(system: &System) -> MemoryStatsSnapshot {
    let total_bytes = system.total_memory();
    let used_bytes = system.used_memory();
    let available_bytes = system.available_memory();

    MemoryStatsSnapshot {
        total_bytes,
        used_bytes,
        available_bytes,
        used_percent: percent(used_bytes, total_bytes).unwrap_or(0.0),
    }
}

fn disk_snapshots(disks: &Disks) -> Vec<DiskStatsSnapshot> {
    let mut snapshots = disks
        .list()
        .iter()
        .filter_map(|disk| {
            let total_bytes = disk.total_space();
            if total_bytes == 0 {
                return None;
            }
            let available_bytes = disk.available_space();
            let used_bytes = total_bytes.saturating_sub(available_bytes);
            Some(DiskStatsSnapshot {
                name: disk.name().to_string_lossy().into_owned(),
                mount_point: disk.mount_point().display().to_string(),
                kind: disk.kind().to_string(),
                total_bytes,
                available_bytes,
                used_bytes,
                used_percent: percent(used_bytes, total_bytes).unwrap_or(0.0),
            })
        })
        .collect::<Vec<_>>();

    snapshots.sort_by(|a, b| a.mount_point.cmp(&b.mount_point));
    snapshots.truncate(MAX_DISKS);
    snapshots
}

fn network_snapshot(networks: &Networks, elapsed_secs: f64) -> NetworkStatsSnapshot {
    let mut interfaces = networks
        .iter()
        .map(|(name, data)| NetworkInterfaceStatsSnapshot {
            name: name.to_string(),
            received_bytes_per_sec: bytes_per_second(data.received(), elapsed_secs),
            transmitted_bytes_per_sec: bytes_per_second(data.transmitted(), elapsed_secs),
            total_received_bytes: data.total_received(),
            total_transmitted_bytes: data.total_transmitted(),
        })
        .filter(|interface| {
            interface.received_bytes_per_sec > 0
                || interface.transmitted_bytes_per_sec > 0
                || interface.total_received_bytes > 0
                || interface.total_transmitted_bytes > 0
        })
        .collect::<Vec<_>>();

    let received_bytes_per_sec = interfaces
        .iter()
        .map(|interface| interface.received_bytes_per_sec)
        .sum();
    let transmitted_bytes_per_sec = interfaces
        .iter()
        .map(|interface| interface.transmitted_bytes_per_sec)
        .sum();
    let total_received_bytes = interfaces
        .iter()
        .map(|interface| interface.total_received_bytes)
        .sum();
    let total_transmitted_bytes = interfaces
        .iter()
        .map(|interface| interface.total_transmitted_bytes)
        .sum();

    interfaces.sort_by(|a, b| {
        let a_total = a
            .received_bytes_per_sec
            .saturating_add(a.transmitted_bytes_per_sec);
        let b_total = b
            .received_bytes_per_sec
            .saturating_add(b.transmitted_bytes_per_sec);
        b_total.cmp(&a_total).then_with(|| a.name.cmp(&b.name))
    });
    interfaces.truncate(MAX_NETWORK_INTERFACES);

    NetworkStatsSnapshot {
        received_bytes_per_sec,
        transmitted_bytes_per_sec,
        total_received_bytes,
        total_transmitted_bytes,
        interfaces,
    }
}

fn process_snapshots(system: &System, total_memory_bytes: u64) -> Vec<ProcessStatsSnapshot> {
    system
        .processes()
        .iter()
        .map(|(pid, process)| {
            let memory_bytes = process.memory();
            ProcessStatsSnapshot {
                pid: pid.as_u32(),
                name: process_name(process.name().to_string_lossy().as_ref()),
                cpu_usage_percent: process.cpu_usage() as f64,
                memory_bytes,
                memory_percent: percent(memory_bytes, total_memory_bytes).unwrap_or(0.0),
            }
        })
        .collect()
}

fn top_processes_by_cpu(
    processes: &[ProcessStatsSnapshot],
    limit: usize,
) -> Vec<ProcessStatsSnapshot> {
    let mut top = processes.to_vec();
    top.sort_by(|a, b| {
        b.cpu_usage_percent
            .total_cmp(&a.cpu_usage_percent)
            .then_with(|| b.memory_bytes.cmp(&a.memory_bytes))
            .then_with(|| a.name.cmp(&b.name))
    });
    top.truncate(limit);
    top
}

fn top_processes_by_memory(
    processes: &[ProcessStatsSnapshot],
    limit: usize,
) -> Vec<ProcessStatsSnapshot> {
    let mut top = processes.to_vec();
    top.sort_by(|a, b| {
        b.memory_bytes
            .cmp(&a.memory_bytes)
            .then_with(|| b.cpu_usage_percent.total_cmp(&a.cpu_usage_percent))
            .then_with(|| a.name.cmp(&b.name))
    });
    top.truncate(limit);
    top
}

fn process_name(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        "Unknown process".to_string()
    } else {
        trimmed.to_string()
    }
}

fn bytes_per_second(bytes_since_refresh: u64, elapsed_secs: f64) -> u64 {
    (bytes_since_refresh as f64 / elapsed_secs).round() as u64
}

fn percent(used: u64, total: u64) -> Option<f64> {
    if total == 0 {
        None
    } else {
        Some(clamp_percent((used as f64 / total as f64) * 100.0))
    }
}

fn clamp_percent(value: f64) -> f64 {
    if value.is_finite() {
        value.clamp(0.0, 100.0)
    } else {
        0.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percent_rejects_zero_total_and_clamps() {
        assert_eq!(percent(10, 0), None);
        assert_eq!(percent(25, 100), Some(25.0));
        assert_eq!(percent(150, 100), Some(100.0));
    }

    #[test]
    fn process_name_falls_back_for_empty_names() {
        assert_eq!(process_name(""), "Unknown process");
        assert_eq!(process_name("  "), "Unknown process");
        assert_eq!(process_name("codex.exe"), "codex.exe");
    }

    #[test]
    fn top_process_helpers_sort_independently() {
        let processes = vec![
            ProcessStatsSnapshot {
                pid: 1,
                name: "low-cpu".into(),
                cpu_usage_percent: 5.0,
                memory_bytes: 900,
                memory_percent: 9.0,
            },
            ProcessStatsSnapshot {
                pid: 2,
                name: "hot".into(),
                cpu_usage_percent: 50.0,
                memory_bytes: 100,
                memory_percent: 1.0,
            },
            ProcessStatsSnapshot {
                pid: 3,
                name: "large".into(),
                cpu_usage_percent: 10.0,
                memory_bytes: 2_000,
                memory_percent: 20.0,
            },
        ];

        assert_eq!(top_processes_by_cpu(&processes, 1)[0].name, "hot");
        assert_eq!(top_processes_by_memory(&processes, 1)[0].name, "large");
    }

    #[test]
    fn stats_snapshot_serializes_with_camel_case_fields() {
        let snapshot = SystemStatsSnapshot {
            collected_at: "2026-05-24T00:00:00Z".into(),
            cpu: CpuStatsSnapshot {
                usage_percent: 25.0,
                average_frequency_mhz: Some(4_700),
                logical_core_count: 32,
                physical_core_count: Some(24),
                brand: Some("CPU".into()),
            },
            memory: MemoryStatsSnapshot {
                total_bytes: 100,
                used_bytes: 40,
                available_bytes: 60,
                used_percent: 40.0,
            },
            disks: Vec::new(),
            network: NetworkStatsSnapshot {
                received_bytes_per_sec: 1,
                transmitted_bytes_per_sec: 2,
                total_received_bytes: 3,
                total_transmitted_bytes: 4,
                interfaces: Vec::new(),
            },
            top_processes_by_cpu: Vec::new(),
            top_processes_by_memory: Vec::new(),
            unavailable: Vec::new(),
        };

        let json = serde_json::to_string(&snapshot).expect("serialize");
        assert!(json.contains("\"collectedAt\""));
        assert!(json.contains("\"usagePercent\""));
        assert!(json.contains("\"receivedBytesPerSec\""));
        assert!(json.contains("\"topProcessesByCpu\""));
    }
}
