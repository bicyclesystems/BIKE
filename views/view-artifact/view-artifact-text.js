// =================== Text Artifact Renderer ===================

function renderTextArtifact(artifact, currentVersionIdx, versionIndicator) {
  const currentVersion = artifact.versions[currentVersionIdx];
  const content = currentVersion.content;
  
  // Handle generic text content
  const contentHtml = `<div class="padding-m" style="line-height: 1.6; white-space: pre-wrap;">${window.utils.escapeHtml(content)}</div>`;
  
  return contentHtml;
}

// Export for use by main view-artifact.js
window.textArtifactRenderer = {
  renderTextArtifact
};