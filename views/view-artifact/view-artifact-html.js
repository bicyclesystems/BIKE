// =================== HTML Artifact Renderer ===================

// Helper function to generate fallback iframe content
function generateFallbackIframe(content) {
  const escapedContent = content.replace(/"/g, '&quot;');
  return `<iframe srcdoc="${escapedContent}" sandbox="allow-scripts allow-same-origin allow-forms" style="width: 100%; height: 100%; border: none;"></iframe>`;
}

async function renderHtmlArtifact(artifact, currentVersionIdx, versionIndicator) {
  const currentVersion = artifact.versions[currentVersionIdx];
  const content = currentVersion.content;
  
  let iframeContent;
  
  // Try to use nohost if available, fallback to srcdoc
  if (window.noHostManager && window.noHostManager.isAvailable()) {
    try {
      const chatId = window.context?.getActiveChatId();
      if (!chatId) {
        throw new Error('No active chat ID');
      }

      const artifactUrl = await window.noHostManager.getHtmlArtifactUrl(artifact, chatId);
      
      if (artifactUrl) {
        iframeContent = `<iframe src="${artifactUrl}" sandbox="allow-scripts allow-same-origin allow-forms" style="width: 100%; height: 100%; border: none;"></iframe>`;
      } else {
        throw new Error('Failed to create nohost URL');
      }
    } catch (error) {
      console.warn('[HTML Artifact] NoHost failed, falling back to srcdoc:', error);
      iframeContent = generateFallbackIframe(content);
    }
  } else {
    iframeContent = generateFallbackIframe(content);
  }
  
  if (versionIndicator) {
    // Return HTML content with floating version controls overlay
    return `
      <div style="position: relative; width: 100%; height: 100%;">
        ${iframeContent}
        <div style="position: absolute; top: calc(var(--base-size) * 1); right: calc(var(--base-size) * 1); z-index: 1000;">
          ${versionIndicator}
        </div>
      </div>
    `;
  }
  
  return iframeContent;
}

// Export for use by main view-artifact.js
window.htmlArtifactRenderer = {
  renderHtmlArtifact
};