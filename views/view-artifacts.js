// =================== Artifacts View ===================

// View modes configuration
const ARTIFACT_VIEW_MODES = {
  gallery: {
    id: 'gallery',
    name: 'Gallery',
    icon: '⊞',
    description: 'Card-based grid view'
  },
  tree: {
    id: 'tree',
    name: 'Tree',
    icon: '🌳',
    description: 'Hierarchical folder view'
  },
  slideshow: {
    id: 'slideshow',
    name: 'Slideshow', 
    icon: '▶',
    description: 'Carousel presentation'
  }
};

// Global state for current view mode and navigation
let currentArtifactViewMode = 'gallery';
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
        🏠 Root
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
        📁 ${window.utils.escapeHtml(folder.title)}
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
  
  // Get current folder contents (or all for tree/gallery view)
  const displayArtifacts = (currentArtifactViewMode === 'tree' || currentArtifactViewMode === 'gallery')
    ? allArtifacts 
    : getCurrentFolderContents(allArtifacts);

  // Render tabs, breadcrumbs (except for tree view), and content
  return `
    <div class="column gap-m padding-l">
      ${renderArtifactViewTabs()}
      ${(currentArtifactViewMode !== 'tree' && currentArtifactViewMode !== 'gallery') ? renderBreadcrumbs(allArtifacts) : ''}
      ${renderArtifactViewContent(displayArtifacts, allArtifacts)}
    </div>
  `;
}

function renderArtifactViewTabs() {
  const tabs = Object.values(ARTIFACT_VIEW_MODES).map(mode => {
    const isActive = mode.id === currentArtifactViewMode;
    return `
      <div class="row align-center gap-xs padding-s radius-s transition ${isActive ? 'background-secondary' : 'background-tertiary'}" 
           style="cursor: pointer; opacity: ${isActive ? '1' : '0.7'};"
           onclick="window.artifactsView.switchViewMode('${mode.id}')"
           onmouseover="this.style.opacity='1'" 
           onmouseout="this.style.opacity='${isActive ? '1' : '0.7'}'">
        <span style="font-size: 1.2em;">${mode.icon}</span>
        <span>${mode.name}</span>
      </div>
    `;
  }).join('');
  
  return `
    <div class="row align-center gap-s padding-m border-bottom">
      <div class="row gap-s">
        ${tabs}
      </div>
    </div>
  `;
}

