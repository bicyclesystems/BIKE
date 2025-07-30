// =================== Storage Keys ===================
const CHATS_KEY = "chats";
const MESSAGES_KEY = "messagesByChat";
const ARTIFACTS_KEY = "artifacts";
const USER_PREFERENCES_KEY = "userPreferences";
const SYNC_QUEUE_KEY = "syncQueue";

// =================== Debounced localStorage System ===================
const SAVE_DEBOUNCE_DELAY = 500; // 500ms debounce for localStorage saves
let saveTimeouts = {
  chats: null,
  messages: null,
  artifacts: null,
  userPreferences: null,
  syncQueue: null,
  activeView: null,
  activeChatId: null,
};

// Debounced save functions
function debouncedSaveChats() {
  if (saveTimeouts.chats) {
    clearTimeout(saveTimeouts.chats);
  }
  saveTimeouts.chats = setTimeout(() => {
    localStorage.setItem(CHATS_KEY, JSON.stringify(AppState.chats));
    saveTimeouts.chats = null;
    
  }, SAVE_DEBOUNCE_DELAY);
}

function debouncedSaveMessages() {
  if (saveTimeouts.messages) {
    clearTimeout(saveTimeouts.messages);
  }
  saveTimeouts.messages = setTimeout(() => {
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(AppState.messagesByChat));
    saveTimeouts.messages = null;
    
  }, SAVE_DEBOUNCE_DELAY);
}

function debouncedSaveArtifacts() {
  if (saveTimeouts.artifacts) {
    clearTimeout(saveTimeouts.artifacts);
  }
  saveTimeouts.artifacts = setTimeout(() => {
    localStorage.setItem(ARTIFACTS_KEY, JSON.stringify(AppState.artifacts));
    saveTimeouts.artifacts = null;
    
  }, SAVE_DEBOUNCE_DELAY);
}

function debouncedSaveUserPreferences() {
  if (saveTimeouts.userPreferences) {
    clearTimeout(saveTimeouts.userPreferences);
  }
  saveTimeouts.userPreferences = setTimeout(() => {
    localStorage.setItem(USER_PREFERENCES_KEY, JSON.stringify(userPreferences));
    saveTimeouts.userPreferences = null;
    
  }, SAVE_DEBOUNCE_DELAY);
}

function debouncedSaveActiveView(view) {
  if (saveTimeouts.activeView) {
    clearTimeout(saveTimeouts.activeView);
  }
  saveTimeouts.activeView = setTimeout(() => {
    localStorage.setItem("activeView", JSON.stringify(view));
    saveTimeouts.activeView = null;
    
  }, SAVE_DEBOUNCE_DELAY);
}

function debouncedSaveActiveChatId(chatId) {
  if (saveTimeouts.activeChatId) {
    clearTimeout(saveTimeouts.activeChatId);
  }
  saveTimeouts.activeChatId = setTimeout(() => {
    localStorage.setItem("activeChatId", chatId);
    saveTimeouts.activeChatId = null;
    
  }, SAVE_DEBOUNCE_DELAY);
}

function debouncedSaveSyncQueue(queue) {
  if (saveTimeouts.syncQueue) {
    clearTimeout(saveTimeouts.syncQueue);
  }
  saveTimeouts.syncQueue = setTimeout(() => {
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
    saveTimeouts.syncQueue = null;
    
  }, SAVE_DEBOUNCE_DELAY);
}

// Force immediate save when needed (e.g., page unload)
function flushAllPendingSaves() {
  Object.keys(saveTimeouts).forEach((key) => {
    if (saveTimeouts[key]) {
      clearTimeout(saveTimeouts[key]);
      saveTimeouts[key] = null;
    }
  });

  // Immediate saves of all data
  localStorage.setItem(CHATS_KEY, JSON.stringify(AppState.chats));
  localStorage.setItem(MESSAGES_KEY, JSON.stringify(AppState.messagesByChat));
  localStorage.setItem(ARTIFACTS_KEY, JSON.stringify(AppState.artifacts));
  localStorage.setItem(USER_PREFERENCES_KEY, JSON.stringify(userPreferences));

  // Note: activeView and activeChatId are saved when they change,
  // so no need to force flush them here as they're not frequently changing

}

