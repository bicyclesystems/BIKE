// =================== Image Artifact Renderer ===================

// Helper function for consistent error message styling
function renderErrorMessage(message) {
  return `<div class="column align-center padding-xl foreground-tertiary">${message}</div>`;
}

function renderImageArtifact(artifact, currentVersionIdx, versionIndicator) {
  const currentVersion = artifact.versions[currentVersionIdx];
  const content = currentVersion.content;
  
  if (!content.startsWith('[[image:')) {
    return renderErrorMessage('Invalid image format');
  }
  
  const imageMatch = content.match(/\[\[image:(.*?)\]\]/);
  if (!imageMatch || !imageMatch[1]) {
    return renderErrorMessage('Invalid image format');
  }
  
  const imageUrl = imageMatch[1].trim();
  const imageContent = `<img src="${imageUrl}" alt="Generated image" onerror="this.outerHTML='${renderErrorMessage('Failed to load image').replace(/'/g, '&apos;')}'" />`;
  
  if (versionIndicator) {
    // Return image content with floating version controls overlay
    return `
      <div style="position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
        ${imageContent}
        <div style="position: absolute; top: calc(var(--base-size) * 1); right: calc(var(--base-size) * 1); z-index: 1000;">
          ${versionIndicator}
        </div>
      </div>
    `;
  }
  
  return imageContent;
}

// Export for use by main view-artifact.js
window.imageArtifactRenderer = {
  renderImageArtifact
};