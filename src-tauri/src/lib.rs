use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use uuid::Uuid;
use std::path::{Path, PathBuf};

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

        // Reset buffer and prepare recording
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
            *m = mode.clone();
        }
        {
            let mut pd = self.project_dir.lock().unwrap();
            *pd = project_dir.clone();
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
            let mut last_scan_time = Utc::now();
            let mut tick_count: u64 = 0;
            let mut prev_window_title = String::new();
            let mut prev_app_class = String::new();
            let mut focus_start = Utc::now();

            while is_rec.load(Ordering::Relaxed) {
                thread::sleep(Duration::from_secs(2));
                if !is_rec.load(Ordering::Relaxed) {
                    break;
                }

                tick_count += 1;
                let now = Utc::now();
                let project_path = proj_dir.lock().unwrap().clone();

                // 1. SCAN DYNAMIC FILE SYSTEM MODIFICATIONS (VS CODE / CODING STATE)
                if !project_path.is_empty() {
                    let path = Path::new(&project_path);
                    let modified_files = scan_recent_modified_files(path, last_scan_time, 4);
                    if !modified_files.is_empty() {
                        let mut acts = activities.lock().unwrap();
                        let mut apps_list = unique_apps.lock().unwrap();
                        
                        if !apps_list.contains(&"VS Code".to_string()) {
                            apps_list.push("VS Code".to_string());
                        }

                        for (filepath, _mtime) in modified_files {
                            let filename = Path::new(&filepath)
                                .file_name()
                                .map(|f| f.to_string_lossy().to_string())
                                .unwrap_or_else(|| filepath.clone());
                            
                            // Capture specific git diff for this file
                            let git_diff = Command::new("git")
                                .args(["-C", &project_path, "diff", "--stat", "--", &filepath])
                                .output()
                                .ok()
                                .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
                                .unwrap_or_default();

                            let relative_path = filepath
                                .replace(&project_path, "")
                                .trim_start_matches('/')
                                .to_string();

                            let act = ActivityRecord {
                                activity_id: format!("act-vscode-{}", Uuid::new_v4().to_string().split('-').next().unwrap_or("x")),
                                timestamp: now.to_rfc3339(),
                                activity_type: "code_edit".to_string(),
                                app_class: "VS Code".to_string(),
                                window_title: format!("Mengedit berkas: {}", relative_path),
                                layout_state: LayoutState {
                                    focused_app: "VS Code".to_string(),
                                    screen_mode: "maximized".to_string(),
                                    left_window_app: None,
                                    right_window_app: None,
                                    split_ratio: "100:0".to_string(),
                                },
                                duration_ms: 2000,
                                details: Some(serde_json::json!({
                                    "filename": filename,
                                    "relative_path": relative_path,
                                    "git_diff_summary": git_diff.trim(),
                                    "message": "Menyimpan perubahan dan memperbaiki baris kode editor"
                                })),
                            };
                            acts.push(act);
                        }
                    }
                    last_scan_time = now;
                }

                // 2. SCAN ACTIVE RUNNING PROCESSES (TERMINAL / DEV SERVER)
                let active_processes = get_active_dev_processes();
                if tick_count % 3 == 0 && !active_processes.is_empty() {
                    let mut is_running_dev = false;
                    let mut running_cmds = Vec::new();
                    
                    for proc in &active_processes {
                        if proc.contains("npm run") || proc.contains("node") || proc.contains("cargo run") || proc.contains("docker-compose") {
                            is_running_dev = true;
                            running_cmds.push(proc.clone());
                        }
                    }

                    if is_running_dev {
                        let mut acts = activities.lock().unwrap();
                        let mut apps_list = unique_apps.lock().unwrap();
                        if !apps_list.contains(&"Terminal".to_string()) {
                            apps_list.push("Terminal".to_string());
                        }

                        let act = ActivityRecord {
                            activity_id: format!("act-term-{}", Uuid::new_v4().to_string().split('-').next().unwrap_or("x")),
                            timestamp: now.to_rfc3339(),
                            activity_type: "terminal_command".to_string(),
                            app_class: "Terminal".to_string(),
                            window_title: "Terminal Eksternal — Menjalankan Server & Build".to_string(),
                            layout_state: LayoutState {
                                focused_app: "Terminal".to_string(),
                                screen_mode: "split-screen".to_string(),
                                left_window_app: Some("VS Code".to_string()),
                                right_window_app: Some("Terminal".to_string()),
                                split_ratio: "50:50".to_string(),
                            },
                            duration_ms: 6000,
                            details: Some(serde_json::json!({
                                "active_commands": running_cmds,
                                "environment": "Ubuntu Shell — Wayland session",
                                "activity": "Mengecek logs, me-restart server, atau mem-build program"
                            })),
                        };
                        acts.push(act);
                    }
                }

                // 3. FALLBACK TO XPROP WINDOW FOCUS DETECTION IF WORKS
                let (wm_name, wm_class) = get_active_window_info();
                if !wm_name.is_empty() && !wm_class.is_empty() {
                    let app_class = classify_app(&wm_class, &wm_name);
                    
                    // Track unique apps
                    {
                        let mut apps_list = unique_apps.lock().unwrap();
                        if !apps_list.contains(&app_class) {
                            apps_list.push(app_class.clone());
                        }
                    }

                    if wm_name != prev_window_title || app_class != prev_app_class {
                        let duration = (now - focus_start).num_milliseconds().max(0) as u64;
                        if !prev_window_title.is_empty() && duration > 500 {
                            let layout = detect_layout(&app_class);
                            let act = ActivityRecord {
                                activity_id: format!("act-focus-{}", Uuid::new_v4().to_string().split('-').next().unwrap_or("x")),
                                timestamp: now.to_rfc3339(),
                                activity_type: classify_activity_type(&app_class, &prev_window_title),
                                app_class: prev_app_class.clone(),
                                window_title: prev_window_title.clone(),
                                layout_state: layout,
                                duration_ms: duration,
                                details: build_details(&prev_app_class, &prev_window_title),
                            };
                            let mut acts = activities.lock().unwrap();
                            acts.push(act);

                            let mut cog = cognitive.lock().unwrap();
                            cog.total_app_switches += 1;
                        }
                        prev_window_title = wm_name;
                        prev_app_class = app_class;
                        focus_start = now;
                    }
                }

                // 4. PERIODIC GIT STATUS CHECK (EVERY 10 SECONDS)
                if tick_count % 5 == 0 && !project_path.is_empty() {
                    if let Some(git_activity) = capture_git_snapshot(&project_path) {
                        let mut acts = activities.lock().unwrap();
                        acts.push(git_activity);
                    }
                }
            }
        });

        let mut wh = self.worker_handle.lock().unwrap();
        *wh = Some(handle);
    }

    pub fn stop(&self) -> Option<Vec<ActivityRecord>> {
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

        let activities = self.activities.lock().unwrap().clone();
        Some(activities)
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

// ── Directory & Process Polling Helper Functions (Wayland Proof) ──

fn scan_recent_modified_files(dir: &Path, since: DateTime<Utc>, max_depth: u32) -> Vec<(String, DateTime<Utc>)> {
    let mut modified = Vec::new();
    if max_depth == 0 {
        return modified;
    }
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            if path.is_dir() {
                let name = path.file_name().unwrap_or_default().to_string_lossy();
                if name == "node_modules" || name == ".git" || name == "target" 
                   || name == ".next" || name == "out" || name == "dist" 
                   || name == ".gemini" || name == "build" {
                    continue;
                }
                modified.extend(scan_recent_modified_files(&path, since, max_depth - 1));
            } else if path.is_file() {
                if let Ok(metadata) = entry.metadata() {
                    if let Ok(mtime) = metadata.modified() {
                        let mtime_chrono: DateTime<Utc> = mtime.into();
                        if mtime_chrono > since {
                            modified.push((path.to_string_lossy().to_string(), mtime_chrono));
                        }
                    }
                }
            }
        }
    }
    modified
}

