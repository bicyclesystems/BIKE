// =================== Central Actions Registry ===================
// This module contains the definitive list of all actions available in the app
// Actions are discoverable by both users and AI, with full context and metadata

// =================== Action Categories ===================

const ACTION_CATEGORIES = {
  CHAT: 'chat',
  ARTIFACTS: 'artifacts',
  VIEWS: 'views',
  AUTH: 'auth',
};

// =================== Action Execution Tracking ===================

// Global action history storage
const ACTION_HISTORY = {
  global: [], // All actions performed in current app session
  byChat: {}, // Actions per chat ID
  lastExecutedAction: null,
};

// Action tracking utilities
function trackActionExecution(actionResult) {
  const activeChatId = window.context?.getActiveChatId();
  const trackedAction = {
    ...actionResult,
    timestamp: new Date().toISOString(),
    chatId: activeChatId,
  };

  // Add to global history
  ACTION_HISTORY.global.push(trackedAction);

  // Add to chat-specific history
  if (activeChatId) {
    if (!ACTION_HISTORY.byChat[activeChatId]) {
      ACTION_HISTORY.byChat[activeChatId] = [];
    }
    ACTION_HISTORY.byChat[activeChatId].push(trackedAction);
  }

  // Keep only last N actions per context to prevent memory bloat
  const maxActions = 100;
  if (ACTION_HISTORY.global.length > maxActions) {
    ACTION_HISTORY.global = ACTION_HISTORY.global.slice(-maxActions);
  }

  if (activeChatId && ACTION_HISTORY.byChat[activeChatId].length > maxActions) {
    ACTION_HISTORY.byChat[activeChatId] = ACTION_HISTORY.byChat[activeChatId].slice(-maxActions);
  }

  return actionResult;
}

function getActionHistory(chatId = null) {
  if (chatId) {
    return ACTION_HISTORY.byChat[chatId] || [];
  }
  return ACTION_HISTORY.global;
}

function getLastActions(count = 5, chatId = null) {
  const history = getActionHistory(chatId);
  return history.slice(-count);
}

function clearActionHistory(chatId = null) {
  if (chatId) {
    ACTION_HISTORY.byChat[chatId] = [];
  } else {
    ACTION_HISTORY.global = [];
    ACTION_HISTORY.byChat = {};
    ACTION_HISTORY.lastExecutedAction = null;
  }
}

// Simplified result formatting
function createStandardizedResult(
  actionId,
  actionName,
  success,
  result = {},
  error = null,
  message = ''
) {
  return {
    actionId,
    actionName: actionName.toLowerCase(),
    success,
    timestamp: new Date().toISOString(),
    result: result || {},
    message: message || '',
    error: error || null,
  };
}

// =================== Actions Registry ===================

