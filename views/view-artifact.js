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
  console.log("[ARTIFACT] renderArtifactView called with data:", data);
  
  const { artifactId } = data;
  const artifact = getArtifact(artifactId);
  
  console.log("[ARTIFACT] Found artifact:", artifact);
  
  if (!artifact) {
    console.error("[ARTIFACT] Artifact not found for ID:", artifactId);
    return '<div class="column align-center justify-center padding-xl foreground-tertiary">Artifact not found</div>';
  }

  // Get current version index - default to 0 (latest version) since we now store latest first
  const currentVersionIdx = window.context?.getActiveVersionIndex(artifactId) ?? 0;
  const currentVersion = artifact.versions[currentVersionIdx];
  
  if (!currentVersion) {
    return '<div class="column align-center justify-center padding-xl foreground-tertiary">Version not found</div>';
  }

  const content = currentVersion.content;

  // Check if user can edit this artifact
  const canEdit = window.collaboration?.canPerformAction('editArtifact') || false;
  const isCollaborator = window.collaboration?.isCollaborating && !window.collaboration?.isLeader;
  
  // Permission check for collaborative editing
  if (isCollaborator && !canEdit) {
    console.log("[ARTIFACT] 🔒 Permission denied: Collaborator cannot edit artifacts");
    return `
      <div class="column align-center justify-center padding-xl">
        <div class="background-secondary padding-l radius-m">
          <div class="text-l margin-bottom-m">🔒</div>
          <div class="text-m foreground-primary margin-bottom-s">View Only Mode</div>
          <div class="text-s foreground-tertiary">You don't have permission to edit this artifact.</div>
          <div class="text-s foreground-tertiary margin-top-s">Ask the session leader for edit permissions.</div>
        </div>
      </div>
    `;
  }
  
  // Auto-enable edit mode for collaborators with edit permissions on ALL artifacts
  if (canEdit && !window.artifactEditMode?.[artifactId]) {
    window.artifactEditMode = window.artifactEditMode || {};
    window.artifactEditMode[artifactId] = true;
    console.log("[ARTIFACT] ✏️ Auto-enabled edit mode for artifact:", artifactId, "type:", artifact.type);
  }
  
  const isInEditMode = window.artifactEditMode?.[artifactId] || false;
  
  // Debug logging
  console.log("[ARTIFACT] Debug - Artifact:", artifactId, "Type:", artifact.type, "CanEdit:", canEdit, "IsInEditMode:", isInEditMode);
  
  // Create header with artifact info
  const headerHtml = `
    <div class="background-secondary padding-m radius-m margin-bottom-m">
      <div class="row align-center justify-between">
        <div class="column gap-xs">
          <div class="text-m foreground-primary" style="font-weight: 600;">${window.utils.escapeHtml(artifact.title)}</div>
          <div class="row gap-s text-xs foreground-tertiary">
            <span class="background-tertiary padding-xs radius-xs">${artifact.type}</span>
            <span class="background-tertiary padding-xs radius-xs">Version ${artifact.versions.length - currentVersionIdx} of ${artifact.versions.length}</span>
            <span class="background-tertiary padding-xs radius-xs">${new Date(currentVersion.timestamp).toLocaleString()}</span>
            ${currentVersion.editedBy ? `<span class="background-tertiary padding-xs radius-xs">Edited by ${currentVersion.editedBy}</span>` : ''}
          </div>
        </div>
        ${canEdit ? `
          <div class="row gap-s">
            ${isInEditMode ? 
              '<span class="background-primary padding-xs radius-xs text-xs">✏️ Edit Mode' + (isCollaborator ? ' (Auto-enabled)' : '') + '</span>' : 
              '<span class="background-secondary padding-xs radius-xs text-xs">📄 View Mode</span>'
            }
          </div>
        ` : ''}
      </div>
    </div>
  `;

  // For image artifacts, handle edit mode or show image
  if (artifact.type === 'image' && content.startsWith('[[image:')) {
    const imageMatch = content.match(/\[\[image:(.*?)\]\]/);
    if (imageMatch && imageMatch[1]) {
      const imageUrl = imageMatch[1].trim();
      
      if (canEdit && isInEditMode) {
        // Edit mode for image artifacts
        return `${headerHtml}
          <div class="column gap-m">
            <div class="row align-center justify-between">
              <div class="text-s opacity-s">✏️ Edit Mode - Edit image URL below</div>
              <div class="row gap-s">
                <button class="button-secondary" onclick="switchToViewMode('${artifactId}')">📄 View Mode</button>
                <button class="button-primary" onclick="saveArtifactEdit('${artifactId}')">💾 Save Changes</button>
              </div>
            </div>
            <textarea id="artifact-edit-${artifactId}" class="background-secondary padding-m radius-s" 
                      style="min-height: 100px; font-family: var(--font-mono); font-size: 0.9rem; line-height: 1.5; border: calc(var(--base-size) * 0.25) solid var(--color-tertiary-background); resize: vertical;">${window.utils.escapeHtml(content)}</textarea>
            <div class="background-tertiary padding-m radius-s">
              <div class="text-s opacity-s margin-bottom-s">Preview:</div>
              <img src="${imageUrl}" alt="Generated image" style="max-width: 100%; height: auto;" onerror="this.outerHTML='<div class=&quot;column align-center justify-center padding-xl foreground-tertiary&quot;>Failed to load image</div>'" />
            </div>
          </div>
        `;
      } else {
        // View mode for image artifacts
        return `${headerHtml}
          <div class="column gap-m">
            ${canEdit ? `
              <div class="row align-center justify-between">
                <div class="text-s opacity-s">📄 View Mode</div>
                <button class="button-primary" onclick="enableArtifactEdit('${artifactId}')">✏️ Edit Image</button>
              </div>
            ` : ''}
            <img src="${imageUrl}" alt="Generated image" style="max-width: 100%; height: auto;" onerror="this.outerHTML='<div class=&quot;column align-center justify-center padding-xl foreground-tertiary&quot;>Failed to load image</div>'" />
          </div>
        `;
      }
    } else {
      return `${headerHtml}<div class="column align-center justify-center padding-xl foreground-tertiary">Invalid image format</div>`;
    }
  }

  // For HTML artifacts, handle edit mode or show iframe
  if (artifact.type === 'html') {
    if (canEdit && isInEditMode) {
      // Edit mode for HTML artifacts
      return `${headerHtml}
        <div class="column gap-m">
          <div class="row align-center justify-between">
            <div class="text-s opacity-s">✏️ Edit Mode - Edit HTML content below</div>
            <div class="row gap-s">
              <button class="button-secondary" onclick="switchToViewMode('${artifactId}')">📄 View Mode</button>
              <button class="button-primary" onclick="saveArtifactEdit('${artifactId}')">💾 Save Changes</button>
            </div>
          </div>
          <textarea id="artifact-edit-${artifactId}" class="background-secondary padding-m radius-s" 
                    style="min-height: 400px; font-family: var(--font-mono); font-size: 0.9rem; line-height: 1.5; border: calc(var(--base-size) * 0.25) solid var(--color-tertiary-background); resize: vertical;">${window.utils.escapeHtml(content)}</textarea>
          <div class="background-tertiary padding-m radius-s">
            <div class="text-s opacity-s margin-bottom-s">Preview:</div>
            <iframe srcdoc="${content.replace(/"/g, '&quot;')}" sandbox="allow-scripts allow-same-origin allow-forms" style="width: 100%; height: 200px; border: 1px solid var(--color-tertiary-background);"></iframe>
          </div>
        </div>
      `;
    } else {
      // View mode for HTML artifacts
    const escapedContent = content.replace(/"/g, '&quot;');
      return `${headerHtml}
        <div class="column gap-m">
          ${canEdit ? `
            <div class="row align-center justify-between">
              <div class="text-s opacity-s">📄 View Mode</div>
              <button class="button-primary" onclick="enableArtifactEdit('${artifactId}')">✏️ Edit HTML</button>
            </div>
          ` : ''}
          <iframe srcdoc="${escapedContent}" sandbox="allow-scripts allow-same-origin allow-forms" style="width: 100%; height: 500px; border: 1px solid var(--color-tertiary-background);"></iframe>
        </div>
      `;
    }
  }

  // For file artifacts, handle edit mode or render file viewer
  if (artifact.type === 'files') {
    try {
      const fileData = JSON.parse(content);
      
      if (canEdit && isInEditMode) {
        // Edit mode for file artifacts
        return `${headerHtml}
          <div class="column gap-m">
            <div class="row align-center justify-between">
              <div class="text-s opacity-s">✏️ Edit Mode - Edit file data below</div>
              <div class="row gap-s">
                <button class="button-secondary" onclick="switchToViewMode('${artifactId}')">📄 View Mode</button>
                <button class="button-primary" onclick="saveArtifactEdit('${artifactId}')">💾 Save Changes</button>
              </div>
            </div>
            <textarea id="artifact-edit-${artifactId}" class="background-secondary padding-m radius-s" 
                      style="min-height: 300px; font-family: var(--font-mono); font-size: 0.9rem; line-height: 1.5; border: calc(var(--base-size) * 0.25) solid var(--color-tertiary-background); resize: vertical;">${window.utils.escapeHtml(content)}</textarea>
            <div class="background-tertiary padding-m radius-s">
              <div class="text-s opacity-s margin-bottom-s">Preview:</div>
              ${renderFileArtifact(fileData)}
            </div>
          </div>
        `;
      } else {
        // View mode for file artifacts
        return `${headerHtml}
          <div class="column gap-m">
            ${canEdit ? `
              <div class="row align-center justify-between">
                <div class="text-s opacity-s">📄 View Mode</div>
                <button class="button-primary" onclick="enableArtifactEdit('${artifactId}')">✏️ Edit File Data</button>
              </div>
            ` : ''}
            ${renderFileArtifact(fileData)}
          </div>
        `;
      }
    } catch (e) {
      return `${headerHtml}<div class="column align-center justify-center padding-xl foreground-tertiary">Invalid file data</div>`;
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
    
    if (canEdit && isInEditMode) {
      // Edit mode for link artifacts
      contentHtml = `
        <div class="column gap-m">
          <div class="row align-center justify-between">
            <div class="text-s opacity-s">✏️ Edit Mode - Edit link URL below</div>
            <div class="row gap-s">
              <button class="button-secondary" onclick="switchToViewMode('${artifactId}')">📄 View Mode</button>
              <button class="button-primary" onclick="saveArtifactEdit('${artifactId}')">💾 Save Changes</button>
            </div>
          </div>
          <textarea id="artifact-edit-${artifactId}" class="background-secondary padding-m radius-s" 
                    style="min-height: 100px; font-family: var(--font-mono); font-size: 0.9rem; line-height: 1.5; border: calc(var(--base-size) * 0.25) solid var(--color-tertiary-background); resize: vertical;">${window.utils.escapeHtml(content)}</textarea>
          <div class="background-tertiary padding-m radius-s">
            <div class="text-s opacity-s margin-bottom-s">Preview:</div>
            <div class="row align-center gap-m padding-l radius-s background-secondary" style="border: calc(var(--base-size) * 0.25) solid var(--color-secondary-background);">
              <div class="text-xl">${linkIcon}</div>
              <div class="column gap-xs">
                <div class="text-s foreground-tertiary" style="font-weight: 500;">${linkTypeText}</div>
                <div class="text-xs foreground-tertiary">${domain}</div>
                <a href="${url}" target="_blank" rel="noopener noreferrer" class="text-xs foreground-primary transition" style="text-decoration: none;">${url}</a>
              </div>
            </div>
          </div>
        </div>
      `;
    } else {
      // View mode for link artifacts
    contentHtml = `
        <div class="column gap-m">
          ${canEdit ? `
            <div class="row align-center justify-between">
              <div class="text-s opacity-s">📄 View Mode</div>
              <button class="button-primary" onclick="enableArtifactEdit('${artifactId}')">✏️ Edit Link</button>
            </div>
          ` : ''}
      <div class="row align-center gap-m padding-l radius-s background-secondary" style="border: calc(var(--base-size) * 0.25) solid var(--color-secondary-background); margin: calc(var(--base-size) * 3) 0;">
        <div class="text-xl">${linkIcon}</div>
        <div class="column gap-xs">
          <div class="text-s foreground-tertiary" style="font-weight: 500;">${linkTypeText}</div>
          <div class="text-xs foreground-tertiary">${domain}</div>
          <a href="${url}" target="_blank" rel="noopener noreferrer" class="text-xs foreground-primary transition" style="text-decoration: none;">${url}</a>
            </div>
        </div>
      </div>
    `;
    }
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
    if (canEdit && isInEditMode) {
      // Edit mode for ALL artifact types
      contentHtml = `
        <div class="column gap-m">
          <div class="row align-center justify-between">
            <div class="text-s opacity-s">✏️ Edit Mode - Make your changes below</div>
            <div class="row gap-s">
              <button class="button-secondary" onclick="switchToViewMode('${artifactId}')">📄 View Mode</button>
              <button class="button-primary" onclick="saveArtifactEdit('${artifactId}')">💾 Save Changes</button>
            </div>
          </div>
          <textarea id="artifact-edit-${artifactId}" class="background-secondary padding-m radius-s" 
                    style="min-height: 300px; font-family: var(--font-mono); font-size: 0.9rem; line-height: 1.5; border: calc(var(--base-size) * 0.25) solid var(--color-tertiary-background); resize: vertical;">${window.utils.escapeHtml(content)}</textarea>
        </div>
      `;
    } else {
      // View mode
    contentHtml = `<div class="padding-m" style="margin: calc(var(--base-size) * 3) 0; line-height: 1.6; white-space: pre-wrap;">${window.utils.escapeHtml(content)}</div>`;
      
      // Add edit button if user can edit
      if (canEdit) {
        contentHtml = `
          <div class="column gap-m">
            <div class="row align-center justify-between">
              <div class="text-s opacity-s">📄 View Mode</div>
              <button class="button-primary" onclick="enableArtifactEdit('${artifactId}')">✏️ Edit Artifact</button>
            </div>
            ${contentHtml}
          </div>
        `;
      }
    }
  }

  // For file artifacts, we don't show the standard artifact header since the file viewer has its own header
  if (artifact.type === 'files') {
    return contentHtml; // The file viewer already includes all the header info
  }

  return `
    <div class="column gap-m padding-xl" style="max-width: calc(var(--base-size) * 250); margin: 0 auto;">
      ${headerHtml}
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

// =================== Artifact Edit Functions ===================

// Track which artifacts are in edit mode
window.artifactEditMode = window.artifactEditMode || {};

// Enable edit mode for an artifact
function enableArtifactEdit(artifactId) {
  console.log("[ARTIFACT] Enabling edit mode for artifact:", artifactId);
  
  // Check permissions
  if (!window.collaboration?.canPerformAction('editArtifact')) {
    console.warn("[ARTIFACT] Permission denied: Cannot edit artifacts");
    alert("You don't have permission to edit artifacts. Please contact the session leader for edit permissions.");
    return;
  }
  
  // Set edit mode for this artifact
  window.artifactEditMode[artifactId] = true;
  
  // Re-render the artifact view in edit mode
  if (window.views?.renderCurrentView) {
    window.views.renderCurrentView(false);
  }
}

// Save artifact changes
async function saveArtifactEdit(artifactId) {
  console.log("[ARTIFACT] Saving changes for artifact:", artifactId);
  
  // Check permissions
  if (!window.collaboration?.canPerformAction('editArtifact')) {
    console.warn("[ARTIFACT] Permission denied: Cannot edit artifacts");
    alert("You don't have permission to edit artifacts. Please contact the session leader for edit permissions.");
    return;
  }
  
  // Get the edited content
  const textarea = document.getElementById(`artifact-edit-${artifactId}`);
  if (!textarea) {
    console.error("[ARTIFACT] Edit textarea not found");
    return;
  }
  
  const newContent = textarea.value.trim();
  if (!newContent) {
    alert("Cannot save empty content. Please add some content or cancel the edit.");
    return;
  }
  
    // Update the artifact with versioning
  if (window.artifactsModule?.updateArtifact) {
    console.log("[ARTIFACT] 🔄 Calling updateArtifact with ID:", artifactId, "Content length:", newContent.length);
    
    try {
      const result = await window.artifactsModule.updateArtifact(artifactId, newContent);
      console.log("[ARTIFACT] 📤 updateArtifact result:", result);
      
      if (result) {
        console.log("[ARTIFACT] ✅ Artifact updated successfully:", result.title);
        console.log("[ARTIFACT] 📚 New version created - Total versions:", result.versions.length);
        console.log("[ARTIFACT] 📋 Latest version:", result.versions[result.versions.length - 1]);
        
        // Clear edit mode
        window.artifactEditMode[artifactId] = false;
        
        // Show success message with version info
        const versionInfo = result.versions.length > 1 ? ` (Version ${result.versions.length} of ${result.versions.length})` : '';
        alert(`✅ Artifact "${result.title}" updated successfully!${versionInfo}\n\n📚 A new version has been added to the artifact's version history.`);
        
        // Re-render the view to show the new version
        if (window.views?.renderCurrentView) {
          window.views.renderCurrentView(false);
        }
      } else {
        console.error("[ARTIFACT] ❌ Failed to update artifact - result is null/undefined");
        alert("Failed to update artifact. Please try again.");
      }
    } catch (error) {
      console.error("[ARTIFACT] ❌ Error updating artifact:", error);
      alert("An error occurred while updating the artifact. Please try again.");
    }
  } else {
    console.error("[ARTIFACT] ❌ Artifacts module not available");
    alert("Artifacts module not available. Please refresh the page and try again.");
  }
}

