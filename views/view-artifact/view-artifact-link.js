// =================== Link Artifact Renderer ===================

// Utility function to detect content type from URL
function detectLinkContentType(url) {
  const urlLower = url.toLowerCase();
  
  // Image extensions
  if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?|$)/i.test(urlLower)) {
    return 'image';
  }
  
  // Video extensions and platforms
  if (/\.(mp4|webm|ogg|avi|mov)(\?|$)/i.test(urlLower)) {
    return 'video';
  }
  
  // YouTube, Vimeo, etc.
  if (/(?:youtube\.com\/watch|youtu\.be\/|vimeo\.com\/)/i.test(urlLower)) {
    return 'video';
  }
  
  // PDF
  if (/\.pdf(\?|$)/i.test(urlLower)) {
    return 'pdf';
  }
  
  // Code repositories
  if (/github\.com|gitlab\.com|bitbucket\.org/i.test(urlLower)) {
    return 'code';
  }
  
  // Default to webpage
  return 'webpage';
}

function renderLinkArtifact(artifact, currentVersionIdx, versionIndicator) {
  const currentVersion = artifact.versions[currentVersionIdx];
  const content = currentVersion.content;
  
  const url = content.trim();
  const domain = window.utils.getDomainFromUrl(url);
  const contentType = detectLinkContentType(url);
  
  let linkTypeText = 'Website';
  
  switch (contentType) {
    case 'image':
      linkTypeText = 'Image';
      break;
    case 'video':
      linkTypeText = 'Video';
      break;
    case 'pdf':
      linkTypeText = 'PDF Document';
      break;
    case 'code':
      linkTypeText = 'Code Repository';
      break;
  }
  
  const contentHtml = `
    <div class="row align-center gap-m padding-l background-secondary border">
      <div class="column gap-xs">
        <div>${linkTypeText}</div>
        <div>${domain}</div>
        <a href="${url}" target="_blank" rel="noopener noreferrer" class="transition" style="text-decoration: none;">${url}</a>
      </div>
    </div>
  `;
  
  return contentHtml;
}

// Export for use by main view-artifact.js
window.linkArtifactRenderer = {
  renderLinkArtifact,
  detectLinkContentType
};