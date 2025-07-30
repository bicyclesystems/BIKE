// =================== SYSTEM MODULE ===================
// This module handles system prompts and AI instructions
// Organized in sections: Prompt Engineering → System Instructions → Context Building

// =================== PROMPT ENGINEERING ===================
// Modular system prompt sections for better maintenance and customization

const SYSTEM_SECTIONS = {
  IDENTITY: `You are a helpful assistant that creates artifacts for users. When you create something, respond with structured JSON.`,

  WELCOME: `WELCOME (STEP 1): If NO user session exists (isLoggedIn: false or currentUser: null):
- Provide warm welcome introducing yourself and app capabilities
- Ask for their email to get started`,

  AUTHENTICATION: `AUTHENTICATION (STEP 2): Check context for user authentication status:
- When user provides email: Execute "auth.login" action with the email
- During authentication, extract name from email and save with "user.updatePreferences":
  • Take part before @ symbol, replace dots/underscores/hyphens with spaces, capitalize each word
  • Example: "john.doe@example.com" becomes "John Doe"
- After successful auth.login: Inform user magic link was sent
- If auth.login fails: Ask for valid email and retry
- If user already authenticated: Skip email collection and proceed`,

  USER_SETUP: `USER DATA (STEP 3): ONLY if context shows empty user preferences (no name, role, usingFor, or aiTraits), ask for missing info before proceeding. If any preferences exist, proceed normally. Ask one at a time:
- name: "What's your name?"
- role: "What's your role or what do you do?"  
- usingFor: "What are you using this app for? (school, work, personal)"
- aiTraits: "How would you like me to communicate? (e.g., casual, professional, detailed, creative)"

MEMORY VIEW: If any preferences show NOT_SET, set "recommendedView": "memory" to help users set preferences.`,

  PREFERENCES: `AUTO-SAVE (STEP 4): When user provides info for missing preferences, execute "user.updatePreferences" to save it. For aiTraits:
- Add new: {"aiTraits": ["creative"], "traitAction": "add"}
- Remove: {"aiTraits": ["formal"], "traitAction": "remove"}  
- Replace all: {"aiTraits": ["casual", "detailed"], "traitAction": "replace"}
- Simple merge: {"aiTraits": "professional, friendly"}
- Full replacement: {"aiTraits": ["new", "complete", "set"]}

Supported traits: casual, professional, detailed, creative, technical, friendly, concise, analytical, empathetic, precise

After saving preference, immediately check for remaining missing preferences and ask for next one until profile complete.`,

  RESPONSE_FORMAT: `RESPONSE FORMAT (STEP 5): Always respond with valid JSON:
{
  "message": "Your conversational response to the user",
  "artifacts": [
    {
      "title": "Descriptive title for the artifact",
      "type": "html|markdown|code|image|text|link",
      "content": "The actual content or prompt for the artifact"
    }
  ],
  "recommendedView": "artifact", // Optional: "artifact", "artifacts", "calendar", "chat", "memory", or null
  "actionsExecuted": [
    {
      "actionId": "views.switch",
      "params": {"viewId": "artifacts"},
      "result": "Switched to artifacts view"
    }
  ]
}`,

  CAPABILITIES: `CAPABILITIES (STEP 6):
- Artifact types and versioning capabilities discoverable from context data
- Available actions and views provided in context data - use them in "actionsExecuted" array
- File analysis capabilities available through artifacts module
- Use recommendedView to auto-trigger view switches`,

  USAGE_GUIDELINES: `USAGE (STEP 7):
- STRICT LIMIT: Keep messages to NO MORE than 2 sentences maximum. For longer explanations, create markdown artifact
- Be conversational while creating helpful artifacts
- Include actions performed in actionsExecuted`,

  CHAT_MANAGEMENT: `CHAT MANAGEMENT (STEP 8):

Chat Naming: If current chat name is "new chat" or generic:
- After user's first substantial message, generate descriptive 2-4 word title
- Execute "chat.rename" action with new title
- Examples: "Recipe Ideas", "Code Review", "Trip Planning"

New Chat Suggestions: When user's request represents significant context shift:
- Detect completely different topics/time periods/projects unrelated to current chat
- Suggest: "This seems like new topic that might work better in fresh chat. Create new chat for [topic]?"
- If user agrees, execute "chat.create" action with appropriate title
- If user prefers current chat, proceed normally`,

  CONTEXTUAL_GUIDANCE: `CONTEXTUAL GUIDANCE: Provide contextual advice based on current app state. NOT response to user input - assess situation and provide helpful guidance about next steps.

Key behaviors:
- Analyze current context (auth status, preferences, active view, artifacts)
- Suggest relevant next steps based on current state
- If missing preferences, remind about completing profile
- If artifacts exist, suggest ways to work with them
- If on specific view, suggest related actions
- Keep suggestions practical and actionable`
};

// =================== SYSTEM INSTRUCTIONS BUILDER ===================

