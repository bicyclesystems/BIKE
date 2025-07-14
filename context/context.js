// =================== Core Context Management Module ===================
// This module handles core state management, chat operations, and view management

// =================== State Structure & Initialization ===================

const INITIAL_CONTEXT_STATE = {
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

// Global Context State
const AppState = { ...INITIAL_CONTEXT_STATE };
let userSession = null;

// =================== Core State Management ===================

function setState(partial) {
  Object.assign(AppState, partial);
}

function resetAppStateForChat() {
  setState({
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
  if (!AppState.messagesContainer) AppState.messagesContainer = document.getElementById('messages');
  if (!AppState.viewElement) AppState.viewElement = document.getElementById('view');
  if (AppState.messagesContainer) AppState.messagesContainer.innerHTML = '';
  if (AppState.viewElement) AppState.viewElement.innerHTML = '';
  // Clear input through input module
  if (window.inputModule) {
    window.inputModule.clear();
  }
}

// =================== Chat & Conversation Management ===================

function setActiveChat(id) {
  setState({ activeChatId: id });
  window.memory?.saveActiveChatId(id);
}

function getActiveMessages() {
  return AppState.messagesByChat[AppState.activeChatId] || [];
}

function setActiveMessages(messages) {
  setState({ messagesByChat: { ...AppState.messagesByChat, [AppState.activeChatId]: messages } });
  window.memory?.saveAll();
}










function loadChat() {
  const messages = getActiveMessages();
  setState({
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
    if (AppState.activeView === null) return; // Already null, no change needed
    setState({ activeView: null });
    window.memory?.saveActiveView(null);
    if (window.views?.renderCurrentView) {
      window.views.renderCurrentView(withTransition);
    }
    return;
  }
  
  const newView = { type: viewType, data };
  
  // Simple comparison for view objects
  if (AppState.activeView && 
      AppState.activeView.type === newView.type &&
      JSON.stringify(AppState.activeView.data) === JSON.stringify(newView.data)) {
    return;
  }
  
  setState({ activeView: newView });
  window.memory?.saveActiveView(newView);
  
  // Handle version tracking for artifact views
  if (viewType === 'artifact' && data.artifactId) {
    const artifactId = data.artifactId;
    if (!(artifactId in AppState.activeVersionIdxByArtifact)) {
      const artifact = getArtifact(artifactId);
      if (artifact) setState({ activeVersionIdxByArtifact: { ...AppState.activeVersionIdxByArtifact, [artifactId]: artifact.versions.length - 1 } });
    }
  }
  
  // Render the view with transition option
  if (window.views?.renderCurrentView) {
    window.views.renderCurrentView(withTransition);
  }
}

function setActiveArtifactId(id) {
  // Check if this is a link artifact
  const artifact = getArtifact(id);
  
  if (artifact && artifact.type === 'link') {
    // For link artifacts, open in new tab instead of setting as active view
    const latestVersion = artifact.versions[artifact.versions.length - 1];
    if (latestVersion && latestVersion.content) {
      const url = latestVersion.content.trim();
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    return;
  }
  
  // For all other artifact types, set as active view
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
  return AppState.artifacts.find(a => a.id === id);
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
    artifacts: (memoryData.artifacts || []).filter(a => a.chatId === AppState.activeChatId),
    
    // Current state from context
    activeView: AppState.activeView,
    availableViews: getViewTypes(),
    availableActions: window.actions?.buildActionContext() || {},
    activeChatId: AppState.activeChatId,
    messages: AppState.messages,
    activeVersionIdxByArtifact: AppState.activeVersionIdxByArtifact
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
    window.memory?.loadAll();
    
    // Set up initial active chat from existing data
    const initialChatId = window.memory?.loadActiveChatId() || (AppState.chats[0] && AppState.chats[0].id);
    setState({ activeChatId: initialChatId });
    
    // Create new chat if none exist
    if (!AppState.activeChatId && AppState.chats.length === 0) {
      window.actions?.executeAction('chat.create', {});
    } else if (!AppState.activeChatId) {
      setState({ activeChatId: AppState.chats[0].id });
    }
    
    // Restore active view for current chat
    if (AppState.activeChatId) {
      const restoredView = window.memory?.loadActiveView();
      if (restoredView) {
        // Validate the restored view
        if (restoredView.type === 'artifact' && restoredView.data.artifactId) {
          const artifact = AppState.artifacts.find(a => a.id === restoredView.data.artifactId && a.chatId === AppState.activeChatId);
          if (artifact) {
            setState({ activeView: restoredView });
          } else {
            setState({ activeView: null });
          }
        } else if (restoredView.type !== 'artifact') {
          // System views (calendar, etc.) are always valid
          setState({ activeView: restoredView });
        } else {
          setState({ activeView: null });
        }
      } else {
        setState({ activeView: null });
      }
    }
  } else {
    // GUEST: Start fresh with empty state
    console.log('[CONTEXT] Initializing fresh session for guest user');
    
    // Initialize with empty state (no data loading)
    setState({
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
    window.actions?.executeAction('chat.create', {});
  }
}

// =================== Module Exports & Global Interface ===================

window.context = {
  // Core lifecycle
  init,
  setState,
  getContext,
  
  // Chat management
  setActiveChat,
  loadChat,
  setActiveMessages,
  getActiveChatId: () => AppState.activeChatId,
  getChats: () => AppState.chats,
  getMessages: () => AppState.messages,
  getMessagesByChat: () => AppState.messagesByChat,
  
  // View management
  setActiveView,
  setActiveArtifactId,
  getActiveView: () => AppState.activeView,
  getViewTypes,
  clearUI,
  
  // Artifact management
  getArtifact,
  findCurrentChatArtifact: (artifactId) => AppState.artifacts.find(a => a.id === artifactId && a.chatId === AppState.activeChatId),
  getArtifacts: () => AppState.artifacts,
  getCurrentChatArtifacts: () => AppState.artifacts.filter(a => a.chatId === AppState.activeChatId),
  getActiveVersionIndex: (artifactId) => AppState.activeVersionIdxByArtifact[artifactId],
  setActiveVersionIndex: (artifactId, index) => setState({ 
    activeVersionIdxByArtifact: { ...AppState.activeVersionIdxByArtifact, [artifactId]: index } 
  }),
  
  // User preferences
  getUserPreferences,
  setUserPreferences,
  
  // Message navigation
  getActiveMessageIndex: () => AppState.activeMessageIndex,
  setActiveMessageIndex: (index) => setState({ activeMessageIndex: index }),
  getShowAllMessages: () => AppState.showAllMessages,
  setShowAllMessages: (show) => setState({ showAllMessages: show }),
  
  // UI elements (these may be needed by other modules)
  getMessagesContainer: () => AppState.messagesContainer,
  setMessagesContainer: (container) => setState({ messagesContainer: container }),
  getViewElement: () => AppState.viewElement,
  setViewElement: (element) => setState({ viewElement: element })
};

// AppState is now properly encapsulated - all external access goes through window.context interface