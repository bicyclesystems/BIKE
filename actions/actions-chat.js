// =================== Chat Actions ===================
// Actions related to chat/conversation management
// These actions correspond to operations handled by chat.js

const CHAT_ACTIONS = {
  'chat.create': {
    id: 'chat.create',
    name: 'Create New Chat',
    description: 'Create a new chat conversation with optional custom title, description, and duration',
    category: window.actions?.ACTION_CATEGORIES?.CHAT || 'chat',
    requiredParams: [],
    optionalParams: ['timestamp', 'title', 'description', 'endTime'],
    availableData: () => ({
      totalChats: window.context?.getChats().length || 0,
      maxChats: 50,
      defaultTitle: 'New Chat'
    }),
    handler: async (params = {}) => {
      const { timestamp, title, description, endTime } = params;
      
      // Create new chat logic moved from context
      window.context?.setContext({
        activeVersionIdxByArtifact: {},
        messages: [],
        activeMessageIndex: -1,
        activeView: null
      });
      
      const id = Date.now().toString();
      const chatTitle = title && typeof title === 'string' && title.trim() ? title.trim() : "New Chat";
      const chatDescription = description && typeof description === 'string' && description.trim() ? description.trim() : "";
      const chatTimestamp = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();
      const chat = { id, title: chatTitle, description: chatDescription, timestamp: chatTimestamp };
      
      if (endTime) {
        chat.endTime = new Date(endTime).toISOString();
      }
      
      const currentChats = window.context?.getChats() || [];
      const currentMessagesByChat = window.context?.getMessagesByChat() || {};
      
      window.context?.setContext({
        chats: [...currentChats, chat],
        messagesByChat: { ...currentMessagesByChat, [id]: [] }
      });
      window.memory?.saveAll();
      
      // Switch to the new chat
      await window.actions.executeAction('chat.switch', { chatId: id });
      
      return window.actions.createStandardizedResult(
        'chat.create',
        'Create New Chat',
        true,
        { 
          chatId: id, 
          chatTitle,
          chatDescription, 
          action: 'Created new chat',
          type: 'chat'
        },
        null,
        `Created new chat "${chatTitle}"${chatDescription ? ` with description "${chatDescription}"` : ''} with ID ${id}`
      );
    }
  },

  'chat.switch': {
    id: 'chat.switch',
    name: 'Switch Chat',
    description: 'Switch to a different chat conversation',
    category: window.actions?.ACTION_CATEGORIES?.CHAT || 'chat',
    requiredParams: ['chatId'],
    optionalParams: [],
    availableData: () => ({
      availableChats: (window.context?.getChats() || []).map(c => ({ id: c.id, title: c.title, description: c.description || '', timestamp: c.timestamp })),
      currentChatId: window.context?.getActiveChatId()
    }),
    handler: async (params) => {
      const { chatId } = params;
      const chat = (window.context?.getChats() || []).find(c => c.id === chatId);
      if (!chat) {
        return window.actions.createStandardizedResult(
          'chat.switch',
          'Switch Chat',
          false,
          {},
          'Chat not found',
          `Chat ${chatId} does not exist`
        );
      }
      // Switch chat logic moved from context
      if (window.context?.getActiveChatId()) {
        window.memory?.saveActiveView(window.context?.getActiveView() || null);
      }
      
      // Reset app state for chat
      window.context?.setContext({
        activeVersionIdxByArtifact: {},
        messages: [],
        activeMessageIndex: -1,
        activeView: null
      });
      
      window.context?.setActiveChat(chatId);
      
      const restoredView = window.memory?.loadActiveView();
      if (restoredView) {
        // Validate the restored view
        if (restoredView.type === 'artifact' && restoredView.data.artifactId) {
          const artifacts = window.context?.getArtifacts() || [];
          const artifact = artifacts.find(a => a.id === restoredView.data.artifactId && a.chatId === chatId);
          if (artifact) {
            window.context?.setContext({ activeView: restoredView });
          } else {
            window.context?.setContext({ activeView: null });
          }
        } else if (restoredView.type !== 'artifact') {
          // System views (calendar, etc.) are always valid
          window.context?.setContext({ activeView: restoredView });
        } else {
          window.context?.setContext({ activeView: null });
        }
      } else {
        window.context?.setContext({ activeView: null });
      }
      
      window.context?.clearUI();
      window.context?.loadChat();
      
      const messagesByChat = window.context?.getMessagesByChat() || {};
      const messages = messagesByChat[chatId] || [];
      if (messages.length === 0) {
        // Show input for new chats, but not if intro screen is active
        const introScreen = document.getElementById('intro');
        if (window.inputModule && !introScreen) {
          window.inputModule.show();
        }
      }
      
      // Render the current view (memory if activeView is null)
      if (window.views?.renderCurrentView) {
        window.views.renderCurrentView(false); // No transition when switching chats
      }
      
      return window.actions.createStandardizedResult(
        'chat.switch',
        'Switch Chat',
        true,
        { 
          chatId, 
          chatTitle: chat.title, 
          action: 'Switched to chat',
          type: 'chat'
        },
        null,
        `Switched to chat "${chat.title}"`
      );
    }
  },

  'chat.addMessage': {
    id: 'chat.addMessage',
    name: 'Add Message',
    description: 'Add a message to the current chat',
    category: window.actions?.ACTION_CATEGORIES?.CHAT || 'chat',
    requiredParams: ['role', 'content'],
    optionalParams: ['artifactIds'],
    availableData: () => ({
      currentChatId: window.context?.getActiveChatId(),
      messageCount: (window.context?.getMessages() || []).length
    }),
    handler: (params) => {
      const { role, content, artifactIds = {} } = params;
      if (window.messages && window.messages.addMessage) {
        window.messages.addMessage(role, content, { 
          artifactIds: Object.keys(artifactIds).length > 0 ? artifactIds : null 
        });
        return window.actions.createStandardizedResult(
          'chat.addMessage',
          'Add Message',
          true,
          { 
            role, 
            content, 
            action: 'Added message to chat',
            type: 'message'
          },
          null,
          `Added ${role} message to chat`
        );
      }
      return window.actions.createStandardizedResult(
        'chat.addMessage',
        'Add Message',
        false,
        {},
        'Chat module not available',
        'Chat module not available'
      );
    }
  },

  'chat.rename': {
    id: 'chat.rename',
    name: 'Rename Chat',
    description: 'Rename a chat conversation with a new title',
    category: window.actions?.ACTION_CATEGORIES?.CHAT || 'chat',
    requiredParams: ['title'],
    optionalParams: ['chatId'],
    availableData: () => {
      const activeChatId = window.context?.getActiveChatId();
      const chats = window.context?.getChats() || [];
      const currentChat = chats.find(c => c.id === activeChatId);
      
      return {
        currentChatId: activeChatId,
        currentChatTitle: currentChat?.title || 'Unknown',
        availableChats: chats.map(c => ({ id: c.id, title: c.title, description: c.description || '', timestamp: c.timestamp })),
        totalChats: chats.length
      };
    },
    handler: (params) => {
      const { title, chatId = null } = params;
      
      // Validate title
      if (!title || typeof title !== 'string') {
        return window.actions.createStandardizedResult(
          'chat.rename',
          'Rename Chat',
          false,
          {},
          'Title is required and must be a string',
          'Title is required and must be a string'
        );
      }
      
      const trimmedTitle = title.trim();
      if (trimmedTitle.length === 0) {
        return window.actions.createStandardizedResult(
          'chat.rename',
          'Rename Chat',
          false,
          {},
          'Title cannot be empty',
          'Chat title cannot be empty'
        );
      }
      
      // Use provided chatId or current active chat
      const targetChatId = chatId || window.context?.getActiveChatId();
      if (!targetChatId) {
        return window.actions.createStandardizedResult(
          'chat.rename',
          'Rename Chat',
          false,
          {},
          'No chat ID provided and no active chat',
          'No chat to rename - provide chatId or ensure there is an active chat'
        );
      }
      
      // Find the chat
      const chats = window.context?.getChats() || [];
      const chat = chats.find(c => c.id === targetChatId);
      if (!chat) {
        return window.actions.createStandardizedResult(
          'chat.rename',
          'Rename Chat',
          false,
          {},
          'Chat not found',
          `Chat ${targetChatId} does not exist`
        );
      }
      
      const oldTitle = chat.title;
      
      // Check if the title is actually different
      if (oldTitle === trimmedTitle) {
        return window.actions.createStandardizedResult(
          'chat.rename',
          'Rename Chat',
          false,
          {},
          'Title unchanged',
          `Chat title is already "${trimmedTitle}"`
        );
      }
      
      // Update the chat directly
      try {
        const chats = window.context?.getChats() || [];
        const chatIndex = chats.findIndex(c => c.id === targetChatId);
        
        const updatedChats = [...chats];
        updatedChats[chatIndex] = {
          ...updatedChats[chatIndex],
          title: trimmedTitle
        };
        
        // Update state
        window.context?.setContext({ chats: updatedChats });
        
        // Persist changes
        window.memory?.saveAll();
        
        // Re-render views to reflect the change
        if (window.views?.renderCurrentView) {
          window.views.renderCurrentView();
        }
        
        return window.actions.createStandardizedResult(
          'chat.rename',
          'Rename Chat',
          true,
          { 
            chatId: targetChatId,
            oldTitle,
            newTitle: trimmedTitle,
            action: 'Renamed chat',
            type: 'chat'
          },
          null,
          `Renamed chat from "${oldTitle}" to "${trimmedTitle}"`
        );
      } catch (error) {
        return window.actions.createStandardizedResult(
          'chat.rename',
          'Rename Chat',
          false,
          {},
          error.message,
          `Failed to rename chat: ${error.message}`
        );
      }
    }
  },

  'chat.setDescription': {
    id: 'chat.setDescription',
    name: 'Set Chat Description',
    description: 'Set or update a chat conversation description',
    category: window.actions?.ACTION_CATEGORIES?.CHAT || 'chat',
    requiredParams: ['description'],
    optionalParams: ['chatId'],
    availableData: () => {
      const activeChatId = window.context?.getActiveChatId();
      const chats = window.context?.getChats() || [];
      const currentChat = chats.find(c => c.id === activeChatId);
      
      return {
        currentChatId: activeChatId,
        currentChatTitle: currentChat?.title || 'Unknown',
        currentChatDescription: currentChat?.description || '',
        availableChats: chats.map(c => ({ id: c.id, title: c.title, description: c.description || '', timestamp: c.timestamp })),
        totalChats: chats.length
      };
    },
    handler: (params) => {
      const { description, chatId = null } = params;
      
      // Validate description (allow empty string to clear description)
      if (description !== null && typeof description !== 'string') {
        return window.actions.createStandardizedResult(
          'chat.setDescription',
          'Set Chat Description',
          false,
          {},
          'Description must be a string or null',
          'Description must be a string or null'
        );
      }
      
      const trimmedDescription = description ? description.trim() : "";
      
      // Use provided chatId or current active chat
      const targetChatId = chatId || window.context?.getActiveChatId();
      if (!targetChatId) {
        return window.actions.createStandardizedResult(
          'chat.setDescription',
          'Set Chat Description',
          false,
          {},
          'No chat ID provided and no active chat',
          'No chat to update - provide chatId or ensure there is an active chat'
        );
      }
      
      // Find the chat
      const chats = window.context?.getChats() || [];
      const chat = chats.find(c => c.id === targetChatId);
      if (!chat) {
        return window.actions.createStandardizedResult(
          'chat.setDescription',
          'Set Chat Description',
          false,
          {},
          'Chat not found',
          `Chat ${targetChatId} does not exist`
        );
      }
      
      const oldDescription = chat.description || "";
      
      // Check if the description is actually different
      if (oldDescription === trimmedDescription) {
        return window.actions.createStandardizedResult(
          'chat.setDescription',
          'Set Chat Description',
          false,
          {},
          'Description unchanged',
          `Chat description is already "${trimmedDescription}"`
        );
      }
      
      // Update the chat directly
      try {
        const chats = window.context?.getChats() || [];
        const chatIndex = chats.findIndex(c => c.id === targetChatId);
        
        const updatedChats = [...chats];
        updatedChats[chatIndex] = {
          ...updatedChats[chatIndex],
          description: trimmedDescription
        };
        
        // Update state
        window.context?.setContext({ chats: updatedChats });
        
        // Persist changes
        window.memory?.saveAll();
        
        // Re-render views to reflect the change
        if (window.views?.renderCurrentView) {
          window.views.renderCurrentView();
        }
        
        return window.actions.createStandardizedResult(
          'chat.setDescription',
          'Set Chat Description',
          true,
          { 
            chatId: targetChatId,
            chatTitle: chat.title,
            oldDescription,
            newDescription: trimmedDescription,
            action: 'Set chat description',
            type: 'chat'
          },
          null,
          trimmedDescription ? 
            `Set chat "${chat.title}" description to "${trimmedDescription}"` :
            `Cleared chat "${chat.title}" description`
        );
      } catch (error) {
        return window.actions.createStandardizedResult(
          'chat.setDescription',
          'Set Chat Description',
          false,
          {},
          error.message,
          `Failed to set chat description: ${error.message}`
        );
      }
    }
  },

  'chat.schedule': {
    id: 'chat.schedule',
    name: 'Schedule Chat',
    description: 'Schedule a new chat conversation with specific start and end times',
    category: window.actions?.ACTION_CATEGORIES?.CHAT || 'chat',
    requiredParams: ['startTime', 'endTime'],
    optionalParams: ['title', 'description'],
    availableData: () => ({
      totalChats: window.context?.getChats().length || 0,
      maxChats: 50,
      defaultTitle: 'Scheduled Chat'
    }),
    handler: async (params = {}) => {
      const { startTime, endTime, title, description } = params;
      
      // Validate required parameters
      if (!startTime || !endTime) {
        return window.actions.createStandardizedResult(
          'chat.schedule',
          'Schedule Chat',
          false,
          {},
          'startTime and endTime are required',
          'Both startTime and endTime must be provided'
        );
      }
      
      // Parse and validate times
      const start = new Date(startTime);
      const end = new Date(endTime);
      
      if (isNaN(start) || isNaN(end)) {
        return window.actions.createStandardizedResult(
          'chat.schedule',
          'Schedule Chat',
          false,
          {},
          'Invalid date format',
          'startTime and endTime must be valid ISO date strings'
        );
      }
      
      if (end <= start) {
        return window.actions.createStandardizedResult(
          'chat.schedule',
          'Schedule Chat',
          false,
          {},
          'End time must be after start time',
          'The end time must be later than the start time'
        );
      }
      
      // Calculate duration for display
      const durationText = window.chatView?.formatDuration?.(start, end) || 
        (() => {
          const durationMs = end - start;
          const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
          const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
          return durationHours > 0 ? `${durationHours}h ${durationMinutes}m` : `${durationMinutes}m`;
        })();
      
      // Create the scheduled chat
      const result = await window.actions.executeAction('chat.create', {
        timestamp: start.toISOString(),
        endTime: end.toISOString(),
        title: title || 'Scheduled Chat',
        description: description || ''
      });
      
      if (result.success) {
        return window.actions.createStandardizedResult(
          'chat.schedule',
          'Schedule Chat',
          true,
          { 
            chatId: result.result.chatId,
            chatTitle: result.result.chatTitle,
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            duration: durationText,
            action: 'Scheduled new chat',
            type: 'chat'
          },
          null,
          `Scheduled chat "${result.result.chatTitle}" for ${start.toLocaleString()} - ${end.toLocaleString()} (${durationText})`
        );
      } else {
        return window.actions.createStandardizedResult(
          'chat.schedule',
          'Schedule Chat',
          false,
          {},
          result.error || 'Failed to create scheduled chat',
          'Failed to create the scheduled chat'
        );
      }
    }
  },

  'chat.delete': {
    id: 'chat.delete',
    name: 'Delete Chat',
    description: 'Permanently delete a chat conversation and all its messages and artifacts',
    category: window.actions?.ACTION_CATEGORIES?.CHAT || 'chat',
    requiredParams: ['chatId'],
    optionalParams: ['confirmDelete'],
    availableData: () => ({
      availableChats: (window.context?.getChats() || []).map(c => ({ 
        id: c.id, 
        title: c.title, 
        timestamp: c.timestamp,
        messageCount: (window.context?.getMessagesByChat()[c.id] || []).length,
        artifactCount: (window.context?.getArtifacts() || []).filter(a => a.chatId === c.id).length
      })),
      currentChatId: window.context?.getActiveChatId(),
      totalChats: window.context?.getChats().length || 0
    }),
    handler: async (params) => {
      const { chatId, confirmDelete = false } = params;
      const chats = window.context?.getChats() || [];
      const chat = chats.find(c => c.id === chatId);
      
      if (!chat) {
        return window.actions.createStandardizedResult(
          'chat.delete',
          'Delete Chat',
          false,
          {},
          'Chat not found',
          `Chat ${chatId} does not exist`
        );
      }

      // Safety check - require confirmation for non-empty chats
      const messagesByChat = window.context?.getMessagesByChat() || {};
      const messages = messagesByChat[chatId] || [];
      const artifacts = (window.context?.getArtifacts() || []).filter(a => a.chatId === chatId);
      
      if ((messages.length > 0 || artifacts.length > 0) && !confirmDelete) {
        return window.actions.createStandardizedResult(
          'chat.delete',
          'Delete Chat',
          false,
          { 
            requiresConfirmation: true,
            chatTitle: chat.title,
            messageCount: messages.length,
            artifactCount: artifacts.length
          },
          'Confirmation required',
          `Chat "${chat.title}" contains ${messages.length} messages and ${artifacts.length} artifacts. Set confirmDelete=true to proceed.`
        );
      }

      // Prevent deleting the last chat
      if (chats.length <= 1) {
        return window.actions.createStandardizedResult(
          'chat.delete',
          'Delete Chat',
          false,
          {},
          'Cannot delete last chat',
          'Cannot delete the last remaining chat. Create a new chat first.'
        );
      }

      // Perform the deletion - logic moved from context
      try {
  

        // 1. Remove chat from chats array
        const updatedChats = chats.filter(c => c.id !== chatId);
        
        // 2. Remove all messages for this chat
        const currentMessagesByChat = window.context?.getMessagesByChat() || {};
        const updatedMessagesByChat = { ...currentMessagesByChat };
        delete updatedMessagesByChat[chatId];
        
        // 3. Remove all artifacts for this chat
        const currentArtifacts = window.context?.getArtifacts() || [];
        const updatedArtifacts = currentArtifacts.filter(a => a.chatId !== chatId);
        const deletedArtifactCount = currentArtifacts.length - updatedArtifacts.length;
        
        // 4. Clear action history for this chat
        window.actions?.clearActionHistory?.(chatId);
        
        // 5. Update state
        window.context?.setContext({
          chats: updatedChats,
          messagesByChat: updatedMessagesByChat,
          artifacts: updatedArtifacts
        });
        
        // 6. Handle active chat switching
        let newActiveChatId = null;
        if (window.context?.getActiveChatId() === chatId) {
          // Switch to the most recent chat or create a new one
          if (updatedChats.length > 0) {
            // Find the most recent chat by timestamp
            const sortedChats = updatedChats.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            newActiveChatId = sortedChats[0].id;
    
          } else {
            // This shouldn't happen due to our check above, but handle gracefully
    
            await window.actions.executeAction('chat.create', {});
            return window.actions.createStandardizedResult(
              'chat.delete',
              'Delete Chat',
              true,
              { 
                chatId,
                chatTitle: chat.title,
                deletedMessageCount: messages.length,
                deletedArtifactCount,
                action: 'Deleted chat and created new one',
                type: 'chat'
              },
              null,
              `Deleted chat "${chat.title}" and created new chat (last one deleted)`
            );
          }
        }
        
        // 7. Persist changes
        window.memory?.saveAll();
        
        // 8. Switch to new active chat if needed
        if (newActiveChatId) {
          await window.actions.executeAction('chat.switch', { chatId: newActiveChatId });
        } else {
          // If no chat to switch to, make sure view is updated
          window.context?.setContext({ activeView: null });
          if (window.views?.renderCurrentView) {
            window.views.renderCurrentView();
          }
        }
        

        
        return window.actions.createStandardizedResult(
          'chat.delete',
          'Delete Chat',
          true,
          { 
            chatId,
            chatTitle: chat.title,
            deletedMessageCount: messages.length,
            deletedArtifactCount,
            action: 'Deleted chat',
            type: 'chat'
          },
          null,
          `Deleted chat "${chat.title}" with ${messages.length} messages and ${deletedArtifactCount} artifacts`
        );
      } catch (error) {
        console.error(`[CHAT-ACTIONS] Error deleting chat:`, error);
        return window.actions.createStandardizedResult(
          'chat.delete',
          'Delete Chat',
          false,
          {},
          error.message,
          `Failed to delete chat: ${error.message}`
        );
      }
    }
  },

  'chat.share': {
    id: 'chat.share',
    name: 'Share Chat',
    description: 'Share chat link (coming soon)',
    category: window.actions?.ACTION_CATEGORIES?.CHAT || 'chat',
    requiredParams: [],
    optionalParams: [],
    availableData: () => ({}),
    handler: async () => {
      return window.actions.createStandardizedResult(
        'chat.share',
        'Share Chat',
        true,
        { 
          action: 'Coming soon',
          type: 'chat'
        },
        null,
        'Chat sharing coming soon!'
      );
    }
  }
};

// Register these actions with the core system
if (window.actions && window.actions.registerActions) {
  window.actions.registerActions(CHAT_ACTIONS);
}

// Also export for direct access
window.chatActions = CHAT_ACTIONS;

 