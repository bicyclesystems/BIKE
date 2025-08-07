// =================== Artifacts View ===================

// View modes configuration - gallery only
const ARTIFACT_VIEW_MODES = {
  gallery: {
    id: 'gallery',
    name: 'Gallery',
    icon: '⊞',
    description: 'Card-based grid view'
  }
};

// =================== Simplified Artifacts View ===================

function renderArtifactsView(data) {
  const allArtifacts = window.context?.getCurrentChatArtifacts() || [];
  
  if (allArtifacts.length === 0) {
    return `
      <div class="column align-center padding-xl">
        <div>No artifacts in this chat yet</div>
        <div>Create some content to see it here</div>
      </div>
    `;
  }
  
  // Always use gallery view with all artifacts
  return `
    <style>
      @media (max-width: 768px) {
        .artifact-grid {
          flex-direction: column !important;
          gap: calc(var(--base-size) * 6) !important;
        }
        .artifact-item {
          min-width: auto !important;
          max-width: none !important;
          width: 100% !important;
        }
      }
    </style>
    <div class="column gap-m padding-xl">
      ${renderGalleryView(allArtifacts, allArtifacts)}
    </div>
  `;
}





function renderGalleryView(artifacts, allArtifacts) {
  // Group by folder path
  const folderGroups = new Map();
  const rootArtifacts = [];
  
  artifacts.forEach(artifact => {
    // Extract folder from path (everything before the last /)
    const path = artifact.path || '';
    const lastSlash = path.lastIndexOf('/');
    const folder = lastSlash >= 0 ? path.substring(0, lastSlash + 1) : '';
    
    if (!folder) {
      // Root artifacts - don't put them in a folder group
      rootArtifacts.push(artifact);
    } else {
      // Non-root artifacts - group by folder
      if (!folderGroups.has(folder)) {
        folderGroups.set(folder, []);
      }
      folderGroups.get(folder).push(artifact);
    }
  });
  
  let html = `<div style="display: flex; flex-wrap: wrap; gap: calc(var(--base-size) * 10);" class="artifact-grid">`;
  
  // First render root artifacts without any folder grouping
  rootArtifacts.forEach(artifact => {
    html += renderSingleArtifact(artifact, null); // No group title for root artifacts
  });
  
  // Then render folder groups
  for (const [folder, groupArtifacts] of folderGroups) {
    const folderTitle = folder.replace('/', '');
    html += renderArtifactGroup(groupArtifacts, folderTitle);
  }
  
  html += '</div>';
  return html;
}

function renderArtifactGroup(artifacts, groupTitle) {
  if (artifacts.length === 0) return '';
  
  // If only one artifact, render normally
  if (artifacts.length === 1) {
    return renderSingleArtifact(artifacts[0], groupTitle);
  }
  
  // Multiple artifacts - create stacked effect as the visual preview
  let stackContent = '';
  artifacts.forEach((artifact, index) => {
    const offsetX = index * 8;
    const offsetY = index * 8;
    const zIndex = artifacts.length - index;
    const opacity = index === 0 ? 1 : 0.8;
    const scale = index === 0 ? 1 : 0.95;
    
    stackContent += renderStackedArtifact(artifact, offsetX, offsetY, zIndex, opacity, scale, index);
  });
  
  // Create the stacked visual as the "visualPreview" for the group
  const groupVisualPreview = `
    <div class="artifact-stack" style="position: relative; overflow: visible;"
         onmouseenter="this.querySelectorAll('.stacked-card').forEach((card, i) => { const directions = [[-40, -30], [50, -20], [-30, 40], [60, 35], [0, -50], [-50, 0]]; const dir = directions[i % directions.length]; card.style.transform = 'scale(' + card.dataset.scale + ') translate(' + dir[0] + 'px, ' + dir[1] + 'px)'; card.style.opacity = '1'; })"
         onmouseleave="this.querySelectorAll('.stacked-card').forEach((card, i) => { card.style.transform = 'scale(' + card.dataset.scale + ')'; card.style.opacity = i === 0 ? '1' : '0.8'; })">
      ${stackContent}
    </div>
  `;
  
  // Use the same structure as a single artifact but with group content
  const content = `
    ${renderGroupTitle(groupTitle)}
    <div class="transition" style="display: flex; flex-direction: column; gap: calc(var(--base-size) * 3); cursor: pointer;" onmouseenter="this.querySelector('.artifact-title').style.opacity='1'" onmouseleave="this.querySelector('.artifact-title').style.opacity='0'">
      ${groupVisualPreview}
      ${renderArtifactTitle(`${artifacts.length} artifacts`)}
    </div>
  `;
  
  return renderArtifactContainer(content);
}

