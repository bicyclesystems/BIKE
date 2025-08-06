// =================== Markdown Artifact Renderer ===================

function renderMarkdownArtifact(artifact, currentVersionIdx, versionIndicator) {
  const currentVersion = artifact.versions[currentVersionIdx];
  const content = currentVersion.content;
  
  let contentHtml = '';
  
  try {
    // Check if marked library is available
    if (typeof marked !== 'undefined') {
      // Configure marked options for better rendering
      marked.setOptions({
        breaks: true,        // Convert \n to <br>
        gfm: true,          // GitHub Flavored Markdown
        headerIds: false,   // Don't generate header IDs
        sanitize: false     // We'll handle sanitization if needed
      });
      
      // Parse markdown to HTML
      const parsedHtml = marked.parse(content);
      contentHtml = `<div class="view align-center justify-center"><div class="page markdown-content">${parsedHtml}</div></div>`;
    } else {
      // Fallback if marked is not available
      console.warn('Marked library not available, falling back to plain text rendering');
      contentHtml = `<div class="view align-center justify-center"><pre>${window.utils.escapeHtml(content)}</pre></div>`;
    }
  } catch (error) {
    // Error handling - show raw content if parsing fails
    console.error('Markdown parsing error:', error);
    contentHtml = `<div class="view align-center justify-center"><pre>${window.utils.escapeHtml(content)}</pre></div>`;
  }
  
  return contentHtml;
}

// Export for use by main view-artifact/view-artifact.js
window.markdownArtifactRenderer = {
  renderMarkdownArtifact
};