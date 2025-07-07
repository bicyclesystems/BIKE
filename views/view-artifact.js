// =================== Artifact View ===================

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

// Render artifact view for different content types
function renderArtifactView(data) {
  const { artifactId } = data;
  const artifact = getArtifact(artifactId);
  
  if (!artifact) {
    return '<div class="column align-center justify-center padding-xl foreground-tertiary">Artifact not found</div>';
  }

  const currentVersionIdx = window.context?.getActiveVersionIndex(artifactId) ?? artifact.versions.length - 1;
  const currentVersion = artifact.versions[currentVersionIdx];
  
  if (!currentVersion) {
    return '<div class="column align-center justify-center padding-xl foreground-tertiary">Version not found</div>';
  }

  const content = currentVersion.content;

  // For image artifacts, just return the img element directly for full screen display
  if (artifact.type === 'image' && content.startsWith('[[image:')) {
    const imageMatch = content.match(/\[\[image:(.*?)\]\]/);
    if (imageMatch && imageMatch[1]) {
      const imageUrl = imageMatch[1].trim();
      return `<img src="${imageUrl}" alt="Generated image" onerror="this.outerHTML='<div class=&quot;column align-center justify-center padding-xl foreground-tertiary&quot;>Failed to load image</div>'" />`;
    } else {
      return '<div class="column align-center justify-center padding-xl foreground-tertiary">Invalid image format</div>';
    }
  }

  // For HTML artifacts, just return the iframe directly for full screen display  
  if (artifact.type === 'html') {
    // Properly escape the HTML content for srcdoc
    const escapedContent = content.replace(/"/g, '&quot;');
    return `<iframe srcdoc="${escapedContent}" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>`;
  }

  // For file artifacts, render file viewer
  if (artifact.type === 'files') {
    try {
      const fileData = JSON.parse(content);
      return renderFileArtifact(fileData);
    } catch (e) {
      return '<div class="column align-center justify-center padding-xl foreground-tertiary">Invalid file data</div>';
    }
  }

  // For other types, return with minimal styling
  let contentHtml = '';

  if (artifact.type === 'link') {
    const url = content.trim();
    const domain = window.utils.getDomainFromUrl(url);
    const contentType = detectLinkContentType(url);
    
    let linkIcon = '🌐';
    let linkTypeText = 'Website';
    
    switch (contentType) {
      case 'image':
        linkIcon = '🖼️';
        linkTypeText = 'Image';
        break;
      case 'video':
        linkIcon = '🎥';
        linkTypeText = 'Video';
        break;
      case 'pdf':
        linkIcon = '📄';
        linkTypeText = 'PDF Document';
        break;
      case 'code':
        linkIcon = '💻';
        linkTypeText = 'Code Repository';
        break;
    }
    
    contentHtml = `
      <div class="row align-center gap-m padding-l radius-s background-secondary" style="border: calc(var(--base-size) * 0.25) solid var(--color-secondary-background); margin: calc(var(--base-size) * 3) 0;">
        <div class="text-xl">${linkIcon}</div>
        <div class="column gap-xs">
          <div class="text-s foreground-tertiary" style="font-weight: 500;">${linkTypeText}</div>
          <div class="text-xs foreground-tertiary">${domain}</div>
          <a href="${url}" target="_blank" rel="noopener noreferrer" class="text-xs foreground-primary transition" style="text-decoration: none;">${url}</a>
        </div>
      </div>
    `;
  } else if (artifact.type === 'markdown' && content.startsWith('```')) {
    // Extract code from markdown code blocks
    const codeMatch = content.match(/```(\w+)?\n?([\s\S]*?)\n?```/);
    if (codeMatch) {
      const language = codeMatch[1] || 'text';
      const code = codeMatch[2];
      contentHtml = `<pre class="background-secondary radius-s padding-l" style="border: calc(var(--base-size) * 0.25) solid var(--color-tertiary-background); overflow-x: auto; margin: calc(var(--base-size) * 3) 0;"><code class="language-${language}" style="font-family: var(--font-mono); font-size: 0.9rem; line-height: 1.5;">${window.utils.escapeHtml(code)}</code></pre>`;
    } else {
      contentHtml = `<div class="padding-m" style="margin: calc(var(--base-size) * 3) 0; line-height: 1.6; white-space: pre-wrap;">${window.utils.escapeHtml(content)}</div>`;
    }
  } else {
    // Handle other artifact types (text, etc.)
    contentHtml = `<div class="padding-m" style="margin: calc(var(--base-size) * 3) 0; line-height: 1.6; white-space: pre-wrap;">${window.utils.escapeHtml(content)}</div>`;
  }

  // For file artifacts, we don't show the standard artifact header since the file viewer has its own header
  if (artifact.type === 'files') {
    return contentHtml; // The file viewer already includes all the header info
  }

  return `
    <div class="column gap-m padding-xl" style="max-width: calc(var(--base-size) * 250); margin: 0 auto;">
      <div class="column gap-s padding-m" style="border-bottom: 1px solid var(--color-secondary-background);">
        <h2 class="text-xl foreground-primary" style="font-weight: 500; margin: 0;">${artifact.title}</h2>
        <div class="text-s foreground-tertiary">
          Type: ${artifact.type} • Updated: ${new Date(artifact.updatedAt).toLocaleString()}
        </div>
      </div>
      ${contentHtml}
    </div>
  `;
}

// Render file artifact viewer
function renderFileArtifact(fileData) {
  const { name, size, type, textContent, preview, source } = fileData;
  
  // Get utility functions with fallbacks
  const formatFileSize = window.artifactsModule.formatFileSize;
  const getFileIcon = window.artifactsModule.getFileIcon;

  const icon = getFileIcon(name, type);
  const formattedSize = formatFileSize(size);
  
  let contentDisplay = '';
  
  // For images, show the preview
  if (type.startsWith('image/') && preview) {
    contentDisplay = `
      <div class="column align-center justify-center padding-l" style="overflow: hidden;">
        <img src="${preview}" alt="${name}" class="radius-s" style="max-width: 100%; max-height: 100%; object-fit: contain; box-shadow: 0 calc(var(--base-size) * 2) calc(var(--base-size) * 4) rgba(0, 0, 0, 0.1); transition: transform 0.2s ease;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'" />
      </div>
    `;
  }
  // For text files, show the content
  else if (textContent) {
    const escapedContent = window.utils.escapeHtml(textContent);
    const ext = name.toLowerCase().split('.').pop();
    
    contentDisplay = `
      <div class="column" style="overflow: hidden;">
        <div class="row justify-between align-center gap-m background-secondary padding-s" style="border-bottom: calc(var(--base-size) * 0.25) solid var(--color-tertiary-background);">
          <span class="text-s foreground-primary" style="font-weight: 600;">File Content</span>
          <span class="background-tertiary padding-xs radius-xs text-xs" style="font-family: var(--font-mono);">${ext}</span>
        </div>
        <pre class="padding-l" style="margin: 0; background: #fafafa; overflow: auto; font-size: calc(var(--base-size) * 2); line-height: 1.6; white-space: pre-wrap; word-break: break-word;"><code class="language-${ext}" style="font-family: 'Courier New', monospace; color: #374151;">${escapedContent}</code></pre>
      </div>
    `;
  }
  // For other files, show file info only
  else {
    contentDisplay = `
      <div class="column align-center justify-center padding-xl text-center foreground-tertiary">
        <div class="text-xxl opacity-s" style="font-size: calc(var(--base-size) * 16); margin-bottom: calc(var(--base-size) * 4);">${icon}</div>
        <div class="text-m" style="font-weight: 500; margin-bottom: calc(var(--base-size) * 2);">Binary file - cannot preview content</div>
        <div class="text-s opacity-s">File type: ${type || 'Unknown'}</div>
      </div>
    `;
  }

  return `
    <div class="column" style="width: 100%; height: 100%; background: var(--color-primary-background); overflow: hidden;">
      <div class="row align-center justify-between padding-l background-secondary" style="border-bottom: calc(var(--base-size) * 0.25) solid var(--color-tertiary-background);">
        <div class="row align-center gap-m">
          <div class="text-xl">${icon}</div>
          <div class="column gap-xs">
            <div class="text-m foreground-primary" style="font-weight: 600;">${window.utils.escapeHtml(name)}</div>
            <div class="row gap-s text-xs foreground-tertiary">
              <span class="background-tertiary padding-xs radius-xs">${formattedSize}</span>
              ${type ? `<span class="background-tertiary padding-xs radius-xs">${type}</span>` : ''}
              <span class="background-tertiary padding-xs radius-xs">via ${source}</span>
            </div>
          </div>
        </div>
        <div class="row gap-s">
          <button class="background-primary foreground-secondary padding-s radius-s text-s transition" 
                  style="border: none; font-weight: 500; cursor: pointer;" 
                  onmouseover="this.style.background='var(--color-secondary)'; this.style.transform='translateY(calc(var(--base-size) * -0.25))'"
                  onmouseout="this.style.background='var(--color-primary-foreground)'; this.style.transform='translateY(0)'"
                  onclick="downloadFileArtifact('${window.utils.escapeHtml(name)}', '${(preview || textContent || '').replace(/'/g, '&apos;')}', '${type || ''}')">
            💾 Download
          </button>
        </div>
      </div>
      ${contentDisplay}
    </div>
  `;
}

// Helper function to download file artifacts
function downloadFileArtifact(fileName, dataUrl, mimeType) {
  if (!dataUrl) {
    alert('No file data available for download');
    return;
  }

  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  link.style.display = 'none';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Export for global access
window.artifactView = {
  renderArtifactView,
  detectLinkContentType,
  renderFileArtifact,
  downloadFileArtifact
}; 