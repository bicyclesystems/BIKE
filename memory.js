const memoryEvents = new EventTarget();

function dispatchDataChange(type, data) {
  memoryEvents.dispatchEvent(new CustomEvent('dataChanged', { detail: { type, data } }));
}

class MemorySystem {
  constructor() {
    this.isOnline = navigator.onLine;
    this.isInitialized = false;
    this.supabase = null;
    this.userId = null;
    this.syncQueue = [];
    this.realtimeSubscriptions = new Map();

    window.addEventListener("online", () => this.handleOnline());
    window.addEventListener("offline", () => this.handleOffline());

    this.setupMemoryEventListeners().catch((error) => {
      console.warn("[MEMORY] Failed to setup memory event listeners:", error);
    });
  }

  async setupMemoryEventListeners() {
    memoryEvents.addEventListener("dataChanged", this.handleDataChange);
  }

  handleDataChange(event) {
    const { type, data } = event.detail;

    if (!this.isOnline || !this.isInitialized) return;

    const handlers = {
      chat: () => this.uploadChat(data),
      message: () => this.uploadMessage(data.chatId, data.message),
      artifact: () => this.uploadArtifact(data),
      userPreferences: () => this.syncUserPreferences(data),
      all: () => this.performPartialSync(data)
    };

    handlers[type]?.();
  }

  async performPartialSync(data) {
    const syncLimits = { chats: 5, artifacts: 10 };
    
    for (const [type, limit] of Object.entries(syncLimits)) {
      if (data[type]?.length) {
        const recent = data[type].slice(0, limit);
        for (const item of recent) {
          await this[`upload${type.charAt(0).toUpperCase() + type.slice(1)}`](item);
        }
      }
    }
  }

  async initializeBackground(session) {
    if (session && window.supabase) {
      try {
        await this.initializeWithAuth(window.supabase, session);
        console.log('[MEMORY] Background sync complete');
      } catch (err) {
        console.warn('[MEMORY] Background sync failed:', err);
      }
    } else {
      console.log('[MEMORY] Initializing memory system in offline mode');
      this.init();
    }
  }

  async initializeWithAuth(supabaseClient, session) {
    try {
      this.supabase = supabaseClient;

      if (session.user) {
        this.userId = session.user.id;
        localStorage.setItem("userId", this.userId);
        window.userId = this.userId;
      }

      await this.initializeUser();

      if (this.isOnline) {
        await this.performInitialSync();
      }

      await this.setupRealtime();
      return true;
    } catch (error) {
      console.error("[MEMORY] Auth initialization failed:", error);
      return false;
    }
  }

  async initializeUser() {
    if (!this.supabase || !this.isOnline) {
      this.userId = localStorage.getItem("userId");
      if (this.userId) {
        console.log("[SYNC] User loaded from localStorage (offline):", this.userId);
      }
      return;
    }

    try {
      if (!this.userId) {
        console.error("[SYNC] No user ID available");
        return;
      }

      const { data: existingUser } = await this.supabase
        .from("users")
        .select("id, preferences")
        .eq("id", this.userId)
        .single();

      const currentPrefs = window.user?.getUserPreferences() || {};
      
      if (existingUser) {
        if (Object.keys(currentPrefs).length > 0) {
          await this.syncUserPreferences(currentPrefs);
        }
      } else {
        const { error } = await this.supabase.from("users").insert([{
          id: this.userId,
          preferences: currentPrefs,
        }]);

        if (error && !error.message.includes("duplicate")) {
          throw error;
        }
      }

      window.userId = this.userId;
    } catch (error) {
      console.error("[SYNC] User initialization failed:", error);
      this.userId = localStorage.getItem("userId");
    }
  }

  async setupRealtime() {
    if (!this.supabase || !this.userId) return;

    try {
      const channels = [
        { name: "chats", table: "chats" },
        { name: "messages", table: "messages" },
        { name: "artifacts", table: "artifacts" }
      ];

      for (const { name, table } of channels) {
        const subscription = this.supabase
          .channel(`${name}_channel`)
          .on("postgres_changes", { event: "*", schema: "public", table }, 
              (payload) => this.handleRealtimeChange(table, payload))
          .subscribe();
        
        this.realtimeSubscriptions.set(name, subscription);
      }
    } catch (error) {
      console.error("[SYNC] Real-time setup failed:", error);
    }
  }

