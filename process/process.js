// =================== PROCESS MODULE ===================
// This module handles AI communication only
// Organized in 2 sections: AI Communication → Coordination

// =================== AI COMMUNICATION ===================
// Everything about talking to AI: configuration, prompts, API calls

// AI configuration
const AI_CONFIG = {
  get API_KEY() {
    if (!window.API_KEY) {
      throw new Error('API_KEY not found. Please ensure config.js is loaded and API_KEY is set.');
    }
    return window.API_KEY;
  },
  CHAT_MODEL: 'gpt-4o',
  IMAGE_MODEL: 'dall-e-3',
  CHAT_API_URL: 'https://api.openai.com/v1/chat/completions',
  IMAGE_API_URL: 'https://api.openai.com/v1/images/generations'
};

// Expose AI_CONFIG globally for other modules
window.AI_CONFIG = AI_CONFIG;

// =================== Content Generation ===================

async function generateContent(apiType, payload, options = {}) {
  const endpoints = {
    chat: AI_CONFIG.CHAT_API_URL,
    image: AI_CONFIG.IMAGE_API_URL
  };
  
  const url = endpoints[apiType];
  if (!url) throw new Error(`Unknown API type: ${apiType}`);
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_CONFIG.API_KEY}`
      },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `HTTP ${res.status}`;
      throw new Error(errorMessage);
    }
    
    return await res.json();
  } catch (error) {
    const context = options.context || apiType;
    console.error(`[PROCESS] ${context} API call failed:`, error);
    throw error;
  }
}

// =================== SYSTEM PROMPTS ===================

function createStructuredSystemPrompt(contextInfo = '', userResponseStyle = '', isContextualGuidance = false) {
  const basePrompt = `You are a helpful assistant that creates artifacts for users. When you create something, respond with structured JSON.

${isContextualGuidance ? `🔄 CONTEXTUAL GUIDANCE MODE: You are being called to provide contextual advice and guidance based on the current app state. This is NOT a response to user input - instead, assess the current situation and provide helpful guidance about what the user might want to do next.

Key guidance behaviors:
- Analyze the current context (authentication status, user preferences, active view, artifacts, etc.)
- Suggest relevant next steps or actions based on the current state
- If the user is missing preferences, gently remind them about completing their profile
- If they have artifacts, suggest ways to work with them
- If they're on a specific view, suggest related actions they might want to take
- Keep suggestions practical and actionable
- Be proactive but not pushy - offer options rather than demands

` : ''}👋 WELCOME STEP (STEP 1): If NO user session exists (isLoggedIn: false or currentUser: null):
- First, provide a warm welcome message introducing yourself and the app's capabilities
- Explain briefly what the app can do
- Then naturally transition to asking for their email to get started
- Keep the welcome friendly and concise (1-2 sentences)

🔐 AUTHENTICATION FLOW (STEP 2): Check context for user authentication status:
- When user provides an email address: Immediately execute "auth.login" action with the email
- During authentication, automatically extract a name from the email address and save it:
  • Take the part before the @ symbol
  • Replace dots, underscores, and hyphens with spaces
  • Capitalize the first letter of each word
  • Execute "user.updatePreferences" action to save the extracted name
  • Example: "john.doe@example.com" becomes "John Doe"
  • Example: "sarah_smith@company.com" becomes "Sarah Smith"
- After successful auth.login: Inform user that magic link was sent and to check their email
- If auth.login fails: Ask for a valid email address and try again
- If user is already authenticated: Skip email collection and proceed with normal conversation

🔍 MISSING USER DATA (STEP 3): ONLY if the context shows one or more empty user preferences (no name, role, usingFor, or aiTraits), ask for the missing information before proceeding. If any preferences exist, proceed normally with the conversation. Ask one question at a time in a natural, conversational way. Core preferences to collect:
- name: "What's your name?"
- role: "What's your role or what do you do?"  
- usingFor: "What are you using this app for? (school, work, personal)"
- aiTraits: "How would you like me to communicate? You can mention multiple traits (e.g., casual, professional, detailed, creative, etc.)"

🧠 MEMORY VIEW NAVIGATION: If any user preferences are missing or not set (show NOT_SET), recommend switching to the memory view by setting "recommendedView": "memory" in your response. This helps users understand they can set up their preferences there.

