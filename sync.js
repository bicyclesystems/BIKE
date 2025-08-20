// =================== Supabase Sync System ===================
// Handles real-time sync between Supabase and local storage with offline support

// =================== Sync Queue Management ===================
const SYNC_QUEUE_KEY = 'syncQueue';

function saveSyncQueueToStorage(queue) {
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
}

function saveSyncQueue(queue) {
  saveSyncQueueToStorage(queue);
}



class SupabaseSync {
  constructor() {
    this.isOnline = navigator.onLine;
    this.isInitialized = false;
    this.isOfflineOnly = false;
    this.supabase = null;
    this.userId = null;
    this.sessionId = null;
    this.syncQueue = [];
    this.realtimeSubscriptions = new Map();
    this.isProcessingQueue = false;
    this.lastSyncTime = null;
    this.retryAttempts = 0;
    this.maxRetries = 3;
    this.retryDelay = 1000;

    // Set up event listeners for online/offline
    window.addEventListener("online", () => this.handleOnline());
    window.addEventListener("offline", () => this.handleOffline());

    // Set up memory event listeners asynchronously
    this.setupMemoryEventListeners().catch((error) => {
      console.warn("[SYNC] Failed to setup memory event listeners:", error);
    });
  }

  // =================== Memory Event Listeners ===================
  async setupMemoryEventListeners() {
    // Wait for memory module to be available using efficient async approach
    const waitForMemory = () => {
      return new Promise((resolve) => {
        if (window.memory?.events) {
          resolve();
        } else {
          // Use a much shorter interval for responsiveness, but don't block
          const checkInterval = setInterval(() => {
            if (window.memory?.events) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 10); // Much shorter interval for better responsiveness
        }
      });
    };

    await waitForMemory();
    window.memory.events.addEventListener("dataChanged", this.handleDataChange);

  }

  handleDataChange(event) {
    const { type, data } = event.detail;

    if (!this.isOnline || !this.isInitialized) return;

    switch (type) {
      case "chat":
        this.uploadChat(data);
        break;
      case "message":
        this.uploadMessage(data.chatId, data.message);
        break;
      case "artifact":
        this.uploadArtifact(data);
        break;
      case "userPreferences":
        this.syncUserPreferences(data);
        break;
      case "all":
        // Handle bulk sync if needed
        this.performPartialSync(data);
        break;
    }
  }

  async performPartialSync(data) {
    // Only sync the most recent items to avoid overwhelming the server
    if (data.chats?.length) {
      const recentChats = data.chats.slice(0, 5); // Last 5 chats
      for (const chat of recentChats) {
        await this.uploadChat(chat);
      }
    }

    if (data.artifacts?.length) {
      const recentArtifacts = data.artifacts.slice(0, 10); // Last 10 artifacts
      for (const artifact of recentArtifacts) {
        await this.uploadArtifact(artifact);
      }
    }
  }

  // =================== Basic Initialization ===================
  // Note: Full initialization happens via initializeBackground() when auth is ready

  // =================== Authentication Integration ===================
  
  async initializeBackground(session) {
    if (session && window.supabase) {
      try {
        await this.initializeWithAuth(window.supabase, session);
        console.log('[SYNC] Background sync complete');
      } catch (err) {
        console.warn('[SYNC] Background sync failed:', err);
      }
    } else {
      // Initialize sync in offline mode
      console.log('[SYNC] Initializing sync in offline mode');
      this.init();
    }
  }

  async initializeWithAuth(supabaseClient, session) {
    try {
  

      this.supabase = supabaseClient;
      this.sessionId = session.access_token;

      // Get user ID from session
      if (session.user) {
        this.userId = session.user.id;
        localStorage.setItem("userId", this.userId);
        window.userId = this.userId;
    
      }

      // Initialize user in database
      await this.initializeUser();

      // Perform initial sync
      if (this.isOnline) {
        await this.performInitialSync();
      }

      // Set up real-time subscriptions
      await this.setupRealtime();

  
      return true;
    } catch (error) {
      console.error("[SYNC] Auth initialization failed:", error);
      return false;
    }
  }

  // =================== User Management ===================

  async initializeUser() {
    if (!this.supabase || !this.isOnline) {
      // If offline, try to load userId from localStorage
      this.userId = localStorage.getItem("userId");
      if (this.userId) {
        console.log(
          "[SYNC] User loaded from localStorage (offline):",
          this.userId
        );
      }
      return;
    }

    try {
      // Use the user ID from authentication (already set in initializeWithAuth)
      if (!this.userId) {
        console.error("[SYNC] No user ID available");
        return;
      }

      // Check if user exists and get their preferences using the auth user ID
      const { data: existingUser } = await this.supabase
        .from("users")
        .select("id, preferences")
        .eq("id", this.userId)
        .single();

      if (existingUser) {
        // Local preferences are ALWAYS authoritative - push them to database
        const currentLocalPrefs = window.user?.getUserPreferences() || {};
        if (Object.keys(currentLocalPrefs).length > 0) {
          // Update database with current local preferences
          await this.syncUserPreferences(currentLocalPrefs);
        }
      } else {
        // Create new user with the authenticated user ID
        const currentPrefs = window.user?.getUserPreferences() || {};
        const { error } = await this.supabase.from("users").insert([
          {
            id: this.userId,
            preferences: currentPrefs,
          },
        ]);

        if (error && !error.message.includes("duplicate")) {
          throw error;
        }

      }

      // Store in global scope for easy access
      window.userId = this.userId;
    } catch (error) {
      console.error("[SYNC] User initialization failed:", error);
      // Try to load from localStorage as fallback
      this.userId = localStorage.getItem("userId");
      if (this.userId) {
  
      }
    }
  }

  // =================== Real-time Setup ===================
  async setupRealtime() {
    if (!this.supabase || !this.userId) return;

    try {
      // Subscribe to chats
      const chatsSubscription = this.supabase
        .channel("chats_channel")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "chats" },
          (payload) => this.handleRealtimeChange("chats", payload)
        )
        .subscribe();

      // Subscribe to messages
      const messagesSubscription = this.supabase
        .channel("messages_channel")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "messages" },
          (payload) => this.handleRealtimeChange("messages", payload)
        )
        .subscribe();

      // Subscribe to artifacts
      const artifactsSubscription = this.supabase
        .channel("artifacts_channel")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "artifacts" },
          (payload) => this.handleRealtimeChange("artifacts", payload)
        )
        .subscribe();

      this.realtimeSubscriptions.set("chats", chatsSubscription);
      this.realtimeSubscriptions.set("messages", messagesSubscription);
      this.realtimeSubscriptions.set("artifacts", artifactsSubscription);

  
    } catch (error) {
      console.error("[SYNC] Real-time setup failed:", error);
    }
  }

  handleRealtimeChange(table, payload) {


    switch (payload.eventType) {
      case "INSERT":
        this.handleRealtimeInsert(table, payload.new);
        break;
      case "UPDATE":
        this.handleRealtimeUpdate(table, payload.new);
        break;
      case "DELETE":
        this.handleRealtimeDelete(table, payload.old);
        break;
    }
  }

  handleRealtimeInsert(table, record) {
    switch (table) {
      case "chats":
        this.mergeChat(record);
        break;
      case "messages":
        this.mergeMessage(record);
        break;
      case "artifacts":
        this.mergeArtifact(record);
        break;
    }
  }

  handleRealtimeUpdate(table, record) {
    // Same logic as insert for our use case
    this.handleRealtimeInsert(table, record);
  }

  handleRealtimeDelete(table, record) {
    switch (table) {
      case "chats":
        this.removeChatFromLocalState(record.id);
        break;
      case "messages":
        this.removeMessageFromLocalState(record.id);
        break;
      case "artifacts":
        this.removeArtifactFromLocalState(record.id);
        break;
    }
  }

  // =================== Data Merging ===================
  mergeChat(serverChat) {
    const chat = {
      id: serverChat.id,
      title: serverChat.title,
      description: serverChat.description || "",
      timestamp: serverChat.timestamp,
      endTime: serverChat.endTime,
    };

    // Use memory module to save the chat
    if (window.memory?.saveChats) {
      const chats = window.chat?.getChats() || [];
      window.memory.saveChats(chats);
    } else {
      // Fallback to direct state update
      const localChats = [...(window.chat?.getChats() || [])];
      const existingIndex = localChats.findIndex((c) => c.id === serverChat.id);

      if (existingIndex >= 0) {
        localChats[existingIndex] = chat;
      } else {
        localChats.push(chat);
      }

      // Update chats directly in chat module
      const chatsArray = window.chat?.getChats();
      if (chatsArray) {
        chatsArray.length = 0;
        chatsArray.push(...localChats);
      }
      // Save using specific bulk operations
      window.memory?.saveChats(window.chat?.getChats() || []);

    }
  }

  mergeMessage(serverMessage) {
    const message = {
      role: serverMessage.role,
      content: serverMessage.content,
      metadata: serverMessage.metadata || {},
    };

    const chatId = serverMessage.chat_id;

    // Add message to chat and save
    if (window.chat && window.memory?.saveChats) {
      // Check if message already exists to prevent duplicates
      const chat = window.chat?.getChats()?.find(c => c.id === chatId);
      const existingMessages = chat?.messages || [];
      const exists = existingMessages.some(
        (m) =>
          m.role === message.role &&
          m.content === message.content &&
          Math.abs(
            new Date(m.metadata.timestamp || 0) -
              new Date(serverMessage.created_at)
          ) < 1000
      );

      if (!exists) {
        // Add message to chat and save
        const chats = window.chat?.getChats() || [];
        const chatIndex = chats.findIndex(c => c.id === chatId);
        if (chatIndex !== -1) {
          if (!chats[chatIndex].messages) {
            chats[chatIndex].messages = [];
          }
          chats[chatIndex].messages.push(message);
          window.memory.saveChats(chats);
        }
      }
    }
  }

  mergeArtifact(serverArtifact) {
    const artifact = {
      id: serverArtifact.id,
      chatId: serverArtifact.chat_id,
      title: serverArtifact.title,
      type: serverArtifact.type,
      versions: serverArtifact.versions || [],
      updatedAt: serverArtifact.updated_at,
    };

    // Use memory module to save the artifact
    if (window.memory?.saveArtifacts) {
      const artifacts = window.artifactsModule?.getArtifacts() || [];
      window.memory.saveArtifacts(artifacts);
    }
  }

  // =================== Local State Removal (for sync operations) ===================

  removeChatFromLocalState(chatId) {

    const localChats = (window.chat?.getChats() || []).filter(
      (c) => c.id !== chatId
    );

    // Update chats directly in chat module
    const chatsArray = window.chat?.getChats();
    if (chatsArray) {
      chatsArray.length = 0;
      chatsArray.push(...localChats);
    }
    // Save using bulk operation
    window.memory?.saveChats(window.chat?.getChats() || []);
  }

  removeMessageFromLocalState(messageId) {
    // Since we don't store message IDs locally, we can't remove specific messages
    // This would require a more sophisticated local storage structure
    // Not implemented - messages are removed at the chat level
  }

  removeArtifactFromLocalState(artifactId) {

    const localArtifacts = (window.artifactsModule?.getArtifacts() || []).filter(
      (a) => a.id !== artifactId
    );
    // Update artifacts directly in artifacts module
    const artifactsArray = window.artifactsModule?.getArtifacts();
    if (artifactsArray) {
      artifactsArray.length = 0;
      artifactsArray.push(...localArtifacts);
    }
    if (window.memory?.saveArtifacts) {
      window.memory.saveArtifacts();
    }
  }

  async deleteChatFromDatabase(chatId) {
    if (!this.isInitialized) {
      console.warn("[SYNC] Cannot delete chat from database - not initialized");
      return false;
    }

    try {


      // Delete messages first (due to foreign key constraints)
      const { error: messagesError } = await this.supabase
        .from("messages")
        .delete()
        .eq("chat_id", chatId);

      if (messagesError) {
        console.error(
          "[SYNC] Failed to delete messages from database:",
          messagesError
        );
        throw messagesError;
      }

      // Delete artifacts for this chat
      const { error: artifactsError } = await this.supabase
        .from("artifacts")
        .delete()
        .eq("chat_id", chatId);

      if (artifactsError) {
        console.error(
          "[SYNC] Failed to delete artifacts from database:",
          artifactsError
        );
        throw artifactsError;
      }

      // Finally delete the chat itself
      const { error: chatError } = await this.supabase
        .from("chats")
        .delete()
        .eq("id", chatId);

      if (chatError) {
        console.error("[SYNC] Failed to delete chat from database:", chatError);
        throw chatError;
      }


      return true;
    } catch (error) {
      console.error("[SYNC] Error deleting chat from database:", error);
      return false;
    }
  }

  async deleteMessageFromDatabase(messageId) {
    if (!this.isInitialized) {
      console.warn(
        "[SYNC] Cannot delete message from database - not initialized"
      );
      return false;
    }

    try {


      const { error } = await this.supabase
        .from("messages")
        .delete()
        .eq("id", messageId);

      if (error) {
        console.error("[SYNC] Failed to delete message from database:", error);
        throw error;
      }

      console.log(
        `[SYNC] Successfully deleted message ${messageId} from database`
      );
      return true;
    } catch (error) {
      console.error("[SYNC] Error deleting message from database:", error);
      return false;
    }
  }

  async deleteArtifactFromDatabase(artifactId) {
    if (!this.isInitialized) {
      console.warn(
        "[SYNC] Cannot delete artifact from database - not initialized"
      );
      return false;
    }

    try {
      console.log(`[SYNC] Deleting artifact ${artifactId} from database`);

      const { error } = await this.supabase
        .from("artifacts")
        .delete()
        .eq("id", artifactId);

      if (error) {
        console.error("[SYNC] Failed to delete artifact from database:", error);
        throw error;
      }

      console.log(
        `[SYNC] Successfully deleted artifact ${artifactId} from database`
      );
      return true;
    } catch (error) {
      console.error("[SYNC] Error deleting artifact from database:", error);
      return false;
    }
  }

  // =================== Initial Sync ===================
  async performInitialSync() {
    if (!this.supabase || !this.userId) return;

    try {
  

      // Sync chats (now includes embedded messages)
      await this.syncChats();

      // Sync artifacts
      await this.syncArtifacts();

      // Process any queued operations
      await this.processQueue();

      this.lastSyncTimestamp = new Date().toISOString();
  
    } catch (error) {
      console.error("[SYNC] Initial sync failed:", error);
    }
  }

  async syncChats() {
    if (!this.supabase || !this.userId) {
      console.warn("[SYNC] syncChats: Missing supabase client or userId");
      return;
    }

    // Sync chat metadata
    const { data: serverChats, error: chatsError } = await this.supabase
      .from("chats")
      .select("*")
      .eq("user_id", this.userId)
      .order("timestamp", { ascending: false });

    if (chatsError) throw chatsError;

    // Sync messages
    const { data: serverMessages, error: messagesError } = await this.supabase
      .from("messages")
      .select("*")
      .eq("user_id", this.userId)
      .order("created_at", { ascending: true });

    if (messagesError) throw messagesError;

    // Group messages by chat_id
    const messagesByChat = {};
    serverMessages.forEach((msg) => {
      if (!messagesByChat[msg.chat_id]) {
        messagesByChat[msg.chat_id] = [];
      }
      messagesByChat[msg.chat_id].push({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        message_id: msg.message_id,
        metadata: msg.metadata || {},
      });
    });

    // Merge server chats with local chats, including embedded messages
    const localChats = [...(window.chat?.getChats() || [])];
    const mergedChats = new Map();

    // Add local chats with their embedded messages
    localChats.forEach((chat) => mergedChats.set(chat.id, { ...chat }));

    // Add/update with server chats and their messages
    serverChats.forEach((serverChat) => {
      const existingChat = mergedChats.get(serverChat.id);
      const serverMessages = messagesByChat[serverChat.id] || [];
      const localMessages = existingChat?.messages || [];
      
      // Simple merge - combine local and server messages, removing duplicates
      const allMessages = [...localMessages];
      serverMessages.forEach((serverMsg) => {
        const exists = localMessages.some(
          (localMsg) =>
            localMsg.role === serverMsg.role &&
            localMsg.content === serverMsg.content
        );
        if (!exists) {
          allMessages.push(serverMsg);
        }
      });

      mergedChats.set(serverChat.id, {
        id: serverChat.id,
        title: serverChat.title,
        description: serverChat.description || "",
        timestamp: serverChat.timestamp,
        endTime: serverChat.endTime,
        messages: allMessages
      });
    });

    const finalChats = Array.from(mergedChats.values()).sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );

    // Update chats directly in chat module
    const chatsArray = window.chat?.getChats();
    if (chatsArray) {
      chatsArray.length = 0;
      chatsArray.push(...finalChats);
    }

    // Ensure there's an active chat set
    const currentActiveChatId = window.chat?.getActiveChatId();
    if (!currentActiveChatId && finalChats.length > 0) {
      console.log(
        "[SYNC] Setting active chat to first available chat:",
        finalChats[0].id
      );
      window.chat?.switchChat(finalChats[0].id);
    }

    // Upload any local-only chats and messages to server
    const serverChatIds = new Set(serverChats.map((c) => c.id));
    const localOnlyChats = localChats.filter(
      (chat) => !serverChatIds.has(chat.id)
    );

    for (const chat of localOnlyChats) {
      await this.uploadChat(chat);
      // Upload messages for this chat
      if (chat.messages?.length > 0) {
        for (const message of chat.messages) {
          await this.uploadMessage(chat.id, message);
        }
      }
    }

    // Upload local-only messages for existing chats
    const localMessagesByChat = {};
    localChats.forEach(chat => {
      if (chat.messages) {
        localMessagesByChat[chat.id] = chat.messages;
      }
    });

    for (const [chatId, localMessages] of Object.entries(localMessagesByChat)) {
      if (!serverChatIds.has(chatId)) continue; // Already handled above
      
      const serverMessages = messagesByChat[chatId] || [];
      const localOnlyMessages = localMessages.filter(
        (localMsg) =>
          !serverMessages.some(
            (serverMsg) =>
              serverMsg.role === localMsg.role &&
              serverMsg.content === localMsg.content
          )
      );

      for (const message of localOnlyMessages) {
        await this.uploadMessage(chatId, message);
      }
    }
  }



  async syncArtifacts() {
    if (!this.supabase || !this.userId) {
      console.warn("[SYNC] syncArtifacts: Missing supabase client or userId");
      return;
    }

    const { data: serverArtifacts, error } = await this.supabase
      .from("artifacts")
      .select("*")
      .eq("user_id", this.userId)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    // Merge server artifacts with local artifacts
    const localArtifacts = [...(window.artifactsModule?.getArtifacts() || [])];
    const mergedArtifacts = new Map();

    // Add local artifacts
    localArtifacts.forEach((artifact) =>
      mergedArtifacts.set(artifact.id, artifact)
    );

    // Add/update with server artifacts
    serverArtifacts.forEach((serverArtifact) => {
      const artifact = {
        id: serverArtifact.id,
        chatId: serverArtifact.chat_id,
        title: serverArtifact.title,
        type: serverArtifact.type,
        versions: serverArtifact.versions || [],
        updatedAt: serverArtifact.updated_at,
      };

      const existing = mergedArtifacts.get(artifact.id);
      if (
        !existing ||
        new Date(artifact.updatedAt) > new Date(existing.updatedAt || 0)
      ) {
        mergedArtifacts.set(artifact.id, artifact);
      }
    });

    const finalArtifacts = Array.from(mergedArtifacts.values());
    // Update artifacts directly in artifacts module
    const artifactsArray = window.artifactsModule?.getArtifacts();
    if (artifactsArray) {
      artifactsArray.length = 0;
      artifactsArray.push(...finalArtifacts);
    }

    // Upload local-only artifacts to server
    const serverArtifactIds = new Set(serverArtifacts.map((a) => a.id));
    const localOnlyArtifacts = localArtifacts.filter(
      (artifact) => !serverArtifactIds.has(artifact.id)
    );

    for (const artifact of localOnlyArtifacts) {
      await this.uploadArtifact(artifact);
    }
  }

  // =================== Upload Functions ===================
  async uploadChat(chat) {
    if (!this.supabase || !this.userId) {
      this.queueOperation("uploadChat", chat);
      return;
    }

    try {
      const { error } = await this.supabase.from("chats").insert([
        {
          id: chat.id,
          user_id: this.userId,
          title: chat.title,
          description: chat.description || "",
          timestamp: chat.timestamp,
          endTime: chat.endTime,
        },
      ]);

      if (error) throw error;
  
    } catch (error) {
      console.error("[SYNC] Chat upload failed:", error);
      this.queueOperation("uploadChat", chat);
    }
  }

  async uploadMessage(chatId, message) {
    if (!this.supabase || !this.userId) {
      this.queueOperation("uploadMessage", { chatId, message });
      return;
    }
    try {
      const { error } = await this.supabase.from("messages").insert([
        {
          chat_id: chatId,
          user_id: this.userId,
          role: message.role,
          content: message.content,
          metadata: message.metadata || {},
          message_id: message.message_id,
        },
      ]);

      if (error) throw error;
      
    } catch (error) {
      console.error("[SYNC] Message upload failed:", error);
      this.queueOperation("uploadMessage", { chatId, message });
    }
  }

  async uploadArtifact(artifact) {
    if (!this.supabase || !this.userId) {
      this.queueOperation("uploadArtifact", artifact);
      return;
    }

    try {
      const { error } = await this.supabase.from("artifacts").upsert([
        {
          id: artifact.id,
          user_id: this.userId,
          chat_id: artifact.chatId,
          title: artifact.title,
          type: artifact.type,
          versions: artifact.versions || [],
        },
      ]);

      if (error) throw error;
      
    } catch (error) {
      console.error("[SYNC] Artifact upload failed:", error);
      this.queueOperation("uploadArtifact", artifact);
    }
  }

  // =================== Queue Management ===================
  queueOperation(operation, data) {
    this.syncQueue.push({ operation, data, timestamp: Date.now() });

    // Persist queue
    saveSyncQueue(this.syncQueue);
  }

  async processQueue() {
    if (this.syncQueue.length === 0) return;

    console.log(
      `[SYNC] Processing ${this.syncQueue.length} queued operations...`
    );

    const queue = [...this.syncQueue];
    this.syncQueue = [];

    for (const { operation, data } of queue) {
      try {
        switch (operation) {
          case "uploadChat":
            await this.uploadChat(data);
            break;
          case "uploadMessage":
            await this.uploadMessage(data.chatId, data.message);
            break;
          case "uploadArtifact":
            await this.uploadArtifact(data);
            break;
        }
      } catch (error) {
        console.error(`[SYNC] Queue operation ${operation} failed:`, error);
        // Re-queue failed operations
        this.queueOperation(operation, data);
      }
    }

    // Update persisted queue
    saveSyncQueue(this.syncQueue);
  }

  // =================== Online/Offline Handling ===================
  async handleOnline() {
    
    this.isOnline = true;

    if (this.isInitialized && this.supabase) {
      await this.setupRealtime();
      await this.processQueue();
      await this.performInitialSync();
    }
  }

  handleOffline() {
    
    this.isOnline = false;

    // Unsubscribe from real-time
    for (const subscription of this.realtimeSubscriptions.values()) {
      subscription.unsubscribe();
    }
    this.realtimeSubscriptions.clear();
  }

  // =================== User Preferences Sync ===================
  async syncUserPreferences(preferences) {
    if (!this.supabase || !this.userId || !this.isOnline) {
      console.log(
        "[SYNC] Cannot sync preferences - offline or not initialized"
      );
      return false;
    }

    try {
      const { error } = await this.supabase
        .from("users")
        .update({ preferences })
        .eq("id", this.userId);

      if (error) throw error;

      return true;
    } catch (error) {
      console.error("[SYNC] Failed to sync user preferences:", error);
      return false;
    }
  }

  getStatus() {
    return {
      isOnline: this.isOnline,
      isInitialized: this.isInitialized,
      hasSupabase: !!this.supabase,
      queueLength: this.syncQueue.length,
      userId: this.userId,
      sessionId: this.sessionId,
    };
  }
}

// =================== Global Instance ===================
const syncManager = new SupabaseSync();

// Export for global access
window.syncManager = syncManager;

// =================== Auto-Initialization ===================
// Sync initializes itself when user auth state changes (via user.js integration)
// No need for manual initialization since sync is reactive to auth events
