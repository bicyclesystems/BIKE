// =================== AI Response Orchestration Module ===================
// Pure response interpretation and system coordination - no content generation

// =================== ORCHESTRATION UTILITIES ===================

function findBestMatchingArtifact(title, type, content) {
  const currentChatArtifacts = window.context?.getCurrentChatArtifacts() || [];
  
  // Private helper functions
  const levenshteinDistance = (str1, str2) => {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  };
  
  const calculateSimilarity = (str1, str2) => {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  };
  
  const extractHtmlElements = (html) => {
    const tagMatches = html.match(/<(\w+)(?:\s[^>]*)?>/g) || [];
    const classMatches = html.match(/class\s*=\s*["']([^"']+)["']/g) || [];
    
    const tags = tagMatches.map(tag => tag.match(/<(\w+)/)[1]);
    const classes = classMatches.map(cls => cls.match(/class\s*=\s*["']([^"']+)["']/)[1]);
    
    return [...new Set([...tags, ...classes])];
  };
  
  const calculateContentSimilarity = (content1, content2) => {
    // For HTML content, compare structure
    if (content1.includes('<html') && content2.includes('<html')) {
      const elements1 = extractHtmlElements(content1);
      const elements2 = extractHtmlElements(content2);
      
      const commonElements = elements1.filter(el => elements2.includes(el));
      const totalElements = new Set([...elements1, ...elements2]).size;
      
      return totalElements > 0 ? commonElements.length / totalElements : 0;
    }
    
    // For text content, use text similarity
    return calculateSimilarity(content1.substring(0, 500), content2.substring(0, 500));
  };
  
  // First, try exact title and type match
  let match = currentChatArtifacts.find(a => a.title === title && a.type === type);
  if (match) {
    return match;
  }
  
  // Try case-insensitive title match with same type
  match = currentChatArtifacts.find(a => 
    a.title.toLowerCase() === title.toLowerCase() && a.type === type
  );
  if (match) {
    return match;
  }
  
  // Try fuzzy title matching for refinements
  match = currentChatArtifacts.find(a => {
    if (a.type !== type) return false;
    const aTitle = a.title.toLowerCase();
    const newTitle = title.toLowerCase();
    
    const similarity = calculateSimilarity(aTitle, newTitle);
    const contains = aTitle.includes(newTitle) || newTitle.includes(aTitle);
    
    return contains || similarity > ARTIFACT_CONFIG.thresholds.fuzzyMatch;
  });
  if (match) return match;
  
  // For HTML apps and similar content, check content similarity
  if (['html', 'markdown', 'code'].includes(type)) {
    match = currentChatArtifacts.find(a => {
      if (a.type !== type) return false;
      const latestVersion = a.versions[a.versions.length - 1];
      const similarity = calculateContentSimilarity(latestVersion.content, content);
      
      return similarity > ARTIFACT_CONFIG.thresholds.structuralMatch;
    });
    if (match) return match;
  }
  
  return null;
}

function shouldUpdateArtifact(existingArtifact, newContent) {
  const latestVersion = existingArtifact.versions[existingArtifact.versions.length - 1];
  
  if (latestVersion.content.trim() === newContent.trim()) {
    return false;
  }
  
  // Private helper functions
  const levenshteinDistance = (str1, str2) => {
    const matrix = [];
    for (let i = 0; i <= str2.length; i++) matrix[i] = [i];
    for (let j = 0; j <= str1.length; j++) matrix[0][j] = j;
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[str2.length][str1.length];
  };
  
  const calculateSimilarity = (str1, str2) => {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    if (longer.length === 0) return 1.0;
    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  };
  
  const extractHtmlElements = (html) => {
    const tagMatches = html.match(/<(\w+)(?:\s[^>]*)?>/g) || [];
    const classMatches = html.match(/class\s*=\s*["']([^"']+)["']/g) || [];
    const tags = tagMatches.map(tag => tag.match(/<(\w+)/)[1]);
    const classes = classMatches.map(cls => cls.match(/class\s*=\s*["']([^"']+)["']/)[1]);
    return [...new Set([...tags, ...classes])];
  };
  
  const calculateContentSimilarity = (content1, content2) => {
    if (content1.includes('<html') && content2.includes('<html')) {
      const elements1 = extractHtmlElements(content1);
      const elements2 = extractHtmlElements(content2);
      const commonElements = elements1.filter(el => elements2.includes(el));
      const totalElements = new Set([...elements1, ...elements2]).size;
      return totalElements > 0 ? commonElements.length / totalElements : 0;
    }
    return calculateSimilarity(content1.substring(0, 500), content2.substring(0, 500));
  };
  
  const contentSimilarity = calculateContentSimilarity(latestVersion.content, newContent);
  return contentSimilarity > ARTIFACT_CONFIG.thresholds.contentSimilarity;
}