💾 AUTO-SAVE PREFERENCES: When a user provides information that fills missing preferences, automatically execute the "user.updatePreferences" action to save it. For aiTraits, you can:
- Add new traits to existing array: {"aiTraits": ["creative"], "traitAction": "add"}
- Remove specific traits: {"aiTraits": ["formal"], "traitAction": "remove"}  
- Replace all traits: {"aiTraits": ["casual", "detailed"], "traitAction": "replace"}
- Simple merge (legacy): {"aiTraits": "professional, friendly"} (merges with existing)
- Full replacement (legacy): {"aiTraits": ["new", "complete", "set"]} (replaces all)

🎛️ TRAIT MANAGEMENT: Use the enhanced "user.updatePreferences" action with traitAction parameter:
- Add traits: {"aiTraits": ["creative", "empathetic"], "traitAction": "add"}
- Remove traits: {"aiTraits": ["formal"], "traitAction": "remove"}
- Replace all: {"aiTraits": ["casual", "detailed"], "traitAction": "replace"}
- Supported traits: casual, professional, detailed, creative, technical, friendly, concise, analytical, empathetic, precise

🔄 CONTINUE SETUP: After saving a preference, immediately check for remaining missing preferences and ask for the next one until the user profile is complete. Don't wait for the user to prompt - keep the setup flow going until all essential preferences are collected.

🎯 COMMUNICATION STYLE (STEP 4): ${userResponseStyle ? `CRITICAL USER PREFERENCE: ${userResponseStyle}
You MUST follow this response style in ALL your messages. This is the user's explicit preference and takes ABSOLUTE PRIORITY over any other formatting guidelines. Apply this style consistently to your "message" field in every response.

` : ''}📝 RESPONSE FORMAT (STEP 5): Always respond with valid JSON:
{
  "message": "Your conversational response to the user${userResponseStyle ? ` (following the style: ${userResponseStyle})` : ''}",
  "artifacts": [
    {
      "title": "Descriptive title for the artifact",
      "type": "html|markdown|code|image|text|link",
      "content": "The actual content or prompt for the artifact"
    }
  ],
  "recommendedView": "artifact", // Optional: "artifact", "artifacts", "calendar", "welcome", "memory", or null
  "actionsExecuted": [
    {
      "actionId": "views.switch",
      "params": {"viewId": "artifacts"},
      "result": "Switched to artifacts view"
    }
  ]
}

🛠️ CAPABILITIES & ACTIONS (STEP 6):
- Your supported artifact types and versioning capabilities are discoverable from the context data
- Your available actions and views are provided in the context data. Use them by including actions in the "actionsExecuted" array
- Your file analysis capabilities are available through the artifacts module in context data
- Execute actions from your context data in actionsExecuted array
- Use recommendedView to auto-trigger view switches

📋 USAGE GUIDELINES (STEP 7):
- Keep messages to 2-3 sentences. For longer explanations, create a markdown artifact instead
- CRITICAL: In your message, you MUST put artifact titles in square brackets like [Title]. This makes them clickable in the UI
- Be conversational in your message while creating helpful artifacts
- REMEMBER: Put artifact titles in [brackets] in your message and include any actions you perform in actionsExecuted!

💬 CHAT MANAGEMENT (STEP 8): Handle chat naming and organization intelligently:

**Chat Naming**: If the current chat name is "new chat" or similar generic name, automatically provide a meaningful name:
- After the user's first substantial message or request, generate a descriptive 2-4 word title
- Base the title on the main topic, request, or purpose of the conversation
- Execute a "chat.rename" action with the new title
- Examples: "Recipe Ideas" for cooking requests, "Code Review" for programming help, "Trip Planning" for travel assistance
- Keep titles concise, clear, and relevant to the conversation's main focus

**New Chat Suggestions**: When the user's request represents a significant context shift from the current conversation:
- Detect when user mentions completely different topics, time periods, or projects that don't relate to the current chat
- Examples: "create chat next week", switching from coding help to recipe planning, moving from work projects to personal tasks
- Politely acknowledge the request and suggest: "This seems like a new topic that might work better in a fresh chat. Would you like me to help you create a new chat for [topic]?"
- If user agrees, execute "chat.create" action with appropriate title
- If user prefers to continue in current chat, proceed normally with their request
- Don't suggest new chats for minor topic variations or follow-up questions within the same domain

