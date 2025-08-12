// =================== Core Context Management Module ===================
// This module handles core context management, chat operations, and view management

// =================== Context Structure & Initialization ===================

const INITIAL_CONTEXT_DATA = {
  chats: [],
  messagesByChat: {},
  artifacts: [],
  activeChatId: null,
  messages: [],
  activeMessageIndex: -1,
  messagesContainer: null,
  viewElement: null,
  activeView: null, // { type: 'artifact', data: { artifactId: 'xxx' } } or { type: 'calendar', data: {} }
  activeVersionIdxByArtifact: {},
  showAllMessages: false
};

// Global Context Data
const AppContext = { ...INITIAL_CONTEXT_DATA };
let userSession = null;

// =================== Core Context Management ===================

function setContext(partial) {
  Object.assign(AppContext, partial);
}

function resetAppContextForChat() {
  setContext({
    activeVersionIdxByArtifact: {},
    messages: [],
    activeMessageIndex: -1,
    activeView: null
  });
}

// =================== Helper & Utility Functions ===================

function getViewTypes() {
  // Simple wrapper around views registry
  if (window.views?.getAllViews) {
    return window.views.getAllViews().map(view => ({
      id: view.id,
      title: view.name,
      type: view.type
    }));
  }
  // Return empty array if views not loaded yet
  return [];
}

function clearUI() {
  if (!AppContext.messagesContainer) AppContext.messagesContainer = document.getElementById('messages');
  if (!AppContext.viewElement) AppContext.viewElement = document.getElementById('view');
  if (AppContext.messagesContainer) AppContext.messagesContainer.innerHTML = '';
  if (AppContext.viewElement) AppContext.viewElement.innerHTML = '';
  // Clear input through input module
  if (window.inputModule) {
    window.inputModule.clear();
  }
}

// =================== Chat & Conversation Management ===================

function setActiveChat(id) {
  setContext({ activeChatId: id });
  window.memory?.saveActiveChatId(id);
}

function getActiveMessages() {
  return AppContext.messagesByChat[AppContext.activeChatId] || [];
}

function setActiveMessages(messages) {
  setContext({ messagesByChat: { ...AppContext.messagesByChat, [AppContext.activeChatId]: messages } });
  window.memory?.save();
}










function loadChat() {
  const messages = getActiveMessages();
  setContext({
    messages: messages,
    activeMessageIndex: messages.length - 1
  });
  if (window.messages && window.messages.updateMessagesDisplay) {
    window.messages.updateMessagesDisplay();
  }
}

// =================== View Management ===================

function setActiveView(viewType, data = {}, options = {}) {
  const { withTransition = true } = options;
  
  // Handle null viewType by setting activeView to null (shows chat or empty state)
  if (viewType === null || viewType === undefined) {
    if (AppContext.activeView === null) return; // Already null, no change needed
    setContext({ activeView: null });
    window.memory?.saveActiveView(null);
    if (window.views?.renderCurrentView) {
      window.views.renderCurrentView(withTransition);
    }
    return;
  }
  
  const newView = { type: viewType, data };
  
  // Simple comparison for view objects
  if (AppContext.activeView && 
      AppContext.activeView.type === newView.type &&
      JSON.stringify(AppContext.activeView.data) === JSON.stringify(newView.data)) {
    return;
  }
  
  setContext({ activeView: newView });
  window.memory?.saveActiveView(newView);
  
  // Handle version tracking for artifact views
  if (viewType === 'artifact' && data.artifactId) {
    const artifactId = data.artifactId;
    if (!(artifactId in AppContext.activeVersionIdxByArtifact)) {
      const artifact = getArtifact(artifactId);
      if (artifact) setContext({ activeVersionIdxByArtifact: { ...AppContext.activeVersionIdxByArtifact, [artifactId]: artifact.versions.length - 1 } });
    }
  }
  
  // Render the view with transition option
  if (window.views?.renderCurrentView) {
    window.views.renderCurrentView(withTransition);
  }
}

function setActiveArtifactId(id) {
  // Set as active view for all artifact types
  setActiveView('artifact', { artifactId: id });
}

// =================== User Preferences Management ===================
// User preferences now live in memory module as single source of truth

function getUserPreferences() {
  return window.memory?.getUserPreferences() || {};
}

function setUserPreferences(preferences) {
  // Delegate entirely to memory module for persistence and state management
  if (window.memory?.setUserPreferences) {
    window.memory.setUserPreferences(preferences);
  }
  
  // Sync to Supabase database if available
  if (window.syncManager) {
    window.syncManager.syncUserPreferences(preferences);
  }
}

// =================== Persistence & Storage Layer ===================

function getArtifact(id) {
  return AppContext.artifacts.find(a => a.id === id);
}

// =================== Available Actions Context ===================

function buildActionContext() {
  // Scan window objects for available functions (for AI context only)
  const APP_MODULES = ['chat', 'user', 'memory', 'artifactsModule', 'context', 'views', 'utils', 'messages', 'inputModule', 'processModule', 'systemModule', 'themeManager'];
  const byModule = {};
  
  for (const moduleName of APP_MODULES) {
    const moduleObj = window[moduleName];
    if (!moduleObj || typeof moduleObj !== 'object') continue;
    
    const functions = Object.entries(moduleObj)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name);
    
    if (functions.length > 0) {
      byModule[moduleName] = functions;
    }
  }
  
  const moduleList = Object.entries(byModule)
    .map(([module, functions]) => `${module}: ${functions.join(', ')}`)
    .join('\n');
  
  return `Available Functions:
${moduleList}

Format: Use in actionsExecuted as 'module.function'`;
}

