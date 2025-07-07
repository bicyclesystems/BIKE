// =================== Artifacts View ===================

function renderArtifactsView(data) {
  const artifacts = window.context?.getCurrentChatArtifacts() || [];
  
  if (artifacts.length === 0) {
    return `
      <div class="column align-center justify-center padding-xl">
        <div class="text-xl opacity-s">📁</div>
        <div class="text-m opacity-s">No artifacts in this chat yet</div>
        <div class="text-s opacity-s">Create some content to see it here</div>
      </div>
    `;
  }
  
  let html = `
    <div class="column gap-l padding-l">
      <div class="row align-center gap-s">
        <div class="text-xl">🎨</div>
        <h2 class="text-xl">Artifacts</h2>
        <div class="background-tertiary padding-xs radius-s text-s opacity-s">${artifacts.length}</div>
      </div>
      <div class="row gap-m" style="flex-wrap: wrap;">`;
  
  artifacts.forEach(artifact => {
    const currentVersionIdx = window.context?.getActiveVersionIndex(artifact.id) ?? artifact.versions.length - 1;
    const currentVersion = artifact.versions[currentVersionIdx];
    const versionCount = artifact.versions.length;
    const hasMultipleVersions = versionCount > 1;
    
    let preview = currentVersion.content.substring(0, 100) + '...';
    let typeEmoji = '📄';
    
    if (artifact.type === 'link') {
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
    } else if (artifact.type === 'files') {
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
    let displayTitle = artifact.title;
    if (artifact.type === 'files') {
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
    const escapedId = window.utils.escapeHtml(artifact.id);
    

    
    // Handle click behavior differently for link artifacts
    let clickHandler;
    if (artifact.type === 'link') {
      const url = currentVersion.content.trim();
      const escapedUrl = window.utils.escapeHtml(url);
      clickHandler = `onclick="window.open('${escapedUrl}', '_blank', 'noopener,noreferrer')"`;
    } else {
      clickHandler = `onclick="window.context.setActiveView('artifact', { artifactId: '${escapedId}' })"`;
    }
    
    // Enhanced version indicator with expandable version history
    let versionIndicator = '';
    if (hasMultipleVersions) {
      const isCurrentVersion = currentVersionIdx === artifact.versions.length - 1;
      const versionHistoryId = `version-history-${artifact.id}`;
      
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
          
          <div class="column gap-xs background-primary padding-m radius-s transition" id="${versionHistoryId}" style="display: none;">
            <div class="text-s color-primary">Version History</div>
            <div class="column gap-xs">
              ${artifact.versions.map((version, idx) => {
                const isActive = idx === currentVersionIdx;
                const timestamp = new Date(version.timestamp).toLocaleString();
                return `
                  <div class="row align-center gap-s padding-s radius-s transition artifact-version-item ${isActive ? 'background-secondary' : 'background-tertiary'}" 
                       data-artifact-id="${artifact.id}" 
                       data-version-idx="${idx}"
                       style="cursor: pointer; border: calc(var(--base-size) * 0.25) solid var(--color-tertiary-background); opacity: ${isActive ? '1' : '0.7'};"
                       onmouseover="this.style.opacity='1'; this.style.background='var(--color-tertiary-background)'; this.style.transform='translateX(calc(var(--base-size) * 1))'"
                       onmouseout="this.style.opacity='${isActive ? '1' : '0.7'}'; this.style.background='${isActive ? 'var(--color-secondary-background)' : 'var(--color-tertiary-background)'}'; this.style.transform='translateX(0)'"
                       onclick="event.stopPropagation(); window.artifactsView.switchToArtifactVersion('${artifact.id}', ${idx});">
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
    const cardClass = `background-secondary padding-l radius-l transition ${currentVersionIdx < artifact.versions.length - 1 ? 'opacity-s' : ''}`;
    
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
                `Updated ${new Date(artifact.updatedAt).toLocaleString()}`
              }
            </div>
            ${hasMultipleVersions ? 
              `<div class="text-xs opacity-s">Created ${new Date(artifact.createdAt).toLocaleString()}</div>` : 
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