// Switch to view mode
function switchToViewMode(artifactId) {
  console.log("[ARTIFACT] Switching to view mode for artifact:", artifactId);
  
  // Clear edit mode for this artifact
  window.artifactEditMode[artifactId] = false;
  
  // Re-render the artifact view in view mode
  if (window.views?.renderCurrentView) {
    window.views.renderCurrentView(false);
  }
}

// Cancel artifact edit (alias for switchToViewMode)
function cancelArtifactEdit(artifactId) {
  switchToViewMode(artifactId);
}

// Make functions globally available
window.enableArtifactEdit = enableArtifactEdit;
window.saveArtifactEdit = saveArtifactEdit;
window.cancelArtifactEdit = cancelArtifactEdit;
window.switchToViewMode = switchToViewMode;

// Debug function to check artifact edit state
window.debugArtifactEdit = function(artifactId) {
  console.log("[ARTIFACT] 🔍 Debug Artifact Edit State:");
  console.log("Artifact ID:", artifactId);
  
  const artifact = window.artifactsModule?.getArtifact(artifactId);
  if (artifact) {
    console.log("Artifact:", artifact);
    console.log("Type:", artifact.type);
    console.log("Content preview:", artifact.versions[artifact.versions.length - 1]?.content?.substring(0, 100) + "...");
  } else {
    console.log("❌ Artifact not found");
  }
  
  const canEdit = window.collaboration?.canPerformAction('editArtifact');
  console.log("Can edit artifacts:", canEdit);
  
  const isInEditMode = window.artifactEditMode?.[artifactId];
  console.log("Is in edit mode:", isInEditMode);
  
  console.log("Edit mode state:", window.artifactEditMode);
  
  return { artifact, canEdit, isInEditMode };
};

