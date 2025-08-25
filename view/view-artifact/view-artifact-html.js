// =================== HTML Artifact Renderer ===================

// Helper function to generate fallback iframe content
function generateFallbackIframe(content) {
  const escapedContent = content.replace(/"/g, '&quot;');
  return `<iframe srcdoc="${escapedContent}" sandbox="allow-scripts allow-same-origin allow-forms" style="width: 100%; height: 100%; border: none;"></iframe>`;
}

async function renderHtmlArtifact(artifact, currentVersionIdx, versionIndicator) {
  const currentVersion = artifact.versions[currentVersionIdx];
  const content = currentVersion.content;
  
  // Use srcdoc fallback method for HTML rendering
  const iframeContent = generateFallbackIframe(content);
  
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

// Export for use by main view-artifact/view-artifact.js
window.htmlArtifactRenderer = {
  renderHtmlArtifact
};