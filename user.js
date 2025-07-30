// =================== Supabase Client ===================
const supabase = window.supabase.createClient(
  window.SUPABASE_CONFIG.url,
  window.SUPABASE_CONFIG.key
);

// =================== Session Management ===================

// Helper function to check if user is joining as a collaborator
function isJoiningAsCollaborator() {
  return window.collaboration?.isCollaborating || 
    localStorage.getItem("collaborationActive") === "true" ||
    window.location.hash.includes("collab-");
}

// Helper function to check if user should be treated as logged in (including collaborators)
function shouldTreatAsLoggedIn() {
  const session = window.user?.getActiveSession();
  const isLoggedIn = !!session;
  const isCollaborator = isJoiningAsCollaborator();
  
  return isLoggedIn || isCollaborator;
}

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

  // Ensure there's always an active chat
  ensureActiveChatExists();

  if (window.context.getActiveChatId()) {
    window.context.loadChat();
  }

  window.views.renderCurrentView(false); // No transition during initialization
}

/**
 * Ensure there's always an active chat available
 * Creates a default chat if none exists
 */
function ensureActiveChatExists() {
  console.log('[AUTH] 🔍 Checking for active chat...');
  
  const chats = window.context.getChats() || [];
  const activeChatId = window.context.getActiveChatId();
  
  // Check for existing chats in localStorage
  const storedChats = JSON.parse(localStorage.getItem("chats") || "[]");
  const hasStoredChats = storedChats.length > 0;
  
  // Check collaboration protection status
  const isCollabProtected = window.isCollaborationProtected
    ? window.isCollaborationProtected()
    : false;

  console.log(
    `[AUTH] 📊 Chat status: ${chats.length} context, ${storedChats.length} localStorage, active: ${activeChatId || "none"}, collabProtected: ${isCollabProtected}`
  );

  // If no active chat exists, try to set one
  if (!activeChatId) {
    console.log('[AUTH] 🔄 No active chat found, attempting to set one...');
    
    // First try to use existing chats from context
    if (chats.length > 0) {
      console.log("[AUTH] ✅ Setting first context chat as active:", chats[0].id);
      window.context.setActiveChat(chats[0].id);
      return;
    }
    
    // Then try to load from localStorage
    if (hasStoredChats) {
      console.log("[AUTH] 🔄 Loading chats from localStorage...");
      window.memory?.loadAll();
      const reloadedChats = window.context.getChats() || [];
      if (reloadedChats.length > 0) {
        console.log("[AUTH] ✅ Setting first stored chat as active:", reloadedChats[0].id);
        window.context.setActiveChat(reloadedChats[0].id);
        return;
      }
    }
    
    // If still no chat exists, create a new one
    console.log("[AUTH] 🆕 No chats found anywhere - creating new default chat");
    createDefaultChat();
  } else {
    console.log('[AUTH] ✅ Active chat already exists:', activeChatId);
  }
}

/**
 * Create a default chat with a random ID
 */
function createDefaultChat() {
  try {
    const chatId = Date.now().toString();
    const defaultChat = {
      id: chatId,
      title: "New Chat",
      description: "Start a new conversation",
      timestamp: new Date().toISOString(),
      endTime: null
    };
    
    console.log('[AUTH] 🆕 Creating default chat:', chatId);
    
    // Add chat to context
    const currentChats = window.context.getChats() || [];
    const updatedChats = [defaultChat, ...currentChats];
    window.context.setState({ chats: updatedChats });
    
    // Set as active chat
    window.context.setActiveChat(chatId);
    
    // Save to localStorage
    localStorage.setItem("chats", JSON.stringify(updatedChats));
    localStorage.setItem("activeChatId", chatId);
    
    // Initialize empty messages array for this chat
    const currentMessagesByChat = window.context.getMessagesByChat() || {};
    currentMessagesByChat[chatId] = [];
    window.context.setState({ messagesByChat: currentMessagesByChat });
    localStorage.setItem("messagesByChat", JSON.stringify(currentMessagesByChat));
    
    console.log('[AUTH] ✅ Default chat created and set as active:', chatId);
    
    // Save to memory module if available
    if (window.memory?.saveChat) {
      window.memory.saveChat(defaultChat);
    }
    
    return chatId;
  } catch (error) {
    console.error('[AUTH] ❌ Failed to create default chat:', error);
    return null;
  }
}