// Test function to manually open an artifact
window.testOpenArtifact = function(artifactId) {
  console.log("[ARTIFACT] 🧪 Testing artifact open for ID:", artifactId);
  
  if (!artifactId) {
    console.error("[ARTIFACT] ❌ No artifact ID provided");
    return;
  }
  
  // Try to open the artifact
  window.context?.setActiveView('artifact', { artifactId: artifactId });
  
  // Check if it worked
  setTimeout(() => {
    const activeView = window.context?.getActiveView();
    console.log("[ARTIFACT] Active view after test:", activeView);
    
    if (activeView?.type === 'artifact' && activeView?.data?.artifactId === artifactId) {
      console.log("[ARTIFACT] ✅ Successfully opened artifact");
    } else {
      console.log("[ARTIFACT] ❌ Failed to open artifact");
    }
  }, 100);
};

// Comprehensive debug function for collaborative editing
window.debugCollaborativeEditing = function(artifactId) {
  console.log("[ARTIFACT] 🔍 Debug Collaborative Editing System:");
  
  // Check collaboration status
  const collabStatus = window.collaboration?.getStatus();
  console.log("Collaboration Status:", collabStatus);
  
  // Check permissions
  const permissions = window.collaboration?.getCollaborationPermissions();
  console.log("Collaboration Permissions:", permissions);
  
  // Check if user can edit
  const canEdit = window.collaboration?.canPerformAction('editArtifact');
  console.log("Can Edit Artifacts:", canEdit);
  
  // Check artifact state
  if (artifactId) {
    const artifact = window.artifactsModule?.getArtifact(artifactId);
    if (artifact) {
      console.log("Artifact:", artifact);
      console.log("Artifact Type:", artifact.type);
      console.log("Total Versions:", artifact.versions.length);
      console.log("Latest Version:", artifact.versions[artifact.versions.length - 1]);
    } else {
      console.log("❌ Artifact not found:", artifactId);
    }
  }
  
  // Check edit mode state
  console.log("Edit Mode State:", window.artifactEditMode);
  
  // Check active view
  const activeView = window.context?.getActiveView();
  console.log("Active View:", activeView);
  
  return {
    collabStatus,
    permissions,
    canEdit,
    artifact: artifactId ? window.artifactsModule?.getArtifact(artifactId) : null,
    editMode: window.artifactEditMode,
    activeView
  };
};

