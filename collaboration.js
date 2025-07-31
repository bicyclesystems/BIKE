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
  messageQueue: [], // Queue for messages during reconnection
  chatQueue: [], // Queue for chats during reconnection
  artifactQueue: [], // Queue for artifacts during reconnection
  lastSyncPing: 0,
  isReconnecting: false,
  databaseSyncQueue: [], // Queue for ordered database sync

  // Database integration properties
  databaseCollaborationId: null, // UUID from database
  participantId: null, // Anonymous participant ID
  supabaseClient: null,

  // Initialize collaboration
  async init() {
    console.log("[COLLAB-DATA] 🚀 Initializing collaboration system...");
    
    // Wait for Yjs to be loaded
    await this.waitForYjs();

    // Load collaboration data from localStorage
    this.loadCollaborationData();

    // Set up cleanup on page unload (but preserve for refresh)
    this.setupPageUnloadCleanup();

    // Check for existing collaboration session or auto-join
    await this.checkForExistingSession();
    
    console.log("[COLLAB-DATA] ✅ Collaboration system initialized");
  },

  // Wait for Yjs libraries to load
  async waitForYjs() {
    return new Promise((resolve) => {
      const check = () => {
        if (window.Y && window.WebrtcProvider) {
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

  // Extract permissions from URL (check both search params and hash)
  extractPermissionsFromUrl() {
    // First check search parameters (main URL)
    const urlParams = new URLSearchParams(window.location.search);
    let permissions = urlParams.get('perms');
    
    // If not found in search, check hash fragment
    if (!permissions) {
      const hash = window.location.hash;
      const hashMatch = hash.match(/[?&]perms=([^&#]+)/);
      if (hashMatch) {
        permissions = hashMatch[1];
      }
    }
    
    return permissions || 'view';
  },

  // Create a shareable collaboration link
  async createCollaborationLink(permissions = 'view') {
    try {
      // Generate collaboration ID
      const collaborationId = this.generateCollaborationId();

      // Create the shareable link with permissions in main URL
      const shareableLink = `${window.location.origin}${window.location.pathname}?perms=${permissions}#/collab-${collaborationId}`;

      // Create the session with permissions
      const result = await this.createSession(collaborationId, permissions);

      if (result.success) {
        // Mark as leader and persist state
        this.isLeader = true;
        localStorage.setItem("collaborationLeader", "true");
        localStorage.setItem("collaborationId", collaborationId);
        localStorage.setItem("collaborationActive", "true");
        localStorage.setItem(
          "COLLABORATION_DATA_TIMESTAMP",
          Date.now().toString()
        );

        // Copy link to clipboard
        try {
          await navigator.clipboard.writeText(shareableLink);
        } catch (error) {
          // Silent fail on clipboard
        }

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
      return { success: false, error: "No collaboration ID found in URL" };
    }

    // Extract permissions from URL (check both search params and hash)
    const permissions = this.extractPermissionsFromUrl();
    console.log("[COLLAB] Extracted permissions from URL:", permissions);

    // Mark as collaborator (not leader) and persist state
    this.isLeader = false;
    localStorage.setItem("collaborationLeader", "false");
    localStorage.setItem("collaborationId", collaborationId);
    localStorage.setItem("collaborationActive", "true");
    localStorage.setItem("collaborationPermissions", permissions);
    localStorage.setItem("COLLABORATION_DATA_TIMESTAMP", Date.now().toString());

    // Force clear any old permission data to ensure fresh start
    console.log("[COLLAB] 🔄 Ensuring fresh permission state for collaborator");
    
    return await this.joinSession(collaborationId, permissions);
  },

  // Check for existing collaboration session and restore it
  async checkForExistingSession() {
    // First check localStorage for existing session
    const storedCollabId = localStorage.getItem("collaborationId");
    const storedIsLeader =
      localStorage.getItem("collaborationLeader") === "true";
    const storedIsCollaborating =
      localStorage.getItem("collaborationActive") === "true";

    // Then check URL for collaboration ID
    const urlCollabId = this.extractCollaborationIdFromUrl();

    // Priority logic: URL collaboration ID always takes precedence
    if (urlCollabId && urlCollabId !== storedCollabId) {
      // Clear old session data
      this.clearSessionData();

      // Join new collaboration from URL
      const result = await this.joinCollaborationFromUrl();
    } else if (
      storedIsCollaborating &&
      storedCollabId &&
      !this.isCollaborating &&
      !urlCollabId
    ) {
      // Restore existing session only if no URL collaboration ID is present
      this.isLeader = storedIsLeader;

      if (this.isLeader) {
        const result = await this.createSession(storedCollabId);
      } else {
        // Collaborator: rejoin
        const storedPermissions = localStorage.getItem("collaborationPermissions") || 'view';
        const result = await this.joinSession(storedCollabId, storedPermissions);
        if (result.success) {
          // Request current data after successful rejoin
          setTimeout(() => {
            this.requestCurrentDataFromLeader();
          }, 1500);
        }
      }
    } else if (urlCollabId && !this.isCollaborating) {
      // Fresh collaboration from URL (no stored session or same ID)
      const result = await this.joinCollaborationFromUrl();
    }
  },

  // Create a collaboration session
  async createSession(roomName = null, permissions = 'view') {
    try {
      console.log("[COLLAB-DATA] 🚀 Creating collaboration session...");
      
      // Generate room name if not provided
      if (!roomName) {
        roomName = "room-" + Math.random().toString(36).substr(2, 9);
      }

      console.log("[COLLAB-DATA] 📋 Room Name:", roomName);
      console.log("[COLLAB-DATA] 📋 Permissions:", permissions);

      // Check if room already exists globally
      if (window.globalRoomRegistry.has(roomName)) {
        const existingProvider = window.globalRoomRegistry.get(roomName);
        if (existingProvider && existingProvider.provider) {
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

      // Create Yjs document
      this.ydoc = new window.Y.Doc();

      // Create WebRTC provider with signaling servers
      const signalingServers = ["ws://localhost:4444"];

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

      // Set up event listeners
      this.setupEventListeners();

      // Create collaboration session in database
      console.log("[COLLAB-DATA] 📝 Creating database record...");
      const dbResult = await this.createCollaborationInDatabase(roomName, permissions);
      
      if (!dbResult.success) {
        console.error("[COLLAB-DATA] ❌ Failed to create database record:", dbResult.error);
        // Continue with local session even if database fails
      } else {
        console.log("[COLLAB-DATA] ✅ Database record created successfully");
      }

      // Update state and persist
      this.isCollaborating = true;
      this.isLeader = true;
      this.collaborationId = roomName;
      localStorage.setItem("collaborationActive", "true");
      localStorage.setItem("collaborationId", roomName);
              localStorage.setItem("collaborationPermissions", permissions);
        localStorage.setItem("collaborationLeader", "true");
        
        // Store leader's userId in localStorage for immediate access
        const currentUserId = localStorage.getItem("userId") || window.userId;
        if (currentUserId) {
          localStorage.setItem("collaborationLeaderId", currentUserId);
          console.log("[COLLAB-DATA] 📋 Leader userId stored in localStorage:", currentUserId);
        }
        
        // Store leader's userId in shared sync map for collaborators to access
        // This will be done after Yjs is set up in setupEventListeners
 
        console.log("[COLLAB-DATA] ✅ Collaboration session created successfully");
        console.log("[COLLAB-DATA] 📋 Database Collaboration ID:", this.databaseCollaborationId);
      console.log("[COLLAB-DATA] 📋 Participant ID:", this.participantId);

      return { 
        success: true, 
        roomName,
        databaseCollaborationId: this.databaseCollaborationId,
        participantId: this.participantId
      };
    } catch (error) {
      console.error("[COLLAB-DATA] ❌ Error creating session:", error);
      return { success: false, error: error.message };
    }
  },

  // Join an existing collaboration session
  async joinSession(roomName, permissions = null) {
    try {
      console.log("[COLLAB-DATA] 🔗 Joining collaboration session...");
      console.log("[COLLAB-DATA] 📋 Room Name:", roomName);
      console.log("[COLLAB-DATA] 📋 Permissions:", permissions);

      // Create Yjs document
      this.ydoc = new window.Y.Doc();
      console.log("[COLLAB-DATA] ✅ Yjs document created");

      // Create WebRTC provider with signaling servers
      console.log("[COLLAB-DATA] 🔗 Creating WebRTC provider...");

      const signalingServers = ["ws://localhost:4444"];

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

      console.log("[COLLAB-DATA] ✅ WebRTC provider created successfully");

              // Set up event listeners
        this.setupEventListeners();

        // Wait for Yjs to be ready and retrieve leader's userId from shared map
        await this.waitForYjs();
        
        // Retry mechanism to get leaderId from shared map
        let retryCount = 0;
        const maxRetries = 10;
        
        while (retryCount < maxRetries && !this.leaderId) {
          const sharedSyncMap = this.getSharedSyncMap();
          if (sharedSyncMap) {
            this.leaderId = sharedSyncMap.get('leaderId');
            if (this.leaderId) {
              console.log("[COLLAB-DATA] 📋 Retrieved leaderId from shared map:", this.leaderId);
              localStorage.setItem("collaborationLeaderId", this.leaderId);
              break;
            }
          }
          
          console.log(`[COLLAB-DATA] 🔄 Attempt ${retryCount + 1}/${maxRetries} to get leaderId...`);
          await new Promise(resolve => setTimeout(resolve, 500));
          retryCount++;
        }
        
        if (!this.leaderId) {
          console.warn("[COLLAB-DATA] ⚠️ Could not retrieve leaderId from shared map after retries");
        }
 
        // Join collaboration session in database
      console.log("[COLLAB-DATA] 📝 Joining database record...");
      const dbResult = await this.joinCollaborationInDatabase(roomName, permissions);
      
      if (!dbResult.success) {
        console.error("[COLLAB-DATA] ❌ Failed to join database record:", dbResult.error);
        // Continue with local session even if database fails
      } else {
        console.log("[COLLAB-DATA] ✅ Database record joined successfully");
      }

      // Update state and persist
      this.isCollaborating = true;
      this.isLeader = false; // Joining means not the leader
      this.collaborationId = roomName;
      localStorage.setItem("collaborationActive", "true");
      localStorage.setItem("collaborationId", roomName);
      localStorage.setItem("collaborationLeader", "false");
      
      // Store permissions if provided
      if (permissions) {
        localStorage.setItem("collaborationPermissions", permissions);
        console.log("[COLLAB-DATA] 📋 Stored permissions:", permissions);
      }

      console.log("[COLLAB-DATA] ✅ Joined session successfully");
      console.log("[COLLAB-DATA] 📋 Database Collaboration ID:", this.databaseCollaborationId);
      console.log("[COLLAB-DATA] 📋 Participant ID:", this.participantId);

      return { 
        success: true, 
        roomName,
        databaseCollaborationId: this.databaseCollaborationId,
        participantId: this.participantId
      };
    } catch (error) {
      console.error("[COLLAB-DATA] ❌ Error joining session:", error);
      return { success: false, error: error.message };
    }
  },

  // Set up event listeners
  setupEventListeners() {
    if (!this.provider) {
      return;
    }

    // Listen for peer connections with monitoring
    this.provider.on("peers", (event) => {
      event.added.forEach((peerId) => {
        if (!this.peers.has(peerId)) {
          this.peers.add(peerId);
          console.log(
            `[COLLAB] 🟢 Peer connected: ${peerId.substring(0, 8)}... (total: ${
              this.peers.size
            })`
          );
        }
      });

      event.removed.forEach((peerId) => {
        if (this.peers.has(peerId)) {
          this.peers.delete(peerId);
          console.log(
            `[COLLAB] 🔴 Peer disconnected: ${peerId.substring(
              0,
              8
            )}... (total: ${this.peers.size})`
          );

          // If we lose all peers, attempt reconnection after delay
          if (this.peers.size === 0) {
            console.log(
              "[COLLAB] ⚠️ All peers lost - scheduling reconnection..."
            );
            this.scheduleReconnection();
          }
        }
      });

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
          // Don't sync userPreferences - collaborators keep their own
          // Don't sync activeChatId - collaborators keep their own
          syncMap.set("initializedByLeader", true);
          
          // Store leader's userId in shared sync map for collaborators to access
          const currentUserId = localStorage.getItem("userId") || window.userId;
          if (currentUserId) {
            syncMap.set('leaderId', currentUserId);
            console.log("[COLLAB-DATA] 📋 Leader userId pushed to shared map:", currentUserId);
          } else {
            console.log("[COLLAB-DATA] ⚠️ No userId available to push to shared map");
          }
          
          syncMap.set("lastUpdated", Date.now().toString());

          // Also push current messages to sharedMessages array
          this.syncCurrentMessagesToSharedArray();
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
      // Awareness tracking
    });

    // Set up data listeners for automatic data sync
    this.setupDataListeners();
    this.setupBidirectionalSync();

    // Start connection health monitoring
    this.startConnectionMonitoring();
  },

  // Connection monitoring and reconnection
  scheduleReconnection(delay = 5000) {
    if (this.reconnectionTimeout) {
      clearTimeout(this.reconnectionTimeout);
    }

    this.reconnectionTimeout = setTimeout(() => {
      console.log("[COLLAB] 🔄 Attempting reconnection...");
      this.attemptReconnection();
    }, delay); // Configurable delay for immediate or delayed reconnection
  },

  async attemptReconnection() {
    if (!this.isCollaborating) {
      console.log("[COLLAB] 🚫 Not collaborating - skipping reconnection");
      return;
    }

    this.isReconnecting = true; // Flag to queue messages during reconnection

    try {
      console.log("[COLLAB] 🔄 Reconnecting provider...");

      const roomName = this.collaborationId;
      if (!roomName) {
        console.error("[COLLAB] ❌ No room name for reconnection");
        return;
      }

      // Disconnect current provider but keep the document
      if (this.provider) {
        this.provider.disconnect();
        this.provider.destroy();
        this.provider = null;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Create new provider with existing document (don't create new doc)
      console.log(`[COLLAB] 🔄 Recreating provider for room: ${roomName}`);

      if (!this.ydoc) {
        console.error("[COLLAB] ❌ No Yjs document exists for reconnection");
        return;
      }

      // Create new WebRTC provider with existing document
      const signalingServers = ["ws://localhost:4444"];
      this.provider = new window.WebrtcProvider(roomName, this.ydoc, {
        signaling: signalingServers,
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

      // Re-setup event listeners
      this.setupEventListeners();

      console.log(`[COLLAB] ✅ Provider reconnected to room: ${roomName}`);

      this.isReconnecting = false; // Clear reconnection flag

      // Process queued messages after successful reconnection
      this.processMessageQueue();
    } catch (error) {
      console.error("[COLLAB] ❌ Reconnection failed:", error);
      this.isReconnecting = false; // Clear flag on failure too
      // Schedule another attempt
      this.scheduleReconnection();
    }
  },

  // Process queued messages, chats, and artifacts after reconnection
  processMessageQueue() {
    const totalQueued =
      this.messageQueue.length +
      this.chatQueue.length +
      this.artifactQueue.length;
    if (totalQueued === 0) return;

    console.log(
      `[COLLAB] 📤 Processing ${totalQueued} queued items (${this.messageQueue.length} messages, ${this.chatQueue.length} chats, ${this.artifactQueue.length} artifacts)...`
    );

    let delay = 0;

    // Process messages
    const messageQueue = [...this.messageQueue];
    this.messageQueue = [];
    messageQueue.forEach((messageToSync, index) => {
      try {
        setTimeout(() => {
          this.sharedMessages.push([messageToSync]);
          console.log(
            `[COLLAB] ✅ Queued message sent: "${messageToSync.content}"`
          );
        }, delay);
        delay += 100;
      } catch (error) {
        console.warn("[COLLAB] ⚠️ Failed to send queued message:", error);
        this.messageQueue.push(messageToSync);
      }
    });

    // Process chats
    const chatQueue = [...this.chatQueue];
    this.chatQueue = [];
    chatQueue.forEach((chatToSync, index) => {
      try {
        setTimeout(() => {
          this.sharedChats.push([chatToSync]);
          console.log(`[COLLAB] ✅ Queued chat sent: "${chatToSync.title}"`);
        }, delay);
        delay += 100;
      } catch (error) {
        console.warn("[COLLAB] ⚠️ Failed to send queued chat:", error);
        this.chatQueue.push(chatToSync);
      }
    });

    // Process artifacts
    const artifactQueue = [...this.artifactQueue];
    this.artifactQueue = [];
    artifactQueue.forEach((artifactToSync, index) => {
      try {
        setTimeout(() => {
          this.sharedArtifacts.push([artifactToSync]);
          console.log(
            `[COLLAB] ✅ Queued artifact sent: "${artifactToSync.title}"`
          );
        }, delay);
        delay += 100;
      } catch (error) {
        console.warn("[COLLAB] ⚠️ Failed to send queued artifact:", error);
        this.artifactQueue.push(artifactToSync);
      }
    });

    // After all items are sent to Yjs, process database sync queue in order
    setTimeout(() => {
      this.processDatabaseSyncQueue();
    }, delay + 100); // Wait for all Yjs operations to complete
  },

  // Process database sync queue in the correct order
  processDatabaseSyncQueue() {
    if (this.databaseSyncQueue.length === 0) return;

    console.log(
      `[COLLAB] 💾 Processing ${this.databaseSyncQueue.length} database sync operations in order...`
    );

    const queue = [...this.databaseSyncQueue];
    this.databaseSyncQueue = [];

    queue.forEach((operation, index) => {
      setTimeout(() => {
        const { type, data } = operation;
        console.log(`[COLLAB] 💾 Database sync: ${type}`);

        // Trigger database sync through memory system
        if (window.memory?.events) {
          window.memory.events.dispatchEvent(
            new CustomEvent("dataChanged", {
              detail: { type, data },
            })
          );
        }
      }, index * 50); // Stagger database operations by 50ms
    });
  },

  startConnectionMonitoring() {
    // Monitor connection health every 3 seconds for fast detection
    if (this.connectionMonitorInterval) {
      clearInterval(this.connectionMonitorInterval);
    }

    this.connectionMonitorInterval = setInterval(() => {
      if (this.isCollaborating && this.provider) {
        const isConnected = this.provider.connected;
        const peerCount = this.peers.size;

        console.log(
          `[COLLAB] ❤️ Health check - Connected: ${isConnected}, Peers: ${peerCount}`
        );

        // Fast detection of problematic states
        if (!isConnected && peerCount > 0) {
          console.log(
            "[COLLAB] ⚠️ Provider disconnected but peers exist - document sync broken!"
          );
          this.scheduleReconnection(100); // Immediate reconnection
        } else if (isConnected && peerCount === 0 && this.isCollaborating) {
          console.log(
            "[COLLAB] ⚠️ Provider connected but no peers - peer discovery broken!"
          );
          this.refreshConnection(); // Try light refresh first
        }

        // Fast message sync timeout detection (reduced to 5 seconds)
        if (this.lastSentMessage && this.isCollaborating) {
          const messageAge = Date.now() - this.lastSentMessage.timestamp;
          if (messageAge > 5000) {
            // Reduced to 5 seconds for faster detection
            console.log(
              `[COLLAB] ⚠️ Message sync timeout - sent "${
                this.lastSentMessage.content
              }" ${Math.round(messageAge / 1000)}s ago with no echo`
            );
            this.lastSentMessage = null; // Clear to avoid spam
            this.scheduleReconnection(100); // Immediate reconnection
          }
        }

        // Proactive sync verification
        this.verifySyncHealth();
      }
    }, 3000); // Check every 3 seconds for fast response
  },

  // Light connection refresh without full reconnection
  refreshConnection() {
    if (!this.provider || !this.isCollaborating) return;

    console.log("[COLLAB] 🔄 Light connection refresh...");

    // Use proper Yjs mechanism for connection refresh
    try {
      // Trigger a small document update to refresh the connection
      const refreshMap = this.ydoc.getMap("connectionRefresh");
      refreshMap.set("timestamp", Date.now());
      console.log("[COLLAB] 📡 Connection refresh triggered via Yjs");
    } catch (error) {
      console.warn("[COLLAB] ⚠️ Connection refresh failed:", error);
      // Fall back to full reconnection if light refresh fails
      this.scheduleReconnection(100);
    }
  },

  // Proactive sync health verification
  verifySyncHealth() {
    if (!this.isCollaborating || !this.provider) return;

    // Check if the provider is stale
    const now = Date.now();
    if (this.provider.connected && this.peers.size > 0) {
      // Send a lightweight sync ping every 10 seconds to maintain connection
      if (!this.lastSyncPing || now - this.lastSyncPing > 10000) {
        this.sendSyncPing();
        this.lastSyncPing = now;
      }
    }
  },

  // Send lightweight sync ping to maintain connection
  sendSyncPing() {
    if (!this.provider?.connected || !this.sharedMessages) return;

    try {
      // Use Yjs document update mechanism instead of direct broadcast
      // This is more reliable and uses the proper Yjs API
      const syncPingMap = this.ydoc.getMap("syncPing");
      syncPingMap.set("ping", {
        type: "sync_ping",
        timestamp: Date.now(),
        from: this.userId || "unknown",
      });

      console.log("[COLLAB] 🏓 Sync ping sent via Yjs");
    } catch (error) {
      console.warn("[COLLAB] ⚠️ Sync ping failed:", error);
    }
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

  // Clear session data (helper function)
  clearSessionData() {
    console.log("[COLLAB] 🧹 Clearing old session data...");

    // Clear monitoring intervals
    if (this.connectionMonitorInterval) {
      clearInterval(this.connectionMonitorInterval);
      this.connectionMonitorInterval = null;
    }
    if (this.reconnectionTimeout) {
      clearTimeout(this.reconnectionTimeout);
      this.reconnectionTimeout = null;
    }

    // Disconnect provider if exists
    if (this.provider) {
      this.provider.disconnect();
      this.provider = null;
    }

    // Clear Yjs document if exists
    if (this.ydoc) {
      this.ydoc.destroy();
      this.ydoc = null;
    }

    // Clear state
    this.isCollaborating = false;
    this.collaborationId = null;
    this.peers.clear();
    this.isLeader = false;

    // Clear persistence - COMPLETE cleanup including permissions
    localStorage.removeItem("collaborationActive");
    localStorage.removeItem("collaborationLeader");
    localStorage.removeItem("collaborationId");
    localStorage.removeItem("collaborationPermissions");
    localStorage.removeItem("COLLABORATION_ACTIVE");
    localStorage.removeItem("COLLABORATION_DATA_TIMESTAMP");
    
    console.log("[COLLAB] ✅ All collaboration data cleared from localStorage");
  },

  // Set up page unload cleanup
  setupPageUnloadCleanup() {
    // Track if this is just a refresh vs actual navigation away
    let isRefreshing = false;

    // Detect refresh attempts
    window.addEventListener("beforeunload", (event) => {
      // Set a flag that we're potentially refreshing
      localStorage.setItem("COLLAB_POTENTIAL_REFRESH", Date.now().toString());
    });

    // Check if we came back from a refresh
    window.addEventListener("load", () => {
      const potentialRefresh = localStorage.getItem("COLLAB_POTENTIAL_REFRESH");
      if (potentialRefresh) {
        const timeDiff = Date.now() - parseInt(potentialRefresh);
        if (timeDiff < 5000) {
          // Less than 5 seconds = likely a refresh
          isRefreshing = true;

          // Update timestamp to show this is an active session
          localStorage.setItem(
            "COLLABORATION_DATA_TIMESTAMP",
            Date.now().toString()
          );
        }
        localStorage.removeItem("COLLAB_POTENTIAL_REFRESH");
      }
    });

    // Clean up when page is actually being navigated away from (not refresh)
    window.addEventListener("pagehide", (event) => {
      if (!isRefreshing && this.isCollaborating) {
        console.log(
          "[COLLAB] 🚪 Page navigation detected - cleaning up session"
        );
        // Don't clear localStorage on refresh, but disconnect provider
        if (this.provider) {
          this.provider.disconnect();
        }
      }
    });

    // Set up periodic cleanup of stale sessions (every 30 seconds)
    setInterval(() => {
      this.cleanupStaleSession();
    }, 30000);
  },

  // Clean up stale sessions (if provider disconnected but localStorage still has data)
  cleanupStaleSession() {
    const isStored = localStorage.getItem("collaborationActive") === "true";
    const hasProvider = this.provider && this.provider.connected;

    if (isStored && !hasProvider && !this.isCollaborating) {
      console.log("[COLLAB] 🧹 Cleaning up stale session data");
      this.clearSessionData();
    }
  },

  // Leave collaboration session
  leaveSession() {
    try {
      console.log("[COLLAB] Leaving collaboration session...");

      // Use the clear session data helper
      this.clearSessionData();

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
            userId: msg.userId || this.userId || localStorage.getItem("userId"),
            isSaved: msg.isSaved || false,
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
        
        // Retrieve leader's userId from shared sync map
        const leaderId = syncMap.get("leaderId");
        if (leaderId) {
          console.log("[COLLAB-DATA] 📋 Retrieved leaderId from shared map:", leaderId);
          this.leaderId = leaderId;
          localStorage.setItem("collaborationLeaderId", leaderId);
        } else {
          console.log("[COLLAB-DATA] ⚠️ No leaderId found in shared map");
        }

        // Update local storage with leader's current data
        localStorage.setItem("chats", JSON.stringify(chats));
        localStorage.setItem("messagesByChat", JSON.stringify(messagesByChat));
        localStorage.setItem("artifacts", JSON.stringify(artifacts));
        // Don't sync userPreferences - collaborators keep their own
        
        // Set default activeChatId for collaborator if not already set (use first available chat)
        const currentActiveChatId = localStorage.getItem("activeChatId");
        if (!currentActiveChatId && chats.length > 0) {
          const defaultChatId = chats[0].id;
          console.log("[COLLAB] 🔧 Setting default activeChatId for collaborator:", defaultChatId);
          localStorage.setItem("activeChatId", defaultChatId);
          if (window.context?.setActiveChat) {
            window.context.setActiveChat(defaultChatId);
          }
        }

        // Also sync messages from shared array
        this.syncMessagesFromSharedArray();

        // Initialize default activeView for collaborator if not set (only on initial load)
        const currentView = window.context?.getActiveView();
        let storedView = null;
        try {
          const storedViewJson = localStorage.getItem("activeView");
          if (storedViewJson) {
            storedView = JSON.parse(storedViewJson);
          }
        } catch (error) {
          console.warn("[COLLAB] ⚠️ Error parsing stored view:", error);
        }
        
        if (!currentView && !storedView) {
          console.log("[COLLAB] 🔧 Initializing default artifacts view for collaborator (initial load)");
          window.context.setActiveView("artifacts", {}, { withTransition: false });
        } else if (storedView && !currentView) {
          console.log("[COLLAB] 🔧 Restoring stored view for collaborator:", storedView.type);
          window.context.setActiveView(storedView.type, storedView.data || {}, { withTransition: false });
        }

        // Initialize default userPreferences for collaborator if not set
        const currentPreferences = JSON.parse(localStorage.getItem("userPreferences") || "{}");
        if (!currentPreferences.name) {
          console.log("[COLLAB] 🔧 Initializing default userPreferences for collaborator");
          const defaultPreferences = {
            name: "collaborator"
          };
          localStorage.setItem("userPreferences", JSON.stringify(defaultPreferences));
          if (window.context?.setUserPreferences) {
            window.context.setUserPreferences(defaultPreferences);
          }
        }

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

      console.log("[COLLAB] 🔄 Syncing messages from shared array:", currentMessages.length);

      // Use the memory system to add messages properly
      if (window.memory && window.memory.saveMessage) {
        currentMessages.forEach((msg) => {
          const chatId = msg.chatId;
          if (!chatId) return;

          // Check if message already exists to avoid duplicates
          const existingMessages = window.context?.getMessagesByChat()[chatId] || [];
          const exists = existingMessages.some(
            (m) => m.message_id === msg.message_id
          );
          
          if (!exists) {
            console.log("[COLLAB] 💾 Adding message via memory system:", msg.message_id);
            window.memory.saveMessage(chatId, msg);
          } else {
            console.log("[COLLAB] ⚠️ Message already exists, skipping:", msg.message_id);
          }
        });
      } else {
        // Fallback to direct localStorage manipulation only if memory system is not available
        console.warn("[COLLAB] ⚠️ Memory system not available, using direct localStorage");
        
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
      }
      
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

    // --- Granular, bidirectional sync for chats ---
    this.sharedChats = this.ydoc.getArray("sharedChats");
    let hasAppliedInitialChats = false;

    // --- Granular, bidirectional sync for artifacts ---
    this.sharedArtifacts = this.ydoc.getArray("sharedArtifacts");
    let hasAppliedInitialArtifacts = false;

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
              userId: msg.userId || this.userId || localStorage.getItem("userId"),
              isSaved: msg.isSaved || false,
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

    // Initial sync: leader pushes all chats if array is empty
    if (this.isLeader && this.sharedChats.length === 0) {
      try {
        const chats = JSON.parse(localStorage.getItem("chats") || "[]");
        chats.forEach((chat) => {
          const chatToSync = {
            id: chat.id,
            title: chat.title,
            description: chat.description || "",
            timestamp: chat.timestamp,
            endTime: chat.endTime,
          };
          this.sharedChats.push([chatToSync]);
        });
        if (chats.length > 0) {
          console.log("[COLLAB] 🚀 Leader synced", chats.length, "chats");
        }
      } catch (e) {
        console.warn("[COLLAB] ⚠️ Error during initial chats sync:", e);
      }
    }

    // Collaborator loads all chats from sharedChats if local is empty
    if (!this.isLeader) {
      let localChats = [];
      try {
        localChats = JSON.parse(localStorage.getItem("chats") || "[]");
      } catch (e) {
        console.warn("[COLLAB] ⚠️ Error parsing initial chats:", e);
        localChats = [];
      }
      if (localChats.length === 0 && this.sharedChats.length > 0) {
        const chatsFromShared = this.sharedChats.toArray();
        localStorage.setItem("chats", JSON.stringify(chatsFromShared));

        if (window.memory && window.memory.loadAll) window.memory.loadAll();
        if (window.views && window.views.renderCurrentView)
          window.views.renderCurrentView(false);
        console.log(
          "[COLLAB] ✅ Collaborator loaded",
          this.sharedChats.length,
          "chats"
        );
      }
    }

    // Initial sync: leader pushes all artifacts if array is empty
    if (this.isLeader && this.sharedArtifacts.length === 0) {
      try {
        const artifacts = JSON.parse(localStorage.getItem("artifacts") || "[]");
        artifacts.forEach((artifact) => {
          const artifactToSync = {
            id: artifact.id,
            title: artifact.title,
            type: artifact.type,
            slug: artifact.slug,
            versions: artifact.versions,
            liveUrl: artifact.liveUrl,
            createdAt: artifact.createdAt,
            updatedAt: artifact.updatedAt,
            messageId: artifact.messageId,
            chatId: artifact.chatId,
          };
          this.sharedArtifacts.push([artifactToSync]);
        });
        if (artifacts.length > 0) {
          console.log(
            "[COLLAB] 🚀 Leader synced",
            artifacts.length,
            "artifacts"
          );
        }
      } catch (e) {
        console.warn("[COLLAB] ⚠️ Error during initial artifacts sync:", e);
      }
    }

    // Collaborator loads all artifacts from sharedArtifacts if local is empty
    if (!this.isLeader) {
      let localArtifacts = [];
      try {
        localArtifacts = JSON.parse(localStorage.getItem("artifacts") || "[]");
      } catch (e) {
        console.warn("[COLLAB] ⚠️ Error parsing initial artifacts:", e);
        localArtifacts = [];
      }
      if (localArtifacts.length === 0 && this.sharedArtifacts.length > 0) {
        const artifactsFromShared = this.sharedArtifacts.toArray();
        localStorage.setItem("artifacts", JSON.stringify(artifactsFromShared));

        if (window.memory && window.memory.loadAll) window.memory.loadAll();
        if (window.views && window.views.renderCurrentView)
          window.views.renderCurrentView(false);
        console.log(
          "[COLLAB] ✅ Collaborator loaded",
          this.sharedArtifacts.length,
          "artifacts"
        );
      }
    }

    // On local message add (example: call this when sending a message)
    this.pushMessageToCollab = (msgObj) => {
      
      // Determine correct chatId based on role
      let chatId;
      if (this.isLeader) {
        // Leader uses their own activeChatId
        chatId =
          msgObj.chatId ||
          window.context?.getActiveChatId() ||
          localStorage.getItem("activeChatId");
      } else {
        // Collaborator uses the leader's shared activeChatId
        const syncMap = this.getSharedSyncMap();
        const sharedActiveChatId = syncMap ? syncMap.get("activeChatId") : null;
        chatId =
          sharedActiveChatId ||
          msgObj.chatId ||
          window.context?.getActiveChatId() ||
          localStorage.getItem("activeChatId");


      }

      // Create a clean message structure with only essential fields
      const messageToSync = {
        role: msgObj.role,
        content: msgObj.content,
        message_id: msgObj.message_id,
        timestamp: msgObj.timestamp,
        chatId: chatId,
        isSaved: msgObj.isSaved || false, // Preserve the isSaved flag
        userId: msgObj.userId || (this.isLeader ? this.userId : null), // Include userId
      };

      console.log("[COLLAB-DEBUG] 📤 === PUSH MESSAGE TO COLLAB DEBUG ===");
      console.log("[COLLAB-DEBUG] 📋 Original message object:", {
        role: msgObj.role,
        content: msgObj.content?.substring(0, 50) + "...",
        message_id: msgObj.message_id,
        isSaved: msgObj.isSaved,
        userId: msgObj.userId
      });
      console.log("[COLLAB-DEBUG] 📋 Message to sync:", {
        role: messageToSync.role,
        content: messageToSync.content?.substring(0, 50) + "...",
        message_id: messageToSync.message_id,
        isSaved: messageToSync.isSaved,
        userId: messageToSync.userId
      });

      // If this is a collaborator, modify the role and use leader's userId
      if (!this.isLeader) {
        messageToSync.role = "collab";
        messageToSync.userId = localStorage.getItem("collaborationLeaderId") || "unknown";
      } else {
        // For leader, ensure userId is set
        messageToSync.userId = messageToSync.userId || this.userId || localStorage.getItem("userId");
      }

      console.log(
        `[COLLAB] 📤 ${this.isLeader ? "Leader" : "Collab"} → "${
          msgObj.content
        }" (peers: ${this.peers.size})`
      );

      // Optimistic message sending with queueing during reconnection
      if (this.isReconnecting || !this.provider?.connected) {
        console.log("[COLLAB] 📋 Queueing message during reconnection...");
        this.messageQueue.push(messageToSync);
        return;
      }

      try {
        // Push as individual message (Yjs will wrap it in ContentAny)
        this.sharedMessages.push([messageToSync]);

        // Track message for sync verification
        this.lastSentMessage = {
          id: messageToSync.message_id,
          timestamp: Date.now(),
          content: messageToSync.content,
        };
      } catch (error) {
        console.warn("[COLLAB] ⚠️ Message send failed, queueing:", error);
        this.messageQueue.push(messageToSync);
      }
    };

    // Push chat to collaboration (EXACTLY like messages)
    this.pushChatToCollab = (chatObj) => {
      console.log("[COLLAB-DEBUG] 📤 === PUSH CHAT TO COLLAB START ===");
      console.log("[COLLAB-DEBUG] 📋 Chat object:", chatObj);
      
      const chatToSync = {
        id: chatObj.id,
        title: chatObj.title,
        description: chatObj.description || "",
        timestamp: chatObj.timestamp,
        endTime: chatObj.endTime,
        role: this.isLeader ? "leader" : "collab", // Track who created it
        userId: this.userId || "unknown",
      };

      console.log("[COLLAB-DEBUG] 📋 Chat to sync:", chatToSync);
      console.log("[COLLAB-DEBUG] 🔍 Collaboration status:", {
        isLeader: this.isLeader,
        isReconnecting: this.isReconnecting,
        providerConnected: this.provider?.connected || false,
        peers: this.peers.size,
        hasSharedChats: !!this.sharedChats
      });

      console.log(
        `[COLLAB] 📤 ${this.isLeader ? "Leader" : "Collab"} → Chat "${
          chatObj.title
        }" (peers: ${this.peers.size})`
      );

      // Check if we should force push even during reconnection
      const shouldForcePush = this.provider?.connected && this.peers.size > 0;
      console.log("[COLLAB-DEBUG] 🔍 Should force push:", shouldForcePush);

      // Always try to push to shared array first, queue as fallback
      try {
        console.log("[COLLAB-DEBUG] 📤 Attempting to push to sharedChats array...");
        console.log("[COLLAB-DEBUG] 📊 Shared chats length before:", this.sharedChats.length);
        this.sharedChats.push([chatToSync]);
        console.log("[COLLAB-DEBUG] 📊 Shared chats length after:", this.sharedChats.length);
        console.log("[COLLAB] ✅ Chat synced to peers");
        console.log("[COLLAB-DEBUG] ✅ === PUSH CHAT TO COLLAB SUCCESS ===");
      } catch (error) {
        console.warn("[COLLAB] ⚠️ Chat send failed, queueing:", error);
        console.error("[COLLAB-DEBUG] ❌ === PUSH CHAT TO COLLAB ERROR ===", error);
        this.chatQueue.push(chatToSync);
        
        // Try to process queue immediately if provider is actually connected
        if (this.provider?.connected && this.chatQueue.length > 0) {
          console.log("[COLLAB-DEBUG] 🔄 Provider is connected, attempting to process queue...");
          setTimeout(() => {
            this.processMessageQueue();
          }, 100);
        }
      }
    };

    // Push artifact to collaboration (EXACTLY like messages)
    this.pushArtifactToCollab = (artifactObj) => {
      const artifactToSync = {
        id: artifactObj.id,
        title: artifactObj.title,
        type: artifactObj.type,
        slug: artifactObj.slug,
        versions: artifactObj.versions,
        liveUrl: artifactObj.liveUrl,
        createdAt: artifactObj.createdAt,
        updatedAt: artifactObj.updatedAt,
        messageId: artifactObj.messageId,
        chatId: artifactObj.chatId,
        role: this.isLeader ? "leader" : "collab", // Track who created it
        userId: this.userId || "unknown",
      };

      console.log(
        `[COLLAB] 📤 ${this.isLeader ? "Leader" : "Collab"} → Artifact "${
          artifactObj.title
        }" (peers: ${this.peers.size})`
      );

      // Optimistic artifact sending with queueing during reconnection (SAME as messages)
      if (this.isReconnecting || !this.provider?.connected) {
        console.log("[COLLAB] 📋 Queueing artifact during reconnection...");
        this.artifactQueue.push(artifactToSync);
        return;
      }

      try {
        this.sharedArtifacts.push([artifactToSync]);
        console.log("[COLLAB] ✅ Artifact synced to peers");
      } catch (error) {
        console.warn("[COLLAB] ⚠️ Artifact send failed, queueing:", error);
        this.artifactQueue.push(artifactToSync);
      }
    };

    // On remote message add (always process new messages)
    this.sharedMessages.observe((event) => {
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

        newMessages.forEach((newMsg, msgIndex) => {
          
          // Skip processing our own messages (prevent self-echo)
          if (newMsg.role === "collab" && !this.isLeader) {
            // This is a collaborator message and we are the collaborator - skip
            console.log("[COLLAB-DEBUG] ⏭️ Skipping own collaborator message");
            return;
          }
          if (newMsg.role !== "collab" && this.isLeader) {
            // This is a leader message and we are the leader - skip
            console.log("[COLLAB-DEBUG] ⏭️ Skipping own leader message");
            return;
          }

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
            // Preserve the original isSaved status from the message
            // Don't modify isSaved - let it be exactly as it was sent
            
            console.log(
              `[COLLAB] 📨 ${this.isLeader ? "Leader" : "Collab"} ← "${
                newMsg.content
              }"`
            );

            // Clear last sent message (sync is working)
            if (this.lastSentMessage) {
              this.lastSentMessage = null;
            }

            // Use the memory system to add the message properly
            // This prevents duplication by using the centralized message management
            if (window.memory && window.memory.saveMessage) {
              console.log("[COLLAB] 💾 Using memory system to add received message");
              window.memory.saveMessage(chatId, newMsg);
            } else {
              // Fallback to direct localStorage manipulation only if memory system is not available
              console.warn("[COLLAB] ⚠️ Memory system not available, using direct localStorage");
              messagesByChat[chatId].push(newMsg);
              localStorage.setItem(
                "messagesByChat",
                JSON.stringify(messagesByChat)
              );
            }

            // Update UI/state with proper timing
            setTimeout(() => {
              if (window.views && window.views.renderCurrentView) {
                window.views.renderCurrentView(false);
              }
              if (window.memoryView && window.memoryView.refreshView) {
                window.memoryView.refreshView();
              }
              if (window.memory && window.memory.events) {
                window.memory.events.dispatchEvent(
                  new CustomEvent("memoryUpdated", {
                    detail: { source: "collaboration", chatId: chatId },
                  })
                );
              }
              document.dispatchEvent(
                new CustomEvent("collaborationDataUpdate", {
                  detail: { type: "messageReceived", chatId: chatId },
                })
              );
            }, 100);
          }
        });
      });
    });

    // On remote chats add/change
    this.sharedChats.observe((event) => {
      console.log("[COLLAB-DEBUG] 📨 === SHARED CHATS OBSERVER TRIGGERED ===");
      console.log("[COLLAB-DEBUG] 📋 Event changes:", event.changes);
      console.log("[COLLAB-DEBUG] 📋 Added items count:", event.changes.added.length);
      
      event.changes.added.forEach((item, itemIndex) => {
        console.log("[COLLAB-DEBUG] 📋 Processing added item:", itemIndex, item);
        
        // Extract actual chat from Yjs ContentAny wrapper
        let newChats = [];
        if (
          item.content &&
          item.content.arr &&
          Array.isArray(item.content.arr)
        ) {
          newChats = item.content.arr;
          console.log("[COLLAB-DEBUG] 📋 Extracted from content.arr:", newChats);
        } else if (Array.isArray(item.content)) {
          newChats = item.content;
          console.log("[COLLAB-DEBUG] 📋 Extracted from content array:", newChats);
        } else {
          newChats = [item.content];
          console.log("[COLLAB-DEBUG] 📋 Extracted from single content:", newChats);
        }

        newChats.forEach((newChat) => {
          console.log("[COLLAB-DEBUG] 📋 Processing new chat:", newChat);
          
          // Get current chats state
          let chats = [];
          try {
            chats = JSON.parse(localStorage.getItem("chats") || "[]");
            console.log("[COLLAB-DEBUG] 📊 Current chats from localStorage:", chats.length);
          } catch (e) {
            console.warn("[COLLAB] ⚠️ Error parsing chats:", e);
            chats = [];
          }

          // Check for duplicates using chat id
          const exists = chats.some((c) => c.id === newChat.id);
          console.log("[COLLAB-DEBUG] 🔍 Chat already exists:", exists);

          if (!exists) {
            // Add chat to the array
            chats.push(newChat);
            console.log("[COLLAB-DEBUG] 📝 Added chat to array, new count:", chats.length);

            // Save to localStorage
            localStorage.setItem("chats", JSON.stringify(chats));
            console.log("[COLLAB-DEBUG] 💾 Saved to localStorage");

            console.log(
              `[COLLAB] 📨 ${this.isLeader ? "Leader" : "Collab"} ← Chat "${
                newChat.title
              }"`
            );

            // Queue database sync for later (maintain order)
            this.databaseSyncQueue.push({
              type: "chat",
              data: newChat,
            });
            console.log("[COLLAB-DEBUG] 📋 Queued for database sync");

            // Update UI/state with proper timing
            setTimeout(() => {
              console.log("[COLLAB-DEBUG] 🔄 Updating UI after chat received...");
              if (window.memory && window.memory.loadAll) {
                window.memory.loadAll();
                console.log("[COLLAB-DEBUG] ✅ Memory loaded");
              }
              if (window.views && window.views.renderCurrentView) {
                window.views.renderCurrentView(false);
                console.log("[COLLAB-DEBUG] ✅ View rendered");
              }
              if (window.memoryView && window.memoryView.refreshView) {
                window.memoryView.refreshView();
                console.log("[COLLAB-DEBUG] ✅ Memory view refreshed");
              }
              document.dispatchEvent(
                new CustomEvent("collaborationDataUpdate", {
                  detail: { type: "chatReceived", chatId: newChat.id },
                })
              );
              console.log("[COLLAB-DEBUG] ✅ Collaboration data update event dispatched");
            }, 100);
          } else {
            console.log("[COLLAB-DEBUG] ⚠️ Skipping duplicate chat:", newChat.id);
          }
        });
      });
    });

    // On remote artifacts add/change
    this.sharedArtifacts.observe((event) => {
      event.changes.added.forEach((item, itemIndex) => {
        // Extract actual artifact from Yjs ContentAny wrapper
        let newArtifacts = [];
        if (
          item.content &&
          item.content.arr &&
          Array.isArray(item.content.arr)
        ) {
          newArtifacts = item.content.arr;
        } else if (Array.isArray(item.content)) {
          newArtifacts = item.content;
        } else {
          newArtifacts = [item.content];
        }

        newArtifacts.forEach((newArtifact) => {
          // Get current artifacts state
          let artifacts = [];
          try {
            artifacts = JSON.parse(localStorage.getItem("artifacts") || "[]");
          } catch (e) {
            console.warn("[COLLAB] ⚠️ Error parsing artifacts:", e);
            artifacts = [];
          }

          // Check for duplicates using artifact id
          const exists = artifacts.some((a) => a.id === newArtifact.id);

          if (!exists) {
            // Add artifact to the array
            artifacts.push(newArtifact);

            // Save to localStorage
            localStorage.setItem("artifacts", JSON.stringify(artifacts));

            console.log(
              `[COLLAB] 📨 ${this.isLeader ? "Leader" : "Collab"} ← Artifact "${
                newArtifact.title
              }"`
            );

            // Queue database sync for later (maintain order)
            this.databaseSyncQueue.push({
              type: "artifact",
              data: newArtifact,
            });

            // Update UI/state with proper timing
            setTimeout(() => {
              if (window.memory && window.memory.loadAll) {
                window.memory.loadAll();
              }
              if (window.views && window.views.renderCurrentView) {
                window.views.renderCurrentView(false);
              }
              if (window.memoryView && window.memoryView.refreshView) {
                window.memoryView.refreshView();
              }
              document.dispatchEvent(
                new CustomEvent("collaborationDataUpdate", {
                  detail: {
                    type: "artifactReceived",
                    artifactId: newArtifact.id,
                  },
                })
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
          // COLLABORATORS: Only handle message-related changes, never chats structure
          if (!this.isLeader) {
            console.log(
              "[COLLAB] 🚫 Collab skipping general sync - leaders manage chats structure"
            );
            return; // Collaborators should never modify chats structure
          }

          // LEADER ONLY: Check if this is just a message addition (should use individual sync)
          const currentChats = JSON.parse(
            localStorage.getItem("chats") || "[]"
          );
          const currentMessagesByChat = JSON.parse(
            localStorage.getItem("messagesByChat") || "{}"
          );
          const latestChats = JSON.parse(syncMap.get("chats") || "[]");
          const latestMessagesByChat = JSON.parse(
            syncMap.get("messagesByChat") || "{}"
          );

          // If only messages changed (not chats structure), skip general sync
          const chatsChanged =
            JSON.stringify(currentChats) !== JSON.stringify(latestChats);
          const messagesChanged =
            JSON.stringify(currentMessagesByChat) !==
            JSON.stringify(latestMessagesByChat);

          if (!chatsChanged && messagesChanged) {
            return; // Let sharedMessages.observe handle message updates
          }

          // Variables already declared above for the change detection
          // Get remaining shared state (authoritative)
          const latestArtifacts = JSON.parse(syncMap.get("artifacts") || "[]");
          const latestUserPreferences = JSON.parse(
            syncMap.get("userPreferences") || "{}"
          );
          const latestActiveChatId = syncMap.get("activeChatId") || null;

          // Get remaining localStorage data (what just changed)
          const currentArtifacts = JSON.parse(
            localStorage.getItem("artifacts") || "[]"
          );
          const currentUserPreferences = JSON.parse(
            localStorage.getItem("userPreferences") || "{}"
          );
          const currentActiveChatId = localStorage.getItem("activeChatId");

          // SMART MERGE: Only handle non-message data (prevent race conditions)
          const mergedChats =
            currentChats.length >= latestChats.length
              ? currentChats
              : latestChats;

          // SKIP messagesByChat - handled exclusively by individual message sync
          // This prevents race conditions between sync mechanisms

          const mergedArtifacts =
            currentArtifacts.length >= latestArtifacts.length
              ? currentArtifacts
              : latestArtifacts;
          const mergedUserPreferences =
            Object.keys(currentUserPreferences).length >=
            Object.keys(latestUserPreferences).length
              ? currentUserPreferences
              : latestUserPreferences;
          const mergedActiveChatId = currentActiveChatId || latestActiveChatId;

          syncMap.set("chats", JSON.stringify(mergedChats));
          // syncMap.set("messagesByChat", ...) - REMOVED to prevent conflicts
          syncMap.set("artifacts", JSON.stringify(mergedArtifacts));
          // Don't sync userPreferences - collaborators keep their own
          // Don't sync activeChatId - collaborators keep their own
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
        const summary = `chats:${chats.length}, artifacts:${artifacts.length}, activeChatId:${activeChatId}`;

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
          // Don't sync userPreferences - collaborators keep their own
          
          // Set default activeChatId for collaborator if not already set (use first available chat)
          const currentActiveChatId = localStorage.getItem("activeChatId");
          if (!currentActiveChatId && chats.length > 0) {
            const defaultChatId = chats[0].id;
            console.log("[COLLAB] 🔧 Setting default activeChatId for collaborator from bidirectional sync:", defaultChatId);
            localStorage.setItem("activeChatId", defaultChatId);
            if (window.context?.setActiveChat) {
              window.context.setActiveChat(defaultChatId);
            }
          }
          
          hasAppliedInitialSync = true;
          // Initialize default activeView for collaborator if not set (only on initial load)
          const currentView = window.context?.getActiveView();
          let storedView = null;
          try {
            const storedViewJson = localStorage.getItem("activeView");
            if (storedViewJson) {
              storedView = JSON.parse(storedViewJson);
            }
          } catch (error) {
            console.warn("[COLLAB] ⚠️ Error parsing stored view:", error);
          }
          
          if (!currentView && !storedView) {
            console.log("[COLLAB] 🔧 Initializing default artifacts view for collaborator (initial load)");
            window.context.setActiveView("artifacts", {}, { withTransition: false });
          } else if (storedView && !currentView) {
            console.log("[COLLAB] 🔧 Restoring stored view for collaborator:", storedView.type);
            window.context.setActiveView(storedView.type, storedView.data || {}, { withTransition: false });
          }

          // Initialize default userPreferences for collaborator if not set
          const currentPreferences = JSON.parse(localStorage.getItem("userPreferences") || "{}");
          if (!currentPreferences.name) {
            console.log("[COLLAB] 🔧 Initializing default userPreferences for collaborator");
            const defaultPreferences = {
              name: "collaborator"
            };
            localStorage.setItem("userPreferences", JSON.stringify(defaultPreferences));
            if (window.context?.setUserPreferences) {
              window.context.setUserPreferences(defaultPreferences);
            }
          }

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
          // Don't sync userPreferences - collaborators keep their own
          // Don't sync activeChatId - collaborators keep their own
          // Only refresh UI if non-message data actually changed
          if (summary !== lastRemoteSummary) {
            setTimeout(() => {
              if (window.memory && window.memory.loadAll) {
                window.memory.loadAll();
              }
              if (window.views && window.views.renderCurrentView) {
                window.views.renderCurrentView(false);
              }
              if (window.memoryView && window.memoryView.refreshView) {
                window.memoryView.refreshView();
              }
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
      // Don't sync userPreferences - collaborators keep their own
      // Don't sync activeChatId - collaborators keep their own
      
      // Set collaboration permissions in sync map
      const permissions = localStorage.getItem("collaborationPermissions") || 'view';
      syncMap.set("collaborationPermissions", permissions);
      
      syncMap.set("initializedByLeader", true);
    } else if (syncMap.size === 0 && !this.isLeader) {
      // Collaborator waits for leader's data
    }
  },

  // Leave collaboration
  leaveSession() {
    console.log("[COLLAB] Leaving session...");

    // Complete cleanup - clear all collaboration data
    this.clearSessionData();

    // Clear collaboration protection
    this.clearCollaborationProtection();

    // Update UI
    this.updateUI();

    console.log("[COLLAB] ✅ Session left and all data cleared");
  },

  // Get collaboration status
  getStatus() {
    return {
      isCollaborating: this.isCollaborating,
      collaborationId: this.collaborationId,
      peerCount: this.peers.size,
      peers: Array.from(this.peers),
      isLeader: this.isLeader,
      permissions: this.getCollaborationPermissions(),
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
          // Don't sync activeView - collaborators keep their own
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

      // Set default activeChatId for collaborator if not already set (use first available chat)
      const currentActiveChatId = localStorage.getItem("activeChatId");
      if (!currentActiveChatId && data.chats && data.chats.length > 0) {
        const defaultChatId = data.chats[0].id;
        console.log("[COLLAB] 🔧 Setting default activeChatId for collaborator from database data:", defaultChatId);
        localStorage.setItem("activeChatId", defaultChatId);
        if (window.context?.setActiveChat) {
          window.context.setActiveChat(defaultChatId);
        }
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

      // Don't sync activeView - collaborators keep their own

      if (data.userId) {
        localStorage.setItem("userId", data.userId);
      }

      // Initialize default activeView for collaborator if not set (only on initial load)
      const currentView = window.context?.getActiveView();
      let storedView = null;
      try {
        const storedViewJson = localStorage.getItem("activeView");
        if (storedViewJson) {
          storedView = JSON.parse(storedViewJson);
        }
      } catch (error) {
        console.warn("[COLLAB] ⚠️ Error parsing stored view:", error);
      }
      
      if (!currentView && !storedView) {
        console.log("[COLLAB] 🔧 Initializing default artifacts view for collaborator (initial load)");
        window.context.setActiveView("artifacts", {}, { withTransition: false });
      } else if (storedView && !currentView) {
        console.log("[COLLAB] 🔧 Restoring stored view for collaborator:", storedView.type);
        window.context.setActiveView(storedView.type, storedView.data || {}, { withTransition: false });
      }

      // Initialize default userPreferences for collaborator if not set
      const currentPreferences = JSON.parse(localStorage.getItem("userPreferences") || "{}");
      if (!currentPreferences.name) {
        console.log("[COLLAB] 🔧 Initializing default userPreferences for collaborator");
        const defaultPreferences = {
          name: "collaborator"
        };
        localStorage.setItem("userPreferences", JSON.stringify(defaultPreferences));
        if (window.context?.setUserPreferences) {
          window.context.setUserPreferences(defaultPreferences);
        }
      }

      // Update application state and refresh UI

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
        window.views.renderCurrentView(false); // No transition for data update
      }

      // Specifically refresh memory view if it's active
      if (window.memoryView && window.memoryView.refreshView) {
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

              // Trigger process for collaborator to enable AI responses after data is loaded
      if (window.sessionManager?.triggerProcess) {
        window.sessionManager.triggerProcess("collaborator data loaded", 500);
      }

      // Force refresh permissions from leader's sync map
      if (!this.isLeader) {
        const syncMap = this.getSharedSyncMap();
        if (syncMap) {
          const leaderPermissions = syncMap.get("collaborationPermissions");
          if (leaderPermissions) {
            console.log("[COLLAB] 🔄 Updating permissions from leader:", leaderPermissions);
            localStorage.setItem("collaborationPermissions", leaderPermissions);
          }
        }
      }

      // Debug: Log collaborator state
      console.log("[COLLAB] 🔍 Debug - Collaborator state:");
      console.log("- isCollaborating:", this.isCollaborating);
      console.log("- isLeader:", this.isLeader);
      console.log("- collaborationId:", this.collaborationId);
      console.log("- activeView:", window.context?.getActiveView());
      console.log("- activeChatId:", window.context?.getActiveChatId());
      console.log("- artifacts count:", (window.context?.getArtifacts() || []).length);
      console.log("- processModule available:", !!window.processModule);
      console.log("- shouldTreatAsLoggedIn:", window.user?.shouldTreatAsLoggedIn?.());
      console.log("- current permissions:", this.getCollaborationPermissions());

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
    // Check both old and new key formats for compatibility
    const isActive =
      localStorage.getItem("collaborationActive") === "true" ||
      localStorage.getItem("COLLABORATION_ACTIVE") === "true";
    const timestamp = localStorage.getItem("COLLABORATION_DATA_TIMESTAMP");
    const isRecent =
      !timestamp || Date.now() - parseInt(timestamp) < 24 * 60 * 60 * 1000; // 24 hours

    console.log(
      "[COLLAB] 🛡️ Protection check - Active:",
      isActive,
      "Recent:",
      isRecent
    );
    return isActive && isRecent;
  },

  // Clear collaboration protection (when leaving session)
  clearCollaborationProtection() {
    localStorage.removeItem("COLLABORATION_ACTIVE");
    localStorage.removeItem("COLLABORATION_DATA_TIMESTAMP");
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

  // =================== PERMISSION SYSTEM ===================

  // Define permission mappings
  PERMISSION_MAP: {
    view: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    edit: { canView: true, canEdit: true, canCreate: false, canDelete: false },
    full: { canView: true, canEdit: true, canCreate: true, canDelete: true }
  },

  // Get collaboration permissions (hybrid approach)
  getCollaborationPermissions() {
    console.log("[COLLAB] 🔍 Getting collaboration permissions...");
    
    // First check sync map (leader's permissions)
    const syncMap = this.getSharedSyncMap();
    if (syncMap) {
      const syncPerms = syncMap.get("collaborationPermissions");
      if (syncPerms) {
        console.log("[COLLAB] ✅ Found permissions in sync map:", syncPerms);
        return syncPerms;
      }
    }
    
    // Fallback to URL (for fresh joins)
    const urlPerms = this.extractPermissionsFromUrl();
    if (urlPerms && urlPerms !== 'view') {
      console.log("[COLLAB] ✅ Found permissions in URL:", urlPerms);
      return urlPerms;
    }
    
    // Final fallback to localStorage
    const localPerms = localStorage.getItem("collaborationPermissions") || 'view';
    console.log("[COLLAB] ✅ Using permissions from localStorage:", localPerms);
    return localPerms;
  },

  // Check if collaborator can perform action
  canPerformAction(action) {
    const permissions = this.getCollaborationPermissions();
    const permObj = this.PERMISSION_MAP[permissions] || this.PERMISSION_MAP.view;
    
    switch(action) {
      case 'editArtifact':
        return permObj.canEdit;
      case 'createArtifact':
        return permObj.canCreate;
      case 'deleteArtifact':
        return permObj.canDelete;
      case 'viewArtifact':
        return permObj.canView;
      case 'sendMessage':
        return true; // Everyone can send messages
      case 'createChat':
        return permObj.canCreate;
      default:
        return false;
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

      // Listen to shared sync map changes (for permissions and other sync data)
      const syncMap = this.getSharedSyncMap();
      if (syncMap) {
        syncMap.observe((event) => {
          console.log("[COLLAB] 🔔 Shared sync map changed:", event);
          event.changes.keys.forEach((change, key) => {
            if (change.action === "add" || change.action === "update") {
              const value = syncMap.get(key);
              if (key === "collaborationPermissions" && value) {
                console.log("[COLLAB] 📥 Permissions updated from leader:", value);
                // Update local storage with leader's permissions
                localStorage.setItem("collaborationPermissions", value);
                console.log("[COLLAB] ✅ Permissions synced to localStorage");
                
                // Trigger UI update to reflect new permissions
                if (window.views?.renderCurrentView) {
                  window.views.renderCurrentView(false);
                }
              }
            }
          });
        });
        console.log("[COLLAB] ✅ Shared sync map listener set up");
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

  // Debug function to check permission sources
  debugPermissions() {
    console.log("[COLLAB] 🔍 DEBUG: Permission Sources Check");
    console.log("--- URL Permissions ---");
    const urlPerms = this.extractPermissionsFromUrl();
    console.log("URL perms parameter:", urlPerms);
    console.log("Full URL:", window.location.href);
    
    console.log("--- localStorage Permissions ---");
    const localPerms = localStorage.getItem("collaborationPermissions");
    console.log("localStorage collaborationPermissions:", localPerms);
    
    console.log("--- Sync Map Permissions ---");
    const syncMap = this.getSharedSyncMap();
    if (syncMap) {
      const syncPerms = syncMap.get("collaborationPermissions");
      console.log("Sync map collaborationPermissions:", syncPerms);
    } else {
      console.log("No sync map available");
    }
    
    console.log("--- Current Permissions ---");
    const currentPerms = this.getCollaborationPermissions();
    console.log("getCollaborationPermissions() result:", currentPerms);
    
    console.log("--- Collaboration State ---");
    console.log("isLeader:", this.isLeader);
    console.log("isCollaborating:", this.isCollaborating);
    console.log("collaborationId:", this.collaborationId);
  },

  // =================== Database Integration Functions ===================

  // Initialize Supabase client for collaboration
  initSupabaseClient() {
    console.log("[COLLAB-DATA] 🔗 Initializing Supabase client for collaboration...");
    
    if (window.supabase && window.SUPABASE_CONFIG) {
      try {
        this.supabaseClient = window.supabase.createClient(
          window.SUPABASE_CONFIG.url,
          window.SUPABASE_CONFIG.key
        );
        console.log("[COLLAB-DATA] ✅ Supabase client initialized successfully");
        
        // Initialize sync manager with the Supabase client for collaborators
        this.initializeSyncManagerForCollaborator();
        
        return true;
      } catch (error) {
        console.error("[COLLAB-DATA] ❌ Failed to initialize Supabase client:", error);
        return false;
      }
    } else {
      console.warn("[COLLAB-DATA] ⚠️ Supabase config not available");
      return false;
    }
  },

  // Initialize sync manager for collaborators
  initializeSyncManagerForCollaborator() {
    console.log("[COLLAB-DATA] 🔄 Initializing sync manager for collaborator...");
    
    if (!window.syncManager) {
      console.warn("[COLLAB-DATA] ⚠️ Sync manager not available");
      return;
    }

    if (!this.supabaseClient) {
      console.warn("[COLLAB-DATA] ⚠️ Supabase client not available");
      return;
    }

          try {
        // Create a mock session for the collaborator
        // Use leader's userId for collaborators so data is properly attributed
        const leaderId = localStorage.getItem("collaborationLeaderId");
        const mockSession = {
          access_token: `collab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          user: {
            id: leaderId // Use leader's userId for proper data attribution
          }
        };

      console.log("[COLLAB-DATA] 📋 Mock session created for collaborator:", {
        participantId: this.participantId,
        accessToken: mockSession.access_token,
        userId: mockSession.user.id
      });

      console.log("[COLLAB-DATA] 🔍 Sync manager state before initialization:", {
        hasSupabase: !!window.syncManager.supabase,
        isInitialized: window.syncManager.isInitialized,
        userId: window.syncManager.userId
      });

      // Initialize sync manager with the Supabase client and mock session
      window.syncManager.initializeWithAuth(this.supabaseClient, mockSession)
        .then((result) => {
          if (result) {
            console.log("[COLLAB-DATA] ✅ Sync manager initialized successfully for collaborator");
            console.log("[COLLAB-DATA] 🔍 Sync manager state after initialization:", {
              hasSupabase: !!window.syncManager.supabase,
              isInitialized: window.syncManager.isInitialized,
              userId: window.syncManager.userId
            });
          } else {
            console.error("[COLLAB-DATA] ❌ Failed to initialize sync manager for collaborator");
          }
        })
        .catch((error) => {
          console.error("[COLLAB-DATA] ❌ Error initializing sync manager for collaborator:", error);
        });

    } catch (error) {
      console.error("[COLLAB-DATA] ❌ Error creating mock session for collaborator:", error);
    }
  },

  // Create collaboration session in database
  async createCollaborationInDatabase(roomName, permissions = 'view') {
    console.log("[COLLAB-DATA] 📝 Creating collaboration session in database...");
    console.log("[COLLAB-DATA] 📋 Room ID:", roomName);
    console.log("[COLLAB-DATA] 📋 Permissions:", permissions);

    if (!this.supabaseClient) {
      if (!this.initSupabaseClient()) {
        console.error("[COLLAB-DATA] ❌ Cannot create collaboration - no Supabase client");
        return { success: false, error: "No Supabase client available" };
      }
    }

    try {
      // Generate a unique doc ID for this collaboration
      const docId = `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      console.log("[COLLAB-DATA] 📋 Generated Doc ID:", docId);

      // Create collaboration record
      const { data: collaborationData, error: collaborationError } = await this.supabaseClient
        .from('collaborations')
        .insert([{
          room_id: roomName,
          doc_id: docId,
          leader_user_id: window.userId || null, // Can be null for anonymous leaders
          title: `Collaboration Session - ${roomName}`,
          description: `Real-time collaboration session`,
          permissions: permissions,
          status: 'active',
          max_participants: 10
        }])
        .select()
        .single();

      if (collaborationError) {
        console.error("[COLLAB-DATA] ❌ Failed to create collaboration record:", collaborationError);
        return { success: false, error: collaborationError.message };
      }

      console.log("[COLLAB-DATA] ✅ Collaboration record created:", collaborationData);
      this.databaseCollaborationId = collaborationData.id;

      // Create leader participant record
      const leaderParticipantId = window.userId || `leader_${Date.now()}`;
      const { error: participantError } = await this.supabaseClient
        .from('collaboration_participants')
        .insert([{
          collaboration_id: this.databaseCollaborationId,
          participant_id: leaderParticipantId,
          peer_id: roomName, // Use room_id as peer_id for leader
          display_name: 'Leader',
          permissions: 'full',
          metadata: {
            is_leader: true,
            user_id: window.userId || null
          }
        }]);

      if (participantError) {
        console.error("[COLLAB-DATA] ❌ Failed to create leader participant record:", participantError);
        // Don't fail the whole operation, just log the error
      } else {
        console.log("[COLLAB-DATA] ✅ Leader participant record created");
      }

      // Store collaboration data locally
      localStorage.setItem("databaseCollaborationId", this.databaseCollaborationId);
      localStorage.setItem("collaborationDocId", docId);
      localStorage.setItem("collaborationParticipantId", leaderParticipantId);

      return { 
        success: true, 
        collaborationId: this.databaseCollaborationId,
        docId: docId,
        participantId: leaderParticipantId
      };

    } catch (error) {
      console.error("[COLLAB-DATA] ❌ Exception creating collaboration:", error);
      return { success: false, error: error.message };
    }
  },

  // Join collaboration session in database
  async joinCollaborationInDatabase(roomName, permissions = 'view') {
    console.log("[COLLAB-DATA] 🔗 Joining collaboration session in database...");
    console.log("[COLLAB-DATA] 📋 Room ID:", roomName);
    console.log("[COLLAB-DATA] 📋 Permissions:", permissions);

    if (!this.supabaseClient) {
      if (!this.initSupabaseClient()) {
        console.error("[COLLAB-DATA] ❌ Cannot join collaboration - no Supabase client");
        return { success: false, error: "No Supabase client available" };
      }
    }

    try {
      // First, find the collaboration by room_id
      const { data: collaborationData, error: findError } = await this.supabaseClient
        .from('collaborations')
        .select('*')
        .eq('room_id', roomName)
        .eq('status', 'active')
        .single();

      if (findError) {
        console.error("[COLLAB-DATA] ❌ Collaboration session not found:", findError);
        return { success: false, error: "Collaboration session not found or inactive" };
      }

      console.log("[COLLAB-DATA] ✅ Found collaboration session:", collaborationData);
      this.databaseCollaborationId = collaborationData.id;

      // Generate participant ID for this collaborator
      const peerId = this.provider?.room?.peerId || `peer_${Date.now()}`;
      const participantId = `collab_${peerId}_${Date.now()}`;
      
      console.log("[COLLAB-DATA] 📋 Generated Participant ID:", participantId);
      console.log("[COLLAB-DATA] 📋 Peer ID:", peerId);

      // Create or update participant record
      const { error: participantError } = await this.supabaseClient
        .from('collaboration_participants')
        .upsert([{
          collaboration_id: this.databaseCollaborationId,
          participant_id: participantId,
          peer_id: peerId,
          display_name: 'Anonymous Collaborator',
          permissions: permissions,
          is_active: true,
          last_seen: new Date().toISOString(),
          metadata: {
            is_leader: false,
            user_id: window.userId || null
          }
        }], {
          onConflict: 'collaboration_id,participant_id'
        });

      if (participantError) {
        console.error("[COLLAB-DATA] ❌ Failed to create participant record:", participantError);
        return { success: false, error: participantError.message };
      }

      console.log("[COLLAB-DATA] ✅ Participant record created/updated");
      this.participantId = participantId;

      // Initialize sync manager for this collaborator
      this.initializeSyncManagerForCollaborator();

      // Store collaboration data locally
      localStorage.setItem("databaseCollaborationId", this.databaseCollaborationId);
      localStorage.setItem("collaborationDocId", collaborationData.doc_id);
      localStorage.setItem("collaborationParticipantId", participantId);

      return { 
        success: true, 
        collaborationId: this.databaseCollaborationId,
        docId: collaborationData.doc_id,
        participantId: participantId
      };

    } catch (error) {
      console.error("[COLLAB-DATA] ❌ Exception joining collaboration:", error);
      return { success: false, error: error.message };
    }
  },

  // Leave collaboration session in database
  async leaveCollaborationInDatabase() {
    console.log("[COLLAB-DATA] 👋 Leaving collaboration session in database...");

    if (!this.supabaseClient || !this.databaseCollaborationId || !this.participantId) {
      console.warn("[COLLAB-DATA] ⚠️ No database session to leave");
      return { success: true };
    }

    try {
      // Mark participant as inactive
      const { error } = await this.supabaseClient
        .from('collaboration_participants')
        .update({
          is_active: false,
          last_seen: new Date().toISOString()
        })
        .eq('collaboration_id', this.databaseCollaborationId)
        .eq('participant_id', this.participantId);

      if (error) {
        console.error("[COLLAB-DATA] ❌ Failed to mark participant as inactive:", error);
      } else {
        console.log("[COLLAB-DATA] ✅ Participant marked as inactive");
      }

      // Clear local storage
      localStorage.removeItem("databaseCollaborationId");
      localStorage.removeItem("collaborationDocId");
      localStorage.removeItem("collaborationParticipantId");

      // Clear instance variables
      this.databaseCollaborationId = null;
      this.participantId = null;

      return { success: true };

    } catch (error) {
      console.error("[COLLAB-DATA] ❌ Exception leaving collaboration:", error);
      return { success: false, error: error.message };
    }
  },

  // Load collaboration data from localStorage
  loadCollaborationData() {
    console.log("[COLLAB-DATA] 📂 Loading collaboration data from localStorage...");
    
          this.databaseCollaborationId = localStorage.getItem("databaseCollaborationId");
      this.participantId = localStorage.getItem("collaborationParticipantId");
      this.leaderId = localStorage.getItem("collaborationLeaderId");
      
      if (this.databaseCollaborationId) {
      console.log("[COLLAB-DATA] ✅ Loaded database collaboration ID:", this.databaseCollaborationId);
    }
    
          if (this.participantId) {
        console.log("[COLLAB-DATA] ✅ Loaded participant ID:", this.participantId);
      }
      
      if (this.leaderId) {
        console.log("[COLLAB-DATA] ✅ Loaded leaderId:", this.leaderId);
      }

    // If we have collaboration data, initialize the sync manager
    if (this.databaseCollaborationId && this.participantId) {
      console.log("[COLLAB-DATA] 🔄 Initializing sync manager for existing collaboration...");
      // Initialize Supabase client first, then sync manager
      if (this.initSupabaseClient()) {
        this.initializeSyncManagerForCollaborator();
      }
    }
  },

  // =================== Debug and Test Functions ===================

  // Test database integration
  async testDatabaseIntegration() {
    console.log("[COLLAB-DATA] 🧪 Testing database integration...");
    
    // Test 1: Initialize Supabase client
    console.log("[COLLAB-DATA] 🧪 Test 1: Initializing Supabase client...");
    const clientResult = this.initSupabaseClient();
    console.log("[COLLAB-DATA] 🧪 Test 1 Result:", clientResult ? "PASS" : "FAIL");
    
    if (!clientResult) {
      console.error("[COLLAB-DATA] ❌ Cannot proceed with tests - no Supabase client");
      return { success: false, error: "No Supabase client available" };
    }
    
    // Test 2: Check if collaborations table exists
    console.log("[COLLAB-DATA] 🧪 Test 2: Checking collaborations table...");
    try {
      const { data, error } = await this.supabaseClient
        .from('collaborations')
        .select('count')
        .limit(1);
      
      if (error) {
        console.error("[COLLAB-DATA] ❌ Test 2 FAILED - Table access error:", error);
        return { success: false, error: "Cannot access collaborations table" };
      }
      
      console.log("[COLLAB-DATA] 🧪 Test 2 Result: PASS - Table accessible");
    } catch (error) {
      console.error("[COLLAB-DATA] ❌ Test 2 FAILED - Exception:", error);
      return { success: false, error: "Exception accessing collaborations table" };
    }
    
    // Test 3: Check if collaboration_participants table exists
    console.log("[COLLAB-DATA] 🧪 Test 3: Checking collaboration_participants table...");
    try {
      const { data, error } = await this.supabaseClient
        .from('collaboration_participants')
        .select('count')
        .limit(1);
      
      if (error) {
        console.error("[COLLAB-DATA] ❌ Test 3 FAILED - Table access error:", error);
        return { success: false, error: "Cannot access collaboration_participants table" };
      }
      
      console.log("[COLLAB-DATA] 🧪 Test 3 Result: PASS - Table accessible");
    } catch (error) {
      console.error("[COLLAB-DATA] ❌ Test 3 FAILED - Exception:", error);
      return { success: false, error: "Exception accessing collaboration_participants table" };
    }
    
    console.log("[COLLAB-DATA] ✅ All database integration tests PASSED");
    return { success: true };
  },

  // Get current collaboration status
  getCollaborationStatus() {
    return {
      isCollaborating: this.isCollaborating,
      isLeader: this.isLeader,
      collaborationId: this.collaborationId,
      databaseCollaborationId: this.databaseCollaborationId,
      participantId: this.participantId,
      peers: Array.from(this.peers),
      permissions: localStorage.getItem("collaborationPermissions"),
      hasSupabaseClient: !!this.supabaseClient
    };
  },

  // Debug function to show all collaboration data
  debugCollaborationData() {
    console.log("[COLLAB-DATA] 🔍 === COLLABORATION DATA DEBUG ===");
    console.log("[COLLAB-DATA] 📋 Status:", this.getCollaborationStatus());
    console.log("[COLLAB-DATA] 📋 LocalStorage Keys:");
    console.log("  - collaborationActive:", localStorage.getItem("collaborationActive"));
    console.log("  - collaborationId:", localStorage.getItem("collaborationId"));
    console.log("  - collaborationLeader:", localStorage.getItem("collaborationLeader"));
    console.log("  - collaborationPermissions:", localStorage.getItem("collaborationPermissions"));
    console.log("  - databaseCollaborationId:", localStorage.getItem("databaseCollaborationId"));
    console.log("  - collaborationParticipantId:", localStorage.getItem("collaborationParticipantId"));
    console.log("  - collaborationDocId:", localStorage.getItem("collaborationDocId"));
    console.log("[COLLAB-DATA] 🔍 === END DEBUG ===");
  },

  // Test message saving with collaboration context
  async testMessageSaving() {
    console.log("[COLLAB-DATA] 🧪 Testing message saving with collaboration...");
    
    if (!this.isCollaborating) {
      console.error("[COLLAB-DATA] ❌ Not in collaboration mode - cannot test message saving");
      return { success: false, error: "Not in collaboration mode" };
    }

    if (!window.syncManager) {
      console.error("[COLLAB-DATA] ❌ No sync manager available");
      return { success: false, error: "No sync manager available" };
    }

    // Create a test message
    const testMessage = {
      role: "user",
      content: `Test collaboration message from ${this.isLeader ? 'leader' : 'collaborator'} at ${new Date().toISOString()}`,
      metadata: {
        test: true,
        collaboration_test: true,
        timestamp: Date.now()
      },
      message_id: `test_msg_${Date.now()}`
    };

    // Get active chat ID
    const activeChatId = window.context?.activeChatId || localStorage.getItem("activeChatId");
    
    if (!activeChatId) {
      console.error("[COLLAB-DATA] ❌ No active chat ID available");
      return { success: false, error: "No active chat ID available" };
    }

    console.log("[COLLAB-DATA] 📋 Test Message:", testMessage);
    console.log("[COLLAB-DATA] 📋 Active Chat ID:", activeChatId);

    try {
      // Save message locally first
      if (window.memory?.saveMessage) {
        window.memory.saveMessage(activeChatId, testMessage);
        console.log("[COLLAB-DATA] ✅ Message saved locally");
      }

      // Trigger sync to save to database
      if (window.syncManager?.uploadMessage) {
        await window.syncManager.uploadMessage(activeChatId, testMessage);
        console.log("[COLLAB-DATA] ✅ Message sync triggered");
      }

      return { 
        success: true, 
        message: testMessage,
        chatId: activeChatId,
        collaborationContext: {
          isCollaborating: this.isCollaborating,
          isLeader: this.isLeader,
          collaborationId: this.databaseCollaborationId,
          participantId: this.participantId
        }
      };

    } catch (error) {
      console.error("[COLLAB-DATA] ❌ Error testing message saving:", error);
      return { success: false, error: error.message };
    }
  },

  // Test database-first message creation
  async testDatabaseFirstMessage() {
    console.log("[COLLAB-DATA] 🧪 Testing database-first message creation...");
    
    if (!this.isCollaborating) {
      console.error("[COLLAB-DATA] ❌ Not in collaboration mode - cannot test database-first message");
      return { success: false, error: "Not in collaboration mode" };
    }

    if (!window.messages?.addMessage) {
      console.error("[COLLAB-DATA] ❌ No messages module available");
      return { success: false, error: "No messages module available" };
    }

    const testContent = `Database-first test message from ${this.isLeader ? 'leader' : 'collaborator'} at ${new Date().toISOString()}`;
    
    console.log("[COLLAB-DATA] 📋 Test Content:", testContent);

    try {
      // Use the new database-first addMessage function
      const result = await window.messages.addMessage('user', testContent, {
        test: true,
        database_first: true,
        collaboration_test: true
      });

      console.log("[COLLAB-DATA] ✅ Database-first message creation completed");
      return { 
        success: true, 
        content: testContent,
        result: result,
        collaborationContext: {
          isCollaborating: this.isCollaborating,
          isLeader: this.isLeader,
          collaborationId: this.databaseCollaborationId,
          participantId: this.participantId
        }
      };

    } catch (error) {
      console.error("[COLLAB-DATA] ❌ Error testing database-first message:", error);
      return { success: false, error: error.message };
    }
  },

  // Debug function to check collaboration and sync status
  debugCollaborationAndSync() {
    console.log("[COLLAB-DEBUG] 🔍 === COLLABORATION & SYNC STATUS ===");
    
    // Collaboration status
    console.log("[COLLAB-DEBUG] 🤝 Collaboration Status:", {
      isCollaborating: this.isCollaborating,
      collaborationId: this.collaborationId,
      isLeader: this.isLeader,
      databaseCollaborationId: this.databaseCollaborationId,
      participantId: this.participantId,
      peers: this.peers.size,
      provider: !!this.provider,
      providerConnected: this.provider?.connected || false
    });
    
    // Sync manager status
    console.log("[COLLAB-DEBUG] 🔄 Sync Manager Status:", {
      hasSyncManager: !!window.syncManager,
      syncManagerKeys: window.syncManager ? Object.keys(window.syncManager) : 'N/A',
      hasUploadMessage: !!window.syncManager?.uploadMessage,
      hasUploadChat: !!window.syncManager?.uploadChat,
      hasUploadArtifact: !!window.syncManager?.uploadArtifact,
      hasSupabase: !!window.syncManager?.supabase,
      userId: window.syncManager?.userId || 'N/A'
    });
    
    // Memory module status
    console.log("[COLLAB-DEBUG] 🧠 Memory Module Status:", {
      hasMemory: !!window.memory,
      memoryKeys: window.memory ? Object.keys(window.memory) : 'N/A',
      hasSaveMessage: !!window.memory?.saveMessage,
      hasSaveChat: !!window.memory?.saveChat,
      hasSaveArtifact: !!window.memory?.saveArtifact
    });
    
    // Context status
    console.log("[COLLAB-DEBUG] 📋 Context Status:", {
      hasContext: !!window.context,
      activeChatId: window.context?.getActiveChatId(),
      activeView: window.context?.getActiveView(),
      messagesByChat: window.context?.getMessagesByChat ? Object.keys(window.context.getMessagesByChat()) : 'N/A'
    });
    
    // Collaboration protection status
    console.log("[COLLAB-DEBUG] 🛡️ Protection Status:", {
      isCollabProtected: this.isCollaborationProtected(),
      collaborationActive: localStorage.getItem("collaborationActive"),
      collaborationDataTimestamp: localStorage.getItem("COLLABORATION_DATA_TIMESTAMP")
    });
    
    console.log("[COLLAB-DEBUG] ✅ === STATUS CHECK COMPLETE ===");
  }
};

// Make collaboration available globally
window.collaboration = collaboration;

// Global debug function
window.debugCollaborationAndSync = function() {
  if (window.collaboration) {
    window.collaboration.debugCollaborationAndSync();
  } else {
    console.log("[COLLAB-DEBUG] ❌ Collaboration module not available");
  }
};

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

window.debugCollaborationPermissions = function () {
  if (!window.collaboration) {
    console.error("[COLLAB] ❌ Collaboration module not available");
    return;
  }
  return window.collaboration.debugPermissions();
};

window.testArtifactEdit = function () {
  if (!window.collaboration) {
    console.error("[COLLAB] ❌ Collaboration module not available");
    return;
  }
  
  const canEdit = window.collaboration.canPerformAction('editArtifact');
  console.log("[COLLAB] 🧪 Testing artifact edit permission:", canEdit);
  
  if (canEdit) {
    console.log("[COLLAB] ✅ Can edit artifacts - try saying 'edit artifact [title]' in chat");
  } else {
    console.log("[COLLAB] ❌ Cannot edit artifacts - need edit permissions");
  }
  
  return canEdit;
};

// Global protection function for other modules to check
window.isCollaborationProtected = function () {
  return window.collaboration?.shouldPreventDataOverwrite() || false;
};

// Global collaboration functions available in console

// Auto-initialize when script loads
collaboration.init();

// =================== Global Debug Functions ===================

// Make collaboration functions globally accessible for testing
window.collaboration = collaboration;

// Global debug functions
window.testCollaborationDatabase = async function() {
  console.log("[COLLAB-DATA] 🧪 Running collaboration database tests...");
  return await collaboration.testDatabaseIntegration();
};

window.debugCollaboration = function() {
  console.log("[COLLAB-DATA] 🔍 Debugging collaboration system...");
  collaboration.debugCollaborationData();
};

window.getCollaborationStatus = function() {
  console.log("[COLLAB-DATA] 📊 Getting collaboration status...");
  const status = collaboration.getCollaborationStatus();
  console.log("[COLLAB-DATA] 📊 Status:", status);
  return status;
};

window.createTestCollaboration = async function(permissions = 'view') {
  console.log("[COLLAB-DATA] 🧪 Creating test collaboration...");
  const result = await collaboration.createSession(null, permissions);
  console.log("[COLLAB-DATA] 🧪 Test collaboration result:", result);
  return result;
};

window.joinTestCollaboration = async function(roomName, permissions = 'view') {
  console.log("[COLLAB-DATA] 🧪 Joining test collaboration...");
  const result = await collaboration.joinSession(roomName, permissions);
  console.log("[COLLAB-DATA] 🧪 Test join result:", result);
  return result;
};

window.testCollaborationMessageSaving = async function() {
  console.log("[COLLAB-DATA] 🧪 Testing collaboration message saving...");
  const result = await collaboration.testMessageSaving();
  console.log("[COLLAB-DATA] 🧪 Message saving test result:", result);
  return result;
};

window.testDatabaseFirstMessage = async function() {
  console.log("[COLLAB-DATA] 🧪 Testing database-first message creation...");
  const result = await collaboration.testDatabaseFirstMessage();
  console.log("[COLLAB-DATA] 🧪 Database-first message test result:", result);
  return result;
};

console.log("[COLLAB-DATA] 🚀 Collaboration system loaded with database integration");
console.log("[COLLAB-DATA] 📋 Available debug functions:");
console.log("  - testCollaborationDatabase() - Test database connectivity");
console.log("  - debugCollaboration() - Show all collaboration data");
console.log("  - getCollaborationStatus() - Get current status");
console.log("  - createTestCollaboration(permissions) - Create test session");
console.log("  - joinTestCollaboration(roomName, permissions) - Join test session");
console.log("  - testCollaborationMessageSaving() - Test message saving with collaboration");
console.log("  - testDatabaseFirstMessage() - Test database-first message creation");

// Global debug function
window.debugCollaborationAndSync = function() {
  if (window.collaboration) {
    window.collaboration.debugCollaborationAndSync();
  } else {
    console.log("[COLLAB-DEBUG] ❌ Collaboration module not available");
  }
};

// Test function to simulate collaboration message
window.testCollaborationMessage = function(messageText = "Test collaboration message") {
  console.log("[COLLAB-DEBUG] 🧪 === TESTING COLLABORATION MESSAGE ===");
  console.log("[COLLAB-DEBUG] 📋 Test message:", messageText);
  
  if (!window.messages || !window.messages.addMessage) {
    console.error("[COLLAB-DEBUG] ❌ Messages module not available");
    return;
  }
  
  // Call addMessage directly to test the flow
  window.messages.addMessage('user', messageText).then((result) => {
    console.log("[COLLAB-DEBUG] ✅ Test message result:", result);
  }).catch((error) => {
    console.error("[COLLAB-DEBUG] ❌ Test message error:", error);
  });
};

// Global helper function for testing sync manager initialization
window.testSyncManagerInit = function() {
  console.log("[COLLAB-DEBUG] 🧪 === TESTING SYNC MANAGER INITIALIZATION ===");
  if (!window.collaboration) {
    console.error("[COLLAB-DEBUG] ❌ Collaboration module not available");
    return;
  }
  if (!window.syncManager) {
    console.error("[COLLAB-DEBUG] ❌ Sync manager not available");
    return;
  }
  
  console.log("[COLLAB-DEBUG] 🔍 Current sync manager state:", {
    hasSupabase: !!window.syncManager.supabase,
    isInitialized: window.syncManager.isInitialized,
    userId: window.syncManager.userId
  });
  
  console.log("[COLLAB-DEBUG] 🔍 Collaboration state:", {
    hasSupabaseClient: !!window.collaboration.supabaseClient,
    participantId: window.collaboration.participantId,
    databaseCollaborationId: window.collaboration.databaseCollaborationId
  });
  
  // Try to initialize sync manager
  window.collaboration.initializeSyncManagerForCollaborator();
};

// Global helper function to test message structure
window.testMessageStructure = function() {
  console.log("[COLLAB-DEBUG] 🧪 === TESTING MESSAGE STRUCTURE ===");
  
  // Simulate what the message data should look like for collaborators
  const isCollaborating = window.collaboration?.isCollaborating || false;
  const collaborationId = window.collaboration?.databaseCollaborationId || null;
  const participantId = window.collaboration?.participantId || null;
  const isLeader = window.collaboration?.isLeader || false;
  const syncManagerUserId = window.syncManager?.userId || null;
  
  console.log("[COLLAB-DEBUG] 📋 Current context:");
  console.log("  - Is Collaborating:", isCollaborating);
  console.log("  - Collaboration ID:", collaborationId);
  console.log("  - Participant ID:", participantId);
  console.log("  - Is Leader:", isLeader);
  console.log("  - Sync Manager User ID:", syncManagerUserId);
  
  if (isCollaborating && collaborationId) {
    const expectedMessageData = {
      chat_id: "test_chat_id",
      role: "user",
      content: "test message",
      metadata: {
        collaboration_room: window.collaboration?.collaborationId,
        peer_id: window.collaboration?.provider?.room?.peerId,
        display_name: isLeader ? 'Leader' : 'Anonymous Collaborator',
        is_leader: isLeader,
        timestamp: new Date().toISOString()
      },
      message_id: "test_message_id",
      collaboration_id: collaborationId,
      participant_id: participantId,
      is_collaboration_message: true,
      user_id: isLeader ? syncManagerUserId : null
    };
    
    console.log("[COLLAB-DEBUG] ✅ Expected message structure for collaborator:");
    console.log(JSON.stringify(expectedMessageData, null, 2));
  } else {
    console.log("[COLLAB-DEBUG] ⚠️ Not in collaboration mode or missing collaboration ID");
  }
};

// Global helper function to test chat creation
window.testChatCreation = function() {
  console.log("[COLLAB-DEBUG] 🧪 === TESTING CHAT CREATION ===");
  
  if (!window.actions || !window.actions.executeAction) {
    console.error("[COLLAB-DEBUG] ❌ Actions module not available");
    return;
  }
  
  console.log("[COLLAB-DEBUG] 📋 Creating test chat...");
  window.actions.executeAction('messages.create', {
    title: 'Test Collaboration Chat',
    description: 'This is a test chat created by collaborator'
  }).then((result) => {
    console.log("[COLLAB-DEBUG] ✅ Chat creation result:", result);
  }).catch((error) => {
    console.error("[COLLAB-DEBUG] ❌ Chat creation error:", error);
  });
};

// Global helper function to test chat sync
window.testChatSync = function() {
  console.log("[COLLAB-DEBUG] 🧪 === TESTING CHAT SYNC ===");
  
  if (!window.collaboration) {
    console.error("[COLLAB-DEBUG] ❌ Collaboration module not available");
    return;
  }
  
  console.log("[COLLAB-DEBUG] 🔍 Collaboration status:", {
    isCollaborating: window.collaboration.isCollaborating,
    isLeader: window.collaboration.isLeader,
    peers: window.collaboration.peers.size,
    providerConnected: window.collaboration.provider?.connected || false,
    isReconnecting: window.collaboration.isReconnecting
  });
  
  console.log("[COLLAB-DEBUG] 🔍 Shared chats array:", {
    hasSharedChats: !!window.collaboration.sharedChats,
    sharedChatsLength: window.collaboration.sharedChats?.length || 0
  });
  
  if (window.collaboration.sharedChats) {
    const chats = window.collaboration.sharedChats.toArray();
    console.log("[COLLAB-DEBUG] 📋 Current shared chats:", chats);
  }
  
  // Check queue status
  console.log("[COLLAB-DEBUG] 📋 Queue status:", {
    messageQueueLength: window.collaboration.messageQueue?.length || 0,
    chatQueueLength: window.collaboration.chatQueue?.length || 0,
    artifactQueueLength: window.collaboration.artifactQueue?.length || 0
  });
  
  // Also check localStorage chats
  try {
    const localStorageChats = JSON.parse(localStorage.getItem("chats") || "[]");
    console.log("[COLLAB-DEBUG] 📋 localStorage chats:", localStorageChats);
    console.log("[COLLAB-DEBUG] 📊 localStorage chats count:", localStorageChats.length);
  } catch (e) {
    console.error("[COLLAB-DEBUG] ❌ Error reading localStorage chats:", e);
  }
  
  // Check context chats
  if (window.context) {
    const contextChats = window.context.getChats() || [];
    console.log("[COLLAB-DEBUG] 📋 Context chats:", contextChats);
    console.log("[COLLAB-DEBUG] 📊 Context chats count:", contextChats.length);
  }
};

// Global helper function to manually process chat queue
window.processChatQueue = function() {
  console.log("[COLLAB-DEBUG] 🧪 === MANUALLY PROCESSING CHAT QUEUE ===");
  
  if (!window.collaboration) {
    console.error("[COLLAB-DEBUG] ❌ Collaboration module not available");
    return;
  }
  
  console.log("[COLLAB-DEBUG] 📋 Current queue status:", {
    chatQueueLength: window.collaboration.chatQueue?.length || 0,
    isReconnecting: window.collaboration.isReconnecting,
    providerConnected: window.collaboration.provider?.connected || false
  });
  
  if (window.collaboration.chatQueue && window.collaboration.chatQueue.length > 0) {
    console.log("[COLLAB-DEBUG] 📋 Queued chats:", window.collaboration.chatQueue);
    
    // Temporarily clear reconnection flag to force processing
    const wasReconnecting = window.collaboration.isReconnecting;
    window.collaboration.isReconnecting = false;
    
    try {
      window.collaboration.processMessageQueue();
      console.log("[COLLAB-DEBUG] ✅ Chat queue processed successfully");
    } catch (error) {
      console.error("[COLLAB-DEBUG] ❌ Error processing chat queue:", error);
    } finally {
      // Restore reconnection flag
      window.collaboration.isReconnecting = wasReconnecting;
    }
  } else {
    console.log("[COLLAB-DEBUG] ⚠️ No chats in queue to process");
  }
};

// Global helper function to force reconnection and clear reconnection state
window.forceReconnection = function() {
  console.log("[COLLAB-DEBUG] 🧪 === FORCING RECONNECTION ===");
  
  if (!window.collaboration) {
    console.error("[COLLAB-DEBUG] ❌ Collaboration module not available");
    return;
  }
  
  console.log("[COLLAB-DEBUG] 📋 Current state:", {
    isReconnecting: window.collaboration.isReconnecting,
    providerConnected: window.collaboration.provider?.connected || false,
    peers: window.collaboration.peers.size
  });
  
  // Clear reconnection flag
  window.collaboration.isReconnecting = false;
  console.log("[COLLAB-DEBUG] ✅ Reconnection flag cleared");
  
  // Try to refresh connection
  if (window.collaboration.refreshConnection) {
    window.collaboration.refreshConnection();
    console.log("[COLLAB-DEBUG] ✅ Connection refresh triggered");
  }
  
  // Process any queued items
  setTimeout(() => {
    if (window.collaboration.processMessageQueue) {
      window.collaboration.processMessageQueue();
      console.log("[COLLAB-DEBUG] ✅ Queue processing triggered");
    }
  }, 500);
};

// Global helper function to check leaderId status
window.checkLeaderId = function() {
  console.log("[COLLAB-DEBUG] 🧪 === CHECKING LEADER ID STATUS ===");
  
  if (!window.collaboration) {
    console.error("[COLLAB-DEBUG] ❌ Collaboration module not available");
    return;
  }
  
  console.log("[COLLAB-DEBUG] 📋 Collaboration state:", {
    isCollaborating: window.collaboration.isCollaborating,
    isLeader: window.collaboration.isLeader,
    leaderId: window.collaboration.leaderId,
    databaseCollaborationId: window.collaboration.databaseCollaborationId,
    participantId: window.collaboration.participantId
  });
  
  // Check localStorage
  const localStorageLeaderId = localStorage.getItem("collaborationLeaderId");
  console.log("[COLLAB-DEBUG] 📋 localStorage leaderId:", localStorageLeaderId);
  
  // Check shared sync map
  if (window.collaboration.getSharedSyncMap) {
    const sharedSyncMap = window.collaboration.getSharedSyncMap();
    if (sharedSyncMap) {
      const sharedLeaderId = sharedSyncMap.get('leaderId');
      console.log("[COLLAB-DEBUG] 📋 Shared sync map leaderId:", sharedLeaderId);
    }
  }
  
  // Check sync manager
  if (window.syncManager) {
    console.log("[COLLAB-DEBUG] 📋 Sync manager userId:", window.syncManager.userId);
  }
};

// Global helper function to manually retrieve and store leaderId
window.retrieveLeaderId = function() {
  console.log("[COLLAB-DEBUG] 🧪 === MANUALLY RETRIEVING LEADER ID ===");
  
  if (!window.collaboration) {
    console.error("[COLLAB-DEBUG] ❌ Collaboration module not available");
    return;
  }
  
  if (window.collaboration.isLeader) {
    console.log("[COLLAB-DEBUG] ⚠️ This is the leader - no need to retrieve leaderId");
    return;
  }
  
  // Try to get leaderId from shared sync map
  if (window.collaboration.getSharedSyncMap) {
    const sharedSyncMap = window.collaboration.getSharedSyncMap();
    if (sharedSyncMap) {
      const sharedLeaderId = sharedSyncMap.get('leaderId');
      if (sharedLeaderId) {
        console.log("[COLLAB-DEBUG] 📋 Retrieved leaderId from shared map:", sharedLeaderId);
        
        // Store it locally
        window.collaboration.leaderId = sharedLeaderId;
        localStorage.setItem("collaborationLeaderId", sharedLeaderId);
        
        console.log("[COLLAB-DEBUG] ✅ LeaderId stored locally");
        
        // Update sync manager if it exists
        if (window.syncManager) {
          window.syncManager.userId = sharedLeaderId;
          console.log("[COLLAB-DEBUG] ✅ Sync manager userId updated");
        }
        
        return sharedLeaderId;
      } else {
        console.log("[COLLAB-DEBUG] ⚠️ No leaderId found in shared map");
      }
    } else {
      console.log("[COLLAB-DEBUG] ⚠️ Shared sync map not available");
    }
  } else {
    console.log("[COLLAB-DEBUG] ⚠️ getSharedSyncMap function not available");
  }
  
  return null;
};

// Global helper function to force leaderId storage and retrieval
window.forceLeaderIdSync = function() {
  console.log("[COLLAB-DEBUG] 🧪 === FORCING LEADER ID SYNC ===");
  
  if (!window.collaboration) {
    console.error("[COLLAB-DEBUG] ❌ Collaboration module not available");
    return;
  }
  
  // If this is the leader, store the leaderId
  if (window.collaboration.isLeader) {
    console.log("[COLLAB-DEBUG] 🔄 This is the leader - storing leaderId...");
    return window.storeLeaderIdInSharedMap();
  }
  
  // If this is a collaborator, retrieve the leaderId
  if (!window.collaboration.isLeader) {
    console.log("[COLLAB-DEBUG] 🔄 This is a collaborator - retrieving leaderId...");
    return window.retrieveLeaderId();
  }
};

// Global helper function to check leader's session and userId
window.checkLeaderSession = function() {
  console.log("[COLLAB-DEBUG] 🧪 === CHECKING LEADER SESSION ===");
  
  // Check if this is the leader
  const isLeader = localStorage.getItem("collaborationLeader") === "true";
  console.log("[COLLAB-DEBUG] 📋 Is leader:", isLeader);
  
  // Check various userId sources
  console.log("[COLLAB-DEBUG] 📋 window.userId:", window.userId);
  console.log("[COLLAB-DEBUG] 📋 localStorage userId:", localStorage.getItem("userId"));
  
  // Check Supabase session
  if (window.supabase) {
    window.supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error("[COLLAB-DEBUG] ❌ Error getting session:", error);
      } else {
        console.log("[COLLAB-DEBUG] 📋 Supabase session:", data.session);
        if (data.session?.user?.id) {
          console.log("[COLLAB-DEBUG] 📋 Session userId:", data.session.user.id);
        }
      }
    });
  }
  
  // Check collaboration module
  if (window.collaboration) {
    console.log("[COLLAB-DEBUG] 📋 Collaboration userId:", window.collaboration.userId);
    console.log("[COLLAB-DEBUG] 📋 Collaboration isLeader:", window.collaboration.isLeader);
  }
  
  // Check sync manager
  if (window.syncManager) {
    console.log("[COLLAB-DEBUG] 📋 Sync manager userId:", window.syncManager.userId);
  }
};

// Global helper function to manually store leaderId in shared map
window.storeLeaderIdInSharedMap = function() {
  console.log("[COLLAB-DEBUG] 🧪 === MANUALLY STORING LEADER ID IN SHARED MAP ===");
  
  if (!window.collaboration) {
    console.error("[COLLAB-DEBUG] ❌ Collaboration module not available");
    return;
  }
  
  if (!window.collaboration.isLeader) {
    console.log("[COLLAB-DEBUG] ⚠️ This is not the leader - cannot store leaderId");
    return;
  }
  
  // Get the current userId from multiple sources
  const currentUserId = window.userId || localStorage.getItem("userId") || window.syncManager?.userId;
  console.log("[COLLAB-DEBUG] 📋 Current userId:", currentUserId);
  
  if (!currentUserId) {
    console.error("[COLLAB-DEBUG] ❌ No userId available to store");
    return;
  }
  
  // Store in shared sync map
  if (window.collaboration.getSharedSyncMap) {
    const sharedSyncMap = window.collaboration.getSharedSyncMap();
    if (sharedSyncMap) {
      sharedSyncMap.set('leaderId', currentUserId);
      console.log("[COLLAB-DEBUG] ✅ LeaderId stored in shared map:", currentUserId);
      
      // Also store in localStorage for backup
      localStorage.setItem("collaborationLeaderId", currentUserId);
      console.log("[COLLAB-DEBUG] ✅ LeaderId stored in localStorage");
      
      return currentUserId;
    } else {
      console.error("[COLLAB-DEBUG] ❌ Shared sync map not available");
    }
  } else {
    console.error("[COLLAB-DEBUG] ❌ getSharedSyncMap function not available");
  }
  
  return null;
};

// Global helper function to check for and clean up duplicate messages
window.checkAndCleanDuplicates = function() {
  console.log("[COLLAB-DEBUG] 🧪 === CHECKING FOR DUPLICATE MESSAGES ===");
  
  try {
    const messagesByChat = JSON.parse(localStorage.getItem("messagesByChat") || "{}");
    let totalMessages = 0;
    let duplicateCount = 0;
    let cleanedCount = 0;
    
    Object.entries(messagesByChat).forEach(([chatId, messages]) => {
      console.log(`[COLLAB-DEBUG] 📋 Chat ${chatId}: ${messages.length} messages`);
      totalMessages += messages.length;
      
      // Check for duplicates
      const seen = new Set();
      const uniqueMessages = [];
      
      messages.forEach(message => {
        const key = message.message_id;
        if (seen.has(key)) {
          duplicateCount++;
          console.log(`[COLLAB-DEBUG] ⚠️ Duplicate message found: ${key}`);
        } else {
          seen.add(key);
          uniqueMessages.push(message);
        }
      });
      
      if (uniqueMessages.length !== messages.length) {
        console.log(`[COLLAB-DEBUG] 🧹 Cleaning chat ${chatId}: ${messages.length} → ${uniqueMessages.length} messages`);
        messagesByChat[chatId] = uniqueMessages;
        cleanedCount += (messages.length - uniqueMessages.length);
      }
    });
    
    if (cleanedCount > 0) {
      localStorage.setItem("messagesByChat", JSON.stringify(messagesByChat));
      console.log(`[COLLAB-DEBUG] ✅ Cleaned up ${cleanedCount} duplicate messages`);
      
      // Refresh UI
      if (window.memory && window.memory.loadAll) {
        window.memory.loadAll();
      }
      if (window.views && window.views.renderCurrentView) {
        window.views.renderCurrentView(false);
      }
    } else {
      console.log(`[COLLAB-DEBUG] ✅ No duplicates found. Total messages: ${totalMessages}`);
    }
    
    return { totalMessages, duplicateCount, cleanedCount };
  } catch (error) {
    console.error("[COLLAB-DEBUG] ❌ Error checking duplicates:", error);
    return { error: error.message };
  }
};

// Global helper function to ensure all messages have message_id
window.ensureMessageIds = function() {
  console.log("[COLLAB-DEBUG] 🧪 === ENSURING ALL MESSAGES HAVE MESSAGE_ID ===");
  
  try {
    const messagesByChat = JSON.parse(localStorage.getItem("messagesByChat") || "{}");
    let totalMessages = 0;
    let fixedCount = 0;
    
    Object.entries(messagesByChat).forEach(([chatId, messages]) => {
      console.log(`[COLLAB-DEBUG] 📋 Chat ${chatId}: ${messages.length} messages`);
      totalMessages += messages.length;
      
      messages.forEach((message, index) => {
        if (!message.message_id) {
          // Generate a message_id for messages that don't have one
          const userId = localStorage.getItem("userId") || "guest";
          const timePart = Date.now().toString(36);
          const randPart = Math.random().toString(36).slice(2, 8);
          const message_id = `${userId.slice(-4)}_${timePart}_${randPart}_${index}`;
          
          message.message_id = message_id;
          console.log(`[COLLAB-DEBUG] 🔧 Fixed message ${index} in chat ${chatId}: ${message_id}`);
          fixedCount++;
        }
      });
    });
    
    if (fixedCount > 0) {
      localStorage.setItem("messagesByChat", JSON.stringify(messagesByChat));
      console.log(`[COLLAB-DEBUG] ✅ Fixed ${fixedCount} messages with missing message_id`);
      
      // Refresh UI
      if (window.memory && window.memory.loadAll) {
        window.memory.loadAll();
      }
      if (window.views && window.views.renderCurrentView) {
        window.views.renderCurrentView(false);
      }
    } else {
      console.log(`[COLLAB-DEBUG] ✅ All ${totalMessages} messages already have message_id`);
    }
    
    return { totalMessages, fixedCount };
  } catch (error) {
    console.error("[COLLAB-DEBUG] ❌ Error ensuring message IDs:", error);
    return { error: error.message };
  }
};

// Global helper function to check isSaved status of messages
window.checkMessageSavedStatus = function() {
  console.log("[COLLAB-DEBUG] 🧪 === CHECKING MESSAGE SAVED STATUS ===");
  
  try {
    const messagesByChat = JSON.parse(localStorage.getItem("messagesByChat") || "{}");
    let totalMessages = 0;
    let savedMessages = 0;
    let unsavedMessages = 0;
    let messagesWithoutFlag = 0;
    
    Object.entries(messagesByChat).forEach(([chatId, messages]) => {
      console.log(`[COLLAB-DEBUG] 📋 Chat ${chatId}: ${messages.length} messages`);
      totalMessages += messages.length;
      
      messages.forEach((message, index) => {
        if (message.isSaved === true) {
          savedMessages++;
        } else if (message.isSaved === false) {
          unsavedMessages++;
        } else {
          messagesWithoutFlag++;
          console.log(`[COLLAB-DEBUG] ⚠️ Message ${index} in chat ${chatId} missing isSaved flag:`, message.message_id);
        }
      });
    });
    
    console.log(`[COLLAB-DEBUG] 📊 Message Status Summary:`);
    console.log(`  - Total messages: ${totalMessages}`);
    console.log(`  - Saved to DB: ${savedMessages}`);
    console.log(`  - Not saved to DB: ${unsavedMessages}`);
    console.log(`  - Missing isSaved flag: ${messagesWithoutFlag}`);
    
    return { totalMessages, savedMessages, unsavedMessages, messagesWithoutFlag };
  } catch (error) {
    console.error("[COLLAB-DEBUG] ❌ Error checking message saved status:", error);
    return { error: error.message };
  }
};

// Global helper function to test collaborator message flow
window.testCollaboratorMessageFlow = async function() {
  console.log("[COLLAB-DEBUG] 🧪 === TESTING COLLABORATOR MESSAGE FLOW ===");
  
  try {
    // Check if we're in collaboration mode
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
    
    // Create a test message as collaborator
    const testMessage = {
      role: "user",
      content: "Test collaborator message",
      timestamp: new Date().toLocaleTimeString(),
      message_id: `collab_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      isSaved: false
    };
    
    const chatId = window.context?.getActiveChatId();
    console.log("[COLLAB-DEBUG] 📋 Test message:", testMessage);
    console.log("[COLLAB-DEBUG] 📋 Chat ID:", chatId);
    
    if (!chatId) {
      console.error("[COLLAB-DEBUG] ❌ No active chat ID");
      return { error: "No active chat ID" };
    }
    
    if (!window.memory?.saveMessage) {
      console.error("[COLLAB-DEBUG] ❌ Memory saveMessage function not available");
      return { error: "Memory saveMessage function not available" };
    }
    
    console.log("[COLLAB-DEBUG] 🚀 Starting collaborator message save...");
    const result = await window.memory.saveMessage(chatId, testMessage);
    
    console.log("[COLLAB-DEBUG] 📊 Save result:", result);
    console.log("[COLLAB-DEBUG] 📊 Final message isSaved status:", testMessage.isSaved);
    
    // Check if message was pushed to collaboration
    if (window.collaboration?.pushMessageToCollab) {
      console.log("[COLLAB-DEBUG] 📤 Pushing message to collaboration...");
      window.collaboration.pushMessageToCollab(testMessage);
    }
    
    return {
      success: true,
      result,
      finalMessageStatus: testMessage.isSaved,
      messageId: testMessage.message_id,
      isCollaborator: !isLeader
    };
    
  } catch (error) {
    console.error("[COLLAB-DEBUG] ❌ Test failed:", error);
    return { error: error.message };
  }
};

// Global helper function to check collaborator sync manager status
window.checkCollaboratorSyncManager = function() {
  console.log("[COLLAB-DEBUG] 🧪 === CHECKING COLLABORATOR SYNC MANAGER ===");
  
  try {
    const isCollaborating = window.collaboration?.isCollaborating;
    const isLeader = window.collaboration?.isLeader;
    const syncManager = window.syncManager;
    
    console.log("[COLLAB-DEBUG] 📋 Collaboration status:", {
      isCollaborating,
      isLeader,
      hasCollaboration: !!window.collaboration
    });
    
    console.log("[COLLAB-DEBUG] 📋 Sync manager status:", {
      hasSyncManager: !!syncManager,
      hasSupabase: !!syncManager?.supabase,
      isInitialized: syncManager?.isInitialized,
      userId: syncManager?.userId,
      hasUploadMessage: !!syncManager?.uploadMessage
    });
    
    if (syncManager) {
      console.log("[COLLAB-DEBUG] 📋 Sync manager methods:", Object.keys(syncManager));
    }
    
    return {
      success: true,
      isCollaborating,
      isLeader,
      hasSyncManager: !!syncManager,
      syncManagerStatus: {
        hasSupabase: !!syncManager?.supabase,
        isInitialized: syncManager?.isInitialized,
        userId: syncManager?.userId,
        hasUploadMessage: !!syncManager?.uploadMessage
      }
    };
    
  } catch (error) {
    console.error("[COLLAB-DEBUG] ❌ Error checking sync manager:", error);
    return { error: error.message };
  }
};

// Global helper function to test message upload flow
window.testMessageUploadFlow = async function() {
  console.log("[COLLAB-DEBUG] 🧪 === TESTING MESSAGE UPLOAD FLOW ===");
  
  try {
    // Create a test message
    const testMessage = {
      role: "user",
      content: "Test message for upload flow",
      timestamp: new Date().toLocaleTimeString(),
      message_id: `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      isSaved: false
    };
    
    const chatId = window.context?.getActiveChatId();
    console.log("[COLLAB-DEBUG] 📋 Test message:", testMessage);
    console.log("[COLLAB-DEBUG] 📋 Chat ID:", chatId);
    
    if (!chatId) {
      console.error("[COLLAB-DEBUG] ❌ No active chat ID");
      return { error: "No active chat ID" };
    }
    
    if (!window.memory?.saveMessage) {
      console.error("[COLLAB-DEBUG] ❌ Memory saveMessage function not available");
      return { error: "Memory saveMessage function not available" };
    }
    
    console.log("[COLLAB-DEBUG] 🚀 Starting test upload...");
    const result = await window.memory.saveMessage(chatId, testMessage);
    
    console.log("[COLLAB-DEBUG] 📊 Test result:", result);
    console.log("[COLLAB-DEBUG] 📊 Final message isSaved status:", testMessage.isSaved);
    
    return {
      success: true,
      result,
      finalMessageStatus: testMessage.isSaved,
      messageId: testMessage.message_id
    };
    
  } catch (error) {
    console.error("[COLLAB-DEBUG] ❌ Test failed:", error);
    return { error: error.message };
  }
};

// Global helper function to test complete leaderId flow
window.testLeaderIdFlow = function() {
  console.log("[COLLAB-DEBUG] 🧪 === TESTING COMPLETE LEADER ID FLOW ===");
  
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
    
    // Check localStorage userId
    const localStorageUserId = localStorage.getItem("userId");
    console.log("[COLLAB-DEBUG] 📋 localStorage userId:", localStorageUserId);
    
    // Check window.userId
    const windowUserId = window.userId;
    console.log("[COLLAB-DEBUG] 📋 window.userId:", windowUserId);
    
    // Check collaboration leaderId
    const collaborationLeaderId = window.collaboration?.leaderId;
    console.log("[COLLAB-DEBUG] 📋 collaboration.leaderId:", collaborationLeaderId);
    
    // Check localStorage collaborationLeaderId
    const localStorageCollaborationLeaderId = localStorage.getItem("collaborationLeaderId");
    console.log("[COLLAB-DEBUG] 📋 localStorage collaborationLeaderId:", localStorageCollaborationLeaderId);
    
    // Check shared sync map leaderId
    const sharedSyncMap = window.collaboration?.getSharedSyncMap();
    const sharedMapLeaderId = sharedSyncMap ? sharedSyncMap.get('leaderId') : null;
    console.log("[COLLAB-DEBUG] 📋 shared sync map leaderId:", sharedMapLeaderId);
    
    // Check sync manager userId
    const syncManagerUserId = window.syncManager?.userId;
    console.log("[COLLAB-DEBUG] 📋 syncManager.userId:", syncManagerUserId);
    
    // Determine the actual leader's userId
    const actualLeaderUserId = localStorageUserId || windowUserId;
    console.log("[COLLAB-DEBUG] 📋 Actual leader userId (from localStorage):", actualLeaderUserId);
    
    // Check if everything is consistent
    const isConsistent = {
      localStorageUserId: !!localStorageUserId,
      windowUserId: !!windowUserId,
      collaborationLeaderId: !!collaborationLeaderId,
      localStorageCollaborationLeaderId: !!localStorageCollaborationLeaderId,
      sharedMapLeaderId: !!sharedMapLeaderId,
      syncManagerUserId: !!syncManagerUserId
    };
    
    console.log("[COLLAB-DEBUG] 📊 Consistency check:", isConsistent);
    
    // Check if leaderId is properly passed to collaborator
    if (isLeader) {
      console.log("[COLLAB-DEBUG] 🔍 This is the leader - checking if userId is stored properly");
      
      if (!actualLeaderUserId) {
        console.error("[COLLAB-DEBUG] ❌ Leader has no userId in localStorage or window");
        return { error: "Leader has no userId" };
      }
      
      if (sharedMapLeaderId !== actualLeaderUserId) {
        console.warn("[COLLAB-DEBUG] ⚠️ Shared map leaderId doesn't match actual userId");
        console.log("[COLLAB-DEBUG] 🔧 Attempting to fix by storing in shared map...");
        if (sharedSyncMap) {
          sharedSyncMap.set('leaderId', actualLeaderUserId);
          console.log("[COLLAB-DEBUG] ✅ Fixed shared map leaderId");
        }
      }
      
    } else {
      console.log("[COLLAB-DEBUG] 🔍 This is a collaborator - checking if leaderId is received properly");
      
      if (!sharedMapLeaderId) {
        console.error("[COLLAB-DEBUG] ❌ Collaborator has no leaderId in shared map");
        return { error: "No leaderId in shared map" };
      }
      
      if (!localStorageCollaborationLeaderId) {
        console.warn("[COLLAB-DEBUG] ⚠️ Collaborator has no leaderId in localStorage");
        console.log("[COLLAB-DEBUG] 🔧 Attempting to fix by storing in localStorage...");
        localStorage.setItem("collaborationLeaderId", sharedMapLeaderId);
        console.log("[COLLAB-DEBUG] ✅ Fixed localStorage leaderId");
      }
    }
    
    return {
      success: true,
      isLeader,
      actualLeaderUserId,
      localStorageUserId,
      windowUserId,
      collaborationLeaderId,
      localStorageCollaborationLeaderId,
      sharedMapLeaderId,
      syncManagerUserId,
      isConsistent
    };
    
  } catch (error) {
    console.error("[COLLAB-DEBUG] ❌ Test failed:", error);
    return { error: error.message };
  }
};

// Global helper function to test userId attribution for collaborators
window.testCollaboratorUserIdAttribution = async function() {
  console.log("[COLLAB-DEBUG] 🧪 === TESTING COLLABORATOR USER ID ATTRIBUTION ===");
  
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
    
    if (isLeader) {
      console.log("[COLLAB-DEBUG] 🔍 This is the leader - testing leader userId");
      
      const leaderUserId = localStorage.getItem("userId") || window.userId;
      console.log("[COLLAB-DEBUG] 📋 Leader userId:", leaderUserId);
      
      return {
        success: true,
        isLeader: true,
        userId: leaderUserId,
        message: "Leader uses their own userId"
      };
    } else {
      console.log("[COLLAB-DEBUG] 🔍 This is a collaborator - testing userId attribution");
      
      const collaborationLeaderId = localStorage.getItem("collaborationLeaderId");
      const syncManagerUserId = window.syncManager?.userId;
      
      console.log("[COLLAB-DEBUG] 📋 collaborationLeaderId:", collaborationLeaderId);
      console.log("[COLLAB-DEBUG] 📋 syncManager.userId:", syncManagerUserId);
      
      // Test creating a message to see what userId will be used
      const testMessage = {
        role: "user",
        content: "Test message for userId attribution",
        timestamp: new Date().toLocaleTimeString(),
        message_id: `test_attribution_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        isSaved: false
      };
      
      const chatId = window.context?.getActiveChatId();
      console.log("[COLLAB-DEBUG] 📋 Test message:", testMessage);
      console.log("[COLLAB-DEBUG] 📋 Chat ID:", chatId);
      
      if (!chatId) {
        console.error("[COLLAB-DEBUG] ❌ No active chat ID");
        return { error: "No active chat ID" };
      }
      
      // Simulate what the upload function would do
      const isCollaborating = window.collaboration?.isCollaborating || false;
      const isLeader = window.collaboration?.isLeader || false;
      
      let userIdToUse;
      if (isCollaborating) {
        userIdToUse = isLeader ? window.syncManager?.userId : (localStorage.getItem("collaborationLeaderId") || window.syncManager?.userId);
      } else {
        userIdToUse = window.syncManager?.userId;
      }
      
      console.log("[COLLAB-DEBUG] 📊 Simulated userId that would be used:", userIdToUse);
      
      return {
        success: true,
        isLeader: false,
        collaborationLeaderId,
        syncManagerUserId,
        simulatedUserId: userIdToUse,
        message: "Collaborator uses leader's userId for data attribution"
      };
    }
    
  } catch (error) {
    console.error("[COLLAB-DEBUG] ❌ Test failed:", error);
    return { error: error.message };
  }
};

// Global helper function to test complete message flow with database save
window.testCompleteMessageFlow = async function() {
  console.log("[COLLAB-DEBUG] 🧪 === TESTING COMPLETE MESSAGE FLOW ===");
  
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
    
    // Check userId attribution
    const collaborationLeaderId = localStorage.getItem("collaborationLeaderId");
    const syncManagerUserId = window.syncManager?.userId;
    
    console.log("[COLLAB-DEBUG] 📋 UserId status:", {
      collaborationLeaderId,
      syncManagerUserId,
      isLeader
    });
    
    // Create a test message
    const testMessage = {
      role: "user",
      content: "Test complete message flow",
      timestamp: new Date().toLocaleTimeString(),
      message_id: `complete_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      isSaved: false
    };
    
    const chatId = window.context?.getActiveChatId();
    console.log("[COLLAB-DEBUG] 📋 Test message:", testMessage);
    console.log("[COLLAB-DEBUG] 📋 Chat ID:", chatId);
    
    if (!chatId) {
      console.error("[COLLAB-DEBUG] ❌ No active chat ID");
      return { error: "No active chat ID" };
    }
    
    // Step 1: Save message to database first
    console.log("[COLLAB-DEBUG] 🚀 Step 1: Saving message to database...");
    const saveResult = await window.memory.saveMessage(chatId, testMessage);
    console.log("[COLLAB-DEBUG] 📊 Save result:", saveResult);
    console.log("[COLLAB-DEBUG] 📊 Message isSaved after save:", testMessage.isSaved);
    
    // Step 2: Push to collaboration
    console.log("[COLLAB-DEBUG] 🚀 Step 2: Pushing to collaboration...");
    if (window.collaboration?.pushMessageToCollab) {
      window.collaboration.pushMessageToCollab(testMessage);
    }
    
    // Step 3: Check if message appears in shared array
    setTimeout(() => {
      console.log("[COLLAB-DEBUG] 🚀 Step 3: Checking shared array...");
      const sharedMessages = window.collaboration?.sharedMessages?.toArray() || [];
      const messageInSharedArray = sharedMessages.find(msg => msg.message_id === testMessage.message_id);
      console.log("[COLLAB-DEBUG] 📊 Message in shared array:", messageInSharedArray);
      
      if (messageInSharedArray) {
        console.log("[COLLAB-DEBUG] 📊 Message userId in shared array:", messageInSharedArray.userId);
        console.log("[COLLAB-DEBUG] 📊 Message isSaved in shared array:", messageInSharedArray.isSaved);
      }
    }, 500);
    
    // Step 4: Check database sync queue
    setTimeout(() => {
      console.log("[COLLAB-DEBUG] 🚀 Step 4: Checking database sync queue...");
      const syncQueue = window.collaboration?.databaseSyncQueue || [];
      console.log("[COLLAB-DEBUG] 📊 Database sync queue length:", syncQueue.length);
      console.log("[COLLAB-DEBUG] 📊 Database sync queue:", syncQueue);
    }, 1000);
    
    return {
      success: true,
      isLeader,
      collaborationLeaderId,
      syncManagerUserId,
      saveResult,
      finalMessageStatus: testMessage.isSaved,
      messageId: testMessage.message_id
    };
    
  } catch (error) {
    console.error("[COLLAB-DEBUG] ❌ Test failed:", error);
    return { error: error.message };
  }
};

// Global helper function to test userId consistency across leader and collaborator
window.testUserIdConsistency = function() {
  console.log("[COLLAB-DEBUG] 🧪 === TESTING USER ID CONSISTENCY ===");
  
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
    
    // Check userId sources
    const localStorageUserId = localStorage.getItem("userId");
    const collaborationLeaderId = localStorage.getItem("collaborationLeaderId");
    const syncManagerUserId = window.syncManager?.userId;
    const collaborationUserId = window.collaboration?.userId;
    
    console.log("[COLLAB-DEBUG] 📋 UserId sources:", {
      localStorageUserId,
      collaborationLeaderId,
      syncManagerUserId,
      collaborationUserId,
      isLeader
    });
    
    // Check messages in local storage
    const messagesByChat = JSON.parse(localStorage.getItem("messagesByChat") || "{}");
    const allMessages = Object.values(messagesByChat).flat();
    
    console.log("[COLLAB-DEBUG] 📊 Total messages in local storage:", allMessages.length);
    
    // Check messages without userId
    const messagesWithoutUserId = allMessages.filter(msg => !msg.userId);
    const messagesWithUserId = allMessages.filter(msg => msg.userId);
    
    console.log("[COLLAB-DEBUG] 📊 Messages without userId:", messagesWithoutUserId.length);
    console.log("[COLLAB-DEBUG] 📊 Messages with userId:", messagesWithUserId.length);
    
    if (messagesWithoutUserId.length > 0) {
      console.log("[COLLAB-DEBUG] ⚠️ Messages missing userId:", messagesWithoutUserId.slice(0, 3));
    }
    
    // Check userId values
    const userIdValues = [...new Set(messagesWithUserId.map(msg => msg.userId))];
    console.log("[COLLAB-DEBUG] 📊 Unique userId values in messages:", userIdValues);
    
    // Check shared array messages
    const sharedMessages = window.collaboration?.sharedMessages?.toArray() || [];
    const sharedMessagesWithUserId = sharedMessages.filter(msg => msg.userId);
    const sharedMessagesWithoutUserId = sharedMessages.filter(msg => !msg.userId);
    
    console.log("[COLLAB-DEBUG] 📊 Shared array messages with userId:", sharedMessagesWithUserId.length);
    console.log("[COLLAB-DEBUG] 📊 Shared array messages without userId:", sharedMessagesWithoutUserId.length);
    
    if (sharedMessagesWithoutUserId.length > 0) {
      console.log("[COLLAB-DEBUG] ⚠️ Shared array messages missing userId:", sharedMessagesWithoutUserId.slice(0, 3));
    }
    
    const sharedUserIdValues = [...new Set(sharedMessagesWithUserId.map(msg => msg.userId))];
    console.log("[COLLAB-DEBUG] 📊 Unique userId values in shared array:", sharedUserIdValues);
    
    return {
      success: true,
      isLeader,
      expectedUserId: isLeader ? localStorageUserId : collaborationLeaderId,
      localMessagesWithoutUserId: messagesWithoutUserId.length,
      localMessagesWithUserId: messagesWithUserId.length,
      sharedMessagesWithoutUserId: sharedMessagesWithoutUserId.length,
      sharedMessagesWithUserId: sharedMessagesWithUserId.length,
      localUserIdValues: userIdValues,
      sharedUserIdValues: sharedUserIdValues
    };
    
  } catch (error) {
    console.error("[COLLAB-DEBUG] ❌ Test failed:", error);
    return { error: error.message };
  }
};

// Global helper function to test isSaved status preservation
window.testIsSavedPreservation = function() {
  console.log("[COLLAB-DEBUG] 🧪 === TESTING IS_SAVED PRESERVATION ===");
  
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
    
    // Check messages in local storage
    const messagesByChat = JSON.parse(localStorage.getItem("messagesByChat") || "{}");
    const allMessages = Object.values(messagesByChat).flat();
    
    console.log("[COLLAB-DEBUG] 📊 Total messages in local storage:", allMessages.length);
    
    // Check isSaved status distribution
    const savedMessages = allMessages.filter(msg => msg.isSaved === true);
    const unsavedMessages = allMessages.filter(msg => msg.isSaved === false);
    const undefinedSavedMessages = allMessages.filter(msg => msg.isSaved === undefined);
    
    console.log("[COLLAB-DEBUG] 📊 isSaved status distribution:", {
      saved: savedMessages.length,
      unsaved: unsavedMessages.length,
      undefined: undefinedSavedMessages.length
    });
    
    // Check by role
    const leaderMessages = allMessages.filter(msg => msg.role !== "collab");
    const collabMessages = allMessages.filter(msg => msg.role === "collab");
    
    const leaderSaved = leaderMessages.filter(msg => msg.isSaved === true);
    const leaderUnsaved = leaderMessages.filter(msg => msg.isSaved === false);
    const collabSaved = collabMessages.filter(msg => msg.isSaved === true);
    const collabUnsaved = collabMessages.filter(msg => msg.isSaved === false);
    
    console.log("[COLLAB-DEBUG] 📊 isSaved by role:", {
      leader: {
        total: leaderMessages.length,
        saved: leaderSaved.length,
        unsaved: leaderUnsaved.length
      },
      collab: {
        total: collabMessages.length,
        saved: collabSaved.length,
        unsaved: collabUnsaved.length
      }
    });
    
    // Show sample messages
    if (leaderMessages.length > 0) {
      console.log("[COLLAB-DEBUG] 📋 Sample leader messages:", leaderMessages.slice(0, 2).map(msg => ({
        role: msg.role,
        content: msg.content.substring(0, 50) + "...",
        isSaved: msg.isSaved,
        userId: msg.userId
      })));
    }
    
    if (collabMessages.length > 0) {
      console.log("[COLLAB-DEBUG] 📋 Sample collab messages:", collabMessages.slice(0, 2).map(msg => ({
        role: msg.role,
        content: msg.content.substring(0, 50) + "...",
        isSaved: msg.isSaved,
        userId: msg.userId
      })));
    }
    
    // Check shared array messages
    const sharedMessages = window.collaboration?.sharedMessages?.toArray() || [];
    const sharedSaved = sharedMessages.filter(msg => msg.isSaved === true);
    const sharedUnsaved = sharedMessages.filter(msg => msg.isSaved === false);
    
    console.log("[COLLAB-DEBUG] 📊 Shared array isSaved status:", {
      total: sharedMessages.length,
      saved: sharedSaved.length,
      unsaved: sharedUnsaved.length
    });
    
    return {
      success: true,
      isLeader,
      localMessages: {
        total: allMessages.length,
        saved: savedMessages.length,
        unsaved: unsavedMessages.length,
        undefined: undefinedSavedMessages.length
      },
      byRole: {
        leader: {
          total: leaderMessages.length,
          saved: leaderSaved.length,
          unsaved: leaderUnsaved.length
        },
        collab: {
          total: collabMessages.length,
          saved: collabSaved.length,
          unsaved: collabUnsaved.length
        }
      },
      sharedArray: {
        total: sharedMessages.length,
        saved: sharedSaved.length,
        unsaved: sharedUnsaved.length
      }
    };
    
  } catch (error) {
    console.error("[COLLAB-DEBUG] ❌ Test failed:", error);
    return { error: error.message };
  }
};

// Global helper function to test view behavior
window.testViewBehavior = function() {
  console.log("[COLLAB-DEBUG] 🧪 === TESTING VIEW BEHAVIOR ===");
  
  try {
    const isCollaborating = window.collaboration?.isCollaborating;
    const isLeader = window.collaboration?.isLeader;
    
    console.log("[COLLAB-DEBUG] 📋 Collaboration status:", {
      isCollaborating,
      isLeader,
      hasCollaboration: !!window.collaboration
    });
    
    // Get current view state
    const currentView = window.context?.getActiveView();
    let storedView = null;
    try {
      const storedViewJson = localStorage.getItem("activeView");
      if (storedViewJson) {
        storedView = JSON.parse(storedViewJson);
      }
    } catch (error) {
      console.warn("[COLLAB-DEBUG] ⚠️ Error parsing stored view:", error);
    }
    
    console.log("[COLLAB-DEBUG] 📋 Current view state:", {
      currentView: currentView ? currentView.type : null,
      storedView: storedView ? storedView.type : null,
      storedViewRaw: localStorage.getItem("activeView")
    });
    
    // Test view setting
    console.log("[COLLAB-DEBUG] 🧪 Testing view setting...");
    
    if (isLeader) {
      console.log("[COLLAB-DEBUG] 👑 Leader: Should start on memory view");
      if (currentView && currentView.type === "memory") {
        console.log("[COLLAB-DEBUG] ✅ Leader is correctly on memory view");
      } else {
        console.log("[COLLAB-DEBUG] ⚠️ Leader is not on memory view:", currentView?.type);
      }
    } else if (isCollaborating) {
      console.log("[COLLAB-DEBUG] 👥 Collaborator: Should start on artifacts view if no stored view");
      if (storedView) {
        console.log("[COLLAB-DEBUG] 📋 Collaborator has stored view:", storedView.type);
        if (currentView && currentView.type === storedView.type) {
          console.log("[COLLAB-DEBUG] ✅ Collaborator correctly restored stored view");
        } else {
          console.log("[COLLAB-DEBUG] ⚠️ Collaborator view mismatch:", {
            current: currentView?.type,
            stored: storedView.type
          });
        }
      } else {
        console.log("[COLLAB-DEBUG] 📋 Collaborator has no stored view - should default to artifacts");
        if (currentView && currentView.type === "artifacts") {
          console.log("[COLLAB-DEBUG] ✅ Collaborator correctly defaulted to artifacts view");
        } else {
          console.log("[COLLAB-DEBUG] ⚠️ Collaborator not on artifacts view:", currentView?.type);
        }
      }
    } else {
      console.log("[COLLAB-DEBUG] 👤 Regular user: Should start on memory view");
      if (currentView && currentView.type === "memory") {
        console.log("[COLLAB-DEBUG] ✅ Regular user is correctly on memory view");
      } else {
        console.log("[COLLAB-DEBUG] ⚠️ Regular user is not on memory view:", currentView?.type);
      }
    }
    
    return {
      success: true,
      isCollaborating,
      isLeader,
      currentView: currentView?.type,
      storedView: storedView?.type,
      localStorageView: localStorageView ? JSON.parse(localStorageView).type : null,
      expectedBehavior: isLeader ? "memory" : (isCollaborating ? (storedView ? storedView.type : "artifacts") : "memory")
    };
    
  } catch (error) {
    console.error("[COLLAB-DEBUG] ❌ Test failed:", error);
    return { error: error.message };
  }
};

// Global helper function to test isSaved flag transmission
window.testIsSavedTransmission = async function() {
  console.log("[COLLAB-DEBUG] 🧪 === TESTING ISSAVED FLAG TRANSMISSION ===");
  
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
    
    // Create a test message with explicit isSaved flag
    const testMessage = {
      role: "user",
      content: "Test message for isSaved flag transmission",
      timestamp: new Date().toLocaleTimeString(),
      message_id: `test_issaved_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      isSaved: false, // Explicitly set to false
      userId: isLeader ? localStorage.getItem("userId") : localStorage.getItem("collaborationLeaderId"),
      chatId: window.context?.getActiveChatId()
    };
    
    console.log("[COLLAB-DEBUG] 📋 Test message created:", {
      role: testMessage.role,
      content: testMessage.content,
      message_id: testMessage.message_id,
      isSaved: testMessage.isSaved,
      userId: testMessage.userId
    });
    
    // Push the message to collaboration
    if (window.collaboration?.pushMessageToCollab) {
      console.log("[COLLAB-DEBUG] 🚀 Pushing test message to collaboration...");
      window.collaboration.pushMessageToCollab(testMessage);
      console.log("[COLLAB-DEBUG] ✅ Test message pushed to collaboration");
    } else {
      console.error("[COLLAB-DEBUG] ❌ pushMessageToCollab not available");
      return { error: "pushMessageToCollab not available" };
    }
    
    // Wait a moment for the message to be processed
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check if the message was received and has the isSaved flag
    const messagesByChat = window.context?.getMessagesByChat() || {};
    const activeChatId = window.context?.getActiveChatId();
    const messagesInChat = messagesByChat[activeChatId] || [];
    const receivedMessage = messagesInChat.find(m => m.message_id === testMessage.message_id);
    
    console.log("[COLLAB-DEBUG] 📊 Message reception check:", {
      activeChatId,
      totalMessagesInChat: messagesInChat.length,
      messageFound: !!receivedMessage,
      receivedMessageIsSaved: receivedMessage?.isSaved,
      expectedIsSaved: testMessage.isSaved
    });
    
    if (receivedMessage) {
      console.log("[COLLAB-DEBUG] 📋 Received message details:", {
        role: receivedMessage.role,
        content: receivedMessage.content,
        message_id: receivedMessage.message_id,
        isSaved: receivedMessage.isSaved,
        userId: receivedMessage.userId
      });
    }
    
    return {
      success: true,
      isLeader,
      testMessage: {
        role: testMessage.role,
        message_id: testMessage.message_id,
        isSaved: testMessage.isSaved
      },
      receivedMessage: receivedMessage ? {
        role: receivedMessage.role,
        message_id: receivedMessage.message_id,
        isSaved: receivedMessage.isSaved,
        userId: receivedMessage.userId
      } : null,
      isSavedTransmitted: receivedMessage && receivedMessage.isSaved === testMessage.isSaved
    };
    
  } catch (error) {
    console.error("[COLLAB-DEBUG] ❌ Test failed:", error);
    return { error: error.message };
  }
};
