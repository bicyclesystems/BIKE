// =================== Views Actions ===================
// Actions related to view management and theme control
// These actions correspond to operations handled by views/ and theme.js

const VIEWS_ACTIONS = {
  'views.switch': {
    id: 'views.switch',
    name: 'Switch View',
    description: 'Switch to a different view using the centralized views registry',
    category: window.actions?.ACTION_CATEGORIES?.VIEWS || 'views',
    requiredParams: ['viewId'],
    optionalParams: ['data'],
    availableData: () => {
      // Get all available views from the views registry
      const availableViews = window.views ? window.views.getAllViews().map(v => ({
        id: v.id,
        name: v.name,
        description: v.description,
        type: v.type,
        requiredParams: v.requiredParams,
        optionalParams: v.optionalParams,
        currentData: v.availableData ? v.availableData() : {}
      })) : [];
      
      return {
        availableViews,
        currentView: window.context?.getActiveView(),
        totalAvailableViews: availableViews.length
      };
    },
    handler: (params) => {
      const { viewId, data = {} } = params;
      
      // Validate viewId
      if (!window.views) {
        return window.actions.createStandardizedResult(
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
        return window.actions.createStandardizedResult(
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
        return window.actions.createStandardizedResult(
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
          return window.actions.createStandardizedResult(
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
      
      return window.actions.createStandardizedResult(
        'views.switch',
        'switch view',
        true,
        { 
          viewId, 
          viewType: view.type, 
          viewName: view.name,
          data 
        },
        null,
        `Switched to ${view.name} view`
      );
    }
  },

  'theme.toggle': {
    id: 'theme.toggle',
    name: 'Toggle Theme',
    description: 'Toggle between system, light, and dark themes',
    category: window.actions?.ACTION_CATEGORIES?.VIEWS || 'views',
    requiredParams: [],
    optionalParams: [],
    availableData: () => {
      const currentTheme = localStorage.getItem("theme") || "system";
      return {
        currentTheme,
        availableThemes: ['system', 'light', 'dark']
      };
    },
    handler: (params = {}) => {
      if (!window.themeManager) {
        return window.actions.createStandardizedResult(
          'theme.toggle',
          'Toggle Theme',
          false,
          {},
          'Theme manager not available',
          'Theme manager not available'
        );
      }

      const currentTheme = localStorage.getItem("theme") || "system";
      let newTheme;

      switch (currentTheme) {
        case "system":
          newTheme = "light";
          document.documentElement.setAttribute("data-theme", "light");
          window.themeManager.injectColorVariables("light");
          localStorage.setItem("theme", "light");
          break;
        case "light":
          newTheme = "dark";
          document.documentElement.setAttribute("data-theme", "dark");
          window.themeManager.injectColorVariables("dark");
          localStorage.setItem("theme", "dark");
          break;
        case "dark":
          newTheme = "system";
          localStorage.removeItem("theme");
          window.themeManager.setSystemTheme();
          break;
      }

      return window.actions.createStandardizedResult(
        'theme.toggle',
        'Toggle Theme',
        true,
        { 
          previousTheme: currentTheme,
          newTheme,
          action: 'Theme toggled',
          type: 'theme'
        },
        null,
        `Theme changed from ${currentTheme} to ${newTheme}`
      );
    }
  }
};

// Register these actions with the core system
if (window.actions && window.actions.registerActions) {
  window.actions.registerActions(VIEWS_ACTIONS);
}

// Also export for direct access
window.viewsActions = VIEWS_ACTIONS;

 