fn get_active_dev_processes() -> Vec<String> {
    let output = Command::new("ps")
        .args(["-eo", "comm,args"])
        .output();
    let mut procs = Vec::new();
    if let Ok(out) = output {
        let stdout = String::from_utf8_lossy(&out.stdout);
        for line in stdout.lines() {
            let line_lower = line.to_lowercase();
            if line_lower.contains("npm") || line_lower.contains("node") 
               || line_lower.contains("cargo") || line_lower.contains("docker") 
               || line_lower.contains("postman") || line_lower.contains("chrome") 
               || line_lower.contains("firefox") || line_lower.contains("git") {
                procs.push(line.trim().to_string());
            }
        }
    }
    procs
}

fn get_active_window_info() -> (String, String) {
    let win_id_output = Command::new("xprop")
        .args(["-root", "_NET_ACTIVE_WINDOW"])
        .output();

    let win_id = match win_id_output {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
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

    let wm_name = Command::new("xprop")
        .args(["-id", &win_id, "WM_NAME"])
        .output()
        .ok()
        .map(|o| {
            let s = String::from_utf8_lossy(&o.stdout).to_string();
            extract_xprop_string(&s)
        })
        .unwrap_or_default();

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
    } else if class_lower.contains("evince") || class_lower.contains("okular") {
        "PDF Viewer".to_string()
    } else if class_lower.contains("obsidian") {
        "Obsidian".to_string()
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
        _ => "desktop_context".to_string(),
    }
}

