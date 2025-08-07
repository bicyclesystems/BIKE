// =================== Artifacts Core Module ===================
// Core CRUD operations, initialization, and module coordination

// =================== Module Loading ===================
// Note: Artifacts modules are now loaded statically in index.html

// =================== Constants ===================

const ARTIFACT_CONFIG = {
  extensions: {
    html: 'html',
    css: 'css', 
    javascript: 'js',
    json: 'json',
    yaml: 'yml',
    markdown: 'md',
    image: 'svg',
    text: 'txt',
    files: 'file'
  },
  
  folders: {
    html: '',
    css: 'styles/',
    javascript: 'js/',
    json: 'data/',
    yaml: 'config/',
    markdown: 'docs/',
    image: 'assets/',
    text: 'docs/',
    files: 'uploads/'
  },
  
  titles: {
    html: (counter) => counter === 1 ? 'Homepage' : `Page ${counter}`,
    css: (counter) => counter === 1 ? 'Main Styles' : `Styles ${counter}`,
    javascript: (counter) => counter === 1 ? 'Main Script' : `Script ${counter}`,
    json: (counter) => counter === 1 ? 'Data Config' : `Data ${counter}`,
    yaml: (counter) => counter === 1 ? 'App Config' : `Config ${counter}`,
    markdown: (counter) => counter === 1 ? 'Documentation' : `Document ${counter}`,
    image: (counter) => counter === 1 ? 'Logo' : `Image ${counter}`,
    text: (counter) => counter === 1 ? 'Notes' : `Notes ${counter}`,
    files: (counter) => counter === 1 ? 'Upload' : `Upload ${counter}`
  },
  
  typePatterns: {
    html: /^<!DOCTYPE html>|<html[\s>]/i,
    svg: /^\s*<svg/,
    image: /^\[\[image:/,
    markdown: /^```/,
    css: /^\s*[.#]?[\w-]+\s*\{|^\s*@(import|media|keyframes)/,
    javascript: /^\s*(function|const|let|var|class|import|export)|=>/,
    yaml: /^---\s*$|^[a-zA-Z_][a-zA-Z0-9_]*:\s*.+$/m
  },
  

  
  thresholds: {
    contentSimilarity: 0.25,
    fuzzyMatch: 0.7,
    structuralMatch: 0.6
  }
};

// =================== Core Utility Functions ===================

const utils = {
  getCurrentTimestamp: () => new Date().toISOString(),
  
  getActiveChatId: () => window.context?.getActiveChatId(),
  
  isValidUrl: (string) => {
    try {
      const url = new URL(string.trim());
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
      return false;
    }
  },
  
  isValidJSON: (str) => {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  },
  
  isFileData: (string) => {
    try {
      const data = JSON.parse(string);
      return data && typeof data === 'object' && 
             typeof data.name === 'string' && 
             typeof data.size === 'number' &&
             typeof data.type === 'string';
    } catch (_) {
      return false;
    }
  },
  
  detectType: (content) => {
    const trimmed = content.trim();
    
    // Check each pattern
    if (ARTIFACT_CONFIG.typePatterns.html.test(trimmed)) return 'html';
    if (ARTIFACT_CONFIG.typePatterns.svg.test(trimmed)) return 'image';
    if (ARTIFACT_CONFIG.typePatterns.image.test(content)) return 'image';
    if (ARTIFACT_CONFIG.typePatterns.markdown.test(trimmed)) return 'markdown';
    if (utils.isFileData(trimmed)) return 'files';
    if (ARTIFACT_CONFIG.typePatterns.css.test(trimmed)) return 'css';
    if (ARTIFACT_CONFIG.typePatterns.javascript.test(trimmed)) return 'javascript';
    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && utils.isValidJSON(trimmed)) return 'json';
    if (ARTIFACT_CONFIG.typePatterns.yaml.test(trimmed)) return 'yaml';
    
    return 'text';
  }
};

// Helper function for refreshing active artifact view
function refreshActiveArtifactView(artifactId) {
  const activeView = window.context?.getActiveView();
  if (activeView && activeView.type === 'artifact' && activeView.data.artifactId === artifactId) {
    window.views?.renderCurrentView?.();
  }
}

// =================== Path Generation Utilities ===================

function generateArtifactPath(type, counter) {
  const ext = ARTIFACT_CONFIG.extensions[type] || 'txt';
  const folder = ARTIFACT_CONFIG.folders[type] || '';
  const baseFilename = counter === 1 ? `${type}.${ext}` : `${type}${counter}.${ext}`;
  const path = folder + baseFilename;
  const titleFn = ARTIFACT_CONFIG.titles[type];
  const title = titleFn ? titleFn(counter) : baseFilename;
  
  return { path, filename: baseFilename, title };
}

// =================== Core Artifact Functions ===================

function createArtifact(content, messageId, type = null, shouldSetActive = false) {
  const activeChatId = utils.getActiveChatId();
  if (activeChatId === null || activeChatId === undefined) {
    return null;
  }
  
  const artifactsInChat = window.context?.getCurrentChatArtifacts() || [];
  const id = Date.now().toString() + (shouldSetActive ? '' : Math.random().toString(36).substr(2, 9));
  
  if (!type) {
    type = utils.detectType(content);
  }
  
  const { path, filename, title } = generateArtifactPath(type, artifactsInChat.length + 1);
  const timestamp = utils.getCurrentTimestamp();
  
  const artifact = {
    id,
    title,
    type,
    path,
    versions: [{ content, timestamp }],
    createdAt: timestamp,
    updatedAt: timestamp,
    messageId,
    chatId: activeChatId
  };
  
  if (!artifact.chatId) {
    throw new Error('Artifact created without chatId!');
  }
  
  const currentArtifacts = window.context?.getArtifacts() || [];
  window.context?.setContext({ artifacts: [...currentArtifacts, artifact] });
  window.memory?.saveArtifacts();
  
  if (shouldSetActive) {
    window.context?.setActiveArtifactId(id);
  }
  
  return artifact;
}

function updateArtifact(id, content) {
  const artifacts = (window.context?.getArtifacts() || []).slice();
  const activeChatId = utils.getActiveChatId();
  const artifact = artifacts.find(a => a.id === id && a.chatId === activeChatId);
  if (!artifact) return null;
  
  const timestamp = utils.getCurrentTimestamp();
  artifact.versions.push({ content, timestamp });
  artifact.updatedAt = timestamp;
  
  window.context?.setContext({
    artifacts: artifacts,
    activeVersionIdxByArtifact: { 
      ...window.context.getActiveVersionIndex ? {} : {}, 
      [id]: artifact.versions.length - 1 
    }
  });
  window.context?.setActiveVersionIndex(id, artifact.versions.length - 1);
  window.memory?.saveArtifacts();
  
  return artifact;
}

function getArtifact(id) {
  return window.context?.findCurrentChatArtifact(id);
}

// =================== Artifact Click Handlers ===================

function setupArtifactClickHandlers() {
  // Handle artifact link hover
  document.addEventListener('mouseenter', function (e) {
    if (e.target.classList?.contains('artifact-link')) {
      const artifactId = e.target.getAttribute('data-artifact-id');
      window.context?.setActiveArtifactId(artifactId);
    }
  }, true);
  
  // Handle click events with delegation
  document.addEventListener('click', function (e) {
    const { target } = e;
    
    // Handle version deletion
    if (target.classList?.contains('delete-version')) {
      e.stopPropagation();
      const artifactId = target.getAttribute('data-artifact-id');
      const versionIdx = parseInt(target.getAttribute('data-version-idx'));
      
      if (confirm('Are you sure you want to delete this version? This action cannot be undone.')) {
        deleteArtifactVersion(artifactId, versionIdx);
      }
      return;
    }
    
    // Handle version selection
    const versionItem = target.classList?.contains('artifact-version-item') ? target : target.closest?.('.artifact-version-item');
    if (versionItem) {
      const artifactId = versionItem.getAttribute('data-artifact-id');
      const idx = parseInt(versionItem.getAttribute('data-version-idx'));
      setArtifactVersion(artifactId, idx);
    }
  });
}

// =================== Version Management Functions ===================

function getArtifactVersion(artifactId, versionIdx) {
  const artifact = getArtifact(artifactId);
  if (!artifact || versionIdx < 0 || versionIdx >= artifact.versions.length) {
    return null;
  }
  return artifact.versions[versionIdx];
}

function setArtifactVersion(artifactId, versionIdx) {
  const artifact = getArtifact(artifactId);
  if (!artifact || versionIdx < 0 || versionIdx >= artifact.versions.length) {
    return false;
  }
  
  window.context?.setActiveVersionIndex(artifactId, versionIdx);
  refreshActiveArtifactView(artifactId);
  
  return true;
}

function deleteArtifactVersion(artifactId, versionIdx) {
  const artifacts = (window.context?.getArtifacts() || []).slice();
  const activeChatId = utils.getActiveChatId();
  const artifact = artifacts.find(a => a.id === artifactId && a.chatId === activeChatId);
  
  if (!artifact || artifact.versions.length <= 1 || versionIdx < 0 || versionIdx >= artifact.versions.length) {
    return false;
  }
  
  artifact.versions.splice(versionIdx, 1);
  artifact.updatedAt = utils.getCurrentTimestamp();
  
  const currentActiveIdx = window.context?.getActiveVersionIndex(artifactId) ?? artifact.versions.length;
  const newActiveIdx = currentActiveIdx >= versionIdx ? Math.max(0, currentActiveIdx - 1) : currentActiveIdx;
  
  window.context?.setContext({ artifacts: artifacts });
  window.context?.setActiveVersionIndex(artifactId, newActiveIdx);
  window.memory?.saveArtifacts();
  
  // Re-render if this artifact is currently active
  refreshActiveArtifactView(artifactId);
  
  return true;
}

// =================== Smart Deduplication & Matching ===================

function findBestMatchingArtifact(title, type, content) {
  const currentChatArtifacts = window.context?.getCurrentChatArtifacts() || [];
  
  // Private helper functions
  const levenshteinDistance = (str1, str2) => {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  };
  
  const calculateSimilarity = (str1, str2) => {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  };
  
  const extractHtmlElements = (html) => {
    const tagMatches = html.match(/<(\w+)(?:\s[^>]*)?>/g) || [];
    const classMatches = html.match(/class\s*=\s*["']([^"']+)["']/g) || [];
    
    const tags = tagMatches.map(tag => tag.match(/<(\w+)/)[1]);
    const classes = classMatches.map(cls => cls.match(/class\s*=\s*["']([^"']+)["']/)[1]);
    
    return [...new Set([...tags, ...classes])];
  };
  
  const calculateContentSimilarity = (content1, content2) => {
    // For HTML content, compare structure
    if (content1.includes('<html') && content2.includes('<html')) {
      const elements1 = extractHtmlElements(content1);
      const elements2 = extractHtmlElements(content2);
      
      const commonElements = elements1.filter(el => elements2.includes(el));
      const totalElements = new Set([...elements1, ...elements2]).size;
      
      return totalElements > 0 ? commonElements.length / totalElements : 0;
    }
    
    // For text content, use text similarity
    return calculateSimilarity(content1.substring(0, 500), content2.substring(0, 500));
  };
  
  // First, try exact title and type match
  let match = currentChatArtifacts.find(a => a.title === title && a.type === type);
  if (match) {
    return match;
  }
  
  // Try case-insensitive title match with same type
  match = currentChatArtifacts.find(a => 
    a.title.toLowerCase() === title.toLowerCase() && a.type === type
  );
  if (match) {
    return match;
  }
  
  // Try fuzzy title matching for refinements
  match = currentChatArtifacts.find(a => {
    if (a.type !== type) return false;
    const aTitle = a.title.toLowerCase();
    const newTitle = title.toLowerCase();
    
    const similarity = calculateSimilarity(aTitle, newTitle);
    const contains = aTitle.includes(newTitle) || newTitle.includes(aTitle);
    
    return contains || similarity > ARTIFACT_CONFIG.thresholds.fuzzyMatch;
  });
  if (match) return match;
  
  // For HTML apps and similar content, check content similarity
  if (['html', 'markdown', 'code'].includes(type)) {
    match = currentChatArtifacts.find(a => {
      if (a.type !== type) return false;
      const latestVersion = a.versions[a.versions.length - 1];
      const similarity = calculateContentSimilarity(latestVersion.content, content);
      
      return similarity > ARTIFACT_CONFIG.thresholds.structuralMatch;
    });
    if (match) return match;
  }
  
  return null;
}

function shouldUpdateArtifact(existingArtifact, newContent) {
  const latestVersion = existingArtifact.versions[existingArtifact.versions.length - 1];
  
  if (latestVersion.content.trim() === newContent.trim()) {
    return false;
  }
  
  // Private helper functions
  const levenshteinDistance = (str1, str2) => {
    const matrix = [];
    for (let i = 0; i <= str2.length; i++) matrix[i] = [i];
    for (let j = 0; j <= str1.length; j++) matrix[0][j] = j;
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[str2.length][str1.length];
  };
  
  const calculateSimilarity = (str1, str2) => {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    if (longer.length === 0) return 1.0;
    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  };
  
  const extractHtmlElements = (html) => {
    const tagMatches = html.match(/<(\w+)(?:\s[^>]*)?>/g) || [];
    const classMatches = html.match(/class\s*=\s*["']([^"']+)["']/g) || [];
    const tags = tagMatches.map(tag => tag.match(/<(\w+)/)[1]);
    const classes = classMatches.map(cls => cls.match(/class\s*=\s*["']([^"']+)["']/)[1]);
    return [...new Set([...tags, ...classes])];
  };
  
  const calculateContentSimilarity = (content1, content2) => {
    if (content1.includes('<html') && content2.includes('<html')) {
      const elements1 = extractHtmlElements(content1);
      const elements2 = extractHtmlElements(content2);
      const commonElements = elements1.filter(el => elements2.includes(el));
      const totalElements = new Set([...elements1, ...elements2]).size;
      return totalElements > 0 ? commonElements.length / totalElements : 0;
    }
    return calculateSimilarity(content1.substring(0, 500), content2.substring(0, 500));
  };
  
  const contentSimilarity = calculateContentSimilarity(latestVersion.content, newContent);
  return contentSimilarity > ARTIFACT_CONFIG.thresholds.contentSimilarity;
}

function isRefinedTitle(newTitle, oldTitle) {
  const newLower = newTitle.toLowerCase();
  const oldLower = oldTitle.toLowerCase();
  
  // Private helper functions
  const levenshteinDistance = (str1, str2) => {
    const matrix = [];
    for (let i = 0; i <= str2.length; i++) matrix[i] = [i];
    for (let j = 0; j <= str1.length; j++) matrix[0][j] = j;
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[str2.length][str1.length];
  };
  
  const calculateSimilarity = (str1, str2) => {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    if (longer.length === 0) return 1.0;
    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  };
  
  return newTitle.length > oldTitle.length && 
         (newLower.includes(oldLower) || calculateSimilarity(newLower, oldLower) > ARTIFACT_CONFIG.thresholds.fuzzyMatch);
}



// =================== Content Resolution & Utilities ===================







// =================== Initialization ===================

function init() {
  // Setup artifact-specific click handlers
  setupArtifactClickHandlers();
  
  // Load artifacts data
  if (window.memory?.loadArtifacts) {
    window.memory.loadArtifacts();
  }
}

// =================== Module Exports ===================

function initializeArtifactsModule() {
  // Core API
  const coreAPI = {
    createArtifact,
    updateArtifact,
    getArtifact,
    generateArtifactPath,
    init
  };
  
  // Version management
  const versionAPI = {
    getArtifactVersion,
    setArtifactVersion,
    deleteArtifactVersion
  };
  
  // Content utilities
  const contentAPI = {
    // No utilities needed - moved to usage locations
  };
  
  // Smart matching
  const matchingAPI = {
    findBestMatchingArtifact,
    shouldUpdateArtifact,
    isRefinedTitle
  };
  
  // Event handling
  const eventAPI = {
    setupArtifactClickHandlers
  };
  
  // Create unified interface
  window.artifactsModule = {
    ...coreAPI,
    ...versionAPI,
    ...contentAPI,
    ...matchingAPI,
    ...eventAPI
  };
  
  // Backward compatibility
  window.artifacts = window.artifactsModule;
  
  console.log('[ARTIFACTS] Module loaded with unified artifact system');
}

// Auto-initialize the artifacts module
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initializeArtifactsModule();
    });
  } else {
    // Document already loaded
    initializeArtifactsModule();
  }
}
