// =================== Views Registry ===================

const VIEWS_REGISTRY = {
  chat: {
    id: "chat",
    name: "Chat",
    description: "Show the chat view",
    type: "chat",
    requiredParams: [],
    optionalParams: [],
    availableData: () => ({
      currentUser: window.user?.getActiveSession()?.user?.email || null,
      userPreferences: window.context?.getUserPreferences() || {},
    }),
    render: (data) => window.chatView.renderChatView(),
  },

  calendar: {
    id: "calendar",
    name: "Calendar",
    description: "Show the calendar view",
    type: "calendar",
    requiredParams: [],
    optionalParams: [],
    availableData: () => ({
      hasCalendarData: window.context?.getChats().length > 0,
      chatCount: window.context?.getChats().length,
    }),
    render: (data) => window.calendarView.renderCalendarView(),
  },

  artifacts: {
    id: "artifacts",
    name: "Artifacts",
    description: "Browse and manage all artifacts in a grid layout",
    type: "artifacts",
    requiredParams: [],
    optionalParams: ["filter", "sort"],
    availableData: () => ({
      artifacts: window.context?.getCurrentChatArtifacts() || [],
      totalArtifacts: (window.context?.getCurrentChatArtifacts() || []).length,
    }),
    render: (data) => window.artifactsView.renderArtifactsView(data),
  },

  artifact: {
    id: "artifact",
    name: "Artifact View",
    description: "View a specific artifact",
    type: "artifact",
    requiredParams: ["artifactId"],
    optionalParams: [],
    availableData: () => ({
      currentChatArtifacts: (
        window.context?.getCurrentChatArtifacts() || []
      ).map((a) => ({
        id: a.id,
        title: a.title,
        type: a.type,
        createdAt: a.createdAt,
      })),
      currentlyViewing:
        window.context?.getActiveView()?.type === "artifact"
          ? window.context.getActiveView().data.artifactId
          : null,
    }),
    render: (data) => window.artifactView.renderArtifactView(data),
  },

  memory: {
    id: "memory",
    name: "Memory",
    description:
      "View the entire memory system including chats, messages, artifacts, and storage status",
    type: "memory",
    requiredParams: [],
    optionalParams: [],
    availableData: () => ({
      memoryData: window.memory?.getContextData() || {},
      storageStatus: window.memory?.getStorageStatus() || {},
    }),
    render: (data) => {
      const html = window.memoryView.renderMemoryView();
      // Apply context highlighting specifically for memory view
      if (window.memoryView.applyContextHighlighting) {
        window.memoryView.applyContextHighlighting();
      }
      return html;
    },
  },

  services: {
    id: "services",
    name: "Services",
    description: "View upcoming services and integrations",
    type: "services",
    requiredParams: [],
    optionalParams: [],
    availableData: () => ({}),
    render: (data) => window.servicesView.renderServicesView(),
  },

  actions: {
    id: "actions",
    name: "Actions",
    description: "View all available actions you can perform",
    type: "actions",
    requiredParams: [],
    optionalParams: [],
    availableData: () => ({
      actions: window.actions?.ACTIONS_REGISTRY
        ? Object.values(window.actions.ACTIONS_REGISTRY)
        : [],
    }),
    render: (data) => {
      const html = window.actionsView.renderActionsView();
      // Apply context highlighting specifically for actions view
      if (window.actionsView.applyContextHighlighting) {
        window.actionsView.applyContextHighlighting();
      }
      return html;
    }
  },
  
  'system': {
    id: 'system',
    name: 'System',
    description: 'View the AI system prompt',
    type: 'system',
    requiredParams: [],
    optionalParams: [],
    availableData: () => ({
      systemSections: window.systemModule?.getSystemSections() || {}
    }),
    render: (data) => window.systemView.renderSystemView()
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
  return Object.values(VIEWS_REGISTRY).filter((view) => view.type === type);
}

function validateViewParams(viewId, params = {}) {
  const view = getView(viewId);
  if (!view) {
    return { valid: false, error: `View ${viewId} not found` };
  }

  const missingParams = view.requiredParams.filter(
    (param) => !(param in params)
  );
  if (missingParams.length > 0) {
    return {
      valid: false,
      error: `Missing required parameters for ${viewId}: ${missingParams.join(
        ", "
      )}`,
    };
  }

  return { valid: true };
}

// =================== View Rendering ===================

// State for managing transitions
let isTransitioning = false;

function renderCurrentView(withTransition = true) {
  const viewElement = window.context?.getViewElement();
  if (!viewElement)
    window.context?.setViewElement(document.getElementById("view"));

  const currentViewElement = window.context?.getViewElement();
  if (!currentViewElement) return;

  // Prevent multiple simultaneous transitions
  if (isTransitioning && withTransition) return;

  // Get new content
  const activeView = window.context?.getActiveView();
  let newHtml = "";

  if (!activeView) {
    // Always show memory view when activeView is null
    newHtml = window.memoryView.renderMemoryView();
  } else {
    const { type, data } = activeView;

    // Find the view in our registry that matches this type
    const view = Object.values(VIEWS_REGISTRY).find((v) => v.type === type);

    if (view && view.render) {
      newHtml = view.render(data);
    } else {
      newHtml = `<div class="column align-center justify-center padding-xl foreground-tertiary">Unknown view type: ${type}</div>`;
    }
  }

  //  Fetch Supabase session and update URL hash (but not during collaboration)
  try {
    const session = window.user?.getActiveSession();
    const sessionId = session?.user?.id;

    // Check if collaboration is active before changing URL
    const isCollaborating = window.collaboration?.isCollaborating;
    const isCollaborationActive =
      localStorage.getItem("collaborationActive") === "true";

    if (sessionId && !isCollaborating && !isCollaborationActive) {
      const viewType = activeView?.type;
      const newHash = `/${sessionId}/${viewType}`;
      if (location.hash !== `#${newHash}`) {
        history.replaceState(null, "", `#/${sessionId}/${viewType}`);
      }
    } else if (isCollaborating || isCollaborationActive) {
      console.log(
        "[VIEWS] 🛡️ Collaboration active - preserving collaboration URL"
      );
    }
  } catch (error) {
    console.error("Error getting Supabase session:", error);
  }

  // If no transition requested or view is empty, render immediately
  if (!withTransition || !currentViewElement.innerHTML.trim()) {
    currentViewElement.innerHTML = newHtml;
    return;
  }

  // Simple blur transition
  simpleBlurTransition(currentViewElement, newHtml);
}

function simpleBlurTransition(container, newHtml) {
  isTransitioning = true;

  // Add transition style
  container.style.transition = "filter 0.4s ease-out, opacity 0.4s ease-out";

  // Blur out current content
  container.style.filter = "blur(5px)";
  container.style.opacity = "0.5";

  setTimeout(() => {
    // Change content
    container.innerHTML = newHtml;

    // Blur in new content
    container.style.filter = "blur(0px)";
    container.style.opacity = "1";

    // Clean up after transition
    setTimeout(() => {
      container.style.transition = "";
      isTransitioning = false;
    }, 400);
  }, 400);
}

// =================== View UI Management ===================

function renderViewUI() {
  // Create view container
  if (!document.getElementById("view")) {
    const view = window.utils.createElementWithClass("div", "");
    view.id = "view";
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
  window.context?.setViewElement(document.getElementById("view"));
}

function removeViewUI() {
  const elements = ["view"];
  elements.forEach((id) => {
    window.utils.removeElement(id);
  });

  // Clear context references
  window.context?.setViewElement(null);
}

// =================== Views Initialization ===================

function init() {
  // Initialize chat view
  if (window.chatView) {
    window.chatView.init();
  }

  // Initialize memory view
  if (window.memoryView) {
    window.memoryView.init();
  }

  // Always render current view (including memory when activeView is null)
  renderCurrentView(false); // No transition on init
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
  simpleBlurTransition,
  init,
};
