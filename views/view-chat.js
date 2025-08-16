// =================== Chat View Rendering ===================

// Helper function to calculate duration display
function formatDuration(startTime, endTime) {
  const durationMs = endTime - startTime;
  const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
  const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
  return durationHours > 0 ? `${durationHours}h ${durationMinutes}m` : `${durationMinutes}m`;
}

// Helper function to get effective end time (explicit or inferred)
function getEffectiveEndTime(chat, activeChatId) {
  if (chat.endTime) {
    return new Date(chat.endTime);
  }
  
  // Infer from last message
  const messages = window.chat?.getMessagesByChat()[activeChatId] || [];
  if (messages.length > 0) {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.timestamp) {
      const lastTime = lastMessage.timestamp.includes('M') && !lastMessage.timestamp.includes(',')
        ? new Date(`${new Date().toDateString()} ${lastMessage.timestamp}`)
        : new Date(lastMessage.timestamp);
      
      if (!isNaN(lastTime)) {
        return lastTime;
      }
    }
  }
  
  return null; // No end time available
}

// Helper function to extract name from email (copied from view-memory.js)
function getNameFromEmail(email) {
  if (!email) return "there";
  // Extract the part before @ and capitalize first letter
  const namePart = email.split("@")[0];
  // Replace dots, underscores, numbers with spaces and capitalize
  const cleanName = namePart.replace(/[._\d]/g, " ").trim();
  // Capitalize first letter of each word
  return (
    cleanName
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ") || "there"
  );
}

