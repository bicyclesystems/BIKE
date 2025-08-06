// =================== Artifacts Core Module ===================
// Core CRUD operations, initialization, and module coordination

// =================== Module Loading ===================
// Note: Artifacts modules are now loaded statically in index.html

// =================== Core Utility Functions ===================



// Timestamp utility function
function getCurrentTimestamp() {
  return new Date().toISOString();
}

// Active chat ID utility function
function getActiveChatId() {
  return window.context?.getActiveChatId();
}

// URL detection utility function
function isValidUrl(string) {
  try {
    const url = new URL(string.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

// File data detection utility function
function isFileData(string) {
  try {
    const data = JSON.parse(string);
    return data && typeof data === 'object' && 
           typeof data.name === 'string' && 
           typeof data.size === 'number' &&
           typeof data.type === 'string';
  } catch (_) {
    return false;
  }
}

// =================== Path Generation Utilities ===================

function generateArtifactPath(type, counter) {
  // Extension mapping
  const extensions = {
    'html': 'html',
    'css': 'css', 
    'javascript': 'js',
    'json': 'json',
    'yaml': 'yml',
    'markdown': 'md',
    'image': 'svg',
    'text': 'txt',
    'link': 'url',
    'files': 'file'
  };
  
  // Folder mapping for organized structure
  const folders = {
    'html': '',           // Root level
    'css': 'styles/',     // CSS in styles folder
    'javascript': 'js/',  // JS in js folder
    'json': 'data/',      // JSON in data folder
    'yaml': 'config/',    // YAML in config folder
    'markdown': 'docs/',  // Markdown in docs folder
    'image': 'assets/',   // Images in assets folder
    'text': 'docs/',      // Text files in docs folder
    'link': 'links/',     // Links in links folder
    'files': 'uploads/'   // Files in uploads folder
  };
  
  const ext = extensions[type] || 'txt';
  const folder = folders[type] || '';
  
  // Generate filename and title
  const baseFilename = counter === 1 ? `${type}.${ext}` : `${type}${counter}.${ext}`;
  const path = folder + baseFilename;
  
  // Generate descriptive title
  const titles = {
    'html': counter === 1 ? 'Homepage' : `Page ${counter}`,
    'css': counter === 1 ? 'Main Styles' : `Styles ${counter}`,
    'javascript': counter === 1 ? 'Main Script' : `Script ${counter}`,
    'json': counter === 1 ? 'Data Config' : `Data ${counter}`,
    'yaml': counter === 1 ? 'App Config' : `Config ${counter}`,
    'markdown': counter === 1 ? 'Documentation' : `Document ${counter}`,
    'image': counter === 1 ? 'Logo' : `Image ${counter}`,
    'text': counter === 1 ? 'Notes' : `Notes ${counter}`,
    'link': counter === 1 ? 'External Link' : `Link ${counter}`,
    'files': counter === 1 ? 'Upload' : `Upload ${counter}`
  };
  
  const title = titles[type] || baseFilename;
  
  return { path, filename: baseFilename, title };
}

// =================== Core Artifact Functions ===================

function createArtifactBase(content, messageId, type = null, shouldSetActive = true) {
  const activeChatId = getActiveChatId();
  if (activeChatId === null || activeChatId === undefined) {
    return null;
  }
  
  const artifactsInChat = window.context?.getCurrentChatArtifacts() || [];
  const id = shouldSetActive ? Date.now().toString() : 
             Date.now().toString() + Math.random().toString(36).substr(2, 9); // Ensure uniqueness for silent
  
  if (!type) {
    const trimmedContent = content.trim();
    // Auto-detect artifact type from content - keep it simple
    if (/^<!DOCTYPE html>|<html[\s>]/i.test(trimmedContent)) type = 'html';
    else if (trimmedContent.startsWith('<svg')) type = 'image'; // SVG images  
    else if (content.startsWith('[[image:')) type = 'image'; // External images
    else if (content.startsWith('```')) type = 'markdown';
    else if (isValidUrl(trimmedContent)) type = 'link';
    else if (trimmedContent.startsWith('{') && isFileData(trimmedContent)) type = 'files';
    // Content-based detection
    else if (/^\s*[.#]?[\w-]+\s*\{/.test(trimmedContent) || /^\s*@(import|media|keyframes)/.test(trimmedContent)) type = 'css';
    else if (/^\s*(function|const|let|var|class|import|export)/.test(trimmedContent) || trimmedContent.includes('=>')) type = 'javascript';
    else if ((trimmedContent.startsWith('{') || trimmedContent.startsWith('[')) && isValidJSON(trimmedContent)) type = 'json';
    else if (/^---\s*$|^[a-zA-Z_][a-zA-Z0-9_]*:\s*.+$/m.test(trimmedContent)) type = 'yaml';
    else type = 'text';
  }

  function isValidJSON(str) {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }
  
  // Generate smart path, filename, and title based on type
  const { path, filename, title } = generateArtifactPath(type, artifactsInChat.length + 1);
  
  const artifact = {
    id,
    title, // Use descriptive title
    type,
    path,
    versions: [{ content, timestamp: getCurrentTimestamp() }],
    createdAt: getCurrentTimestamp(),
    updatedAt: getCurrentTimestamp(),
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

function createArtifact(content, messageId, type = null) {
  return createArtifactBase(content, messageId, type, true);
}

// Create artifact without auto-opening it
function createArtifactSilent(content, messageId, type = null) {
  return createArtifactBase(content, messageId, type, false);
}

function updateArtifact(id, content) {
  const artifacts = (window.context?.getArtifacts() || []).slice();
  const activeChatId = getActiveChatId();
  const artifact = artifacts.find(a => a.id === id && a.chatId === activeChatId);
  if (!artifact) return null;
  artifact.versions.push({ content, timestamp: getCurrentTimestamp() });
  artifact.updatedAt = getCurrentTimestamp();
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
    if (e.target.classList && e.target.classList.contains('artifact-link')) {
      const artifactId = e.target.getAttribute('data-artifact-id');
      window.context?.setActiveArtifactId(artifactId);
    }
  }, true);
  
  // Handle version item clicks
  document.addEventListener('click', function (e) {
    // Handle version action buttons
    if (e.target.classList && e.target.classList.contains('delete-version')) {
      e.stopPropagation();
      const artifactId = e.target.getAttribute('data-artifact-id');
      const versionIdx = parseInt(e.target.getAttribute('data-version-idx'));
      
      if (confirm('Are you sure you want to delete this version? This action cannot be undone.')) {
        // Use version module function
        if (window.versionsModule?.deleteArtifactVersion) {
          window.versionsModule.deleteArtifactVersion(artifactId, versionIdx);
        }
      }
      return;
    }
    
    // Handle version item clicks
    if (e.target.classList && e.target.classList.contains('artifact-version-item')) {
      const artifactId = e.target.getAttribute('data-artifact-id');
      const idx = parseInt(e.target.getAttribute('data-version-idx'));
      // Use version module function
      if (window.versionsModule?.setArtifactVersion) {
        window.versionsModule.setArtifactVersion(artifactId, idx);
      }
      return;
    }
    
    // Handle clicks on version-info (child of version-item)
    if (e.target.closest && e.target.closest('.artifact-version-item')) {
      const versionItem = e.target.closest('.artifact-version-item');
      const artifactId = versionItem.getAttribute('data-artifact-id');
      const idx = parseInt(versionItem.getAttribute('data-version-idx'));
      // Use version module function
      if (window.versionsModule?.setArtifactVersion) {
        window.versionsModule.setArtifactVersion(artifactId, idx);
      }
      return;
    }
  });
}

// =================== Content Resolution & Utilities ===================

function resolveArtifactContent(artifactId, versionIdx = null) {
  const artifact = getArtifact(artifactId);
  if (!artifact) return null;
  
  const targetVersionIdx = versionIdx ?? artifact.versions.length - 1;
  const version = artifact.versions[targetVersionIdx];
  
  if (!version) return null;
  
  return {
    id: artifact.id,
    title: artifact.title,
    type: artifact.type,
    content: version.content,
    timestamp: version.timestamp,
    versionIndex: targetVersionIdx,
    totalVersions: artifact.versions.length
  };
}

function resolveMultipleArtifacts(artifactReferences) {
  return artifactReferences.map(ref => {
    const match = ref.match(/\[\[artifact:(.*?)\]\]/);
    if (match) {
      return resolveArtifactContent(match[1]);
    }
    return null;
  }).filter(Boolean);
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getFileIcon(fileName, mimeType) {
  const ext = fileName.toLowerCase().split('.').pop();
  
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType.startsWith('video/')) return '🎥';
  if (mimeType.startsWith('audio/')) return '🎵';
  if (mimeType.startsWith('text/') || ['txt', 'md', 'markdown'].includes(ext)) return '📝';
  if (['pdf'].includes(ext)) return '📄';
  if (['doc', 'docx'].includes(ext)) return '📄';
  if (['xls', 'xlsx'].includes(ext)) return '📊';
  if (['ppt', 'pptx'].includes(ext)) return '📺';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '🗜️';
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'html', 'css', 'php', 'rb', 'go', 'rs'].includes(ext)) return '💻';
  
  return '📁';
}

// Utility function to get favicon URL from a website URL
function getFaviconUrl(url) {
  try {
    // Use the global domain extraction utility from chat.js
    const domain = window.utils.getDomainFromUrl(url);
    
    // Use Google's favicon service as primary, with fallback to domain/favicon.ico
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
  } catch (e) {
    // For invalid URLs, return null
    return null;
  }
}

// =================== Initialization ===================

function init() {
  // Setup artifact-specific click handlers
  setupArtifactClickHandlers();
  
  // Load artifacts data
  if (window.memory?.loadArtifacts) {
    window.memory.loadArtifacts();
  }
}

// =================== Module Integration ===================

// Function to get module functions safely
function getModuleFunction(moduleName, functionName) {
  const module = window[moduleName];
  if (module && typeof module[functionName] === 'function') {
    return module[functionName];
  }
  console.warn(`[ARTIFACTS] Function ${functionName} not available in ${moduleName}`);
  return null;
}

// =================== Module Exports ===================

// Wait for all modules to load, then export unified interface
function initializeArtifactsModule() {
  const checkModulesLoaded = () => {
    // Check if versions module is loaded
    if (window.versionsModule) {
      // Create unified interface without grouping functions
      window.artifactsModule = {
        // Core functions
        createArtifact,
        createArtifactSilent,
        updateArtifact,
        getArtifact,
        resolveArtifactContent,
        resolveMultipleArtifacts,
        formatFileSize,
        getFileIcon,
        setupArtifactClickHandlers,
        getFaviconUrl,
        generateArtifactPath,
        
        // Version management functions (from versions module)
        getArtifactVersion: getModuleFunction('versionsModule', 'getArtifactVersion'),
        setArtifactVersion: getModuleFunction('versionsModule', 'setArtifactVersion'),
        deleteArtifactVersion: getModuleFunction('versionsModule', 'deleteArtifactVersion'),
        
        // Smart deduplication functions (from versions module)
        findBestMatchingArtifact: getModuleFunction('versionsModule', 'findBestMatchingArtifact'),
        shouldUpdateArtifact: getModuleFunction('versionsModule', 'shouldUpdateArtifact'),
        isRefinedTitle: getModuleFunction('versionsModule', 'isRefinedTitle'),
        calculateSimilarity: getModuleFunction('versionsModule', 'calculateSimilarity'),
        calculateContentSimilarity: getModuleFunction('versionsModule', 'calculateContentSimilarity'),
        extractHtmlElements: getModuleFunction('versionsModule', 'extractHtmlElements'),
        levenshteinDistance: getModuleFunction('versionsModule', 'levenshteinDistance'),
        
        init
      };
      
      // Also make it available as `artifacts` for backward compatibility
      window.artifacts = window.artifactsModule;
      
      console.log('[ARTIFACTS] Module loaded with path-based system');
    } else {
      // Versions module not loaded yet, check again
      setTimeout(checkModulesLoaded, 100);
    }
  };
  
  // Start checking
  checkModulesLoaded();
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