// Test function to simulate saving an artifact
window.testSaveArtifact = function(artifactId, testContent = "Test content from debug function") {
  console.log("[ARTIFACT] 🧪 Testing artifact save for ID:", artifactId);
  
  if (!artifactId) {
    console.error("[ARTIFACT] ❌ No artifact ID provided");
    return;
  }
  
  // Check if artifact exists
  const artifact = window.artifactsModule?.getArtifact(artifactId);
  if (!artifact) {
    console.error("[ARTIFACT] ❌ Artifact not found:", artifactId);
    return;
  }
  
  console.log("[ARTIFACT] 📋 Original artifact:", artifact);
  console.log("[ARTIFACT] 📚 Original versions count:", artifact.versions.length);
  
  // Try to update the artifact
  const result = window.artifactsModule?.updateArtifact(artifactId, testContent);
  
  console.log("[ARTIFACT] 📤 Update result:", result);
  
  if (result) {
    console.log("[ARTIFACT] ✅ Test save successful!");
    console.log("[ARTIFACT] 📚 New versions count:", result.versions.length);
    console.log("[ARTIFACT] 📋 Latest version:", result.versions[result.versions.length - 1]);
  } else {
    console.error("[ARTIFACT] ❌ Test save failed!");
  }
  
  return result;
};

// Export for global access
window.artifactView = {
  renderArtifactView,
  detectLinkContentType,
  renderFileArtifact,
  downloadFileArtifact
}; 