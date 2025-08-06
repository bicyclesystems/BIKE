// =================== NoHost Manager ===================
// Chat-as-folder integration of nohost web server for artifacts

class NoHostManager {
  constructor() {
    this.fs = null;
    this.isReady = false;
    this.readyPromise = null;
    this.chatFolders = new Set(); // Track created chat folders
  }

  async init() {
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = this._initialize();
    return this.readyPromise;
  }

  async _initialize() {
    try {
      // Register nohost service worker
      if ('serviceWorker' in navigator) {
        await navigator.serviceWorker.register('./views/view-artifact/nohost/nohost-sw.js');
        console.log('[NoHost] Service worker registered');
      } else {
        throw new Error('Service workers not supported');
      }

      // Initialize filesystem
      this.fs = new Filer.FileSystem();
      this.isReady = true;
      console.log('[NoHost] Filesystem initialized');
      
      return true;
    } catch (error) {
      console.error('[NoHost] Initialization failed:', error);
      throw error;
    }
  }

  async ensureChatFolder(chatId) {
    if (this.chatFolders.has(chatId)) {
      return;
    }

    return new Promise((resolve, reject) => {
      const folderPath = `/chat-${chatId}`;
      this.fs.mkdir(folderPath, (err) => {
        if (err && err.code !== 'EEXIST') {
          console.error(`[NoHost] Failed to create chat folder ${folderPath}:`, err);
          reject(err);
        } else {
          this.chatFolders.add(chatId);
          console.log(`[NoHost] Ensured chat folder ${folderPath}`);
          resolve();
        }
      });
    });
  }

  async createGroupFolders(chatId, artifacts) {
    // Find all group artifacts and create folders for them
    const groups = artifacts.filter(artifact => artifact.type === 'group');
    
    for (const group of groups) {
      const groupPath = this.getGroupPath(chatId, group.id, artifacts);
      await this.ensureFolder(groupPath);
    }
  }

  async ensureFolder(folderPath) {
    return new Promise((resolve, reject) => {
      this.fs.mkdir(folderPath, (err) => {
        if (err && err.code !== 'EEXIST') {
          console.error(`[NoHost] Failed to create folder ${folderPath}:`, err);
          reject(err);
        } else {
          console.log(`[NoHost] Ensured folder ${folderPath}`);
          resolve();
        }
      });
    });
  }

  getGroupPath(chatId, groupId, artifacts) {
    const group = artifacts.find(a => a.id === groupId);
    if (!group) return `/chat-${chatId}`;
    
    // Build path recursively for nested groups
    let path = `/chat-${chatId}`;
    const groupHierarchy = this.getGroupHierarchy(groupId, artifacts);
    
    for (const hierarchyGroup of groupHierarchy) {
      const folderName = this.sanitizeFolderName(hierarchyGroup.title);
      path += `/${folderName}`;
    }
    
    return path;
  }

  getGroupHierarchy(groupId, artifacts) {
    const hierarchy = [];
    let currentGroup = artifacts.find(a => a.id === groupId);
    
    while (currentGroup && currentGroup.type === 'group') {
      hierarchy.unshift(currentGroup);
      currentGroup = currentGroup.parentId ? 
        artifacts.find(a => a.id === currentGroup.parentId) : null;
    }
    
    return hierarchy;
  }

  getArtifactFilePath(chatId, artifact, artifacts) {
    if (!artifact.parentId) {
      // Root level artifact
      const fileName = this.getArtifactFileName(artifact);
      return `/chat-${chatId}/${fileName}`;
    }
    
    // Artifact in a group - get the group path
    const groupPath = this.getGroupPath(chatId, artifact.parentId, artifacts);
    const fileName = this.getArtifactFileName(artifact);
    return `${groupPath}/${fileName}`;
  }

  sanitizeFolderName(name) {
    return name.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      || 'untitled';
  }

