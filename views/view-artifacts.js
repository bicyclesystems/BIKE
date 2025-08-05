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

// Global state for navigation
let currentFolderId = null; // null means root level

// =================== Navigation & Hierarchy Utilities ===================

function getCurrentFolderContents(artifacts) {
  return artifacts.filter(artifact => artifact.parentId === currentFolderId);
}



function getFolderPath(artifacts, folderId = currentFolderId) {
  const path = [];
  let current = folderId;
  
  while (current) {
    const folder = artifacts.find(a => a.id === current);
    if (!folder) break;
    path.unshift(folder);
    current = folder.parentId;
  }
  
  return path;
}

function renderBreadcrumbs(artifacts) {
  const path = getFolderPath(artifacts);
  
  let breadcrumbs = `
    <div class="row align-center gap-s padding-m background-tertiary radius-s">
      <span style="cursor: pointer; opacity: ${currentFolderId ? '0.7' : '1'};" 
            onclick="window.artifactsView.navigateToFolder(null)"
            onmouseover="this.style.opacity='1'" 
            onmouseout="this.style.opacity='${currentFolderId ? '0.7' : '1'}'">
Root
      </span>
  `;
  
  path.forEach((folder, index) => {
    const isLast = index === path.length - 1;
    breadcrumbs += `
      <span>→</span>
      <span style="cursor: pointer; opacity: ${isLast ? '1' : '0.7'};" 
            onclick="window.artifactsView.navigateToFolder('${folder.id}')"
            onmouseover="this.style.opacity='1'" 
            onmouseout="this.style.opacity='${isLast ? '1' : '0.7'}'">
${window.utils.escapeHtml(folder.title)}
      </span>
    `;
  });
  
  breadcrumbs += '</div>';
  return breadcrumbs;
}

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
    <div class="column gap-m padding-l">
      ${renderGalleryView(allArtifacts, allArtifacts)}
    </div>
  `;
}





function renderGalleryView(artifacts, allArtifacts) {
  // Filter out group artifacts and organize by parentId
  const nonGroupArtifacts = artifacts.filter(a => a.type !== 'group');
  
  // Group artifacts by parentId (null for root level)
  const artifactGroups = new Map();
  nonGroupArtifacts.forEach(artifact => {
    const parentId = artifact.parentId || 'root';
    if (!artifactGroups.has(parentId)) {
      artifactGroups.set(parentId, []);
    }
    artifactGroups.get(parentId).push(artifact);
  });
  
  let html = `<div class="row gap-m" style="flex-wrap: wrap;">`;
  
  // Render each group as a stacked collection
  for (const [parentId, groupArtifacts] of artifactGroups) {
    // Get group info for labeling
    const parentGroup = parentId !== 'root' ? allArtifacts.find(a => a.id === parentId) : null;
    const groupTitle = parentGroup ? parentGroup.title : null;
    
    html += renderArtifactGroup(groupArtifacts, groupTitle);
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
  
  // Multiple artifacts - create stacked effect
  let html = `
    <div class="column gap-m" style="min-width: 320px; max-width: 400px; flex: 1; position: relative;">
      ${groupTitle ? `<div style="font-weight: 500; opacity: 0.8; font-size: 0.9em;">${window.utils.escapeHtml(groupTitle)}</div>` : ''}
      <div class="artifact-stack" 
           style="position: relative; height: 350px; overflow: visible;"
           onmouseenter="this.querySelectorAll('.stacked-card').forEach((card, i) => { const directions = [[-40, -30], [50, -20], [-30, 40], [60, 35], [0, -50], [-50, 0]]; const dir = directions[i % directions.length]; card.style.transform = 'scale(' + card.dataset.scale + ') translate(' + dir[0] + 'px, ' + dir[1] + 'px)'; card.style.opacity = '1'; })"
           onmouseleave="this.querySelectorAll('.stacked-card').forEach((card, i) => { card.style.transform = 'scale(' + card.dataset.scale + ')'; card.style.opacity = i === 0 ? '1' : '0.8'; })">
  `;
  
  // Render artifacts with stacking effect
  artifacts.forEach((artifact, index) => {
    const offsetX = index * 8;
    const offsetY = index * 8;
    const zIndex = artifacts.length - index;
    const opacity = index === 0 ? 1 : 0.8;
    const scale = index === 0 ? 1 : 0.95;
    
    html += renderStackedArtifact(artifact, offsetX, offsetY, zIndex, opacity, scale, index);
  });
  
  html += `
      </div>
    </div>
  `;
  
  return html;
}

// Shared content preview generation logic
function generateArtifactPreview(artifact) {
  const latestVersion = artifact.versions[artifact.versions.length - 1];
  let preview = latestVersion.content.substring(0, 100) + '...';
  let visualPreview = null;
  
  // Generate content preview
  if (artifact.type === 'link') {
    const url = latestVersion.content.trim();
    const domain = window.utils.getDomainFromUrl(url);
    preview = domain;
  } else if (artifact.type === 'files') {
    try {
      const fileData = JSON.parse(latestVersion.content);
      const fileSize = window.artifactsModule.formatFileSize(fileData.size);
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
      visualPreview = `<img src="${window.utils.escapeHtml(imageUrl)}" alt="Preview" style="width: 100%; height: auto;">`;
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
                            class="radius-s transition" 
                            style="width: 100%; height: 200px; border: none; margin: 0; padding: 0; outline: none; background: white; opacity: 0;" 
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
    visualPreview = `<img src="data:image/svg+xml;base64,${encodedSvg}" class="background-tertiary radius-s" style="width: 100%; height: auto;" alt="SVG Preview">`;
  } else if (latestVersion.content.startsWith('#') || latestVersion.content.includes('##') || latestVersion.content.includes('**') || latestVersion.content.includes('*')) {
    preview = '';
    const markdownPreview = latestVersion.content.substring(0, 500) + (latestVersion.content.length > 500 ? '...' : '');
    const escapedMarkdown = window.utils.escapeHtml(markdownPreview);
    visualPreview = `<div class="text-s background-secondary padding-m radius-s" style="width: 100%; min-height: 120px; overflow: hidden; line-height: 1.4; white-space: pre-wrap;">${escapedMarkdown}</div>`;
  }
  
  return { preview, visualPreview };
}

// Shared click handler generation logic
function generateArtifactClickHandler(artifact) {
  const latestVersion = artifact.versions[artifact.versions.length - 1];
  const escapedId = window.utils.escapeHtml(artifact.id);
  
  if (artifact.type === 'link') {
    const url = latestVersion.content.trim();
    const escapedUrl = window.utils.escapeHtml(url);
    return `onclick="window.open('${escapedUrl}', '_blank', 'noopener,noreferrer')"`;
  } else {
    return `onclick="window.context.setActiveView('artifact', { artifactId: '${escapedId}' })"`;
  }
}

function renderSingleArtifact(artifact, groupTitle) {
  const { preview, visualPreview } = generateArtifactPreview(artifact);
  const clickHandler = generateArtifactClickHandler(artifact);
  
  const escapedTitle = window.utils.escapeHtml(artifact.title);
  const escapedPreview = window.utils.escapeHtml(preview);
  
  return `
    <div class="column gap-m" style="min-width: 320px; max-width: 400px; flex: 1;">
      ${groupTitle ? `<div style="font-weight: 500; opacity: 0.8; font-size: 0.9em;">${window.utils.escapeHtml(groupTitle)}</div>` : ''}
      <div class="transition column gap-m" ${clickHandler} style="cursor: pointer;" onmouseenter="this.querySelector('.artifact-title').style.opacity='1'" onmouseleave="this.querySelector('.artifact-title').style.opacity='0'">
        ${visualPreview || ''}
        <div class="artifact-title" style="opacity: 0; transition: opacity 0.2s ease;">${escapedTitle}</div>
      </div>
    </div>
  `;
}

function renderStackedArtifact(artifact, offsetX, offsetY, zIndex, opacity, scale, index) {
  const { preview, visualPreview } = generateArtifactPreview(artifact);
  const clickHandler = generateArtifactClickHandler(artifact);
  
  const escapedTitle = window.utils.escapeHtml(artifact.title);
  const escapedPreview = window.utils.escapeHtml(preview);
  
  return `
    <div class="stacked-card transition column gap-m" 
         ${clickHandler}
         data-scale="${scale}"
         onmouseenter="this.querySelector('.artifact-title').style.opacity='1'"
         onmouseleave="this.querySelector('.artifact-title').style.opacity='0'"
         style="
           position: absolute;
           top: ${offsetY}px;
           left: ${offsetX}px;
           width: calc(100% - ${offsetX * 2}px);
           z-index: ${zIndex};
           opacity: ${opacity};
           transform: scale(${scale});
           cursor: pointer;
           transition: all 0.3s ease;
         ">
      ${visualPreview || ''}
      <div class="artifact-title" style="opacity: 0; transition: opacity 0.2s ease;">${escapedTitle}</div>
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
    'yaml': 'YAML',
    'link': 'LINK',
    'files': 'FILE'
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

function navigateToFolder(folderId) {
  currentFolderId = folderId;
  refreshArtifactsView();
}





// =================== Module Exports ===================

// Export view-specific functions for global access
window.artifactsView = {
  renderArtifactsView,
  refreshArtifactsView,
  navigateToFolder,
  // Export view modes for potential extension
  ARTIFACT_VIEW_MODES
}; 