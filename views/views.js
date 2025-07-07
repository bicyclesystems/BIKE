// =================== Views Registry ===================

const VIEWS_REGISTRY = {
  'welcome': {
    id: 'welcome',
    name: 'Welcome',
    description: 'Show the welcome/home view',
    type: 'welcome',
    requiredParams: [],
    optionalParams: [],
    availableData: () => ({
      currentUser: window.user?.getActiveSession()?.user?.email || null,
      userPreferences: window.context?.getUserPreferences() || {}
    }),
    render: (data) => window.welcomeView.renderWelcomeView()
  },
  
  'calendar': {
    id: 'calendar',
    name: 'Calendar',  
    description: 'Show the calendar view',
    type: 'calendar',
    requiredParams: [],
    optionalParams: [],
    availableData: () => ({
      hasCalendarData: window.context?.getChats().length > 0,
      chatCount: window.context?.getChats().length
    }),
    render: (data) => window.calendarView.renderCalendarView()
  },
  
  'artifacts': {
    id: 'artifacts',
    name: 'Artifacts',
    description: 'Browse and manage all artifacts in a grid layout',
    type: 'artifacts',
    requiredParams: [],
    optionalParams: ['filter', 'sort'],
    availableData: () => ({
      artifacts: window.context?.getCurrentChatArtifacts() || [],
      totalArtifacts: (window.context?.getCurrentChatArtifacts() || []).length,
      
    }),
    render: (data) => window.artifactsView.renderArtifactsView(data)
  },
  
  'artifact': {
    id: 'artifact',
    name: 'Artifact View',
    description: 'View a specific artifact',
    type: 'artifact', 
    requiredParams: ['artifactId'],
    optionalParams: [],
    availableData: () => ({
      currentChatArtifacts: (window.context?.getCurrentChatArtifacts() || [])
        .map(a => ({ id: a.id, title: a.title, type: a.type, createdAt: a.createdAt })),
      currentlyViewing: window.context?.getActiveView()?.type === 'artifact' ? window.context.getActiveView().data.artifactId : null
    }),
    render: (data) => window.artifactView.renderArtifactView(data)
  },
  
  'memory': {
    id: 'memory',
    name: 'Memory',
    description: 'View the entire memory system including chats, messages, artifacts, and storage status',
    type: 'memory',
    requiredParams: [],
    optionalParams: [],
    availableData: () => ({
      memoryData: window.memory?.getContextData() || {},
      storageStatus: window.memory?.getStorageStatus() || {}
    }),
    render: (data) => {
      const html = window.memoryView.renderMemoryView();
      // Apply context highlighting specifically for memory view
      if (window.memoryView.applyContextHighlighting) {
        window.memoryView.applyContextHighlighting();
      }
      return html;
    }
  }
};

// =================== Views Registry API ===================

function getView(viewId) {
  return VIEWS_REGISTRY[viewId] || null;
}

function getAllViews() {
  return Object.values(VIEWS_REGISTRY);
}

function getViewsByType(type) {
  return Object.values(VIEWS_REGISTRY).filter(view => view.type === type);
}

function validateViewParams(viewId, params = {}) {
  const view = getView(viewId);
  if (!view) {
    return { valid: false, error: `View ${viewId} not found` };
  }
  
  const missingParams = view.requiredParams.filter(param => !(param in params));
  if (missingParams.length > 0) {
    return { 
      valid: false, 
      error: `Missing required parameters for ${viewId}: ${missingParams.join(', ')}` 
    };
  }
  
  return { valid: true };
}

// =================== View Rendering ===================



function renderCurrentView() {
  const viewElement = window.context?.getViewElement();
  if (!viewElement) window.context?.setViewElement(document.getElementById('view'));
  
  const currentViewElement = window.context?.getViewElement();
  if (!currentViewElement) return;
  
  // Render content immediately
  const activeView = window.context?.getActiveView();
  if (!activeView) {
    // Always show welcome view when activeView is null
    currentViewElement.innerHTML = window.welcomeView.renderWelcomeView();
  } else {
    const { type, data } = activeView;
    
    // Find the view in our registry that matches this type
    const view = Object.values(VIEWS_REGISTRY).find(v => v.type === type);
    
    let html = '';
    
    if (view && view.render) {
      html = view.render(data);
    } else {
      html = `<div class="column align-center justify-center padding-xl foreground-tertiary">Unknown view type: ${type}</div>`;
    }
    
    currentViewElement.innerHTML = html;
  }
}

// =================== View UI Management ===================

function renderViewUI() {
  // Create view container
  if (!document.getElementById('view')) {
    const view = window.utils.createElementWithClass('div', '');
    view.id = 'view';
    view.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      overflow-y: auto;
    `;
    document.body.appendChild(view);
  }
  
  // Set up context references
  window.context?.setViewElement(document.getElementById('view'));
}

function removeViewUI() {
  const elements = ['view'];
  elements.forEach(id => {
    window.utils.removeElement(id);
  });
  
  // Clear context references
  window.context?.setViewElement(null);
}

// =================== Views Initialization ===================

function init() {
  // Initialize welcome view
  if (window.welcomeView) {
    window.welcomeView.init();
  }
  
  // Initialize memory view
  if (window.memoryView) {
    window.memoryView.init();
  }
  
  // Always render current view (including welcome when activeView is null)
  renderCurrentView();
}

// Export functions for global access
window.views = {
  // Registry access
  getView,
  getAllViews,
  getViewsByType,
  validateViewParams,
  VIEWS_REGISTRY,
  // UI functions
  renderViewUI,
  removeViewUI,
  renderCurrentView,
  init
}; 