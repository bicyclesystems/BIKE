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

async function renderArtifactsView(data) {
  const allArtifacts = window.artifactsModule?.getCurrentChatArtifacts() || [];
  
  if (allArtifacts.length === 0) {
    return `
      <div class="padding-l view">
        <h1>No artifacts in this chat yet.</h1>
      </div>
    `;
  }
  
  // Always use gallery view with all artifacts
  const galleryContent = await renderGalleryView(allArtifacts, allArtifacts);
  
  return `
    <div class="column gap-m padding-xl">
      ${galleryContent}
    </div>
  `;
}





async function renderGalleryView(artifacts, allArtifacts) {
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
  
  let html = `<div style="display: flex; flex-wrap: wrap; gap: 16px;">`;
  
  // First render root artifacts without any folder grouping
  for (const artifact of rootArtifacts) {
    html += await renderSingleArtifact(artifact, null); // No group title for root artifacts
  }
  
  // Then render folder groups
  for (const [folder, groupArtifacts] of folderGroups) {
    const folderTitle = folder.replace('/', '');
    html += await renderArtifactGroup(groupArtifacts, folderTitle);
  }
  
  html += '</div>';
  return html;
}

async function renderArtifactGroup(artifacts, groupTitle) {
  if (artifacts.length === 0) return '';
  
  // If only one artifact, render normally
  if (artifacts.length === 1) {
    return await renderSingleArtifact(artifacts[0], groupTitle);
  }
  
  // Multiple artifacts - create stacked effect as the visual preview
  let stackContent = '';
  for (const [index, artifact] of artifacts.entries()) {
    const offsetX = index * 8;
    const offsetY = index * 8;
    const zIndex = artifacts.length - index;
    const opacity = index === 0 ? 1 : 0.8;
    const scale = index === 0 ? 1 : 0.95;
    
    stackContent += await renderStackedArtifact(artifact, offsetX, offsetY, zIndex, opacity, scale, index);
  }
  
  // Create the stacked visual as the "visualPreview" for the group
  const groupVisualPreview = `
    <div style="position: relative; overflow: visible; width: 100px; height: 100px;" onmouseenter="this.querySelectorAll('div[data-scale]').forEach((card, i) => { const directions = [[-20, -15], [25, -10], [-15, 20], [30, 18], [0, -25], [-25, 0]]; const dir = directions[i % directions.length]; card.style.transform = 'scale(' + card.dataset.scale + ') translate(' + dir[0] + 'px, ' + dir[1] + 'px)'; card.style.opacity = '1'; })" onmouseleave="this.querySelectorAll('div[data-scale]').forEach((card, i) => { card.style.transform = 'scale(' + card.dataset.scale + ')'; card.style.opacity = i === 0 ? '1' : '0.8'; })">
      ${stackContent}
    </div>
  `;
  
  // Create group container with 100px dimensions
  return `
    <div style="display: flex; flex-direction: column; gap: 8px; align-items: center;">
      <div style="font-size: 10px; opacity: 0.6; text-align: center;">${window.utils.escapeHtml(groupTitle)}</div>
      <div style="width: 100px; height: 100px; position: relative; cursor: pointer; overflow: hidden;" onmouseenter="this.querySelector('div[style*=\"opacity: 0\"]').style.opacity='1'" onmouseleave="this.querySelector('div[style*=\"opacity: 1\"]').style.opacity='0'">
        ${groupVisualPreview}
        ${renderArtifactTitle(`${artifacts.length} artifacts`)}
      </div>
    </div>
  `;
}

// Helper functions removed - now handled inline for 100px layout

// Helper function for artifact title with hover effect (DRY)
function renderArtifactTitle(title) {
  return `<div style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.7); color: white; padding: 4px; font-size: 10px; opacity: 0; transition: opacity 0.2s;">${window.utils.escapeHtml(title)}</div>`;
}

// Generate artifact preview using the unified renderer
async function generateArtifactPreview(artifact) {
  try {
    // Use the exact same renderer as the full artifact view
    const visualPreview = await window.artifactView.renderArtifactContent(artifact);
    return { preview: '', visualPreview };
  } catch (error) {
    console.error('Error generating artifact preview:', error);
    
    // Fallback to simple text preview
    const latestVersion = artifact.versions[artifact.versions.length - 1];
    const preview = latestVersion.content.substring(0, 100) + '...';
    const visualPreview = `<div class="text-s background-secondary padding-m radius-s box-l">${window.utils.escapeHtml(preview)}</div>`;
    
    return { preview: '', visualPreview };
  }
}

// Shared click handler generation logic
function generateArtifactClickHandler(artifact) {
  const latestVersion = artifact.versions[artifact.versions.length - 1];
  const escapedId = window.utils.escapeHtml(artifact.id);
  
  return `onclick="window.views.switchView('artifact', { artifactId: '${escapedId}' })"`;
}

async function renderSingleArtifact(artifact, groupTitle) {
  const { preview, visualPreview } = await generateArtifactPreview(artifact);
  const clickHandler = generateArtifactClickHandler(artifact);
  
  // For 100px items, we don't show group title inside the container
  if (groupTitle) {
    return `
      <div style="display: flex; flex-direction: column; gap: 8px; align-items: center;">
        <div style="font-size: 10px; opacity: 0.6; text-align: center;">${window.utils.escapeHtml(groupTitle)}</div>
        <div ${clickHandler} style="width: 100px; height: 100px; position: relative; cursor: pointer; overflow: hidden;" onmouseenter="this.querySelector('div[style*=\"opacity: 0\"]').style.opacity='1'" onmouseleave="this.querySelector('div[style*=\"opacity: 1\"]').style.opacity='0'">
          <div style="width: 100px; height: 100px; overflow: hidden;">${visualPreview || ''}</div>
          ${renderArtifactTitle(artifact.title)}
        </div>
      </div>
    `;
  }
  
  return `
    <div ${clickHandler} style="width: 100px; height: 100px; position: relative; cursor: pointer; overflow: hidden;" onmouseenter="this.querySelector('div[style*=\"opacity: 0\"]').style.opacity='1'" onmouseleave="this.querySelector('div[style*=\"opacity: 1\"]').style.opacity='0'">
      <div style="width: 100px; height: 100px; overflow: hidden;">${visualPreview || ''}</div>
      ${renderArtifactTitle(artifact.title)}
    </div>
  `;
}

async function renderStackedArtifact(artifact, offsetX, offsetY, zIndex, opacity, scale, index) {
  const { preview, visualPreview } = await generateArtifactPreview(artifact);
  const clickHandler = generateArtifactClickHandler(artifact);
  
  return `
    <div ${clickHandler} data-scale="${scale}" data-original-zindex="${zIndex}" onmouseenter="this.querySelector('div[style*=\"opacity: 0\"]').style.opacity='1'; this.style.zIndex='1000';" onmouseleave="this.querySelector('div[style*=\"opacity: 1\"]').style.opacity='0'; this.style.zIndex=this.dataset.originalZindex;" style="position: absolute; top: ${offsetY}px; left: ${offsetX}px; width: 100px; height: 100px; z-index: ${zIndex}; opacity: ${opacity}; transform: scale(${scale}); cursor: pointer; overflow: hidden;">
      <div style="width: 100px; height: 100px; overflow: hidden;">${visualPreview || ''}</div>
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
  const activeView = window.views?.getActiveView();
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