// Helper function for rendering group titles (DRY)
function renderGroupTitle(groupTitle) {
  return groupTitle ? `<h5 class="opacity-s">${window.utils.escapeHtml(groupTitle)}</h5>` : '';
}

// Helper function for artifact container wrapper (DRY)
function renderArtifactContainer(content) {
  return `<div class="artifact-item" style="display: flex; flex-direction: column; gap: calc(var(--base-size) * 3); flex: 1; min-width: 300px; max-width: 400px;">${content}</div>`;
}

// Helper function for artifact title with hover effect (DRY)
function renderArtifactTitle(title) {
  return `<div class="artifact-title transition" style="opacity: 0;">${window.utils.escapeHtml(title)}</div>`;
}

// Shared content preview generation logic
function generateArtifactPreview(artifact) {
  const latestVersion = artifact.versions[artifact.versions.length - 1];
  let preview = latestVersion.content.substring(0, 100) + '...';
  let visualPreview = null;
  
  // Generate content preview
  if (artifact.type === 'files') {
    try {
      const fileData = JSON.parse(latestVersion.content);
      // Format file size inline
      const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const fileSizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + fileSizes[i];
      };
      const fileSize = formatFileSize(fileData.size);
      preview = `${fileData.name} (${fileSize})`;
    } catch (e) {
      preview = latestVersion.content.substring(0, 100) + '...';
    }
  } else if (latestVersion.content.startsWith('```')) {
    const codeMatch = latestVersion.content.match(/```(?:\w+)?\n?([\s\S]*?)\n?```/);
    if (codeMatch && codeMatch[1]) {
      const codeContent = codeMatch[1].trim();
      preview = codeContent.substring(0, 100) + (codeContent.length > 100 ? '...' : '');
    }
  } else if (latestVersion.content.startsWith('[[image:')) {
    const imageMatch = latestVersion.content.match(/\[\[image:([^\]]+)\]\]/);
    if (imageMatch) {
      const imageUrl = imageMatch[1];
      preview = imageUrl;
      visualPreview = `<img src="${window.utils.escapeHtml(imageUrl)}" alt="Preview" class="box-l">`;
    }
  } else if (latestVersion.content.toLowerCase().includes('<html') || latestVersion.content.toLowerCase().includes('<!doctype')) {
    const titleMatch = latestVersion.content.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      preview = titleMatch[1];
    } else {
      const textMatch = latestVersion.content.replace(/<[^>]*>/g, ' ').trim();
      preview = textMatch.substring(0, 100) + (textMatch.length > 100 ? '...' : '');
    }
    const encodedContent = btoa(unescape(encodeURIComponent(latestVersion.content)));
    visualPreview = `<iframe src="data:text/html;base64,${encodedContent}" 
                            class="radius-s transition box-l" 
                            style="border: none; margin: 0; padding: 0; outline: none; background: white; opacity: 0;" 
                            sandbox="allow-scripts allow-same-origin"
                            onload="this.style.opacity='1'"></iframe>`;
  } else if (latestVersion.content.startsWith('<svg') || (latestVersion.content.includes('<svg') && latestVersion.content.includes('</svg>'))) {
    const titleMatch = latestVersion.content.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      preview = titleMatch[1];
    } else {
      preview = latestVersion.content.substring(0, 100) + '...';
    }
    const encodedSvg = btoa(unescape(encodeURIComponent(latestVersion.content)));
    visualPreview = `<img src="data:image/svg+xml;base64,${encodedSvg}" class="background-tertiary radius-s box-l" alt="SVG Preview">`;
  } else if (latestVersion.content.startsWith('#') || latestVersion.content.includes('##') || latestVersion.content.includes('**') || latestVersion.content.includes('*')) {
    preview = '';
    const markdownPreview = latestVersion.content.substring(0, 500) + (latestVersion.content.length > 500 ? '...' : '');
    const escapedMarkdown = window.utils.escapeHtml(markdownPreview);
    visualPreview = `<div class="text-s background-secondary padding-m radius-s box-l" style="min-height: 200px;">${escapedMarkdown}</div>`;
  }
  
  return { preview, visualPreview };
}