const ACTIONS_REGISTRY = {
  // =================== Chat Actions ===================

  'chat.create': {
    id: 'chat.create',
    name: 'Create New Chat',
    description: 'Create a new chat conversation with optional custom title',
    category: ACTION_CATEGORIES.CHAT,
    requiredParams: [],
    optionalParams: ['timestamp', 'title'],
    availableData: () => ({
      totalChats: window.context?.getChats().length || 0,
      maxChats: 50,
      defaultTitle: 'New Chat',
    }),
    handler: (params = {}) => {
      const { timestamp, title } = params;
      const chatId = window.context.createNewChat(timestamp, title);
      const chatTitle =
        title && typeof title === 'string' && title.trim() ? title.trim() : 'New Chat';

      return createStandardizedResult(
        'chat.create',
        'Create New Chat',
        true,
        {
          chatId,
          chatTitle,
          action: 'Created new chat',
          type: 'chat',
        },
        null,
        `Created new chat "${chatTitle}" with ID ${chatId}`
      );
    },
  },

  'chat.switch': {
    id: 'chat.switch',
    name: 'Switch Chat',
    description: 'Switch to a different chat conversation',
    category: ACTION_CATEGORIES.CHAT,
    requiredParams: ['chatId'],
    optionalParams: [],
    availableData: () => ({
      availableChats: (window.context?.getChats() || []).map((c) => ({
        id: c.id,
        title: c.title,
        timestamp: c.timestamp,
      })),
      currentChatId: window.context?.getActiveChatId(),
    }),
    handler: (params) => {
      const { chatId } = params;
      const chat = (window.context?.getChats() || []).find((c) => c.id === chatId);
      if (!chat) {
        return createStandardizedResult(
          'chat.switch',
          'Switch Chat',
          false,
          {},
          'Chat not found',
          `Chat ${chatId} does not exist`
        );
      }
      window.context.switchChat(chatId);
      return createStandardizedResult(
        'chat.switch',
        'Switch Chat',
        true,
        {
          chatId,
          chatTitle: chat.title,
          action: 'Switched to chat',
          type: 'chat',
        },
        null,
        `Switched to chat "${chat.title}"`
      );
    },
  },

  'chat.addMessage': {
    id: 'chat.addMessage',
    name: 'Add Message',
    description: 'Add a message to the current chat',
    category: ACTION_CATEGORIES.CHAT,
    requiredParams: ['role', 'content'],
    optionalParams: ['artifactIds'],
    availableData: () => ({
      currentChatId: window.context?.getActiveChatId(),
      messageCount: (window.context?.getMessages() || []).length,
    }),
    handler: (params) => {
      const { role, content, artifactIds = {} } = params;
      if (window.messages && window.messages.addMessage) {
        window.messages.addMessage(role, content, {
          artifactIds: Object.keys(artifactIds).length > 0 ? artifactIds : null,
        });
        return createStandardizedResult(
          'chat.addMessage',
          'Add Message',
          true,
          {
            role,
            content,
            action: 'Added message to chat',
            type: 'message',
          },
          null,
          `Added ${role} message to chat`
        );
      }
      return createStandardizedResult(
        'chat.addMessage',
        'Add Message',
        false,
        {},
        'Chat module not available',
        'Chat module not available'
      );
    },
  },

  'chat.rename': {
    id: 'chat.rename',
    name: 'Rename Chat',
    description: 'Rename a chat conversation with a new title',
    category: ACTION_CATEGORIES.CHAT,
    requiredParams: ['title'],
    optionalParams: ['chatId'],
    availableData: () => {
      const activeChatId = window.context?.getActiveChatId();
      const chats = window.context?.getChats() || [];
      const currentChat = chats.find((c) => c.id === activeChatId);

      return {
        currentChatId: activeChatId,
        currentChatTitle: currentChat?.title || 'Unknown',
        availableChats: chats.map((c) => ({
          id: c.id,
          title: c.title,
          timestamp: c.timestamp,
        })),
        totalChats: chats.length,
      };
    },
    handler: (params) => {
      const { title, chatId = null } = params;

      // Validate title
      if (!title || typeof title !== 'string') {
        return createStandardizedResult(
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
        return createStandardizedResult(
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
        return createStandardizedResult(
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
      const chat = chats.find((c) => c.id === targetChatId);
      if (!chat) {
        return createStandardizedResult(
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
        return createStandardizedResult(
          'chat.rename',
          'Rename Chat',
          false,
          {},
          'Title unchanged',
          `Chat title is already "${trimmedTitle}"`
        );
      }

      // Perform the rename
      if (!window.context?.renameChat) {
        return createStandardizedResult(
          'chat.rename',
          'Rename Chat',
          false,
          {},
          'Rename function not available',
          'Chat rename functionality is not available'
        );
      }

      const success = window.context.renameChat(targetChatId, trimmedTitle);
      if (success) {
        return createStandardizedResult(
          'chat.rename',
          'Rename Chat',
          true,
          {
            chatId: targetChatId,
            oldTitle,
            newTitle: trimmedTitle,
            action: 'Renamed chat',
            type: 'chat',
          },
          null,
          `Renamed chat from "${oldTitle}" to "${trimmedTitle}"`
        );
      } else {
        return createStandardizedResult(
          'chat.rename',
          'Rename Chat',
          false,
          {},
          'Rename operation failed',
          'Failed to rename chat - see console for details'
        );
      }
    },
  },

  'chat.delete': {
    id: 'chat.delete',
    name: 'Delete Chat',
    description: 'Permanently delete a chat conversation and all its messages and artifacts',
    category: ACTION_CATEGORIES.CHAT,
    requiredParams: ['chatId'],
    optionalParams: ['confirmDelete'],
    availableData: () => ({
      availableChats: (window.context?.getChats() || []).map((c) => ({
        id: c.id,
        title: c.title,
        timestamp: c.timestamp,
        messageCount: (window.context?.getMessagesByChat()[c.id] || []).length,
        artifactCount: (window.context?.getArtifacts() || []).filter((a) => a.chatId === c.id)
          .length,
      })),
      currentChatId: window.context?.getActiveChatId(),
      totalChats: window.context?.getChats().length || 0,
    }),
    handler: (params) => {
      const { chatId, confirmDelete = false } = params;
      const chats = window.context?.getChats() || [];
      const chat = chats.find((c) => c.id === chatId);

      if (!chat) {
        return createStandardizedResult(
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
      const artifacts = (window.context?.getArtifacts() || []).filter((a) => a.chatId === chatId);

      if ((messages.length > 0 || artifacts.length > 0) && !confirmDelete) {
        return createStandardizedResult(
          'chat.delete',
          'Delete Chat',
          false,
          {
            requiresConfirmation: true,
            chatTitle: chat.title,
            messageCount: messages.length,
            artifactCount: artifacts.length,
          },
          'Confirmation required',
          `Chat "${chat.title}" contains ${messages.length} messages and ${artifacts.length} artifacts. Set confirmDelete=true to proceed.`
        );
      }

      // Prevent deleting the last chat
      if (chats.length <= 1) {
        return createStandardizedResult(
          'chat.delete',
          'Delete Chat',
          false,
          {},
          'Cannot delete last chat',
          'Cannot delete the last remaining chat. Create a new chat first.'
        );
      }

      // Perform the deletion
      try {
        const success = window.context.deleteChat(chatId);
        if (success) {
          return createStandardizedResult(
            'chat.delete',
            'Delete Chat',
            true,
            {
              chatId,
              chatTitle: chat.title,
              deletedMessageCount: messages.length,
              deletedArtifactCount: artifacts.length,
              action: 'Deleted chat',
              type: 'chat',
            },
            null,
            `Deleted chat "${chat.title}" with ${messages.length} messages and ${artifacts.length} artifacts`
          );
        } else {
          return createStandardizedResult(
            'chat.delete',
            'Delete Chat',
            false,
            {},
            'Deletion failed',
            'Failed to delete chat - see console for details'
          );
        }
      } catch (error) {
        return createStandardizedResult(
          'chat.delete',
          'Delete Chat',
          false,
          {},
          error.message,
          `Failed to delete chat: ${error.message}`
        );
      }
    },
  },

  // =================== User Actions ===================

  'user.updatePreferences': {
    id: 'user.updatePreferences',
    name: 'Update User Preferences',
    description:
      'Update user onboarding preferences (name, role, usage context, AI traits array) with advanced trait management',
    category: ACTION_CATEGORIES.CHAT,
    requiredParams: [],
    optionalParams: ['name', 'role', 'usingFor', 'aiTraits', 'traitAction'],
    availableData: () => ({
      currentPreferences: window.context?.getUserPreferences() || {},
      validUsageOptions: ['school', 'personal', 'work'],
      supportedTraits: [
        'casual',
        'professional',
        'detailed',
        'creative',
        'technical',
        'friendly',
        'concise',
        'analytical',
        'empathetic',
        'precise',
      ],
      traitActions: ['add', 'remove', 'replace'], // Available trait management actions
    }),
    handler: (params) => {
      const { name, role, usingFor, aiTraits, traitAction } = params;
      const updates = {};

      if (name !== undefined) updates.name = name;
      if (role !== undefined) updates.role = role;
      if (usingFor !== undefined) updates.usingFor = usingFor;

      // Enhanced aiTraits handling with action support
      if (aiTraits !== undefined) {
        const currentPrefs = window.context?.getUserPreferences() || {};
        const currentTraits = Array.isArray(currentPrefs.aiTraits)
          ? [...currentPrefs.aiTraits]
          : [];

        if (traitAction) {
          // Advanced trait management mode
          const inputTraits = Array.isArray(aiTraits) ? aiTraits : [aiTraits];
          const normalizedTraits = inputTraits
            .map((trait) => String(trait).trim().toLowerCase())
            .filter(Boolean);

          switch (traitAction.toLowerCase()) {
            case 'add':
              // Add new traits without duplicates
              normalizedTraits.forEach((trait) => {
                if (!currentTraits.includes(trait)) {
                  currentTraits.push(trait);
                }
              });
              updates.aiTraits = currentTraits;
              break;

            case 'remove':
              // Remove specified traits
              updates.aiTraits = currentTraits.filter((trait) => !normalizedTraits.includes(trait));
              break;

            case 'replace':
              // Replace all traits
              updates.aiTraits = normalizedTraits;
              break;

            default:
              return createStandardizedResult(
                'user.updatePreferences',
                'Update User Preferences',
                false,
                {},
                'Invalid traitAction. Use: add, remove, or replace',
                'Invalid traitAction. Use: add, remove, or replace'
              );
          }
        } else {
          // Legacy/simple mode - backward compatibility
          if (Array.isArray(aiTraits)) {
            // If input is array, replace entirely
            updates.aiTraits = aiTraits;
          } else if (typeof aiTraits === 'string') {
            // If input is string, convert to array and merge with existing
            const newTraits = aiTraits
              .split(',')
              .map((trait) => trait.trim().toLowerCase())
              .filter(Boolean);
            const existingTraits = Array.isArray(currentTraits)
              ? currentTraits
              : [currentTraits].filter(Boolean);

            // Merge and deduplicate
            const combinedTraits = [...new Set([...existingTraits, ...newTraits])];
            updates.aiTraits = combinedTraits;
          } else {
            // Fallback: treat as single trait
            updates.aiTraits = [String(aiTraits)];
          }
        }
      }

      if (Object.keys(updates).length === 0) {
        return createStandardizedResult(
          'user.updatePreferences',
          'Update User Preferences',
          false,
          {},
          'No preferences provided to update',
          'No preferences provided to update'
        );
      }

      if (window.context && window.context.setUserPreferences) {
        window.context.setUserPreferences(updates);

        const updatedFields = Object.keys(updates).join(', ');

        // Generate descriptive message based on operation
        let actionMessage = `Updated user preferences: ${updatedFields}`;
        if (updates.aiTraits && traitAction) {
          const traitList = Array.isArray(aiTraits) ? aiTraits.join(', ') : aiTraits;
          actionMessage = `${
            traitAction.charAt(0).toUpperCase() + traitAction.slice(1)
          } AI traits: ${traitList}`;
        }

        return createStandardizedResult(
          'user.updatePreferences',
          'Update User Preferences',
          true,
          {
            updates,
            updatedFields,
            traitAction: traitAction || 'update',
            action: 'Updated user preferences',
            type: 'user',
          },
          null,
          actionMessage
        );
      }

      return createStandardizedResult(
        'user.updatePreferences',
        'Update User Preferences',
        false,
        {},
        'Context module not available',
        'Context module not available'
      );
    },
  },

  // =================== Artifact Actions ===================

  'artifacts.create': {
    id: 'artifacts.create',
    name: 'Create Artifact',
    description:
      'Create a new artifact with content (used by action system, structured responses create artifacts directly)',
    category: ACTION_CATEGORIES.ARTIFACTS,
    requiredParams: ['content'],
    optionalParams: ['type', 'messageId'],
    availableData: () => ({
      currentChatArtifacts: window.context?.getCurrentChatArtifacts() || [],
      supportedTypes: ['html', 'markdown', 'text', 'image', 'link'],
    }),
    handler: (params) => {
      const { content, type = null, messageId = Date.now().toString() } = params;
      if (!window.artifactsModule || !window.artifactsModule.createArtifact) {
        return createStandardizedResult(
          'artifacts.create',
          'Create Artifact',
          false,
          {},
          'Artifacts module not available',
          'Artifacts module not available'
        );
      }
      const artifact = window.artifactsModule.createArtifact(content, messageId, type);
      return createStandardizedResult(
        'artifacts.create',
        'Create Artifact',
        true,
        {
          artifactId: artifact.id,
          title: artifact.title,
          type: artifact.type,
          action: 'Created artifact',
        },
        null,
        `Created ${artifact.type} artifact "${artifact.title}"`
      );
    },
  },

  'artifacts.update': {
    id: 'artifacts.update',
    name: 'Update Artifact',
    description: 'Update an existing artifact with new content',
    category: ACTION_CATEGORIES.ARTIFACTS,
    requiredParams: ['artifactId', 'content'],
    optionalParams: [],
    availableData: () => ({
      currentChatArtifacts: (window.context?.getCurrentChatArtifacts() || []).map((a) => ({
        id: a.id,
        title: a.title,
        type: a.type,
        versionCount: a.versions.length,
      })),
    }),
    handler: (params) => {
      const { artifactId, content } = params;
      if (!window.artifactsModule || !window.artifactsModule.updateArtifact) {
        return createStandardizedResult(
          'artifacts.update',
          'Update Artifact',
          false,
          {},
          'Artifacts module not available',
          'Artifacts module not available'
        );
      }
      const artifact = window.artifactsModule.updateArtifact(artifactId, content);
      if (!artifact) {
        return createStandardizedResult(
          'artifacts.update',
          'Update Artifact',
          false,
          {},
          'Artifact not found or not in current chat',
          'Artifact not found or not in current chat'
        );
      }
      return createStandardizedResult(
        'artifacts.update',
        'Update Artifact',
        true,
        {
          artifactId,
          title: artifact.title,
          type: artifact.type,
          versionCount: artifact.versions.length,
          action: 'Updated artifact',
        },
        null,
        `Updated ${artifact.type} artifact "${artifact.title}" (now has ${artifact.versions.length} versions)`
      );
    },
  },

  'artifacts.view': {
    id: 'artifacts.view',
    name: 'View Artifact',
    description: 'View a specific artifact',
    category: ACTION_CATEGORIES.ARTIFACTS,
    requiredParams: ['artifactId'],
    optionalParams: [],
    availableData: () => ({
      currentChatArtifacts: (window.context?.getCurrentChatArtifacts() || []).map((a) => ({
        id: a.id,
        title: a.title,
        type: a.type,
        createdAt: a.createdAt,
      })),
      currentlyViewing:
        window.context?.getActiveView()?.type === 'artifact'
          ? window.context?.getActiveView()?.data?.artifactId
          : null,
    }),
    handler: (params) => {
      const { artifactId } = params;
      const artifact = window.context?.findCurrentChatArtifact(artifactId);
      if (!artifact) {
        return createStandardizedResult(
          'artifacts.view',
          'View Artifact',
          false,
          {},
          'Artifact not found in current chat',
          'Artifact not found in current chat'
        );
      }
      window.context.setActiveArtifactId(artifactId);
      return createStandardizedResult(
        'artifacts.view',
        'View Artifact',
        true,
        {
          artifactId,
          title: artifact.title,
          type: artifact.type,
          action: 'Viewing artifact',
        },
        null,
        `Now viewing ${artifact.type} artifact "${artifact.title}"`
      );
    },
  },

  // =================== View Actions ===================

  'views.switch': {
    id: 'views.switch',
    name: 'Switch View',
    description: 'Switch to a different view using the centralized views registry',
    category: ACTION_CATEGORIES.VIEWS,
    requiredParams: ['viewId'],
    optionalParams: ['data'],
    availableData: () => {
      // Get all available views from the views registry
      const availableViews = window.views
        ? window.views.getAllViews().map((v) => ({
            id: v.id,
            name: v.name,
            description: v.description,
            type: v.type,
            requiredParams: v.requiredParams,
            optionalParams: v.optionalParams,
            currentData: v.availableData ? v.availableData() : {},
          }))
        : [];

      return {
        availableViews,
        currentView: window.context?.getActiveView(),
        totalAvailableViews: availableViews.length,
      };
    },
    handler: (params) => {
      const { viewId, data = {} } = params;

      // Validate viewId
      if (!window.views) {
        return createStandardizedResult(
          'views.switch',
          'switch view',
          false,
          {},
          'Views module not loaded',
          'Views system is not available'
        );
      }

      const validation = window.views.validateViewParams(viewId, data);
      if (!validation.valid) {
        return createStandardizedResult(
          'views.switch',
          'switch view',
          false,
          {},
          validation.error,
          `View switch failed: ${validation.error}`
        );
      }

      const view = window.views.getView(viewId);
      if (!view) {
        return createStandardizedResult(
          'views.switch',
          'switch view',
          false,
          {},
          `View ${viewId} not found`,
          `View ${viewId} does not exist`
        );
      }

      // Special handling for artifact view - validate artifact exists
      if (viewId === 'artifact' && data.artifactId) {
        const artifact = window.context?.findCurrentChatArtifact(data.artifactId);
        if (!artifact) {
          return createStandardizedResult(
            'views.switch',
            'switch view',
            false,
            {},
            `Artifact ${data.artifactId} not found`,
            `Cannot switch to artifact view: artifact not found`
          );
        }
      }

      // Switch to the view
      window.context.setActiveView(view.type, data);

      return createStandardizedResult(
        'views.switch',
        'switch view',
        true,
        {
          viewId,
          viewType: view.type,
          viewName: view.name,
          data,
        },
        null,
        `Switched to ${view.name} view`
      );
    },
  },

  // =================== Theme Actions ===================

  'theme.toggle': {
    id: 'theme.toggle',
    name: 'Toggle Theme',
    description: 'Toggle between system, light, and dark themes',
    category: ACTION_CATEGORIES.VIEWS,
    requiredParams: [],
    optionalParams: [],
    availableData: () => {
      const currentTheme = localStorage.getItem('theme') || 'system';
      return {
        currentTheme,
        availableThemes: ['system', 'light', 'dark'],
      };
    },
    handler: (params = {}) => {
      if (!window.themeManager) {
        return createStandardizedResult(
          'theme.toggle',
          'Toggle Theme',
          false,
          {},
          'Theme manager not available',
          'Theme manager not available'
        );
      }

      const currentTheme = localStorage.getItem('theme') || 'system';
      let newTheme;

      switch (currentTheme) {
        case 'system':
          newTheme = 'light';
          document.documentElement.setAttribute('data-theme', 'light');
          window.themeManager.injectColorVariables('light');
          localStorage.setItem('theme', 'light');
          break;
        case 'light':
          newTheme = 'dark';
          document.documentElement.setAttribute('data-theme', 'dark');
          window.themeManager.injectColorVariables('dark');
          localStorage.setItem('theme', 'dark');
          break;
        case 'dark':
          newTheme = 'system';
          localStorage.removeItem('theme');
          window.themeManager.setSystemTheme();
          break;
      }

      return createStandardizedResult(
        'theme.toggle',
        'Toggle Theme',
        true,
        {
          previousTheme: currentTheme,
          newTheme,
          action: 'Theme toggled',
          type: 'theme',
        },
        null,
        `Theme changed from ${currentTheme} to ${newTheme}`
      );
    },
  },

  // =================== Data Management Actions ===================

  'data.deleteUser': {
    id: 'data.deleteUser',
    name: 'Delete User Account',
    description: 'Permanently delete user account and all associated data (cannot be undone)',
    category: ACTION_CATEGORIES.VIEWS,
    requiredParams: [],
    optionalParams: ['confirmationCode'],
    availableData: () => {
      const contextData = window.memory?.getContextData() || {};
      const session = window.user?.getActiveSession();
      return {
        hasLocalData: Object.keys(contextData).length > 0,
        isOnline: window.syncManager?.isOnline || false,
        hasRemoteAccess: !!(session && window.syncManager?.supabase),
        userEmail: session?.user?.email || null,
        totalChats: (contextData.chats || []).length,
        totalMessages: Object.values(contextData.messagesByChat || {}).reduce(
          (sum, messages) => sum + messages.length,
          0
        ),
        totalArtifacts: (contextData.artifacts || []).length,
      };
    },
    handler: async (params = {}) => {
      try {
        // Check if memory and sync systems are available
        if (!window.memory) {
          return createStandardizedResult(
            'data.clearAll',
            'Clear All User Data',
            false,
            {},
            'Memory module not available',
            'Memory system is not loaded'
          );
        }

        if (!window.syncManager) {
          return createStandardizedResult(
            'data.clearAll',
            'Clear All User Data',
            false,
            {},
            'Sync manager not available',
            'Sync system is not loaded'
          );
        }

        const session = window.user?.getActiveSession();
        const userEmail = session?.user?.email || 'unknown user';
        const userId = session?.user?.id || window.syncManager?.userId;

        // First, delete all user data and then the user account
        let remoteCleared = false;
        let userDeleted = false;

        if (window.syncManager.isOnline && window.syncManager.supabase && userId) {
          try {
            // Delete all user data from database tables
            await window.syncManager.supabase.from('messages').delete().eq('user_id', userId);

            await window.syncManager.supabase.from('chats').delete().eq('user_id', userId);

            await window.syncManager.supabase.from('artifacts').delete().eq('user_id', userId);

            // Delete user record entirely
            await window.syncManager.supabase.from('users').delete().eq('id', userId);

            // Delete the auth user account (this signs them out)
            const { error: authError } = await window.syncManager.supabase.auth.admin.deleteUser(
              userId
            );
            if (authError && !authError.message.includes('User not found')) {
              console.error('[ACTIONS] Failed to delete auth user:', authError);
              // Continue anyway since data is deleted
            } else {
              userDeleted = true;
            }

            remoteCleared = true;
            console.log('[ACTIONS] User account and data deleted from database');
          } catch (error) {
            console.error('[ACTIONS] Failed to delete user account:', error);
            // Continue with local clearing even if remote fails
          }
        }

        // Clear local data
        window.memory.purgeAllData();

        // Clear sync queue
        if (window.syncManager.syncQueue) {
          window.syncManager.syncQueue = [];
          window.memory.clearSyncQueue();
        }

        // Reset app state
        if (window.context?.setState) {
          window.context.setState({
            chats: [],
            messagesByChat: {},
            artifacts: [],
            userPreferences: {},
            activeView: null,
          });
        }

        // Force logout after deletion
        if (window.user?.logout) {
          try {
            await window.user.logout();
          } catch (error) {
            console.error('[ACTIONS] Failed to logout after user deletion:', error);
          }
        }

        return createStandardizedResult(
          'data.deleteUser',
          'Delete User Account',
          true,
          {
            userEmail,
            localCleared: true,
            remoteCleared,
            userDeleted,
            action: 'User account deleted',
            type: 'account_deletion',
          },
          null,
          `User account ${userEmail} permanently deleted${
            userDeleted ? ' (including auth account)' : ' (data only)'
          }`
        );
      } catch (error) {
        console.error('[ACTIONS] Error deleting user account:', error);
        return createStandardizedResult(
          'data.deleteUser',
          'Delete User Account',
          false,
          {},
          error.message,
          `Failed to delete user account: ${error.message}`
        );
      }
    },
  },

  'data.clearLocal': {
    id: 'data.clearLocal',
    name: 'Clear Local Data Only',
    description: 'Clear only local storage data (data will sync back from remote if online)',
    category: ACTION_CATEGORIES.VIEWS,
    requiredParams: [],
    optionalParams: [],
    availableData: () => {
      const contextData = window.memory?.getContextData() || {};
      return {
        hasLocalData: Object.keys(contextData).length > 0,
        totalChats: (contextData.chats || []).length,
        totalMessages: Object.values(contextData.messagesByChat || {}).reduce(
          (sum, messages) => sum + messages.length,
          0
        ),
        totalArtifacts: (contextData.artifacts || []).length,
      };
    },
    handler: async (params = {}) => {
      try {
        if (!window.memory) {
          return createStandardizedResult(
            'data.clearLocal',
            'Clear Local Data Only',
            false,
            {},
            'Memory module not available',
            'Memory system is not loaded'
          );
        }

        // Clear local data only
        window.memory.purgeAllData();

        return createStandardizedResult(
          'data.clearLocal',
          'Clear Local Data Only',
          true,
          {
            action: 'Local data cleared',
            type: 'data_management',
          },
          null,
          'Local data cleared successfully. Data will sync back from remote if online.'
        );
      } catch (error) {
        console.error('[ACTIONS] Error clearing local data:', error);
        return createStandardizedResult(
          'data.clearLocal',
          'Clear Local Data Only',
          false,
          {},
          error.message,
          `Failed to clear local data: ${error.message}`
        );
      }
    },
  },

  // =================== Auth Actions ===================

  'auth.login': {
    id: 'auth.login',
    name: 'Login',
    description: 'Login with email address (sends magic link)',
    category: ACTION_CATEGORIES.AUTH,
    requiredParams: ['email'],
    optionalParams: [],
    availableData: () => {
      const session = window.user?.getActiveSession();
      return {
        isLoggedIn: session ? true : false,
        currentUser: session?.user?.email || null,
      };
    },
    handler: async (params = {}) => {
      const { email } = params;

      // Validate email format
      if (!email || typeof email !== 'string') {
        return createStandardizedResult(
          'auth.login',
          'Login',
          false,
          {},
          'Email is required',
          'Please provide a valid email address'
        );
      }

      // Simple email validation regex
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return createStandardizedResult(
          'auth.login',
          'Login',
          false,
          {},
          'Invalid email format',
          'Please enter a valid email address (e.g., user@example.com)'
        );
      }

      // Check if already logged in
      const session = window.user?.getActiveSession();
      if (session) {
        return createStandardizedResult(
          'auth.login',
          'Login',
          false,
          {},
          'Already logged in',
          `You are already logged in as ${session.user?.email}`
        );
      }

      // Use the new clean login function
      try {
        const result = await window.user.loginWithEmail(email.trim());

        return createStandardizedResult(
          'auth.login',
          'Login',
          true,
          {
            action: 'Magic link sent',
            email: email.trim(),
            type: 'auth',
          },
          null,
          result.message
        );
      } catch (error) {
        return createStandardizedResult(
          'auth.login',
          'Login',
          false,
          {},
          'Login failed',
          error.message
        );
      }
    },
  },

  'auth.logout': {
    id: 'auth.logout',
    name: 'Logout',
    description: 'Log out the current user and clear authentication session',
    category: ACTION_CATEGORIES.AUTH,
    requiredParams: [],
    optionalParams: ['redirectUrl'],
    availableData: () => {
      const session = window.user?.getActiveSession();
      return {
        isLoggedIn: session ? true : false,
        currentUser: session?.user?.email || null,
      };
    },
    handler: async (params = {}) => {
      const { redirectUrl = '/' } = params;

      // Check if user is logged in using the proper session check
      const session = window.user?.getActiveSession();
      if (session && window.user?.logout) {
        const username = session.user?.email || 'User';

        // Use the app's built-in logout function which handles Supabase auth
        try {
          await window.user.logout();
          return createStandardizedResult(
            'auth.logout',
            'Logout',
            true,
            {
              action: 'Logged out',
              redirectUrl,
              type: 'auth',
              username,
            },
            null,
            `Successfully logged out ${username}`
          );
        } catch (error) {
          return createStandardizedResult(
            'auth.logout',
            'Logout',
            false,
            {},
            'Logout failed',
            `Failed to logout: ${error.message}`
          );
        }
      } else {
        return createStandardizedResult(
          'auth.logout',
          'Logout',
          false,
          {},
          'No user currently logged in',
          'No active authentication session to logout from'
        );
      }
    },
  },
};

// =================== Action Registry API ===================

function getActionsByCategory(category) {
  return Object.values(ACTIONS_REGISTRY).filter((action) => action.category === category);
}

function getAction(actionId) {
  return ACTIONS_REGISTRY[actionId] || null;
}

// =================== Action Execution Framework ===================

async function executeAction(actionId, params = {}) {
  const action = getAction(actionId);
  if (!action) {
    const errorResult = createStandardizedResult(
      actionId,
      'Unknown Action',
      false,
      {},
      `Action ${actionId} not found`,
      `Unknown action: ${actionId}`
    );
    return trackActionExecution(errorResult);
  }

  // Validate required parameters
  const missingParams = action.requiredParams.filter((param) => !(param in params));
  if (missingParams.length > 0) {
    const errorResult = createStandardizedResult(
      actionId,
      action.name,
      false,
      {},
      `Missing required parameters: ${missingParams.join(', ')}`,
      `Action ${actionId} requires: ${missingParams.join(', ')}`
    );
    return trackActionExecution(errorResult);
  }

  // Log action execution
  console.log(`[ACTIONS] Executing ${actionId} with params:`, params);

  try {
    const result = await action.handler(params);

    // Log successful execution
    console.log(`[ACTIONS] ${actionId} completed:`, result);

    // Track and return the result
    trackActionExecution(result);

    return result;
  } catch (error) {
    console.error(`[ACTIONS] ${actionId} failed:`, error);
    const errorResult = createStandardizedResult(
      actionId,
      actionId.replace(/^[^.]+\./, ''),
      false,
      {},
      error.message,
      `Failed to execute ${actionId}: ${error.message}`
    );

    trackActionExecution(errorResult);

    return errorResult;
  }
}

// =================== Context Building for Actions ===================

function buildActionContext() {
  return {
    categories: ACTION_CATEGORIES,
    totalActions: Object.keys(ACTIONS_REGISTRY).length,
    actionsByCategory: Object.keys(ACTION_CATEGORIES).reduce((acc, category) => {
      acc[category] = getActionsByCategory(ACTION_CATEGORIES[category]).map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        requiredParams: a.requiredParams,
        optionalParams: a.optionalParams,
        currentData: a.availableData ? a.availableData() : {},
      }));
      return acc;
    }, {}),
    currentState: {
      activeChatId: window.context?.getActiveChatId(),
      activeView: window.context?.getActiveView(),
      artifactCount: (window.context?.getCurrentChatArtifacts() || []).length,
      messageCount: (window.context?.getMessages() || []).length,
    },
  };
}

// =================== Action Summary and Formatting ===================

function formatActionSummary(actions, options = {}) {
  const { groupByType = true, includeTimestamps = false, maxActions = null } = options;

  if (!actions || actions.length === 0) {
    return [];
  }

  let actionsToFormat = maxActions ? actions.slice(-maxActions) : actions;

  if (groupByType) {
    const grouped = {};
    actionsToFormat.forEach((action) => {
      const category = action.category || 'other';
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(action);
    });
    return grouped;
  }

  return actionsToFormat.map((action) => ({
    id: action.actionId,
    name: action.actionName,
    type: action.artifactType || action.result?.type || action.category,
    success: action.success,
    description: action.actionDescription || action.message,
    timestamp: includeTimestamps ? action.timestamp : undefined,
    details: action.result,
  }));
}

function createActionDisplayData(chatId = null) {
  const actions = getActionHistory(chatId);
  const recentActions = getLastActions(10, chatId);

  return {
    totalActions: actions.length,
    recentActions: formatActionSummary(recentActions, {
      groupByType: false,
      includeTimestamps: true,
    }),
    actionsByCategory: formatActionSummary(actions, { groupByType: true }),
    lastAction: ACTION_HISTORY.lastExecutedAction,
  };
}

// =================== Export API ===================

window.actions = {
  // Registry access
  getActionsByCategory,
  getAction,

  // Execution
  executeAction,

  // Tracking and History
  getActionHistory,
  getLastActions,
  clearActionHistory,
  trackActionExecution,

  // Formatting and Display
  formatActionSummary,
  createActionDisplayData,

  // Context
  buildActionContext,

  // Utilities
  createStandardizedResult,

  // Constants
  ACTION_CATEGORIES,
  ACTIONS_REGISTRY,
  ACTION_HISTORY,
};

// Make actions available globally for easy access
window.Actions = ACTIONS_REGISTRY;