// Set up page unload handler to ensure data is saved
window.addEventListener("beforeunload", flushAllPendingSaves);
window.addEventListener("pagehide", flushAllPendingSaves);

// =================== IndexedDB Configuration ===================
const DB_NAME = "BikeDB";
const DB_VERSION = 1;
const STORE_NAMES = {
  artifacts: "artifacts",
};

let indexedDB_instance = null;

// =================== Event System for Sync Communication ===================
const memoryEvents = new EventTarget();

function dispatchDataChange(type, data) {
  memoryEvents.dispatchEvent(
    new CustomEvent("dataChanged", {
      detail: { type, data },
    })
  );
}

// =================== IndexedDB Setup ===================
async function initIndexedDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      console.warn(
        "[MEMORY] IndexedDB not supported, falling back to localStorage"
      );
      resolve(null);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.warn(
        "[MEMORY] IndexedDB failed to open, falling back to localStorage"
      );
      resolve(null);
    };

    request.onsuccess = (event) => {
      indexedDB_instance = event.target.result;
  
      resolve(indexedDB_instance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create artifacts store
      if (!db.objectStoreNames.contains(STORE_NAMES.artifacts)) {
        const artifactsStore = db.createObjectStore(STORE_NAMES.artifacts, {
          keyPath: "id",
        });
        artifactsStore.createIndex("chatId", "chatId", { unique: false });
        artifactsStore.createIndex("type", "type", { unique: false });
        artifactsStore.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
  });
}

// =================== IndexedDB Artifact Operations ===================
async function saveArtifactsToIndexedDB() {
  if (!indexedDB_instance) return false;

  try {
    const transaction = indexedDB_instance.transaction(
      [STORE_NAMES.artifacts],
      "readwrite"
    );
    const store = transaction.objectStore(STORE_NAMES.artifacts);

    // Clear existing artifacts and add current ones
    await new Promise((resolve, reject) => {
      const clearRequest = store.clear();
      clearRequest.onsuccess = () => resolve();
      clearRequest.onerror = () => reject(clearRequest.error);
    });

    // Add all current artifacts
    for (const artifact of AppState.artifacts) {
      await new Promise((resolve, reject) => {
        const addRequest = store.add(artifact);
        addRequest.onsuccess = () => resolve();
        addRequest.onerror = () => reject(addRequest.error);
      });
    }


    return true;
  } catch (error) {
    console.error("[MEMORY] Failed to save artifacts to IndexedDB:", error);
    return false;
  }
}

async function loadArtifactsFromIndexedDB() {
  if (!indexedDB_instance) return null;

  try {
    const transaction = indexedDB_instance.transaction(
      [STORE_NAMES.artifacts],
      "readonly"
    );
    const store = transaction.objectStore(STORE_NAMES.artifacts);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
    
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("[MEMORY] Failed to load artifacts from IndexedDB:", error);
    return null;
  }
}

// =================== Core Data Persistence ===================
function saveAll(immediate = false) {
  if (immediate) {
    // Immediate saves for critical operations (like page unload)
    localStorage.setItem(CHATS_KEY, JSON.stringify(AppState.chats));
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(AppState.messagesByChat));
    localStorage.setItem(ARTIFACTS_KEY, JSON.stringify(AppState.artifacts));
  
  } else {
    // Use debounced saves for better performance
    debouncedSaveChats();
    debouncedSaveMessages();
    debouncedSaveArtifacts();
  
  }

  // Also save to IndexedDB if available
  saveArtifactsToIndexedDB().catch((error) => {
    console.warn(
      "[MEMORY] IndexedDB save failed, localStorage backup available:",
      error
    );
  });

  // Notify sync system that data has changed
  dispatchDataChange("all", {
    chats: AppState.chats,
    messagesByChat: AppState.messagesByChat,
    artifacts: AppState.artifacts,
  });
}

function loadAll() {
  setState({
    chats: JSON.parse(localStorage.getItem(CHATS_KEY) || "[]"),
    messagesByChat: JSON.parse(localStorage.getItem(MESSAGES_KEY) || "{}"),
    artifacts: JSON.parse(localStorage.getItem(ARTIFACTS_KEY) || "[]"),
  });
}

