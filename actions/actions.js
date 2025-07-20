// =================== Central Actions Framework ===================
// This is the core actions framework that provides registry management,
// execution tracking, and coordination. Specific actions are defined in
// category-specific modules that register with this core system.

// =================== Action Categories ===================

const ACTION_CATEGORIES = {
  MESSAGES: 'messages',    // Renamed from CHAT to match messages.js
  ARTIFACTS: 'artifacts', 
  VIEWS: 'views',
  USER: 'user',           // Renamed from AUTH to match user.js 
  MEMORY: 'memory'        // Added to match memory.js
};

// =================== Action Registry ===================

// Central registry that modules register their actions with
const ACTIONS_REGISTRY = {};

// Registry management functions
function registerActions(actions) {
  Object.assign(ACTIONS_REGISTRY, actions);
}

function getActionsByCategory(category) {
  return Object.values(ACTIONS_REGISTRY).filter(action => action.category === category);
}

function getAction(actionId) {
  return ACTIONS_REGISTRY[actionId] || null;
}

function getAllActions() {
  return { ...ACTIONS_REGISTRY };
}

// =================== Action Execution Tracking ===================

// Global action history storage
const ACTION_HISTORY = {
  global: [], // All actions performed in current app session
  byChat: {}, // Actions per chat ID
  lastExecutedAction: null
};

// Action tracking utilities
function trackActionExecution(actionResult) {
  const activeChatId = window.context?.getActiveChatId();
  const trackedAction = {
    ...actionResult,
    timestamp: new Date().toISOString(),
    chatId: activeChatId
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

// =================== Utilities ===================

// Simplified result formatting
function createStandardizedResult(actionId, actionName, success, result = {}, error = null, message = '') {
  return {
    actionId,
    actionName: actionName.toLowerCase(),
    success,
    timestamp: new Date().toISOString(),
    result: result || {},
    message: message || '',
    error: error || null
  };
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
  const missingParams = action.requiredParams.filter(param => !(param in params));
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

  try {
    const result = await action.handler(params);
    
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
      acc[category] = getActionsByCategory(ACTION_CATEGORIES[category]).map(a => ({
        id: a.id,
        name: a.name,
        description: a.description,
        requiredParams: a.requiredParams,
        optionalParams: a.optionalParams,
        currentData: a.availableData ? a.availableData() : {}
      }));
      return acc;
    }, {}),
    currentState: {
      activeChatId: window.context?.getActiveChatId(),
      activeView: window.context?.getActiveView(),
      artifactCount: (window.context?.getCurrentChatArtifacts() || []).length,
      messageCount: (window.context?.getMessages() || []).length
    }
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
    actionsToFormat.forEach(action => {
      const category = action.category || 'other';
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(action);
    });
    return grouped;
  }
  
  return actionsToFormat.map(action => ({
    id: action.actionId,
    name: action.actionName,
    type: action.artifactType || action.result?.type || action.category,
    success: action.success,
    description: action.actionDescription || action.message,
    timestamp: includeTimestamps ? action.timestamp : undefined,
    details: action.result
  }));
}

function createActionDisplayData(chatId = null) {
  const actions = getActionHistory(chatId);
  const recentActions = getLastActions(10, chatId);
  
  return {
    totalActions: actions.length,
    recentActions: formatActionSummary(recentActions, { groupByType: false, includeTimestamps: true }),
    actionsByCategory: formatActionSummary(actions, { groupByType: true }),
    lastAction: ACTION_HISTORY.lastExecutedAction
  };
}

// =================== Export API ===================

window.actions = {
  // Registry management
  registerActions,
  getActionsByCategory,
  getAction,
  getAllActions,
  
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
  ACTION_HISTORY
};

// Make actions registry available globally for easy access (backward compatibility)
window.Actions = ACTIONS_REGISTRY;

 