// =================== Text Artifact Renderer with Monaco Editor ===================

// Global Monaco editor instances map to track and dispose editors
window.monacoEditors = window.monacoEditors || new Map();

// Inject Monaco Editor CSS styles
function injectMonacoStyles() {
  // Check if styles are already injected
  if (document.getElementById('monaco-custom-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'monaco-custom-styles';
  style.textContent = `
    /* Monaco Editor Styles */
    .monaco-editor-container {
        position: relative;
        overflow: hidden;
        border-radius: 0;
    }

    .monaco-editor-container .monaco-editor {
        border-radius: 0;
    }

    .monaco-editor-container .monaco-editor .view-lines {
        font-feature-settings: "liga" 1, "calt" 1;
    }

    /* Ensure Monaco respects our theme colors */
    .monaco-editor-container .monaco-editor .margin {
        background-color: var(--color-primary-background) !important;
    }

    .monaco-editor-container .monaco-editor .monaco-editor-background {
        background-color: var(--color-primary-background) !important;
    }

    /* Monaco scrollbar integration */
    .monaco-editor-container .monaco-scrollable-element > .scrollbar {
        background: transparent !important;
    }

    .monaco-editor-container .monaco-scrollable-element > .scrollbar > .slider {
        background: var(--color-tertiary-background) !important;
    }
  `;
  document.head.appendChild(style);
}

// Language detection based on content patterns and file extensions
function detectLanguage(content, title = '') {
  // Extract file extension from title
  const extension = title.toLowerCase().split('.').pop();
  
  // Map extensions to Monaco languages
  const extensionMap = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'py': 'python',
    'rb': 'ruby',
    'php': 'php',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'cc': 'cpp',
    'cxx': 'cpp',
    'cs': 'csharp',
    'go': 'go',
    'rs': 'rust',
    'kt': 'kotlin',
    'swift': 'swift',
    'dart': 'dart',
    'scala': 'scala',
    'clj': 'clojure',
    'hs': 'haskell',
    'elm': 'elm',
    'ml': 'fsharp',
    'fs': 'fsharp',
    'r': 'r',
    'sh': 'shell',
    'bash': 'shell',
    'zsh': 'shell',
    'fish': 'shell',
    'ps1': 'powershell',
    'psm1': 'powershell',
    'html': 'html',
    'htm': 'html',
    'xml': 'xml',
    'css': 'css',
    'scss': 'scss',
    'sass': 'sass',
    'less': 'less',
    'json': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'toml': 'toml',
    'ini': 'ini',
    'cfg': 'ini',
    'conf': 'ini',
    'sql': 'sql',
    'md': 'markdown',
    'markdown': 'markdown',
    'tex': 'latex',
    'dockerfile': 'dockerfile',
    'makefile': 'makefile',
    'gradle': 'groovy',
    'groovy': 'groovy',
    'lua': 'lua',
    'perl': 'perl',
    'pl': 'perl',
    'vim': 'vim',
    'bat': 'bat',
    'cmd': 'bat'
  };

  if (extension && extensionMap[extension]) {
    return extensionMap[extension];
  }

  // Content-based detection for common patterns
  const contentLower = content.toLowerCase().slice(0, 1000); // First 1000 chars for performance

  // JavaScript/TypeScript patterns
  if (contentLower.includes('function') || contentLower.includes('const ') || 
      contentLower.includes('let ') || contentLower.includes('var ') ||
      contentLower.includes('import ') || contentLower.includes('export ') ||
      contentLower.includes('console.log')) {
    if (contentLower.includes('interface ') || contentLower.includes('type ') ||
        contentLower.includes(': string') || contentLower.includes(': number')) {
      return 'typescript';
    }
    return 'javascript';
  }

  // Python patterns
  if (contentLower.includes('def ') || contentLower.includes('import ') ||
      contentLower.includes('from ') || contentLower.includes('print(') ||
      contentLower.includes('if __name__')) {
    return 'python';
  }

  // HTML patterns
  if (contentLower.includes('<html') || contentLower.includes('<!doctype') ||
      contentLower.includes('<div') || contentLower.includes('<body')) {
    return 'html';
  }

  // CSS patterns
  if (contentLower.includes('{') && (contentLower.includes('color:') ||
      contentLower.includes('font-') || contentLower.includes('margin:') ||
      contentLower.includes('padding:'))) {
    return 'css';
  }

  // JSON patterns
  if ((contentLower.startsWith('{') || contentLower.startsWith('[')) &&
      (contentLower.includes('"') || contentLower.includes("'"))) {
    try {
      JSON.parse(content);
      return 'json';
    } catch (e) {
      // Not valid JSON
    }
  }

  // SQL patterns
  if (contentLower.includes('select ') || contentLower.includes('insert ') ||
      contentLower.includes('update ') || contentLower.includes('delete ') ||
      contentLower.includes('create table')) {
    return 'sql';
  }

  // Shell script patterns
  if (contentLower.includes('#!/bin/') || contentLower.includes('echo ') ||
      contentLower.includes('if [ ') || contentLower.includes('then')) {
    return 'shell';
  }

  // Default to plaintext
  return 'plaintext';
}

// Get current theme for Monaco
function getMonacoTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  return currentTheme === 'dark' ? 'vs-dark' : 'vs';
}

