// =================== Artifacts View ===================

function renderArtifactsView(data) {
  // For collaborators, show all artifacts from all chats
  // For leaders, show only artifacts from active chat
  const isCollaborator = window.collaboration?.isCollaborating && !window.collaboration?.isLeader;
  
  let artifacts;
  if (isCollaborator) {
    artifacts = window.context?.getArtifacts() || []; // All artifacts for collaborators
  } else {
    artifacts = window.context?.getCurrentChatArtifacts() || []; // Only active chat for leaders
  }
  
  // Group artifacts by their base artifact (same id) to show all versions together
  const artifactGroups = {};
  artifacts.forEach(artifact => {
    if (!artifactGroups[artifact.id]) {
      artifactGroups[artifact.id] = [];
    }
    artifactGroups[artifact.id].push(artifact);
  });
  
  // Convert to array and sort each group by version timestamp
  const groupedArtifacts = Object.values(artifactGroups).map(group => 
    group.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  );
  
  if (groupedArtifacts.length === 0) {
    const emptyMessage = isCollaborator 
      ? "No artifacts available in this collaboration session yet"
      : "No artifacts in this chat yet";
    const subMessage = isCollaborator
      ? "The leader will create artifacts that you can view here"
      : "Create some content to see it here";
      
    return `
      <div class="column align-center justify-center padding-xl">
        <div class="text-xl opacity-s">📁</div>
        <div class="text-m opacity-s">${emptyMessage}</div>
        <div class="text-s opacity-s">${subMessage}</div>
      </div>
    `;
  }
  
  const headerTitle = isCollaborator ? "All Artifacts" : "Artifacts";
  const headerSubtitle = isCollaborator ? "from all chats" : "";
  
  // Check if collaborator can edit artifacts
  const canEditArtifacts = window.collaboration?.canPerformAction('editArtifact') || false;
  
  let html = `
    <div class="column gap-l padding-l">
      <div class="row align-center gap-s">
        <div class="text-xl">🎨</div>
        <h2 class="text-xl">${headerTitle}</h2>
        <div class="background-tertiary padding-xs radius-s text-s opacity-s">${groupedArtifacts.length}</div>
        ${isCollaborator && canEditArtifacts ? '<div class="background-primary padding-xs radius-s text-s">✏️ Can Edit</div>' : ''}
        ${isCollaborator && !canEditArtifacts ? '<div class="background-secondary padding-xs radius-s text-s">👁️ View Only</div>' : ''}
      </div>
      ${headerSubtitle ? `<div class="text-s opacity-s">${headerSubtitle}</div>` : ''}
      ${isCollaborator ? `<div class="text-s opacity-s">${canEditArtifacts ? 'You can edit artifacts by saying "edit artifact [title]" in chat' : 'You can only view artifacts - ask leader for edit permissions'}</div>` : ''}
      <div class="row gap-m" style="flex-wrap: wrap;">`;
  
  // Render each artifact group (with all versions)
  groupedArtifacts.forEach(artifactGroup => {
    const latestArtifact = artifactGroup[0]; // First one is the latest due to sorting
    const currentVersionIdx = window.context?.getActiveVersionIndex(latestArtifact.id) ?? latestArtifact.versions.length - 1;
    const currentVersion = latestArtifact.versions[currentVersionIdx];
    const versionCount = latestArtifact.versions.length;
    const hasMultipleVersions = versionCount > 1;
    
    let preview = currentVersion.content.substring(0, 100) + '...';
    let typeEmoji = '📄';
    
    if (latestArtifact.type === 'link') {
      const url = currentVersion.content.trim();
      const domain = window.utils.getDomainFromUrl(url);
      const contentType = window.artifactView.detectLinkContentType ? 
        window.artifactView.detectLinkContentType(url) : 'webpage';
      
      switch (contentType) {
        case 'image':
          typeEmoji = '🖼️';
          preview = `Image from ${domain}`;
          break;
        case 'video':
          typeEmoji = '🎥';
          preview = `Video from ${domain}`;
          break;
        case 'pdf':
          typeEmoji = '📄';
          preview = `PDF from ${domain}`;
          break;
        case 'code':
          typeEmoji = '💻';
          preview = `Repository on ${domain}`;
          break;
        default:
          typeEmoji = '🌐';
          preview = `Website: ${domain}`;
          break;
      }
    } else if (latestArtifact.type === 'files') {
      try {
        const fileData = JSON.parse(currentVersion.content);
        const fileSize = window.artifactsModule.formatFileSize(fileData.size);
        const fileIcon = window.artifactsModule.getFileIcon(fileData.name, fileData.type);
        typeEmoji = fileIcon;
        preview = `${fileData.name} (${fileSize})`;
      } catch (e) {
        typeEmoji = '📁';
        preview = 'File (invalid data)';
      }
    } else if (currentVersion.content.startsWith('```')) {
      typeEmoji = '💻';
      const codeMatch = currentVersion.content.match(/```(\w+)?/);
      const language = codeMatch && codeMatch[1] ? codeMatch[1] : 'code';
      preview = `${language.charAt(0).toUpperCase() + language.slice(1)} code`;
    } else if (currentVersion.content.startsWith('[[image:')) {
      typeEmoji = '🖼️';
      preview = 'Image';
    }
    
    // For file artifacts, add emoji to title for display
    let displayTitle = latestArtifact.title;
    if (latestArtifact.type === 'files') {
      try {
        const fileData = JSON.parse(currentVersion.content);
        const fileIcon = window.artifactsModule.getFileIcon(fileData.name, fileData.type);
        displayTitle = artifact.title; // Keep title clean, emoji handled separately
      } catch (e) {
        displayTitle = artifact.title;
      }
    }
    
    const escapedTitle = window.utils.escapeHtml(displayTitle);
    const escapedPreview = window.utils.escapeHtml(preview);
    const escapedId = window.utils.escapeHtml(latestArtifact.id);
    

    
    // Handle click behavior differently for link artifacts
    let clickHandler;
    if (latestArtifact.type === 'link') {
      const url = currentVersion.content.trim();
      const escapedUrl = window.utils.escapeHtml(url);
      clickHandler = `onclick="window.open('${escapedUrl}', '_blank', 'noopener,noreferrer')"`;
    } else {
      clickHandler = `onclick="console.log('[ARTIFACTS] Clicking artifact:', '${escapedId}'); window.context.setActiveView('artifact', { artifactId: '${escapedId}' })"`;
    }
    
    // Enhanced version indicator with expandable version history
    let versionIndicator = '';
    if (hasMultipleVersions) {
      const isCurrentVersion = currentVersionIdx === latestArtifact.versions.length - 1;
      const versionHistoryId = `version-history-${latestArtifact.id}`;
      
      versionIndicator = `
        <div class="column gap-xs">
          <div class="row align-center gap-xs background-tertiary padding-xs radius-s transition" 
               onclick="event.stopPropagation(); toggleVersionHistory('${versionHistoryId}')">
            <span class="text-s">📚</span>
            <span class="text-s">${versionCount} versions</span>
          </div>
          
          <div class="row align-center gap-xs">
            <div class="background-${!isCurrentVersion ? 'negative' : 'positive'} foreground-primary padding-xs radius-s text-xs">
              v${currentVersionIdx + 1}
            </div>
            ${!isCurrentVersion ? '<div class="text-xs color-negative">⚠️ Older</div>' : '<div class="text-xs color-positive">✓ Current</div>'}
          </div>
          
          <div class="column gap-xs background-primary padding-m radius-s transition" id="${versionHistoryId}" style="display: block;">
            <div class="text-s color-primary">Version History</div>
            <div class="column gap-xs">
              ${latestArtifact.versions.map((version, idx) => {
                const isActive = idx === currentVersionIdx;
                const timestamp = new Date(version.timestamp).toLocaleString();
                return `
                  <div class="row align-center gap-s padding-s radius-s transition artifact-version-item ${isActive ? 'background-secondary' : 'background-tertiary'}" 
                       data-artifact-id="${latestArtifact.id}" 
                       data-version-idx="${idx}"
                       style="cursor: pointer; border: calc(var(--base-size) * 0.25) solid var(--color-tertiary-background); opacity: ${isActive ? '1' : '0.7'};"
                       onmouseover="this.style.opacity='1'; this.style.background='var(--color-tertiary-background)'; this.style.transform='translateX(calc(var(--base-size) * 1))'"
                       onmouseout="this.style.opacity='${isActive ? '1' : '0.7'}'; this.style.background='${isActive ? 'var(--color-secondary-background)' : 'var(--color-tertiary-background)'}'; this.style.transform='translateX(0)'"
                       onclick="event.stopPropagation(); window.artifactsView.switchToArtifactVersion('${latestArtifact.id}', ${idx});">
                    <div class="background-${isActive ? 'primary' : 'tertiary'} padding-xs radius-s text-xs">v${idx + 1}</div>
                    <div class="text-xs opacity-s">${timestamp}</div>
                    ${isActive ? '<div class="text-xs color-positive">Current</div>' : ''}
                  </div>
                `;
              }).reverse().join('')}
            </div>
          </div>
        </div>
      `;
    }
    

    
    // Card styling with better visual hierarchy
    const cardClass = `background-secondary padding-l radius-l transition`;
    
    // Add chat information for collaborators
    let chatInfo = '';
    if (isCollaborator && latestArtifact.chatId) {
      const chats = window.context?.getChats() || [];
      const chat = chats.find(c => c.id === latestArtifact.chatId);
      const chatName = chat ? chat.name : `Chat ${latestArtifact.chatId.substring(0, 8)}`;
      chatInfo = `<div class="text-xs opacity-s background-tertiary padding-xs radius-s">📝 ${window.utils.escapeHtml(chatName)}</div>`;
    }
    
    html += `
      <div class="${cardClass}" ${clickHandler} style="min-width: 320px; max-width: 400px; flex: 1;">
        <div class="column gap-m">
          <!-- Header with type and title -->
          <div class="row justify-between align-start gap-m">
            <div class="row align-center gap-m">
              <div class="text-xl">${typeEmoji}</div>
              <div class="column gap-xs">
                <div class="text-l">${escapedTitle}</div>
                <div class="text-s opacity-s">${escapedPreview}</div>
                ${chatInfo}
              </div>
            </div>
            <div class="row align-center gap-s">
              ${versionIndicator}
            </div>
          </div>
          
          <!-- Metadata footer -->
          <div class="row justify-between align-center gap-m background-tertiary padding-s radius-s">
            <div class="text-xs opacity-s">
              ${hasMultipleVersions ? 
                `Version ${currentVersionIdx + 1} of ${versionCount} • ${new Date(currentVersion.timestamp).toLocaleString()}` :
                `Updated ${new Date(latestArtifact.updatedAt).toLocaleString()}`
              }
            </div>
            ${hasMultipleVersions ? 
              `<div class="text-xs opacity-s">Created ${new Date(latestArtifact.createdAt).toLocaleString()}</div>` : 
              ''
            }
          </div>
        </div>
      </div>
    `;
  });
  
  html += '</div></div>';
  return html;
}

// =================== Enhanced Artifacts Interaction Functions ===================

function toggleVersionHistory(historyId) {
  const historyElement = document.getElementById(historyId);
  if (!historyElement) return;
  
  // Close all other open version histories first
  const allHistories = document.querySelectorAll('[id^="version-history-"]');
  allHistories.forEach(history => {
    if (history.id !== historyId) {
      window.utils.hideElement(history);
    }
  });
  
  // Toggle the current one
      if (historyElement.style.display === 'none' || !historyElement.style.display) {
    historyElement.style.display = 'block';
    
    // Add click outside to close
    setTimeout(() => {
      document.addEventListener('click', function closeVersionHistory(e) {
        if (!historyElement.contains(e.target) && !e.target.closest('[onclick*="toggleVersionHistory"]')) {
          historyElement.style.display = 'none';
          document.removeEventListener('click', closeVersionHistory);
        }
      });
    }, 100);
  } else {
    historyElement.style.display = 'none';
  }
}

function refreshArtifactsView() {
  // Re-render the artifacts view to reflect version changes
  const activeView = window.context?.getActiveView();
  if (activeView && activeView.type === 'artifacts') {
    if (window.views?.renderCurrentView) {
      window.views.renderCurrentView();
    }
  }
}

// =================== Enhanced Version Management ===================

function switchToArtifactVersion(artifactId, versionIdx) {
  const success = window.artifactsModule.setArtifactVersion(artifactId, versionIdx);
  if (success) {
    // Refresh artifacts to show updated version state
    refreshArtifactsView();
    
    // If the artifact is currently being viewed, update that too
    const activeView = window.context?.getActiveView();
    if (activeView && activeView.type === 'artifact' && 
        activeView.data.artifactId === artifactId) {
      if (window.views?.renderCurrentView) {
        window.views.renderCurrentView();
      }
    }
  }
}

function deleteArtifactVersionFromArtifacts(artifactId, versionIdx) {
  const success = window.artifactsModule.deleteArtifactVersion(artifactId, versionIdx);
  if (success) {
    // Refresh artifacts to show updated version state
    refreshArtifactsView();
  }
}

// =================== Module Exports ===================

// Export view-specific functions for global access
window.artifactsView = {
  renderArtifactsView,
  toggleVersionHistory,
  refreshArtifactsView,
  switchToArtifactVersion,
  deleteArtifactVersionFromArtifacts
};

// Make functions globally available for onclick handlers
window.toggleVersionHistory = toggleVersionHistory; 