function renderChatView() {
  const activeChatId = window.chat?.getActiveChatId();
  const chats = window.chat?.getChats() || [];
  const currentChat = chats.find(c => c.id === activeChatId);
  const currentChatTitle = currentChat?.title;

  // Get chat timeline info
  let timelineInfo = '';
  if (currentChat) {
    const startTime = new Date(currentChat.timestamp);
    const startFormatted = startTime.toLocaleDateString('en-US', { 
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
    });

    const endTime = getEffectiveEndTime(currentChat, activeChatId);
    
    if (endTime) {
      const endFormatted = endTime.toLocaleDateString('en-US', { 
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
      });
      
      const durationText = formatDuration(startTime, endTime);
      timelineInfo = `${startFormatted} - ${endFormatted} (${durationText})`;
    } else {
      timelineInfo = `${startFormatted} - ongoing`;
    }
  }

  // Get artifacts for this chat
  const artifacts = window.artifactsModule?.getCurrentChatArtifacts() || [];

  // Get user information for profiles
  const session = window.user?.getActiveSession();
  const email = session?.user?.email || "";
  const contextData = window.memory?.getContextData() || {};
  const userPreferences = contextData.userPreferences || {};
  const userName = userPreferences.name || getNameFromEmail(email);
  const userInitial = userName.charAt(0).toUpperCase();

  // Helper function to get type emoji
  function getTypeEmoji(type) {
    switch (type) {
      case 'html': return '🌐';
      case 'image': return '🖼️';
      case 'markdown': return '📝';
      case 'css': return '🎨';
      case 'javascript': return '⚡';
      case 'json': return '📋';
      default: return '📄';
    }
  }

  // Helper function to organize artifacts by folder
  function organizeArtifactsByFolder() {
    const folderGroups = new Map();
    const rootArtifacts = [];
    
    artifacts.forEach(artifact => {
      // Extract folder from path
      const path = artifact.path || '';
      const lastSlash = path.lastIndexOf('/');
      const folder = lastSlash >= 0 ? path.substring(0, lastSlash + 1) : '';
      
      if (!folder) {
        // Root artifacts - don't put them in a folder group
        rootArtifacts.push(artifact);
      } else {
        // Non-root artifacts - group by folder
        if (!folderGroups.has(folder)) {
          folderGroups.set(folder, []);
        }
        folderGroups.get(folder).push(artifact);
      }
    });
    
    // Convert to array format for rendering
    const groupedArtifacts = [];
    
    // First add root artifacts without folder grouping
    rootArtifacts.forEach(artifact => {
      groupedArtifacts.push({
        isGroup: false,
        artifact: artifact
      });
    });
    
    // Then add folder groups
    for (const [folder, folderArtifacts] of folderGroups) {
      if (folderArtifacts.length > 0) {
        const folderTitle = folder.replace('/', '');
        groupedArtifacts.push({
          isGroup: true,
          title: `📁 ${folderTitle}`,
          artifacts: folderArtifacts
        });
      }
    }
    
    return groupedArtifacts;
  }

  // Generate artifacts list HTML
  let artifactsHtml = '';
  if (artifacts.length > 0) {
    const organizedArtifacts = organizeArtifactsByFolder();
    const totalArtifacts = artifacts.length;
    
    artifactsHtml = `
      <div class="column align-start gap-s">
        <h4 class="opacity-half">Artifacts (${totalArtifacts})</h4>
        <div class="column align-start gap-xs">
          ${organizedArtifacts.map(section => {
            let sectionHtml = '';
            
            if (section.isGroup) {
              // Add group title for grouped sections
              if (section.title) {
                sectionHtml += `
                  <div class="row align-center gap-s opacity-half" style="padding-top: 8px;">
                    <span>${getTypeEmoji('group')}</span>
                    <span style="font-weight: 500;">${section.title}</span>
                  </div>
                `;
              }
              
              // Add artifacts in this group
              sectionHtml += section.artifacts.map(artifact => `
                <div class="row align-center gap-s opacity-hover cursor-pointer" onclick="window.context?.setActiveArtifactId('${artifact.id}')" style="padding-left: 24px;">
                  <span>${getTypeEmoji(artifact.type)}</span>
                  <span>${artifact.title}</span>
                  <span class="opacity-half">${artifact.versions.length} version${artifact.versions.length !== 1 ? 's' : ''}</span>
                </div>
              `).join('');
            } else {
              // Handle individual root artifacts (not in a group)
              const artifact = section.artifact;
              sectionHtml += `
                <div class="row align-center gap-s opacity-hover cursor-pointer" onclick="window.context?.setActiveArtifactId('${artifact.id}')">
                  <span>${getTypeEmoji(artifact.type)}</span>
                  <span>${artifact.title}</span>
                  <span class="opacity-half">${artifact.versions.length} version${artifact.versions.length !== 1 ? 's' : ''}</span>
                </div>
              `;
            }
            
            return sectionHtml;
          }).join('')}
        </div>
      </div>
    `;
  }

  return `
    <div class="column align-start justify-center padding-xl">
      <div class="column align-start">
        <div class="column align-start gap-l">
          <div class="column align-start gap-m">
            ${currentChatTitle ? `
              <h1>${currentChatTitle}</h1>
              <h3 class="${currentChat?.description ? 'opacity-full' : 'opacity-half'}">
                ${currentChat?.description || 'No description'}
              </h3>
              <div class="row align-center gap-m">
                <div class="circle background-secondary row align-center justify-center" style="width: 48px; height: 48px;">
                  <span class="text-l">${userInitial}</span>
                </div>
                <div class="circle border row align-center justify-center cursor-pointer" style="width: 48px; height: 48px;" onclick="">
                  <span class="text-l">+</span>
                </div>
              </div>
              ${timelineInfo ? `
                <h3>
                  ${timelineInfo}
                </h3>
              ` : ''}
              ${artifactsHtml}
            ` : `
              <h1>No active chat</h1>
            `}
          </div>
        </div>
      </div>
    </div>
  `;
}

// =================== Chat View Event Handlers ===================

function setupChatHandlers() {
  // No specific handlers needed for chat view currently
}

// =================== Chat View Initialization ===================

function init() {
  setupChatHandlers();
}

// Export functions for global access
window.chatView = {
  renderChatView,
  setupChatHandlers,
  init,
  formatDuration, // Export for reuse
  getEffectiveEndTime // Export for reuse
}; 