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

function createNewChat(timestamp = null, title = null) {
  resetAppStateForChat();
  const id = Date.now().toString();
  const chatTitle = title && typeof title === 'string' && title.trim() ? title.trim() : "New Chat";
  const chatTimestamp = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();
  const chat = { id, title: chatTitle, timestamp: chatTimestamp };
  setState({
    chats: [...AppState.chats, chat],
    messagesByChat: { ...AppState.messagesByChat, [id]: [] }
  });
  window.memory?.saveAll();
  switchChat(id);
  return id; // Return the chat ID for convenience
}

function switchChat(id) {
  if (AppState.activeChatId) {
    window.memory?.saveActiveView(AppState.activeView || null);
  }
  resetAppStateForChat();
  setActiveChat(id);
  
  const restoredView = window.memory?.loadActiveView();
  if (restoredView) {
    // Validate the restored view
    if (restoredView.type === 'artifact' && restoredView.data.artifactId) {
      const artifact = AppState.artifacts.find(a => a.id === restoredView.data.artifactId && a.chatId === id);
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
  clearUI();
  loadChat();
  // Note: artifacts are loaded through memory module, not a separate loadArtifacts call
  
  const messages = AppState.messagesByChat[id] || [];
  if (messages.length === 0) {
    // Show input for new chats
    if (window.inputModule) {
      window.inputModule.show();
    }
  }
  
  // Render the current view (welcome if activeView is null)
  if (window.views?.renderCurrentView) {
    window.views.renderCurrentView();
  }
}

function renameChat(chatId, newTitle) {
  console.log(`[CONTEXT] Attempting to rename chat: ${chatId} to "${newTitle}"`);
  
  // Validate inputs
  if (!chatId || !newTitle || typeof newTitle !== 'string') {
    console.error('[CONTEXT] Invalid parameters for chat rename');
    return false;
  }
  
  const trimmedTitle = newTitle.trim();
  if (trimmedTitle.length === 0) {
    console.error('[CONTEXT] Chat title cannot be empty');
    return false;
  }
  
  // Find the chat
  const chatIndex = AppState.chats.findIndex(c => c.id === chatId);
  if (chatIndex === -1) {
    console.error(`[CONTEXT] Chat ${chatId} not found`);
    return false;
  }
  
  try {
    const oldTitle = AppState.chats[chatIndex].title;
    console.log(`[CONTEXT] Renaming chat "${oldTitle}" to "${trimmedTitle}"`);
    
    // Update the chat in the chats array
    const updatedChats = [...AppState.chats];
    updatedChats[chatIndex] = {
      ...updatedChats[chatIndex],
      title: trimmedTitle
    };
    
    // Update state
    setState({ chats: updatedChats });
    
    // Persist changes
    window.memory?.saveAll();
    
    // Notify sync system about the change
    if (window.memory?.events) {
      window.memory.events.dispatchEvent(new CustomEvent('dataChanged', {
        detail: { 
          type: 'chatRenamed', 
          data: { 
            chatId, 
            oldTitle,
            newTitle: trimmedTitle
          } 
        }
      }));
    }
    
    // If views are available, re-render current view to reflect the change
    if (window.views?.renderCurrentView) {
      window.views.renderCurrentView();
    }
    
    console.log(`[CONTEXT] Successfully renamed chat from "${oldTitle}" to "${trimmedTitle}"`);
    return true;
    
  } catch (error) {
    console.error('[CONTEXT] Error renaming chat:', error);
    return false;
  }
}

function deleteChat(chatIdToDelete) {
  console.log(`[CONTEXT] Attempting to delete chat: ${chatIdToDelete}`);
  
  // Validate chat exists
  const chatIndex = AppState.chats.findIndex(c => c.id === chatIdToDelete);
  if (chatIndex === -1) {
    console.error(`[CONTEXT] Chat ${chatIdToDelete} not found`);
    return false;
  }

  // Prevent deleting the last chat
  if (AppState.chats.length <= 1) {
    console.error('[CONTEXT] Cannot delete the last remaining chat');
    return false;
  }

  try {
    const deletedChat = AppState.chats[chatIndex];
    console.log(`[CONTEXT] Deleting chat "${deletedChat.title}" (${chatIdToDelete})`);

    // 1. Remove chat from chats array
    const updatedChats = AppState.chats.filter(c => c.id !== chatIdToDelete);
    
    // 2. Remove all messages for this chat
    const updatedMessagesByChat = { ...AppState.messagesByChat };
    delete updatedMessagesByChat[chatIdToDelete];
    
    // 3. Remove all artifacts for this chat
    const updatedArtifacts = AppState.artifacts.filter(a => a.chatId !== chatIdToDelete);
    const deletedArtifactCount = AppState.artifacts.length - updatedArtifacts.length;
    
    // 4. Clear action history for this chat
    if (window.actions?.clearActionHistory) {
      window.actions.clearActionHistory(chatIdToDelete);
    }
    
    // 5. Update state
    setState({
      chats: updatedChats,
      messagesByChat: updatedMessagesByChat,
      artifacts: updatedArtifacts
    });
    
    // 6. Handle active chat switching
    let newActiveChatId = null;
    if (AppState.activeChatId === chatIdToDelete) {
      // Switch to the most recent chat or create a new one
      if (updatedChats.length > 0) {
        // Find the most recent chat by timestamp
        const sortedChats = updatedChats.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        newActiveChatId = sortedChats[0].id;
        console.log(`[CONTEXT] Switching to most recent chat: ${newActiveChatId}`);
      } else {
        // This shouldn't happen due to our check above, but handle gracefully
        console.log('[CONTEXT] No chats remaining, creating new chat');
        createNewChat();
        return true; // createNewChat handles persistence
      }
    }
    
    // 7. Persist changes
    window.memory?.saveAll();
    
    // 8. Switch to new active chat if needed
    if (newActiveChatId) {
      switchChat(newActiveChatId);
    } else {
      // If no chat to switch to, make sure view is updated
      setState({ activeView: null });
      if (window.views?.renderCurrentView) {
        window.views.renderCurrentView();
      }
    }
    
    // 9. Notify sync system about deletion
    if (window.memory?.events) {
      window.memory.events.dispatchEvent(new CustomEvent('dataChanged', {
        detail: { 
          type: 'chatDeleted', 
          data: { 
            chatId: chatIdToDelete, 
            title: deletedChat.title,
            deletedArtifactCount
          } 
        }
      }));
    }
    
    console.log(`[CONTEXT] Successfully deleted chat "${deletedChat.title}" and ${deletedArtifactCount} artifacts`);
    return true;
    
  } catch (error) {
    console.error('[CONTEXT] Error deleting chat:', error);
    return false;
  }
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

function setActiveView(viewType, data = {}) {
  // Handle null viewType by setting activeView to null (shows welcome or empty state)
  if (viewType === null || viewType === undefined) {
    if (AppState.activeView === null) return; // Already null, no change needed
    setState({ activeView: null });
    window.memory?.saveActiveView(null);
    if (window.views?.renderCurrentView) {
      window.views.renderCurrentView();
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
  
  // Render the view
  if (window.views?.renderCurrentView) {
    window.views.renderCurrentView();
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
      createNewChat();
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
    createNewChat();
  }
}

// =================== Module Exports & Global Interface ===================

window.context = {
  // Core lifecycle
  init,
  setState,
  getContext,
  
  // Chat management
  createNewChat,
  switchChat,
  setActiveChat,
  renameChat,
  deleteChat,
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