// =================== AI Context Integration ===================

function getContext() {
  // Get all memory-related data through single endpoint
  const memoryData = window.memory?.getContextData() || {};
  
  // Get authentication status
  const session = window.user?.getActiveSession();
  const authStatus = {
    isLoggedIn: session ? true : false,
    currentUser: session?.user?.email || null
  };
  
  // Return curated context including memory data and current state
  return {
    // Authentication status - critical for AI decisions
    authStatus,
    
    // Memory-managed data
    userPreferences: memoryData.userPreferences || {},
    chats: memoryData.chats || [],
    artifacts: (memoryData.artifacts || []).filter(a => a.chatId === AppContext.activeChatId),
    
    // Current context data
    activeView: AppContext.activeView,
    availableViews: getViewTypes(),
    availableActions: buildActionContext(),
    activeChatId: AppContext.activeChatId,
    messages: AppContext.messages,
    activeVersionIdxByArtifact: AppContext.activeVersionIdxByArtifact
  };
}

// =================== Application Initialization ===================

async function init(session = null) {
  // Initialize memory (including IndexedDB)
  if (window.memory && window.memory.initMemory) {
    await window.memory.initMemory();
  }
  

  
  const isAuthenticated = !!session;
  
    if (isAuthenticated) {
    // AUTHENTICATED: Load existing data normally
    console.log('[CONTEXT] Initializing for authenticated user');
    window.memory?.load();
    
    // Set up initial active chat from existing data
    const initialChatId = window.memory?.loadActiveChatId() || (AppContext.chats[0] && AppContext.chats[0].id);
    setContext({ activeChatId: initialChatId });
    
    // Create new chat if none exist
    if (!AppContext.activeChatId && AppContext.chats.length === 0) {
      window.chat?.create();
    } else if (!AppContext.activeChatId) {
      setContext({ activeChatId: AppContext.chats[0].id });
    }
    
    // Restore active view for current chat
    if (AppContext.activeChatId) {
      const restoredView = window.memory?.loadActiveView();
      if (restoredView) {
        // Validate the restored view
        if (restoredView.type === 'artifact' && restoredView.data.artifactId) {
          const artifact = AppContext.artifacts.find(a => a.id === restoredView.data.artifactId && a.chatId === AppContext.activeChatId);
          if (artifact) {
            setContext({ activeView: restoredView });
          } else {
            setContext({ activeView: null });
          }
        } else if (restoredView.type !== 'artifact') {
          // System views (calendar, etc.) are always valid
          setContext({ activeView: restoredView });
        } else {
          setContext({ activeView: null });
        }
      } else {
        setContext({ activeView: null });
      }
    }
  } else {
    // GUEST: Start fresh with empty context
    console.log('[CONTEXT] Initializing fresh session for guest user');
    
    // Initialize with empty state (no data loading)
    setContext({
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
    
    // Create a new chat for the fresh guest session
    window.chat?.create();
  }
}

// =================== Module Exports & Global Interface ===================

window.context = {
  // Core lifecycle
  init,
  setContext,
  getContext,
  
  // Chat management
  setActiveChat,
  loadChat,
  setActiveMessages,
  getActiveChatId: () => AppContext.activeChatId,
  getChats: () => AppContext.chats,
  getMessages: () => AppContext.messages,
  getMessagesByChat: () => AppContext.messagesByChat,
  
  // View management
  setActiveView,
  setActiveArtifactId,
  getActiveView: () => AppContext.activeView,
  getViewTypes,
  clearUI,
  
  // Artifact management
  getArtifact,
  findCurrentChatArtifact: (artifactId) => AppContext.artifacts.find(a => a.id === artifactId && a.chatId === AppContext.activeChatId),
  getArtifacts: () => AppContext.artifacts,
  getCurrentChatArtifacts: () => AppContext.artifacts.filter(a => a.chatId === AppContext.activeChatId),
  getActiveVersionIndex: (artifactId) => AppContext.activeVersionIdxByArtifact[artifactId],
  setActiveVersionIndex: (artifactId, index) => setContext({ 
    activeVersionIdxByArtifact: { ...AppContext.activeVersionIdxByArtifact, [artifactId]: index } 
  }),
  
  // User preferences
  getUserPreferences,
  setUserPreferences,
  
  // Message navigation
  getActiveMessageIndex: () => AppContext.activeMessageIndex,
  setActiveMessageIndex: (index) => setContext({ activeMessageIndex: index }),
  getShowAllMessages: () => AppContext.showAllMessages,
  setShowAllMessages: (show) => setContext({ showAllMessages: show }),
  
  // UI elements (these may be needed by other modules)
  getMessagesContainer: () => AppContext.messagesContainer,
  setMessagesContainer: (container) => setContext({ messagesContainer: container }),
  getViewElement: () => AppContext.viewElement,
  setViewElement: (element) => setContext({ viewElement: element })
};

// AppContext is now properly encapsulated - all external access goes through window.context interface