// Shared click handler generation logic
function generateArtifactClickHandler(artifact) {
  const latestVersion = artifact.versions[artifact.versions.length - 1];
  const escapedId = window.utils.escapeHtml(artifact.id);
  
  return `onclick="window.context.setActiveView('artifact', { artifactId: '${escapedId}' })"`;
}

function renderSingleArtifact(artifact, groupTitle) {
  const { preview, visualPreview } = generateArtifactPreview(artifact);
  const clickHandler = generateArtifactClickHandler(artifact);
  
  const content = `
    ${renderGroupTitle(groupTitle)}
    <div class="transition" ${clickHandler} style="display: flex; flex-direction: column; gap: calc(var(--base-size) * 3); cursor: pointer;" onmouseenter="this.querySelector('.artifact-title').style.opacity='1'" onmouseleave="this.querySelector('.artifact-title').style.opacity='0'">
      ${visualPreview || ''}
      ${renderArtifactTitle(artifact.title)}
    </div>
  `;
  
  return renderArtifactContainer(content);
}

function renderStackedArtifact(artifact, offsetX, offsetY, zIndex, opacity, scale, index) {
  const { preview, visualPreview } = generateArtifactPreview(artifact);
  const clickHandler = generateArtifactClickHandler(artifact);
  
  return `
    <div class="stacked-card transition" 
         ${clickHandler}
         data-scale="${scale}"
         data-original-zindex="${zIndex}"
         onmouseenter="
           this.querySelector('.artifact-title').style.opacity='1';
           this.style.zIndex='1000';
         "
         onmouseleave="
           this.querySelector('.artifact-title').style.opacity='0';
           this.style.zIndex=this.dataset.originalZindex;
         "
         style="
           display: flex;
           flex-direction: column;
           gap: calc(var(--base-size) * 3);
           position: absolute;
           top: ${offsetY}px;
           left: ${offsetX}px;
           width: calc(100% - ${offsetX * 2}px);
           z-index: ${zIndex};
           opacity: ${opacity};
           transform: scale(${scale});
           cursor: pointer;
         ">
      ${visualPreview || ''}
      ${renderArtifactTitle(artifact.title)}
    </div>
  `;
}





function getArtifactTypeIcon(type) {
  const icons = {
    'html': 'HTML',
    'image': 'IMG', 
    'markdown': 'MD',
    'text': 'TXT',
    'javascript': 'JS',
    'css': 'CSS',
    'json': 'JSON',
    'yaml': 'YAML'
  };
  return icons[type] || 'FILE';
}

// =================== Artifacts View Interaction Functions ===================

function refreshArtifactsView() {
  // Re-render the artifacts view to reflect version changes
  const activeView = window.context?.getActiveView();
  if (activeView && activeView.type === 'artifacts') {
    if (window.views?.renderCurrentView) {
      window.views.renderCurrentView();
    }
  }
}





// =================== Module Exports ===================

// Export view-specific functions for global access
window.artifactsView = {
  renderArtifactsView,
  refreshArtifactsView,
  ARTIFACT_VIEW_MODES
}; 