async function saveArtifacts() {
  console.log('[MEMORY] 💾 saveArtifacts called with', AppState.artifacts.length, 'artifacts');
  
  // Use debounced save for better performance
  debouncedSaveArtifacts();

  // Also save to IndexedDB asynchronously
  try {
    await saveArtifactsToIndexedDB();
    console.log('[MEMORY] ✅ Artifacts saved to IndexedDB');
  } catch (error) {
    console.warn(
      "[MEMORY] IndexedDB artifact save failed, localStorage backup available:",
      error
    );
  }

  // Notify sync system that artifacts have changed
  console.log('[MEMORY] 🔄 Dispatching data change event for artifacts...');
  dispatchDataChange("artifacts", AppState.artifacts);
  console.log('[MEMORY] ✅ Data change event dispatched');
}

async function loadArtifacts() {
  let artifacts = null;

  // Try IndexedDB first
  try {
    artifacts = await loadArtifactsFromIndexedDB();
  } catch (error) {
    console.warn("[MEMORY] IndexedDB artifact load failed:", error);
  }

  // Fallback to localStorage
  if (!artifacts) {
    const saved = localStorage.getItem(ARTIFACTS_KEY);
    if (saved) {
      artifacts = JSON.parse(saved);
  
    }
  }

  if (artifacts) {
    setState({ artifacts });
  }
}

// =================== Individual Item Persistence ===================
async function saveChat(chat) {
  console.log("[COLLAB-DEBUG] 💾 === MEMORY SAVE CHAT START ===");
  console.log("[COLLAB-DEBUG] 📋 Chat:", chat);

  try {
    // Step 1: Save to database first
    console.log("[COLLAB-DEBUG] 🔍 Checking sync manager availability...");
    console.log("[COLLAB-DEBUG] 📊 Sync manager available:", !!window.syncManager);
    console.log("[COLLAB-DEBUG] 📊 Upload chat function available:", !!window.syncManager?.uploadChat);
    
    if (window.syncManager?.uploadChat) {
      console.log("[COLLAB-DEBUG] 📤 === SYNC MANAGER UPLOAD ATTEMPT ===");
      console.log("[COLLAB-DEBUG] 📋 Calling uploadChat with:", chat);
      await window.syncManager.uploadChat(chat);
      console.log("[COLLAB-DEBUG] ✅ Chat uploaded to database successfully");
    } else {
      console.warn("[COLLAB-DEBUG] ⚠️ No sync manager available - skipping database save");
      console.log("[COLLAB-DEBUG] 🔍 Debug info:", {
        hasSyncManager: !!window.syncManager,
        hasUploadChat: !!window.syncManager?.uploadChat,
        syncManagerKeys: window.syncManager ? Object.keys(window.syncManager) : 'N/A'
      });
    }

    // Step 2: Save to local state
    console.log("[COLLAB-DEBUG] 💾 === LOCAL STATE SAVE ===");
    console.log("[COLLAB-DEBUG] 📊 Current AppState.chats count:", AppState.chats.length);
    
    const chats = [...AppState.chats];
    const existingIndex = chats.findIndex((c) => c.id === chat.id);

    if (existingIndex >= 0) {
      chats[existingIndex] = chat;
      console.log("[COLLAB-DEBUG] 📝 Updated existing chat in local state");
    } else {
      chats.push(chat);
      console.log("[COLLAB-DEBUG] 📝 Added new chat to local state");
    }

    setState({ chats });
    debouncedSaveChats(); // Save to localStorage

    // Sync chat to collaboration (like messages do)
    if (window.collaboration && window.collaboration.pushChatToCollab) {
      console.log("[COLLAB-DEBUG] 📤 Pushing chat to collaboration from saveChat...");
      window.collaboration.pushChatToCollab(chat);
      console.log("[COLLAB-DEBUG] ✅ Chat pushed to collaboration from saveChat");
    } else {
      console.log("[COLLAB-DEBUG] ⚠️ Collaboration sync not available for chat in saveChat");
    }

    console.log("[COLLAB-DEBUG] ✅ Chat saved successfully (DB + Local)");
    return { success: true, chat };

  } catch (error) {
    console.error("[COLLAB-DEBUG] ❌ === MEMORY SAVE CHAT ERROR ===");
    console.error("[COLLAB-DEBUG] Error details:", error);
    console.error("[COLLAB-DEBUG] Stack trace:", error.stack);
    
    // Even if database fails, still save locally for offline functionality
    console.log("[COLLAB-DEBUG] 🔄 Fallback: Saving chat to local state only...");
  const chats = [...AppState.chats];
  const existingIndex = chats.findIndex((c) => c.id === chat.id);

  if (existingIndex >= 0) {
    chats[existingIndex] = chat;
  } else {
    chats.push(chat);
  }

  setState({ chats });
    debouncedSaveChats();

    // Notify sync system for retry
    console.log("[COLLAB-DEBUG] 📡 Dispatching data change event for retry...");
  dispatchDataChange("chat", chat);
    
    return { success: false, error: error.message, savedLocally: true };
  }
}

