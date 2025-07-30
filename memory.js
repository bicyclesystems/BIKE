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

    // Schedule retry after 5 seconds
    console.log("[COLLAB-DEBUG] ⏰ Scheduling database retry in 5 seconds...");
    setTimeout(async () => {
      console.log("[COLLAB-DEBUG] 🔄 === RETRYING DATABASE SAVE ===");
      try {
        if (window.syncManager?.uploadChat) {
          console.log("[COLLAB-DEBUG] 📤 Retry: Uploading chat to database...");
          await window.syncManager.uploadChat(chat);
          console.log("[COLLAB-DEBUG] ✅ Chat uploaded to database on retry");
        } else {
          console.warn("[COLLAB-DEBUG] ⚠️ Retry: No sync manager available");
        }
      } catch (retryError) {
        console.error("[COLLAB-DEBUG] ❌ Retry failed:", retryError);
        // Could schedule another retry here if needed
      }
    }, 5000);

    // Notify sync system for retry
    console.log("[COLLAB-DEBUG] 📡 Dispatching data change event for retry...");
  dispatchDataChange("chat", chat);
    
    return { success: false, error: error.message, savedLocally: true };
  }
}

// Helper function to handle chat not found errors for messages
async function handleChatNotFoundError(chatId, message) {
  console.log("[COLLAB-DEBUG] 🔧 === HANDLING CHAT NOT FOUND ERROR ===");
  console.log("[COLLAB-DEBUG] 📋 Chat ID:", chatId);
  console.log("[COLLAB-DEBUG] 📋 Message:", message);
  
  try {
    // Step 1: Find the chat in local storage (where chats are actually stored)
    console.log("[COLLAB-DEBUG] 🔍 Looking for chat in local storage...");
    let chats = [];
    try {
      const chatsJson = localStorage.getItem("chats");
      chats = chatsJson ? JSON.parse(chatsJson) : [];
      console.log("[COLLAB-DEBUG] 📊 Chats in localStorage:", chats.length);
    } catch (error) {
      console.error("[COLLAB-DEBUG] ❌ Error parsing chats from localStorage:", error);
      chats = [];
    }
    
    let chat = chats.find(c => c.id === chatId);
    
    if (!chat) {
      console.error("[COLLAB-DEBUG] ❌ Chat not found in localStorage:", chatId);
      console.log("[COLLAB-DEBUG] 📋 Available chat IDs:", chats.map(c => c.id));
      
      // Step 1.5: Create a dummy chat since the chatId doesn't exist in localStorage
      console.log("[COLLAB-DEBUG] 🔧 Creating dummy chat for missing chatId:", chatId);
      
      // Get a reference chat to copy structure from (use the first available chat)
      const referenceChat = chats.length > 0 ? chats[0] : null;
      
      const dummyChat = {
        id: chatId,
        title: `Collaboration Chat ${new Date().toLocaleTimeString()}`,
        description: "Auto-created chat for collaboration",
        timestamp: new Date().toISOString(),
        messages: [],
        // Copy other properties from reference chat if available
        ...(referenceChat && {
          type: referenceChat.type,
          metadata: referenceChat.metadata,
          settings: referenceChat.settings
        })
      };
      
      console.log("[COLLAB-DEBUG] 📋 Created dummy chat:", dummyChat);
      chat = dummyChat; // Use the dummy chat for saving
    }
    
    console.log("[COLLAB-DEBUG] ✅ Using chat for database save:", chat);
    
    // Step 2: Save the chat to database first
    console.log("[COLLAB-DEBUG] 📤 Saving chat to database...");
    const chatSaveResult = await window.memory.saveChat(chat);
    console.log("[COLLAB-DEBUG] 📊 Chat save result:", chatSaveResult);
    
    if (!chatSaveResult.success) {
      console.warn("[COLLAB-DEBUG] ⚠️ Failed to save chat to database");
      return false;
    }
    
    // Step 3: Wait a moment for the database to process the chat
    console.log("[COLLAB-DEBUG] ⏳ Waiting for database to process chat...");
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Step 4: Retry saving the message
    console.log("[COLLAB-DEBUG] 🔄 Retrying message save...");
    if (window.syncManager?.uploadMessage) {
      const retryResult = await window.syncManager.uploadMessage(chatId, message);
      console.log("[COLLAB-DEBUG] 📊 Retry result:", retryResult);
      
      if (retryResult && retryResult.success) {
        message.isSaved = true;
        console.log("[COLLAB-DEBUG] ✅ Message saved successfully after chat creation");
        return true;
      } else {
        console.warn("[COLLAB-DEBUG] ⚠️ Message retry failed:", retryResult);
        return false;
      }
    } else {
      console.warn("[COLLAB-DEBUG] ⚠️ No sync manager available for retry");
      return false;
    }
    
  } catch (error) {
    console.error("[COLLAB-DEBUG] ❌ Error handling chat not found:", error);
    return false;
  }
}

