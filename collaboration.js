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

    // Check for auto-join
    await this.checkForAutoJoin();

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
        // Mark as leader
        this.isLeader = true;

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

    // Mark as collaborator (not leader)
    this.isLeader = false;

    return await this.joinSession(collaborationId);
  },

  // Check if we should auto-join collaboration
  async checkForAutoJoin() {
    const collaborationId = this.extractCollaborationIdFromUrl();

    console.log("[COLLAB] checkForAutoJoin - URL hash:", window.location.hash);
    console.log("[COLLAB] checkForAutoJoin - extracted ID:", collaborationId);
    console.log(
      "[COLLAB] checkForAutoJoin - isCollaborating:",
      this.isCollaborating
    );

    if (collaborationId && !this.isCollaborating) {
      console.log("[COLLAB] Auto-joining collaboration:", collaborationId);
      const result = await this.joinCollaborationFromUrl();
      console.log("[COLLAB] Auto-join result:", result);
    } else {
      console.log(
        "[COLLAB] No auto-join needed - collaborationId:",
        collaborationId,
        "isCollaborating:",
        this.isCollaborating
      );
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

      // Update state
      this.isCollaborating = true;
      this.collaborationId = roomName;

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

      // Update state
      this.isCollaborating = true;
      this.collaborationId = roomName;

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
};

// Make collaboration available globally
window.collaboration = collaboration;
// Auto-initialize when script loads
collaboration.init();
