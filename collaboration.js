// =================== Simple Yjs Collaboration Module ===================
// No modules required - uses CDN-loaded Yjs and WebRTC

// Global room tracking to prevent duplicate connections
window.globalRoomRegistry = window.globalRoomRegistry || new Map();

const collaboration = {
  // State
  ydoc: null,
  provider: null,
  isCollaborating: false,
  collaborationId: null,
  peers: new Set(),
  isLeader: false,

  // Initialize collaboration
  async init() {
    console.log("[COLLAB] Initializing collaboration module...");

    // Wait for Yjs to be loaded
    await this.waitForYjs();

    // Check for existing collaboration session or auto-join
    await this.checkForExistingSession();

    console.log("[COLLAB] Collaboration module ready");
  },

  // Wait for Yjs libraries to load
  async waitForYjs() {
    return new Promise((resolve) => {
      const check = () => {
        if (window.Y && window.WebrtcProvider) {
          console.log("[COLLAB] Yjs libraries loaded");
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  },

  // Generate a random collaboration ID
  generateCollaborationId() {
    return "collab-" + Math.random().toString(36).substr(2, 9);
  },

  // Extract collaboration ID from URL
  extractCollaborationIdFromUrl() {
    const hash = window.location.hash;
    const match = hash.match(/#\/collab-([a-zA-Z0-9-]+)/);
    return match ? match[1] : null;
  },

  // Create a shareable collaboration link
  async createCollaborationLink() {
    try {
      console.log("[COLLAB] Creating collaboration link...");

      // Generate collaboration ID
      const collaborationId = this.generateCollaborationId();

      // Create the shareable link
      const shareableLink = `${window.location.origin}${window.location.pathname}#/collab-${collaborationId}`;

      // Create the session
      const result = await this.createSession(collaborationId);

      if (result.success) {
        // Mark as leader and persist state
        this.isLeader = true;
        localStorage.setItem("collaborationLeader", "true");
        localStorage.setItem("collaborationId", collaborationId);
        localStorage.setItem("collaborationActive", "true");

        // Update URL
        window.history.replaceState({}, "", `#/collab-${collaborationId}`);

        // Copy link to clipboard
        try {
          await navigator.clipboard.writeText(shareableLink);
          console.log("[COLLAB] Link copied to clipboard");
        } catch (error) {
          console.warn("[COLLAB] Could not copy to clipboard:", error);
        }

        console.log("[COLLAB] Collaboration link created:", shareableLink);
        return {
          success: true,
          collaborationId,
          shareableLink,
          message: `Collaboration link created and copied to clipboard: ${shareableLink}`,
        };
      } else {
        return result;
      }
    } catch (error) {
      console.error("[COLLAB] Error creating collaboration link:", error);
      return { success: false, error: error.message };
    }
  },

  // Join collaboration from URL
  async joinCollaborationFromUrl() {
    const collaborationId = this.extractCollaborationIdFromUrl();

    if (!collaborationId) {
      console.log("[COLLAB] No collaboration ID found in URL");
      return { success: false, error: "No collaboration ID found in URL" };
    }

    console.log("[COLLAB] Joining collaboration from URL:", collaborationId);

    // Mark as collaborator (not leader) and persist state
    this.isLeader = false;
    localStorage.setItem("collaborationLeader", "false");
    localStorage.setItem("collaborationId", collaborationId);
    localStorage.setItem("collaborationActive", "true");

    return await this.joinSession(collaborationId);
  },

  // Check for existing collaboration session and restore it
  async checkForExistingSession() {
    console.log("[COLLAB] Checking for existing collaboration session...");

    // First check localStorage for existing session
    const storedCollabId = localStorage.getItem("collaborationId");
    const storedIsLeader =
      localStorage.getItem("collaborationLeader") === "true";
    const storedIsCollaborating =
      localStorage.getItem("collaborationActive") === "true";

    // Then check URL for collaboration ID
    const urlCollabId = this.extractCollaborationIdFromUrl();

    if (storedIsCollaborating && storedCollabId && !this.isCollaborating) {
      // Restore existing session
      console.log("[COLLAB] Restoring collaboration session:", storedCollabId);
      this.isLeader = storedIsLeader;

      if (this.isLeader) {
        // Leader: restore and update URL
        window.history.replaceState({}, "", `#/collab-${storedCollabId}`);
        const result = await this.createSession(storedCollabId);
        if (result.success) {
          console.log("[COLLAB] ✅ Leader session restored");
        }
      } else {
        // Collaborator: rejoin
        const result = await this.joinSession(storedCollabId);
        if (result.success) {
          console.log("[COLLAB] ✅ Collaborator session restored");
          // Request current data after successful rejoin
          setTimeout(() => {
            this.requestCurrentDataFromLeader();
          }, 1500);
        }
      }
    } else if (urlCollabId && !this.isCollaborating && !storedIsCollaborating) {
      // New collaboration from URL (fresh join)
      console.log("[COLLAB] Joining collaboration from URL:", urlCollabId);
      const result = await this.joinCollaborationFromUrl();
    } else {
      console.log("[COLLAB] No collaboration session to restore");
    }
  },

  // Create a collaboration session
  async createSession(roomName = null) {
    try {
      console.log("[COLLAB] Creating collaboration session...");

      // Generate room name if not provided
      if (!roomName) {
        roomName = "room-" + Math.random().toString(36).substr(2, 9);
      }

      // Check if room already exists globally
      if (window.globalRoomRegistry.has(roomName)) {
        console.log(
          "[COLLAB] Room already exists globally, waiting for cleanup..."
        );
        const existingProvider = window.globalRoomRegistry.get(roomName);
        if (existingProvider && existingProvider.provider) {
          console.log("[COLLAB] Disconnecting existing provider...");
          existingProvider.provider.disconnect();
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
        }
        window.globalRoomRegistry.delete(roomName);
      }

      // Register this room globally
      window.globalRoomRegistry.set(roomName, {
        provider: null,
        timestamp: Date.now(),
      });
      console.log("[COLLAB] Registered room globally:", roomName);

      // Create Yjs document
      this.ydoc = new window.Y.Doc();
      console.log("[COLLAB] Yjs document created");

      // Create WebRTC provider with signaling servers
      console.log("[COLLAB] Creating WebRTC provider with room:", roomName);

      const signalingServers = ["ws://localhost:4444"];

      console.log("[COLLAB] WebRTC provider options:", {
        signaling: signalingServers,
        maxConns: 20,
        filterBcConns: false,
      });

      this.provider = new window.WebrtcProvider(roomName, this.ydoc, {
        signaling: signalingServers, // Local signaling server
        maxConns: 20,
        filterBcConns: false,
        peerOpts: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" },
            { urls: "stun:stun3.l.google.com:19302" },
            { urls: "stun:stun4.l.google.com:19302" },
          ],
        },
      });

      console.log("[COLLAB] WebRTC provider created successfully");
      console.log("[COLLAB] Provider object:", this.provider);

      // Set up event listeners
      this.setupEventListeners();

      // Update state and persist
      this.isCollaborating = true;
      this.collaborationId = roomName;
      localStorage.setItem("collaborationActive", "true");
      localStorage.setItem("collaborationId", roomName);

      console.log("[COLLAB] Session created:", roomName);
      return { success: true, roomName };
    } catch (error) {
      console.error("[COLLAB] Error creating session:", error);
      return { success: false, error: error.message };
    }
  },

  // Join an existing collaboration session
  async joinSession(roomName) {
    try {
      console.log("[COLLAB] Joining session:", roomName);

      // Create Yjs document
      this.ydoc = new window.Y.Doc();
      console.log("[COLLAB] Yjs document created");

      // Create WebRTC provider with signaling servers
      console.log("[COLLAB] Creating WebRTC provider with room:", roomName);

      const signalingServers = ["ws://localhost:4444"];

      console.log("[COLLAB] WebRTC provider options:", {
        signaling: signalingServers,
        maxConns: 20,
        filterBcConns: false,
      });

      this.provider = new window.WebrtcProvider(roomName, this.ydoc, {
        signaling: signalingServers, // Local signaling server
        maxConns: 20,
        filterBcConns: false,
        peerOpts: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" },
            { urls: "stun:stun3.l.google.com:19302" },
            { urls: "stun:stun4.l.google.com:19302" },
          ],
        },
      });

      console.log("[COLLAB] WebRTC provider created successfully");
      console.log("[COLLAB] Provider object:", this.provider);

      // Set up event listeners
      this.setupEventListeners();

      // Update state and persist
      this.isCollaborating = true;
      this.collaborationId = roomName;
      localStorage.setItem("collaborationActive", "true");
      localStorage.setItem("collaborationId", roomName);

      console.log("[COLLAB] Joined session:", roomName);
      return { success: true, roomName };
    } catch (error) {
      console.error("[COLLAB] Error joining session:", error);
      return { success: false, error: error.message };
    }
  },

  // Set up event listeners
  setupEventListeners() {
    if (!this.provider) {
      console.log("[COLLAB] setupEventListeners - No provider available");
      return;
    }

    console.log("[COLLAB] Setting up event listeners for provider");

    // Listen for peer connections
    this.provider.on("peers", (event) => {
      console.log("[COLLAB] Peers event received:", event);
      console.log("[COLLAB] Added peers:", event.added);
      console.log("[COLLAB] Removed peers:", event.removed);

      event.added.forEach((peerId) => {
        if (!this.peers.has(peerId)) {
          this.peers.add(peerId);
          console.log("[COLLAB] Peer connected:", peerId);
        }
      });

      event.removed.forEach((peerId) => {
        if (this.peers.has(peerId)) {
          this.peers.delete(peerId);
          console.log("[COLLAB] Peer disconnected:", peerId);
        }
      });

      console.log(
        "[COLLAB] Current peers after update:",
        Array.from(this.peers)
      );

      // Trigger UI update
      this.updateUI();

      // Leader: On new peer, ensure initial data is pushed if needed
      if (this.isLeader) {
        const syncMap = this.getSharedSyncMap();
        if (syncMap && event.added.length > 0) {
          // Always refresh and push current data when new peer joins
          if (window.memory && window.memory.loadAll) window.memory.loadAll();
          const chats = JSON.parse(localStorage.getItem("chats") || "[]");
          const messagesByChat = JSON.parse(
            localStorage.getItem("messagesByChat") || "{}"
          );
          const artifacts = JSON.parse(
            localStorage.getItem("artifacts") || "[]"
          );
          const userPreferences = JSON.parse(
            localStorage.getItem("userPreferences") || "{}"
          );
          const activeChatId = localStorage.getItem("activeChatId");

          // Push current data to sync map
          syncMap.set("chats", JSON.stringify(chats));
          syncMap.set("messagesByChat", JSON.stringify(messagesByChat));
          syncMap.set("artifacts", JSON.stringify(artifacts));
          syncMap.set("userPreferences", JSON.stringify(userPreferences));
          syncMap.set("activeChatId", activeChatId);
          syncMap.set("initializedByLeader", true);
          syncMap.set("lastUpdated", Date.now().toString());

          // Also push current messages to sharedMessages array
          this.syncCurrentMessagesToSharedArray();

          console.log("[COLLAB] 🚀 Leader shared current data");
        }
      }

      // Collaborator: On connection, request current data
      if (!this.isLeader && event.added.length > 0) {
        // Small delay to ensure leader has time to push data
        setTimeout(() => {
          this.requestCurrentDataFromLeader();
        }, 1000);
      }
    });

    // Listen for connection status
    this.provider.on("connection", (event) => {
      console.log("[COLLAB] Connection event:", event);
    });

    // Listen for sync status
    this.provider.on("sync", (event) => {
      console.log("[COLLAB] Sync event:", event);
    });

    // Listen for status changes
    this.provider.on("status", (event) => {
      console.log("[COLLAB] Status event:", event);
    });

    // Listen for WebRTC connection events
    this.provider.on("webrtc", (event) => {
      console.log("[COLLAB] WebRTC event:", event);
    });

    // Listen for signaling connection events
    this.provider.on("signaling", (event) => {
      console.log("[COLLAB] Signaling event:", event);
    });

    // Listen for sync events
    this.provider.on("sync", (event) => {
      console.log("[COLLAB] Document synced:", event);
    });

    // Listen for connection events
    this.provider.on("connection", (event) => {
      console.log("[COLLAB] Connection event:", event);
    });

    // Listen for status events
    this.provider.on("status", (event) => {
      console.log("[COLLAB] Status event:", event);
    });

    // Listen for awareness events
    this.provider.on("awareness", (event) => {
      console.log("[COLLAB] Awareness event:", event);
    });

    console.log("[COLLAB] Event listeners set up successfully");

    // Set up data listeners for automatic data sync
    this.setupDataListeners();
    this.setupBidirectionalSync();
  },

  // Update UI to show collaboration status
  updateUI() {
    // This will be called when peers connect/disconnect
    console.log("[COLLAB] Connected peers:", this.peers.size);

    // Trigger a custom event for UI updates
    const event = new CustomEvent("collaborationUpdate", {
      detail: {
        isCollaborating: this.isCollaborating,
        collaborationId: this.collaborationId,
        peerCount: this.peers.size,
        isLeader: this.isLeader,
      },
    });
    document.dispatchEvent(event);
  },

  // Get shared data structure
  getSharedText(name = "shared-text") {
    if (!this.ydoc) return null;
    return this.ydoc.getText(name);
  },

  // Get shared array
  getSharedArray(name = "shared-array") {
    if (!this.ydoc) return null;
    return this.ydoc.getArray(name);
  },

  // Get shared map
  getSharedMap(name = "shared-map") {
    if (!this.ydoc) return null;
    return this.ydoc.getMap(name);
  },

  // Leave collaboration session
  leaveSession() {
    try {
      console.log("[COLLAB] Leaving collaboration session...");

      // Disconnect provider
      if (this.provider) {
        this.provider.disconnect();
        this.provider = null;
      }

      // Clear Yjs document
      if (this.ydoc) {
        this.ydoc.destroy();
        this.ydoc = null;
      }

      // Clear state
      this.isCollaborating = false;
      this.collaborationId = null;
      this.peers.clear();
      this.isLeader = false;

      // Clear persistence
      localStorage.removeItem("collaborationActive");
      localStorage.removeItem("collaborationLeader");
      localStorage.removeItem("collaborationId");
      localStorage.removeItem("COLLABORATION_ACTIVE");
      localStorage.removeItem("COLLABORATION_DATA_TIMESTAMP");

      // Clear URL
      window.history.replaceState({}, "", window.location.pathname);

      // Trigger UI update
      this.updateUI();

      console.log("[COLLAB] ✅ Successfully left collaboration session");
      return { success: true, message: "Left collaboration session" };
    } catch (error) {
      console.error("[COLLAB] Error leaving session:", error);
      return { success: false, error: error.message };
    }
  },

  // Sync current messages to shared array (for data integrity)
  syncCurrentMessagesToSharedArray() {
    if (!this.sharedMessages || !this.isLeader) return;

    try {
      // Clear existing shared messages and push current ones
      while (this.sharedMessages.length > 0) {
        this.sharedMessages.delete(0);
      }

      const messagesByChat = JSON.parse(
        localStorage.getItem("messagesByChat") || "{}"
      );
      let count = 0;
      Object.entries(messagesByChat).forEach(([chatId, msgArr]) => {
        msgArr.forEach((msg) => {
          const messageToSync = {
            role: msg.role,
            content: msg.content,
            message_id: msg.message_id,
            timestamp: msg.timestamp,
            chatId: msg.chatId || chatId,
          };
          this.sharedMessages.push([messageToSync]);
          count++;
        });
      });

      if (count > 0) {
        console.log("[COLLAB] 🔄 Leader synced", count, "messages");
      }
    } catch (e) {
      console.warn("[COLLAB] ⚠️ Error syncing current messages:", e);
    }
  },

  // Request current data from leader (for rejoining collaborators)
  requestCurrentDataFromLeader() {
    if (this.isLeader) return;

    try {
      const syncMap = this.getSharedSyncMap();
      if (!syncMap) return;

      // Check if leader has pushed data
      const lastUpdated = syncMap.get("lastUpdated");
      const hasLeaderData = syncMap.get("initializedByLeader");

      if (hasLeaderData && lastUpdated) {
        console.log("[COLLAB] 📥 Syncing with leader data...");

        // Force sync with leader's current data
        const chats = JSON.parse(syncMap.get("chats") || "[]");
        const messagesByChat = JSON.parse(
          syncMap.get("messagesByChat") || "{}"
        );
        const artifacts = JSON.parse(syncMap.get("artifacts") || "[]");
        const userPreferences = JSON.parse(
          syncMap.get("userPreferences") || "{}"
        );
        const activeChatId = syncMap.get("activeChatId") || null;

        // Update local storage with leader's current data
        localStorage.setItem("chats", JSON.stringify(chats));
        localStorage.setItem("messagesByChat", JSON.stringify(messagesByChat));
        localStorage.setItem("artifacts", JSON.stringify(artifacts));
        localStorage.setItem(
          "userPreferences",
          JSON.stringify(userPreferences)
        );
        if (activeChatId) localStorage.setItem("activeChatId", activeChatId);

        // Also sync messages from shared array
        this.syncMessagesFromSharedArray();

        // Refresh UI with proper timing
        setTimeout(() => {
          if (window.memory && window.memory.loadAll) window.memory.loadAll();
          if (window.views && window.views.renderCurrentView)
            window.views.renderCurrentView(false);
          if (window.memoryView && window.memoryView.refreshView)
            window.memoryView.refreshView();

          // Trigger memory data change event
          if (window.memory && window.memory.events) {
            window.memory.events.dispatchEvent(
              new CustomEvent("memoryUpdated", {
                detail: { source: "collaboration", type: "dataSync" },
              })
            );
          }

          // Force a general UI refresh
          document.dispatchEvent(
            new CustomEvent("collaborationDataUpdate", {
              detail: { type: "fullDataSync" },
            })
          );
        }, 150);

        console.log("[COLLAB] ✅ Data synced with leader");
      } else {
        console.log("[COLLAB] ⏳ Waiting for leader to share data...");
      }
    } catch (e) {
      console.warn("[COLLAB] ⚠️ Error requesting current data:", e);
    }
  },

  // Sync messages from shared array (for data integrity)
  syncMessagesFromSharedArray() {
    if (!this.sharedMessages) return;

    try {
      const currentMessages = this.sharedMessages.toArray();
      if (currentMessages.length === 0) return;

      let messagesByChat = {};
      currentMessages.forEach((msg) => {
        const chatId = msg.chatId;
        if (!chatId) return;

        if (!messagesByChat[chatId]) {
          messagesByChat[chatId] = [];
        }

        // Avoid duplicates
        const exists = messagesByChat[chatId].some(
          (m) => m.message_id === msg.message_id
        );
        if (!exists) {
          messagesByChat[chatId].push(msg);
        }
      });

      // Merge with existing local messages
      const existingMessages = JSON.parse(
        localStorage.getItem("messagesByChat") || "{}"
      );
      Object.entries(messagesByChat).forEach(([chatId, newMsgs]) => {
        if (!existingMessages[chatId]) {
          existingMessages[chatId] = newMsgs;
        } else {
          // Add new messages that don't exist locally
          newMsgs.forEach((newMsg) => {
            const exists = existingMessages[chatId].some(
              (m) => m.message_id === newMsg.message_id
            );
            if (!exists) {
              existingMessages[chatId].push(newMsg);
            }
          });
        }
      });

      localStorage.setItem("messagesByChat", JSON.stringify(existingMessages));
      console.log("[COLLAB] 🔄 Messages synced");
    } catch (e) {
      console.warn("[COLLAB] ⚠️ Error syncing messages from shared array:", e);
    }
  },

  getSharedSyncMap() {
    if (!this.ydoc) return null;
    return this.ydoc.getMap("sharedSyncMap");
  },

  setupBidirectionalSync() {
    const syncMap = this.getSharedSyncMap();
    if (!syncMap) return;
    if (this._bidirectionalSyncActive) return; // Prevent double setup
    this._bidirectionalSyncActive = true;

    // --- Granular, bidirectional sync for messages ---
    this.sharedMessages = this.ydoc.getArray("sharedMessages");
    let hasAppliedInitialMessages = false;

    // Initial sync: leader pushes all messages if array is empty
    if (this.isLeader && this.sharedMessages.length === 0) {
      try {
        const messagesByChat = JSON.parse(
          localStorage.getItem("messagesByChat") || "{}"
        );
        let count = 0;
        Object.entries(messagesByChat).forEach(([chatId, msgArr]) => {
          msgArr.forEach((msg) => {
            // Create clean message structure for sync
            const messageToSync = {
              role: msg.role,
              content: msg.content,
              message_id: msg.message_id,
              timestamp: msg.timestamp,
              chatId: msg.chatId || chatId,
            };
            this.sharedMessages.push([messageToSync]);
            count++;
          });
        });
        if (count > 0) {
          console.log("[COLLAB] 🚀 Leader synced", count, "messages");
        }
      } catch (e) {
        console.warn("[COLLAB] ⚠️ Error during initial message sync:", e);
      }
    }

    // On initial join, collaborator loads all messages from sharedMessages if local is empty
    if (!this.isLeader) {
      let messagesByChat = {};
      try {
        messagesByChat = JSON.parse(
          localStorage.getItem("messagesByChat") || "{}"
        );
      } catch (e) {
        console.warn("[COLLAB] ⚠️ Error parsing initial messagesByChat:", e);
        messagesByChat = {};
      }
      const localMessageCount = Object.values(messagesByChat).reduce(
        (acc, arr) => acc + arr.length,
        0
      );
      if (localMessageCount === 0 && this.sharedMessages.length > 0) {
        this.sharedMessages.toArray().forEach((msg, index) => {
          const chatId = msg.chatId;
          if (!chatId) {
            console.warn("[COLLAB] ⚠️ Initial message missing chatId:", msg);
            return;
          }
          if (!messagesByChat[chatId]) {
            messagesByChat[chatId] = [];
          }
          messagesByChat[chatId].push(msg);
        });

        localStorage.setItem("messagesByChat", JSON.stringify(messagesByChat));

        if (window.memory && window.memory.loadAll) window.memory.loadAll();
        if (window.views && window.views.renderCurrentView)
          window.views.renderCurrentView(false);
        if (window.memoryView && window.memoryView.refreshView)
          window.memoryView.refreshView();
        console.log(
          "[COLLAB] ✅ Collaborator loaded",
          this.sharedMessages.length,
          "messages"
        );
      }
    }

    // On local message add (example: call this when sending a message)
    this.pushMessageToCollab = (msgObj) => {
      // Create a clean message structure with only essential fields
      const messageToSync = {
        role: msgObj.role,
        content: msgObj.content,
        message_id: msgObj.message_id,
        timestamp: msgObj.timestamp,
        chatId:
          msgObj.chatId ||
          window.context?.getActiveChatId() ||
          localStorage.getItem("activeChatId"),
      };

      // If this is a collaborator, modify the role
      if (!this.isLeader) {
        messageToSync.role = "collab";
        messageToSync.userId = "none";
      }

      // Push as individual message (Yjs will wrap it in ContentAny)
      this.sharedMessages.push([messageToSync]);
    };

    // On remote message add (always process new messages)
    this.sharedMessages.observe((event) => {
      console.log(
        "[COLLAB] 🔔 sharedMessages.observe triggered - individual message sync"
      );
      event.changes.added.forEach((item, itemIndex) => {
        // Extract actual message from Yjs ContentAny wrapper
        let newMessages = [];
        if (
          item.content &&
          item.content.arr &&
          Array.isArray(item.content.arr)
        ) {
          // Yjs wraps content in ContentAny with arr property
          newMessages = item.content.arr;
        } else if (Array.isArray(item.content)) {
          // Direct array
          newMessages = item.content;
        } else {
          // Single message
          newMessages = [item.content];
        }

        console.log(
          "[COLLAB] 📥 Processing",
          newMessages.length,
          "messages from sharedMessages.observe"
        );

        newMessages.forEach((newMsg, msgIndex) => {
          // Get current messagesByChat state
          let messagesByChat = {};
          try {
            messagesByChat = JSON.parse(
              localStorage.getItem("messagesByChat") || "{}"
            );
          } catch (e) {
            console.warn("[COLLAB] ⚠️ Error parsing messagesByChat:", e);
            messagesByChat = {};
          }

          const chatId = newMsg.chatId;
          if (!chatId) {
            console.warn("[COLLAB] ⚠️ Message missing chatId:", newMsg);
            return;
          }

          // Ensure chatId array exists
          if (!messagesByChat[chatId]) {
            messagesByChat[chatId] = [];
          }

          // Check for duplicates using message_id
          const exists = messagesByChat[chatId].some(
            (m) => m.message_id === newMsg.message_id
          );

          if (!exists) {
            // Add message to the correct chatId array
            messagesByChat[chatId].push(newMsg);

            // Save to localStorage
            localStorage.setItem(
              "messagesByChat",
              JSON.stringify(messagesByChat)
            );

            console.log(
              "[COLLAB] 📨 Collaborator received new message:",
              newMsg.content.substring(0, 50) + "..."
            );
            console.log(
              "[COLLAB] 💾 Message saved to localStorage, starting UI refresh..."
            );

            // DEBUG: Check localStorage state immediately after save
            const savedMessages = JSON.parse(
              localStorage.getItem("messagesByChat") || "{}"
            );
            const chatMessages = savedMessages[chatId] || [];
            console.log(
              "[COLLAB] 🔍 DEBUG: localStorage after save - Chat",
              chatId,
              "has",
              chatMessages.length,
              "messages"
            );
            console.log(
              "[COLLAB] 🔍 DEBUG: Last 2 messages in localStorage:",
              chatMessages.slice(-2)
            );

            // Update UI/state with proper timing
            setTimeout(() => {
              console.log("[COLLAB] 🔄 Starting UI refresh components...");

              // DEBUG: Check memory module state before refresh
              if (window.memory && window.memory.getContextData) {
                const contextData = window.memory.getContextData();
                const memoryMessages = contextData.messagesByChat || {};
                const memoryChatMessages = memoryMessages[chatId] || [];
                console.log(
                  "[COLLAB] 🔍 DEBUG: memory.getContextData() - Chat",
                  chatId,
                  "has",
                  memoryChatMessages.length,
                  "messages"
                );
                console.log(
                  "[COLLAB] 🔍 DEBUG: Last 2 messages in memory:",
                  memoryChatMessages.slice(-2)
                );
              }

              if (window.memory && window.memory.loadAll) {
                window.memory.loadAll();
                console.log("[COLLAB] ✅ memory.loadAll() called");

                // DEBUG: Check memory state after loadAll
                if (window.memory.getContextData) {
                  const contextDataAfter = window.memory.getContextData();
                  const memoryMessagesAfter =
                    contextDataAfter.messagesByChat || {};
                  const memoryChatMessagesAfter =
                    memoryMessagesAfter[chatId] || [];
                  console.log(
                    "[COLLAB] 🔍 DEBUG: After loadAll() - Chat",
                    chatId,
                    "has",
                    memoryChatMessagesAfter.length,
                    "messages"
                  );
                }
              }
              if (window.views && window.views.renderCurrentView) {
                window.views.renderCurrentView(false);
                console.log("[COLLAB] ✅ views.renderCurrentView() called");
              }
              if (window.memoryView && window.memoryView.refreshView) {
                window.memoryView.refreshView();
                console.log("[COLLAB] ✅ memoryView.refreshView() called");
              }

              // Trigger memory data change event to ensure UI updates
              if (window.memory && window.memory.events) {
                window.memory.events.dispatchEvent(
                  new CustomEvent("memoryUpdated", {
                    detail: { source: "collaboration", chatId: chatId },
                  })
                );
                console.log("[COLLAB] ✅ memoryUpdated event dispatched");
              }

              // Force a general UI refresh
              document.dispatchEvent(
                new CustomEvent("collaborationDataUpdate", {
                  detail: { type: "messageReceived", chatId: chatId },
                })
              );
              console.log(
                "[COLLAB] ✅ collaborationDataUpdate event dispatched"
              );
              console.log(
                "[COLLAB] 🟢 Message synced and UI refresh completed"
              );
            }, 100);
          }
        });
      });
    });

    let isApplyingRemote = false;
    let hasAppliedInitialSync = false;
    let isSyncingInitialState = false;

    // 1. Listen for local changes and push to Yjs (only after initial sync)
    if (window.memory && window.memory.events) {
      window.memory.events.addEventListener("dataChanged", (e) => {
        if (isApplyingRemote || isSyncingInitialState) return; // Prevent loop or premature push
        // Only allow bidirectional sync after initial leader push and initial sync for collaborators
        if (!syncMap.get("initializedByLeader")) return;
        if (!this.isLeader && !hasAppliedInitialSync) return;
        const { type, data } = e.detail;
        if (type === "all") {
          // Merge local change with latest shared state
          const latestChats = JSON.parse(syncMap.get("chats") || "[]");
          const latestMessagesByChat = JSON.parse(
            syncMap.get("messagesByChat") || "{}"
          );
          const latestArtifacts = JSON.parse(syncMap.get("artifacts") || "[]");
          const latestUserPreferences = JSON.parse(
            syncMap.get("userPreferences") || "{}"
          );
          const latestActiveChatId = syncMap.get("activeChatId") || null;

          // Only overwrite with local value if it's not undefined
          const mergedChats =
            typeof data.chats !== "undefined" ? data.chats : latestChats;
          const mergedMessagesByChat =
            typeof data.messagesByChat !== "undefined"
              ? data.messagesByChat
              : latestMessagesByChat;
          const mergedArtifacts =
            typeof data.artifacts !== "undefined"
              ? data.artifacts
              : latestArtifacts;
          const mergedUserPreferences =
            typeof data.userPreferences !== "undefined"
              ? data.userPreferences
              : latestUserPreferences;
          const mergedActiveChatId =
            localStorage.getItem("activeChatId") || latestActiveChatId;

          syncMap.set("chats", JSON.stringify(mergedChats));
          syncMap.set("messagesByChat", JSON.stringify(mergedMessagesByChat));
          syncMap.set("artifacts", JSON.stringify(mergedArtifacts));
          syncMap.set("userPreferences", JSON.stringify(mergedUserPreferences));
          syncMap.set("activeChatId", mergedActiveChatId);
          console.log(
            `[COLLAB] 🔄 ${this.isLeader ? "Leader" : "Collab"} data updated`
          );
        }
      });
    }

    // 2. Listen for remote changes and update local state
    let lastRemoteSummary = "";
    syncMap.observeDeep(() => {
      isApplyingRemote = true;
      try {
        const chats = JSON.parse(syncMap.get("chats") || "[]");
        const messagesByChat = JSON.parse(
          syncMap.get("messagesByChat") || "{}"
        );
        const artifacts = JSON.parse(syncMap.get("artifacts") || "[]");
        const userPreferences = JSON.parse(
          syncMap.get("userPreferences") || "{}"
        );
        const activeChatId = syncMap.get("activeChatId") || null;
        const summary = `chats:${chats.length}, messages:${
          Object.keys(messagesByChat).length
        }, artifacts:${artifacts.length}, activeChatId:${activeChatId}`;

        // Collaborator: Only apply leader's data the first time
        if (
          !this.isLeader &&
          !hasAppliedInitialSync &&
          syncMap.get("initializedByLeader")
        ) {
          isSyncingInitialState = true;
          localStorage.setItem("chats", JSON.stringify(chats));
          localStorage.setItem(
            "messagesByChat",
            JSON.stringify(messagesByChat)
          );
          localStorage.setItem("artifacts", JSON.stringify(artifacts));
          localStorage.setItem(
            "userPreferences",
            JSON.stringify(userPreferences)
          );
          if (activeChatId) localStorage.setItem("activeChatId", activeChatId);
          hasAppliedInitialSync = true;
          // Refresh UI
          if (window.memory && window.memory.loadAll) window.memory.loadAll();
          if (window.views && window.views.renderCurrentView)
            window.views.renderCurrentView(false);
          if (window.memoryView && window.memoryView.refreshView)
            window.memoryView.refreshView();
          setTimeout(() => {
            isSyncingInitialState = false;
          }, 100);
          console.log("[COLLAB] ✅ Collaborator synced with leader data");
        } else if (this.isLeader || hasAppliedInitialSync) {
          // After initial sync, all changes are bidirectional
          localStorage.setItem("chats", JSON.stringify(chats));
          // DON'T overwrite messagesByChat - individual message sync handles this
          console.log(
            "[COLLAB] 🛡️ Skipping messagesByChat overwrite - using individual message sync"
          );
          localStorage.setItem("artifacts", JSON.stringify(artifacts));
          localStorage.setItem(
            "userPreferences",
            JSON.stringify(userPreferences)
          );
          if (activeChatId) localStorage.setItem("activeChatId", activeChatId);
          // Only log if the data actually changed
          if (summary !== lastRemoteSummary) {
            console.log(
              `[COLLAB] 🟢 ${
                this.isLeader ? "Leader" : "Collab"
              } data synced via general sync (syncMap.observeDeep)`
            );
            console.log("[COLLAB] 📊 Data summary:", summary);

            // Add UI refresh for general data sync
            setTimeout(() => {
              console.log(
                "[COLLAB] 🔄 Refreshing UI after general data sync..."
              );
              if (window.memory && window.memory.loadAll) {
                window.memory.loadAll();
                console.log(
                  "[COLLAB] ✅ memory.loadAll() called (general sync)"
                );
              }
              if (window.views && window.views.renderCurrentView) {
                window.views.renderCurrentView(false);
                console.log(
                  "[COLLAB] ✅ views.renderCurrentView() called (general sync)"
                );
              }
              if (window.memoryView && window.memoryView.refreshView) {
                window.memoryView.refreshView();
                console.log(
                  "[COLLAB] ✅ memoryView.refreshView() called (general sync)"
                );
              }
              console.log(
                "[COLLAB] 🟢 UI refresh completed after general data sync"
              );
            }, 120);

            lastRemoteSummary = summary;
          }
        }
      } catch (err) {
        console.error("[COLLAB] Error syncing remote Yjs data:", err);
      }
      isApplyingRemote = false;
    });

    // 3. On initial join, only the leader initializes the shared map
    if (syncMap.size === 0 && this.isLeader) {
      if (window.memory && window.memory.loadAll) window.memory.loadAll();
      const chats = JSON.parse(localStorage.getItem("chats") || "[]");
      const messagesByChat = JSON.parse(
        localStorage.getItem("messagesByChat") || "{}"
      );
      const artifacts = JSON.parse(localStorage.getItem("artifacts") || "[]");
      const userPreferences = JSON.parse(
        localStorage.getItem("userPreferences") || "{}"
      );
      const activeChatId = localStorage.getItem("activeChatId");
      syncMap.set("chats", JSON.stringify(chats));
      syncMap.set("messagesByChat", JSON.stringify(messagesByChat));
      syncMap.set("artifacts", JSON.stringify(artifacts));
      syncMap.set("userPreferences", JSON.stringify(userPreferences));
      syncMap.set("activeChatId", activeChatId);
      syncMap.set("initializedByLeader", true);
      console.log("[COLLAB] 🚀 Leader pushed initial data to sharedSyncMap");
    } else if (syncMap.size === 0 && !this.isLeader) {
      // Collaborator waits for leader's data
      console.log(
        "[COLLAB] ⏳ Waiting for leader to initialize sharedSyncMap..."
      );
    }

    console.log("[COLLAB] 🔄 Bidirectional sync enabled");
  },

  // Leave collaboration
  leaveSession() {
    console.log("[COLLAB] Leaving session...");

    if (this.provider) {
      this.provider.destroy();
      this.provider = null;
    }

    if (this.ydoc) {
      this.ydoc.destroy();
      this.ydoc = null;
    }

    this.isCollaborating = false;
    this.collaborationId = null;
    this.peers.clear();
    this.isLeader = false;

    // Clear collaboration protection
    this.clearCollaborationProtection();

    // Update UI
    this.updateUI();

    console.log("[COLLAB] Session left");
  },

  // Get collaboration status
  getStatus() {
    return {
      isCollaborating: this.isCollaborating,
      collaborationId: this.collaborationId,
      peerCount: this.peers.size,
      peers: Array.from(this.peers),
      isLeader: this.isLeader,
    };
  },

  // Debug function to test WebRTC connection
  async testConnection() {
    console.log("[COLLAB] Testing WebRTC connection...");

    if (!this.provider) {
      console.log("[COLLAB] No provider available for testing");
      return { success: false, error: "No provider available" };
    }

    try {
      console.log("[COLLAB] Provider state:", this.provider);
      console.log("[COLLAB] Provider room name:", this.provider.roomName);
      console.log(
        "[COLLAB] Provider signaling servers:",
        this.provider.signalingUrls
      );

      // Check if provider has any connection methods
      if (this.provider.connect) {
        console.log("[COLLAB] Provider has connect method");
      }

      if (this.provider.disconnect) {
        console.log("[COLLAB] Provider has disconnect method");
      }

      // Try to get peer connections
      if (this.provider.peers) {
        console.log(
          "[COLLAB] Current peers from provider:",
          this.provider.peers
        );
      }

      // Check provider properties
      console.log("[COLLAB] Provider connected:", this.provider.connected);
      console.log("[COLLAB] Provider connecting:", this.provider.connecting);
      console.log("[COLLAB] Provider room:", this.provider.room);

      // Check for additional provider properties
      console.log("[COLLAB] Provider awareness:", this.provider.awareness);
      console.log("[COLLAB] Provider doc:", this.provider.doc);
      console.log("[COLLAB] Provider roomName:", this.provider.roomName);

      // Try to manually connect if not connected
      if (!this.provider.connected && !this.provider.connecting) {
        console.log("[COLLAB] Attempting to manually connect provider...");
        if (this.provider.connect) {
          this.provider.connect();
          console.log("[COLLAB] Manual connect called");
        }
      }

      // Check if provider has any internal connection state
      if (this.provider._room) {
        console.log("[COLLAB] Provider internal room:", this.provider._room);
      }

      if (this.provider._signalingConns) {
        console.log(
          "[COLLAB] Provider signaling connections:",
          this.provider._signalingConns
        );
      }

      return { success: true, message: "Connection test completed" };
    } catch (error) {
      console.error("[COLLAB] Error testing connection:", error);
      return { success: false, error: error.message };
    }
  },

  // Force connect to signaling servers
  async forceConnect() {
    console.log("[COLLAB] Force connecting to signaling servers...");

    if (!this.provider) {
      console.log("[COLLAB] No provider available for force connect");
      return { success: false, error: "No provider available" };
    }

    try {
      // Try to reconnect the provider
      if (this.provider.disconnect) {
        console.log("[COLLAB] Disconnecting provider first...");
        this.provider.disconnect();
      }

      // Wait a moment then reconnect
      setTimeout(() => {
        if (this.provider.connect) {
          console.log("[COLLAB] Reconnecting provider...");
          this.provider.connect();
        }
      }, 1000);

      return { success: true, message: "Force connect initiated" };
    } catch (error) {
      console.error("[COLLAB] Error force connecting:", error);
      return { success: false, error: error.message };
    }
  },

  // Manually trigger peer discovery
  async triggerPeerDiscovery() {
    console.log("[COLLAB] Triggering peer discovery...");

    if (!this.provider) {
      console.log("[COLLAB] No provider available for peer discovery");
      return { success: false, error: "No provider available" };
    }

    try {
      // Check if provider has a room
      if (this.provider.room) {
        console.log("[COLLAB] Provider room found:", this.provider.room);
        console.log("[COLLAB] Room peerId:", this.provider.room.peerId);
        console.log("[COLLAB] Room synced:", this.provider.room.synced);

        // Try to get room peers
        if (this.provider.room.peers) {
          console.log("[COLLAB] Room peers:", this.provider.room.peers);
        }

        // Try to get room connections
        if (this.provider.room.connections) {
          console.log(
            "[COLLAB] Room connections:",
            this.provider.room.connections
          );
        }

        // Check room signaling connections
        if (this.provider.room._signalingConns) {
          console.log(
            "[COLLAB] Room signaling connections:",
            this.provider.room._signalingConns
          );
        }

        // Check room webrtc connections
        if (this.provider.room._webrtcConns) {
          console.log(
            "[COLLAB] Room webrtc connections:",
            this.provider.room._webrtcConns
          );
        }
      }

      // Check awareness for other clients
      if (this.provider.awareness) {
        console.log(
          "[COLLAB] Awareness states:",
          this.provider.awareness.states
        );
        console.log(
          "[COLLAB] Awareness clientID:",
          this.provider.awareness.clientID
        );
        console.log("[COLLAB] Awareness meta:", this.provider.awareness.meta);

        // Log each awareness state
        this.provider.awareness.states.forEach((state, clientId) => {
          console.log(
            `[COLLAB] Awareness state for client ${clientId}:`,
            state
          );
        });
      }

      // Try to manually trigger a sync
      if (this.provider.room && this.provider.room.sync) {
        console.log("[COLLAB] Manually triggering room sync...");
        this.provider.room.sync();
      }

      // Try to manually trigger awareness sync
      if (this.provider.awareness && this.provider.awareness.setLocalState) {
        console.log("[COLLAB] Setting local awareness state...");
        this.provider.awareness.setLocalState({
          user: "collaborator",
          timestamp: Date.now(),
        });
      }

      return { success: true, message: "Peer discovery triggered" };
    } catch (error) {
      console.error("[COLLAB] Error triggering peer discovery:", error);
      return { success: false, error: error.message };
    }
  },

  // Get leader's database data from localStorage/IndexedDB
  getLeaderDatabaseData() {
    console.log("[COLLAB] 📊 Collecting leader's database data...");

    try {
      // Get data from localStorage
      const activeChatId = localStorage.getItem("activeChatId");
      const chats = JSON.parse(localStorage.getItem("chats") || "[]");
      const messagesByChat = JSON.parse(
        localStorage.getItem("messagesByChat") || "{}"
      );
      const artifacts = JSON.parse(localStorage.getItem("artifacts") || "[]");
      const userPreferences = JSON.parse(
        localStorage.getItem("userPreferences") || "{}"
      );

      // Additional useful data
      const activeView = localStorage.getItem("activeView");
      const userId = localStorage.getItem("userId");

      const databaseData = {
        timestamp: Date.now(),
        sender: "leader",
        type: "database_sync",
        data: {
          activeChatId,
          chats,
          messagesByChat,
          artifacts,
          userPreferences,
          activeView,
          userId,
        },
        summary: {
          totalChats: chats.length,
          totalMessageGroups: Object.keys(messagesByChat).length,
          totalArtifacts: artifacts.length,
          activeChatId,
          hasUserPreferences: Object.keys(userPreferences).length > 0,
        },
      };

      console.log("[COLLAB] 📦 Database data collected:", {
        chats: databaseData.summary.totalChats,
        messageGroups: databaseData.summary.totalMessageGroups,
        artifacts: databaseData.summary.totalArtifacts,
        activeChatId: databaseData.data.activeChatId,
        userPreferences: databaseData.summary.hasUserPreferences,
      });

      return databaseData;
    } catch (error) {
      console.error("[COLLAB] ❌ Error collecting database data:", error);
      return null;
    }
  },

  // Send leader's database data to collaborator
  async sendDatabaseData() {
    console.log("[COLLAB] 📤 Sending database data...");

    if (!this.ydoc) {
      console.log("[COLLAB] ❌ No Yjs document available");
      return { success: false, error: "No Yjs document" };
    }

    if (!this.isLeader) {
      console.log("[COLLAB] ❌ Only leader can send database data");
      return { success: false, error: "Only leader can send database data" };
    }

    try {
      // Get leader's database data
      const databaseData = this.getLeaderDatabaseData();
      if (!databaseData) {
        return { success: false, error: "Failed to collect database data" };
      }

      console.log("[COLLAB] 📦 Sending database data:", databaseData.summary);

      // Send via shared map (better for structured data)
      const sharedMap = this.getSharedMap("database-sync");
      if (sharedMap) {
        sharedMap.set("leaderDatabaseData", databaseData);
        console.log("[COLLAB] ✅ Database data sent via shared map");
      }

      // Also send via shared text as backup
      const sharedText = this.getSharedText("database-data");
      if (sharedText) {
        sharedText.delete(0, sharedText.length);
        sharedText.insert(0, JSON.stringify(databaseData));
        console.log("[COLLAB] ✅ Database data sent via shared text");
      }

      return { success: true, data: databaseData.summary };
    } catch (error) {
      console.error("[COLLAB] ❌ Error sending database data:", error);
      return { success: false, error: error.message };
    }
  },

  // Send test data from leader to collaborator (kept for compatibility)
  async sendTestData() {
    console.log("[COLLAB] 📤 Sending test data...");

    if (!this.ydoc) {
      console.log("[COLLAB] ❌ No Yjs document available");
      return { success: false, error: "No Yjs document" };
    }

    try {
      // Create test data
      const testData = {
        timestamp: Date.now(),
        sender: this.isLeader ? "leader" : "collaborator",
        message: "Hello from " + (this.isLeader ? "leader" : "collaborator"),
        localData: {
          chats: JSON.parse(localStorage.getItem("chats") || "[]").length,
          messages: Object.keys(
            JSON.parse(localStorage.getItem("messagesByChat") || "{}")
          ).length,
          artifacts: JSON.parse(localStorage.getItem("artifacts") || "[]")
            .length,
        },
      };

      console.log("[COLLAB] 📦 Test data to send:", testData);

      // Get shared text and send data
      const sharedText = this.getSharedText("test-data");
      if (sharedText) {
        // Clear existing content and insert new data
        sharedText.delete(0, sharedText.length);
        sharedText.insert(0, JSON.stringify(testData));
        console.log("[COLLAB] ✅ Test data sent successfully");
      }

      // Also send via shared map
      const sharedMap = this.getSharedMap("test-map");
      if (sharedMap) {
        sharedMap.set("lastTestData", testData);
        console.log("[COLLAB] ✅ Test data sent via shared map");
      }

      return { success: true, data: testData };
    } catch (error) {
      console.error("[COLLAB] ❌ Error sending test data:", error);
      return { success: false, error: error.message };
    }
  },

  // Receive database data from leader
  receiveDatabaseData() {
    console.log("[COLLAB] 📥 Checking for database data...");

    if (!this.ydoc) {
      console.log("[COLLAB] ❌ No Yjs document available");
      return null;
    }

    try {
      // Get shared map data (primary source)
      const sharedMap = this.getSharedMap("database-sync");
      if (sharedMap && sharedMap.has("leaderDatabaseData")) {
        const databaseData = sharedMap.get("leaderDatabaseData");
        console.log("[COLLAB] 📥 Received database data from shared map:");
        console.log("[COLLAB] 📊 Data summary:", databaseData.summary);
        return databaseData;
      }

      // Fallback to shared text
      const sharedText = this.getSharedText("database-data");
      if (sharedText && sharedText.length > 0) {
        const textData = sharedText.toString();
        if (textData) {
          const parsedData = JSON.parse(textData);
          console.log("[COLLAB] 📥 Received database data from shared text:");
          console.log("[COLLAB] 📊 Data summary:", parsedData.summary);
          return parsedData;
        }
      }

      console.log("[COLLAB] ❌ No database data found");
      return null;
    } catch (error) {
      console.error("[COLLAB] ❌ Error receiving database data:", error);
      return null;
    }
  },

  // Apply leader's database data to collaborator's local storage
  async applyLeaderData(databaseData = null) {
    console.log("[COLLAB] 🔄 Applying leader's database data...");

    // If no data provided, try to receive it
    if (!databaseData) {
      databaseData = this.receiveDatabaseData();
    }

    if (!databaseData || !databaseData.data) {
      console.log("[COLLAB] ❌ No database data available to apply");
      return { success: false, error: "No database data available" };
    }

    try {
      const { data } = databaseData;

      console.log("[COLLAB] 📥 Applying data to localStorage:");
      console.log("[COLLAB] - activeChatId:", data.activeChatId);
      console.log("[COLLAB] - chats:", data.chats?.length || 0);
      console.log(
        "[COLLAB] - messagesByChat groups:",
        Object.keys(data.messagesByChat || {}).length
      );
      console.log("[COLLAB] - artifacts:", data.artifacts?.length || 0);
      console.log(
        "[COLLAB] - userPreferences:",
        Object.keys(data.userPreferences || {}).length
      );

      // Set collaboration protection flag
      localStorage.setItem("COLLABORATION_ACTIVE", "true");
      localStorage.setItem(
        "COLLABORATION_DATA_TIMESTAMP",
        Date.now().toString()
      );
      console.log("[COLLAB] 🛡️ Collaboration protection activated");

      // Apply data to localStorage
      if (data.activeChatId) {
        localStorage.setItem("activeChatId", data.activeChatId);
      }

      if (data.chats) {
        localStorage.setItem("chats", JSON.stringify(data.chats));
      }

      if (data.messagesByChat) {
        localStorage.setItem(
          "messagesByChat",
          JSON.stringify(data.messagesByChat)
        );
      }

      if (data.artifacts) {
        localStorage.setItem("artifacts", JSON.stringify(data.artifacts));
      }

      if (data.userPreferences) {
        localStorage.setItem(
          "userPreferences",
          JSON.stringify(data.userPreferences)
        );
      }

      if (data.activeView) {
        localStorage.setItem("activeView", data.activeView);
      }

      if (data.userId) {
        localStorage.setItem("userId", data.userId);
      }

      // Update application state and refresh UI
      console.log("[COLLAB] 🔄 Refreshing application state and UI...");

      // Reload memory data
      if (window.memory && window.memory.loadAll) {
        window.memory.loadAll();
      }

      // Update context state
      if (window.context && window.context.setState) {
        window.context.setState({
          chats: data.chats || [],
          messagesByChat: data.messagesByChat || {},
          artifacts: data.artifacts || [],
          activeChatId: data.activeChatId,
          userPreferences: data.userPreferences || {},
        });
      }

      // Set active chat if provided
      if (data.activeChatId && window.context && window.context.setActiveChat) {
        window.context.setActiveChat(data.activeChatId);
      }

      // Refresh the current view to show updated data
      if (window.views && window.views.renderCurrentView) {
        console.log("[COLLAB] 🎨 Refreshing current view...");
        window.views.renderCurrentView(false); // No transition for data update
      }

      // Specifically refresh memory view if it's active
      if (window.memoryView && window.memoryView.refreshView) {
        console.log("[COLLAB] 📊 Refreshing memory view...");
        window.memoryView.refreshView();
      } else if (window.memoryView && window.memoryView.renderMemoryView) {
        // Fallback: re-render memory view
        const activeView = window.context?.getActiveView();
        if (!activeView || activeView.type === "memory") {
          console.log("[COLLAB] 📊 Re-rendering memory view...");
          const viewElement = window.context?.getViewElement();
          if (viewElement) {
            viewElement.innerHTML = window.memoryView.renderMemoryView();
          }
        }
      }

      // Trigger collaboration update event for UI refresh
      const event = new CustomEvent("collaborationDataUpdate", {
        detail: {
          summary: databaseData.summary,
          timestamp: Date.now(),
        },
      });
      document.dispatchEvent(event);

      console.log(
        "[COLLAB] ✅ Database data applied and UI refreshed successfully"
      );

      return {
        success: true,
        summary: databaseData.summary,
        uiRefreshed: true,
      };
    } catch (error) {
      console.error("[COLLAB] ❌ Error applying database data:", error);
      return { success: false, error: error.message };
    }
  },

  // Receive and log test data (kept for compatibility)
  receiveTestData() {
    console.log("[COLLAB] 📥 Checking for test data...");

    if (!this.ydoc) {
      console.log("[COLLAB] ❌ No Yjs document available");
      return null;
    }

    try {
      // Get shared text data
      const sharedText = this.getSharedText("test-data");
      if (sharedText && sharedText.length > 0) {
        const textData = sharedText.toString();
        if (textData) {
          const parsedData = JSON.parse(textData);
          console.log(
            "[COLLAB] 📥 Received test data from shared text:",
            parsedData
          );
        }
      }

      // Get shared map data
      const sharedMap = this.getSharedMap("test-map");
      if (sharedMap && sharedMap.has("lastTestData")) {
        const mapData = sharedMap.get("lastTestData");
        console.log("[COLLAB] 📥 Received test data from shared map:", mapData);
        return mapData;
      }

      console.log("[COLLAB] ❌ No test data found");
      return null;
    } catch (error) {
      console.error("[COLLAB] ❌ Error receiving test data:", error);
      return null;
    }
  },

  // Check if collaboration data protection is active
  isCollaborationProtected() {
    const isActive = localStorage.getItem("COLLABORATION_ACTIVE") === "true";
    const timestamp = localStorage.getItem("COLLABORATION_DATA_TIMESTAMP");
    const isRecent =
      timestamp && Date.now() - parseInt(timestamp) < 24 * 60 * 60 * 1000; // 24 hours

    return isActive && isRecent;
  },

  // Clear collaboration protection (when leaving session)
  clearCollaborationProtection() {
    localStorage.removeItem("COLLABORATION_ACTIVE");
    localStorage.removeItem("COLLABORATION_DATA_TIMESTAMP");
    console.log("[COLLAB] 🛡️ Collaboration protection cleared");
  },

  // Global function to check if data overwrites should be prevented
  shouldPreventDataOverwrite() {
    const isProtected = this.isCollaborationProtected();
    const isCollaborating = this.isCollaborating;

    if (isProtected || isCollaborating) {
      console.log(
        "[COLLAB] 🛡️ Preventing data overwrite - collaboration active"
      );
      return true;
    }

    return false;
  },

  // Force refresh the entire UI state with current data
  async forceRefreshUI() {
    console.log("[COLLAB] 🔄 Force refreshing entire UI state...");

    try {
      // Reload all data from localStorage
      if (window.memory && window.memory.loadAll) {
        window.memory.loadAll();
        console.log("[COLLAB] ✅ Memory data reloaded");
      }

      // Update context with fresh localStorage data
      if (window.context && window.context.setState) {
        const chats = JSON.parse(localStorage.getItem("chats") || "[]");
        const messagesByChat = JSON.parse(
          localStorage.getItem("messagesByChat") || "{}"
        );
        const artifacts = JSON.parse(localStorage.getItem("artifacts") || "[]");
        const activeChatId = localStorage.getItem("activeChatId");
        const userPreferences = JSON.parse(
          localStorage.getItem("userPreferences") || "{}"
        );

        window.context.setState({
          chats,
          messagesByChat,
          artifacts,
          activeChatId,
          userPreferences,
        });

        console.log("[COLLAB] ✅ Context state updated with:", {
          chats: chats.length,
          messageGroups: Object.keys(messagesByChat).length,
          artifacts: artifacts.length,
          activeChatId,
        });
      }

      // Force re-render current view
      if (window.views && window.views.renderCurrentView) {
        window.views.renderCurrentView(false);
        console.log("[COLLAB] ✅ Views re-rendered");
      }

      // Trigger UI update events
      this.updateUI();

      console.log("[COLLAB] ✅ Complete UI refresh finished");
      return { success: true, message: "UI refreshed successfully" };
    } catch (error) {
      console.error("[COLLAB] ❌ Error during UI refresh:", error);
      return { success: false, error: error.message };
    }
  },

  // Set up automatic data listeners
  setupDataListeners() {
    if (!this.ydoc) {
      console.log("[COLLAB] ❌ No Yjs document for data listeners");
      return;
    }

    try {
      // Listen to database data changes
      const databaseMap = this.getSharedMap("database-sync");
      if (databaseMap) {
        databaseMap.observe((event) => {
          console.log("[COLLAB] 🔔 Database sync map changed:", event);
          event.changes.keys.forEach((change, key) => {
            if (change.action === "add" || change.action === "update") {
              const value = databaseMap.get(key);
              if (key === "leaderDatabaseData" && value) {
                console.log("[COLLAB] 📥 Leader database data received:");
                console.log("[COLLAB] 📊 Summary:", value.summary);

                // Auto-apply if this is a collaborator
                if (!this.isLeader) {
                  console.log("[COLLAB] 🔄 Auto-applying leader data...");
                  this.applyLeaderData(value).then((result) => {
                    if (result.success) {
                      console.log("[COLLAB] ✅ Auto-apply successful");
                    } else {
                      console.error(
                        "[COLLAB] ❌ Auto-apply failed:",
                        result.error
                      );
                    }
                  });
                }
              }
            }
          });
        });
        console.log("[COLLAB] ✅ Database sync listener set up");
      }

      // Listen to shared text changes (for test data and fallback)
      const sharedText = this.getSharedText("test-data");
      if (sharedText) {
        sharedText.observe((event) => {
          console.log("[COLLAB] 🔔 Test data text changed:", event);
          if (sharedText.length > 0) {
            try {
              const data = JSON.parse(sharedText.toString());
              console.log("[COLLAB] 📥 Auto-received test data:", data);
            } catch (e) {
              console.log(
                "[COLLAB] 📥 Raw text change:",
                sharedText.toString()
              );
            }
          }
        });
        console.log("[COLLAB] ✅ Test data text listener set up");
      }

      // Listen to database data text changes (fallback)
      const databaseText = this.getSharedText("database-data");
      if (databaseText) {
        databaseText.observe((event) => {
          console.log("[COLLAB] 🔔 Database data text changed:", event);
          if (databaseText.length > 0) {
            try {
              const data = JSON.parse(databaseText.toString());
              console.log(
                "[COLLAB] 📥 Database data received via text:",
                data.summary
              );
            } catch (e) {
              console.log(
                "[COLLAB] 📥 Raw database text change:",
                databaseText.toString()
              );
            }
          }
        });
        console.log("[COLLAB] ✅ Database data text listener set up");
      }

      // Listen to shared map changes (for test data)
      const testMap = this.getSharedMap("test-map");
      if (testMap) {
        testMap.observe((event) => {
          console.log("[COLLAB] 🔔 Test map changed:", event);
          event.changes.keys.forEach((change, key) => {
            if (change.action === "add" || change.action === "update") {
              const value = testMap.get(key);
              console.log(`[COLLAB] 📥 Test map key '${key}' changed:`, value);
            }
          });
        });
        console.log("[COLLAB] ✅ Test map listener set up");
      }

      // Listen for collaboration data updates to refresh UI
      document.addEventListener("collaborationDataUpdate", (event) => {
        console.log(
          "[COLLAB] 🔔 Collaboration data update event received:",
          event.detail
        );

        // Force refresh memory view if needed
        setTimeout(() => {
          if (window.views && window.views.renderCurrentView) {
            console.log(
              "[COLLAB] 🎨 Forcing view refresh after data update..."
            );
            window.views.renderCurrentView(false);
          }
        }, 100); // Small delay to ensure state is updated
      });

      console.log("[COLLAB] ✅ All data listeners configured");
    } catch (error) {
      console.error("[COLLAB] ❌ Error setting up data listeners:", error);
    }
  },
};

// Make collaboration available globally
window.collaboration = collaboration;

// Add global functions for easy console access
window.sendDatabaseData = function () {
  console.log("[COLLAB] 🧪 Sending database data from console...");
  if (!window.collaboration) {
    console.error("[COLLAB] ❌ Collaboration module not available");
    return;
  }
  return window.collaboration.sendDatabaseData();
};

window.receiveDatabaseData = function () {
  console.log("[COLLAB] 🧪 Receiving database data from console...");
  if (!window.collaboration) {
    console.error("[COLLAB] ❌ Collaboration module not available");
    return;
  }
  return window.collaboration.receiveDatabaseData();
};

window.applyLeaderData = function () {
  console.log("[COLLAB] 🧪 Applying leader data from console...");
  if (!window.collaboration) {
    console.error("[COLLAB] ❌ Collaboration module not available");
    return;
  }
  return window.collaboration.applyLeaderData();
};

window.refreshCollaborationUI = function () {
  console.log("[COLLAB] 🧪 Force refreshing UI from console...");
  if (!window.collaboration) {
    console.error("[COLLAB] ❌ Collaboration module not available");
    return;
  }
  return window.collaboration.forceRefreshUI();
};

window.sendTestData = function () {
  console.log("[COLLAB] 🧪 Sending test data from console...");
  if (!window.collaboration) {
    console.error("[COLLAB] ❌ Collaboration module not available");
    return;
  }
  return window.collaboration.sendTestData();
};

window.receiveTestData = function () {
  console.log("[COLLAB] 🧪 Receiving test data from console...");
  if (!window.collaboration) {
    console.error("[COLLAB] ❌ Collaboration module not available");
    return;
  }
  return window.collaboration.receiveTestData();
};

window.getCollaborationStatus = function () {
  if (!window.collaboration) {
    return { error: "Collaboration module not found" };
  }

  return window.collaboration.getStatus();
};

// Global protection function for other modules to check
window.isCollaborationProtected = function () {
  return window.collaboration?.shouldPreventDataOverwrite() || false;
};

console.log("[COLLAB] 🎯 Database functions available:");
console.log(
  "[COLLAB] - sendDatabaseData() - Send leader's database to collaborators"
);
console.log(
  "[COLLAB] - receiveDatabaseData() - Check for received database data"
);
console.log(
  "[COLLAB] - applyLeaderData() - Apply leader's data to local storage"
);
console.log(
  "[COLLAB] - refreshCollaborationUI() - Force refresh UI after data sync"
);
console.log("[COLLAB] 🎯 Test functions available:");
console.log("[COLLAB] - sendTestData() - Send test data to collaborators");
console.log("[COLLAB] - receiveTestData() - Check for received test data");
console.log("[COLLAB] - getCollaborationStatus() - Get collaboration status");
console.log("[COLLAB] 🛡️ Protection function available:");
console.log(
  "[COLLAB] - isCollaborationProtected() - Check if data should be protected"
);

// Auto-initialize when script loads
collaboration.init();
