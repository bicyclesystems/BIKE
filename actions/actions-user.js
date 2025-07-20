// =================== User Actions ===================
// Actions related to user management, preferences, and authentication
// These actions correspond to operations handled by user.js

const USER_ACTIONS = {
  'user.updatePreferences': {
    id: 'user.updatePreferences',
    name: 'Update User Preferences',
    description: 'Update user onboarding preferences (name, role, usage context, AI traits array) with advanced trait management',
    category: window.actions?.ACTION_CATEGORIES?.USER || 'user',
    requiredParams: [],
    optionalParams: ['name', 'role', 'usingFor', 'aiTraits', 'traitAction'],
    availableData: () => ({
      currentPreferences: window.context?.getUserPreferences() || {},
      validUsageOptions: ['school', 'personal', 'work'],
      supportedTraits: ['casual', 'professional', 'detailed', 'creative', 'technical', 'friendly', 'concise', 'analytical', 'empathetic', 'precise'],
      traitActions: ['add', 'remove', 'replace'] // Available trait management actions
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
        const currentTraits = Array.isArray(currentPrefs.aiTraits) ? [...currentPrefs.aiTraits] : [];
        
        if (traitAction) {
          // Advanced trait management mode
          const inputTraits = Array.isArray(aiTraits) ? aiTraits : [aiTraits];
          const normalizedTraits = inputTraits.map(trait => String(trait).trim().toLowerCase()).filter(Boolean);
          
          switch (traitAction.toLowerCase()) {
            case 'add':
              // Add new traits without duplicates
              normalizedTraits.forEach(trait => {
                if (!currentTraits.includes(trait)) {
                  currentTraits.push(trait);
                }
              });
              updates.aiTraits = currentTraits;
              break;
              
            case 'remove':
              // Remove specified traits
              updates.aiTraits = currentTraits.filter(trait => !normalizedTraits.includes(trait));
              break;
              
            case 'replace':
              // Replace all traits
              updates.aiTraits = normalizedTraits;
              break;
              
            default:
              return window.actions.createStandardizedResult(
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
            const newTraits = aiTraits.split(',').map(trait => trait.trim().toLowerCase()).filter(Boolean);
            const existingTraits = Array.isArray(currentTraits) ? currentTraits : [currentTraits].filter(Boolean);
            
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
        return window.actions.createStandardizedResult(
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
          actionMessage = `${traitAction.charAt(0).toUpperCase() + traitAction.slice(1)} AI traits: ${traitList}`;
        }
        
        return window.actions.createStandardizedResult(
          'user.updatePreferences',
          'Update User Preferences',
          true,
          { 
            updates,
            updatedFields,
            traitAction: traitAction || 'update',
            action: 'Updated user preferences',
            type: 'user'
          },
          null,
          actionMessage
        );
      }
      
      return window.actions.createStandardizedResult(
        'user.updatePreferences',
        'Update User Preferences',
        false,
        {},
        'Context module not available',
        'Context module not available'
      );
    }
  },

  'user.login': {
    id: 'user.login',
    name: 'Login',
    description: 'Login with email address (sends magic link)',
    category: window.actions?.ACTION_CATEGORIES?.USER || 'user',
    requiredParams: ['email'],
    optionalParams: [],
    availableData: () => {
      const session = window.user?.getActiveSession();
      return {
        isLoggedIn: session ? true : false,
        currentUser: session?.user?.email || null
      };
    },
    handler: async (params = {}) => {
      const { email } = params;
      
      // Validate email format
      if (!email || typeof email !== 'string') {
        return window.actions.createStandardizedResult(
          'user.login',
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
        return window.actions.createStandardizedResult(
          'user.login',
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
        return window.actions.createStandardizedResult(
          'user.login',
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
        
        return window.actions.createStandardizedResult(
          'user.login',
          'Login',
          true,
          { 
            action: 'Magic link sent', 
            email: email.trim(),
            type: 'auth'
          },
          null,
          result.message
        );
      } catch (error) {
        return window.actions.createStandardizedResult(
          'user.login',
          'Login',
          false,
          {},
          'Login failed',
          error.message
        );
      }
    }
  },

  'user.logout': {
    id: 'user.logout',
    name: 'Logout',
    description: 'Log out the current user and clear authentication session',
    category: window.actions?.ACTION_CATEGORIES?.USER || 'user',
    requiredParams: [],
    optionalParams: ['redirectUrl'],
    availableData: () => {
      const session = window.user?.getActiveSession();
      return {
        isLoggedIn: session ? true : false,
        currentUser: session?.user?.email || null
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
          return window.actions.createStandardizedResult(
            'user.logout',
            'Logout',
            true,
            { 
              action: 'Logged out', 
              redirectUrl,
              type: 'auth',
              username
            },
            null,
            `Successfully logged out ${username}`
          );
        } catch (error) {
          return window.actions.createStandardizedResult(
            'user.logout',
            'Logout',
            false,
            {},
            'Logout failed',
            `Failed to logout: ${error.message}`
          );
        }
      } else {
        return window.actions.createStandardizedResult(
          'user.logout',
          'Logout',
          false,
          {},
          'No user currently logged in',
          'No active authentication session to logout from'
        );
      }
    }
  }
};

// Register these actions with the core system
if (window.actions && window.actions.registerActions) {
  window.actions.registerActions(USER_ACTIONS);
}

// Also export for direct access
window.userActions = USER_ACTIONS;

 