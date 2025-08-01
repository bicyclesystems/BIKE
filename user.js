// =================== Supabase Client ===================
const supabase = window.supabase.createClient(
  window.SUPABASE_CONFIG.url,
  window.SUPABASE_CONFIG.key
);

// =================== Session Management ===================
class SessionManager {
  constructor() {
    this.SESSION_KEYS = {
      LOGIN_PROCESS: "bike_process_triggered",
    };
  }

  // =================== Session Flags Management ===================

  hasTriggeredLogin() {
    return sessionStorage.getItem(this.SESSION_KEYS.LOGIN_PROCESS) === "true";
  }

  markLoginTriggered() {
    sessionStorage.setItem(this.SESSION_KEYS.LOGIN_PROCESS, "true");
  }

  clearLoginFlag() {
    sessionStorage.removeItem(this.SESSION_KEYS.LOGIN_PROCESS);
  }

  clearAllFlags() {
    this.clearLoginFlag();
  }

  // =================== Process Triggering ===================

  async triggerProcess(context = "unknown", delay = 0) {
    const triggerFn = () => {
      try {
        console.log(`[SESSION] Triggering process for ${context}`);

        if (window.processModule?.process) {
          window.processModule.process();
        } else if (window.process) {
          window.process();
        } else {
          console.warn("[SESSION] Process function not available");
        }
      } catch (error) {
        console.error(
          `[SESSION] Process trigger failed for ${context}:`,
          error
        );
      }
    };

    if (delay > 0) {
      setTimeout(triggerFn, delay);
    } else {
      triggerFn();
    }
  }

  // =================== High-level Session Actions ===================

  async handleFreshLogin() {
    if (this.hasTriggeredLogin()) return false;

    this.markLoginTriggered();
    await this.triggerProcess("fresh login", 0);
    return true;
  }

  handleLogout() {
    this.clearAllFlags();
  }
}

// Create global session manager instance
const sessionManager = new SessionManager();
window.sessionManager = sessionManager;

// =================== Session Helpers ===================
async function getCurrentSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

async function updateSession(session, logMessage, isNewLogin = false) {
  if (logMessage) console.log(`[AUTH] ${logMessage}`);
  userSession = session;
  await updateAuthState(session, isNewLogin);
}

// =================== Cross-Tab & Background Sync ===================
window.addEventListener("storage", async (event) => {
  if (event.key?.startsWith("sb-") && event.key.endsWith("-auth-token")) {
    const session = await getCurrentSession();
    await updateSession(session, "Cross-tab auth sync", false);
  }
});

window.addEventListener("focus", () => {
  checkSession("Tab focused");
});

// =================== Optimized Session Management ===================
// Smart session checking - only when necessary, with longer intervals
let sessionCheckInterval;
let lastSessionCheck = 0;
const SESSION_CHECK_INTERVAL = 30000; // Increased from 10s to 30s
const MIN_CHECK_INTERVAL = 5000; // Minimum 5s between checks

function startSessionMonitoring() {
  // Clear any existing interval
  if (sessionCheckInterval) {
    clearInterval(sessionCheckInterval);
  }

  // Only start monitoring if user is authenticated
  if (userSession) {
    sessionCheckInterval = setInterval(() => {
      const now = Date.now();

      // Skip if we've checked recently (debounce)
      if (now - lastSessionCheck < MIN_CHECK_INTERVAL) {
        return;
      }

      lastSessionCheck = now;
      checkSession("Periodic check");
    }, SESSION_CHECK_INTERVAL);
  }
}

function stopSessionMonitoring() {
  if (sessionCheckInterval) {
    clearInterval(sessionCheckInterval);
    sessionCheckInterval = null;
  }
}

// Enhanced session checking with better performance
async function checkSession(logMessage) {
  // Skip if recently checked
  const now = Date.now();
  if (now - lastSessionCheck < MIN_CHECK_INTERVAL) {
    return;
  }

  lastSessionCheck = now;

  try {
    const session = await getCurrentSession();
    await updateSession(session, logMessage, false);
  } catch (error) {
    console.warn("[AUTH] Session check failed:", error);
  }
}