function isRefinedTitle(newTitle, oldTitle) {
  const newLower = newTitle.toLowerCase();
  const oldLower = oldTitle.toLowerCase();
  
  // Private helper functions
  const levenshteinDistance = (str1, str2) => {
    const matrix = [];
    for (let i = 0; i <= str2.length; i++) matrix[i] = [i];
    for (let j = 0; j <= str1.length; j++) matrix[0][j] = j;
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[str2.length][str1.length];
  };
  
  const calculateSimilarity = (str1, str2) => {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    if (longer.length === 0) return 1.0;
    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  };
  
  return newTitle.length > oldTitle.length && 
         (newLower.includes(oldLower) || calculateSimilarity(newLower, oldLower) > ARTIFACT_CONFIG.thresholds.fuzzyMatch);
}

// =================== UTILITY FUNCTIONS ===================

function getContextForGeneration() {
  const contextData = window.context ? window.context.getContext() : null;
  if (!contextData) return '';
  
  // Convert context data to a simple string for generation
  const parts = [];
  if (contextData.userPreferences?.name) parts.push(`User: ${contextData.userPreferences.name}`);
  if (contextData.userPreferences?.usingFor) parts.push(`Context: ${contextData.userPreferences.usingFor}`);
  if (contextData.artifacts?.length > 0) {
    const recent = contextData.artifacts.slice(-3).map(a => a.title).join(', ');
    parts.push(`Recent work: ${recent}`);
  }
  
  return parts.join('. ');
}

// =================== AI Response Orchestration ===================

