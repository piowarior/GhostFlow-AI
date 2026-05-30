/**
 * Session Storage Service
 * Manages persistent storage of recording sessions to prevent data loss
 */

export interface StoredSession {
  id: string;
  title: string;
  description: string;
  mode: 'expert' | 'junior';
  timestamp: string;
  project_dir: string;
  is_recording: boolean;
  last_updated: string;
  activities: any[];
  cognitive_signals: any;
}

const STORAGE_KEY = 'ghostflow_sessions';
const ACTIVE_SESSION_KEY = 'ghostflow_active_session';

export const SessionStorage = {
  /**
   * Save session to localStorage (auto-backup)
   */
  saveSession(session: StoredSession): void {
    try {
      const sessions = SessionStorage.getAllSessions();
      const existingIndex = sessions.findIndex(s => s.id === session.id);
      
      if (existingIndex >= 0) {
        sessions[existingIndex] = {
          ...sessions[existingIndex],
          ...session,
          last_updated: new Date().toISOString(),
        };
      } else {
        sessions.push({
          ...session,
          last_updated: new Date().toISOString(),
        });
      }
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch (e) {
      console.warn('Failed to save session to localStorage:', e);
    }
  },

  /**
   * Get all stored sessions
   */
  getAllSessions(): StoredSession[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.warn('Failed to load sessions from localStorage:', e);
      return [];
    }
  },

  /**
   * Get specific session by ID
   */
  getSession(sessionId: string): StoredSession | null {
    const sessions = SessionStorage.getAllSessions();
    return sessions.find(s => s.id === sessionId) || null;
  },

  /**
   * Delete session
   */
  deleteSession(sessionId: string): void {
    try {
      const sessions = SessionStorage.getAllSessions();
      const filtered = sessions.filter(s => s.id !== sessionId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    } catch (e) {
      console.warn('Failed to delete session:', e);
    }
  },

  /**
   * Clear all sessions
   */
  clearAllSessions(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to clear sessions:', e);
    }
  },

  /**
   * Set active recording session (for recovery on reload)
   */
  setActiveSession(sessionId: string | null): void {
    try {
      if (sessionId) {
        localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
      } else {
        localStorage.removeItem(ACTIVE_SESSION_KEY);
      }
    } catch (e) {
      console.warn('Failed to set active session:', e);
    }
  },

  /**
   * Get active session ID (for recovery)
   */
  getActiveSessionId(): string | null {
    try {
      return localStorage.getItem(ACTIVE_SESSION_KEY);
    } catch (e) {
      console.warn('Failed to get active session:', e);
      return null;
    }
  },

  /**
   * Auto-save activities periodically during recording
   */
  updateSessionActivities(sessionId: string, activities: any[], cognitiveSignals: any): void {
    try {
      const session = SessionStorage.getSession(sessionId);
      if (session) {
        SessionStorage.saveSession({
          ...session,
          activities,
          cognitive_signals: cognitiveSignals,
          last_updated: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn('Failed to update session activities:', e);
    }
  },

  /**
   * Export session to JSON file
   */
  exportSessionToFile(session: StoredSession): void {
    try {
      const dataStr = JSON.stringify(session, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ghostflow-session-${session.id}-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('Failed to export session:', e);
    }
  },

  /**
   * Import session from JSON file
   */
  importSessionFromFile(file: File): Promise<StoredSession | null> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const session = JSON.parse(content) as StoredSession;
          SessionStorage.saveSession(session);
          resolve(session);
        } catch (err) {
          console.warn('Failed to import session:', err);
          resolve(null);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    });
  },
};
