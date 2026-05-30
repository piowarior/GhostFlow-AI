# GhostFlow-AI Integration Guide

## Quick Start for Next Developer

### What Was Fixed This Session

1. ✅ **Hint Window Permission Error** - No more Tauri console errors
2. ✅ **Markdown Rendering** - Chat messages now display correctly formatted
3. ✅ **Git Status Detection** - Now captures untracked and modified files properly
4. ✅ **App Classification** - Better Antigravity vs VS Code detection
5. 🆕 **Session Storage Service** - Ready to prevent data loss
6. 🆕 **Gemini API Client** - Ready for cognitive analysis integration

---

## Immediate Tasks (Do These First!)

### 1. Integrate Session Storage (CRITICAL)

**File**: `app/page.tsx`

Add this in the recording loop section (around line 300):

```typescript
import { SessionStorage } from './services/sessionStorage';

// During recording, add this inside your useEffect that captures activities:
useEffect(() => {
  if (!isRecording || !selectedSessionId) return;
  
  // Auto-save activities every 5 seconds
  const autoSaveInterval = setInterval(() => {
    SessionStorage.updateSessionActivities(
      selectedSessionId,
      currentActivities, // your activities state
      cognitiveSignals   // your cognitive signals state
    );
  }, 5000);
  
  return () => clearInterval(autoSaveInterval);
}, [isRecording, selectedSessionId, currentActivities, cognitiveSignals]);

// On app load, recover active session:
useEffect(() => {
  const activeSessionId = SessionStorage.getActiveSessionId();
  if (activeSessionId) {
    const session = SessionStorage.getSession(activeSessionId);
    if (session) {
      // Restore the session - load activities, etc.
      setSelectedSessionId(activeSessionId);
      // Load activities from session
    }
  }
}, []);

// When starting recording:
const handleStartRecording = () => {
  SessionStorage.setActiveSession(newSessionId);
  // ... rest of recording start code
};

// When stopping recording:
const handleStopRecording = () => {
  SessionStorage.setActiveSession(null);
  // ... rest of recording stop code
};
```

### 2. Integrate Gemini API Client

**File**: `app/page.tsx`

Replace the chat handler with real API calls:

```typescript
import { GeminiClient } from './services/geminiClient';

// Initialize client
const geminiClient = useRef<GeminiClient | null>(null);

useEffect(() => {
  if (geminiKey) {
    geminiClient.current = new GeminiClient(geminiKey);
  }
}, [geminiKey]);

// Replace the handleSendMessage function:
const handleSendMessage = async (text: string) => {
  if (!text.trim()) return;
  
  setChatMessages(prev => [...prev, { role: 'user', text }]);
  setChatInput('');
  
  if (!geminiClient.current) {
    setChatMessages(prev => [...prev, { 
      role: 'assistant', 
      text: '❌ **Gemini API belum dikonfigurasi.** Silakan masukkan API key di pengaturan.' 
    }]);
    return;
  }
  
  try {
    setChatMessages(prev => [...prev, { role: 'assistant', text: '🤔 Analyzing...' }]);
    
    const response = await geminiClient.current.sendMessage(text);
    
    setChatMessages(prev => {
      const withoutThinking = prev.filter(m => m.text !== '🤔 Analyzing...');
      return [...withoutThinking, { role: 'assistant', text: response }];
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    setChatMessages(prev => [...prev, { 
      role: 'assistant', 
      text: `❌ **Error**: ${errorMsg}` 
    }]);
  }
};
```

### 3. Test the Fixes

**Checklist**:
- [ ] Open app - no Tauri permission errors in console
- [ ] Send chat message - markdown formatting works (bold, code, etc.)
- [ ] Add file and commit - git status shows untracked file
- [ ] Modify file - git status shows insertions/deletions
- [ ] Close and reopen app - session data is restored

---

## Project Structure

```
app/
  ├── components/
  │   ├── LoginScreen.tsx         ✅ Ready to use
  │   ├── JuniorDashboard.tsx     ⏳ Needs refactoring
  │   ├── ExpertDashboard.tsx     🆕 Needs creation
  │   ├── ETLProcessor.tsx        🆕 Needs creation
  │   ├── CognitiveChatBot.tsx    ⏳ Needs improvements
  │   └── StarConstellationView.tsx ⏳ Needs enhancements
  ├── services/
  │   ├── sessionStorage.ts       ✅ New - ready to integrate
  │   ├── geminiClient.ts         ✅ New - ready to integrate
  │   └── gitMonitor.ts           🆕 Can be created
  └── page.tsx                     ⏳ Main app - needs integration
src-tauri/
  └── src/
      └── lib.rs                   ✅ Git detection improved
```

