// =================== Supabase Client ===================
const supabase = window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.key);

// =================== Session Management ===================
class SessionManager {
  constructor() {
    this.SESSION_KEYS = {
      LOGIN_PROCESS: 'bike_process_triggered',
      GUEST_PROCESS: 'bike_guest_process_triggered',
      LOGIN_TIME: 'bike_login_time'
    };
  }

  // =================== Session Flags Management ===================
  
  hasTriggeredLogin() {
    return sessionStorage.getItem(this.SESSION_KEYS.LOGIN_PROCESS) === 'true';
  }

  hasTriggeredGuest() {
    return sessionStorage.getItem(this.SESSION_KEYS.GUEST_PROCESS) === 'true';
  }

  markLoginTriggered() {
    sessionStorage.setItem(this.SESSION_KEYS.LOGIN_PROCESS, 'true');
    sessionStorage.setItem(this.SESSION_KEYS.LOGIN_TIME, new Date().toISOString());
    this.clearGuestFlag();
  }

  markGuestTriggered() {
    sessionStorage.setItem(this.SESSION_KEYS.GUEST_PROCESS, 'true');
  }

  clearLoginFlag() {
    sessionStorage.removeItem(this.SESSION_KEYS.LOGIN_PROCESS);
  }

  clearGuestFlag() {
    sessionStorage.removeItem(this.SESSION_KEYS.GUEST_PROCESS);
  }

  clearAllFlags() {
    this.clearLoginFlag();
    this.clearGuestFlag();
    sessionStorage.removeItem(this.SESSION_KEYS.LOGIN_TIME);
  }

  getLoginTime() {
    const loginTime = sessionStorage.getItem(this.SESSION_KEYS.LOGIN_TIME);
    return loginTime ? new Date(loginTime) : null;
  }

  // =================== Process Triggering ===================

