use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use uuid::Uuid;

// ── Data Structures ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayoutState {
    pub focused_app: String,
    pub screen_mode: String,
    pub left_window_app: Option<String>,
    pub right_window_app: Option<String>,
    pub split_ratio: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityRecord {
    pub activity_id: String,
    pub timestamp: String,
    pub activity_type: String,
    pub app_class: String,
    pub window_title: String,
    pub layout_state: LayoutState,
    pub duration_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionExport {
    pub session_metadata: SessionMetadata,
    pub desktop_context_summary: DesktopContextSummary,
    pub timeline_activities: Vec<ActivityRecord>,
    pub cognitive_signals: CognitiveSignals,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionMetadata {
    pub session_id: String,
    pub title: String,
    pub created_at: String,
    pub ended_at: String,
    pub duration_seconds: u64,
    pub mode: String,
    pub total_activities: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesktopContextSummary {
    pub os: String,
    pub active_apps_during_session: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CognitiveSignals {
    pub fast_file_switch_count: u32,
    pub research_phase_count: u32,
    pub retry_pattern_count: u32,
    pub total_app_switches: u32,
}

// ── Telemetry Engine ──

pub struct TelemetryEngine {
    is_recording: Arc<AtomicBool>,
    activities: Arc<Mutex<Vec<ActivityRecord>>>,
    session_start: Arc<Mutex<Option<DateTime<Utc>>>>,
    recording_mode: Arc<Mutex<String>>,
    worker_handle: Arc<Mutex<Option<thread::JoinHandle<()>>>>,
    project_dir: Arc<Mutex<String>>,
    unique_apps: Arc<Mutex<Vec<String>>>,
    cognitive: Arc<Mutex<CognitiveSignals>>,
}

impl TelemetryEngine {
    pub fn new() -> Self {
        Self {
            is_recording: Arc::new(AtomicBool::new(false)),
            activities: Arc::new(Mutex::new(Vec::new())),
            session_start: Arc::new(Mutex::new(None)),
            recording_mode: Arc::new(Mutex::new("expert".to_string())),
            worker_handle: Arc::new(Mutex::new(None)),
            project_dir: Arc::new(Mutex::new(String::new())),
            unique_apps: Arc::new(Mutex::new(Vec::new())),
            cognitive: Arc::new(Mutex::new(CognitiveSignals {
                fast_file_switch_count: 0,
                research_phase_count: 0,
                retry_pattern_count: 0,
                total_app_switches: 0,
            })),
        }
    }

    pub fn start(&self, mode: String, project_dir: String) {
        if self.is_recording.load(Ordering::Relaxed) {
            return;
        }

        // Reset state
        {
            let mut acts = self.activities.lock().unwrap();
            acts.clear();
        }
        {
            let mut start = self.session_start.lock().unwrap();
            *start = Some(Utc::now());
        }
        {
            let mut m = self.recording_mode.lock().unwrap();
            *m = mode;
        }
        {
            let mut pd = self.project_dir.lock().unwrap();
            *pd = project_dir;
        }
        {
            let mut apps = self.unique_apps.lock().unwrap();
            apps.clear();
        }
        {
            let mut cog = self.cognitive.lock().unwrap();
            *cog = CognitiveSignals {
                fast_file_switch_count: 0,
                research_phase_count: 0,
                retry_pattern_count: 0,
                total_app_switches: 0,
            };
        }

        self.is_recording.store(true, Ordering::Relaxed);

        let is_rec = self.is_recording.clone();
        let activities = self.activities.clone();
        let proj_dir = self.project_dir.clone();
        let unique_apps = self.unique_apps.clone();
        let cognitive = self.cognitive.clone();

        let handle = thread::spawn(move || {
            let mut prev_window_title = String::new();
            let mut prev_app_class = String::new();
            let mut focus_start = Utc::now();
            let mut tick_count: u64 = 0;
            let mut recent_switches: Vec<DateTime<Utc>> = Vec::new();

            while is_rec.load(Ordering::Relaxed) {
                thread::sleep(Duration::from_secs(2));
                if !is_rec.load(Ordering::Relaxed) {
                    break;
                }

                tick_count += 1;

                // Get active window info via xprop
                let (wm_name, wm_class) = get_active_window_info();

                if wm_name.is_empty() && wm_class.is_empty() {
                    continue;
                }

                let app_class = classify_app(&wm_class, &wm_name);
                let now = Utc::now();

                // Track unique apps
                {
                    let mut apps = unique_apps.lock().unwrap();
                    if !apps.contains(&app_class) {
                        apps.push(app_class.clone());
                    }
                }

                // Detect focus change
                if wm_name != prev_window_title || app_class != prev_app_class {
                    let duration = (now - focus_start).num_milliseconds().max(0) as u64;

                    // Only record if previous window had meaningful duration
                    if !prev_window_title.is_empty() && duration > 500 {
                        let layout = detect_layout(&app_class);
                        let activity = ActivityRecord {
                            activity_id: format!("act-{}", Uuid::new_v4().to_string().split('-').next().unwrap_or("x")),
                            timestamp: now.to_rfc3339(),
                            activity_type: classify_activity_type(&app_class, &prev_window_title),
                            app_class: prev_app_class.clone(),
                            window_title: prev_window_title.clone(),
                            layout_state: layout,
                            duration_ms: duration,
                            details: build_details(&prev_app_class, &prev_window_title),
                        };

                        let mut acts = activities.lock().unwrap();
                        acts.push(activity);
                    }

                    // Cognitive: detect fast file switching
                    if app_class == "VS Code" && prev_app_class == "VS Code" {
                        recent_switches.push(now);
                        recent_switches.retain(|t| (now - *t).num_seconds() < 15);
                        if recent_switches.len() > 3 {
                            let mut cog = cognitive.lock().unwrap();
                            cog.fast_file_switch_count += 1;
                            recent_switches.clear();
                        }
                    }

                    // Cognitive: detect research phase
                    if prev_app_class == "Google Chrome" && duration > 30000 {
                        let mut cog = cognitive.lock().unwrap();
                        cog.research_phase_count += 1;
                    }

                    // Cognitive: detect retry pattern (Terminal repeated)
                    if prev_app_class == "Terminal" && app_class == "Terminal" {
                        let mut cog = cognitive.lock().unwrap();
                        cog.retry_pattern_count += 1;
                    }

                    {
                        let mut cog = cognitive.lock().unwrap();
                        cog.total_app_switches += 1;
                    }

                    prev_window_title = wm_name.clone();
                    prev_app_class = app_class.clone();
                    focus_start = now;
                }

                // Git snapshot every 5 ticks (10 seconds)
                if tick_count % 5 == 0 {
                    let pd = proj_dir.lock().unwrap().clone();
                    if !pd.is_empty() {
                        if let Some(git_activity) = capture_git_snapshot(&pd) {
                            let mut acts = activities.lock().unwrap();
                            acts.push(git_activity);
                        }
                    }
                }
            }

            // Flush last focus window
            if !prev_window_title.is_empty() {
                let now = Utc::now();
                let duration = (now - focus_start).num_milliseconds().max(0) as u64;
                let layout = detect_layout(&prev_app_class);
                let activity = ActivityRecord {
                    activity_id: format!("act-{}", Uuid::new_v4().to_string().split('-').next().unwrap_or("x")),
                    timestamp: now.to_rfc3339(),
                    activity_type: classify_activity_type(&prev_app_class, &prev_window_title),
                    app_class: prev_app_class,
                    window_title: prev_window_title,
                    layout_state: layout,
                    duration_ms: duration,
                    details: None,
                };
                let mut acts = activities.lock().unwrap();
                acts.push(activity);
            }
        });

        let mut wh = self.worker_handle.lock().unwrap();
        *wh = Some(handle);
    }

    pub fn stop(&self) -> Option<String> {
        if !self.is_recording.load(Ordering::Relaxed) {
            return None;
        }

        self.is_recording.store(false, Ordering::Relaxed);

        // Join worker thread
        let handle = {
            let mut wh = self.worker_handle.lock().unwrap();
            wh.take()
        };
        if let Some(h) = handle {
            let _ = h.join();
        }

        // Build export
        let now = Utc::now();
        let start = self.session_start.lock().unwrap().unwrap_or(now);
        let duration = (now - start).num_seconds().max(0) as u64;
        let mode = self.recording_mode.lock().unwrap().clone();
        let activities = self.activities.lock().unwrap().clone();
        let apps = self.unique_apps.lock().unwrap().clone();
        let cognitive = self.cognitive.lock().unwrap().clone();

        let export = SessionExport {
            session_metadata: SessionMetadata {
                session_id: format!("ghost-{}", Uuid::new_v4()),
                title: format!("GhostFlow Session — {}", now.format("%Y-%m-%d %H:%M")),
                created_at: start.to_rfc3339(),
                ended_at: now.to_rfc3339(),
                duration_seconds: duration,
                mode: mode.clone(),
                total_activities: activities.len(),
            },
            desktop_context_summary: DesktopContextSummary {
                os: "Ubuntu".to_string(),
                active_apps_during_session: apps,
            },
            timeline_activities: activities,
            cognitive_signals: cognitive,
        };

        // Write JSON file
        let filename = format!(
            "{}_session_{}.json",
            mode,
            now.format("%Y%m%d_%H%M%S")
        );

        // Use ~/GhostFlow_Data for global desktop app compatibility
        let data_dir = std::env::var("HOME")
            .map(|h| std::path::PathBuf::from(h).join("GhostFlow_Data"))
            .unwrap_or_else(|_| std::path::PathBuf::from("GhostFlow_Data"));

        let _ = std::fs::create_dir_all(&data_dir);
        let filepath = data_dir.join(&filename);

        match serde_json::to_string_pretty(&export) {
            Ok(json) => {
                let _ = std::fs::write(&filepath, json);
                Some(filepath.to_string_lossy().to_string())
            }
            Err(_) => None,
        }
    }

    pub fn get_status(&self) -> serde_json::Value {
        let is_rec = self.is_recording.load(Ordering::Relaxed);
        let count = self.activities.lock().unwrap().len();
        let duration = if is_rec {
            let start = self.session_start.lock().unwrap();
            start.map(|s| (Utc::now() - s).num_seconds().max(0) as u64).unwrap_or(0)
        } else {
            0
        };
        let mode = self.recording_mode.lock().unwrap().clone();
        let cognitive = self.cognitive.lock().unwrap().clone();

        serde_json::json!({
            "is_recording": is_rec,
            "activity_count": count,
            "duration_seconds": duration,
            "mode": mode,
            "cognitive_signals": cognitive
        })
    }

    pub fn get_activities(&self, offset: usize) -> Vec<ActivityRecord> {
        let acts = self.activities.lock().unwrap();
        if offset < acts.len() {
            acts[offset..].to_vec()
        } else {
            Vec::new()
        }
    }
}

// ── Helper Functions ──

fn get_active_window_info() -> (String, String) {
    // Step 1: Get active window ID
    let win_id_output = Command::new("xprop")
        .args(["-root", "_NET_ACTIVE_WINDOW"])
        .output();

    let win_id = match win_id_output {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            // Parse "... window id # 0x1234567"
            stdout
                .split("# ")
                .nth(1)
                .unwrap_or("")
                .trim()
                .split(',')
                .next()
                .unwrap_or("")
                .trim()
                .to_string()
        }
        Err(_) => return (String::new(), String::new()),
    };

    if win_id.is_empty() || win_id == "0x0" {
        return (String::new(), String::new());
    }

    // Step 2: Get WM_NAME
    let wm_name = Command::new("xprop")
        .args(["-id", &win_id, "WM_NAME"])
        .output()
        .ok()
        .map(|o| {
            let s = String::from_utf8_lossy(&o.stdout).to_string();
            extract_xprop_string(&s)
        })
        .unwrap_or_default();

    // Step 3: Get WM_CLASS
    let wm_class = Command::new("xprop")
        .args(["-id", &win_id, "WM_CLASS"])
        .output()
        .ok()
        .map(|o| {
            let s = String::from_utf8_lossy(&o.stdout).to_string();
            extract_xprop_string(&s)
        })
        .unwrap_or_default();

    (wm_name, wm_class)
}

fn extract_xprop_string(raw: &str) -> String {
    // xprop output: WM_NAME(STRING) = "Some Title"
    if let Some(eq_pos) = raw.find('=') {
        let val = raw[eq_pos + 1..].trim();
        val.trim_matches('"').to_string()
    } else {
        String::new()
    }
}

fn classify_app(wm_class: &str, wm_name: &str) -> String {
    let class_lower = wm_class.to_lowercase();
    let name_lower = wm_name.to_lowercase();

    if class_lower.contains("code") || class_lower.contains("vscodium") {
        "VS Code".to_string()
    } else if class_lower.contains("chrome") || class_lower.contains("chromium") {
        if name_lower.contains("figma") {
            "Figma (Chrome)".to_string()
        } else {
            "Google Chrome".to_string()
        }
    } else if class_lower.contains("firefox") {
        "Firefox".to_string()
    } else if class_lower.contains("figma") {
        "Figma".to_string()
    } else if class_lower.contains("postman") {
        "Postman".to_string()
    } else if class_lower.contains("terminal") || class_lower.contains("gnome-terminal")
        || class_lower.contains("kitty") || class_lower.contains("alacritty")
        || class_lower.contains("konsole") || class_lower.contains("xterm")
        || class_lower.contains("tilix") || class_lower.contains("warp")
    {
        "Terminal".to_string()
    } else if class_lower.contains("docker") {
        "Docker Desktop".to_string()
    } else if class_lower.contains("libreoffice") || class_lower.contains("soffice") {
        "LibreOffice".to_string()
    } else if class_lower.contains("evince") || class_lower.contains("okular") {
        "PDF Viewer".to_string()
    } else if class_lower.contains("obsidian") {
        "Obsidian".to_string()
    } else if class_lower.contains("nautilus") || class_lower.contains("thunar") || class_lower.contains("nemo") {
        "File Manager".to_string()
    } else if !wm_class.is_empty() {
        wm_class.to_string()
    } else {
        "Unknown".to_string()
    }
}

fn classify_activity_type(app_class: &str, window_title: &str) -> String {
    let title_lower = window_title.to_lowercase();
    match app_class {
        "VS Code" => {
            if title_lower.contains(".env") || title_lower.contains("docker-compose")
                || title_lower.contains("config")
            {
                "config_edit".to_string()
            } else {
                "code_edit".to_string()
            }
        }
        "Google Chrome" | "Firefox" => {
            if title_lower.contains("stackoverflow") || title_lower.contains("stack overflow") {
                "web_research_stackoverflow".to_string()
            } else if title_lower.contains("docs") || title_lower.contains("documentation") {
                "web_research_docs".to_string()
            } else {
                "web_research".to_string()
            }
        }
        "Figma" | "Figma (Chrome)" => "design_review".to_string(),
        "Postman" => "api_testing".to_string(),
        "Terminal" => "terminal_command".to_string(),
        "Docker Desktop" => "infrastructure_check".to_string(),
        "LibreOffice" | "PDF Viewer" | "Obsidian" => "document_reference".to_string(),
        _ => "desktop_context".to_string(),
    }
}

fn detect_layout(app_class: &str) -> LayoutState {
    // Simplified layout detection.
    // Full version would query window geometry via xprop.
    LayoutState {
        focused_app: app_class.to_string(),
        screen_mode: "maximized".to_string(),
        left_window_app: None,
        right_window_app: None,
        split_ratio: "100:0".to_string(),
    }
}

fn build_details(app_class: &str, window_title: &str) -> Option<serde_json::Value> {
    match app_class {
        "Google Chrome" | "Firefox" => Some(serde_json::json!({
            "tab_title": window_title,
            "source_type": if window_title.to_lowercase().contains("stackoverflow") {
                "stackoverflow"
            } else if window_title.to_lowercase().contains("docs") {
                "documentation"
            } else {
                "web_page"
            }
        })),
        "VS Code" => Some(serde_json::json!({
            "file_hint": window_title.split(" — ").next().unwrap_or("").trim()
        })),
        "Terminal" => Some(serde_json::json!({
            "terminal_title": window_title
        })),
        "LibreOffice" | "PDF Viewer" | "Obsidian" => Some(serde_json::json!({
            "document_title": window_title
        })),
        "Figma" | "Figma (Chrome)" => Some(serde_json::json!({
            "design_file": window_title
        })),
        _ => None,
    }
}

fn capture_git_snapshot(project_dir: &str) -> Option<ActivityRecord> {
    let status_output = Command::new("git")
        .args(["-C", project_dir, "status", "--porcelain"])
        .output()
        .ok()?;

    let status_str = String::from_utf8_lossy(&status_output.stdout).to_string();
    if status_str.trim().is_empty() {
        return None;
    }

    let diff_output = Command::new("git")
        .args(["-C", project_dir, "diff", "--stat"])
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default();

    let changed_files: Vec<String> = status_str
        .lines()
        .filter(|l| !l.is_empty())
        .map(|l| l[3..].trim().to_string())
        .collect();

    Some(ActivityRecord {
        activity_id: format!("git-{}", Uuid::new_v4().to_string().split('-').next().unwrap_or("x")),
        timestamp: Utc::now().to_rfc3339(),
        activity_type: "git_snapshot".to_string(),
        app_class: "Git".to_string(),
        window_title: format!("{} files changed", changed_files.len()),
        layout_state: LayoutState {
            focused_app: "Git (background)".to_string(),
            screen_mode: "background".to_string(),
            left_window_app: None,
            right_window_app: None,
            split_ratio: "0:0".to_string(),
        },
        duration_ms: 0,
        details: Some(serde_json::json!({
            "changed_files": changed_files,
            "diff_stat": diff_output.trim(),
            "status_raw": status_str.trim()
        })),
    })
}

// ── Tauri Commands ──

#[tauri::command]
fn start_recording(
    state: tauri::State<'_, Arc<TelemetryEngine>>,
    mode: String,
    project_dir: String,
) -> Result<String, String> {
    state.start(mode.clone(), project_dir);
    Ok(format!("Recording started in {} mode", mode))
}

#[tauri::command]
fn stop_recording(
    state: tauri::State<'_, Arc<TelemetryEngine>>,
) -> Result<Option<String>, String> {
    let path = state.stop();
    Ok(path)
}

#[tauri::command]
fn get_recording_status(
    state: tauri::State<'_, Arc<TelemetryEngine>>,
) -> Result<serde_json::Value, String> {
    Ok(state.get_status())
}

#[tauri::command]
fn get_live_activities(
    state: tauri::State<'_, Arc<TelemetryEngine>>,
    offset: usize,
) -> Result<Vec<ActivityRecord>, String> {
    Ok(state.get_activities(offset))
}

// ── Tauri App Entry ──

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let engine = Arc::new(TelemetryEngine::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(engine)
        .invoke_handler(tauri::generate_handler![
            start_recording,
            stop_recording,
            get_recording_status,
            get_live_activities,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