function renderArtifactViewContent(displayArtifacts, allArtifacts) {
  switch (currentArtifactViewMode) {
    case 'gallery':
      return renderGalleryView(displayArtifacts, allArtifacts);
    case 'tree':
      return renderTreeView(allArtifacts);
    case 'slideshow':
      return renderSlideshowView(displayArtifacts, allArtifacts);
    default:
      return renderGalleryView(displayArtifacts, allArtifacts);
  }
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
      ${groupTitle ? `<div style="font-weight: 500; opacity: 0.8; font-size: 0.9em;">📁 ${window.utils.escapeHtml(groupTitle)}</div>` : ''}
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
    visualPreview = `<div class="background-secondary padding-m radius-s" style="width: 100%; min-height: 200px; overflow: hidden; line-height: 1.4; white-space: pre-wrap;">${escapedMarkdown}</div>`;
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
      ${groupTitle ? `<div style="font-weight: 500; opacity: 0.8; font-size: 0.9em;">📁 ${window.utils.escapeHtml(groupTitle)}</div>` : ''}
      <div class="transition column gap-m" ${clickHandler} style="cursor: pointer;">
        ${visualPreview || ''}
        <div>${escapedTitle}</div>
        ${escapedPreview ? `<div>${escapedPreview}</div>` : ''}
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
      <div>${escapedTitle}</div>
      ${escapedPreview ? `<div>${escapedPreview}</div>` : ''}
    </div>
  `;
}

function renderSlideshowView(artifacts, allArtifacts) {
  // Filter out folders from slideshow
  const nonFolderArtifacts = artifacts.filter(a => a.type !== 'group');
  if (nonFolderArtifacts.length === 0) return '<div>No artifacts to display in slideshow</div>';
  
  const currentIndex = window.artifactsView.slideshowIndex || 0;
  const artifact = nonFolderArtifacts[currentIndex];
  if (!artifact) return '<div>No artifact at current index</div>';
  const latestVersion = artifact.versions[artifact.versions.length - 1];
  
  // Generate visual preview for slideshow
  let visualContent = '';
  if (artifact.type === 'image' && latestVersion.content.startsWith('[[image:')) {
    const imageMatch = latestVersion.content.match(/\[\[image:([^\]]+)\]\]/);
    if (imageMatch) {
      const imageUrl = imageMatch[1];
      visualContent = `<img src="${window.utils.escapeHtml(imageUrl)}" alt="Artifact" style="max-width: 100%; max-height: 400px; border-radius: 8px;">`;
    }
  } else if (artifact.type === 'html') {
    const encodedContent = btoa(unescape(encodeURIComponent(latestVersion.content)));
    visualContent = `<iframe src="data:text/html;base64,${encodedContent}" 
                            style="width: 100%; height: 400px; border: none; border-radius: 8px;" 
                            sandbox="allow-scripts allow-same-origin"></iframe>`;
  } else if (latestVersion.content.startsWith('<svg')) {
    const encodedSvg = btoa(unescape(encodeURIComponent(latestVersion.content)));
    visualContent = `<img src="data:image/svg+xml;base64,${encodedSvg}" style="max-width: 100%; max-height: 400px; border-radius: 8px;" alt="SVG">`;
  } else if (latestVersion.content.startsWith('```')) {
    const codeMatch = latestVersion.content.match(/```(?:\w+)?\n?([\s\S]*?)\n?```/);
    if (codeMatch && codeMatch[1]) {
      const codeContent = window.utils.escapeHtml(codeMatch[1]);
      visualContent = `<pre class="background-secondary padding-m radius-s" style="overflow: auto; max-height: 400px; font-family: monospace; white-space: pre-wrap;">${codeContent}</pre>`;
    }
  } else {
    const content = window.utils.escapeHtml(latestVersion.content.substring(0, 500) + (latestVersion.content.length > 500 ? '...' : ''));
    visualContent = `<div class="background-secondary padding-m radius-s" style="max-height: 400px; overflow: auto; line-height: 1.5; white-space: pre-wrap;">${content}</div>`;
  }
  
  const escapedTitle = window.utils.escapeHtml(artifact.title);
  const escapedId = window.utils.escapeHtml(artifact.id);
  
  return `
    <div class="column gap-m">
      <!-- Slideshow controls -->
      <div class="row align-center justify-between padding-m background-tertiary radius-s">
        <button class="row align-center gap-xs padding-s background-secondary radius-s transition" 
                onclick="window.artifactsView.previousSlide()" 
                style="cursor: pointer; border: none;"
                ${currentIndex === 0 ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
          <span>◀</span>
          <span>Previous</span>
        </button>
        
        <div class="column align-center gap-xs">
          <div style="font-weight: 500;">${escapedTitle}</div>
          <div style="opacity: 0.7;">${currentIndex + 1} of ${nonFolderArtifacts.length}</div>
        </div>
        
        <button class="row align-center gap-xs padding-s background-secondary radius-s transition" 
                onclick="window.artifactsView.nextSlide()" 
                style="cursor: pointer; border: none;"
                ${currentIndex === nonFolderArtifacts.length - 1 ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
          <span>Next</span>
          <span>▶</span>
        </button>
      </div>
      
      <!-- Main content area -->
      <div class="column align-center gap-m padding-xl background-primary radius-s" 
           onclick="window.context.setActiveView('artifact', { artifactId: '${escapedId}' })"
           style="cursor: pointer; min-height: 500px; position: relative;">
        <div class="column align-center gap-m" style="flex: 1; justify-content: center;">
          ${visualContent}
        </div>
        
        <!-- Artifact info -->
        <div class="row align-center gap-m">
          <div class="background-${artifact.type === 'link' ? 'accent' : 'secondary'} padding-xs radius-s">
            ${artifact.type.toUpperCase()}
          </div>
          <div style="opacity: 0.7;">Updated: ${new Date(artifact.updatedAt).toLocaleString()}</div>
        </div>
      </div>
      
      <!-- Thumbnail navigation -->
      <div class="row gap-s" style="flex-wrap: wrap; justify-content: center;">
        ${artifacts.map((thumbArtifact, index) => {
          const isActive = index === currentIndex;
          const escapedThumbTitle = window.utils.escapeHtml(thumbArtifact.title);
          return `
            <div class="padding-xs background-${isActive ? 'secondary' : 'tertiary'} radius-s transition" 
                 style="cursor: pointer; opacity: ${isActive ? '1' : '0.6'}; min-width: 80px; text-align: center; font-size: 0.8em;"
                 onclick="window.artifactsView.goToSlide(${index})"
                 title="${escapedThumbTitle}">
              ${index + 1}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderTreeView(artifacts) {
  // Organize artifacts into hierarchy
  const artifactMap = new Map();
  const rootArtifacts = [];
  
  // Build artifact map and identify root artifacts
  artifacts.forEach(artifact => {
    artifactMap.set(artifact.id, { ...artifact, children: [] });
    if (!artifact.parentId) {
      rootArtifacts.push(artifact.id);
    }
  });
  
  // Build parent-child relationships
  artifacts.forEach(artifact => {
    if (artifact.parentId && artifactMap.has(artifact.parentId)) {
      artifactMap.get(artifact.parentId).children.push(artifact.id);
    }
  });
  
  let html = `
    <div class="column gap-s">
      <!-- Tree toolbar -->
      <div class="row align-center gap-s padding-m background-tertiary radius-s">
        <button class="row align-center gap-xs padding-s background-secondary radius-s transition" 
                onclick="window.artifactsView.createGroup()" 
                style="cursor: pointer; border: none;"
                title="Create new folder">
          <span>📁</span>
          <span>New Folder</span>
        </button>
        <div style="opacity: 0.7; font-size: 0.9em;">
          Drag artifacts to organize them into folders
        </div>
      </div>
      
      <!-- Tree content -->
      <div class="column gap-xs">
  `;
  
  function renderArtifactNode(artifactId, level = 0) {
    const artifactData = artifactMap.get(artifactId);
    if (!artifactData) return '';
    
    const indent = level * 20;
    const isGroup = artifactData.type === 'group';
    const hasChildren = artifactData.children.length > 0;
    const expandedId = `tree-${artifactId}`;
    
    // Handle click behavior
    let clickHandler;
    if (artifactData.type === 'link') {
      const latestVersion = artifactData.versions[artifactData.versions.length - 1];
      const url = latestVersion.content.trim();
      const escapedUrl = window.utils.escapeHtml(url);
      clickHandler = `onclick="window.open('${escapedUrl}', '_blank', 'noopener,noreferrer')"`;
    } else if (!isGroup) {
      const escapedId = window.utils.escapeHtml(artifactData.id);
      clickHandler = `onclick="window.context.setActiveView('artifact', { artifactId: '${escapedId}' })"`;
    } else {
      clickHandler = ''; // Groups don't have click behavior
    }
    
    const escapedTitle = window.utils.escapeHtml(artifactData.title);
    const typeIcon = isGroup ? '📁' : getArtifactTypeIcon(artifactData.type);
    
    let nodeHtml = `
      <div class="column gap-none">
        <div class="row align-center gap-s padding-s transition" 
             style="margin-left: ${indent}px; cursor: ${isGroup ? 'default' : 'pointer'};"
             ${clickHandler}
             onmouseover="this.style.background='var(--color-tertiary-background)'"
             onmouseout="this.style.background='transparent'"
             draggable="true"
             ondragstart="window.artifactsView.dragStart(event, '${artifactData.id}')"
             ondragover="window.artifactsView.dragOver(event)"
             ondrop="window.artifactsView.dragDrop(event, '${artifactData.id}')">
          
          ${hasChildren ? `
            <span style="cursor: pointer; width: 16px; text-align: center;" 
                  onclick="event.stopPropagation(); window.artifactsView.toggleTreeNode('${expandedId}')">
              ▶
            </span>
          ` : '<span style="width: 16px;"></span>'}
          
          <span style="font-size: 1.1em;">${typeIcon}</span>
          
          <div class="row align-center gap-s" style="flex: 1;">
            <span>${escapedTitle}</span>
            ${isGroup ? '' : `
              <span style="opacity: 0.6; font-size: 0.8em;">
                ${artifactData.type.toUpperCase()}
              </span>
            `}
          </div>
          
          ${isGroup ? `
            <button class="padding-xs background-negative radius-s transition" 
                    onclick="event.stopPropagation(); window.artifactsView.deleteGroup('${artifactData.id}')"
                    style="cursor: pointer; border: none; opacity: 0.7;"
                    onmouseover="this.style.opacity='1'"
                    onmouseout="this.style.opacity='0.7'"
                    title="Delete folder">
              🗑️
            </button>
          ` : ''}
        </div>
        
        ${hasChildren ? `
          <div id="${expandedId}" class="column gap-xs" style="display: none;">
            ${artifactData.children.map(childId => renderArtifactNode(childId, level + 1)).join('')}
          </div>
        ` : ''}
      </div>
    `;
    
    return nodeHtml;
  }
  
  // Render root artifacts
  html += rootArtifacts.map(artifactId => renderArtifactNode(artifactId)).join('');
  
  html += `
      </div>
    </div>
  `;
  
  return html;
}