// =================== Authenticated State Handler ===================
async function handleAuthenticatedState() {
  removeIntroScreen();
  toggleUI(true);
  
  // Fetch and merge user data from database with smart deduplication
  await fetchAndMergeUserData();

  await initializeSync();

  // Start smart session monitoring for authenticated users
  startSessionMonitoring();

  // Show memory view if no active view is set
  const currentView = window.context.getActiveView();
  if (window.context?.setActiveView && !currentView) {
    window.context.setActiveView("memory", {}, { withTransition: false });
  }

  initializeMainApp();
  
  // Check if user is joining as a collaborator - skip fresh login process
  if (!isJoiningAsCollaborator()) {
    // Trigger contextual guidance for fresh logins only (not page refreshes)
    await window.sessionManager.handleFreshLogin();
  } else {
    console.log('[AUTH] 🛡️ Collaborator detected - triggering process for collaborator');
    // Trigger process for collaborators to enable AI responses
    await window.sessionManager.triggerProcess("collaborator initialization", 0);
  }
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
  // Check if collaboration is active before clearing data
  const isCollabProtected = window.isCollaborationProtected
    ? window.isCollaborationProtected()
    : false;

  // Check if user is joining as a collaborator
  if (isCollabProtected || isJoiningAsCollaborator()) {
    console.log(
      "[AUTH] 🛡️ Collaboration active - preserving state and skipping intro"
    );
    // Don't clear data or show intro screen during collaboration
    toggleUI(true);
    
    // Trigger process for collaborators to enable AI responses
    window.sessionManager.triggerProcess("collaborator unauthenticated initialization", 1000);
    return;
  }

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
      userPreferences: {},
    });
  }

  // Keep intro screen visible for unauthenticated users
  toggleUI(true); // Enable UI so users can interact

  // Ensure there's a default chat for unauthenticated users
  ensureActiveChatExists();

  // Check for existing chats in localStorage before creating new ones
  const storedChats = JSON.parse(localStorage.getItem("chats") || "[]");
  const hasStoredChats = storedChats.length > 0;

  if (!hasStoredChats) {
    // Create chat BEFORE setting memory view to ensure active chat exists
    console.log(
      "[AUTH] No stored chats found - creating new chat for guest mode"
    );
    window.actions.executeAction("chat.create", {});
  } else {
    console.log(
      "[AUTH] Found stored chats - loading existing data for guest mode"
    );
    // Load existing data instead of creating new
    window.memory?.loadAll();
    const reloadedChats = window.context.getChats() || [];
    if (reloadedChats.length > 0 && !window.context.getActiveChatId()) {
      window.context.setActiveChat(reloadedChats[0].id);
    }
  }

  window.context.setActiveView("memory", {}, { withTransition: false });
  window.views.renderCurrentView(false); // No transition during initialization
}

// Track auth state to detect fresh logins
let lastAuthState = null;

async function updateAuthState(session, forceNewLogin = false) {
  const isLoggedIn = !!session;

  // Check if user is joining as a collaborator
  if (isLoggedIn) {
    await handleAuthenticatedState();
  } else {
    // For collaborators, don't show unauthenticated state (no intro screen)
    if (isJoiningAsCollaborator()) {
      console.log('[AUTH] 🛡️ Collaborator detected - bypassing unauthenticated state');
      toggleUI(true); // Enable UI for collaborator
      return;
    }
    handleUnauthenticatedState();
    window.sessionManager.handleLogout();
  }

  lastAuthState = isLoggedIn;
}