async function saveMessage(chatId, message) {
  console.log("[COLLAB-DEBUG] 💾 === MEMORY SAVE MESSAGE START ===");
  console.log("[COLLAB-DEBUG] 📋 Chat ID:", chatId);
  console.log("[COLLAB-DEBUG] 📋 Message:", message);

  try {
    // Step 1: Save to database first
    console.log("[COLLAB-DEBUG] 🔍 Checking sync manager availability...");
    console.log("[COLLAB-DEBUG] 📊 Sync manager available:", !!window.syncManager);
    console.log("[COLLAB-DEBUG] 📊 Upload message function available:", !!window.syncManager?.uploadMessage);
    
    if (window.syncManager?.uploadMessage) {
      console.log("[COLLAB-DEBUG] 📤 === SYNC MANAGER UPLOAD ATTEMPT ===");
      console.log("[COLLAB-DEBUG] 📋 Calling uploadMessage with:", { chatId, message });
      await window.syncManager.uploadMessage(chatId, message);
      console.log("[COLLAB-DEBUG] ✅ Message uploaded to database successfully");
    } else {
      console.warn("[COLLAB-DEBUG] ⚠️ No sync manager available - skipping database save");
      console.log("[COLLAB-DEBUG] 🔍 Debug info:", {
        hasSyncManager: !!window.syncManager,
        hasUploadMessage: !!window.syncManager?.uploadMessage,
        syncManagerKeys: window.syncManager ? Object.keys(window.syncManager) : 'N/A'
      });
    }

    // Step 2: Save to local state
    console.log("[COLLAB-DEBUG] 💾 === LOCAL STATE SAVE ===");
    console.log("[COLLAB-DEBUG] 📊 Current AppState.messagesByChat keys:", Object.keys(AppState.messagesByChat || {}));
    
    const messagesByChat = { ...AppState.messagesByChat };
    if (!messagesByChat[chatId]) {
      messagesByChat[chatId] = [];
      console.log("[COLLAB-DEBUG] 📝 Created new chat array for chatId:", chatId);
    }

    console.log("[COLLAB-DEBUG] 📊 Messages in chat before save:", messagesByChat[chatId].length);
    messagesByChat[chatId].push(message);
    console.log("[COLLAB-DEBUG] 📊 Messages in chat after save:", messagesByChat[chatId].length);
    
    setState({ messagesByChat });
    debouncedSaveMessages(); // Save to localStorage

    console.log("[COLLAB-DEBUG] ✅ Message saved successfully (DB + Local)");
    return { success: true, chatId, message };

  } catch (error) {
    console.error("[COLLAB-DEBUG] ❌ === MEMORY SAVE ERROR ===");
    console.error("[COLLAB-DEBUG] Error details:", error);
    console.error("[COLLAB-DEBUG] Stack trace:", error.stack);
    
    // Even if database fails, still save locally for offline functionality
    console.log("[COLLAB-DEBUG] 🔄 Fallback: Saving message to local state only...");
  const messagesByChat = { ...AppState.messagesByChat };
  if (!messagesByChat[chatId]) {
    messagesByChat[chatId] = [];
  }

  messagesByChat[chatId].push(message);
  setState({ messagesByChat });
    debouncedSaveMessages();

    // Notify sync system for retry
    console.log("[COLLAB-DEBUG] 📡 Dispatching data change event for retry...");
  dispatchDataChange("message", { chatId, message });
    
    return { success: false, error: error.message, savedLocally: true };
  }
}