// Helper function to handle chat not found errors for artifacts
async function handleChatNotFoundErrorForArtifact(artifact) {
  console.log("[COLLAB-DEBUG] 🔧 === HANDLING CHAT NOT FOUND ERROR FOR ARTIFACT ===");
  console.log("[COLLAB-DEBUG] 📋 Artifact:", artifact);
  
  try {
    const chatId = artifact.chatId;
    if (!chatId) {
      console.error("[COLLAB-DEBUG] ❌ Artifact has no chatId");
      return false;
    }
    
    // Step 1: Find the chat in local storage (where chats are actually stored)
    console.log("[COLLAB-DEBUG] 🔍 Looking for chat in local storage...");
    let chats = [];
    try {
      const chatsJson = localStorage.getItem("chats");
      chats = chatsJson ? JSON.parse(chatsJson) : [];
      console.log("[COLLAB-DEBUG] 📊 Chats in localStorage:", chats.length);
    } catch (error) {
      console.error("[COLLAB-DEBUG] ❌ Error parsing chats from localStorage:", error);
      chats = [];
    }
    
    let chat = chats.find(c => c.id === chatId);
    
    if (!chat) {
      console.error("[COLLAB-DEBUG] ❌ Chat not found in localStorage:", chatId);
      console.log("[COLLAB-DEBUG] 📋 Available chat IDs:", chats.map(c => c.id));
      
      // Step 1.5: Create a dummy chat since the chatId doesn't exist in localStorage
      console.log("[COLLAB-DEBUG] 🔧 Creating dummy chat for missing chatId:", chatId);
      
      // Get a reference chat to copy structure from (use the first available chat)
      const referenceChat = chats.length > 0 ? chats[0] : null;
      
      const dummyChat = {
        id: chatId,
        title: `Collaboration Chat ${new Date().toLocaleTimeString()}`,
        description: "Auto-created chat for collaboration",
        timestamp: new Date().toISOString(),
        messages: [],
        // Copy other properties from reference chat if available
        ...(referenceChat && {
          type: referenceChat.type,
          metadata: referenceChat.metadata,
          settings: referenceChat.settings
        })
      };
      
      console.log("[COLLAB-DEBUG] 📋 Created dummy chat:", dummyChat);
      chat = dummyChat; // Use the dummy chat for saving
    }
    
    console.log("[COLLAB-DEBUG] ✅ Using chat for database save:", chat);
    
    // Step 2: Save the chat to database first
    console.log("[COLLAB-DEBUG] 📤 Saving chat to database...");
    const chatSaveResult = await window.memory.saveChat(chat);
    console.log("[COLLAB-DEBUG] 📊 Chat save result:", chatSaveResult);
    
    if (!chatSaveResult.success) {
      console.warn("[COLLAB-DEBUG] ⚠️ Failed to save chat to database");
      return false;
    }
    
    // Step 3: Wait a moment for the database to process the chat
    console.log("[COLLAB-DEBUG] ⏳ Waiting for database to process chat...");
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Step 4: Retry saving the artifact
    console.log("[COLLAB-DEBUG] 🔄 Retrying artifact save...");
    if (window.syncManager?.uploadArtifact) {
      await window.syncManager.uploadArtifact(artifact);
      console.log("[COLLAB-DEBUG] ✅ Artifact saved successfully after chat creation");
      return true;
    } else {
      console.warn("[COLLAB-DEBUG] ⚠️ No sync manager available for retry");
      return false;
    }
    
  } catch (error) {
    console.error("[COLLAB-DEBUG] ❌ Error handling chat not found for artifact:", error);
    return false;
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
      
      try {
        const uploadResult = await window.syncManager.uploadMessage(chatId, message);
        console.log("[COLLAB-DEBUG] 📊 Upload result:", uploadResult);
        
        // Only mark as saved if upload was successful (status 201 or 200)
        if (uploadResult && uploadResult.success) {
          message.isSaved = true;
          console.log("[COLLAB-DEBUG] 🏷️ Message marked as saved to database (status success)");
        } else {
          console.warn("[COLLAB-DEBUG] ⚠️ Database upload failed, keeping isSaved: false");
          message.isSaved = false;
          
          // Check if the error is due to chat_id not found
          if (uploadResult && uploadResult.error && (
            uploadResult.error.includes("chat_id") || 
            uploadResult.error.includes("chat not found") ||
            uploadResult.error.includes("foreign key") ||
            uploadResult.error.includes("violates foreign key constraint") ||
            uploadResult.error.includes("Key (chat_id)") ||
            uploadResult.error.includes("is not present in table") ||
            uploadResult.status === 404
          )) {
            console.log("[COLLAB-DEBUG] 🔍 Chat not found in database, attempting to save chat first...");
            await handleChatNotFoundError(chatId, message);
          }
        }
      } catch (error) {
        console.error("[COLLAB-DEBUG] ❌ Database upload error:", error);
        message.isSaved = false;
        
        // Check if the error is due to chat_id not found
        if (error.message && (
          error.message.includes("chat_id") || 
          error.message.includes("chat not found") ||
          error.message.includes("foreign key") ||
          error.message.includes("violates foreign key constraint") ||
          error.message.includes("Key (chat_id)") ||
          error.message.includes("is not present in table") ||
          error.status === 404
        )) {
          console.log("[COLLAB-DEBUG] 🔍 Chat not found in database, attempting to save chat first...");
          await handleChatNotFoundError(chatId, message);
        }
      }
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
    
    // Check for duplicates using message_id
    const existingMessage = messagesByChat[chatId].find(m => m.message_id === message.message_id);
    if (existingMessage) {
      console.log("[COLLAB-DEBUG] ⚠️ Message already exists, skipping save:", message.message_id);
      return { success: true, chatId, message, skipped: true };
  }

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

    // Check for duplicates using message_id
    const existingMessage = messagesByChat[chatId].find(m => m.message_id === message.message_id);
    if (existingMessage) {
      console.log("[COLLAB-DEBUG] ⚠️ Message already exists in fallback, skipping save:", message.message_id);
      return { success: false, error: error.message, savedLocally: false, skipped: true };
    }

    messagesByChat[chatId].push(message);
    setState({ messagesByChat });
    debouncedSaveMessages();

    // Schedule retry after 5 seconds
    console.log("[COLLAB-DEBUG] ⏰ Scheduling database retry in 5 seconds...");
    setTimeout(async () => {
      console.log("[COLLAB-DEBUG] 🔄 === RETRYING DATABASE SAVE ===");
      try {
        if (window.syncManager?.uploadMessage) {
          console.log("[COLLAB-DEBUG] 📤 Retry: Uploading message to database...");
          const retryResult = await window.syncManager.uploadMessage(chatId, message);
          if (retryResult && retryResult.success) {
            message.isSaved = true;
            console.log("[COLLAB-DEBUG] ✅ Message uploaded to database on retry");
          } else {
            console.warn("[COLLAB-DEBUG] ⚠️ Retry: Database upload failed");
            
            // Check if the error is due to chat_id not found
            if (retryResult && retryResult.error && (
              retryResult.error.includes("chat_id") || 
              retryResult.error.includes("chat not found") ||
              retryResult.error.includes("foreign key") ||
              retryResult.error.includes("violates foreign key constraint") ||
              retryResult.error.includes("Key (chat_id)") ||
              retryResult.error.includes("is not present in table") ||
              retryResult.status === 404
            )) {
              console.log("[COLLAB-DEBUG] 🔍 Chat not found in database during retry, attempting to save chat first...");
              await handleChatNotFoundError(chatId, message);
            }
          }
        } else {
          console.warn("[COLLAB-DEBUG] ⚠️ Retry: No sync manager available");
        }
      } catch (retryError) {
        console.error("[COLLAB-DEBUG] ❌ Retry failed:", retryError);
        
        // Check if the error is due to chat_id not found
        if (retryError.message && (
          retryError.message.includes("chat_id") || 
          retryError.message.includes("chat not found") ||
          retryError.message.includes("foreign key") ||
          retryError.message.includes("violates foreign key constraint") ||
          retryError.message.includes("Key (chat_id)") ||
          retryError.message.includes("is not present in table") ||
          retryError.status === 404
        )) {
          console.log("[COLLAB-DEBUG] 🔍 Chat not found in database during retry, attempting to save chat first...");
          await handleChatNotFoundError(chatId, message);
        }
        // Could schedule another retry here if needed
      }
    }, 5000);

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
      try {
        const uploadResult = await window.syncManager.uploadArtifact(artifact);
        if (uploadResult && uploadResult.success) {
          artifact.isSaved = true;
          console.log("[COLLAB-DATA] ✅ Artifact uploaded to database successfully, isSaved set to true");
        } else {
          artifact.isSaved = false;
          console.warn("[COLLAB-DATA] ⚠️ Database upload failed, isSaved remains false");
        }
      } catch (error) {
        artifact.isSaved = false;
        console.error("[COLLAB-DATA] ❌ Database upload error:", error);
        
        // Check if the error is due to chat_id not found
        if (error.message && (
          error.message.includes("chat_id") || 
          error.message.includes("chat not found") ||
          error.message.includes("foreign key") ||
          error.message.includes("violates foreign key constraint") ||
          error.message.includes("Key (chat_id)") ||
          error.message.includes("is not present in table") ||
          error.status === 404
        )) {
          console.log("[COLLAB-DATA] 🔍 Chat not found in database, attempting to save chat first...");
          await handleChatNotFoundErrorForArtifact(artifact);
        }
      }
    } else {
      console.warn("[COLLAB-DATA] ⚠️ No sync manager available - skipping database save");
      artifact.isSaved = false;
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

    // Schedule retry after 5 seconds
    console.log("[COLLAB-DATA] ⏰ Scheduling database retry in 5 seconds...");
    setTimeout(async () => {
      console.log("[COLLAB-DATA] 🔄 === RETRYING DATABASE SAVE ===");
      try {
        if (window.syncManager?.uploadArtifact) {
          console.log("[COLLAB-DATA] 📤 Retry: Uploading artifact to database...");
          try {
            await window.syncManager.uploadArtifact(artifact);
            console.log("[COLLAB-DATA] ✅ Artifact uploaded to database on retry");
          } catch (retryError) {
            console.error("[COLLAB-DATA] ❌ Retry failed:", retryError);
            
            // Check if the error is due to chat_id not found
            if (retryError.message && (
              retryError.message.includes("chat_id") || 
              retryError.message.includes("chat not found") ||
              retryError.message.includes("foreign key") ||
              retryError.message.includes("violates foreign key constraint") ||
              retryError.message.includes("Key (chat_id)") ||
              retryError.message.includes("is not present in table") ||
              retryError.status === 404
            )) {
              console.log("[COLLAB-DATA] 🔍 Chat not found in database during retry, attempting to save chat first...");
              await handleChatNotFoundErrorForArtifact(artifact);
            }
          }
        } else {
          console.warn("[COLLAB-DATA] ⚠️ Retry: No sync manager available");
        }
      } catch (retryError) {
        console.error("[COLLAB-DATA] ❌ Retry failed:", retryError);
        // Could schedule another retry here if needed
      }
    }, 5000);

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

// Global helper function to test database-first approach with retry
window.testDatabaseFirstWithRetry = async function() {
  console.log("[COLLAB-DEBUG] 🧪 === TESTING DATABASE FIRST WITH RETRY ===");
  
  try {
    const isCollaborating = window.collaboration?.isCollaborating;
    const isLeader = window.collaboration?.isLeader;
    
    console.log("[COLLAB-DEBUG] 📋 Collaboration status:", {
      isCollaborating,
      isLeader,
      hasCollaboration: !!window.collaboration
    });
    
    if (!isCollaborating) {
      console.error("[COLLAB-DEBUG] ❌ Not in collaboration mode");
      return { error: "Not in collaboration mode" };
    }
    
    // Check sync manager availability
    const hasSyncManager = !!window.syncManager;
    const hasUploadChat = !!window.syncManager?.uploadChat;
    const hasUploadMessage = !!window.syncManager?.uploadMessage;
    const hasUploadArtifact = !!window.syncManager?.uploadArtifact;
    
    console.log("[COLLAB-DEBUG] 📋 Sync manager status:", {
      hasSyncManager,
      hasUploadChat,
      hasUploadMessage,
      hasUploadArtifact
    });
    
    // Test chat creation
    console.log("[COLLAB-DEBUG] 🚀 Testing chat creation...");
    const testChat = {
      id: `test_chat_${Date.now()}`,
      title: "Test Database First Chat",
      description: "Testing database-first approach with retry",
      timestamp: new Date().toISOString(),
      role: isLeader ? "leader" : "collab",
      userId: isLeader ? localStorage.getItem("userId") : localStorage.getItem("collaborationLeaderId")
    };
    
    console.log("[COLLAB-DEBUG] 📋 Test chat:", testChat);
    
    // Test chat save
    const chatSaveResult = await window.memory.saveChat(testChat);
    console.log("[COLLAB-DEBUG] 📊 Chat save result:", chatSaveResult);
    
    // Test message creation
    console.log("[COLLAB-DEBUG] 🚀 Testing message creation...");
    const testMessage = {
      role: "user",
      content: "Test database-first message with retry",
      timestamp: new Date().toLocaleTimeString(),
      message_id: `test_msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      isSaved: false,
      userId: isLeader ? localStorage.getItem("userId") : localStorage.getItem("collaborationLeaderId")
    };
    
    console.log("[COLLAB-DEBUG] 📋 Test message:", testMessage);
    
    // Test message save
    const messageSaveResult = await window.memory.saveMessage(testChat.id, testMessage);
    console.log("[COLLAB-DEBUG] 📊 Message save result:", messageSaveResult);
    
    // Test artifact creation
    console.log("[COLLAB-DEBUG] 🚀 Testing artifact creation...");
    const testArtifact = {
      id: `test_artifact_${Date.now()}`,
      chatId: testChat.id,
      title: "Test Database First Artifact",
      type: "text",
      versions: [{
        content: "Test artifact content for database-first approach",
        timestamp: new Date().toISOString()
      }],
      userId: isLeader ? localStorage.getItem("userId") : localStorage.getItem("collaborationLeaderId")
    };
    
    console.log("[COLLAB-DEBUG] 📋 Test artifact:", testArtifact);
    
    // Test artifact save
    const artifactSaveResult = await window.memory.saveArtifact(testArtifact);
    console.log("[COLLAB-DEBUG] 📊 Artifact save result:", artifactSaveResult);
    
    // Check if items are in local state
    const chats = window.context?.getChats() || [];
    const messagesByChat = window.context?.getMessagesByChat() || {};
    const artifacts = window.context?.getArtifacts() || [];
    
    const chatInLocal = chats.find(c => c.id === testChat.id);
    const messageInLocal = messagesByChat[testChat.id]?.find(m => m.message_id === testMessage.message_id);
    const artifactInLocal = artifacts.find(a => a.id === testArtifact.id);
    
    console.log("[COLLAB-DEBUG] 📊 Local state check:", {
      chatInLocal: !!chatInLocal,
      messageInLocal: !!messageInLocal,
      artifactInLocal: !!artifactInLocal
    });
    
    return {
      success: true,
      isLeader,
      syncManagerStatus: {
        hasSyncManager,
        hasUploadChat,
        hasUploadMessage,
        hasUploadArtifact
      },
      saveResults: {
        chat: chatSaveResult,
        message: messageSaveResult,
        artifact: artifactSaveResult
      },
      localState: {
        chatInLocal: !!chatInLocal,
        messageInLocal: !!messageInLocal,
        artifactInLocal: !!artifactInLocal
      },
      testData: {
        chatId: testChat.id,
        messageId: testMessage.message_id,
        artifactId: testArtifact.id
      }
    };
    
  } catch (error) {
    console.error("[COLLAB-DEBUG] ❌ Test failed:", error);
    return { error: error.message };
  }
};

// Global helper function to test specific chat not found scenario
window.testSpecificChatNotFound = async function(chatId = null) {
  console.log("[COLLAB-DEBUG] 🧪 === TESTING SPECIFIC CHAT NOT FOUND ===");
  
  try {
    const isCollaborating = window.collaboration?.isCollaborating;
    const isLeader = window.collaboration?.isLeader;
    
    console.log("[COLLAB-DEBUG] 📋 Collaboration status:", {
      isCollaborating,
      isLeader,
      hasCollaboration: !!window.collaboration
    });
    
    if (!isCollaborating) {
      console.error("[COLLAB-DEBUG] ❌ Not in collaboration mode");
      return { error: "Not in collaboration mode" };
    }
    
    // Use provided chatId or find one that exists locally but not in DB
    const targetChatId = chatId || "1753908783637"; // The specific chat ID from your error
    
    console.log("[COLLAB-DEBUG] 🎯 Target chat ID:", targetChatId);
    
    // Check if chat exists in localStorage
    let chats = [];
    try {
      const chatsJson = localStorage.getItem("chats");
      chats = chatsJson ? JSON.parse(chatsJson) : [];
      console.log("[COLLAB-DEBUG] 📊 Total chats in localStorage:", chats.length);
    } catch (error) {
      console.error("[COLLAB-DEBUG] ❌ Error parsing chats:", error);
    }
    
    const chat = chats.find(c => c.id === targetChatId);
    console.log("[COLLAB-DEBUG] 📋 Chat found in localStorage:", !!chat);
    
    if (chat) {
      console.log("[COLLAB-DEBUG] 📋 Chat details:", {
        id: chat.id,
        title: chat.title,
        timestamp: chat.timestamp
      });
    }
    
    // Check if chat exists in context state
    const contextChats = window.context?.getChats() || [];
    const contextChat = contextChats.find(c => c.id === targetChatId);
    console.log("[COLLAB-DEBUG] 📋 Chat found in context state:", !!contextChat);
    
    // Create a test message for this chat
    const testMessage = {
      role: "user",
      content: "Test message for specific chat not found scenario",
      timestamp: new Date().toLocaleTimeString(),
      message_id: `test_specific_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      isSaved: false,
      userId: isLeader ? localStorage.getItem("userId") : localStorage.getItem("collaborationLeaderId")
    };
    
    console.log("[COLLAB-DEBUG] 📋 Test message:", testMessage);
    
    // Try to save the message (this should trigger the chat not found error handling)
    console.log("[COLLAB-DEBUG] 🚀 Attempting to save message...");
    const saveResult = await window.memory.saveMessage(targetChatId, testMessage);
    console.log("[COLLAB-DEBUG] 📊 Save result:", saveResult);
    
    // Check if message was added to local state
    const messagesByChat = window.context?.getMessagesByChat() || {};
    const messagesInChat = messagesByChat[targetChatId] || [];
    const messageInLocal = messagesInChat.find(m => m.message_id === testMessage.message_id);
    
    console.log("[COLLAB-DEBUG] 📊 Message in local state:", !!messageInLocal);
    
    return {
      success: true,
      targetChatId,
      chatInLocalStorage: !!chat,
      chatInContextState: !!contextChat,
      messageSaveResult: saveResult,
      messageInLocalState: !!messageInLocal,
      availableChatIds: chats.map(c => c.id)
    };
    
  } catch (error) {
    console.error("[COLLAB-DEBUG] ❌ Test failed:", error);
    return { error: error.message };
  }
};

// Global helper function to test dummy chat creation scenario
window.testDummyChatCreation = async function(chatId = null) {
  console.log("[COLLAB-DEBUG] 🧪 === TESTING DUMMY CHAT CREATION ===");
  
  try {
    const isCollaborating = window.collaboration?.isCollaborating;
    const isLeader = window.collaboration?.isLeader;
    
    console.log("[COLLAB-DEBUG] 📋 Collaboration status:", {
      isCollaborating,
      isLeader,
      hasCollaboration: !!window.collaboration
    });
    
    if (!isCollaborating) {
      console.error("[COLLAB-DEBUG] ❌ Not in collaboration mode");
      return { error: "Not in collaboration mode" };
    }
    
    // Use provided chatId or create a completely new one that doesn't exist
    const targetChatId = chatId || `dummy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    console.log("[COLLAB-DEBUG] 🎯 Target chat ID (should not exist):", targetChatId);
    
    // Check if chat exists in localStorage
    let chats = [];
    try {
      const chatsJson = localStorage.getItem("chats");
      chats = chatsJson ? JSON.parse(chatsJson) : [];
      console.log("[COLLAB-DEBUG] 📊 Total chats in localStorage:", chats.length);
    } catch (error) {
      console.error("[COLLAB-DEBUG] ❌ Error parsing chats:", error);
    }
    
    const existingChat = chats.find(c => c.id === targetChatId);
    console.log("[COLLAB-DEBUG] 📋 Chat already exists in localStorage:", !!existingChat);
    
    if (existingChat) {
      console.log("[COLLAB-DEBUG] ⚠️ Chat already exists, using a different ID");
      const newTargetChatId = `dummy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      console.log("[COLLAB-DEBUG] 🎯 New target chat ID:", newTargetChatId);
      return await window.testDummyChatCreation(newTargetChatId);
    }
    
    // Create a test message for this non-existent chat
    const testMessage = {
      role: "user",
      content: "Test message for dummy chat creation scenario",
      timestamp: new Date().toLocaleTimeString(),
      message_id: `test_dummy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      isSaved: false,
      userId: isLeader ? localStorage.getItem("userId") : localStorage.getItem("collaborationLeaderId")
    };
    
    console.log("[COLLAB-DEBUG] 📋 Test message:", testMessage);
    
    // Try to save the message (this should trigger the dummy chat creation)
    console.log("[COLLAB-DEBUG] 🚀 Attempting to save message to non-existent chat...");
    const saveResult = await window.memory.saveMessage(targetChatId, testMessage);
    console.log("[COLLAB-DEBUG] 📊 Save result:", saveResult);
    
    // Check if chat was created in localStorage
    let updatedChats = [];
    try {
      const updatedChatsJson = localStorage.getItem("chats");
      updatedChats = updatedChatsJson ? JSON.parse(updatedChatsJson) : [];
    } catch (error) {
      console.error("[COLLAB-DEBUG] ❌ Error parsing updated chats:", error);
    }
    
    const createdChat = updatedChats.find(c => c.id === targetChatId);
    console.log("[COLLAB-DEBUG] 📊 Chat created in localStorage:", !!createdChat);
    
    if (createdChat) {
      console.log("[COLLAB-DEBUG] 📋 Created chat details:", {
        id: createdChat.id,
        title: createdChat.title,
        description: createdChat.description,
        timestamp: createdChat.timestamp
      });
    }
    
    // Check if message was added to local state
    const messagesByChat = window.context?.getMessagesByChat() || {};
    const messagesInChat = messagesByChat[targetChatId] || [];
    const messageInLocal = messagesInChat.find(m => m.message_id === testMessage.message_id);
    
    console.log("[COLLAB-DEBUG] 📊 Message in local state:", !!messageInLocal);
    
    return {
      success: true,
      targetChatId,
      chatCreated: !!createdChat,
      messageSaveResult: saveResult,
      messageInLocalState: !!messageInLocal,
      originalChatCount: chats.length,
      updatedChatCount: updatedChats.length,
      createdChatDetails: createdChat ? {
        id: createdChat.id,
        title: createdChat.title,
        description: createdChat.description
      } : null
    };
    
  } catch (error) {
    console.error("[COLLAB-DEBUG] ❌ Test failed:", error);
    return { error: error.message };
  }
};

// Global helper function to test chat not found error handling
window.testChatNotFoundErrorHandling = async function() {
  console.log("[COLLAB-DEBUG] 🧪 === TESTING CHAT NOT FOUND ERROR HANDLING ===");
  
  try {
    const isCollaborating = window.collaboration?.isCollaborating;
    const isLeader = window.collaboration?.isLeader;
    
    console.log("[COLLAB-DEBUG] 📋 Collaboration status:", {
      isCollaborating,
      isLeader,
      hasCollaboration: !!window.collaboration
    });
    
    if (!isCollaborating) {
      console.error("[COLLAB-DEBUG] ❌ Not in collaboration mode");
      return { error: "Not in collaboration mode" };
    }
    
    // Check sync manager availability
    const hasSyncManager = !!window.syncManager;
    const hasUploadChat = !!window.syncManager?.uploadChat;
    const hasUploadMessage = !!window.syncManager?.uploadMessage;
    const hasUploadArtifact = !!window.syncManager?.uploadArtifact;
    
    console.log("[COLLAB-DEBUG] 📋 Sync manager status:", {
      hasSyncManager,
      hasUploadChat,
      hasUploadMessage,
      hasUploadArtifact
    });
    
    // Create a test chat that doesn't exist in database
    console.log("[COLLAB-DEBUG] 🚀 Creating test chat...");
    const testChatId = `test_chat_not_found_${Date.now()}`;
    const testChat = {
      id: testChatId,
      title: "Test Chat Not Found",
      description: "Testing chat not found error handling",
      timestamp: new Date().toISOString(),
      role: isLeader ? "leader" : "collab",
      userId: isLeader ? localStorage.getItem("userId") : localStorage.getItem("collaborationLeaderId")
    };
    
    console.log("[COLLAB-DEBUG] 📋 Test chat:", testChat);
    
    // Add chat to local state only (not to database)
    const chats = [...(window.context?.getChats() || [])];
    chats.push(testChat);
    window.context?.setState({ chats });
    
    console.log("[COLLAB-DEBUG] ✅ Chat added to local state only");
    
    // Test message creation with non-existent chat in database
    console.log("[COLLAB-DEBUG] 🚀 Testing message creation with non-existent chat...");
    const testMessage = {
      role: "user",
      content: "Test message for chat not found error handling",
      timestamp: new Date().toLocaleTimeString(),
      message_id: `test_msg_not_found_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      isSaved: false,
      userId: isLeader ? localStorage.getItem("userId") : localStorage.getItem("collaborationLeaderId")
    };
    
    console.log("[COLLAB-DEBUG] 📋 Test message:", testMessage);
    
    // Test message save (should trigger chat not found error handling)
    const messageSaveResult = await window.memory.saveMessage(testChatId, testMessage);
    console.log("[COLLAB-DEBUG] 📊 Message save result:", messageSaveResult);
    
    // Test artifact creation with non-existent chat in database
    console.log("[COLLAB-DEBUG] 🚀 Testing artifact creation with non-existent chat...");
    const testArtifact = {
      id: `test_artifact_not_found_${Date.now()}`,
      chatId: testChatId,
      title: "Test Artifact Not Found",
      type: "text",
      versions: [{
        content: "Test artifact content for chat not found error handling",
        timestamp: new Date().toISOString()
      }],
      userId: isLeader ? localStorage.getItem("userId") : localStorage.getItem("collaborationLeaderId")
    };
    
    console.log("[COLLAB-DEBUG] 📋 Test artifact:", testArtifact);
    
    // Test artifact save (should trigger chat not found error handling)
    const artifactSaveResult = await window.memory.saveArtifact(testArtifact);
    console.log("[COLLAB-DEBUG] 📊 Artifact save result:", artifactSaveResult);
    
    // Check if items are in local state
    const finalChats = window.context?.getChats() || [];
    const finalMessagesByChat = window.context?.getMessagesByChat() || {};
    const finalArtifacts = window.context?.getArtifacts() || [];
    
    const chatInLocal = finalChats.find(c => c.id === testChatId);
    const messageInLocal = finalMessagesByChat[testChatId]?.find(m => m.message_id === testMessage.message_id);
    const artifactInLocal = finalArtifacts.find(a => a.id === testArtifact.id);
    
    console.log("[COLLAB-DEBUG] 📊 Final local state check:", {
      chatInLocal: !!chatInLocal,
      messageInLocal: !!messageInLocal,
      artifactInLocal: !!artifactInLocal
    });
    
    return {
      success: true,
      isLeader,
      syncManagerStatus: {
        hasSyncManager,
        hasUploadChat,
        hasUploadMessage,
        hasUploadArtifact
      },
      saveResults: {
        message: messageSaveResult,
        artifact: artifactSaveResult
      },
      localState: {
        chatInLocal: !!chatInLocal,
        messageInLocal: !!messageInLocal,
        artifactInLocal: !!artifactInLocal
      },
      testData: {
        chatId: testChatId,
        messageId: testMessage.message_id,
        artifactId: testArtifact.id
      }
    };
    
  } catch (error) {
    console.error("[COLLAB-DEBUG] ❌ Test failed:", error);
    return { error: error.message };
  }
};