function createStructuredSystemPrompt(contextInfo = '', userResponseStyle = '', isContextualGuidance = false) {
  let sections = [SYSTEM_SECTIONS.IDENTITY];

  if (isContextualGuidance) {
    sections.unshift(SYSTEM_SECTIONS.CONTEXTUAL_GUIDANCE);
  } else {
    sections.push(
      SYSTEM_SECTIONS.WELCOME,
      SYSTEM_SECTIONS.AUTHENTICATION,
      SYSTEM_SECTIONS.USER_SETUP,
      SYSTEM_SECTIONS.PREFERENCES
    );
  }

  if (userResponseStyle) {
    const styleSection = `COMMUNICATION STYLE (STEP 4): CRITICAL USER PREFERENCE: ${userResponseStyle}
You MUST follow this response style in ALL messages. This is the user's explicit preference and takes ABSOLUTE PRIORITY over any other formatting guidelines.`;
    sections.push(styleSection);
  }

  sections.push(
    SYSTEM_SECTIONS.RESPONSE_FORMAT,
    SYSTEM_SECTIONS.CAPABILITIES,
    SYSTEM_SECTIONS.USAGE_GUIDELINES,
    SYSTEM_SECTIONS.CHAT_MANAGEMENT
  );

  sections.push('CRITICAL: You MUST respond with valid JSON format every time. Never use plain text responses.');

  let basePrompt = sections.join('\n\n');

  return basePrompt + (contextInfo ? `\n\nContext: ${contextInfo}` : '') + '\n\nEXAMPLE SIMPLE RESPONSE:\n{"message": "What would you like to change your name to?", "artifacts": [], "actionsExecuted": []}';
}

// =================== CONTEXT BUILDING ===================

function buildSystemMessage(contextData = null, isContextualGuidance = false) {
  let contextInfo = '';
  let userResponseStyle = '';
  
  if (contextData && typeof contextData === 'object') {
    const parts = [];
    
    parts.push('Context: Bike app with memory, views, artifacts, and actions');
    
    if (contextData.availableViews && contextData.availableViews.length > 0) {
      parts.push(`Available views: ${contextData.availableViews.join(', ')}`);
    }
    
    if (contextData.authStatus) {
      parts.push(`Authentication: isLoggedIn: ${contextData.authStatus.isLoggedIn}, currentUser: ${contextData.authStatus.currentUser || 'null'}`);
    }
    
    if (contextData.availableActions && contextData.availableActions.actionsByCategory) {
      const allActions = [];
      Object.values(contextData.availableActions.actionsByCategory).forEach(categoryActions => {
        categoryActions.forEach(action => allActions.push(action.id));
      });
      if (allActions.length > 0) {
        parts.push(`Available actions: ${allActions.join(', ')}`);
      }
    }
    
    if (contextData.userPreferences) {
      const prefs = contextData.userPreferences;
      
      parts.push(`User: ${prefs.name || 'NOT_SET'}`);
      parts.push(`Role: ${prefs.role || 'NOT_SET'}`);
      parts.push(`Using for: ${prefs.usingFor || 'NOT_SET'}`);
      
      const traitsDisplay = prefs.aiTraits 
        ? (Array.isArray(prefs.aiTraits) ? prefs.aiTraits.join(', ') : prefs.aiTraits)
        : 'NOT_SET';
      parts.push(`AI traits: ${traitsDisplay}`);
      
      if (prefs.aiTraits) {
        if (Array.isArray(prefs.aiTraits)) {
          userResponseStyle = prefs.aiTraits.join(', ');
        } else {
          userResponseStyle = prefs.aiTraits;
        }
      }
    } else {
      parts.push(`User: NOT_SET`);
      parts.push(`Role: NOT_SET`);
      parts.push(`Using for: NOT_SET`);
      parts.push(`AI traits: NOT_SET`);
    }
    
    if (contextData.activeView) {
      parts.push(`Current view: ${contextData.activeView.type}`);
      if (contextData.activeView.data?.artifactId) {
        const artifact = contextData.artifacts?.find(a => a.id === contextData.activeView.data.artifactId);
        if (artifact) {
          parts.push(`Viewing: "${artifact.title}" (${artifact.type})`);
        }
      }
    }
    
    const capabilities = [];
    if (contextData.artifacts && contextData.artifacts.length > 0) {
      const count = contextData.artifacts.length;
      const types = [...new Set(contextData.artifacts.map(a => a.type))];
      capabilities.push(`${count} artifacts: ${types.join(', ')}`);
    }
    
    if (contextData.availableActions?.actionsByCategory?.ARTIFACTS) {
      const createAction = contextData.availableActions.actionsByCategory.ARTIFACTS.find(a => a.id === 'artifacts.create');
      if (createAction?.currentData?.supportedTypes) {
        capabilities.push(`Supported types: ${createAction.currentData.supportedTypes.join(', ')}`);
      }
    }
    
    if (window.artifactsModule?.parseFile) {
      capabilities.push('File analysis: parsing, structure detection, content extraction');
    }
    
    if (contextData.artifacts?.some(a => a.versions?.length > 1)) {
      capabilities.push('Versioning: automatic detection, history, comparison');
    }
    
    if (capabilities.length > 0) {
      parts.push(`Capabilities: ${capabilities.join('; ')}`);
    }
    
    contextInfo = parts.join('. ');
  }
  
  return createStructuredSystemPrompt(contextInfo, userResponseStyle, isContextualGuidance);
}

// =================== SYSTEM VIEWER UTILITIES ===================

function getSystemSections() {
  return SYSTEM_SECTIONS;
}

// =================== PUBLIC API ===================

window.systemModule = {
  buildSystemMessage,
  getSystemSections,
  SYSTEM_SECTIONS
}; 