function deleteChat(chatId) {

  
  try {
    // 1. Remove chat from chats array
    const updatedChats = AppState.chats.filter((c) => c.id !== chatId);

    // 2. Remove messages for this chat
    const updatedMessagesByChat = { ...AppState.messagesByChat };
    delete updatedMessagesByChat[chatId];

    // 3. Remove artifacts for this chat
    const updatedArtifacts = AppState.artifacts.filter(
      (a) => a.chatId !== chatId
    );

    // 4. Update state
    setState({
      chats: updatedChats,
      messagesByChat: updatedMessagesByChat,
      artifacts: updatedArtifacts,
    });

    // 5. Use debounced saves for better performance
    debouncedSaveChats();
    debouncedSaveMessages();
    debouncedSaveArtifacts();

    // 6. Update IndexedDB for artifacts
    saveArtifactsToIndexedDB().catch((error) => {
      console.warn(
        "[MEMORY] IndexedDB update failed after chat deletion:",
        error
      );
    });

    // 7. Clear activeChatId if it was the deleted chat (immediate save for consistency)
    const currentActiveChatId = loadActiveChatId();
    if (currentActiveChatId === chatId) {
      localStorage.removeItem("activeChatId");
    }

    // 8. Delete from database if sync is available
    if (window.syncManager?.deleteChatFromDatabase) {
      // Don't await this - let it happen in background
      window.syncManager.deleteChatFromDatabase(chatId).catch((error) => {
        console.warn("[MEMORY] Failed to delete chat from database:", error);
      });
    }

    // 9. Notify sync system
    dispatchDataChange('chatDeleted', { chatId });
    
  
    return true;
  } catch (error) {
    console.error("[MEMORY] Error deleting chat:", error);
    return false;
  }
}

async function saveArtifact(artifact) {
  console.log("[COLLAB-DATA] 💾 Saving artifact - Database First approach...");
  console.log("[COLLAB-DATA] 📋 Artifact:", artifact);

  try {
    // Step 1: Save to database first
    if (window.syncManager?.uploadArtifact) {
      console.log("[COLLAB-DATA] 📤 Uploading artifact to database...");
      await window.syncManager.uploadArtifact(artifact);
      console.log("[COLLAB-DATA] ✅ Artifact uploaded to database successfully");
    } else {
      console.warn("[COLLAB-DATA] ⚠️ No sync manager available - skipping database save");
    }

    // Step 2: Save to local state
    console.log("[COLLAB-DATA] 💾 Saving artifact to local state...");
    const artifacts = [...AppState.artifacts];
    const existingIndex = artifacts.findIndex((a) => a.id === artifact.id);

    if (existingIndex >= 0) {
      artifacts[existingIndex] = artifact;
      console.log("[COLLAB-DATA] 📝 Updated existing artifact in local state");
    } else {
      artifacts.push(artifact);
      console.log("[COLLAB-DATA] 📝 Added new artifact to local state");
    }

    setState({ artifacts });
    debouncedSaveArtifacts(); // Save to localStorage

    // Also save to IndexedDB asynchronously
    saveArtifactsToIndexedDB().catch((error) => {
      console.warn("[COLLAB-DATA] ⚠️ IndexedDB artifact save failed:", error);
    });

    console.log("[COLLAB-DATA] ✅ Artifact saved successfully (DB + Local)");
    return { success: true, artifact };

  } catch (error) {
    console.error("[COLLAB-DATA] ❌ Error saving artifact:", error);
    
    // Even if database fails, still save locally for offline functionality
    console.log("[COLLAB-DATA] 🔄 Fallback: Saving artifact to local state only...");
  const artifacts = [...AppState.artifacts];
  const existingIndex = artifacts.findIndex((a) => a.id === artifact.id);

  if (existingIndex >= 0) {
    artifacts[existingIndex] = artifact;
  } else {
    artifacts.push(artifact);
  }

  setState({ artifacts });
    debouncedSaveArtifacts();

  // Also save to IndexedDB asynchronously
  saveArtifactsToIndexedDB().catch((error) => {
      console.warn("[COLLAB-DATA] ⚠️ IndexedDB artifact save failed:", error);
  });

    // Notify sync system for retry
  dispatchDataChange("artifact", artifact);
    
    return { success: false, error: error.message, savedLocally: true };
  }
}

// =================== Chat Persistence ===================
function saveActiveView(view) {
  debouncedSaveActiveView(view); // Use debounced save for consistency
}

function loadActiveView() {
  return JSON.parse(localStorage.getItem("activeView") || "null");
}

