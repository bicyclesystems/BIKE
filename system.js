// System Module - builds AI prompts and instructions
async function loadReadmeContent() {
  try {
    const response = await fetch('./README.md');
    if (response.ok) {
      return await response.text();
    }
  } catch (error) {
    console.warn('[SYSTEM] Could not load README.md:', error);
  }
  return null;
}

let cachedReadmeContent = null;

async function getReadmeContent() {
  if (cachedReadmeContent === null) {
    cachedReadmeContent = await loadReadmeContent();
  }
  return cachedReadmeContent;
}

const SYSTEM_SECTIONS = {
  IDENTITY: `You are a helpful assistant that creates artifacts for users. When you create something, respond with structured JSON.`,

  README: '',

  WELCOME: `WELCOME (STEP 1): If NO user session exists (isLoggedIn: false or currentUser: null):
- Provide warm welcome introducing yourself and app capabilities
- Ask for their email to get started`,

  AUTHENTICATION: `AUTHENTICATION (STEP 2): Check context for user authentication status:
- When user provides email: Execute "user.login" action with the email
- During authentication, extract name from email and save with "user.updatePreferences":
  • Take part before @ symbol, replace dots/underscores/hyphens with spaces, capitalize each word
  • Example: "john.doe@example.com" becomes "John Doe"
- After successful user.login: Inform user magic link was sent
- If user.login fails: Ask for valid email and retry
- If user already authenticated: Skip email collection and proceed`,

  USER_SETUP: `USER DATA (STEP 3): ONLY if context shows empty user preferences (no name, role, usingFor, aiTraits, or collaboration), ask for missing info before proceeding. If any preferences exist, proceed normally. Ask one at a time:
- name: "What's your name?"
- role: "What's your role or what do you do?"  
- usingFor: "What are you using this app for? (school, work, personal)"
- collaboration: "How do you want to use BIKE? (solo / with others)" - If user chooses "with others", suggest: "You can invite teammates from the settings menu."
- aiTraits: "How would you like me to communicate? (e.g., casual, professional, detailed, creative)"

MEMORY VIEW: If any preferences show NOT_SET, execute "views.switchView" action with "viewId": "memory" to help users set preferences.`,

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
      "type": "html|markdown|text|image|files",
      "content": "The actual content or prompt for the artifact"
    }
  ],
  "actionsExecuted": [
    {
      "actionId": "module.function",
      "params": {"key": "value"},
      "result": "Action performed"
    }
  ]
}

IMPORTANT: When user makes a request (like "change theme"), you MUST include the corresponding action in actionsExecuted array.`,

  CAPABILITIES: `CAPABILITIES (STEP 6):
- Artifact types and versioning capabilities discoverable from context data
- Available functions are listed in context data - execute user requests by calling appropriate functions
- Use format: {"actionId": "module.function", "params": {key: value}} in actionsExecuted array`,

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

async function createStructuredSystemPrompt(appStateInfo = '', userResponseStyle = '', isContextualGuidance = false) {
  const readmeContent = await getReadmeContent();
  if (readmeContent) {
    SYSTEM_SECTIONS.README = `SYSTEM DOCUMENTATION:

${readmeContent}

