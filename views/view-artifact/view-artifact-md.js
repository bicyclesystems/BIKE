// =================== Markdown Artifact Renderer ===================

function renderMarkdownArtifact(artifact, currentVersionIdx, versionIndicator) {
  const currentVersion = artifact.versions[currentVersionIdx];
  const content = currentVersion.content;
  
  let contentHtml = '';
  
  if (content.startsWith('```')) {
    // Extract code from markdown code blocks
    const codeMatch = content.match(/```(\w+)?\n?([\s\S]*?)\n?```/);
    if (codeMatch) {
      const language = codeMatch[1] || 'text';
      const code = codeMatch[2];
      contentHtml = `<pre class="background-secondary padding-l border" style="overflow-x: auto;"><code class="language-${language}">${window.utils.escapeHtml(code)}</code></pre>`;
    } else {
      contentHtml = `<div class="padding-m" style="line-height: 1.6; white-space: pre-wrap;">${window.utils.escapeHtml(content)}</div>`;
    }
  } else {
    // Handle regular markdown content
    contentHtml = `<div class="padding-m" style="line-height: 1.6; white-space: pre-wrap;">${window.utils.escapeHtml(content)}</div>`;
  }
  
  return contentHtml;
}

// Export for use by main view-artifact.js
window.markdownArtifactRenderer = {
  renderMarkdownArtifact
};