function saveActiveChatId(chatId) {
  debouncedSaveActiveChatId(chatId); // Use debounced save for consistency
}

function loadActiveChatId() {
  return localStorage.getItem("activeChatId");
}

// =================== User Preferences Persistence ===================
let userPreferences = {}; // In-memory cache for user preferences

function saveUserPreferences(preferences) {
  userPreferences = preferences; // Set to exactly what was passed (already merged)

  debouncedSaveUserPreferences(); // Use debounced save instead of immediate save

  // Notify sync system
  dispatchDataChange("userPreferences", preferences);
}

function loadUserPreferences() {
  const saved = JSON.parse(localStorage.getItem(USER_PREFERENCES_KEY) || "{}");

  // Migrate aiTraits from string to array if needed
  if (saved.aiTraits && typeof saved.aiTraits === 'string') {

    const traits = saved.aiTraits.split(',').map(trait => trait.trim().toLowerCase()).filter(Boolean);
    saved.aiTraits = traits;

    // Save the migrated format immediately
    saveUserPreferences(saved);
  }

  userPreferences = saved; // Update in-memory cache
  return saved;
}

function getUserPreferences() {
  return userPreferences;
}

function setUserPreferences(preferences) {
  const updatedPrefs = { ...userPreferences, ...preferences };
  saveUserPreferences(updatedPrefs);
}

// =================== Sync Queue Management ===================
function saveSyncQueue(queue) {
  debouncedSaveSyncQueue(queue); // Use debounced save for consistency
}

function loadSyncQueue() {
  return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || "[]");
}

function clearSyncQueue() {
  localStorage.removeItem(SYNC_QUEUE_KEY);
}

// =================== Data Cleanup ===================
function purgeAllData() {
  localStorage.removeItem(CHATS_KEY);
  localStorage.removeItem(MESSAGES_KEY);
  localStorage.removeItem(ARTIFACTS_KEY);
  localStorage.removeItem("activeChatId");
  localStorage.removeItem("activeView");
  localStorage.removeItem(USER_PREFERENCES_KEY);
  localStorage.removeItem(SYNC_QUEUE_KEY);

  // Also clear IndexedDB
  if (indexedDB_instance) {
    try {
      const transaction = indexedDB_instance.transaction(
        [STORE_NAMES.artifacts],
        "readwrite"
      );
      const store = transaction.objectStore(STORE_NAMES.artifacts);
      store.clear();
  
    } catch (error) {
      console.error("[MEMORY] Failed to clear IndexedDB:", error);
    }
  }
}

// =================== Initialization ===================
async function initMemory() {
  await initIndexedDB();
  // Load artifacts using the new hybrid approach
  await loadArtifacts();
  // Load user preferences into in-memory cache
  loadUserPreferences();
}

// =================== Debugging and Status ===================
function getStorageStatus() {
  return {
    indexedDBAvailable: !!indexedDB_instance,
    indexedDBName: DB_NAME,
    localStorageSize: JSON.stringify(AppState.artifacts).length,
    artifactCount: AppState.artifacts.length,
    lastOperation: new Date().toISOString(),
  };
}

// =================== AI Context Data Provider ===================
function getContextData() {
  return {
    userPreferences: userPreferences,
    chats: AppState.chats,
    artifacts: AppState.artifacts,
    messagesByChat: AppState.messagesByChat,
    storageStatus: getStorageStatus(),
  };
}

// =================== Public API ===================
window.memory = {
  // Core operations
  saveAll,
  loadAll,
  saveArtifacts,
  loadArtifacts,

  // Individual item operations
  saveChat,
  saveMessage,
  saveArtifact,
  deleteChat,

  // View state
  saveActiveView,
  loadActiveView,
  saveActiveChatId,
  loadActiveChatId,

  // User preferences
  saveUserPreferences,
  loadUserPreferences,
  getUserPreferences,
  setUserPreferences,

  // Sync queue management
  saveSyncQueue,
  loadSyncQueue,
  clearSyncQueue,

  // Cleanup and status
  purgeAllData,
  initMemory,
  getStorageStatus,

  // Performance optimization
  flushAllPendingSaves, // Force immediate save of all pending data

  // AI Context data provider
  getContextData,

  // Event system for sync communication
  events: memoryEvents,
};