// =================== Smart Data Fetching and Merging ===================

/**
 * Fetch and merge user data from database with smart deduplication
 * This function handles both fresh login and page refresh scenarios
 */
async function fetchAndMergeUserData() {
  console.log('[AUTH] 🔄 Fetching and merging user data from database...');
  
  try {
    // Get current local data
    const localChats = JSON.parse(localStorage.getItem("chats") || "[]");
    const localMessagesByChat = JSON.parse(localStorage.getItem("messagesByChat") || "{}");
    const localArtifacts = JSON.parse(localStorage.getItem("artifacts") || "[]");
    const localUser = JSON.parse(localStorage.getItem("bike_user_data") || "{}").user;
    
    console.log('[AUTH] 📊 Current local data:', {
      chats: localChats.length,
      artifacts: localArtifacts.length,
      messages: Object.values(localMessagesByChat).flat().length,
      user: !!localUser
    });

    // First ensure user exists in database
    const session = await getCurrentSession();
    if (session?.user?.id) {
      await ensureUserInDatabase(session);
    }
    
    // Fetch fresh data from database
    const [dbUser, dbArtifacts, dbChats, dbMessages] = await Promise.all([
      getUserData(),
      getUserArtifacts(),
      getUserChats(),
      getUserMessages(),
    ]);

    console.log('[AUTH] 📊 Fetched database data:', {
      user: !!dbUser,
      artifacts: dbArtifacts?.length || 0,
      chats: dbChats?.length || 0,
      messages: dbMessages?.length || 0
    });

    // Smart merge with deduplication
    const mergedData = mergeDataWithDeduplication({
      local: { chats: localChats, messagesByChat: localMessagesByChat, artifacts: localArtifacts, user: localUser },
      database: { chats: dbChats, messages: dbMessages, artifacts: dbArtifacts, user: dbUser }
    });

    // Store merged data in localStorage
    const messagesByChat = mergedData.messagesByChat;
    localStorage.setItem("bike_user_data", JSON.stringify({ user: mergedData.user }));
    localStorage.setItem("userPreferences", JSON.stringify(mergedData.user?.preferences || {}));
    localStorage.setItem("userId", mergedData.user?.id || "");
    localStorage.setItem("artifacts", JSON.stringify(mergedData.artifacts));
    localStorage.setItem("chats", JSON.stringify(mergedData.chats));
    localStorage.setItem("messagesByChat", JSON.stringify(messagesByChat));

    // Set the last chat as active if no active chat exists
    const currentActiveChatId = window.context?.getActiveChatId();
    if (!currentActiveChatId && mergedData.chats.length > 0) {
      const lastChat = mergedData.chats[mergedData.chats.length - 1];
      localStorage.setItem("activeChatId", lastChat.id.toString());
    }

    console.log('[AUTH] ✅ Merged data stored in localStorage');

    // Update context state with merged data
    if (window.context?.setState) {
      window.context.setState({
        chats: mergedData.chats,
        messagesByChat: messagesByChat,
        artifacts: mergedData.artifacts,
        activeChatId: currentActiveChatId || (mergedData.chats.length > 0 ? mergedData.chats[mergedData.chats.length - 1].id : null),
        userPreferences: mergedData.user?.preferences || {}
      });
          console.log('[AUTH] ✅ Context state updated with merged data');
  }

  // Ensure there's an active chat after data merging
  ensureActiveChatExists();

  console.log('[AUTH] 📊 Final merged data summary:', {
    chats: mergedData.chats.length,
    artifacts: mergedData.artifacts.length,
    messages: Object.values(messagesByChat).flat().length,
    user: !!mergedData.user
  });

} catch (error) {
  console.error('[AUTH] ❌ Failed to fetch and merge user data:', error);
}
}

/**
 * Smart data merging with deduplication
 */
