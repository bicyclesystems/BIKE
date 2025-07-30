// =================== Supabase Sync System ===================
// Handles real-time sync between Supabase and local storage with offline support

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

    // Check if sync is enabled (collaboration protection cleared)
    const isCollabProtected = window.isCollaborationProtected
      ? window.isCollaborationProtected()
      : false;

    if (!this.isOnline || !this.isInitialized) {
      console.log("[SYNC] ⚠️ Sync skipped - offline or not initialized");
      return;
    }

    if (isCollabProtected) {
      console.log("[SYNC] ⚠️ Sync skipped - collaboration protection active");
      return;
    }

    console.log("[SYNC] 🔄 Processing data change:", type);

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

  // =================== Initialization ===================
  async init() {
    try {
      // Create sync event listeners for memory system
      if (window.memory && typeof window.memory.on === "function") {
        window.memory.on("dataChanged", (data) => this.handleDataChange(data));
        window.memory.on("artifactChanged", (artifact) =>
          this.handleArtifactChange(artifact)
        );
      }

      // If no Supabase config, run offline mode only
      if (!window.SUPABASE_CONFIG) {
        this.isOfflineOnly = true;
        this.userId =
          localStorage.getItem("bike_offline_user_id") ||
          "offline_" + Date.now();
        localStorage.setItem("bike_offline_user_id", this.userId);
        this.isInitialized = true;
        return;
      }

      try {
        // Don't create Supabase client here - let auth system provide it
        // This ensures we use the same authenticated session
        this.isInitialized = true;
    
      } catch (error) {
        this.isOfflineOnly = true;
        this.sessionId = "fallback_" + Date.now();
        this.userId =
          localStorage.getItem("bike_fallback_user_id") || this.sessionId;
        localStorage.setItem("bike_fallback_user_id", this.userId);
        this.isInitialized = true;
      }
    } catch (error) {
      console.error("[SYNC] Initialization failed:", error);
      this.isOfflineOnly = true;
      this.sessionId = "emergency_" + Date.now();
      this.userId =
        localStorage.getItem("bike_emergency_user_id") || this.sessionId;
      localStorage.setItem("bike_emergency_user_id", this.userId);
      this.isInitialized = true;
    }
  }

  // =================== Authentication Integration ===================
  async initializeWithAuth(supabaseClient, session) {
    try {
      console.log("[SYNC] 🔄 Initializing sync manager with auth...");
      console.log("[SYNC] 📋 Session user ID:", session.user?.id);

      this.supabase = supabaseClient;
      this.sessionId = session.access_token;

      // Get user ID from session
      if (session.user) {
        this.userId = session.user.id;
        // Only store userId in localStorage if it's not null (for collaborators)
        if (this.userId) {
          localStorage.setItem("userId", this.userId);
          window.userId = this.userId;
        } else {
          console.log("[SYNC] 📋 Collaborator mode - userId is null");
        }
      }

      // Initialize user in database (skip for collaborators with null userId)
      if (this.userId) {
        await this.initializeUser();
      } else {
        console.log("[SYNC] 📋 Skipping user initialization for collaborator");
      }

      // Perform initial sync
      if (this.isOnline) {
        await this.performInitialSync();
      }

      // Set up real-time subscriptions
      await this.setupRealtime();

      console.log("[SYNC] ✅ Sync manager initialized successfully");
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
        console.log("[SYNC] No user ID available - this is normal for collaborators");
        return;
      }

      // Check if user exists and get their preferences using the auth user ID
      const { data: existingUser } = await this.supabase
        .from("users")
        .select("id, preferences")
        .eq("id", this.userId)
        .single();

      if (existingUser) {
        // Sync user preferences from database using memory module
        if (existingUser.preferences && window.memory?.saveUserPreferences) {
          window.memory.saveUserPreferences(existingUser.preferences);
        }

  
      } else {
        // Create new user with the authenticated user ID
        const currentPrefs = window.memory?.getUserPreferences() || {};
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
    if (window.memory?.saveChat) {
      window.memory.saveChat(chat);
    } else {
      // Fallback to direct state update
      const localChats = [...(window.context?.getChats() || [])];
      const existingIndex = localChats.findIndex((c) => c.id === serverChat.id);

      if (existingIndex >= 0) {
        localChats[existingIndex] = chat;
      } else {
        localChats.push(chat);
      }

      window.context?.setState({ chats: localChats });
      if (window.memory?.saveAll) {
        window.memory.saveAll();
      }
    }
  }

  mergeMessage(serverMessage) {
    const message = {
      role: serverMessage.role,
      content: serverMessage.content,
      metadata: serverMessage.metadata || {},
      message_id: serverMessage.message_id, // Preserve the message_id from database
      isSaved: true, // Messages from database are already saved
    };

    const chatId = serverMessage.chat_id;

    // Use memory module to save the message
    if (window.memory?.saveMessage) {
      // Check if message already exists to prevent duplicates using message_id
      const existingMessages =
        window.context?.getMessagesByChat()[chatId] || [];
      const exists = existingMessages.some(
        (m) => m.message_id === message.message_id
      );

      if (!exists) {
        window.memory.saveMessage(chatId, message);
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
    if (window.memory?.saveArtifact) {
      window.memory.saveArtifact(artifact);
    }
  }

  // =================== Local State Removal (for sync operations) ===================

  removeChatFromLocalState(chatId) {

    const localChats = (window.context?.getChats() || []).filter(
      (c) => c.id !== chatId
    );
    const messagesByChat = { ...window.context?.getMessagesByChat() };
    delete messagesByChat[chatId];

    window.context?.setState({ chats: localChats, messagesByChat });
    if (window.memory?.saveAll) {
      window.memory.saveAll();
    }
  }

  removeMessageFromLocalState(messageId) {
    // Since we don't store message IDs locally, we can't remove specific messages
    // This would require a more sophisticated local storage structure
    // Not implemented - messages are removed at the chat level
  }

  removeArtifactFromLocalState(artifactId) {

    const localArtifacts = (window.context?.getArtifacts() || []).filter(
      (a) => a.id !== artifactId
    );
    window.context?.setState({ artifacts: localArtifacts });
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
  

      // Sync chats
      await this.syncChats();

      // Sync messages
      await this.syncMessages();

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
    const { data: serverChats, error } = await this.supabase
      .from("chats")
      .select("*")
      .eq("user_id", this.userId)
      .order("timestamp", { ascending: false });

    if (error) throw error;

    // Merge server chats with local chats
    const localChats = [...(window.context?.getChats() || [])];
    const mergedChats = new Map();

    // Add local chats
    localChats.forEach((chat) => mergedChats.set(chat.id, chat));

    // Add/update with server chats
    serverChats.forEach((serverChat) => {
      mergedChats.set(serverChat.id, {
        id: serverChat.id,
        title: serverChat.title,
        description: serverChat.description || "",
        timestamp: serverChat.timestamp,
        endTime: serverChat.endTime,
      });
    });

    const finalChats = Array.from(mergedChats.values()).sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );

    window.context?.setState({ chats: finalChats });

    // Ensure there's an active chat set
    const currentActiveChatId = window.context?.getActiveChatId();
    if (!currentActiveChatId && finalChats.length > 0) {
      console.log(
        "[SYNC] Setting active chat to first available chat:",
        finalChats[0].id
      );
      window.context?.setActiveChat(finalChats[0].id);
    }

    // Upload any local-only chats to server
    const serverChatIds = new Set(serverChats.map((c) => c.id));
    const localOnlyChats = localChats.filter(
      (chat) => !serverChatIds.has(chat.id)
    );

    for (const chat of localOnlyChats) {
      await this.uploadChat(chat);
    }
  }

  async syncMessages() {
    const { data: serverMessages, error } = await this.supabase
      .from("messages")
      .select("*")
      .eq("user_id", this.userId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    // Group by chat_id
    const serverMessagesByChat = {};
    serverMessages.forEach((msg) => {
      if (!serverMessagesByChat[msg.chat_id]) {
        serverMessagesByChat[msg.chat_id] = [];
      }
      serverMessagesByChat[msg.chat_id].push({
        role: msg.role,
        content: msg.content,
        metadata: msg.metadata || {},
        message_id: msg.message_id, // Preserve message_id from database
        isSaved: true, // Messages from database are already saved
      });
    });

    // Merge with local messages
    const localMessagesByChat = {
      ...(window.context?.getMessagesByChat() || {}),
    };
    const mergedMessagesByChat = {};

    // Get all chat IDs
    const allChatIds = new Set([
      ...Object.keys(localMessagesByChat),
      ...Object.keys(serverMessagesByChat),
    ]);

    for (const chatId of allChatIds) {
      const localMessages = localMessagesByChat[chatId] || [];
      const serverMessages = serverMessagesByChat[chatId] || [];

      // Simple merge - in production you'd want more sophisticated conflict resolution
      mergedMessagesByChat[chatId] = [...localMessages];

      // Add server messages that don't exist locally
      serverMessages.forEach((serverMsg) => {
        const exists = localMessages.some(
          (localMsg) => localMsg.message_id === serverMsg.message_id
        );
        if (!exists) {
          mergedMessagesByChat[chatId].push(serverMsg);
        }
      });
    }

    window.context?.setState({ messagesByChat: mergedMessagesByChat });

    // Upload local-only messages
    for (const [chatId, messages] of Object.entries(localMessagesByChat)) {
      const serverMessages = serverMessagesByChat[chatId] || [];
      const localOnlyMessages = messages.filter(
        (localMsg) =>
          localMsg.isSaved === false && // Only upload messages that haven't been saved
          !serverMessages.some(
            (serverMsg) => serverMsg.message_id === localMsg.message_id
          )
      );

      for (const message of localOnlyMessages) {
        await this.uploadMessage(chatId, message);
      }
    }
  }

  async syncArtifacts() {
    const { data: serverArtifacts, error } = await this.supabase
      .from("artifacts")
      .select("*")
      .eq("user_id", this.userId)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    // Merge server artifacts with local artifacts
    const localArtifacts = [...(window.context?.getArtifacts() || [])];
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
    window.context?.setState({ artifacts: finalArtifacts });

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
    console.log("[COLLAB-DEBUG] 📤 === SYNC UPLOAD CHAT START ===");
    console.log("[COLLAB-DEBUG] 📋 Chat:", chat);

    // Check if we have Supabase client
    console.log("[COLLAB-DEBUG] 🔍 Checking Supabase client...");
    console.log("[COLLAB-DEBUG] 📊 Supabase client available:", !!this.supabase);
    
    if (!this.supabase) {
      console.warn("[COLLAB-DEBUG] ⚠️ No Supabase client - queuing chat");
      this.queueOperation("uploadChat", chat);
      return;
    }

    // Get collaboration context
    const isCollaborating = window.collaboration?.isCollaborating || false;
    const collaborationId = window.collaboration?.databaseCollaborationId || null;
    const participantId = window.collaboration?.participantId || null;
    const isLeader = window.collaboration?.isLeader || false;

    console.log("[COLLAB-DEBUG] 📋 Collaboration Context for Chat:");
    console.log("  - Is Collaborating:", isCollaborating);
    console.log("  - Collaboration ID:", collaborationId);
    console.log("  - Participant ID:", participantId);
    console.log("  - Is Leader:", isLeader);
    console.log("  - User ID:", this.userId);
    console.log("  - Will save as collaboration chat:", isCollaborating && collaborationId);

    // Bypass collaboration protection for collaboration data
    const isCollabProtected = window.isCollaborationProtected
      ? window.isCollaborationProtected()
      : false;
    
    console.log("[COLLAB-DEBUG] 🛡️ Collaboration protection check:", {
      isCollabProtected,
      isCollaborating,
      shouldSkip: isCollabProtected && !isCollaborating
    });
    
    if (isCollabProtected && !isCollaborating) {
      console.log("[COLLAB-DEBUG] ⚠️ Skipping upload - collaboration protection active and not collaboration data");
      this.queueOperation("uploadChat", chat);
      return;
    }

    try {
      // Prepare chat data based on collaboration context
      console.log("[COLLAB-DEBUG] 📝 === PREPARING CHAT DATA ===");
      let chatData = {
        id: chat.id,
        title: chat.title,
        description: chat.description || "",
        timestamp: chat.timestamp,
        endTime: chat.endTime,
      };

      if (isCollaborating && collaborationId) {
        // Collaboration chat
        console.log("[COLLAB-DEBUG] 📝 Saving as collaboration chat");
        
        chatData = {
          ...chatData,
          collaboration_id: collaborationId,
          participant_id: participantId,
          is_collaboration_chat: true,
          user_id: isLeader ? this.userId : (localStorage.getItem("collaborationLeaderId") || this.userId), // Use leader's userId for collaborators
        };
      } else {
        // Regular user chat
        console.log("[COLLAB-DEBUG] 📝 Saving as regular user chat");
        
        if (!this.userId) {
          console.warn("[COLLAB-DEBUG] ⚠️ No user ID for regular chat - queuing");
          this.queueOperation("uploadChat", chat);
          return;
        }
        
        chatData = {
          ...chatData,
          user_id: this.userId,
          collaboration_id: null,
          participant_id: null,
          is_collaboration_chat: false
        };
      }

      console.log("[COLLAB-DEBUG] 📋 Final chat data:", chatData);

      // Insert chat into database
      console.log("[COLLAB-DEBUG] 🗄️ === DATABASE INSERT ATTEMPT ===");
      console.log("[COLLAB-DEBUG] 📋 Inserting into 'chats' table with data:", chatData);
      
      const { data, error } = await this.supabase.from("chats").insert([chatData]);
      console.log("[COLLAB-DEBUG] 📊 Database response:", { data, error });

      if (error) {
        console.error("[COLLAB-DEBUG] ❌ Chat upload failed:", error);
        throw error;
      }

      console.log("[COLLAB-DEBUG] ✅ Chat uploaded successfully");
      console.log("[COLLAB-DEBUG] 📋 Database response data:", data);
      
    } catch (error) {
      console.error("[COLLAB-DEBUG] ❌ === SYNC UPLOAD CHAT ERROR ===");
      console.error("[COLLAB-DEBUG] Exception during chat upload:", error);
      console.error("[COLLAB-DEBUG] Error stack:", error.stack);
      this.queueOperation("uploadChat", chat);
    }
  }

  async uploadMessage(chatId, message) {
    console.log("[COLLAB-DEBUG] 📤 === SYNC UPLOAD MESSAGE START ===");
    console.log("[COLLAB-DEBUG] 📋 Chat ID:", chatId);
    console.log("[COLLAB-DEBUG] 📋 Message:", message);
    console.log("[COLLAB-DEBUG] 📋 Message isSaved status:", message.isSaved);
    
    // Don't check isSaved here - let the caller handle it
    // We'll always attempt the upload and return the result

    // Check if we have Supabase client
    console.log("[COLLAB-DEBUG] 🔍 Checking Supabase client...");
    console.log("[COLLAB-DEBUG] 📊 Supabase client available:", !!this.supabase);
    
    if (!this.supabase) {
      console.warn("[COLLAB-DEBUG] ⚠️ No Supabase client - queuing message");
      this.queueOperation("uploadMessage", { chatId, message });
      return { success: false, error: "No Supabase client available" };
    }

    // Get collaboration context
    const isCollaborating = window.collaboration?.isCollaborating || false;
    const collaborationId = window.collaboration?.databaseCollaborationId || null;
    const participantId = window.collaboration?.participantId || null;
    const isLeader = window.collaboration?.isLeader || false;

    console.log("[COLLAB-DEBUG] 📋 Collaboration Context:");
    console.log("  - Is Collaborating:", isCollaborating);
    console.log("  - Collaboration ID:", collaborationId);
    console.log("  - Participant ID:", participantId);
    console.log("  - Is Leader:", isLeader);
    console.log("  - User ID:", this.userId);
    console.log("  - Will save as collaboration message:", isCollaborating && collaborationId);

    // Bypass collaboration protection for collaboration data
    const isCollabProtected = window.isCollaborationProtected
      ? window.isCollaborationProtected()
      : false;
    
    console.log("[COLLAB-DEBUG] 🛡️ Collaboration protection check:", {
      isCollabProtected,
      isCollaborating,
      shouldSkip: isCollabProtected && !isCollaborating
    });
    
    if (isCollabProtected && !isCollaborating) {
      console.log("[COLLAB-DEBUG] ⚠️ Skipping upload - collaboration protection active and not collaboration data");
      this.queueOperation("uploadMessage", { chatId, message });
      return { success: false, error: "Collaboration protection active" };
    }

    try {
      // Prepare message data based on collaboration context
      console.log("[COLLAB-DEBUG] 📝 === PREPARING MESSAGE DATA ===");
      let messageData = {
        chat_id: chatId,
        role: message.role,
        content: message.content,
        metadata: message.metadata || {},
        message_id: message.message_id,
      };

      if (isCollaborating && collaborationId) {
        // Collaboration message
        console.log("[COLLAB-DEBUG] 📝 Saving as collaboration message");
        
        messageData = {
          ...messageData,
          collaboration_id: collaborationId,
          participant_id: participantId,
          is_collaboration_message: true,
          user_id: isLeader ? this.userId : (localStorage.getItem("collaborationLeaderId") || this.userId), // Use leader's userId for collaborators
          metadata: {
            ...messageData.metadata,
            collaboration_room: window.collaboration?.collaborationId,
            peer_id: window.collaboration?.provider?.room?.peerId,
            display_name: isLeader ? 'Leader' : 'Anonymous Collaborator',
            is_leader: isLeader,
            timestamp: new Date().toISOString()
          }
        };
      } else {
        // Regular user message
        console.log("[COLLAB-DEBUG] 📝 Saving as regular user message");
        
        if (!this.userId) {
          console.warn("[COLLAB-DEBUG] ⚠️ No user ID for regular message - queuing");
          this.queueOperation("uploadMessage", { chatId, message });
          return { success: false, error: "No user ID available" };
        }
        
        messageData = {
          ...messageData,
          user_id: this.userId,
          collaboration_id: null,
          participant_id: null,
          is_collaboration_message: false
        };
      }

      console.log("[COLLAB-DEBUG] 📋 Final message data:", messageData);

      // Insert message into database
      console.log("[COLLAB-DEBUG] 🗄️ === DATABASE INSERT ATTEMPT ===");
      console.log("[COLLAB-DEBUG] 📋 Inserting into 'messages' table with data:", messageData);
      
      const { data, error, status } = await this.supabase.from("messages").insert([messageData]);

      console.log("[COLLAB-DEBUG] 📊 Database response:", { data, error, status });

      if (error) {
        console.error("[COLLAB-DEBUG] ❌ Message upload failed:", error);
        console.log("[COLLAB-DEBUG] 📊 Returning failure result");
        return { success: false, error: error.message, status };
      }

      console.log("[COLLAB-DEBUG] ✅ Message uploaded successfully");
      console.log("[COLLAB-DEBUG] 📋 Database response data:", data);
      console.log("[COLLAB-DEBUG] 📊 Returning success result");
      return { success: true, data, status };
      
    } catch (error) {
      console.error("[COLLAB-DEBUG] ❌ === SYNC UPLOAD ERROR ===");
      console.error("[COLLAB-DEBUG] Exception during message upload:", error);
      console.error("[COLLAB-DEBUG] Error stack:", error.stack);
      this.queueOperation("uploadMessage", { chatId, message });
      return { success: false, error: error.message };
    }
  }

  async uploadArtifact(artifact) {
    console.log("[COLLAB-DATA] 📤 Uploading artifact to database...");
    console.log("[COLLAB-DATA] 📋 Artifact:", artifact);

    // Check if we have Supabase client
    if (!this.supabase) {
      console.warn("[COLLAB-DATA] ⚠️ No Supabase client - queuing artifact");
      this.queueOperation("uploadArtifact", artifact);
      return;
    }

    // Get collaboration context
    const isCollaborating = window.collaboration?.isCollaborating || false;
    const collaborationId = window.collaboration?.databaseCollaborationId || null;
    const participantId = window.collaboration?.participantId || null;
    const isLeader = window.collaboration?.isLeader || false;

    console.log("[COLLAB-DATA] 📋 Collaboration Context for Artifact:");
    console.log("  - Is Collaborating:", isCollaborating);
    console.log("  - Collaboration ID:", collaborationId);
    console.log("  - Participant ID:", participantId);
    console.log("  - Is Leader:", isLeader);
    console.log("  - User ID:", this.userId);

    // Bypass collaboration protection for collaboration data
    const isCollabProtected = window.isCollaborationProtected
      ? window.isCollaborationProtected()
      : false;
    
    if (isCollabProtected && !isCollaborating) {
      console.log("[COLLAB-DATA] ⚠️ Skipping upload - collaboration protection active and not collaboration data");
      this.queueOperation("uploadArtifact", artifact);
      return;
    }

    try {
      // Prepare artifact data based on collaboration context
      let artifactData = {
        id: artifact.id,
        chat_id: artifact.chatId,
        title: artifact.title,
        type: artifact.type,
        versions: artifact.versions || [],
        slug: artifact.slug,
        live_url: artifact.liveUrl,
      };

      if (isCollaborating && collaborationId) {
        // Collaboration artifact
        console.log("[COLLAB-DATA] 📝 Saving as collaboration artifact");
        
        artifactData = {
          ...artifactData,
          collaboration_id: collaborationId,
          participant_id: participantId,
          is_collaboration_artifact: true,
          user_id: isLeader ? this.userId : (localStorage.getItem("collaborationLeaderId") || this.userId), // Use leader's userId for collaborators
        };
      } else {
        // Regular user artifact
        console.log("[COLLAB-DATA] 📝 Saving as regular user artifact");
        
        if (!this.userId) {
          console.warn("[COLLAB-DATA] ⚠️ No user ID for regular artifact - queuing");
          this.queueOperation("uploadArtifact", artifact);
          return;
        }
        
        artifactData = {
          ...artifactData,
          user_id: this.userId,
          collaboration_id: null,
          participant_id: null,
          is_collaboration_artifact: false
        };
      }

      console.log("[COLLAB-DATA] 📋 Final artifact data:", artifactData);

      // Insert/update artifact in database
      const { data, error } = await this.supabase.from("artifacts").upsert([artifactData]);

      if (error) {
        console.error("[COLLAB-DATA] ❌ Artifact upload failed:", error);
        throw error;
      }

      console.log("[COLLAB-DATA] ✅ Artifact uploaded successfully");
      console.log("[COLLAB-DATA] 📋 Database response:", data);
      
    } catch (error) {
      console.error("[COLLAB-DATA] ❌ Exception during artifact upload:", error);
      this.queueOperation("uploadArtifact", artifact);
    }
  }

  // =================== Queue Management ===================
  queueOperation(operation, data) {
    this.syncQueue.push({ operation, data, timestamp: Date.now() });

    // Persist queue using memory module
    if (window.memory?.saveSyncQueue) {
      window.memory.saveSyncQueue(this.syncQueue);
    }
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

    // Update persisted queue using memory module
    if (window.memory?.saveSyncQueue) {
      window.memory.saveSyncQueue(this.syncQueue);
    }
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
    this.realtimeSubscriptions.forEach((subscription) => {
      if (subscription && typeof subscription.unsubscribe === "function") {
        subscription.unsubscribe();
      }
    });
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

// Auto-initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => syncManager.init());
} else {
  syncManager.init();
}


// Export for global access
window.syncManager = syncManager;

document.addEventListener("DOMContentLoaded", async () => {
  // Wait until window.SUPABASE_CONFIG is available
  while (!window.SUPABASE_CONFIG?.url || !window.SUPABASE_CONFIG?.key) {
    await new Promise((r) => setTimeout(r, 100));
  }

  // Check if collaboration is active before overwriting data
  const isCollabProtected = window.isCollaborationProtected
    ? window.isCollaborationProtected()
    : false;

  if (isCollabProtected) {
    console.log(
      "[SYNC] 🛡️ Collaboration active - skipping database data overwrite"
    );
    console.log("[SYNC] Preserving synchronized collaboration data");
    return; // Exit early to preserve collaboration data
  }

  // Enable sync process by clearing collaboration protection
  console.log("[SYNC] 🔄 Enabling database sync process");
  localStorage.removeItem("collaborationActive");
  localStorage.removeItem("COLLABORATION_ACTIVE");
  localStorage.removeItem("COLLABORATION_DATA_TIMESTAMP");
  console.log("[SYNC] ✅ Collaboration protection cleared - sync enabled");

  //fetching all the data of the user from database
  try {
    const [user, artifacts, chats, messages] = await Promise.all([
      getUserData(),
      getUserArtifacts(),
      getUserChats(),
      getUserMessages(),
    ]);

    const messagesByChat = messages.reduce((acc, message) => {
      const chatId = message.chat_id;
      acc[chatId] = acc[chatId] || [];
      acc[chatId].push(message);
      return acc;
    }, {});

    //data stored to the local
    localStorage.setItem("bike_user_data", JSON.stringify({ user }));
    localStorage.setItem("userPreferences", JSON.stringify(user.preferences));
    localStorage.setItem("userId", user?.id || "");
    localStorage.setItem("artifacts", JSON.stringify(artifacts));
    localStorage.setItem("chats", JSON.stringify(chats));
    localStorage.setItem("messagesByChat", JSON.stringify(messagesByChat));

    //the last chat from the db will be the active chat
    const lastChat = chats[chats.length - 1];
    if (lastChat?.id) {
      localStorage.setItem("activeChatId", lastChat.id.toString());
    }

    console.log("[MEMORY] LocalStorage updated with user session data.");
  } catch (err) {
    console.error("[MEMORY] Failed to fetch and store data:", err);
  }
});

// Manual sync trigger function
window.enableDatabaseSync = async function() {
  console.log("[SYNC] 🚀 Manually enabling database sync");
  
  // Clear collaboration protection
  localStorage.removeItem("collaborationActive");
  localStorage.removeItem("COLLABORATION_ACTIVE");
  localStorage.removeItem("COLLABORATION_DATA_TIMESTAMP");
  
  // Initialize sync if not already done
  if (window.syncManager && !window.syncManager.isInitialized) {
    await window.syncManager.init();
  }
  
  // Process any queued operations
  if (window.syncManager && window.syncManager.syncQueue.length > 0) {
    console.log("[SYNC] 📋 Processing queued operations:", window.syncManager.syncQueue.length);
    await window.syncManager.processQueue();
  }
  
  // Perform initial sync
  if (window.syncManager && window.syncManager.isOnline) {
    console.log("[SYNC] 🔄 Performing initial sync");
    await window.syncManager.performInitialSync();
  }
  
  console.log("[SYNC] ✅ Database sync enabled and processing");
  return { success: true, message: "Database sync enabled" };
};

// Test function to check artifact sync
window.testArtifactSync = async function() {
  console.log("[SYNC] 🧪 Testing artifact sync...");
  
  // Check sync status
  const status = window.syncManager?.getStatus();
  console.log("[SYNC] 📊 Sync status:", status);
  
  // Check if collaboration protection is active
  const isCollabProtected = window.isCollaborationProtected
    ? window.isCollaborationProtected()
    : false;
  console.log("[SYNC] 🛡️ Collaboration protection:", isCollabProtected);
  
  // Check current artifacts
  const artifacts = window.context?.getArtifacts() || [];
  console.log("[SYNC] 📋 Current artifacts:", artifacts.length);
  
  // Try to create a test artifact
  if (window.artifactsModule?.createArtifact) {
    console.log("[SYNC] 🆕 Creating test artifact...");
    const testArtifact = window.artifactsModule.createArtifact(
      "Test artifact content for sync testing",
      "test-message-id",
      "text"
    );
    console.log("[SYNC] ✅ Test artifact created:", testArtifact?.id);
    
    // Wait a bit for sync to process
    setTimeout(() => {
      console.log("[SYNC] 📋 Artifacts after creation:", window.context?.getArtifacts()?.length || 0);
      console.log("[SYNC] 📋 Sync queue length:", window.syncManager?.syncQueue?.length || 0);
    }, 2000);
  } else {
    console.error("[SYNC] ❌ Artifacts module not available");
  }
  
  return { success: true, message: "Artifact sync test completed" };
};