  async triggerProcess(context = 'unknown', delay = 0) {
    const triggerFn = () => {
      try {
        console.log(`[SESSION] Triggering process for ${context}`);
        
        if (window.processModule?.process) {
          window.processModule.process();
        } else if (window.process) {
          window.process();
        } else {
          console.warn('[SESSION] Process function not available');
        }
      } catch (error) {
        console.error(`[SESSION] Process trigger failed for ${context}:`, error);
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
    await this.triggerProcess('fresh login', 0);
    return true;
  }

  async handleGuestMode() {
    // For guest mode, always trigger the process on every refresh
    // Context initialization already created a fresh session with new chat
    console.log('[SESSION] Handling guest mode - fresh session already initialized');
    
    // Clear any existing guest flag to ensure fresh process trigger
    this.clearGuestFlag(); 
    this.markGuestTriggered();
    
    // Trigger the guest process immediately
    await this.triggerProcess('guest mode', 0);
    return true;
  }

  handleLogout() {
    this.clearAllFlags();
  }

  handleSessionRestore() {
    this.clearGuestFlag(); // User was already logged in
  }
}

// Create global session manager instance
const sessionManager = new SessionManager();
window.sessionManager = sessionManager;

// =================== Session Helpers ===================
async function getCurrentSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

async function updateSession(session, logMessage, isNewLogin = false) {
  if (logMessage) console.log(`[AUTH] ${logMessage}`);
  userSession = session;
  await updateAuthState(session, isNewLogin);
}

// =================== Cross-Tab & Background Sync ===================
window.addEventListener('storage', async (event) => {
  if (event.key?.startsWith('sb-') && event.key.endsWith('-auth-token')) {
    const session = await getCurrentSession();
    await updateSession(session, 'Cross-tab auth sync', false);
  }
});

window.addEventListener('focus', () => {
  checkSession('Tab focused');
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
      checkSession('Periodic check');
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
    console.warn('[AUTH] Session check failed:', error);
  }
}

function toggleUI(show) {
  const action = show ? 'render' : 'remove';
  messages[`${action}MessagesUI`]();
  views[`${action}ViewUI`]();
}


// =================== Authentication Functions ===================
async function loginWithEmail(email) {
  if (!email) throw new Error('Email is required');
  try {
    const trimmedEmail = email.trim();
    const { error } = await supabase.auth.signInWithOtp({ email: trimmedEmail });
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
    if (window.context?.setState) {
      window.context.setState({
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
        userPreferences: {}
      });
    }
    // Remove all main UI
    toggleUI(false);
    await updateAuthState(null);
  } catch (error) {
    alert(error.message);
  }
}

function initAuth() {
  document.getElementById('auth-indicator')?.remove();
  
  return new Promise((resolve) => {
    supabase.auth.onAuthStateChange((event, session) => {
      console.log('[AUTH] State change:', event);
      const isNewLogin = event === 'SIGNED_IN';
      userSession = session;
      
      if (lastAuthState !== null) {
        updateAuthState(session, isNewLogin);
      }
      resolve(session);
    });
    
    getCurrentSession().then(session => {
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
    opacity: '0', transform: 'scale(0.95)', filter: 'blur(16px)',
    transition: 'opacity 0.5s ease, transform 0.5s ease, filter 0.5s ease'
  });
  setTimeout(() => onComplete?.(), 300);
}

function renderIntroScreen() {
  if (document.getElementById('intro')) return;
  const intro = window.utils.createElementWithClass('div', '');
  intro.id = 'intro';
  intro.style.cssText = INTRO_STYLES;
  document.body.appendChild(intro);
}

function removeIntroScreen() {
  const intro = document.getElementById('intro');
  if (intro) blurFadeOut(intro, () => window.utils.removeElement(intro));
}

// =================== App Initialization ===================
function initializeMainApp() {
  console.log('[AUTH] Initializing app');
  
  const chats = window.context.getChats() || [];
  const activeChatId = window.context.getActiveChatId();
  
  console.log(`[AUTH] Found ${chats.length} chats, active: ${activeChatId || 'none'}`);
  
  if (chats.length === 0) {
    console.log('[AUTH] Creating new chat');
    window.context.createNewChat();
  } else if (!activeChatId) {
    console.log('[AUTH] Setting first chat as active');
    window.context.setActiveChat(chats[0].id);
  }
  
  if (window.context.getActiveChatId()) {
    window.context.loadChat();
  }
  
  window.views.renderCurrentView();
}

// =================== Authenticated State Handler ===================
async function handleAuthenticatedState(shouldTriggerProcess = false) {
  removeIntroScreen();
  toggleUI(true);
  await initializeSync();
  
  // Start smart session monitoring for authenticated users
  startSessionMonitoring();
  
  // Show welcome view if no active view is set
  const currentView = window.context.getActiveView();
  if (window.context?.setActiveView && !currentView) {
    window.context.setActiveView('welcome', {});
  }
  
  initializeMainApp();
  
  // Handle process triggering
  if (shouldTriggerProcess) {
    await window.sessionManager.handleFreshLogin();
  } else {
    console.log('[AUTH] Session restored - skipping auto-process');
    window.sessionManager.handleSessionRestore();
  }
}

// =================== Sync Integration ===================
async function initializeSync() {
  if (!window.syncManager || !userSession) {
    console.warn('[AUTH] Sync unavailable');
    return;
  }
  
  try {
    console.log('[AUTH] Initializing sync');
    await window.syncManager.initializeWithAuth(supabase, userSession);
    console.log('[AUTH] Sync complete');
  } catch (error) {
    console.error('[AUTH] Sync failed:', error);
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
  if (window.context?.setState) {
    window.context.setState({
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
      userPreferences: {}
    });
  }
  
  removeIntroScreen();
  toggleUI(true);
  
  // Create chat BEFORE setting welcome view to ensure active chat exists
  window.context.createNewChat();
  window.context.setActiveView('welcome', {});
  window.views.renderCurrentView();
  
  // Auto-trigger process for guest mode
  window.sessionManager.handleGuestMode();
}

// Track auth state to detect fresh logins
let lastAuthState = null;

async function updateAuthState(session, forceNewLogin = false) {
  const isLoggedIn = !!session;
  const wasLoggedIn = lastAuthState;
  
  const isNewLogin = forceNewLogin || (!wasLoggedIn && isLoggedIn);
  const shouldTriggerProcess = isNewLogin && !window.sessionManager.hasTriggeredLogin();
  
  if (isLoggedIn) {
    await handleAuthenticatedState(shouldTriggerProcess);
  } else {
    handleUnauthenticatedState();
    window.sessionManager.handleLogout();
  }
  
  lastAuthState = isLoggedIn;
}

// =================== Public API ===================
window.user = {
  loginWithEmail,
  logout,
  initAuth,
  getActiveSession,
  updateAuthState,
  initializeMainApp
}; 