  async syncChatArtifacts(chatId) {
    await this.init();
    await this.ensureChatFolder(chatId);

    // Get all artifacts for this chat
    const chatArtifacts = window.context?.getCurrentChatArtifacts() || [];
    console.log(`[NoHost] Syncing ${chatArtifacts.length} artifacts for chat ${chatId}`);

    // Create folder structure for groups
    await this.createGroupFolders(chatId, chatArtifacts);

    // Write all artifacts to the appropriate folders
    const writePromises = chatArtifacts.map(async (artifact) => {
      const currentVersionIdx = window.context?.getActiveVersionIndex(artifact.id) ?? artifact.versions.length - 1;
      const currentVersion = artifact.versions[currentVersionIdx];
      
      if (!currentVersion) return;

      // Skip group artifacts - they are folders, not files
      if (artifact.type === 'group') return;

      const fileName = this.getArtifactFileName(artifact);
      const filePath = this.getArtifactFilePath(chatId, artifact, chatArtifacts);
      
      // Most artifacts: write content as-is
      let contentToWrite = currentVersion.content;
      
      // Special handling for external images only
      if (artifact.type === 'image' && currentVersion.content.startsWith('[[image:')) {
        const imageMatch = currentVersion.content.match(/\[\[image:(.*?)\]\]/);
        if (imageMatch && imageMatch[1]) {
          const imageUrl = imageMatch[1].trim();
          contentToWrite = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${artifact.title}</title>
    <style>
        body { margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f5f5f5; }
        img { max-width: 100%; max-height: 100vh; object-fit: contain; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    </style>
</head>
<body>
    <img src="${imageUrl}" alt="${artifact.title}" />
</body>
</html>`;
        }
      }
      
      return new Promise((resolve, reject) => {
        this.fs.writeFile(filePath, contentToWrite, (err) => {
          if (err) {
            console.error(`[NoHost] Failed to write ${filePath}:`, err);
            reject(err);
          } else {
            console.log(`[NoHost] Wrote ${artifact.type} artifact to ${filePath}`);
            resolve();
          }
        });
      });
    });

    try {
      await Promise.all(writePromises);
      console.log(`[NoHost] Successfully synced all artifacts for chat ${chatId}`);
    } catch (error) {
      console.error('[NoHost] Error syncing chat artifacts:', error);
      throw error;
    }
  }

  getArtifactFileName(artifact) {
    // For file artifacts: use the original filename if available
    if (artifact.type === 'files') {
      try {
        const fileData = JSON.parse(artifact.versions[artifact.versions.length - 1].content);
        if (fileData.name) {
          return fileData.name; // Use original filename as-is
        }
      } catch {}
    }

    // For other artifacts: clean title + detect extension from content or type
    const cleanTitle = artifact.title.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      || 'artifact';

    // Get extension by checking content first, then type
    const extension = this.getExtensionFromContent(artifact) || this.getExtensionFromType(artifact.type);
    
    // Special case: first HTML artifact becomes index.html
    if (artifact.type === 'html' && (cleanTitle === 'artifact' || cleanTitle === 'artifact-1')) {
      return 'index.html';
    }
    
    return cleanTitle + extension;
  }

  getExtensionFromContent(artifact) {
    const content = artifact.versions[artifact.versions.length - 1].content.trim();
    
    // Detect by content patterns
    if (content.startsWith('<svg')) return '.svg';
    if (/^<!DOCTYPE html>|<html[\s>]/i.test(content)) return '.html';
    if (/^\s*[.#]?[\w-]+\s*\{/.test(content) || /^\s*@(import|media|keyframes)/.test(content)) return '.css';
    if (/^\s*(function|const|let|var|class|import|export)/.test(content) || content.includes('=>')) return '.js';
    if ((content.startsWith('{') || content.startsWith('[')) && this.isValidJSON(content)) return '.json';
    if (/^---\s*$|^[a-zA-Z_][a-zA-Z0-9_]*:\s*.+$/m.test(content)) return '.yaml';
    if (content.startsWith('#') || content.includes('##') || content.includes('**')) return '.md';
    
    return null; // No match, use type-based extension
  }

  getExtensionFromType(type) {
    const typeMap = {
      'html': '.html',
      'css': '.css',
      'javascript': '.js', 
      'js': '.js',
      'json': '.json',
      'yaml': '.yaml',
      'markdown': '.md',
      'image': '.html', // External images wrapped in HTML
      'text': '.txt',
      'link': '.url'
    };
    return typeMap[type] || '.txt';
  }

  isValidJSON(str) {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }

  async getHtmlArtifactUrl(artifact, chatId) {
    try {
      // Sync all artifacts in the chat first
      await this.syncChatArtifacts(chatId);
      
      // Return URL to the specific HTML artifact
      const fileName = this.getArtifactFileName(artifact);
      const url = `/fs/chat-${chatId}/${fileName}`;
      
      console.log(`[NoHost] HTML artifact URL: ${url}`);
      return url;
    } catch (error) {
      console.error('[NoHost] Failed to create HTML artifact URL:', error);
      return null;
    }
  }

  isAvailable() {
    return 'serviceWorker' in navigator && window.Filer;
  }
}

// Global instance
window.noHostManager = new NoHostManager();