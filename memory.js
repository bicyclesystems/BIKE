// =================== Storage Keys ===================
const CHATS_KEY = 'chats';
const ARTIFACTS_KEY = 'artifacts';
const USER_PREFERENCES_KEY = 'userPreferences';


// =================== IndexedDB Configuration ===================
const DB_NAME = 'BikeDB';
const DB_VERSION = 1;
const STORE_NAMES = {
  artifacts: 'artifacts'
};

let indexedDB_instance = null;

// =================== Event System for Sync Communication ===================
const memoryEvents = new EventTarget();

function dispatchDataChange(type, data) {
  memoryEvents.dispatchEvent(new CustomEvent('dataChanged', { detail: { type, data } }));
}

// =================== IndexedDB Setup ===================
async function initIndexedDB() {
  if (!window.indexedDB) return null;
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAMES.artifacts)) {
        db.createObjectStore(STORE_NAMES.artifacts, { keyPath: 'id' });
      }
    };
    
    request.onsuccess = (event) => {
      indexedDB_instance = event.target.result;
      resolve(indexedDB_instance);
    };
    
    request.onerror = () => {
      indexedDB_instance = null;
      resolve(null); // Don't reject, just return null for fallback
    };
  });
}

// =================== IndexedDB Artifact Operations ===================
function saveArtifactsToIndexedDB() {
  if (!indexedDB_instance) return;
  
  const transaction = indexedDB_instance.transaction([STORE_NAMES.artifacts], 'readwrite');
  const store = transaction.objectStore(STORE_NAMES.artifacts);
  
  store.clear();
  const artifacts = window.artifactsModule?.getArtifacts() || [];
  artifacts.forEach(artifact => store.add(artifact));
}

async function loadArtifactsFromIndexedDB() {
  if (!indexedDB_instance) return [];
  
  return new Promise((resolve) => {
    const transaction = indexedDB_instance.transaction([STORE_NAMES.artifacts], 'readonly');
    const store = transaction.objectStore(STORE_NAMES.artifacts);
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => resolve([]);
  });
}



// =================== Core Data Persistence ===================
// Generic localStorage save utility
function saveToStorage(key, data, eventType, additionalActions = []) {
  localStorage.setItem(key, JSON.stringify(data || (Array.isArray(data) ? [] : {})));
  additionalActions.forEach(action => action());
  dispatchDataChange(eventType);
}

// Bulk save operations - simplified API
function saveChats(chats) {
  saveToStorage(CHATS_KEY, chats, 'chats');
}

function saveArtifacts(artifacts) {
  saveToStorage(ARTIFACTS_KEY, artifacts, 'artifacts', [saveArtifactsToIndexedDB]);
}



// =================== State Persistence ===================
// Note: saveActiveView and saveActiveChatId functions removed
// Active states are now determined from the latest saved chat

// =================== User Preferences Persistence ===================
let userPreferences = {}; // In-memory cache for user preferences

function saveUserPreferences(preferences) {
  userPreferences = preferences;
  saveToStorage(USER_PREFERENCES_KEY, userPreferences, 'userPreferences');
}

// =================== Initialization ===================
async function initMemory() {
  // Initialize IndexedDB first and wait for it
  await initIndexedDB();
  
  // Generic localStorage load utility
  const loadFromStorage = (key, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch (e) {
      console.warn(`[MEMORY] Failed to parse ${key}:`, e);
      return fallback;
    }
  };

  // Load user preferences into memory cache
  let saved = loadFromStorage(USER_PREFERENCES_KEY, {});
  
  // Migrate aiTraits from string to array if needed
  if (saved.aiTraits && typeof saved.aiTraits === 'string') {
    const traits = saved.aiTraits.split(',').map(trait => trait.trim().toLowerCase()).filter(Boolean);
    saved.aiTraits = traits;
    saveUserPreferences(saved);
  }
  
  userPreferences = saved;
  
  // Load chats from localStorage (messages are now embedded)
  const chats = loadFromStorage(CHATS_KEY, []);
  
  // Load artifacts from IndexedDB (primary) or fallback to localStorage
  let loadedArtifacts = [];
  if (indexedDB_instance) {
    loadedArtifacts = await loadArtifactsFromIndexedDB();
    // If IndexedDB is empty but localStorage has artifacts, migrate them
    if (loadedArtifacts.length === 0) {
      const localArtifacts = loadFromStorage(ARTIFACTS_KEY, []);
      if (localArtifacts.length > 0) {
        console.log('[MEMORY] Migrating artifacts from localStorage to IndexedDB');
        // Update the artifacts directly in the module's internal array
        if (window.artifactsModule?.getArtifacts) {
          const artifactsArray = window.artifactsModule.getArtifacts();
          artifactsArray.length = 0; // Clear existing
          artifactsArray.push(...localArtifacts); // Add loaded artifacts
          saveArtifactsToIndexedDB(); // Save to IndexedDB
        }
        loadedArtifacts = localArtifacts;
      }
    } else {
      // Load artifacts from IndexedDB into the module
      if (window.artifactsModule?.getArtifacts) {
        const artifactsArray = window.artifactsModule.getArtifacts();
        artifactsArray.length = 0; // Clear existing
        artifactsArray.push(...loadedArtifacts); // Add loaded artifacts
      }
    }
  } else {
    // Fallback to localStorage if IndexedDB not available
    loadedArtifacts = loadFromStorage(ARTIFACTS_KEY, []);
    if (loadedArtifacts.length > 0 && window.artifactsModule?.getArtifacts) {
      const artifactsArray = window.artifactsModule.getArtifacts();
      artifactsArray.length = 0; // Clear existing
      artifactsArray.push(...loadedArtifacts); // Add loaded artifacts
    }
  }
  
  // Initialize chat module with loaded data
  if (window.chat && chats.length > 0) {
    const chatsArray = window.chat.getChats();
    chatsArray.push(...chats);
  }
}

// =================== AI Context Data Provider ===================
// NOTE: getContextData() moved to context.js - use window.context.getContext() instead

// =================== Public API ===================
window.memory = {
  // Bulk save operations
  saveChats,
  saveArtifacts,
  
  // User preferences
  saveUserPreferences,
  
  // Initialization
  initMemory,
  
  // Event system
  events: memoryEvents
};

// =================== Auto-Initialization ===================
document.addEventListener('DOMContentLoaded', async function() {
  console.log('[MEMORY] Initializing memory system...');
  await window.memory.initMemory();
  console.log('[MEMORY] Memory system initialized');
}); 