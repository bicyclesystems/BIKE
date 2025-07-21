// =================== Basic Yjs Collaboration (Official Pattern) ===================
// Direct from: https://github.com/yjs/y-webrtc

const collaboration = {
  ydoc: null,
  provider: null,
  collaborationId: null,
  isCollaborating: false,
  connectedPeers: new Map(),
  syncStatus: "disconnected",
  isLeader: false,

  async init() {
    // Wait for Yjs to load
    while (!window.Y || !window.WebrtcProvider) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Check for auto-join from URL
    await this.checkForAutoJoin();
  },

  // Generate collaboration ID
  generateCollaborationId() {
    return Math.random().toString(36).substr(2, 9);
  },

  // Get collaboration ID from URL
  getCollaborationIdFromUrl() {
    const hash = window.location.hash;
    const match = hash.match(/#\/collab-(.+)/);
    return match ? match[1] : null;
  },

  // Auto-join from URL
  async checkForAutoJoin() {
    const collaborationId = this.getCollaborationIdFromUrl();
    if (collaborationId && !this.isCollaborating) {
      this.joinSession(collaborationId);
    }
  },

  // Create collaboration link (for your existing button)
  async createCollaborationLink() {
    try {
      const collaborationId = this.generateCollaborationId();
      this.createSession(collaborationId);

      const shareableLink = `${window.location.origin}${window.location.pathname}#/collab-${collaborationId}`;

      // Copy to clipboard
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareableLink);
      }

      return {
        success: true,
        collaborationId,
        shareableLink,
        message: `Collaboration link created: ${shareableLink}`,
        roomInfo: this.getRoomInfo(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  },

  createSession(roomName) {
    // Use the stable WebRTC provider function from index.html
    this.ydoc = new window.Y.Doc();

    this.provider = window.createStableWebrtcProvider(roomName, this.ydoc);

    // Define shared types (official API)
    const ymap = this.ydoc.getMap("shared-data");

    // Set up event listeners
    this.setupEventListeners();

    // Set state
    this.collaborationId = roomName;
    this.isCollaborating = true;
    this.isLeader = true; // Creator is leader
    this.syncStatus = "connecting";

    console.log("Created session as LEADER:", roomName);

    return roomName;
  },

  joinSession(roomName) {
    // Use the stable WebRTC provider function from index.html
    this.ydoc = new window.Y.Doc();

    this.provider = window.createStableWebrtcProvider(roomName, this.ydoc);

    // Define shared types (official API)
    const ymap = this.ydoc.getMap("shared-data");

    // Set up event listeners
    this.setupEventListeners();

    // Set state
    this.collaborationId = roomName;
    this.isCollaborating = true;
    this.isLeader = false; // Joiner is collaborator
    this.syncStatus = "connecting";

    console.log("Joined session as COLLABORATOR:", roomName);
  },

  // Set up event listeners
  setupEventListeners() {
    // Provider connection events
    this.provider.on("status", (event) => {
      this.syncStatus = event.status;
      console.log("Status:", event.status);
    });

    this.provider.on("synced", (event) => {
      this.syncStatus = "synced";
      console.log("Synced!");
    });

    // Peer event handling
    this.provider.on("peers", (event) => {
      // Update connected peers tracking
      if (event.added) {
        event.added.forEach((peerId) => {
          this.connectedPeers.set(peerId, true);
          console.log("Peer ADDED:", peerId);
        });
      }

      if (event.removed) {
        event.removed.forEach((peerId) => {
          this.connectedPeers.delete(peerId);
          console.log("Peer REMOVED:", peerId);
        });
      }

      console.log("Total peers:", this.connectedPeers.size);
    });

    // Shared map events
    const ymap = this.ydoc.getMap("shared-data");
    ymap.observe((event) => {
      console.log("Shared data changed:", event.keysChanged);
    });
  },

  getRoomInfo() {
    return {
      collaborationId: this.collaborationId,
      isCollaborating: this.isCollaborating,
      syncStatus: this.syncStatus,
      peersCount: this.connectedPeers.size,
      peerIds: Array.from(this.connectedPeers.keys()),
      role: this.isLeader ? "LEADER" : "COLLABORATOR",
      documentId: this.ydoc?.guid,
      clientId: this.ydoc?.clientID,
      connected: this.provider?.connected || false,
      signalingServers: this.provider?.signalingUrls || [],
      sharedMapSize: this.ydoc?.getMap("shared-data")?.size || 0,
      isLeader: this.isLeader,
    };
  },

  // Get status (for your existing UI)
  getStatus() {
    return this.getRoomInfo();
  },

  // Leave session (for your existing button)
  leaveSession() {
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
    this.syncStatus = "disconnected";
    this.connectedPeers.clear();
    this.isLeader = false;

    // Clean URL
    const newUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, newUrl);

    // Refresh UI
    if (window.views && window.views.render) {
      window.views.render();
    }
  },
};

// Make available globally
window.collaboration = collaboration;

// Test function to verify data sharing
window.testCollaboration = function () {
  if (!collaboration.isCollaborating) {
    console.log("Not in collaboration session");
    return;
  }

  const ymap = collaboration.ydoc.getMap("shared-data");
  const testKey = `test-${collaboration.ydoc.clientID}`;
  const testValue = {
    message: `Hello from ${collaboration.isLeader ? "LEADER" : "COLLABORATOR"}`,
    timestamp: new Date().toISOString(),
    clientId: collaboration.ydoc.clientID,
  };

  console.log("Sharing test data:", { key: testKey, value: testValue });
  ymap.set(testKey, testValue);
  console.log("Data shared successfully");
};

// Initialize
collaboration.init();