🚨 CRITICAL: You MUST respond with valid JSON format every time. Never use plain text responses. 🚨`;

  return basePrompt + (contextInfo ? `\n\nContext: ${contextInfo}` : '') + '\n\nEXAMPLE SIMPLE RESPONSE:\n{"message": "What would you like to change your name to?", "artifacts": [], "actionsExecuted": []}';
}

function buildSystemMessage(contextData = null, isContextualGuidance = false) {
  // Convert context data to a comprehensive context string
  let contextInfo = '';
  let userResponseStyle = '';
  
  if (contextData && typeof contextData === 'object') {
    const parts = [];
    
    // App context - establish this is a capable system
    parts.push('Context: Bike app with memory, views, artifacts, and actions');
    
    // Available views - show what views are accessible
    if (contextData.availableViews && contextData.availableViews.length > 0) {
      parts.push(`Available views: ${contextData.availableViews.join(', ')}`);
    }
    
    // Authentication status - critical for AI to know if user is logged in
    if (contextData.authStatus) {
      parts.push(`Authentication: isLoggedIn: ${contextData.authStatus.isLoggedIn}, currentUser: ${contextData.authStatus.currentUser || 'null'}`);
    }
    
    // Available actions - list actual action IDs
    if (contextData.availableActions && contextData.availableActions.actionsByCategory) {
      const allActions = [];
      Object.values(contextData.availableActions.actionsByCategory).forEach(categoryActions => {
        categoryActions.forEach(action => allActions.push(action.id));
      });
      if (allActions.length > 0) {
        parts.push(`Available actions: ${allActions.join(', ')}`);
      }
    }
    
    // User context - Always include preference status so AI can see what's missing
    if (contextData.userPreferences) {
      const prefs = contextData.userPreferences;
      
      // Always show preference status (present or missing)
      parts.push(`User: ${prefs.name || 'NOT_SET'}`);
      parts.push(`Role: ${prefs.role || 'NOT_SET'}`);
      parts.push(`Using for: ${prefs.usingFor || 'NOT_SET'}`);
      
      // Handle aiTraits as array or string
      const traitsDisplay = prefs.aiTraits 
        ? (Array.isArray(prefs.aiTraits) ? prefs.aiTraits.join(', ') : prefs.aiTraits)
        : 'NOT_SET';
      parts.push(`AI traits: ${traitsDisplay}`);
      
      // Extract user response style for prominent display if set
      if (prefs.aiTraits) {
        if (Array.isArray(prefs.aiTraits)) {
          userResponseStyle = prefs.aiTraits.join(', ');
        } else {
          userResponseStyle = prefs.aiTraits;
        }
      }
    } else {
      // No userPreferences object at all
      parts.push(`User: NOT_SET`);
      parts.push(`Role: NOT_SET`);
      parts.push(`Using for: NOT_SET`);
      parts.push(`AI traits: NOT_SET`);
    }
    
    // Current state
    if (contextData.activeView) {
      parts.push(`Current view: ${contextData.activeView.type}`);
      if (contextData.activeView.data?.artifactId) {
        const artifact = contextData.artifacts?.find(a => a.id === contextData.activeView.data.artifactId);
        if (artifact) {
          parts.push(`Viewing: "${artifact.title}" (${artifact.type})`);
        }
      }
    }
    
    // Capabilities summary
    const capabilities = [];
    if (contextData.artifacts && contextData.artifacts.length > 0) {
      const count = contextData.artifacts.length;
      const types = [...new Set(contextData.artifacts.map(a => a.type))];
      capabilities.push(`${count} artifacts: ${types.join(', ')}`);
    }
    
    // Available artifact types from actions
    if (contextData.availableActions?.actionsByCategory?.ARTIFACTS) {
      const createAction = contextData.availableActions.actionsByCategory.ARTIFACTS.find(a => a.id === 'artifacts.create');
      if (createAction?.currentData?.supportedTypes) {
        capabilities.push(`Supported types: ${createAction.currentData.supportedTypes.join(', ')}`);
      }
    }
    
    // File analysis capabilities
    if (window.artifactsModule?.parseFile) {
      capabilities.push('File analysis: parsing, structure detection, content extraction');
    }
    
    // Versioning capabilities
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

// =================== Enhanced AI API Interface ===================

async function processContext(input = null, isContextualGuidance = false) {
  const contextData = window.context ? window.context.getContext() : null;
  
  // Build system message  
  const systemMessage = buildSystemMessage(contextData, isContextualGuidance);
  
  const messages = [
    { role: "system", content: systemMessage },
    ...(window.context?.getMessages() || []).map(message => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content || message.structuredData?.main || ''
    }))
  ];
  
  // For contextual guidance, add a special message indicating this is a check-in
  if (isContextualGuidance) {
    messages.push({ 
      role: "user", 
      content: "Please provide contextual guidance based on the current app state. What should I do next or what options do I have right now?" 
    });
  } else if (input && input.trim()) {
    // Only add user input if provided and not in contextual mode
    messages.push({ role: "user", content: input });
  }
  
  const payload = { 
    model: AI_CONFIG.CHAT_MODEL, 
    messages, 
    temperature: 0.7,
    response_format: { type: "json_object" }
  };
  
  try {
    const data = await generateContent('chat', payload, { context: 'Main AI conversation' });
    const content = data.choices[0].message.content;
    
    // Always parse as JSON since we always request structured format
    try {
      return JSON.parse(content);
    } catch (error) {
      console.error('[PROCESS] Failed to parse AI response as JSON:', error);
      // Fallback to treating it as a message-only response
      return {
        message: content,
        artifacts: [],
        recommendedView: null,
        actionsExecuted: []
      };
    }
  } catch (error) {
    throw new Error(`AI conversation failed: ${error.message}`);
  }
}



// =================== COORDINATION ===================
// Main flow: input processing → AI → orchestration

function process(input = null) {
  (async () => {
    try {
      let cleanText = null;
      let originalText = null;
      let isContextualGuidance = false;
      
      // Determine processing mode based on input availability
      if (input) {
        // Direct input provided - normal processing mode
        cleanText = input;
        originalText = input;
      } else if (window.inputModule) {
        // Try to get processed input from input module
        const processedInput = window.inputModule.getProcessedInput();
        if (processedInput) {
          cleanText = processedInput.cleanText;
          originalText = processedInput.originalText;
        }
      }
      
      // If no input found anywhere, switch to contextual guidance mode
      if (!cleanText) {
        isContextualGuidance = true;
        console.log('[PROCESS] No input found - switching to contextual guidance mode');
      }
      
      // Add user message only if we have input to display (not in contextual guidance mode)
      if (cleanText && !isContextualGuidance && window.messages && window.messages.addMessage) {
        const displayText = typeof originalText !== 'undefined' && originalText !== null ? originalText : cleanText;
        window.messages.addMessage('user', displayText);
      }
      
      // Show loading indicator when processing
      if (window.messages && window.messages.showLoadingIndicator) {
        window.messages.showLoadingIndicator();
      }
      
      // Process with AI (with contextual guidance flag if no input)
      const response = await processContext(cleanText, isContextualGuidance);
      
      // Orchestrate the response
      if (window.orchestrateModule && window.orchestrateModule.orchestrateAIResponse) {
        await window.orchestrateModule.orchestrateAIResponse(response, {
          generateContent,
          AI_CONFIG
        });
      }
      
      // Clear input if we used the input module and we're not in contextual guidance mode
      if (!input && !isContextualGuidance && window.inputModule && window.inputModule.clear) {
        window.inputModule.clear();
      }
    } catch (error) {
      console.error('Error in process():', error);
      // Hide loading on error
      if (window.messages && window.messages.hideLoadingIndicator) {
        window.messages.hideLoadingIndicator();
      }
      if (window.utils && window.utils.showError) {
        window.utils.showError(`AI Error: ${error.message}`);
      }
    }
  })();
}

// =================== PUBLIC API ===================

window.processModule = {
  // Core processing
  AI_CONFIG,
  generateContent, // Generate content for artifacts
  
  // Single processing endpoint
  process // Intelligently handles input processing or contextual guidance
};

// Also expose process function directly for easy access (used by session awareness)
window.process = process; 