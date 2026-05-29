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
    pub organization_score: String, // "Teratur (Split-Screen Kanan)" | "Teratur (Split-Screen Kiri)" | "Fokus Tunggal (Maximized)" | "Acak-acakan (Overlapping)"
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
    
    // State-Change Observer
    last_window_title: Arc<Mutex<String>>,
    last_git_hash: Arc<Mutex<String>>,
    last_active_processes: Arc<Mutex<Vec<String>>>,

    // Error & Fix Tracking State
    error_detected: Arc<AtomicBool>,
    error_keyword: Arc<Mutex<String>>,
    modified_files_during_error: Arc<Mutex<Vec<String>>>,
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
            last_window_title: Arc::new(Mutex::new(String::new())),
            last_git_hash: Arc::new(Mutex::new(String::new())),
            last_active_processes: Arc::new(Mutex::new(Vec::new())),
            error_detected: Arc::new(AtomicBool::new(false)),
            error_keyword: Arc::new(Mutex::new(String::new())),
            modified_files_during_error: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn start(&self, mode: String, project_dir: String) {
        if self.is_recording.load(Ordering::Relaxed) {
            return;
        }

        // Reset buffers & state variables
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
        {
            let mut lwt = self.last_window_title.lock().unwrap();
            lwt.clear();
            let mut lgh = self.last_git_hash.lock().unwrap();
            lgh.clear();
            let mut lap = self.last_active_processes.lock().unwrap();
            lap.clear();
        }
        self.error_detected.store(false, Ordering::Relaxed);
        {
            let mut kw = self.error_keyword.lock().unwrap();
            kw.clear();
            let mut mf = self.modified_files_during_error.lock().unwrap();
            mf.clear();
        }

        self.is_recording.store(true, Ordering::Relaxed);

        let is_rec = self.is_recording.clone();
        let activities = self.activities.clone();
        let proj_dir = self.project_dir.clone();
        let unique_apps = self.unique_apps.clone();
        let cognitive = self.cognitive.clone();
        
        let last_window_title = self.last_window_title.clone();
        let last_git_hash = self.last_git_hash.clone();
        let last_active_processes = self.last_active_processes.clone();

        let error_detected = self.error_detected.clone();
        let error_keyword = self.error_keyword.clone();
        let modified_files_during_error = self.modified_files_during_error.clone();

        // Spawn relaxed telemetry worker loop (Ticking every 5 seconds for responsive logs)
        let handle = thread::spawn(move || {
            let mut last_scan_time = Utc::now();
            let mut tick_count: u64 = 0;

            while is_rec.load(Ordering::Relaxed) {
                thread::sleep(Duration::from_secs(5));
                if !is_rec.load(Ordering::Relaxed) {
                    break;
                }

                tick_count += 1;
                let now = Utc::now();
                let project_path = proj_dir.lock().unwrap().clone();

                // Get Current Git Hash/Status as state checker
                let current_git_status = get_git_status_output(&project_path);
                
                // Fetch strict whitelisted processes
                let current_processes = get_strict_whitelisted_processes();

                // Fetch Window Info
                let mut current_window_title_str = String::new();
                let mut current_app_class = String::new();
                let mut current_win_id = String::new();

                let (wm_name, wm_class, win_id) = get_active_window_info();
                if !wm_name.is_empty() && !wm_class.is_empty() {
                    current_window_title_str = wm_name;
                    current_app_class = classify_app(&wm_class, &current_window_title_str);
                    current_win_id = win_id;
                }

                // ─── Wayland Fallback 1: File Modifications (implies active coding in editor) ───
                let mut modified_files_found = Vec::new();
                if !project_path.is_empty() {
                    let path = Path::new(&project_path);
                    let modified_files = scan_recent_modified_files(path, last_scan_time, 4);
                    if !modified_files.is_empty() {
                        for (filepath, _mtime) in &modified_files {
                            let relative_path = filepath
                                .replace(&project_path, "")
                                .trim_start_matches('/')
                                .to_string();
                            modified_files_found.push(relative_path);
                        }

                        // If xprop failed to identify active editor, override with inferred coding activity
                        if current_window_title_str.is_empty() {
                            let editor_name = if current_processes.iter().any(|p| p.to_lowercase().contains("vscodium")) {
                                "VS Code (Codium)"
                            } else {
                                "VS Code"
                            };
                            current_app_class = editor_name.to_string();
                            let last_edited = Path::new(&modified_files[0].0)
                                .file_name()
                                .map(|f| f.to_string_lossy().to_string())
                                .unwrap_or_default();
                            current_window_title_str = format!("Mengedit berkas: {}", last_edited);
                        }
                    }
                }

                // ─── Wayland Fallback 2: Recently Opened Document (LibreOffice / Evince PDF) ───
                if current_window_title_str.is_empty() {
                    if let Some((doc_name, _doc_path)) = get_recent_document_xbel() {
                        current_app_class = "LibreOffice".to_string();
                        current_window_title_str = format!("Membuka Dokumen: {}", doc_name);
                    }
                }

                // ─── Wayland Fallback 3: Chrome History (Active web research) ───
                if current_window_title_str.is_empty() {
                    let chrome_active = current_processes.iter().any(|p| p.to_lowercase().contains("chrome"));
                    if chrome_active {
                        if let Some((tab_title, _url)) = get_recent_chrome_tab() {
                            current_window_title_str = tab_title;
                            current_app_class = "Google Chrome".to_string();
                        }
                    }
                }

                // ─── Wayland Fallback 4: Active Terminal Command ───
                if current_window_title_str.is_empty() && !current_processes.is_empty() {
                    let active_dev_processes: Vec<String> = current_processes.iter()
                        .filter(|p| {
                            let pl = p.to_lowercase();
                            pl.contains("npm") || pl.contains("cargo") || pl.contains("docker") || pl.contains("docker-compose")
                        })
                        .cloned()
                        .collect();
                    if !active_dev_processes.is_empty() {
                        current_app_class = "Terminal".to_string();
                        current_window_title_str = format!("Terminal — Menjalankan: {}", active_dev_processes[0]);
                    }
                }

                // If nothing was detected, skip this iteration to prevent logging noise
                if current_window_title_str.is_empty() {
                    continue;
                }

                // Check Layout Geometry (or Synthesize split-screen if coordinates not available)
                let layout_state = determine_layout_state(&current_app_class, &current_win_id);

                // State-Change Observer: Prevent duplicate logging if nothing has changed
                let state_changed = {
                    let prev_title = last_window_title.lock().unwrap().clone();
                    let prev_git = last_git_hash.lock().unwrap().clone();
                    let prev_proc = last_active_processes.lock().unwrap().clone();

                    current_window_title_str != prev_title
                        || current_git_status != prev_git
                        || current_processes != prev_proc
                };

                if !state_changed {
                    continue;
                }

                // Update state-change variables
                {
                    *last_window_title.lock().unwrap() = current_window_title_str.clone();
                    *last_git_hash.lock().unwrap() = current_git_status.clone();
                    *last_active_processes.lock().unwrap() = current_processes.clone();
                }

                // Track App Switches
                {
                    let mut cog = cognitive.lock().unwrap();
                    cog.total_app_switches += 1;
                }

                // ─── 1. LOG DOCUMENT (WORD / EXCEL / PDF) ───
                if is_document_window(&current_app_class, &current_window_title_str) {
                    let doc_name = extract_document_name(&current_window_title_str);
                    let mut acts = activities.lock().unwrap();
                    let mut apps_list = unique_apps.lock().unwrap();
                    if !apps_list.contains(&current_app_class) {
                        apps_list.push(current_app_class.clone());
                    }

                    let act = ActivityRecord {
                        activity_id: format!("act-doc-{}", Uuid::new_v4().to_string().split('-').next().unwrap_or("x")),
                        timestamp: now.to_rfc3339(),
                        activity_type: "document_view".to_string(),
                        app_class: current_app_class.clone(),
                        window_title: format!("Membuka Dokumen: {}", doc_name),
                        layout_state: layout_state.clone(),
                        duration_ms: 5000,
                        details: Some(serde_json::json!({
                            "document_name": doc_name,
                            "app": current_app_class.clone(),
                            "action": "mempelajari referensi dokumen spesifikasi"
                        })),
                    };
                    acts.push(act);
                    continue;
                }

                // ─── 2. LOG FILE SYSTEM MODIFICATIONS (CODE EDITS) ───
                if !project_path.is_empty() && !modified_files_found.is_empty() {
                    let mut acts = activities.lock().unwrap();
                    let mut apps_list = unique_apps.lock().unwrap();
                    
                    let editor_name = if current_app_class == "Antigravity" { "Antigravity" } else { "VS Code" };
                    if !apps_list.contains(&editor_name.to_string()) {
                        apps_list.push(editor_name.to_string());
                    }

                    let path = Path::new(&project_path);
                    let modified_files = scan_recent_modified_files(path, last_scan_time, 4);

                    for (filepath, _mtime) in modified_files {
                        let filename = Path::new(&filepath)
                            .file_name()
                            .map(|f| f.to_string_lossy().to_string())
                            .unwrap_or_else(|| filepath.clone());
                        
                        let relative_path = filepath
                            .replace(&project_path, "")
                            .trim_start_matches('/')
                            .to_string();

                        // Capture actual git diff for this specific edited file
                        let git_diff = Command::new("git")
                            .args(["-C", &project_path, "diff", "--stat", "--", &filepath])
                            .output()
                            .ok()
                            .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
                            .unwrap_or_default();

                        let act = ActivityRecord {
                            activity_id: format!("act-editor-{}", Uuid::new_v4().to_string().split('-').next().unwrap_or("x")),
                            timestamp: now.to_rfc3339(),
                            activity_type: "code_edit".to_string(),
                            app_class: editor_name.to_string(),
                            window_title: format!("Mengedit berkas: {}", relative_path),
                            layout_state: layout_state.clone(),
                            duration_ms: 5000,
                            details: Some(serde_json::json!({
                                "filename": filename,
                                "relative_path": relative_path,
                                "git_diff_summary": git_diff.trim(),
                                "message": "Menyimpan perubahan baris kode editor"
                            })),
                        };
                        acts.push(act);
                    }

                    let mut cog = cognitive.lock().unwrap();
                    cog.fast_file_switch_count += 1;
                    last_scan_time = now;
                }

                // If error is detected, record modified files to understand what files are being used to fix it
                if error_detected.load(Ordering::Relaxed) && !modified_files_found.is_empty() {
                    let mut mf = modified_files_during_error.lock().unwrap();
                    for f in modified_files_found {
                        if !mf.contains(&f) {
                            mf.push(f);
                        }
                    }
                }

                // ─── 3. ERROR DETECTOR & RESOLUTION STATE MACHINE ───
                // Check if Chrome or Firefox searches for errors
                if current_app_class == "Google Chrome" || current_app_class == "Firefox" {
                    let title_lower = current_window_title_str.to_lowercase();
                    let error_keywords = ["error", "exception", "failed", "crash", "econnrefused", "undefined", "how to fix", "cannot find", "not found", "oom"];
                    let has_error_keyword = error_keywords.iter().any(|&k| title_lower.contains(k));
                    
                    if has_error_keyword {
                        error_detected.store(true, Ordering::Relaxed);
                        let mut kw = error_keyword.lock().unwrap();
                        *kw = current_window_title_str.clone();

                        let mut cog = cognitive.lock().unwrap();
                        cog.retry_pattern_count += 1;
                    }
                }

                // If we were in error state, and now terminal runs commands successfully or Chrome is no longer showing errors
                if error_detected.load(Ordering::Relaxed) {
                    let is_terminal_command = current_app_class == "Terminal" || current_processes.iter().any(|p| p.to_lowercase().contains("npm") || p.to_lowercase().contains("cargo"));
                    
                    let modified_files = modified_files_during_error.lock().unwrap().clone();
                    if is_terminal_command && !modified_files.is_empty() {
                        let err_msg = error_keyword.lock().unwrap().clone();
                        
                        let mut acts = activities.lock().unwrap();
                        let act = ActivityRecord {
                            activity_id: format!("act-fix-{}", Uuid::new_v4().to_string().split('-').next().unwrap_or("x")),
                            timestamp: now.to_rfc3339(),
                            activity_type: "error_resolution".to_string(),
                            app_class: "AI Telemetry".to_string(),
                            window_title: format!("Mendiagnosis & Membetulkan Error: {}", extract_document_name(&err_msg)),
                            layout_state: layout_state.clone(),
                            duration_ms: 5000,
                            details: Some(serde_json::json!({
                                "original_error": err_msg,
                                "modified_files_to_fix": modified_files,
                                "resolution_status": "Fixed",
                                "message": "Expert mendiagnosis log kesalahan, memodifikasi berkas konfigurasi/sumber kode, dan berhasil menjalankan kembali layanan pengembang."
                            })),
                        };
                        acts.push(act);

                        // Reset error state
                        error_detected.store(false, Ordering::Relaxed);
                        error_keyword.lock().unwrap().clear();
                        modified_files_during_error.lock().unwrap().clear();
                    }
                }

                // ─── 4. LOG TERMINAL COMMANDS ───
                if current_app_class == "Terminal" {
                    let mut running_cmds = Vec::new();
                    for proc in &current_processes {
                        let proc_lower = proc.to_lowercase();
                        if proc_lower.contains("npm") || proc_lower.contains("node") 
                           || proc_lower.contains("cargo") || proc_lower.contains("docker") 
                           || proc_lower.contains("postgres") || proc_lower.contains("go")
                           || proc_lower.contains("python") {
                            running_cmds.push(proc.clone());
                        }
                    }

                    let mut acts = activities.lock().unwrap();
                    let mut apps_list = unique_apps.lock().unwrap();
                    if !apps_list.contains(&"Terminal".to_string()) {
                        apps_list.push("Terminal".to_string());
                    }

                    let command_desc = if !running_cmds.is_empty() {
                        running_cmds.first().unwrap().clone()
                    } else {
                        "proses shell aktif".to_string()
                    };

                    let act = ActivityRecord {
                        activity_id: format!("act-term-{}", Uuid::new_v4().to_string().split('-').next().unwrap_or("x")),
                        timestamp: now.to_rfc3339(),
                        activity_type: "terminal_command".to_string(),
                        app_class: "Terminal".to_string(),
                        window_title: format!("Terminal — Menjalankan: {}", command_desc),
                        layout_state: layout_state.clone(),
                        duration_ms: 5000,
                        details: Some(serde_json::json!({
                            "active_commands": running_cmds,
                            "environment": "Ubuntu Shell — Wayland session",
                            "activity": "Mengecek logs terminal pengembang"
                        })),
                    };
                    acts.push(act);
                }

                // ─── 5. LOG WEBPAGE RESEARCH (CHROME TAB) ───
                if current_app_class == "Google Chrome" || current_app_class == "Firefox" {
                    let mut acts = activities.lock().unwrap();
                    let mut apps_list = unique_apps.lock().unwrap();
                    
                    if !apps_list.contains(&current_app_class) {
                        apps_list.push(current_app_class.clone());
                    }

                    let act = ActivityRecord {
                        activity_id: format!("act-chrome-{}", Uuid::new_v4().to_string().split('-').next().unwrap_or("x")),
                        timestamp: now.to_rfc3339(),
                        activity_type: classify_activity_type(&current_app_class, &current_window_title_str),
                        app_class: current_app_class.clone(),
                        window_title: current_window_title_str.clone(),
                        layout_state: layout_state.clone(),
                        duration_ms: 5000,
                        details: build_details(&current_app_class, &current_window_title_str),
                    };
                    acts.push(act);

                    let mut cog = cognitive.lock().unwrap();
                    cog.research_phase_count += 1;
                }

                // ─── 6. EFFICIENT GIT SNAPSHOT ───
                if !project_path.is_empty() && !current_git_status.is_empty() {
                    if let Some(mut git_activity) = capture_git_snapshot(&project_path) {
                        git_activity.layout_state = layout_state.clone();
                        let mut acts = activities.lock().unwrap();
                        acts.push(git_activity);
                    }
                }

                // ─── 7. COMPACTION: LIMIT MAX 50 ACTIVITIES ───
                {
                    let mut acts = activities.lock().unwrap();
                    if acts.len() > 50 {
                        let mut compacted = Vec::new();
                        compacted.extend(acts[0..5].to_vec());
                        
                        let start_idx = acts.len() - 40;
                        compacted.extend(acts[start_idx..].to_vec());
                        
                        *acts = compacted;
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

        // Terminate background worker instantly
        let handle = {
            let mut wh = self.worker_handle.lock().unwrap();
            wh.take()
        };
        if let Some(h) = handle {
            let _ = h.join();
        }

        // Get final compact clean activities, then clear cache completely
        let final_activities = {
            let mut acts = self.activities.lock().unwrap();
            let result = acts.clone();
            acts.clear(); // Clear RAM cache immediately
            result
        };

        // Reset state checkers
        {
            self.last_window_title.lock().unwrap().clear();
            self.last_git_hash.lock().unwrap().clear();
            self.last_active_processes.lock().unwrap().clear();
        }
        self.error_detected.store(false, Ordering::Relaxed);
        {
            self.error_keyword.lock().unwrap().clear();
            self.modified_files_during_error.lock().unwrap().clear();
        }

        Some(final_activities)
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

// ── Directory & Process Polling Helper Functions ──

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

// STRICT PROCESS WHITELISTING FILTER (Noise Eliminator)
fn get_strict_whitelisted_processes() -> Vec<String> {
    let output = Command::new("ps")
        .args(["-eo", "comm,args"])
        .output();
    let mut procs = Vec::new();
    
    // Strict Whitelist of Developer Processes
    let whitelist = ["node", "npm", "docker", "docker-compose", "postgres", "cargo", "git", "go", "python", "python3"];
    
    // Blacklisted keywords for Browser Utilities or internal OS helpers
    let blacklist = ["--type=", "chrome-sandbox", "proc/self/exe", "utility-sub-type", "helper", "internal"];

    if let Ok(out) = output {
        let stdout = String::from_utf8_lossy(&out.stdout);
        for line in stdout.lines() {
            let line_lower = line.to_lowercase();
            
            // Check whitelist matching
            let is_whitelisted = whitelist.iter().any(|&w| line_lower.contains(w));
            // Check blacklist rejection
            let is_blacklisted = blacklist.iter().any(|&b| line_lower.contains(b));

            if is_whitelisted && !is_blacklisted {
                procs.push(line.trim().to_string());
            }
        }
    }
    
    // Limit output length and remove internal duplicates to prevent RAM blow up
    procs.truncate(15);
    procs
}

// WAYLAND CHROME SQLITE HISTORY POLLER (CHOOSES NEWEST PROFILE DYNAMICALLY)
fn get_recent_chrome_tab() -> Option<(String, String)> {
    let py_cmd = r#"
import sqlite3, shutil, os, glob
history_paths = glob.glob(os.path.expanduser('~/.config/google-chrome/*/History'))
if not history_paths:
    history_paths = [os.path.expanduser('~/.config/google-chrome/Default/History')]

try:
    # Find the History file with the latest modification time (most active profile)
    latest_history = max(history_paths, key=os.path.getmtime) if history_paths else None
    if latest_history and os.path.exists(latest_history):
        temp_path = '/tmp/chrome_history_temp'
        shutil.copyfile(latest_history, temp_path)
        conn = sqlite3.connect(temp_path)
        cursor = conn.cursor()
        cursor.execute("SELECT title, url FROM urls ORDER BY last_visit_time DESC LIMIT 1")
        row = cursor.fetchone()
        conn.close()
        os.remove(temp_path)
        if row and row[0].strip():
            print(f"{row[0]}|||{row[1]}")
except Exception as e:
    pass
"#;

    let output = Command::new("python3")
        .args(["-c", py_cmd])
        .output();

    if let Ok(out) = output {
        let stdout = String::from_utf8_lossy(&out.stdout).to_string();
        if stdout.contains("|||") {
            let parts: Vec<&str> = stdout.split("|||").collect();
            if parts.len() >= 2 {
                return Some((parts[0].trim().to_string(), parts[1].trim().to_string()));
            }
        }
    }
    None
}

// GTK RECENT FILES XML POLLER (WAYLAND DOCUMENT DETECTION FALLBACK)
fn get_recent_document_xbel() -> Option<(String, String)> {
    let py_cmd = r#"
import xml.etree.ElementTree as ET
import os
from datetime import datetime, timezone
import urllib.parse

xbel_path = os.path.expanduser('~/.local/share/recently-used.xbel')
if os.path.exists(xbel_path):
    try:
        tree = ET.parse(xbel_path)
        root = tree.getroot()
        bookmarks = []
        for b in root.findall('.//bookmark') or root.findall('{http://www.freedesktop.org/standards/desktop-bookmarks}bookmark') or root:
            href = b.get('href')
            modified = b.get('modified')
            if href and modified:
                # filter document types
                ext = os.path.splitext(href)[1].lower().split('?')[0]
                if ext in ['.docx', '.xlsx', '.pdf', '.odt', '.ods', '.csv', '.doc', '.xls']:
                    bookmarks.append((href, modified))
        if bookmarks:
            def parse_time(t_str):
                t_str = t_str.replace('Z', '+00:00')
                return datetime.fromisoformat(t_str)
            
            bookmarks.sort(key=lambda x: parse_time(x[1]), reverse=True)
            latest_href, latest_time_str = bookmarks[0]
            latest_time = parse_time(latest_time_str)
            
            # Check if it was opened in the last 15 seconds
            now = datetime.now(timezone.utc)
            diff = (now - latest_time).total_seconds()
            if diff < 15:
                name = os.path.basename(latest_href)
                name_unescaped = urllib.parse.unquote(name)
                print(f"{name_unescaped}|||{latest_href}")
    except Exception as e:
        pass
"#;

    let output = Command::new("python3")
        .args(["-c", py_cmd])
        .output();

    if let Ok(out) = output {
        let stdout = String::from_utf8_lossy(&out.stdout).to_string();
        if stdout.contains("|||") {
            let parts: Vec<&str> = stdout.split("|||").collect();
            if parts.len() >= 2 {
                return Some((parts[0].trim().to_string(), parts[1].trim().to_string()));
            }
        }
    }
    None
}

fn get_git_status_output(project_dir: &str) -> String {
    if project_dir.is_empty() {
        return String::new();
    }
    Command::new("git")
        .args(["-C", project_dir, "status", "--porcelain"])
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default()
}

fn get_active_window_info() -> (String, String, String) {
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
        Err(_) => return (String::new(), String::new(), String::new()),
    };

    if win_id.is_empty() || win_id == "0x0" {
        return (String::new(), String::new(), String::new());
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

    (wm_name, wm_class, win_id)
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

    if class_lower.contains("code") || class_lower.contains("vscodium") || class_lower.contains("antigravity") {
        if class_lower.contains("antigravity") {
            "Antigravity".to_string()
        } else {
            "VS Code".to_string()
        }
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
    } else if class_lower.contains("libreoffice") || class_lower.contains("soffice")
        || class_lower.contains("wps") || class_lower.contains("word")
        || class_lower.contains("excel") || class_lower.contains("powerpnt")
    {
        "LibreOffice".to_string()
    } else if class_lower.contains("terminal") || class_lower.contains("gnome-terminal")
        || class_lower.contains("kitty") || class_lower.contains("alacritty")
        || class_lower.contains("konsole") || class_lower.contains("xterm")
        || class_lower.contains("tilix") || class_lower.contains("warp")
    {
        "Terminal".to_string()
    } else if class_lower.contains("docker") {
        "Docker Desktop".to_string()
    } else if !wm_class.is_empty() {
        wm_class.to_string()
    } else {
        "Unknown".to_string()
    }
}

fn is_document_window(app_class: &str, window_title: &str) -> bool {
    let app_lower = app_class.to_lowercase();
    let title_lower = window_title.to_lowercase();
    
    app_lower.contains("libreoffice") 
        || app_lower.contains("soffice") 
        || app_lower.contains("wps") 
        || app_lower.contains("word") 
        || app_lower.contains("excel") 
        || app_lower.contains("powerpnt")
        || app_lower.contains("pdf")
        || app_lower.contains("evince")
        || app_lower.contains("document-viewer")
        || title_lower.contains(".docx")
        || title_lower.contains(".xlsx")
        || title_lower.contains(".odt")
        || title_lower.contains(".ods")
        || title_lower.contains(".pdf")
        || title_lower.contains("google docs")
        || title_lower.contains("google sheets")
        || title_lower.contains("microsoft 365")
}

fn extract_document_name(window_title: &str) -> String {
    let title = window_title.trim();
    if let Some(pos) = title.find(" - ") {
        title[..pos].to_string()
    } else {
        title.to_string()
    }
}

fn classify_activity_type(app_class: &str, window_title: &str) -> String {
    let title_lower = window_title.to_lowercase();
    if is_document_window(app_class, window_title) {
        "document_view".to_string()
    } else {
        match app_class {
            "VS Code" | "Antigravity" => {
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
        "VS Code" | "Antigravity" => Some(serde_json::json!({
            "file_hint": window_title.split(" — ").next().unwrap_or("").trim()
        })),
        "Terminal" => Some(serde_json::json!({
            "terminal_title": window_title
        })),
        "Figma" | "Figma (Chrome)" => Some(serde_json::json!({
            "design_file": window_title
        })),
        "LibreOffice" => Some(serde_json::json!({
            "document_title": extract_document_name(window_title)
        })),
        _ => None,
    }
}

fn get_screen_dimensions() -> (u32, u32) {
    if let Ok(output) = Command::new("xwininfo").arg("-root").output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut width = 1920;
        let mut height = 1080;
        for line in stdout.lines() {
            let line = line.trim();
            if line.starts_with("Width:") {
                if let Some(w) = line.split(':').nth(1).and_then(|s| s.trim().parse::<u32>().ok()) {
                    width = w;
                }
            } else if line.starts_with("Height:") {
                if let Some(h) = line.split(':').nth(1).and_then(|s| s.trim().parse::<u32>().ok()) {
                    height = h;
                }
            }
        }
        return (width, height);
    }
    (1920, 1080)
}

fn get_window_geometry(win_id: &str) -> Option<(i32, i32, u32, u32)> {
    if win_id.is_empty() || win_id == "0x0" {
        return None;
    }
    let output = Command::new("xwininfo")
        .args(["-id", win_id])
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    
    let mut x = None;
    let mut y = None;
    let mut width = None;
    let mut height = None;
    
    for line in stdout.lines() {
        let line = line.trim();
        if line.starts_with("Absolute upper-left X:") {
            x = line.split(':').nth(1).and_then(|s| s.trim().parse::<i32>().ok());
        } else if line.starts_with("Absolute upper-left Y:") {
            y = line.split(':').nth(1).and_then(|s| s.trim().parse::<i32>().ok());
        } else if line.starts_with("Width:") {
            width = line.split(':').nth(1).and_then(|s| s.trim().parse::<u32>().ok());
        } else if line.starts_with("Height:") {
            height = line.split(':').nth(1).and_then(|s| s.trim().parse::<u32>().ok());
        }
    }
    
    match (x, y, width, height) {
        (Some(x), Some(y), Some(w), Some(h)) => Some((x, y, w, h)),
        _ => None,
    }
}

fn determine_layout_state(focused_app: &str, win_id: &str) -> LayoutState {
    let (screen_w, screen_h) = get_screen_dimensions();
    
    if !win_id.is_empty() && win_id != "0x0" {
        if let Some((x, y, w, h)) = get_window_geometry(win_id) {
            let screen_mode = if w >= screen_w - 150 && h >= screen_h - 150 {
                "maximized".to_string()
            } else if w <= screen_w / 2 + 150 {
                if x <= 150 {
                    "left-half".to_string()
                } else if x >= (screen_w / 2) as i32 - 150 {
                    "right-half".to_string()
                } else {
                    "overlapping".to_string()
                }
            } else {
                "overlapping".to_string()
            };

            let organization_score = match screen_mode.as_str() {
                "maximized" => "Fokus Tunggal (Maximized)".to_string(),
                "left-half" => "Teratur (Split-Screen Kiri)".to_string(),
                "right-half" => "Teratur (Split-Screen Kanan)".to_string(),
                _ => "Acak-acakan (Overlapping)".to_string(),
            };

            let (left_app, right_app) = match screen_mode.as_str() {
                "left-half" => (Some(focused_app.to_string()), Some("Chrome/Dokumen (background)".to_string())),
                "right-half" => (Some("Chrome/Dokumen (background)".to_string()), Some(focused_app.to_string())),
                _ => (None, None),
            };

            let split_ratio = match screen_mode.as_str() {
                "left-half" | "right-half" => {
                    let ratio = (w as f32 / screen_w as f32 * 100.0) as u32;
                    format!("{}:{}", ratio, 100 - ratio)
                }
                "maximized" => "100:0".to_string(),
                _ => "60:40".to_string(),
            };

            return LayoutState {
                focused_app: focused_app.to_string(),
                screen_mode,
                left_window_app: left_app,
                right_window_app: right_app,
                split_ratio,
                organization_score,
            };
        }
    }

    // Wayland Fallback: Synthesize layout based on process and recent active cues
    let mut left_window_app = None;
    let mut right_window_app = None;
    let mut split_ratio = "100:0".to_string();
    let mut screen_mode = "maximized".to_string();
    let mut organization_score = "Fokus Tunggal (Maximized)".to_string();

    if focused_app == "VS Code" || focused_app == "Antigravity" {
        left_window_app = Some("Google Chrome (background)".to_string());
        right_window_app = Some(focused_app.to_string());
        split_ratio = "50:50".to_string();
        screen_mode = "right-half".to_string();
        organization_score = "Teratur (Split-Screen Kanan)".to_string();
    } else if focused_app == "Google Chrome" || focused_app == "LibreOffice" {
        left_window_app = Some(focused_app.to_string());
        right_window_app = Some("VS Code (background)".to_string());
        split_ratio = "50:50".to_string();
        screen_mode = "left-half".to_string();
        organization_score = "Teratur (Split-Screen Kiri)".to_string();
    }

    LayoutState {
        focused_app: focused_app.to_string(),
        screen_mode,
        left_window_app,
        right_window_app,
        split_ratio,
        organization_score,
    }
}

fn capture_git_snapshot(project_dir: &str) -> Option<ActivityRecord> {
    let status_str = get_git_status_output(project_dir);
    if status_str.is_empty() {
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
            organization_score: "Latar Belakang (Git)".to_string(),
        },
        duration_ms: 0,
        details: Some(serde_json::json!({
            "changed_files": changed_files,
            "diff_stat": diff_output.trim(),
            "status_raw": status_str
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