function toggleUI(show) {
  const action = show ? "render" : "remove";
  messages[`${action}MessagesUI`]();
  views[`${action}ViewUI`]();
}

// =================== Authentication Functions ===================
async function loginWithEmail(email) {
  if (!email) throw new Error("Email is required");
  try {
    const trimmedEmail = email.trim();
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
    });
    if (error) throw error;
    return { success: true, message: `Magic link sent to ${trimmedEmail}` };
  } catch (error) {
    throw new Error(`Failed to send magic link: ${error.message}`);
  }
}

async function logout() {
  try {
    // Stop session monitoring before logout
    stopSessionMonitoring();

    // Clear session manager state
    window.sessionManager.clearAllFlags();

    await supabase.auth.signOut();
    userSession = null;

    // Purge all user data from localStorage
    if (window.memory?.purgeAllData) {
      window.memory.purgeAllData();
    }

    // Clear all application state
    if (window.context?.setContext) {
      window.context.setContext({
        chats: [],
        messagesByChat: {},
        artifacts: [],
        activeChatId: null,
        messages: [],
        activeMessageIndex: -1,
        messagesContainer: null,
        viewElement: null,
        activeView: null,
        activeVersionIdxByArtifact: {},
        showAllMessages: false,
        userPreferences: {},
      });
    }
    // Remove all main UI
    toggleUI(false);
    await updateAuthState(null);
  } catch (error) {
    // Handle error gracefully without alert - user will see login screen if data can't be loaded
  }
}

function initAuth() {
  document.getElementById("auth-indicator")?.remove();

  return new Promise((resolve) => {
        supabase.auth.onAuthStateChange((event, session) => {
      console.log("[AUTH] State change:", event);
      const isNewLogin = event === "SIGNED_IN";
      userSession = session;

      if (lastAuthState !== null) {
        updateAuthState(session, isNewLogin);
      }
      resolve(session);
    });

    getCurrentSession().then((session) => {
      userSession = session;
      lastAuthState = !!session;
      updateAuthState(session, false);
      resolve(session);
    });
  });
}

function getActiveSession() {
  return userSession;
}