function mergeDataWithDeduplication({ local, database }) {
  console.log('[AUTH] 🔄 Merging data with deduplication...');

  // Merge chats with deduplication by chat_id
  const mergedChats = mergeChatsWithDeduplication(local.chats, database.chats);
  
  // Merge messages with deduplication by message_id
  const mergedMessagesByChat = mergeMessagesWithDeduplication(local.messagesByChat, database.messages);
  
  // Merge artifacts with deduplication by artifact_id
  const mergedArtifacts = mergeArtifactsWithDeduplication(local.artifacts, database.artifacts);
  
  // Use database user data (always fresh)
  const mergedUser = database.user || local.user;

  return {
    chats: mergedChats,
    messagesByChat: mergedMessagesByChat,
    artifacts: mergedArtifacts,
    user: mergedUser
  };
}

/**
 * Merge chats with deduplication by chat_id
 */
function mergeChatsWithDeduplication(localChats, dbChats) {
  const chatMap = new Map();
  
  // Add local chats first
  localChats.forEach(chat => {
    chatMap.set(chat.id, chat);
  });
  
  // Add/update with database chats (database takes precedence for conflicts)
  dbChats.forEach(dbChat => {
    const existingChat = chatMap.get(dbChat.id);
    if (!existingChat || new Date(dbChat.updated_at || dbChat.timestamp) > new Date(existingChat.updatedAt || existingChat.timestamp)) {
      chatMap.set(dbChat.id, {
        id: dbChat.id,
        title: dbChat.title,
        description: dbChat.description || "",
        timestamp: dbChat.timestamp,
        endTime: dbChat.endTime,
        updatedAt: dbChat.updated_at || dbChat.timestamp
      });
    }
  });
  
  const mergedChats = Array.from(chatMap.values()).sort((a, b) => 
    new Date(b.timestamp) - new Date(a.timestamp)
  );
  
  console.log(`[AUTH] 📋 Chats merged: ${localChats.length} local + ${dbChats.length} db = ${mergedChats.length} total`);
  return mergedChats;
}

/**
 * Merge messages with deduplication by message_id
 */
function mergeMessagesWithDeduplication(localMessagesByChat, dbMessages) {
  const mergedMessagesByChat = { ...localMessagesByChat };
  
  // Group database messages by chat_id
  const dbMessagesByChat = {};
  dbMessages.forEach(dbMessage => {
    const chatId = dbMessage.chat_id;
    if (!dbMessagesByChat[chatId]) {
      dbMessagesByChat[chatId] = [];
    }
    dbMessagesByChat[chatId].push({
      role: dbMessage.role,
      content: dbMessage.content,
      metadata: dbMessage.metadata || {},
      message_id: dbMessage.message_id,
      created_at: dbMessage.created_at
    });
  });
  
  // Merge messages for each chat
  Object.keys(dbMessagesByChat).forEach(chatId => {
    const localMessages = mergedMessagesByChat[chatId] || [];
    const dbMessages = dbMessagesByChat[chatId];
    
    // Create a map of existing messages by content and role to avoid duplicates
    const messageMap = new Map();
    
    // Add local messages first
    localMessages.forEach(msg => {
      const key = `${msg.role}:${msg.content}`;
      messageMap.set(key, msg);
    });
    
    // Add database messages (database takes precedence for conflicts)
    dbMessages.forEach(dbMsg => {
      const key = `${dbMsg.role}:${dbMsg.content}`;
      const existingMsg = messageMap.get(key);
      if (!existingMsg || new Date(dbMsg.created_at) > new Date(existingMsg.metadata?.timestamp || 0)) {
        messageMap.set(key, dbMsg);
      }
    });
    
    mergedMessagesByChat[chatId] = Array.from(messageMap.values()).sort((a, b) => 
      new Date(a.metadata?.timestamp || a.created_at || 0) - new Date(b.metadata?.timestamp || b.created_at || 0)
    );
  });
  
  const totalMessages = Object.values(mergedMessagesByChat).flat().length;
  console.log(`[AUTH] 💬 Messages merged: ${Object.values(localMessagesByChat).flat().length} local + ${dbMessages.length} db = ${totalMessages} total`);
  return mergedMessagesByChat;
}

