# 🚨 CRITICAL FIXES - Session Data Loss & Git Duplication

## Issue 1: Data Log Ilang Saat Restart
**Problem**: 
- Activities stored in memory (Rust) tidak tersimpan ke file ketika app restart
- Data hilang jika:
  - Menutup app saat recording
  - Extract gagal / hang
  - Matikan recoding & buka ulang

**Root Cause**:
- Activities hanya tersimpan di RAM (Rust `Arc<Mutex>`)
- File hanya di-save saat `stop_recording()` atau setiap polling (6 detik)
- Tidak ada auto-save ke disk saat exit

**Solution**: 
✅ **Implement Active Session Tracking + Periodic Flush to Disk**

---

## Issue 2: Git Detection Terus Berulang ([?])
**Problem**:
```json
{
  "changed_files": ["[?] app/components/testinganu.tsx"],
  "insertions": 0,
  "deletions": 0
}
```
- File baru (untracked) ditampilkan terus menerus
- Tidak ada perubahan `insertions/deletions` tapi tetap ter-log
- Git status `??` = untracked (belum di-add ke git)

**Root Cause**:
- `get_git_status_output()` return untracked files even if not changed
- State deduplication di Rust melihat `git_status` berbeda, padahal seharusnya sama
- Untracked files tidak punya real "changes", hanya kehadiran

**Solution**:
✅ **Improve Git Status Hashing**:
- Hash hanya file yang sudah tracked & berubah
- Ignore untracked files dalam state comparison
- Jika ada untracked baru, log 1x saja, lalu ignore sampai benar-benar ada perubahan

---

## Issue 3: Multiple Sessions Recording
**Problem**:
- Klik session A → start recording → lalu klik session B
- Session B ikutan record padahal session A yang aktif
- Seharusnya hanya 1 session yang active record dengan logo "REC"

**Root Cause**:
- Backend (`TelemetryEngine`) global, tidak per-session
- Saat start recording, tidak ada marker "session mana yang aktif"
- Poll activities tidak tahu session mana yang harus diupdate

**Solution**:
✅ **Track Active Session ID di Backend**:
- Backend perlu tahu session_id mana yang aktif
- Saat `start_recording(session_id)` → set global active session
- Saat poll, append activities hanya ke active session
- Hanya session dengan active_id yang get logo REC

---

## Implementation Plan

### Fix 1: Session Persistence (Data Loss Prevention)
```typescript
// app/page.tsx - dalam recording loop

// Auto-save to disk setiap 3 detik
useEffect(() => {
  if (!isRecording || !selectedSessionId) return;
  
  const saveInterval = setInterval(() => {
    const currentSession = sessions.find(s => s.id === selectedSessionId);
    if (currentSession) {
      saveSessionToDisk(currentSession); // Save every 3s
    }
  }, 3000);
  
  return () => clearInterval(saveInterval);
}, [isRecording, selectedSessionId, sessions]);
```

### Fix 2: Git Status Deduplication
```rust
// src-tauri/src/lib.rs

// Hash only CHANGED tracked files, ignore untracked
fn get_git_status_hash(project_path: &str) -> String {
    let status = get_git_status_output(project_path);
    
    // Parse status to extract ONLY modified files (M, A, D, R)
    // Ignore ?? (untracked) dalam hash
    let changed_lines: Vec<&str> = status
        .lines()
        .filter(|line| {
            !line.starts_with("??") && (
                line.starts_with("M ") ||
                line.starts_with("A ") ||
                line.starts_with("D ") ||
                line.starts_with("R ") ||
                line.starts_with("MM ") ||
                line.starts_with("AM ")
            )
        })
        .collect();
    
    // Hash only changed files, not untracked
    format!("{:?}", changed_lines)
}
```

### Fix 3: Active Session Tracking
```rust
// src-tauri/src/lib.rs

pub struct TelemetryEngine {
    activities: Arc<Mutex<Vec<ActivityRecord>>>,
    active_session_id: Arc<Mutex<Option<String>>>, // NEW
    // ... rest
}

#[tauri::command]
fn start_recording(
    state: tauri::State<'_, Arc<TelemetryEngine>>,
    mode: String,
    project_dir: String,
    session_id: String, // NEW parameter
) -> Result<(), String> {
    let engine = state.as_ref();
    *engine.active_session_id.lock().unwrap() = Some(session_id); // Set active
    // ... rest of start_recording
}
```

---

## Expected Outcome

✅ **Data Loss Prevention**:
- Even if app crash, last 3s of data saved to disk
- On reload, can recover last activities

✅ **No More Duplicate Git Logs**:
- Untracked files with `??` logged max 1x per session
- Only ACTUAL file changes trigger new logs
- JSON responses show clean `insertions/deletions` counts

✅ **Single Active Session**:
- Only selected session get logo REC
- Other sessions frozen (gak nambah log)
- Switch session = stop old, start new cleanly

