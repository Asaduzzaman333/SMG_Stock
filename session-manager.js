// Session Manager - Handles persistent authentication
export class SessionManager {
  constructor() {
    this.sessionCheckInterval = null;
    this.sessionRefreshInterval = null;
    this.sessionCheckTimeout = 15 * 60 * 1000; // Check every 15 minutes
    this.sessionRefreshTimeout = 12 * 60 * 60 * 1000; // Refresh every 12 hours
    this.currentUser = null;
    this.isInitialized = false;
    this.storageKey = "smg_session_init";
  }

  /**
   * Initialize session with auto-refresh
   */
  async initialize() {
    if (this.isInitialized) {
      return this.currentUser;
    }

    try {
      const { user } = await this._request("/api/auth");
      this.currentUser = user;
      this.isInitialized = true;
      if (user) {
        this._setSessionFlag();
        this._startSessionMonitoring();
      }
      return user;
    } catch (error) {
      this.isInitialized = true; // Mark as initialized even on error to prevent retries
      if (error.status === 401) {
        this._clearSessionFlag();
        return null;
      }
      throw error;
    }
  }

  /**
   * Track session initialization flag in localStorage
   */
  _setSessionFlag() {
    try {
      window.localStorage.setItem(this.storageKey, "true");
    } catch {
      // localStorage might be blocked in some environments
    }
  }

  /**
   * Clear session initialization flag
   */
  _clearSessionFlag() {
    try {
      window.localStorage.removeItem(this.storageKey);
    } catch {
      // localStorage might be blocked
    }
  }

  /**
   * Check if session was previously initialized
   */
  _hadSession() {
    try {
      return window.localStorage.getItem(this.storageKey) === "true";
    } catch {
      return false;
    }
  }

  /**
   * Get current authenticated user
   */
  getCurrentUser() {
    return this.currentUser;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return !!this.currentUser;
  }

  /**
   * Verify session is still valid and refresh if needed
   */
  async verifySession() {
    try {
      const { user } = await this._request("/api/auth");
      this.currentUser = user;
      return user;
    } catch (error) {
      if (error.status === 401) {
        this.currentUser = null;
        this.isInitialized = false;
        this._clearSessionFlag();
        return null;
      }
      throw error;
    }
  }

  /**
   * Logout and clear session
   */
  async logout() {
    try {
      await this._request("/api/auth", { method: "DELETE" });
    } finally {
      this.currentUser = null;
      this.isInitialized = false;
      this._clearSessionFlag();
      this._stopSessionMonitoring();
    }
  }

  /**
   * Require authentication or redirect
   */
  async requireAuth(redirectTo = "/login") {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.currentUser) {
      return this.currentUser;
    }

    // Not authenticated, redirect to login
    window.location.replace(redirectTo);
    throw new Error("Authentication required");
  }

  /**
   * Start monitoring session validity and refresh periodically
   */
  _startSessionMonitoring() {
    this._stopSessionMonitoring();

    // Verify session periodically
    this.sessionCheckInterval = window.setInterval(async () => {
      try {
        await this.verifySession();
      } catch (error) {
        console.error("Session verification error:", error);
        // On error, check session once more with retry
        try {
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
          await this.verifySession();
        } catch {
          // Stop background checks; the next protected request will decide whether to redirect.
          this.currentUser = null;
          this._stopSessionMonitoring();
        }
      }
    }, this.sessionCheckTimeout);

    // Refresh session periodically to prevent expiration
    this.sessionRefreshInterval = window.setInterval(async () => {
      try {
        const { user } = await this._request("/api/auth", { method: "PATCH" });
        if (user) {
          this.currentUser = user;
        }
      } catch (error) {
        console.error("Session refresh error:", error);
        // If refresh fails, verify the session is still valid
        await this.verifySession();
      }
    }, this.sessionRefreshTimeout);
  }

  /**
   * Stop monitoring session
   */
  _stopSessionMonitoring() {
    if (this.sessionCheckInterval) {
      window.clearInterval(this.sessionCheckInterval);
      this.sessionCheckInterval = null;
    }
    if (this.sessionRefreshInterval) {
      window.clearInterval(this.sessionRefreshInterval);
      this.sessionRefreshInterval = null;
    }
  }

  /**
   * Make authenticated request
   */
  async _request(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(data.error || "Request failed.");
      error.status = response.status;
      throw error;
    }

    return data;
  }
}

// Global session manager instance
export const sessionManager = new SessionManager();
