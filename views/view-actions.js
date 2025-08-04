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
  const createActionBadge = (action) => `<span style="text-decoration: underline; opacity: 0.8;">${window.utils.escapeHtml(action.name.toLowerCase())}</span>`;
  
  return `
    <div class="column gap-l padding-l view">
      <div class="background-primary padding-l radius-l">
        <h1>
          You can ${availableActions.map(action => createActionBadge(action)).join(', ')}.
        </h1>
      </div>
    </div>
  `;
}

function refreshActionsView() {
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
  // Get all actions from the actions registry
  if (!window.actions?.ACTIONS_REGISTRY) {
    return [];
  }
  
  // Extract action objects with their names
  return Object.values(window.actions.ACTIONS_REGISTRY).map(action => ({
    id: action.id,
    name: action.name
  }));
}

// escapeHtml function removed - using window.utils.escapeHtml directly

// Export functions for global access
window.actionsView = {
  renderActionsView,
  refreshActionsView
}; 