async function orchestrateAIResponse(response, utilities) {
  // Check if response is a structured JSON object
  if (typeof response === 'object' && response.message && response.artifacts) {
    const artifactIds = {};
    const actionResults = [];
    
    // Get context once and reuse
    const contextForGeneration = getContextForGeneration();
    
    // Process structured artifacts - check if we should update existing ones
    for (const artifactData of response.artifacts) {
      let { title, type, content } = artifactData;
      
      // Enhanced content generation using specialized modules
      let finalContent = content;
      let detectedType = type;
      
      // If type is not specified or auto-detect is requested, detect it
      if (!type || type === 'auto') {
        detectedType = window.processContentModule.detectContentType(title, content);
      }
      
      // Look for existing artifacts early for context-aware generation
      const existingArtifact = findBestMatchingArtifact(title, detectedType, content);
      
      // Use specialized modules for content generation
      try {
        switch (detectedType) {
          case 'image':
            // Use process-image.js for image generation
            const imagePrompt = window.processImageModule.extractImagePrompt(title, contextForGeneration || content);
            
            // Check if we have a base image for context-aware generation
            const baseImageUrl = existingArtifact?.metadata?.baseImageUrl || null;
            const baseDescription = existingArtifact?.metadata?.description || null;
           
           if (baseImageUrl || baseDescription) {
             finalContent = await window.processImageModule.generateImage(imagePrompt, baseImageUrl, baseDescription, utilities);
           } else {
             finalContent = await window.processImageModule.generateBasicImage(imagePrompt, utilities);
           }
           finalContent = `[[image:${finalContent}]]`;
           break;
           
         case 'html':
         case 'markdown':
         case 'code':
           // Use process-content.js for content generation
           finalContent = await window.processContentModule.generateContentByType(detectedType, title, contextForGeneration || content, utilities);
           break;
           
         case 'auto':
           // Use process-content.js for auto-detection
           const generatedContent = await window.processContentModule.generateContentByType('auto', title, contextForGeneration || content, utilities);
           finalContent = generatedContent.content;
           detectedType = generatedContent.type;
           break;
           
         default:
           // Use original content for other types (text, link, etc.)
           finalContent = content;
           break;
       }
     } catch (generationError) {
       console.warn(`[ORCHESTRATE] Specialized generation failed for ${detectedType}, using original content:`, generationError);
       finalContent = content;
      }
      
      // Re-evaluate existing artifact match with final content (in case type changed)
      const finalExistingArtifact = findBestMatchingArtifact(title, detectedType, finalContent);
      
      // Create or update artifact
      let artifact;
      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      if (finalExistingArtifact && shouldUpdateArtifact(finalExistingArtifact, finalContent)) {
        // Update existing artifact with new version
        artifact = window.artifactsModule.update(finalExistingArtifact.id, finalContent);
        // Update title if it's been refined
        if (title !== finalExistingArtifact.title && isRefinedTitle(title, finalExistingArtifact.title)) {
          artifact.title = title;
        }
      } else {
        // Create new artifact and make it active
        artifact = create(finalContent, timestamp, detectedType, true);
        artifact.title = title;
      }
      
      // Store enhanced metadata
      if (!artifact.metadata) artifact.metadata = {};
      if (detectedType === 'image') {
        artifact.metadata.originalPrompt = content;
        // Analyze the generated image for future context
        try {
          const imageMatch = finalContent.match(/\[\[image:(.*?)\]\]/);
          if (imageMatch && imageMatch[1]) {
            const imageUrl = imageMatch[1].trim();
            const imageDescription = await window.processImageModule.analyzeImageWithVision(imageUrl, utilities);
            if (imageDescription) {
              artifact.metadata.description = imageDescription;
            }
          }
        } catch (error) {
          console.warn('Failed to analyze generated image:', error);
        }
      } else if (['html', 'markdown', 'code'].includes(detectedType)) {
        artifact.metadata.originalRequest = content;
        artifact.metadata.generationMethod = 'specialized';
      }
      
      window.context?.setContext({ artifacts: window.context.getArtifacts().map(a => a.id === artifact.id ? artifact : a) });
      saveArtifacts();
      
      artifactIds[title] = artifact.id;
    }

    // Track artifact creations simply
    if (response.artifacts && Array.isArray(response.artifacts)) {
      for (const artifactData of response.artifacts) {
        const { title } = artifactData;
        if (artifactIds[title]) {
          actionResults.push({
            actionId: 'artifacts.create',
            params: { title },
            actualResult: {
              actionName: `created ${title}`,
              success: true
            },
            verification: 'SUCCESS'
          });
        }
      }
    }

    // Process reported actions simply
    if (response.actionsExecuted && Array.isArray(response.actionsExecuted)) {

      for (const actionReport of response.actionsExecuted) {
        if (actionReport.actionId && !actionReport.actionId.startsWith('artifacts.')) {
          try {
            // Direct function call - no registry needed
            const [module, funcName] = actionReport.actionId.split('.');
            const moduleObj = window[module];
            
            if (!moduleObj || typeof moduleObj[funcName] !== 'function') {
              throw new Error(`Function ${actionReport.actionId} not found`);
            }
            
            const result = await moduleObj[funcName](...Object.values(actionReport.params || {}));
            
            actionResults.push({
              actionId: actionReport.actionId,
              actualResult: {
                actionName: funcName,
                success: true,
                result
              },
              verification: 'SUCCESS'
            });
          } catch (error) {
            console.error('[ACTIONS] Failed to execute:', actionReport.actionId, error.message);
            actionResults.push({
              actionId: actionReport.actionId,
              actualResult: {
                actionName: actionReport.actionId.replace(/^[^.]+\./, ''),
                success: false,
                error: error.message
              },
              verification: 'ERROR'
            });
          }
        }
      }
    }
    
    // Add the conversational message with incremental loading
    // Use the new incremental message system for smooth typewriter effect
    const structuredData = {
      main: response.message,
      artifacts: response.artifacts,
      actionsExecuted: response.actionsExecuted || [],
      actionResults: actionResults,
      fileAnalysisContext: response.fileAnalysisContext || null
    };
    
    // Use incremental message adding for smooth animation
    if (window.messages && window.messages.addMessage) {
      window.messages.addMessage('assistant', response.message, { 
        artifactIds: Object.keys(artifactIds).length > 0 ? artifactIds : null,
        structuredData,
        isIncremental: true 
      });
    } else {
      // Fallback to regular message adding if incremental system not available
      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const message = {
        role: 'assistant',
        content: response.message,
        structuredData,
        artifactIds,
        timestamp
      };
      
      let messages = window.context?.getMessagesByChat()[window.context?.getActiveChatId()] || [];
      messages.push(message);
      window.context?.setActiveMessages(messages);
      window.context?.setActiveMessageIndex(messages.length - 1);
      
      if (window.messages && window.messages.updateMessagesDisplay) {
        window.messages.updateMessagesDisplay();
      }
    }
    
    // Auto-switch to artifact view when artifacts are created
    if (Object.keys(artifactIds).length > 0) {
      const firstArtifactId = Object.values(artifactIds)[0];
      if (window.context && window.context.setActiveArtifactId) {
        window.context.setActiveArtifactId(firstArtifactId);
      }
    }

    // If there were action results, log them for transparency
    if (actionResults.length > 0) {
    
      
      // Optionally show action results in UI (for development/debugging)
      if (window.contextMenu && actionResults.some(r => r.verification !== 'SUCCESS')) {
        console.warn('[ORCHESTRATE] Some AI-reported actions failed verification:', 
          actionResults.filter(r => r.verification !== 'SUCCESS'));
      }
    }
    
    return;
  }
  
  // Invalid response format - this should never happen with structured-only mode
  console.error('[ORCHESTRATE] Received non-structured response:', response);
  
  // Add a fallback message
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const message = {
    role: 'assistant',
    content: typeof response === 'string' ? response : 'Invalid response format',
    structuredData: {
      main: typeof response === 'string' ? response : 'Invalid response format',
      artifacts: [],
      actionsExecuted: [],
      actionResults: []
    },
    artifactIds: {},
    timestamp
  };
  
  let messages = window.context?.getMessagesByChat()[window.context?.getActiveChatId()] || [];
  messages.push(message);
  window.context?.setActiveMessages(messages);
  window.context?.setActiveMessageIndex(messages.length - 1);
  
  if (window.messages && window.messages.updateMessagesDisplay) {
    window.messages.updateMessagesDisplay();
  }
}

// =================== Global Export ===================

const orchestrateModule = {
  // Core orchestration function - purely coordination, no content generation
  orchestrateAIResponse
};

// Ensure global assignment works in all contexts
window.orchestrateModule = orchestrateModule;
globalThis.orchestrateModule = orchestrateModule;

 