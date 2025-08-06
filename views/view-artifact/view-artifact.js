// =================== Artifact View ===================

// Helper function for consistent error message styling
function renderErrorMessage(message) {
  return `<div class="column align-center padding-xl foreground-tertiary">${message}</div>`;
}

// Generate reusable version management UI
function generateVersionIndicator(artifact, currentVersionIdx) {
  const versionCount = artifact.versions.length;
  const hasMultipleVersions = versionCount > 1;
  
  if (!hasMultipleVersions) {
    return '';
  }
  
  const isCurrentVersion = currentVersionIdx === artifact.versions.length - 1;
  const versionHistoryId = `version-history-${artifact.id}`;
  
  return `
    <div class="column gap-xs">
      <div class="row align-center gap-xs background-tertiary padding-xs radius-s transition" 
           onclick="event.stopPropagation(); toggleVersionHistory('${versionHistoryId}')">
        <span>${versionCount} versions</span>
      </div>
      
      <div class="row align-center gap-xs">
        <div class="background-${!isCurrentVersion ? 'negative' : 'positive'} foreground-primary padding-xs radius-s">
          v${currentVersionIdx + 1}
        </div>
        ${!isCurrentVersion ? '<div>Older</div>' : '<div>Current</div>'}
      </div>
      
      <div class="column gap-xs background-primary padding-m radius-s transition" id="${versionHistoryId}" style="display: none;">
        <div>Version History</div>
        <div class="column gap-xs">
          ${artifact.versions.map((version, idx) => {
            const isActive = idx === currentVersionIdx;
            const timestamp = new Date(version.timestamp).toLocaleString();
            return `
              <div class="row align-center gap-s padding-s radius-s transition artifact-version-item ${isActive ? 'background-secondary' : 'background-tertiary'}" 
                   data-artifact-id="${artifact.id}" 
                   data-version-idx="${idx}"
                   style="cursor: pointer; opacity: ${isActive ? '1' : '0.7'};"
                   onmouseover="this.style.opacity='1'; this.style.background='var(--color-tertiary-background)'"
                   onmouseout="this.style.opacity='${isActive ? '1' : '0.7'}'; this.style.background='${isActive ? 'var(--color-secondary-background)' : 'var(--color-tertiary-background)'}'"
                   onclick="event.stopPropagation(); window.artifactView.switchToArtifactVersion('${artifact.id}', ${idx});">
                <div class="background-${isActive ? 'primary' : 'tertiary'} padding-xs radius-s">v${idx + 1}</div>
                <div>${timestamp}</div>
                ${isActive ? '<div>Current</div>' : ''}
              </div>
            `;
          }).reverse().join('')}
        </div>
      </div>
    </div>
  `;
}

// Import modular renderers - moved to specialized files

// Render artifact view for different content types
async function renderArtifactView(data) {
  const { artifactId } = data;
  const artifact = window.context?.getArtifact(artifactId);
  
  if (!artifact) {
    return renderErrorMessage('Artifact not found');
  }

  const currentVersionIdx = window.context?.getActiveVersionIndex(artifactId) ?? artifact.versions.length - 1;
  const currentVersion = artifact.versions[currentVersionIdx];
  
  if (!currentVersion) {
    return renderErrorMessage('Version not found');
  }

  const content = currentVersion.content;
  const versionIndicator = generateVersionIndicator(artifact, currentVersionIdx);

  // Use modular renderers for type-specific content
  if (artifact.type === 'image' && (content.startsWith('[[image:') || content.trim().startsWith('<svg'))) {
    return window.imageArtifactRenderer.renderImageArtifact(artifact, currentVersionIdx, versionIndicator);
  }

  if (artifact.type === 'html') {
    return await window.htmlArtifactRenderer.renderHtmlArtifact(artifact, currentVersionIdx, versionIndicator);
  }

  if (artifact.type === 'files') {
    return window.filesArtifactRenderer.renderFilesArtifact(artifact, currentVersionIdx, versionIndicator);
  }

  // Use modular renderers for remaining types
  let contentHtml = '';

  if (artifact.type === 'link') {
    contentHtml = window.linkArtifactRenderer.renderLinkArtifact(artifact, currentVersionIdx, versionIndicator);
  } else if (artifact.type === 'markdown') {
    // For markdown, return just the content without any artifact info
    return window.markdownArtifactRenderer.renderMarkdownArtifact(artifact, currentVersionIdx, versionIndicator);
  } else {
    // Handle other artifact types (text, etc.)
    contentHtml = window.textArtifactRenderer.renderTextArtifact(artifact, currentVersionIdx, versionIndicator);
  }

  // Generate version management UI for standard artifact types

  return `
    <div class="column">
      ${versionIndicator ? `<div class="row justify-end padding-s">${versionIndicator}</div>` : ''}
      ${contentHtml}
    </div>
  `;
}

// File artifact functions moved to view-artifact-files.js

// Version management functions for artifact view
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

function switchToArtifactVersion(artifactId, versionIdx) {
  const success = window.artifactsModule.setArtifactVersion(artifactId, versionIdx);
  if (success) {
    // Refresh the current artifact view to show updated version
    const activeView = window.context?.getActiveView();
    if (activeView && activeView.type === 'artifact' && 
        activeView.data.artifactId === artifactId) {
      if (window.views?.renderCurrentView) {
        window.views.renderCurrentView();
      }
    }
    
    // Also refresh artifacts view if it's open in the background
    if (window.artifactsView?.refreshArtifactsView) {
      window.artifactsView.refreshArtifactsView();
    }
  }
}

// Export for global access
window.artifactView = {
  renderArtifactView,
  toggleVersionHistory,
  switchToArtifactVersion,
  generateVersionIndicator
};

// Make functions globally available for onclick handlers
window.toggleVersionHistory = toggleVersionHistory;
window.downloadFileArtifact = window.filesArtifactRenderer.downloadFileArtifact; 