// =================== Intro Screen ===================
const INTRO_STYLES = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; 
  background: url('images/intro.png') center/contain no-repeat white; z-index: 9999; 
  opacity: 1; transition: opacity 0.3s ease, transform 0.3s ease;`;

function blurFadeOut(element, onComplete) {
  if (!element) return;
  Object.assign(element.style, {
    opacity: "0",
    transform: "scale(0.95)",
    filter: "blur(16px)",
    transition: "opacity 0.5s ease, transform 0.5s ease, filter 0.5s ease",
  });
  setTimeout(() => onComplete?.(), 300);
}

function renderIntroScreen() {
  if (document.getElementById("intro")) return;
  const intro = window.utils.createElementWithClass("div", "");
  intro.id = "intro";
  intro.style.cssText = INTRO_STYLES;

  // Add click handler to dismiss intro screen
  intro.addEventListener("click", () => {
    removeIntroScreen();
  });

  // Add subtle cursor hint
  intro.style.cursor = "pointer";

  // Auto-dismiss after 5 seconds for better UX
  setTimeout(() => {
    if (document.getElementById("intro")) {
      removeIntroScreen();
    }
  }, 5000);

  document.body.appendChild(intro);
}

function removeIntroScreen() {
  const intro = document.getElementById("intro");
  if (intro) {
    blurFadeOut(intro, () => {
      window.utils.removeElement(intro);
    });
  }
}

// =================== App Initialization ===================
function initializeMainApp() {
  console.log('[AUTH] Initializing app');

  const chats = window.context.getChats() || [];
  const activeChatId = window.context.getActiveChatId();

  console.log(
    `[AUTH] Found ${chats.length} chats, active: ${activeChatId || "none"}`
  );

  if (chats.length === 0) {
    console.log('[AUTH] Creating new chat');
    window.actions.executeAction("chat.create", {});
  } else if (!activeChatId) {
    console.log('[AUTH] Setting first chat as active');
    window.context.setActiveChat(chats[0].id);
  }

  if (window.context.getActiveChatId()) {
    window.context.loadChat();
  }

  window.views.renderCurrentView(false); // No transition during initialization
}

// =================== Authenticated State Handler ===================
async function handleAuthenticatedState() {
  removeIntroScreen();
  toggleUI(true);
  // Sync initialization moved to background in index.html - don't block UI

  // Start smart session monitoring for authenticated users
  startSessionMonitoring();

  // Show memory view if no active view is set
  const currentView = window.context.getActiveView();
  if (window.context?.setActiveView && !currentView) {
    window.context.setActiveView("memory", {}, { withTransition: false });
  }

  initializeMainApp();
  
  // Trigger contextual guidance for fresh logins only (not page refreshes)
  await window.sessionManager.handleFreshLogin();
  console.log('[AUTH] Authentication complete');
}

// =================== Sync Integration ===================
async function initializeSync() {
  if (!window.syncManager || !userSession) {
    console.warn("[AUTH] Sync unavailable");
    return;
  }

  try {
    console.log('[AUTH] Initializing sync');
    await window.syncManager.initializeWithAuth(supabase, userSession);
    console.log('[AUTH] Sync complete');
  } catch (error) {
    console.error("[AUTH] Sync failed:", error);
  }
}

function handleUnauthenticatedState() {
  toggleUI(false);
  renderIntroScreen();

  // Stop session monitoring for unauthenticated users
  stopSessionMonitoring();

  // Clear all user data to ensure clean slate for guest mode
  if (window.memory?.purgeAllData) {
    window.memory.purgeAllData();
  }

  // Clear all application state
  if (window.context?.setContext) {
    window.context.setContext({
      chats: [],
      messagesByChat: {},
      artifacts: [],
      activeChatId: null,
      messages: [],
      activeMessageIndex: -1,
      activeView: null,
      activeVersionIdxByArtifact: {},
      showAllMessages: false,
      userPreferences: {},
    });
  }

  // Keep intro screen visible for unauthenticated users
  toggleUI(true); // Enable UI so users can interact
  
  // Show memory view if no active view is set (mirror authenticated behavior)
  const currentView = window.context.getActiveView();
  if (window.context?.setActiveView && !currentView) {
    window.context.setActiveView("memory", {}, { withTransition: false });
  }
}

// Track auth state to detect fresh logins
let lastAuthState = null;

async function updateAuthState(session, forceNewLogin = false) {
  const isLoggedIn = !!session;

  if (isLoggedIn) {
    await handleAuthenticatedState();
  } else {
    handleUnauthenticatedState();
    window.sessionManager.handleLogout();
  }

  lastAuthState = isLoggedIn;
}

// =================== User Data Getters ===================

/**
 * Fetch the currently logged-in user's row from the "users" table.
 */

async function getUserData() {
  const session = await getCurrentSession();
  if (!session?.user?.id) return null;
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", session.user.id)
    .single();

  if (error) {
    console.error("[USER] Failed to fetch user data:", error);
    return null;
  }

  return data;
}

/**
 * Fetch all artifacts that belong to the current user.
 */
async function getUserArtifacts() {
  const session = await getCurrentSession();
  if (!session?.user?.id) return [];

  const { data, error } = await supabase
    .from("artifacts")
    .select("*")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[USER] Failed to fetch artifacts:", error);
    return [];
  }

  return data;
}

/**
 * Fetch all chats that belong to the current user.
 */
async function getUserChats() {
  const session = await getCurrentSession();
  if (!session?.user?.id) return [];

  const { data, error } = await supabase
    .from("chats")
    .select("*")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[USER] Failed to fetch chats:", error);
    return [];
  }

  return data;
}

/**
 * Fetch all messages for the current user's chats.
 */
async function getUserMessages() {
  const session = await getCurrentSession();
  if (!session?.user?.id) return [];
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false });

  if (error) {

    console.error("[USER] Failed to fetch messages:", error);
    return [];
  }

  return data;
}
// =================== Public API ===================
window.user = {
  loginWithEmail,
  logout,
  initAuth,
  getActiveSession,
  updateAuthState,
  initializeMainApp,

  // getters for the user data
  getUserData,
  getUserArtifacts,
  getUserChats,
  getUserMessages,
};
