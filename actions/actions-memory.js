// =================== Memory Actions ===================
// Actions related to data persistence, storage, and memory management
// These actions correspond to operations handled by memory.js

const MEMORY_ACTIONS = {
  'memory.deleteUser': {
    id: 'memory.deleteUser',
    name: 'Delete User Account',
    description: 'Permanently delete user account and all associated data (cannot be undone)',
    category: window.actions?.ACTION_CATEGORIES?.MEMORY || 'memory',
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
        totalMessages: Object.values(contextData.messagesByChat || {}).reduce((sum, messages) => sum + messages.length, 0),
        totalArtifacts: (contextData.artifacts || []).length
      };
    },
    handler: async (params = {}) => {
      try {
        // Check if memory and sync systems are available
        if (!window.memory) {
          return window.actions.createStandardizedResult(
            'memory.deleteUser',
            'Delete User Account',
            false,
            {},
            'Memory module not available',
            'Memory system is not loaded'
          );
        }

        if (!window.syncManager) {
          return window.actions.createStandardizedResult(
            'memory.deleteUser',
            'Delete User Account',
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
            await window.syncManager.supabase
              .from('messages')
              .delete()
              .eq('user_id', userId);
              
            await window.syncManager.supabase
              .from('chats')
              .delete()
              .eq('user_id', userId);
              
            await window.syncManager.supabase
              .from('artifacts')
              .delete()
              .eq('user_id', userId);
              
            // Delete user record entirely
            await window.syncManager.supabase
              .from('users')
              .delete()
              .eq('id', userId);
            
            // Delete the auth user account (this signs them out)
            const { error: authError } = await window.syncManager.supabase.auth.admin.deleteUser(userId);
            if (authError && !authError.message.includes('User not found')) {
              console.error('[MEMORY-ACTIONS] Failed to delete auth user:', authError);
              // Continue anyway since data is deleted
            } else {
              userDeleted = true;
            }
              
            remoteCleared = true;
      
          } catch (error) {
            console.error('[MEMORY-ACTIONS] Failed to delete user account:', error);
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
            activeView: null
          });
        }

        // Force logout after deletion
        if (window.user?.logout) {
          try {
            await window.user.logout();
          } catch (error) {
            console.error('[MEMORY-ACTIONS] Failed to logout after user deletion:', error);
          }
        }

        return window.actions.createStandardizedResult(
          'memory.deleteUser',
          'Delete User Account',
          true,
          { 
            userEmail,
            localCleared: true,
            remoteCleared,
            userDeleted,
            action: 'User account deleted',
            type: 'account_deletion'
          },
          null,
          `User account ${userEmail} permanently deleted${userDeleted ? ' (including auth account)' : ' (data only)'}`
        );

      } catch (error) {
        console.error('[MEMORY-ACTIONS] Error deleting user account:', error);
        return window.actions.createStandardizedResult(
          'memory.deleteUser',
          'Delete User Account',
          false,
          {},
          error.message,
          `Failed to delete user account: ${error.message}`
        );
      }
    }
  },

  'memory.clearLocal': {
    id: 'memory.clearLocal',
    name: 'Clear Local Data Only',
    description: 'Clear only local storage data (data will sync back from remote if online)',
    category: window.actions?.ACTION_CATEGORIES?.MEMORY || 'memory',
    requiredParams: [],
    optionalParams: [],
    availableData: () => {
      const contextData = window.memory?.getContextData() || {};
      return {
        hasLocalData: Object.keys(contextData).length > 0,
        totalChats: (contextData.chats || []).length,
        totalMessages: Object.values(contextData.messagesByChat || {}).reduce((sum, messages) => sum + messages.length, 0),
        totalArtifacts: (contextData.artifacts || []).length
      };
    },
    handler: async (params = {}) => {
      try {
        if (!window.memory) {
          return window.actions.createStandardizedResult(
            'memory.clearLocal',
            'Clear Local Data Only',
            false,
            {},
            'Memory module not available',
            'Memory system is not loaded'
          );
        }

        // Clear local data only
        window.memory.purgeAllData();
        
        return window.actions.createStandardizedResult(
          'memory.clearLocal',
          'Clear Local Data Only',
          true,
          { 
            action: 'Local data cleared',
            type: 'data_management'
          },
          null,
          'Local data cleared successfully. Data will sync back from remote if online.'
        );

      } catch (error) {
        console.error('[MEMORY-ACTIONS] Error clearing local data:', error);
        return window.actions.createStandardizedResult(
          'memory.clearLocal',
          'Clear Local Data Only',
          false,
          {},
          error.message,
          `Failed to clear local data: ${error.message}`
        );
      }
    }
  }
};

// Register these actions with the core system
if (window.actions && window.actions.registerActions) {
  window.actions.registerActions(MEMORY_ACTIONS);
}

// Also export for direct access
window.memoryActions = MEMORY_ACTIONS;

 