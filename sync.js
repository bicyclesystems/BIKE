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
    this.realtimeSubscriptions = [];
    this.isProcessingQueue = false;
    this.lastSyncTime = null;
    this.retryAttempts = 0;
    this.maxRetries = 3;
    this.retryDelay = 1000;

    // Set up event listeners for online/offline
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());

    // Set up memory event listeners asynchronously
    this.setupMemoryEventListeners().catch((error) => {
      console.warn('[SYNC] Failed to setup memory event listeners:', error);
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
    window.memory.events.addEventListener('dataChanged', this.handleDataChange);
    console.log('[SYNC] Memory event listeners established');
  }

  handleDataChange(event) {
    const { type, data } = event.detail;

    if (!this.isOnline || !this.isInitialized) return;

    switch (type) {
      case 'chat':
        this.uploadChat(data);
        break;
      case 'message':
        this.uploadMessage(data.chatId, data.message);
        break;
      case 'artifact':
        this.uploadArtifact(data);
        break;
      case 'userPreferences':
        this.syncUserPreferences(data);
        break;
      case 'all':
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
      if (window.memory && typeof window.memory.on === 'function') {
        window.memory.on('dataChanged', (data) => this.handleDataChange(data));
        window.memory.on('artifactChanged', (artifact) => this.handleArtifactChange(artifact));
      }

      // If no Supabase config, run offline mode only
      if (!window.SUPABASE_CONFIG) {
        this.isOfflineOnly = true;
        this.userId = localStorage.getItem('bike_offline_user_id') || 'offline_' + Date.now();
        localStorage.setItem('bike_offline_user_id', this.userId);
        this.isInitialized = true;
        return;
      }

      try {
        // Don't create Supabase client here - let auth system provide it
        // This ensures we use the same authenticated session
        this.isInitialized = true;
        console.log('[SYNC] Basic initialization completed, waiting for auth');
      } catch (error) {
        this.isOfflineOnly = true;
        this.sessionId = 'fallback_' + Date.now();
        this.userId = localStorage.getItem('bike_fallback_user_id') || this.sessionId;
        localStorage.setItem('bike_fallback_user_id', this.userId);
        this.isInitialized = true;
      }
    } catch (error) {
      console.error('[SYNC] Initialization failed:', error);
      this.isOfflineOnly = true;
      this.sessionId = 'emergency_' + Date.now();
      this.userId = localStorage.getItem('bike_emergency_user_id') || this.sessionId;
      localStorage.setItem('bike_emergency_user_id', this.userId);
      this.isInitialized = true;
    }
  }

  // =================== Authentication Integration ===================
  async initializeWithAuth(supabaseClient, session) {
    try {
      console.log('[SYNC] Initializing with authenticated session');

      this.supabase = supabaseClient;
      this.sessionId = session.access_token;

      // Get user ID from session
      if (session.user) {
        this.userId = session.user.id;
        localStorage.setItem('userId', this.userId);
        window.userId = this.userId;
        console.log('[SYNC] User ID set from session:', this.userId);
      }

      // Initialize user in database
      await this.initializeUser();

      // Perform initial sync
      if (this.isOnline) {
        await this.performInitialSync();
      }

      // Set up real-time subscriptions
      await this.setupRealtime();

      console.log('[SYNC] Full sync initialization completed');
      return true;
    } catch (error) {
      console.error('[SYNC] Auth initialization failed:', error);
      return false;
    }
  }

  // =================== User Management ===================

  async initializeUser() {
    if (!this.supabase || !this.isOnline) {
      // If offline, try to load userId from localStorage
      this.userId = localStorage.getItem('userId');
      if (this.userId) {
        console.log('[SYNC] User loaded from localStorage (offline):', this.userId);
      }
      return;
    }

    try {
      // Use the user ID from authentication (already set in initializeWithAuth)
      if (!this.userId) {
        console.error('[SYNC] No user ID available');
        return;
      }

      // Check if user exists and get their preferences using the auth user ID
      const { data: existingUser } = await this.supabase
        .from('users')
        .select('id, preferences')
        .eq('id', this.userId)
        .single();

      if (existingUser) {
        // Sync user preferences from database using memory module
        if (existingUser.preferences && window.memory?.saveUserPreferences) {
          window.memory.saveUserPreferences(existingUser.preferences);
        }

        console.log('[SYNC] Existing user found:', this.userId);
      } else {
        // Create new user with the authenticated user ID
        const currentPrefs = window.memory?.getUserPreferences() || {};
        const { error } = await this.supabase.from('users').insert([
          {
            id: this.userId,
            preferences: currentPrefs,
          },
        ]);

        if (error && !error.message.includes('duplicate')) {
          throw error;
        }
        console.log('[SYNC] New user created:', this.userId);
      }

      // Store in global scope for easy access
      window.userId = this.userId;
    } catch (error) {
      console.error('[SYNC] User initialization failed:', error);
      // Try to load from localStorage as fallback
      this.userId = localStorage.getItem('userId');
      if (this.userId) {
        console.log('[SYNC] Fallback to localStorage user:', this.userId);
      }
    }
  }

  // =================== Real-time Setup ===================
  async setupRealtime() {
    if (!this.supabase || !this.userId) return;

    try {
      // Subscribe to chats
      const chatsSubscription = this.supabase
        .channel('chats_channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, (payload) =>
          this.handleRealtimeChange('chats', payload)
        )
        .subscribe();

      // Subscribe to messages
      const messagesSubscription = this.supabase
        .channel('messages_channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) =>
          this.handleRealtimeChange('messages', payload)
        )
        .subscribe();

      // Subscribe to artifacts
      const artifactsSubscription = this.supabase
        .channel('artifacts_channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'artifacts' }, (payload) =>
          this.handleRealtimeChange('artifacts', payload)
        )
        .subscribe();

      this.realtimeSubscriptions.set('chats', chatsSubscription);
      this.realtimeSubscriptions.set('messages', messagesSubscription);
      this.realtimeSubscriptions.set('artifacts', artifactsSubscription);

      console.log('[SYNC] Real-time subscriptions established');
    } catch (error) {
      console.error('[SYNC] Real-time setup failed:', error);
    }
  }

  handleRealtimeChange(table, payload) {
    console.log(`[SYNC] Real-time change in ${table}:`, payload);

    switch (payload.eventType) {
      case 'INSERT':
        this.handleRealtimeInsert(table, payload.new);
        break;
      case 'UPDATE':
        this.handleRealtimeUpdate(table, payload.new);
        break;
      case 'DELETE':
        this.handleRealtimeDelete(table, payload.old);
        break;
    }
  }

  handleRealtimeInsert(table, record) {
    switch (table) {
      case 'chats':
        this.mergeChat(record);
        break;
      case 'messages':
        this.mergeMessage(record);
        break;
      case 'artifacts':
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
      case 'chats':
        this.removeChatFromLocalState(record.id);
        break;
      case 'messages':
        this.removeMessageFromLocalState(record.id);
        break;
      case 'artifacts':
        this.removeArtifactFromLocalState(record.id);
        break;
    }
  }

  // =================== Data Merging ===================
  mergeChat(serverChat) {
    const chat = {
      id: serverChat.id,
      title: serverChat.title,
      timestamp: serverChat.timestamp,
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
    };

    const chatId = serverMessage.chat_id;

    // Use memory module to save the message
    if (window.memory?.saveMessage) {
      // Check if message already exists to prevent duplicates
      const existingMessages = window.context?.getMessagesByChat()[chatId] || [];
      const exists = existingMessages.some(
        (m) =>
          m.role === message.role &&
          m.content === message.content &&
          Math.abs(new Date(m.metadata.timestamp || 0) - new Date(serverMessage.created_at)) < 1000
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
    console.log(`[SYNC] Removing chat ${chatId} from local state only`);
    const localChats = (window.context?.getChats() || []).filter((c) => c.id !== chatId);
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
    console.log(
      `[SYNC] Message deletion from local state not implemented (messageId: ${messageId})`
    );
  }

  removeArtifactFromLocalState(artifactId) {
    console.log(`[SYNC] Removing artifact ${artifactId} from local state only`);
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
      console.warn('[SYNC] Cannot delete chat from database - not initialized');
      return false;
    }

    try {
      console.log(`[SYNC] Deleting chat ${chatId} from database`);

      // Delete messages first (due to foreign key constraints)
      const { error: messagesError } = await this.supabase
        .from('messages')
        .delete()
        .eq('chat_id', chatId);

      if (messagesError) {
        console.error('[SYNC] Failed to delete messages from database:', messagesError);
        throw messagesError;
      }

      // Delete artifacts for this chat
      const { error: artifactsError } = await this.supabase
        .from('artifacts')
        .delete()
        .eq('chat_id', chatId);

      if (artifactsError) {
        console.error('[SYNC] Failed to delete artifacts from database:', artifactsError);
        throw artifactsError;
      }

      // Finally delete the chat itself
      const { error: chatError } = await this.supabase.from('chats').delete().eq('id', chatId);

      if (chatError) {
        console.error('[SYNC] Failed to delete chat from database:', chatError);
        throw chatError;
      }

      console.log(`[SYNC] Successfully deleted chat ${chatId} from database`);
      return true;
    } catch (error) {
      console.error('[SYNC] Error deleting chat from database:', error);
      return false;
    }
  }

  async deleteMessageFromDatabase(messageId) {
    if (!this.isInitialized) {
      console.warn('[SYNC] Cannot delete message from database - not initialized');
      return false;
    }

    try {
      console.log(`[SYNC] Deleting message ${messageId} from database`);

      const { error } = await this.supabase.from('messages').delete().eq('id', messageId);

      if (error) {
        console.error('[SYNC] Failed to delete message from database:', error);
        throw error;
      }

      console.log(`[SYNC] Successfully deleted message ${messageId} from database`);
      return true;
    } catch (error) {
      console.error('[SYNC] Error deleting message from database:', error);
      return false;
    }
  }

  async deleteArtifactFromDatabase(artifactId) {
    if (!this.isInitialized) {
      console.warn('[SYNC] Cannot delete artifact from database - not initialized');
      return false;
    }

    try {
      console.log(`[SYNC] Deleting artifact ${artifactId} from database`);

      const { error } = await this.supabase.from('artifacts').delete().eq('id', artifactId);

      if (error) {
        console.error('[SYNC] Failed to delete artifact from database:', error);
        throw error;
      }

      console.log(`[SYNC] Successfully deleted artifact ${artifactId} from database`);
      return true;
    } catch (error) {
      console.error('[SYNC] Error deleting artifact from database:', error);
      return false;
    }
  }

  // =================== Initial Sync ===================
  async performInitialSync() {
    if (!this.supabase || !this.userId) return;

    try {
      console.log('[SYNC] Starting initial sync...');

      // Sync chats
      await this.syncChats();

      // Sync messages
      await this.syncMessages();

      // Sync artifacts
      await this.syncArtifacts();

      // Process any queued operations
      await this.processQueue();

      this.lastSyncTimestamp = new Date().toISOString();
      console.log('[SYNC] Initial sync completed');
    } catch (error) {
      console.error('[SYNC] Initial sync failed:', error);
    }
  }

  async syncChats() {
    const { data: serverChats, error } = await this.supabase
      .from('chats')
      .select('*')
      .eq('user_id', this.userId)
      .order('timestamp', { ascending: false });

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
        timestamp: serverChat.timestamp,
      });
    });

    const finalChats = Array.from(mergedChats.values()).sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );

    window.context?.setState({ chats: finalChats });

    // Ensure there's an active chat set
    const currentActiveChatId = window.context?.getActiveChatId();
    if (!currentActiveChatId && finalChats.length > 0) {
      console.log('[SYNC] Setting active chat to first available chat:', finalChats[0].id);
      window.context?.setActiveChat(finalChats[0].id);
    }

    // Upload any local-only chats to server
    const serverChatIds = new Set(serverChats.map((c) => c.id));
    const localOnlyChats = localChats.filter((chat) => !serverChatIds.has(chat.id));

    for (const chat of localOnlyChats) {
      await this.uploadChat(chat);
    }
  }

  async syncMessages() {
    const { data: serverMessages, error } = await this.supabase
      .from('messages')
      .select('*')
      .eq('user_id', this.userId)
      .order('created_at', { ascending: true });

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
          (localMsg) => localMsg.role === serverMsg.role && localMsg.content === serverMsg.content
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
          !serverMessages.some(
            (serverMsg) =>
              serverMsg.role === localMsg.role && serverMsg.content === localMsg.content
          )
      );

      for (const message of localOnlyMessages) {
        await this.uploadMessage(chatId, message);
      }
    }
  }

  async syncArtifacts() {
    const { data: serverArtifacts, error } = await this.supabase
      .from('artifacts')
      .select('*')
      .eq('user_id', this.userId)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    // Merge server artifacts with local artifacts
    const localArtifacts = [...(window.context?.getArtifacts() || [])];
    const mergedArtifacts = new Map();

    // Add local artifacts
    localArtifacts.forEach((artifact) => mergedArtifacts.set(artifact.id, artifact));

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
      if (!existing || new Date(artifact.updatedAt) > new Date(existing.updatedAt || 0)) {
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
    if (!this.supabase || !this.userId) {
      this.queueOperation('uploadChat', chat);
      return;
    }

    try {
      const { error } = await this.supabase.from('chats').insert([
        {
          id: chat.id,
          user_id: this.userId,
          title: chat.title,
          timestamp: chat.timestamp,
        },
      ]);

      if (error) throw error;
      console.log('[SYNC] Chat uploaded:', chat.id);
    } catch (error) {
      console.error('[SYNC] Chat upload failed:', error);
      this.queueOperation('uploadChat', chat);
    }
  }

  async uploadMessage(chatId, message) {
    if (!this.supabase || !this.userId) {
      this.queueOperation('uploadMessage', { chatId, message });
      return;
    }
    try {
      // ✅ Generate unique ID if not provided
      if (!message.message_id) {
        message.message_id = `${this.userId}_${chatId}_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 8)}`;
      }

      const messageId = message.message_id;

      // ✅ Check if message_id already exists in DB
      const { data: existing, error: checkError } = await this.supabase
        .from('messages')
        .select('message_id')
        .eq('message_id', message.message_id)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existing) {
        console.log(`[SKIP] Duplicate message_id: ${message.message_id}`);
        return;
      }

      // ✅ Attempt safe insert
      const { error } = await this.supabase.from('messages').insert([
        {
          chat_id: chatId,
          user_id: this.userId,
          role: message.role,
          content: message.content,
          message_id: messageId,
          metadata: message.metadata || {},
        },
      ]);

      if (error) {
        // ✅ Handle database constraint error for duplicates
        if (error.message.includes('duplicate key value') || error.code === '23505') {
          console.warn(`[SYNC] Duplicate message skipped by DB constraint: ${messageId}`);
          return;
        }

        throw error;
      }

      console.log('[SYNC] Message uploaded:', messageId);
    } catch (error) {
      console.error('[SYNC] Message upload failed:', error);
      this.queueOperation('uploadMessage', { chatId, message });
    }
  }

  async uploadArtifact(artifact) {
    if (!this.supabase || !this.userId) {
      this.queueOperation('uploadArtifact', artifact);
      return;
    }

    try {
      const { error } = await this.supabase.from('artifacts').upsert([
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
      console.log('[SYNC] Artifact uploaded:', artifact.id);
    } catch (error) {
      console.error('[SYNC] Artifact upload failed:', error);
      this.queueOperation('uploadArtifact', artifact);
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

    console.log(`[SYNC] Processing ${this.syncQueue.length} queued operations...`);

    const queue = [...this.syncQueue];
    this.syncQueue = [];

    for (const { operation, data } of queue) {
      try {
        switch (operation) {
          case 'uploadChat':
            await this.uploadChat(data);
            break;
          case 'uploadMessage':
            await this.uploadMessage(data.chatId, data.message);
            break;
          case 'uploadArtifact':
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
    console.log('[SYNC] Back online');
    this.isOnline = true;

    if (this.isInitialized && this.supabase) {
      await this.setupRealtime();
      await this.processQueue();
      await this.performInitialSync();
    }
  }

  handleOffline() {
    console.log('[SYNC] Gone offline');
    this.isOnline = false;

    // Unsubscribe from real-time
    this.realtimeSubscriptions.forEach((subscription) => {
      subscription.unsubscribe();
    });
    this.realtimeSubscriptions.clear();
  }

  // =================== User Preferences Sync ===================
  async syncUserPreferences(preferences) {
    if (!this.supabase || !this.userId || !this.isOnline) {
      console.log('[SYNC] Cannot sync preferences - offline or not initialized');
      return false;
    }

    try {
      const { error } = await this.supabase
        .from('users')
        .update({ preferences })
        .eq('id', this.userId);

      if (error) throw error;
      console.log('[SYNC] User preferences synced to database');
      return true;
    } catch (error) {
      console.error('[SYNC] Failed to sync user preferences:', error);
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
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => syncManager.init());
} else {
  syncManager.init();
}

// Export for global access
window.syncManager = syncManager;
