// =================== TEMPLATE CHAT SYSTEM ===================
// Creates template chats that exist as real chats in the system
// Each template has: chat.json + artifact.html

(function() {
  'use strict';
  
  // Template definitions
  const templates = {
    'template-personal': {
      name: 'Personal Todo App',
      description: 'A colorful todo app for personal tasks',
      chatTitle: '📝 Template: Personal Todo'
    }
    // Add more templates here:
    // 'template-business': { name: 'Business Dashboard', chatTitle: '📝 Template: Business Dashboard' },
    // 'template-creative': { name: 'Creative Portfolio', chatTitle: '📝 Template: Creative Portfolio' }
  };
  
  // Wait for the app to be fully initialized
  function waitForAppReady() {
    return new Promise((resolve) => {
      const checkReady = () => {
        if (window.context && window.context.getActiveChatId && window.memory && window.artifacts) {
          resolve();
        } else {
          setTimeout(checkReady, 100);
        }
      };
      checkReady();
    });
  }
  
  // Create/update template chats in the system (always fresh from files)
  async function createTemplateChats() {
    console.log('[TEMPLATE] Syncing template chats from files...');
    
    for (const [templateId, templateInfo] of Object.entries(templates)) {
      
      try {
        // Load chat configuration
        const chatResponse = await fetch(`./template/${templateId}/chat.json`);
        if (!chatResponse.ok) {
          throw new Error(`HTTP ${chatResponse.status}: ${chatResponse.statusText}`);
        }
        const chatConfig = await chatResponse.json();
        
        // Create/update the template chat
        const templateChat = {
          id: templateId,
          title: templateInfo.chatTitle,
          description: templateInfo.description,
          timestamp: new Date().toISOString()
        };
        
        // Load and create artifacts (handle both single artifact and versioned artifacts)
        const artifactConfigs = chatConfig.artifacts || [chatConfig.artifact];
        const artifacts = [];
        
        for (const artifactConfig of artifactConfigs) {
          try {
            let versions = [];
            
            // Check if this artifact has multiple versions
            if (artifactConfig.versions && artifactConfig.versions.length > 0) {
              // Load multiple versions for this artifact
              console.log(`[TEMPLATE] Loading ${artifactConfig.versions.length} versions for ${artifactConfig.title}`);
              
              for (const versionInfo of artifactConfig.versions) {
                try {
                  const versionResponse = await fetch(`./template/${templateId}/${versionInfo.filename}`);
                  if (!versionResponse.ok) {
                    throw new Error(`HTTP ${versionResponse.status}: ${versionResponse.statusText}`);
                  }
                  const versionContent = await versionResponse.text();
                  versions.push({
                    content: versionContent,
                    timestamp: new Date().toISOString(),
                    description: versionInfo.description
                  });
                } catch (versionError) {
                  console.warn(`[TEMPLATE] Failed to load version ${versionInfo.filename}:`, versionError);
                }
              }
            } else {
              // Load single artifact file (fallback)
              const artifactResponse = await fetch(`./template/${templateId}/${artifactConfig.filename}`);
              if (!artifactResponse.ok) {
                throw new Error(`HTTP ${artifactResponse.status}: ${artifactResponse.statusText}`);
              }
              const artifactContent = await artifactResponse.text();
              versions.push({
                content: artifactContent,
                timestamp: new Date().toISOString()
              });
            }
            
            // Create the artifact for this template chat (always fresh)
            const artifact = {
              id: artifactConfig.id,
              title: artifactConfig.title,
              type: artifactConfig.type,
              path: artifactConfig.path || artifactConfig.title, // Use path or fallback to title
              versions: versions,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              messageId: artifactConfig.messageId,
              chatId: templateId
            };
            
            artifacts.push(artifact);
          } catch (artifactError) {
            console.error(`[TEMPLATE] Failed to load artifact ${artifactConfig.id}:`, artifactError);
          }
        }
        
        // Always update template chat data (remove old, add fresh)
        const currentChats = window.context.getChats().filter(c => c.id !== templateId);
        const currentMessagesByChat = window.context.getMessagesByChat();
        const currentArtifacts = window.artifactsModule.getArtifacts().filter(a => a.chatId !== templateId);
        
        // Update with fresh content from files
        delete currentMessagesByChat[templateId]; // Remove old messages
        
        window.context.setContext({
          chats: [...currentChats, templateChat],
          messagesByChat: { 
            ...currentMessagesByChat, 
            [templateId]: chatConfig.messages 
          },
          artifacts: [...currentArtifacts, ...artifacts]
        });
        
        console.log(`[TEMPLATE] ✅ Synced template chat: ${templateInfo.chatTitle}`);
        
      } catch (error) {
        console.error(`[TEMPLATE] Failed to create template chat ${templateId}:`, error);
      }
    }
    
    // Save all template chats to memory
    if (window.memory && window.memory.save) {
      window.memory.save();
    }
  }
  
  // List available templates
  function listTemplates() {
    console.log('[TEMPLATE] Available template chats:');
    Object.entries(templates).forEach(([key, template]) => {
      console.log(`  ${key}: ${template.chatTitle}`);
      console.log(`    ${template.description}`);
    });
    return templates;
  }

  // Switch to a template chat
  function switchToTemplate(templateId) {
    if (templates[templateId]) {
      if (window.chat && window.chat.switchChat) {
        window.chat.switchChat(templateId);
        console.log(`🔄 Switched to template: ${templates[templateId].chatTitle}`);
      }
    } else {
      console.error(`[TEMPLATE] Template not found: ${templateId}`);
      console.log('Available templates:', Object.keys(templates));
    }
  }

  // Global functions for console use
  window.listTemplates = listTemplates;
  window.switchToTemplate = switchToTemplate;
  window.syncTemplates = function() {
    createTemplateChats();
    console.log('🔄 Syncing templates from files...');
  };
  
  // Keep old name for compatibility
  window.createTemplateChats = window.syncTemplates;
  
  // Shortcuts
  window.templates = listTemplates;

  // Sync template chats from files - run on load and periodically
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
      await waitForAppReady();
      setTimeout(() => createTemplateChats(), 1000); // Initial sync
      
      // Also sync template chats when you come back from editing files
      window.addEventListener('focus', () => {
        setTimeout(() => createTemplateChats(), 100);
      });
      
      // And when page becomes visible again
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          setTimeout(() => createTemplateChats(), 100);
        }
      });
    });
  } else {
    waitForAppReady().then(() => {
      setTimeout(() => createTemplateChats(), 1000);
      
      // Also sync template chats when you come back from editing files
      window.addEventListener('focus', () => {
        setTimeout(() => createTemplateChats(), 100);
      });
      
      // And when page becomes visible again
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          setTimeout(() => createTemplateChats(), 100);
        }
      });
    });
  }

})();