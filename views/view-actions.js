// =================== Actions View ===================

// =================== Context Highlighting ===================
// Note: Context highlighting is now handled automatically by the global auto-highlighting system

// =================== Actions View Rendering ===================

function renderActionsView() {
  // Get available actions
  const availableActions = getAvailableActions();
  
  // Get user information for context
  const session = window.user?.getActiveSession();
  const email = session?.user?.email || '';
  
  // Check if user is logged in
  const isLoggedOut = !session || !email;
  
  if (availableActions.length === 0) {
    return `
      <div class="column align-center justify-center padding-xl">
        <div class="text-xl">⚡</div>
        <div class="text-l">No Actions Available</div>
        <div class="text-s opacity-s">Actions system is not loaded yet</div>
      </div>
    `;
  }
  
  // Helper function to create styled action badges
  const createActionBadge = (action) => {
    const badge = window.utils.escapeHtml(action.name.toLowerCase());
    const style = action.isDiscovered ? 
      'text-decoration: underline; opacity: 0.9; color: var(--text-accent);' : 
      'text-decoration: underline; opacity: 0.8;';
    return `<span style="${style}">${badge}</span>`;
  };
  
  // Separate manual and discovered actions
  const manualActions = availableActions.filter(a => !a.isDiscovered);
  const discoveredActions = availableActions.filter(a => a.isDiscovered);
  
  // Group discovered actions by module
  const discoveredByModule = discoveredActions.reduce((groups, action) => {
    const module = action.module || 'unknown';
    if (!groups[module]) groups[module] = [];
    groups[module].push(action);
    return groups;
  }, {});
  
  const createActionList = (actions, title, style = '') => {
    if (actions.length === 0) return '';
    const actionItems = actions.map(action => 
      `<div class="margin-xs">${createActionBadge(action)}</div>`
    ).join('');
    return `
      <div class="margin-b-l">
        <h2 style="${style}">${title} (${actions.length})</h2>
        <div class="column gap-xs padding-l">
          ${actionItems}
        </div>
      </div>
    `;
  };
  
  const createModuleGroups = (moduleGroups) => {
    return Object.entries(moduleGroups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([module, actions]) => {
        // Clean up module names - remove "Module" suffix for cleaner display
        let moduleTitle = module.charAt(0).toUpperCase() + module.slice(1);
        if (moduleTitle.endsWith('Module')) {
          moduleTitle = moduleTitle.slice(0, -6); // Remove "Module"
        }
        return createActionList(actions, moduleTitle, 'color: var(--text-accent);');
      }).join('');
  };
  
  return `
    <div class="column gap-l padding-l view">
      <div class="background-primary padding-l radius-l">
        <div class="row space-between align-center margin-b-l">
          <h1>Actions</h1>
          <button onclick="window.actionsView.refreshActionsView()" class="button-ghost">
            Refresh Discovery
          </button>
        </div>
        
        ${createActionList(manualActions, 'Manual Actions', 'color: var(--text-primary);')}
        ${createModuleGroups(discoveredByModule)}
      </div>
    </div>
  `;
}

function refreshActionsView() {
  // No discovery refresh needed - functions are scanned directly
  
  if (window.context?.getActiveView()?.type === 'actions') {
    window.views?.renderCurrentView();
    
    // Apply context highlighting
    setTimeout(() => {
      if (window.contextHighlight && window.contextHighlight.highlightViewContent) {
        window.contextHighlight.highlightViewContent();
      }
    }, 50);
  }
}

// =================== Helper Functions ===================

function getAvailableActions() {
  // Get available functions by scanning window objects directly
  const APP_MODULES = ['chat', 'user', 'memory', 'artifactsModule', 'context', 'views', 'utils', 'messages', 'inputModule', 'processModule', 'systemModule', 'themeManager'];
  const actions = [];
  
  for (const moduleName of APP_MODULES) {
    const moduleObj = window[moduleName];
    if (!moduleObj || typeof moduleObj !== 'object') continue;
    
    const functions = Object.entries(moduleObj)
      .filter(([, value]) => typeof value === 'function');
    
    for (const [funcName] of functions) {
      const actionName = funcName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
      actions.push({
        id: `${moduleName}.${funcName}`,
        name: actionName,
        category: 'api',
        module: moduleName,
        isDiscovered: true
      });
    }
  }
  
  return actions;
}

// escapeHtml function removed - using window.utils.escapeHtml directly

// Export functions for global access
window.actionsView = {
  renderActionsView,
  refreshActionsView,
  getAvailableActions
}; 