// =================== Actions View ===================

// =================== Context Highlighting ===================

function applyContextHighlighting() {
  if (!window.contextHighlight) return;
  
  setTimeout(() => {
    const viewElement = window.context?.getViewElement();
    if (viewElement) {
      // Find all text elements that could benefit from context highlighting
      const textElements = viewElement.querySelectorAll('h1, h2, h3, h4, h5, h6, .text-xs, .text-s, .text-m, .text-l, .text-xl');
      textElements.forEach(element => {
        if (element.innerText && element.innerText.trim()) {
          // If element contains trait tags, preserve them by applying highlighting carefully
          const traitTags = element.querySelectorAll('[data-no-highlight="true"]');
          if (traitTags.length > 0) {
            // Save trait tag content and temporarily replace with placeholders
            const traitData = [];
            traitTags.forEach((tag, index) => {
              const placeholder = `__TRAIT_PLACEHOLDER_${index}__`;
              traitData.push({ placeholder, originalHTML: tag.outerHTML });
              tag.outerHTML = placeholder;
            });
            
            // Apply highlighting to the modified content
            window.contextHighlight.highlightContextWords(element);
            
            // Restore trait tags
            let html = element.innerHTML;
            traitData.forEach(({ placeholder, originalHTML }) => {
              html = html.replace(placeholder, originalHTML);
            });
            element.innerHTML = html;
          } else {
            // No trait tags, apply highlighting normally
            window.contextHighlight.highlightContextWords(element);
          }
        }
      });
    }
  }, 50);
}

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
  const createActionBadge = (action) => `<span style="text-decoration: underline; opacity: 0.8;">${escapeHtml(action.name.toLowerCase())}</span>`;
  
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
    applyContextHighlighting();
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

function escapeHtml(text) {
  if (window.utils?.escapeHtml) {
    return window.utils.escapeHtml(text);
  }
  // Fallback implementation
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Export functions for global access
window.actionsView = {
  renderActionsView,
  refreshActionsView,
  applyContextHighlighting
}; 