This documentation describes exactly what you are and how you work. Use this knowledge to better understand your capabilities and guide user interactions appropriately.`;
  }

  let sections = [SYSTEM_SECTIONS.IDENTITY];


  if (SYSTEM_SECTIONS.README) {
    sections.push(SYSTEM_SECTIONS.README);
  }

  if (isContextualGuidance) {
    sections.push(SYSTEM_SECTIONS.CONTEXTUAL_GUIDANCE);
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

  return basePrompt + (appStateInfo ? `\n\nContext: ${appStateInfo}` : '') + '\n\nEXAMPLE SIMPLE RESPONSE:\n{"message": "What would you like to change your name to?", "artifacts": [], "actionsExecuted": []}';
}

function buildAvailableFunctions() {
  const byModule = MODULES.reduce((acc, name) => {
    const mod = window[name];
    if (mod && typeof mod === 'object') {
      const fns = Object.keys(mod).filter(k => typeof mod[k] === 'function');
      if (fns.length) acc[name] = fns;
    }
    return acc;
  }, {});
  
  return `Available Functions:\n${Object.entries(byModule).map(([m, f]) => `${m}: ${f.join(', ')}`).join('\n')}\n\nFormat: Use in actionsExecuted as 'module.function'`;
}

function getAvailableViews() {
  return window.views?.getAllViews?.()?.map(v => ({ 
    id: v.id, title: v.name, type: v.type 
  })) || [];
}

// Constants for DRY code
const PREF_FIELDS = ['name', 'role', 'usingFor', 'collaboration'];
const MODULES = ['chat', 'user', 'memory', 'artifactsModule', 'context', 'views', 'utils', 'messages', 'inputModule', 'processModule', 'systemModule', 'themeManager'];

const formatTraits = (traits) => Array.isArray(traits) ? traits.join(', ') : traits;
const getFieldValue = (obj, field) => obj?.[field] || 'NOT_SET';

const buildAppStateParts = {
  base: () => 'Bike app with memory, views, artifacts, and actions',
  
  views: () => {
    const views = getAvailableViews();
    return views.length ? `Available views: ${views.map(v => v.title || v.name || v.id).join(', ')}` : null;
  },
  
  auth: (auth) => auth ? `Authentication: isLoggedIn: ${auth.isLoggedIn}, currentUser: ${auth.currentUser || 'null'}` : null,
  
  actions: () => buildAvailableFunctions(),
  
  preferences: (prefs) => {
    if (!prefs) return PREF_FIELDS.map(f => `${f.charAt(0).toUpperCase() + f.slice(1)}: NOT_SET`).concat('AI traits: NOT_SET');
    
    const result = PREF_FIELDS.map(field => {
      const label = field === 'usingFor' ? 'Using for' : field.charAt(0).toUpperCase() + field.slice(1);
      return `${label}: ${getFieldValue(prefs, field)}`;
    });
    
    const traits = prefs.aiTraits ? formatTraits(prefs.aiTraits) : 'NOT_SET';
    result.push(`AI traits: ${traits}`);
    
    return result;
  },
  
  activeView: (view, artifacts) => {
    if (!view) return null;
    const parts = [`Current view: ${view.type}`];
    
    if (view.data?.artifactId) {
      const artifact = artifacts?.find(a => a.id === view.data.artifactId);
      if (artifact) parts.push(`Viewing: "${artifact.title}" (${artifact.type})`);
    }
    
    return parts;
  },
  
  artifacts: (artifacts) => {
    if (!artifacts?.length) return null;
    const types = [...new Set(artifacts.map(a => a.type))];
    const parts = [`Current artifacts: ${artifacts.length} artifacts (${types.join(', ')})`];
    
    if (artifacts.some(a => a.versions?.length > 1)) {
      parts.push('Versioned artifacts available for comparison');
    }
    
    return parts;
  }
};

async function system(contextData = null, isContextualGuidance = false) {
  let userResponseStyle = '';
  
  // Always provide some basic context, even if contextData is empty
  if (!contextData || Object.keys(contextData).length === 0) {
    const basicAppState = 'Bike app with memory, views, artifacts, and actions (no active context data)';
    return await createStructuredSystemPrompt(basicAppState, userResponseStyle, isContextualGuidance);
  }
  
  const parts = [buildAppStateParts.base()];
  
  // Build app state parts efficiently
  [
    buildAppStateParts.views(),
    buildAppStateParts.auth(contextData.authStatus),
    buildAppStateParts.actions(),
    ...buildAppStateParts.preferences(contextData.userPreferences),
    ...buildAppStateParts.activeView(contextData.activeView, contextData.artifacts) || [],
    ...buildAppStateParts.artifacts(contextData.artifacts) || []
  ].forEach(part => part && parts.push(part));
  
  // Extract user response style
  if (contextData.userPreferences?.aiTraits) {
    userResponseStyle = formatTraits(contextData.userPreferences.aiTraits);
  }
  
  return await createStructuredSystemPrompt(parts.join('. '), userResponseStyle, isContextualGuidance);
}


document.addEventListener('DOMContentLoaded', async () => {
  try {
    await getReadmeContent();
    console.log('[SYSTEM] README content pre-loaded successfully');
  } catch (error) {
    console.warn('[SYSTEM] Failed to pre-load README content:', error);
  }
});

window.systemModule = {
  system
}; 