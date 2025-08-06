// =================== Files Artifact Renderer ===================

// Helper function for consistent error message styling
function renderErrorMessage(message) {
  return `<div class="column align-center padding-xl foreground-tertiary">${message}</div>`;
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
      <div class="column align-center padding-l">
        <img src="${preview}" alt="${name}" class="transition hover-grow" style="max-width: 100%; max-height: 100%; object-fit: contain;" />
      </div>
    `;
  }
  // For text files, show the content
  else if (textContent) {
    const escapedContent = window.utils.escapeHtml(textContent);
    const ext = name.toLowerCase().split('.').pop();
    
    contentDisplay = `
      <div class="column" style="overflow: hidden;">
        <div class="row justify-between align-center gap-m background-secondary padding-s border-bottom">
          <span>File Content</span>
          <span class="background-tertiary padding-xs">${ext}</span>
        </div>
        <pre class="padding-l background-tertiary" style="margin: 0; overflow: auto; line-height: 1.6; white-space: pre-wrap; word-break: break-word;"><code class="language-${ext}">${escapedContent}</code></pre>
      </div>
    `;
  }
  // For other files, show file info only
  else {
    contentDisplay = `
      <div class="column align-center padding-xl text-center foreground-tertiary">
        <div style="margin-bottom: calc(var(--base-size) * 2);">Binary file - cannot preview content</div>
        <div>File type: ${type || 'Unknown'}</div>
      </div>
    `;
  }

  return `
    <div class="column background-primary" style="width: 100%; height: 100%; overflow: hidden;">
      <div class="row align-center justify-between padding-l background-secondary border-bottom">
        <div class="row align-center gap-m">
          <div class="column gap-xs">
            <div>${window.utils.escapeHtml(name)}</div>
            <div class="row gap-s">
              <span class="background-tertiary padding-xs">${formattedSize}</span>
              ${type ? `<span class="background-tertiary padding-xs">${type}</span>` : ''}
              <span class="background-tertiary padding-xs">via ${source}</span>
            </div>
          </div>
        </div>
        <div class="row gap-s">
          <button class="foreground-primary padding-s transition hover-up" 
                  style="border: none; cursor: pointer;" 
                  onclick="downloadFileArtifact('${window.utils.escapeHtml(name)}', '${(preview || textContent || '').replace(/'/g, '&apos;')}', '${type || ''}')">
            Download
          </button>
        </div>
      </div>
      ${contentDisplay}
    </div>
  `;
}

function renderFilesArtifact(artifact, currentVersionIdx, versionIndicator) {
  const currentVersion = artifact.versions[currentVersionIdx];
  const content = currentVersion.content;
  
  try {
    const fileData = JSON.parse(content);
    const fileContent = renderFileArtifact(fileData);
    
    // For file artifacts, add version management to the file viewer if needed
    if (versionIndicator) {
      // Modify the file content to include version controls in the header
      return fileContent.replace(
        '<div class="row align-center justify-between padding-l background-secondary border-bottom">',
        `<div class="row align-center justify-between padding-l background-secondary border-bottom">
          <div class="row align-center gap-s" style="position: absolute; top: calc(var(--base-size) * 0.5); right: calc(var(--base-size) * 1);">
            ${versionIndicator}
          </div>`
      );
    }
    
    return fileContent; // Return file viewer as-is if no multiple versions
  } catch (e) {
    return renderErrorMessage('Invalid file data');
  }
}

// Helper function to download file artifacts
function downloadFileArtifact(fileName, dataUrl, mimeType) {
  if (!dataUrl) {
    // No file data available for download - silently fail for better UX
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

// Export for use by main view-artifact/view-artifact.js
window.filesArtifactRenderer = {
  renderFilesArtifact,
  renderFileArtifact,
  downloadFileArtifact
};