// Ensure Monaco is properly loaded before creating editor
function ensureMonacoLoaded() {
  return new Promise((resolve, reject) => {
    // Check if Monaco is already loaded
    if (typeof monaco !== 'undefined' && monaco.editor) {
      resolve();
      return;
    }
    
    // Ensure RequireJS is available
    if (typeof require === 'undefined') {
      reject(new Error('Monaco loader (RequireJS) not available'));
      return;
    }

    // Configure RequireJS for Monaco
    require.config({ 
      paths: { 
        'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' 
      }
    });

    // Load Monaco editor
    require(['vs/editor/editor.main'], function() {
      if (typeof monaco !== 'undefined' && monaco.editor) {
        resolve();
      } else {
        reject(new Error('Monaco editor failed to load properly'));
      }
    }, function(err) {
      reject(new Error('Failed to load Monaco editor: ' + err));
    });
  });
}

// Create Monaco editor instance
async function createMonacoEditor(container, content, language, isReadOnly = true) {
  // Inject Monaco styles first
  injectMonacoStyles();
  
  try {
    // Ensure Monaco is loaded before proceeding
    await ensureMonacoLoaded();
    
    // Clear any loading content
    container.innerHTML = '';
    
    const editor = monaco.editor.create(container, {
      value: content,
      language: language,
      theme: getMonacoTheme(),
      readOnly: isReadOnly,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 14,
      lineHeight: 22,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      wordWrap: 'on',
      automaticLayout: true,
      contextmenu: true,
      selectOnLineNumbers: true,
      lineNumbers: 'on',
      glyphMargin: false,
      folding: true,
      lineDecorationsWidth: 0,
      lineNumbersMinChars: 3,
      renderWhitespace: 'selection',
      cursorBlinking: 'solid',
      cursorSmoothCaretAnimation: "on",
      smoothScrolling: true,
      mouseWheelZoom: true,
      padding: { top: 16, bottom: 16 }
    });

    // Store editor instance for cleanup
    const editorId = `editor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    window.monacoEditors.set(editorId, editor);
    container.setAttribute('data-editor-id', editorId);

    // Theme change listener
    const observer = new MutationObserver(() => {
      editor.updateOptions({ theme: getMonacoTheme() });
    });
    observer.observe(document.documentElement, { 
      attributes: true, 
      attributeFilter: ['data-theme'] 
    });

    // Store observer for cleanup
    container._themeObserver = observer;

    return editor;
  } catch (error) {
    throw new Error(`Failed to create Monaco editor: ${error.message}`);
  }
}

// Cleanup function for Monaco editors
function cleanupMonacoEditor(container) {
  const editorId = container.getAttribute('data-editor-id');
  if (editorId && window.monacoEditors.has(editorId)) {
    const editor = window.monacoEditors.get(editorId);
    editor.dispose();
    window.monacoEditors.delete(editorId);
  }

  if (container._themeObserver) {
    container._themeObserver.disconnect();
    delete container._themeObserver;
  }
}

// Wait for element to be properly rendered in DOM
function waitForElement(containerId, maxAttempts = 20, interval = 100) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    
    const checkElement = () => {
      attempts++;
      const element = document.getElementById(containerId);
      
      if (element && element.offsetParent !== null) {
        // Element exists and is visible
        resolve(element);
      } else if (attempts >= maxAttempts) {
        reject(new Error(`Element ${containerId} not found after ${maxAttempts} attempts`));
      } else {
        setTimeout(checkElement, interval);
      }
    };
    
    checkElement();
  });
}

// Initialize Monaco with proper DOM ready detection
async function initializeMonacoForContainer(containerId, content, language) {
  try {
    // Wait for container to be properly rendered
    const container = await waitForElement(containerId);
    
    // Cleanup any existing editor
    cleanupMonacoEditor(container);
    
    // Add loading indicator
    container.innerHTML = `
      <div class="column align-center justify-center padding-xl foreground-tertiary" style="height: 100%;">
        <div>Loading Monaco Editor...</div>
      </div>
    `;
    
    // Create new Monaco editor
    await createMonacoEditor(container, content, language);
    
  } catch (error) {
    console.error('Failed to initialize Monaco editor:', error);
    
    // Fallback to simple text display
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = `
        <div class="padding-m" style="line-height: 1.6; white-space: pre-wrap; font-family: monospace; overflow: auto; height: 100%;">
          ${window.utils.escapeHtml(content)}
        </div>
      `;
    }
  }
}

// Main render function
function renderTextArtifact(artifact, currentVersionIdx, versionIndicator) {
  const currentVersion = artifact.versions[currentVersionIdx];
  const content = currentVersion.content;
  
  // Detect the programming language
  const language = detectLanguage(content, artifact.title);
  
  // Generate unique container ID
  const containerId = `monaco-container-${artifact.id}-${currentVersionIdx}-${Date.now()}`;
  
  // Create container with minimal styling - just the editor
  const containerHtml = `
    <div id="${containerId}" 
         class="monaco-editor-container background-primary" 
         style="width: 100%; height: 100vh; position: absolute; top: 0; left: 0;">
      <div class="column align-center justify-center padding-xl foreground-tertiary" style="height: 100%;">
        <div>Preparing Monaco Editor...</div>
      </div>
    </div>
  `;

  // Initialize Monaco asynchronously after DOM is ready
  // Use requestAnimationFrame for better timing with view transitions
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      initializeMonacoForContainer(containerId, content, language);
    });
  });

  return containerHtml;
}

// Cleanup function to be called when artifacts are destroyed
function cleanupTextArtifactEditors() {
  window.monacoEditors.forEach((editor, id) => {
    editor.dispose();
  });
  window.monacoEditors.clear();
}

// Export for use by main view-artifact/view-artifact.js
window.textArtifactRenderer = {
  renderTextArtifact,
  cleanupTextArtifactEditors,
  detectLanguage,
  createMonacoEditor,
  ensureMonacoLoaded,
  initializeMonacoForContainer
};