fn detect_layout(app_class: &str) -> LayoutState {
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
        window_title: format!("{} berkas dirubah (Git)", changed_files.len()),
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

// ── Tauri Commands (Custom Session Logic & Loading) ──

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
) -> Result<Vec<ActivityRecord>, String> {
    let activities = state.stop().unwrap_or_default();
    Ok(activities)
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

#[tauri::command]
fn save_session_file(
    title: String,
    session_data: serde_json::Value,
) -> Result<String, String> {
    let data_dir = std::env::var("HOME")
        .map(|h| PathBuf::from(h).join("GhostFlow_Data"))
        .unwrap_or_else(|_| PathBuf::from("GhostFlow_Data"));

    let _ = std::fs::create_dir_all(&data_dir);
    
    // Sanitize title for filename
    let sanitized_title: String = title
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect();
    let filename = format!("{}.json", sanitized_title.to_lowercase());
    let filepath = data_dir.join(&filename);

    match serde_json::to_string_pretty(&session_data) {
        Ok(json) => {
            let _ = std::fs::write(&filepath, json);
            Ok(filepath.to_string_lossy().to_string())
        }
        Err(e) => Err(format!("Gagal serialisasi data: {}", e)),
    }
}

#[tauri::command]
fn load_all_sessions() -> Result<Vec<serde_json::Value>, String> {
    let data_dir = std::env::var("HOME")
        .map(|h| PathBuf::from(h).join("GhostFlow_Data"))
        .unwrap_or_else(|_| PathBuf::from("GhostFlow_Data"));

    let mut sessions = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&data_dir) {
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            if path.is_file() && path.extension().map(|e| e == "json").unwrap_or(false) {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(&content) {
                        sessions.push(json_val);
                    }
                }
            }
        }
    }
    Ok(sessions)
}

#[tauri::command]
fn delete_session_file(title: String) -> Result<(), String> {
    let data_dir = std::env::var("HOME")
        .map(|h| PathBuf::from(h).join("GhostFlow_Data"))
        .unwrap_or_else(|_| PathBuf::from("GhostFlow_Data"));

    let sanitized_title: String = title
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect();
    let filename = format!("{}.json", sanitized_title.to_lowercase());
    let filepath = data_dir.join(&filename);

    if filepath.exists() {
        let _ = std::fs::remove_file(filepath);
    }
    Ok(())
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
            save_session_file,
            load_all_sessions,
            delete_session_file,
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