/**
 * Merge artifacts with deduplication by artifact_id
 */
function mergeArtifactsWithDeduplication(localArtifacts, dbArtifacts) {
  const artifactMap = new Map();
  
  // Add local artifacts first
  localArtifacts.forEach(artifact => {
    artifactMap.set(artifact.id, artifact);
  });
  
  // Add/update with database artifacts (database takes precedence for conflicts)
  dbArtifacts.forEach(dbArtifact => {
    const existingArtifact = artifactMap.get(dbArtifact.id);
    if (!existingArtifact || new Date(dbArtifact.updated_at) > new Date(existingArtifact.updatedAt || 0)) {
      artifactMap.set(dbArtifact.id, {
        id: dbArtifact.id,
        chatId: dbArtifact.chat_id,
        title: dbArtifact.title,
        type: dbArtifact.type,
        versions: dbArtifact.versions || [],
        updatedAt: dbArtifact.updated_at,
        slug: dbArtifact.slug,
        liveUrl: dbArtifact.live_url
      });
    }
  });
  
  const mergedArtifacts = Array.from(artifactMap.values()).sort((a, b) => 
    new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
  );
  
  console.log(`[AUTH] 🎨 Artifacts merged: ${localArtifacts.length} local + ${dbArtifacts.length} db = ${mergedArtifacts.length} total`);
  return mergedArtifacts;
}

// =================== User Data Getters ===================

/**
 * Fetch the currently logged-in user's row from the "users" table.
 */

async function getUserData() {
  const session = await getCurrentSession();
  if (!session?.user?.id) return null;
  
  // First, ensure user exists in database (create if not exists)
  await ensureUserInDatabase(session);
  
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
 * Ensure user exists in database, create if not exists
 */
async function ensureUserInDatabase(session) {
  if (!session?.user?.id) return;
  
  try {
    // Get user preferences from localStorage
    const userPreferences = JSON.parse(localStorage.getItem("userPreferences") || "{}");
    
    console.log('[USER] 🔄 Ensuring user exists in database:', session.user.id);
    
    // Try to upsert user record
    const { data, error } = await supabase
      .from("users")
      .upsert({
        id: session.user.id,
        session_id: session.access_token,
        preferences: userPreferences,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id',
        ignoreDuplicates: false
      });

    if (error) {
      console.error("[USER] Failed to upsert user:", error);
      return;
    }

    console.log('[USER] ✅ User record ensured in database:', session.user.id);
    return data;
  } catch (error) {
    console.error("[USER] Error ensuring user in database:", error);
  }
}

/**
 * Update user preferences in database
 */
async function updateUserPreferences(preferences) {
  const session = await getCurrentSession();
  if (!session?.user?.id) return;
  
  try {
    console.log('[USER] 🔄 Updating user preferences in database:', session.user.id);
    
    const { data, error } = await supabase
      .from("users")
      .update({
        preferences: preferences,
        updated_at: new Date().toISOString()
      })
      .eq("id", session.user.id);

    if (error) {
      console.error("[USER] Failed to update user preferences:", error);
      return;
    }

    console.log('[USER] ✅ User preferences updated in database');
    return data;
  } catch (error) {
    console.error("[USER] Error updating user preferences:", error);
  }
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
  shouldTreatAsLoggedIn,
  isJoiningAsCollaborator,

  // getters for the user data
  getUserData,
  getUserArtifacts,
  getUserChats,
  getUserMessages,
  
  // smart data fetching and merging
  fetchAndMergeUserData,
  
  // user database management
  ensureUserInDatabase,
  updateUserPreferences,
  
  // chat management
  ensureActiveChatExists,
  createDefaultChat,
};
