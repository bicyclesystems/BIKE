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

// System prompt functionality moved to system.js module

// =================== Enhanced AI API Interface ===================

async function processContext(input = null, isContextualGuidance = false) {
  const contextData = window.context ? window.context.getContext() : null;

  
  // Build system message using system module
  const systemMessage = window.systemModule ? 
    await window.systemModule.system(contextData, isContextualGuidance) :
    'You are a helpful assistant. Respond with JSON format.';
  
  const messages = [
    { role: "system", content: systemMessage },
    ...(contextData?.messages || []).map(message => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content || message.structuredData?.main || ''
    }))
  ];
  
  // For contextual guidance, add a special message indicating this is a check-in
  if (isContextualGuidance) {
    messages.push({ 
      role: "user", 
      content: "Please provide contextual guidance based on the current app context. What should I do next or what options do I have right now?" 
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