function getArtifactTypeIcon(type) {
  const icons = {
    'html': '🌐',
    'image': '🖼️', 
    'markdown': '📝',
    'text': '📄',
    'javascript': '💻',
    'css': '🎨',
    'json': '📊',
    'yaml': '⚙️',
    'link': '🔗',
    'files': '📁'
  };
  return icons[type] || '📄';
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

function switchViewMode(modeId) {
  if (ARTIFACT_VIEW_MODES[modeId]) {
    currentArtifactViewMode = modeId;
    
    // Reset slideshow index when switching to slideshow mode
    if (modeId === 'slideshow') {
      window.artifactsView.slideshowIndex = 0;
    }
    
    // Re-render the view
    refreshArtifactsView();
  }
}

// =================== Slideshow Navigation Functions ===================

function nextSlide() {
  const artifacts = window.context?.getCurrentChatArtifacts() || [];
  const currentIndex = window.artifactsView.slideshowIndex || 0;
  
  if (currentIndex < artifacts.length - 1) {
    window.artifactsView.slideshowIndex = currentIndex + 1;
    refreshArtifactsView();
  }
}

function previousSlide() {
  const currentIndex = window.artifactsView.slideshowIndex || 0;
  
  if (currentIndex > 0) {
    window.artifactsView.slideshowIndex = currentIndex - 1;
    refreshArtifactsView();
  }
}

function goToSlide(index) {
  const artifacts = window.context?.getCurrentChatArtifacts() || [];
  
  if (index >= 0 && index < artifacts.length) {
    window.artifactsView.slideshowIndex = index;
    refreshArtifactsView();
  }
}

// =================== Tree View Functions ===================

function createGroup() {
  const groupName = prompt('Enter folder name:');
  if (!groupName) return;
  
  if (window.artifactsModule?.createGroup) {
    window.artifactsModule.createGroup(groupName);
    refreshArtifactsView();
  }
}

function deleteGroup(groupId) {
  if (confirm('Delete this folder? All artifacts inside will be moved to the root level.')) {
    if (window.artifactsModule?.deleteGroup) {
      window.artifactsModule.deleteGroup(groupId);
      refreshArtifactsView();
    }
  }
}

function toggleTreeNode(nodeId) {
  const node = document.getElementById(nodeId);
  if (node) {
    const isVisible = node.style.display !== 'none';
    node.style.display = isVisible ? 'none' : 'block';
    
    // Update expand/collapse icon
    const toggleButton = node.previousElementSibling?.querySelector('span[onclick*="toggleTreeNode"]');
    if (toggleButton) {
      toggleButton.textContent = isVisible ? '▶' : '▼';
    }
  }
}

function dragStart(event, artifactId) {
  event.dataTransfer.setData('text/plain', artifactId);
  event.dataTransfer.effectAllowed = 'move';
}

function dragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
}

function dragDrop(event, targetId) {
  event.preventDefault();
  const sourceId = event.dataTransfer.getData('text/plain');
  
  if (sourceId && sourceId !== targetId && window.artifactsModule?.moveArtifact) {
    window.artifactsModule.moveArtifact(sourceId, targetId);
    refreshArtifactsView();
  }
}

// =================== Module Exports ===================

// Export view-specific functions for global access
window.artifactsView = {
  renderArtifactsView,
  refreshArtifactsView,
  switchViewMode,
  navigateToFolder,
  nextSlide,
  previousSlide,
  goToSlide,
  slideshowIndex: 0,
  // Tree view functions
  createGroup,
  deleteGroup,
  toggleTreeNode,
  dragStart,
  dragOver,
  dragDrop,
  // Export view modes for potential extension
  ARTIFACT_VIEW_MODES,
  currentArtifactViewMode: () => currentArtifactViewMode
}; 