// =================== AI Response Orchestration Module ===================
// Pure response interpretation and system coordination - no content generation

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
      const existingArtifact = window.artifactsModule.findBestMatchingArtifact(title, detectedType, content);
      
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
      const finalExistingArtifact = window.artifactsModule.findBestMatchingArtifact(title, detectedType, finalContent);
      
      // Create or update artifact
      let artifact;
      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      if (finalExistingArtifact && window.artifactsModule.shouldUpdateArtifact(finalExistingArtifact, finalContent)) {
        // Update existing artifact with new version
        artifact = window.artifactsModule.updateArtifact(finalExistingArtifact.id, finalContent);
        // Update title if it's been refined
        if (title !== finalExistingArtifact.title && window.artifactsModule.isRefinedTitle(title, finalExistingArtifact.title)) {
          artifact.title = title;
        }
      } else {
        // Create new artifact
        artifact = await createArtifact(finalContent, timestamp, detectedType);
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
      
      window.context?.setState({ artifacts: window.context.getArtifacts().map(a => a.id === artifact.id ? artifact : a) });
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
          if (window.actions && window.actions.executeAction) {
            try {
              const result = await window.actions.executeAction(actionReport.actionId, actionReport.params || {});
              actionResults.push({
                actionId: actionReport.actionId,
                actualResult: {
                  actionName: actionReport.actionId.replace(/^[^.]+\./, ''),
                  success: result.success
                },
                verification: result.success ? 'SUCCESS' : 'FAILED'
              });
            } catch (error) {
              actionResults.push({
                actionId: actionReport.actionId,
                actualResult: {
                  actionName: actionReport.actionId.replace(/^[^.]+\./, ''),
                  success: false
                },
                verification: 'ERROR'
              });
            }
          }
        }
      }
    }
    
    // Add the conversational message with incremental loading
    // Use the new incremental message system for smooth typewriter effect
    const structuredData = {
      main: response.message,
      artifacts: response.artifacts,
      recommendedView: response.recommendedView || null,
      actionsExecuted: response.actionsExecuted || [],
      actionResults: actionResults,
      fileAnalysisContext: response.fileAnalysisContext || null
    };
    
    // Use incremental message adding for smooth animation
    if (window.messages && window.messages.addMessage) {
      await window.messages.addMessage('assistant', response.message, { 
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
    
    // Show recommended view if specified
    if (response.recommendedView === 'artifact' && Object.keys(artifactIds).length > 0) {
      const firstArtifactId = Object.values(artifactIds)[0];
      if (window.context && window.context.setActiveArtifactId) {
        window.context.setActiveArtifactId(firstArtifactId);
      }
    } else if (response.recommendedView && response.recommendedView !== 'artifact') {
      if (window.context && window.context.setActiveView) {
        window.context.setActiveView(response.recommendedView);
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
      recommendedView: null,
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

 