  handleRealtimeChange(table, payload) {
    const handlers = {
      INSERT: () => this.handleRealtimeInsert(table, payload.new),
      UPDATE: () => this.handleRealtimeInsert(table, payload.new),
      DELETE: () => this.handleRealtimeDelete(table, payload.old)
    };

    handlers[payload.eventType]?.();
  }

  handleRealtimeInsert(table, record) {
    const handlers = {
      chats: () => this.mergeChat(record),
      messages: () => this.mergeMessage(record),
      artifacts: () => this.mergeArtifact(record)
    };

    handlers[table]?.();
  }

  handleRealtimeDelete(table, record) {
    const handlers = {
      chats: () => this.removeChatFromLocalState(record.id),
      messages: () => this.removeMessageFromLocalState(record.id),
      artifacts: () => this.removeArtifactFromLocalState(record.id)
    };

    handlers[table]?.();
  }

  mergeChat(serverChat) {
    const chat = {
      id: serverChat.id,
      title: serverChat.title,
      description: serverChat.description || "",
      timestamp: serverChat.timestamp,
      endTime: serverChat.endTime,
    };

    this.updateLocalData('chat', chat);
  }

  mergeMessage(serverMessage) {
    const message = {
      role: serverMessage.role,
      content: serverMessage.content,
      metadata: serverMessage.metadata || {},
    };

    const chatId = serverMessage.chat_id;
    
    if (window.chat?.saveChats) {
      const chat = window.chat?.getChats()?.find(c => c.id === chatId);
      const existingMessages = chat?.messages || [];
      const exists = existingMessages.some(m => 
        m.role === message.role && 
        m.content === message.content &&
        Math.abs(new Date(m.metadata.timestamp || 0) - new Date(serverMessage.created_at)) < 1000
      );

      if (!exists) {
        const chats = window.chat?.getChats() || [];
        const chatIndex = chats.findIndex(c => c.id === chatId);
        if (chatIndex !== -1) {
          if (!chats[chatIndex].messages) {
            chats[chatIndex].messages = [];
          }
          chats[chatIndex].messages.push(message);
          window.chat.saveChats();
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

    if (window.artifactsModule?.saveArtifacts) {
      window.artifactsModule.saveArtifacts();
    }
  }

  removeChatFromLocalState(chatId) {
    this.removeFromLocalData('chat', chatId);
  }

  removeMessageFromLocalState(messageId) {
  }

  removeArtifactFromLocalState(artifactId) {
    this.removeFromLocalData('artifact', artifactId);
  }

  updateLocalData(type, data) {
    const modules = {
      chat: { getter: 'getChats', setter: 'saveChats' },
      artifact: { getter: 'getArtifacts', setter: 'saveArtifacts' }
    };

    const module = type === 'chat' ? window.chat : window.artifactsModule;
    const config = modules[type];
    
    if (module?.[config.getter]) {
      const localData = [...(module[config.getter]() || [])];
      const existingIndex = localData.findIndex(item => item.id === data.id);

      if (existingIndex >= 0) {
        localData[existingIndex] = data;
      } else {
        localData.push(data);
      }

      const dataArray = module[config.getter]();
      if (dataArray) {
        dataArray.length = 0;
        dataArray.push(...localData);
      }
      
      module[config.setter]?.();
    }
  }

  removeFromLocalData(type, id) {
    const modules = {
      chat: { getter: 'getChats', setter: 'saveChats' },
      artifact: { getter: 'getArtifacts', setter: 'saveArtifacts' }
    };

    const module = type === 'chat' ? window.chat : window.artifactsModule;
    const config = modules[type];
    
    if (module?.[config.getter]) {
      const localData = (module[config.getter]() || []).filter(item => item.id !== id);
      const dataArray = module[config.getter]();
      
      if (dataArray) {
        dataArray.length = 0;
        dataArray.push(...localData);
      }
      
      module[config.setter]?.();
    }
  }

  async deleteFromDatabase(type, id) {
    if (!this.isInitialized) {
      console.warn(`[SYNC] Cannot delete ${type} from database - not initialized`);
      return false;
    }

    try {
      const deleteOrder = {
        chat: ['messages', 'artifacts', 'chats'],
        message: ['messages'],
        artifact: ['artifacts']
      };

      const tables = deleteOrder[type];
      for (const table of tables) {
        const { error } = await this.supabase
          .from(table)
          .delete()
          .eq(type === 'chat' ? 'chat_id' : 'id', id);

        if (error) {
          console.error(`[SYNC] Failed to delete from ${table}:`, error);
          throw error;
        }
      }

      console.log(`[SYNC] Successfully deleted ${type} ${id} from database`);
      return true;
    } catch (error) {
      console.error(`[SYNC] Error deleting ${type} from database:`, error);
      return false;
    }
  }

  async deleteChatFromDatabase(chatId) {
    return this.deleteFromDatabase('chat', chatId);
  }

  async deleteMessageFromDatabase(messageId) {
    return this.deleteFromDatabase('message', messageId);
  }

  async deleteArtifactFromDatabase(artifactId) {
    return this.deleteFromDatabase('artifact', artifactId);
  }

  async performInitialSync() {
    if (!this.supabase || !this.userId) return;

    try {
      await this.syncChats();
      await this.syncArtifacts();
      await this.processQueue();
    } catch (error) {
      console.error("[SYNC] Initial sync failed:", error);
    }
  }

  async syncChats() {
    if (!this.supabase || !this.userId) {
      console.warn("[SYNC] syncChats: Missing supabase client or userId");
      return;
    }

    const [serverChats, serverMessages] = await Promise.all([
      this.supabase.from("chats").select("*").eq("user_id", this.userId).order("timestamp", { ascending: false }),
      this.supabase.from("messages").select("*").eq("user_id", this.userId).order("created_at", { ascending: true })
    ]);

    if (serverChats.error) throw serverChats.error;
    if (serverMessages.error) throw serverMessages.error;

    const messagesByChat = this.groupMessagesByChat(serverMessages.data);
    const mergedChats = this.mergeServerDataWithLocal('chat', serverChats.data, messagesByChat);
    
    this.updateLocalDataBulk('chat', mergedChats);
    await this.uploadLocalOnlyData('chat', serverChats.data, messagesByChat);
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

    const mergedArtifacts = this.mergeServerDataWithLocal('artifact', serverArtifacts);
    this.updateLocalDataBulk('artifact', mergedArtifacts);
    await this.uploadLocalOnlyData('artifact', serverArtifacts);
  }

  groupMessagesByChat(messages) {
    const messagesByChat = {};
    messages.forEach((msg) => {
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
    return messagesByChat;
  }

  mergeServerDataWithLocal(type, serverData, additionalData = null) {
    const localData = this.getLocalData(type);
    const mergedData = new Map();

    localData.forEach(item => mergedData.set(item.id, { ...item }));

    serverData.forEach(serverItem => {
      if (type === 'chat' && additionalData) {
        const serverMessages = additionalData[serverItem.id] || [];
        const localMessages = mergedData.get(serverItem.id)?.messages || [];
        
        const allMessages = [...localMessages];
        serverMessages.forEach(serverMsg => {
          const exists = localMessages.some(localMsg =>
            localMsg.role === serverMsg.role && localMsg.content === serverMsg.content
          );
          if (!exists) {
            allMessages.push(serverMsg);
          }
        });

        mergedData.set(serverItem.id, {
          id: serverItem.id,
          title: serverItem.title,
          description: serverItem.description || "",
          timestamp: serverItem.timestamp,
          endTime: serverItem.endTime,
          messages: allMessages
        });
      } else {
        const artifact = {
          id: serverItem.id,
          chatId: serverItem.chat_id,
          title: serverItem.title,
          type: serverItem.type,
          versions: serverItem.versions || [],
          updatedAt: serverItem.updated_at,
        };

        const existing = mergedData.get(artifact.id);
        if (!existing || new Date(artifact.updatedAt) > new Date(existing.updatedAt || 0)) {
          mergedData.set(artifact.id, artifact);
        }
      }
    });

    return Array.from(mergedData.values());
  }

  getLocalData(type) {
    const modules = {
      chat: () => window.chat?.getChats() || [],
      artifact: () => window.artifactsModule?.getArtifacts() || []
    };
    return modules[type]();
  }

  updateLocalDataBulk(type, data) {
    const modules = {
      chat: () => window.chat?.getChats(),
      artifact: () => window.artifactsModule?.getArtifacts()
    };

    const dataArray = modules[type]();
    if (dataArray) {
      dataArray.length = 0;
      dataArray.push(...data);
    }

    if (type === 'chat' && data.length > 0) {
      const currentActiveChatId = window.chat?.getActiveChatId();
      if (!currentActiveChatId) {
        console.log("[SYNC] Setting active chat to first available chat:", data[0].id);
        window.chat?.switchChat(data[0].id);
      }
    }
  }

  async uploadLocalOnlyData(type, serverData, additionalData = null) {
    const localData = this.getLocalData(type);
    const serverIds = new Set(serverData.map(item => item.id));
    const localOnlyData = localData.filter(item => !serverIds.has(item.id));

    for (const item of localOnlyData) {
      if (type === 'chat') {
        await this.uploadChat(item);
        if (item.messages?.length > 0) {
          for (const message of item.messages) {
            await this.uploadMessage(item.id, message);
          }
        }
      } else {
        await this.uploadArtifact(item);
      }
    }

    if (type === 'chat' && additionalData) {
      await this.uploadLocalOnlyMessages(serverIds, additionalData);
    }
  }

  async uploadLocalOnlyMessages(serverChatIds, messagesByChat) {
    const localChats = this.getLocalData('chat');
    const localMessagesByChat = {};
    
    localChats.forEach(chat => {
      if (chat.messages) {
        localMessagesByChat[chat.id] = chat.messages;
      }
    });

    for (const [chatId, localMessages] of Object.entries(localMessagesByChat)) {
      if (!serverChatIds.has(chatId)) continue;
      
      const serverMessages = messagesByChat[chatId] || [];
      const localOnlyMessages = localMessages.filter(localMsg =>
        !serverMessages.some(serverMsg =>
          serverMsg.role === localMsg.role && serverMsg.content === serverMsg.content
        )
      );

      for (const message of localOnlyMessages) {
        await this.uploadMessage(chatId, message);
      }
    }
  }

  async uploadChat(chat) {
    if (!this.supabase || !this.userId) {
      this.queueOperation("uploadChat", chat);
      return;
    }

    try {
      const { error } = await this.supabase.from("chats").insert([{
        id: chat.id,
        user_id: this.userId,
        title: chat.title,
        description: chat.description || "",
        timestamp: chat.timestamp,
        endTime: chat.endTime,
      }]);

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
      const { error } = await this.supabase.from("messages").insert([{
        chat_id: chatId,
        user_id: this.userId,
        role: message.role,
        content: message.content,
        metadata: message.metadata || {},
        message_id: message.message_id,
      }]);

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
      const { error } = await this.supabase.from("artifacts").upsert([{
        id: artifact.id,
        user_id: this.userId,
        chat_id: artifact.chatId,
        title: artifact.title,
        type: artifact.type,
        versions: artifact.versions || [],
      }]);

      if (error) throw error;
    } catch (error) {
      console.error("[SYNC] Artifact upload failed:", error);
      this.queueOperation("uploadArtifact", artifact);
    }
  }

  queueOperation(operation, data) {
    this.syncQueue.push({ operation, data, timestamp: Date.now() });
  }

  async processQueue() {
    if (this.syncQueue.length === 0) return;

    console.log(`[SYNC] Processing ${this.syncQueue.length} queued operations...`);

    const queue = [...this.syncQueue];
    this.syncQueue = [];

    const operationHandlers = {
      uploadChat: (data) => this.uploadChat(data),
      uploadMessage: (data) => this.uploadMessage(data.chatId, data.message),
      uploadArtifact: (data) => this.uploadArtifact(data)
    };

    for (const { operation, data } of queue) {
      try {
        await operationHandlers[operation]?.(data);
      } catch (error) {
        console.error(`[SYNC] Queue operation ${operation} failed:`, error);
        this.queueOperation(operation, data);
      }
    }
  }

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

    for (const subscription of this.realtimeSubscriptions.values()) {
      subscription.unsubscribe();
    }
    this.realtimeSubscriptions.clear();
  }

  async syncUserPreferences(preferences) {
    if (!this.supabase || !this.userId || !this.isOnline) {
      console.log("[SYNC] Cannot sync preferences - offline or not initialized");
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
    };
  }
}

const memoryManager = new MemorySystem();

window.memoryManager = memoryManager;

window.memory = {
  events: memoryEvents
};
