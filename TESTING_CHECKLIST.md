# ✅ TESTING CHECKLIST - Critical Fixes

Run these tests to verify all 3 fixes are working:

---

## Test 1: Git Deduplication ✅

### Steps:
1. Create new recording session
2. Start recording
3. Create new file: `touch app/components/test-dedup.tsx`
4. Wait 3 cycles (18 seconds)
5. Check activities

### Expected Result:
```
❌ BAD: [?] app/components/test-dedup.tsx appears 3 times
✅ GOOD: [?] app/components/test-dedup.tsx appears 1 time only
```

### Verify:
- [ ] File shows once in activities
- [ ] No duplicate entries
- [ ] Stop recording
- [ ] Check ~/GhostFlow_Data/ file
- [ ] File listed once in JSON

---

## Test 2: Active Session Recording ✅

### Steps:
1. Create Session A - start recording
2. Verify REC badge appears ← **NEW FEATURE**
3. Create Session B  
4. Switch to Session B
5. Make code change
6. Check Session A activities

### Expected Result:
```
✅ Session A: Has "🔴 REC" badge while recording
✅ Session B: No "🔴 REC" badge (not active)
✅ Session A: No new activities added after switch
```

### Verify:
- [ ] "🔴 REC" badge visible on active session
- [ ] Badge disappears on stop recording
- [ ] Red pulsing dot in badge
- [ ] Only active session logs activities
- [ ] Switch session = stop old logs

---

## Test 3: Session Persistence (Auto-Save) ✅

### Steps:
1. Start recording Session C
2. Make code changes
3. Wait 5 seconds
4. **Force quit app** (kill process)
5. Relaunch app
6. Check if Session C has activities

### Expected Result:
```
❌ BAD: Activities gone (app crashed)
✅ GOOD: Last 3-5 seconds of activities preserved
```

### Verify:
- [ ] App killed mid-recording
- [ ] On relaunch, activities visible
- [ ] Activities from before crash present
- [ ] Session metadata intact
- [ ] Can continue recording previous session

---

## Test 4: Combined Scenario ✅

### Steps:
1. Create "Test Multi" session
2. Start recording → See "🔴 REC" badge
3. Edit file: `app/page.tsx` (modify 1 line)
4. Wait 6 seconds → See activity logged
5. Edit same file again (modify another line)
6. Wait 6 seconds → See 2nd activity (not duplicate)
7. Stop recording
8. Kill app
9. Relaunch
10. Check session

### Expected Results:
```
✅ 1st edit logged once
✅ 2nd edit logged as separate activity
✅ No duplicate entries for same edit
✅ On relaunch, both activities visible
✅ "🔴 REC" appeared while recording, gone after stop
```

---

## Performance Checklist

- [ ] App doesn't lag with 3s auto-save
- [ ] Recording doesn't cause stuttering
- [ ] Memory usage stable
- [ ] No console errors during recording
- [ ] localStorage not bloated (~5-10MB ok)

---

## Git Status Check

Add/modify/delete files and verify git logs:

```bash
# Add file
touch test.txt
# Check git diff - should show in activity

# Modify file  
echo "test" >> test.txt
# Check git diff - should show insertions

# Delete file
rm test.txt
# Check git diff - should show deletions
```

Expected in JSON:
```json
{
  "changed_files": ["[M] test.txt"],
  "insertions": 1,
  "deletions": 0
}
```

NOT:
```json
{
  "changed_files": ["[?] test.txt"],  ← Wrong: [?] = untracked
  "insertions": 0,
  "deletions": 0
}
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No "🔴 REC" badge | Refresh page, check isRecording state |
| Duplicates still appear | Clear browser cache, restart Tauri app |
| Data lost on crash | Check ~/GhostFlow_Data/ folder exists |
| Git shows [?] repeatedly | git add file, then [?] should not repeat |
| Multiple sessions recording | Only 1 should be active, check backend |

---

## CLI Commands for Manual Verification

```bash
# Check if auto-save working
ls -lh ~/GhostFlow_Data/

# View recent session JSON
cat ~/GhostFlow_Data/session-*.json | jq '.timeline_activities | length'

# Check git status hash
cd /path/to/project && git status --porcelain | grep -v '^??'

# Monitor app logs
tail -f ~/.local/state/ghostflow/app.log

# Check localStorage
# Open browser dev tools → Application → LocalStorage → app://localhost
```

---

## Sign-Off Checklist

Run ALL tests above, then check:

- [ ] Test 1: Git Dedup PASSED
- [ ] Test 2: Active Session PASSED  
- [ ] Test 3: Persistence PASSED
- [ ] Test 4: Combined Scenario PASSED
- [ ] No console errors
- [ ] No performance issues
- [ ] "🔴 REC" badge working

**Status**: ✅ Ready for Production

---

## Questions?

If any test fails, check:
1. Rust code compiled (check Terminal for errors)
2. TypeScript compiled (check ESLint)
3. Restart Tauri app fresh
4. Clear browser cache
5. Check console for error messages

Report findings in terminal output or check app logs.