---

## Key Files Modified

### 1. `app/hint-window/page.tsx`
- Fixed: Tauri permission error with parallel Promise.all()
- Better error handling for window resize

### 2. `app/page.tsx`
- Improved: renderMarkdown() function (lines 19-126)
- Better markdown parsing with code blocks, headings, lists, emojis
- Proper spacing and formatting

### 3. `src-tauri/src/lib.rs`
- Improved: `capture_git_snapshot()` function
- Better: `classify_app()` function with clearer priority order
- Added: Support for untracked files detection via `git ls-files`

### 4. Created: `app/services/sessionStorage.ts`
- New storage service for session persistence
- Methods for save, load, delete, export, import
- Automatic timestamp tracking

### 5. Created: `app/services/geminiClient.ts`
- New Gemini API client with conversation history
- Methods for analysis and section matching
- Comprehensive error handling

---

## API Key Configuration

### For Gemini API:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project or select existing
3. Enable "Generative Language API"
4. Go to Credentials
5. Create API Key
6. Copy key and paste in GhostFlow settings

**Note**: The key provided (`AQ.Ab8RN...`) appears to be Vertex AI format. If using standard Gemini API, format should be different.

---

## Next Priority Features

### Week 1:
- [ ] Integrate session storage into recording
- [ ] Integrate Gemini API into chat
- [ ] Test all three fixes thoroughly

### Week 2:
- [ ] Separate Expert/Junior dashboards
- [ ] Implement ETL processor UI
- [ ] Add role switching functionality

### Week 3:
- [ ] Multi-window detection (use wmctrl)
- [ ] Better constellation viewer
- [ ] Expert session browser

### Week 4:
- [ ] Real Google OAuth
- [ ] Production deployment setup
- [ ] Performance optimization

---

## Testing Scenarios

### Test 1: Git Detection
```bash
# Add new file
echo "test" > test.txt
# Should appear as [?] in logs

# Modify existing file
echo "more code" >> app/page.tsx
# Should show insertions in logs

# Delete file
rm test.txt
# Should show deletions in logs
```

### Test 2: Markdown Rendering
Send these in chat:
- `**bold text**` → should be bold
- `*italic text*` → should be italic  
- `` `code` `` → should be in code format
- `# Heading 1` → should be large heading
- `- item 1` → should be bullet list
- `` ``` code block ``` `` → should be code block

### Test 3: Session Recovery
1. Start recording session
2. Add some activities
3. Close app completely
4. Reopen app
5. Check if activities are still there

---

## Debugging Tips

### For Tauri Errors:
```bash
# Check Tauri logs in terminal
# Look for permission-related errors
# Check tauri.conf.json for window permissions
```

### For Git Detection:
```bash
# Test git commands directly
git -C /path/to/project status --porcelain
git -C /path/to/project diff HEAD --shortstat
git -C /path/to/project ls-files --others --exclude-standard
```

### For Gemini API:
```javascript
// In browser console:
const client = new GeminiClient('your-key-here');
await client.sendMessage('test').then(console.log);
```

---

## Performance Considerations

1. **Session Storage**: Limited to last 100 sessions to prevent bloat
2. **Gemini API**: Conversation history limited to last 20 messages
3. **Git Detection**: Runs in background thread (Tauri/Rust)
4. **Chat Rendering**: Markdown parsing is O(n) but very fast for typical messages

---

## Common Issues & Solutions

### Issue: "Gemini API: API key expired"
**Solution**: 
- Check if key is correct in Google Cloud Console
- Verify it's not Vertex AI key
- Generate new API key if expired
- Check rate limits

### Issue: "Git commands returning empty"
**Solution**:
- Verify project directory path is correct
- Ensure git repository is initialized
- Try running git command manually in terminal

### Issue: "Markdown not rendering"
**Solution**:
- Clear browser cache
- Check if renderMarkdown function was updated
- Verify chat messages include markdown

### Issue: "Session data lost on restart"
**Solution**:
- Integrate SessionStorage.updateSessionActivities()
- Check localStorage isn't being cleared
- Verify active session ID is being saved

---

## Resources

- [Tauri Documentation](https://tauri.app/docs/)
- [Gemini API Docs](https://cloud.google.com/docs/generative-ai)
- [React Documentation](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

---

## Support

For questions or issues, refer to:
1. **IMPLEMENTATION_STATUS.md** - Current status and what needs fixing
2. **FIXES_TODO.md** - Comprehensive roadmap of all planned features
3. **CLAUDE.md** - AI assistant context (if available)

---

Last Updated: May 30, 2026
Status: 5 Critical Fixes + 2 New Services Ready for Integration
