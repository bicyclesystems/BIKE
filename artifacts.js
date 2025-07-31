// =================== Artifact Creation & Management ===================
// Core CRUD and initialization only. Upload, parser, and matching logic moved to separate files.

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

// =================== Core Artifact Functions ===================

function createArtifactBase(content, messageId, type = null, shouldSetActive = true) {
  const activeChatId = window.context?.getActiveChatId();
  if (activeChatId === null || activeChatId === undefined) {
    return null;
  }
  
  const artifactsInChat = window.context?.getCurrentChatArtifacts() || [];
  const id = shouldSetActive ? Date.now().toString() : 
             Date.now().toString() + Math.random().toString(36).substr(2, 9); // Ensure uniqueness for silent
  const title = `Artifact ${artifactsInChat.length + 1}`;
  
  if (!type) {
    const trimmedContent = content.trim();
    if (/^<!DOCTYPE html>|<html[\s>]/i.test(trimmedContent)) type = 'html';
    else if (content.startsWith('[[image:')) type = 'image';
    else if (content.startsWith('```')) type = 'markdown';
    else if (isValidUrl(trimmedContent)) type = 'link';
    else if (trimmedContent.startsWith('{') && isFileData(trimmedContent)) type = 'files';
    else type = 'text';
  }
  
  const artifact = {
    id,
    title,
    type,
    versions: [{ content, timestamp: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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

// Create artifact without auto-opening it (used for file uploads)
function createArtifactSilent(content, messageId, type = null) {
  return createArtifactBase(content, messageId, type, false);
}

function updateArtifact(id, content) {
  const artifacts = (window.context?.getArtifacts() || []).slice();
  const activeChatId = window.context?.getActiveChatId();
  const artifact = artifacts.find(a => a.id === id && a.chatId === activeChatId);
  if (!artifact) return null;
  artifact.versions.push({ content, timestamp: new Date().toISOString() });
  artifact.updatedAt = new Date().toISOString();
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
        deleteArtifactVersion(artifactId, versionIdx);
      }
      return;
    }
    
    // Handle version item clicks
    if (e.target.classList && e.target.classList.contains('artifact-version-item')) {
      const artifactId = e.target.getAttribute('data-artifact-id');
      const idx = parseInt(e.target.getAttribute('data-version-idx'));
      setArtifactVersion(artifactId, idx);
      return;
    }
    
    // Handle clicks on version-info (child of version-item)
    if (e.target.closest && e.target.closest('.artifact-version-item')) {
      const versionItem = e.target.closest('.artifact-version-item');
      const artifactId = versionItem.getAttribute('data-artifact-id');
      const idx = parseInt(versionItem.getAttribute('data-version-idx'));
      setArtifactVersion(artifactId, idx);
      return;
    }
  });
}

// =================== Artifacts Initialization ===================

function init() {
  // Setup artifact-specific click handlers
  setupArtifactClickHandlers();
  
  // Load artifacts data
  if (window.memory?.loadArtifacts) {
    window.memory.loadArtifacts();
  }
}

// =================== Version Management ===================

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
  
  // Re-render if this artifact is currently active
  const activeView = window.context?.getActiveView();
  if (activeView && activeView.type === 'artifact' && activeView.data.artifactId === artifactId) {
    if (window.views?.renderCurrentView) {
      window.views.renderCurrentView();
    }
  }
  
  return true;
}

function deleteArtifactVersion(artifactId, versionIdx) {
  const artifacts = (window.context?.getArtifacts() || []).slice();
  const activeChatId = window.context?.getActiveChatId();
  const artifact = artifacts.find(a => a.id === artifactId && a.chatId === activeChatId);
  
  if (!artifact || artifact.versions.length <= 1 || versionIdx < 0 || versionIdx >= artifact.versions.length) {
    return false; // Can't delete the only version or invalid index
  }
  
  // Remove the version
  artifact.versions.splice(versionIdx, 1);
  artifact.updatedAt = new Date().toISOString();
  
  // Adjust active version index if necessary
  const currentActiveIdx = window.context?.getActiveVersionIndex(artifactId) ?? artifact.versions.length;
  let newActiveIdx = currentActiveIdx;
  
  if (currentActiveIdx >= versionIdx) {
    newActiveIdx = Math.max(0, currentActiveIdx - 1);
  }
  
  window.context?.setContext({ artifacts: artifacts });
  window.context?.setActiveVersionIndex(artifactId, newActiveIdx);
  
  window.memory?.saveArtifacts();
  
  // Re-render if this artifact is currently active
  const activeView = window.context?.getActiveView();
  if (activeView && activeView.type === 'artifact' && activeView.data.artifactId === artifactId) {
    if (window.views?.renderCurrentView) {
      window.views.renderCurrentView();
    }
  }
  
  return true;
}

// =================== Artifact Utils ===================

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

// Note: Module exports moved to end of file after fileUploadManager declaration

// =================== Artifact Content Resolution ===================

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

// =================== Artifact Organization & Matching ===================
// Smart artifact management functions

function findBestMatchingArtifact(title, type, content) {
  const currentChatArtifacts = window.context?.getCurrentChatArtifacts() || [];
  
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
  
  // Try fuzzy title matching for refinements (e.g., "Todo App" -> "Enhanced Todo App")
  match = currentChatArtifacts.find(a => {
    if (a.type !== type) return false;
    const aTitle = a.title.toLowerCase();
    const newTitle = title.toLowerCase();
    
    // Check if one title contains the other (common in refinements)
    const similarity = calculateSimilarity(aTitle, newTitle);
    const contains = aTitle.includes(newTitle) || newTitle.includes(aTitle);
    
    if (contains || similarity > 0.7) {
      return true;
    }
    return false;
  });
  if (match) return match;
  
  // For HTML apps and similar content, check content similarity
  if (type === 'html' || type === 'markdown' || type === 'code') {
    match = currentChatArtifacts.find(a => {
      if (a.type !== type) return false;
      const latestVersion = a.versions[a.versions.length - 1];
      const similarity = calculateContentSimilarity(latestVersion.content, content);
      
      if (similarity > 0.6) {
        return true;
      }
      return false;
    });
    if (match) return match;
  }
  
  return null;
}

function shouldUpdateArtifact(existingArtifact, newContent) {
  const latestVersion = existingArtifact.versions[existingArtifact.versions.length - 1];
  
  // Always update if content is different
  if (latestVersion.content.trim() === newContent.trim()) {
    return false; // Identical content, no need to update
  }
  
  // Check if this is a meaningful update vs just a small variation
  const contentSimilarity = calculateContentSimilarity(latestVersion.content, newContent);
  
  // More intelligent versioning thresholds:
  // - Very similar (>85%): Likely a minor refinement, create new version
  // - Moderately similar (30-85%): Likely an enhancement/update, create new version  
  // - Very different (<30%): Might be a completely different artifact, but still version if titles match
  
  const shouldUpdate = contentSimilarity > 0.25; // Lowered threshold for more generous versioning
  
  return shouldUpdate;
}

function isRefinedTitle(newTitle, oldTitle) {
  const newLower = newTitle.toLowerCase();
  const oldLower = oldTitle.toLowerCase();
  
  // Check if new title is more descriptive/refined
  return newTitle.length > oldTitle.length && 
         (newLower.includes(oldLower) || calculateSimilarity(newLower, oldLower) > 0.7);
}

function calculateSimilarity(str1, str2) {
  // Simple similarity calculation using longest common subsequence approach
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function calculateContentSimilarity(content1, content2) {
  // For HTML content, compare structure
  if (content1.includes('<html') && content2.includes('<html')) {
    // Compare key HTML elements and structure
    const elements1 = extractHtmlElements(content1);
    const elements2 = extractHtmlElements(content2);
    
    const commonElements = elements1.filter(el => elements2.includes(el));
    const totalElements = new Set([...elements1, ...elements2]).size;
    
    return totalElements > 0 ? commonElements.length / totalElements : 0;
  }
  
  // For text content, use text similarity
  return calculateSimilarity(content1.substring(0, 500), content2.substring(0, 500));
}

function extractHtmlElements(html) {
  // Extract unique HTML tags and classes for comparison
  const tagMatches = html.match(/<(\w+)(?:\s[^>]*)?>/g) || [];
  const classMatches = html.match(/class\s*=\s*["']([^"']+)["']/g) || [];
  
  const tags = tagMatches.map(tag => tag.match(/<(\w+)/)[1]);
  const classes = classMatches.map(cls => cls.match(/class\s*=\s*["']([^"']+)["']/)[1]);
  
  return [...new Set([...tags, ...classes])];
}

function levenshteinDistance(str1, str2) {
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
}

// =================== File Content Parser ===================
// Advanced file content extraction without AI
class FileContentParser {
  constructor() {
    this.supportedTypes = [
      'text/plain', 'text/csv', 'application/json', 'text/markdown',
      'text/javascript', 'text/css', 'text/html', 'text/xml',
      'application/xml', 'text/yaml', 'application/x-yaml'
    ];
  }

  async parseFile(file) {
    const result = {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
      extractedData: {},
      metadata: {},
      structure: {},
      searchableContent: ''
    };

    // Basic file info
    result.metadata.extension = this.getFileExtension(file.name);
    result.metadata.category = this.categorizeFile(file);

    try {
      if (file.type.startsWith('image/')) {
        result.extractedData = await this.parseImageFile(file);
      } else if (file.type === 'application/pdf' || this.getFileExtension(file.name) === 'pdf') {
        result.extractedData = await this.parsePDFFile(file);
        result.searchableContent = result.extractedData.textContent || '';
      } else if (this.isTextBasedFile(file)) {
        const textContent = await this.readFileAsText(file);
        result.extractedData = await this.parseTextContent(textContent, file);
        result.searchableContent = textContent;
      } else {
        result.extractedData = await this.parseBinaryFile(file);
      }

      // Extract structure information
      result.structure = this.analyzeFileStructure(result.extractedData, file);

    } catch (error) {
      result.extractedData.error = error.message;
      result.metadata.parseError = true;
    }

    return result;
  }

  async parseTextContent(content, file) {
    const ext = this.getFileExtension(file.name);
    const result = {
      rawContent: content,
      type: 'text',
      encoding: 'utf-8'
    };

    switch (ext) {
      case 'json':
        return this.parseJSON(content);
      case 'csv':
        return this.parseCSV(content);
      case 'md':
      case 'markdown':
        return this.parseMarkdown(content);
      case 'html':
      case 'htm':
        return this.parseHTML(content);
      case 'xml':
        return this.parseXML(content);
      case 'js':
      case 'ts':
      case 'jsx':
      case 'tsx':
        return this.parseJavaScript(content);
      case 'css':
      case 'scss':
      case 'sass':
        return this.parseCSS(content);
      case 'py':
        return this.parsePython(content);
      case 'yml':
      case 'yaml':
        return this.parseYAML(content);
      default:
        return this.parseGenericText(content);
    }
  }

  parseJSON(content) {
    try {
      const parsed = JSON.parse(content);
      return {
        type: 'json',
        parsed: parsed,
        rawContent: content,
        structure: this.analyzeJSONStructure(parsed),
        keys: this.extractJSONKeys(parsed),
        values: this.extractJSONValues(parsed)
      };
    } catch (error) {
      return {
        type: 'json',
        rawContent: content,
        parseError: error.message,
        structure: { valid: false }
      };
    }
  }

  parseCSV(content) {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) return { type: 'csv', rows: [], headers: [] };

    const headers = this.parseCSVLine(lines[0]);
    const rows = lines.slice(1).map(line => this.parseCSVLine(line));

    return {
      type: 'csv',
      headers: headers,
      rows: rows,
      rowCount: rows.length,
      columnCount: headers.length,
      summary: this.analyzeCSVData(headers, rows),
      rawContent: content
    };
  }

  parseMarkdown(content) {
    return {
      type: 'markdown',
      rawContent: content,
      structure: {
        headings: this.extractMarkdownHeadings(content),
        links: this.extractMarkdownLinks(content),
        codeBlocks: this.extractMarkdownCodeBlocks(content),
        images: this.extractMarkdownImages(content)
      },
      wordCount: content.split(/\s+/).length,
      characterCount: content.length
    };
  }

  parseHTML(content) {
    // Create a temporary DOM parser
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    
    return {
      type: 'html',
      rawContent: content,
      structure: {
        title: doc.title || '',
        headings: this.extractHTMLHeadings(doc),
        links: this.extractHTMLLinks(doc),
        scripts: this.extractHTMLScripts(doc),
        styles: this.extractHTMLStyles(doc),
        forms: this.extractHTMLForms(doc)
      },
      textContent: doc.body ? doc.body.textContent : ''
    };
  }

  parseXML(content) {
    // Create a temporary DOM parser for XML
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/xml');
    
    // Check for parsing errors
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      return {
        type: 'xml',
        rawContent: content,
        parseError: parserError.textContent,
        structure: { valid: false }
      };
    }
    
    return {
      type: 'xml',
      rawContent: content,
      structure: {
        rootElement: doc.documentElement ? doc.documentElement.tagName : null,
        elements: this.extractXMLElements(doc),
        attributes: this.extractXMLAttributes(doc),
        namespaces: this.extractXMLNamespaces(doc)
      },
      textContent: doc.textContent || ''
    };
  }

  parseJavaScript(content) {
    return {
      type: 'javascript',
      rawContent: content,
      structure: {
        functions: this.extractJSFunctions(content),
        classes: this.extractJSClasses(content),
        imports: this.extractJSImports(content),
        exports: this.extractJSExports(content),
        variables: this.extractJSVariables(content)
      },
      lineCount: content.split('\n').length,
      characterCount: content.length
    };
  }

  parseCSS(content) {
    return {
      type: 'css',
      rawContent: content,
      structure: {
        selectors: this.extractCSSSelectors(content),
        properties: this.extractCSSProperties(content),
        mediaQueries: this.extractCSSMediaQueries(content)
      },
      lineCount: content.split('\n').length
    };
  }

  parsePython(content) {
    return {
      type: 'python',
      rawContent: content,
      structure: {
        functions: this.extractPythonFunctions(content),
        classes: this.extractPythonClasses(content),
        imports: this.extractPythonImports(content)
      },
      lineCount: content.split('\n').length
    };
  }

  parseYAML(content) {
    // Basic YAML parsing (you might want to add a proper YAML parser library)
    return {
      type: 'yaml',
      rawContent: content,
      structure: this.analyzeYAMLStructure(content),
      lineCount: content.split('\n').length
    };
  }

  parseGenericText(content) {
    return {
      type: 'text',
      rawContent: content,
      structure: {
        lineCount: content.split('\n').length,
        wordCount: content.split(/\s+/).length,
        characterCount: content.length,
        paragraphs: content.split('\n\n').filter(p => p.trim()).length
      }
    };
  }

  async parseImageFile(file) {
    const dataUrl = await this.readFileAsDataURL(file);
    return {
      type: 'image',
      dataUrl: dataUrl,
      width: null, // Could be extracted with image loading
      height: null,
      format: file.type.split('/')[1]
    };
  }

  async parsePDFFile(file) {
    try {
      // For now, we'll use a browser-based PDF parsing approach
      // This requires the PDF.js library to be available
      if (typeof pdfjsLib !== 'undefined') {
        return await this.parsePDFWithPDFJS(file);
      } else {
        // Fallback: Try to extract basic info and provide guidance
        return {
          type: 'pdf',
          name: file.name,
          size: file.size,
          mimeType: file.type,
          pages: null,
          textContent: '',
          metadata: {
            requiresLibrary: true,
            libraryName: 'PDF.js',
            parseError: 'PDF.js library not available for text extraction'
          },
          structure: {
            canExtractText: false,
            needsExternalTool: true
          }
        };
      }
    } catch (error) {
      return {
        type: 'pdf',
        name: file.name,
        size: file.size,
        mimeType: file.type,
        parseError: error.message,
        textContent: '',
        structure: {
          canExtractText: false,
          error: true
        }
      };
    }
  }

  async parsePDFWithPDFJS(file) {
    try {
      // Convert file to ArrayBuffer
      const arrayBuffer = await this.readFileAsArrayBuffer(file);
      
      // Load PDF document
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      // Extract text from all pages
      let fullText = '';
      const pages = [];
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // Combine text items
        const pageText = textContent.items.map(item => item.str).join(' ');
        pages.push({
          pageNumber: i,
          text: pageText,
          wordCount: pageText.split(/\s+/).filter(word => word.length > 0).length
        });
        
        fullText += pageText + '\n\n';
      }
      
      // Extract basic structure information
      const structure = this.analyzePDFStructure(fullText, pages);
      
      return {
        type: 'pdf',
        name: file.name,
        size: file.size,
        mimeType: file.type,
        pages: pages,
        pageCount: pdf.numPages,
        textContent: fullText.trim(),
        structure: structure,
        metadata: {
          extractedSuccessfully: true,
          totalWords: fullText.split(/\s+/).filter(word => word.length > 0).length,
          averageWordsPerPage: Math.round(fullText.split(/\s+/).filter(word => word.length > 0).length / pdf.numPages)
        }
      };
    } catch (error) {
      throw new Error(`PDF parsing failed: ${error.message}`);
    }
  }

  analyzePDFStructure(fullText, pages) {
    const structure = {
      totalWords: fullText.split(/\s+/).filter(word => word.length > 0).length,
      totalCharacters: fullText.length,
      pageCount: pages.length,
      averageWordsPerPage: 0,
      hasStructuredContent: false,
      possibleSections: [],
      keyTerms: []
    };
    
    if (pages.length > 0) {
      structure.averageWordsPerPage = Math.round(structure.totalWords / pages.length);
    }
    
    // Look for potential section headers (lines that start with numbers, capitals, etc.)
    const lines = fullText.split('\n').filter(line => line.trim().length > 0);
    const potentialHeaders = lines.filter(line => {
      const trimmed = line.trim();
      return /^(Chapter|Section|\d+\.|\d+\s|[A-Z][A-Z\s]{3,})/i.test(trimmed) && trimmed.length < 100;
    });
    
    structure.possibleSections = potentialHeaders.slice(0, 20); // Limit to first 20
    structure.hasStructuredContent = potentialHeaders.length > 0;
    
    // Extract potential key terms (words that appear frequently and are capitalized)
    const words = fullText.match(/\b[A-Z][a-z]+\b/g) || [];
    const wordCount = {};
    words.forEach(word => {
      if (word.length > 3) { // Only consider words longer than 3 characters
        wordCount[word] = (wordCount[word] || 0) + 1;
      }
    });
    
    // Get top 15 most frequent capitalized words
    structure.keyTerms = Object.entries(wordCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 15)
      .map(([word, count]) => ({ word, count }));
    
    return structure;
  }

  async parseBinaryFile(file) {
    return {
      type: 'binary',
      name: file.name,
      size: file.size,
      mimeType: file.type,
      cannotParse: true
    };
  }

  // Helper methods for structure analysis
  analyzeJSONStructure(obj, path = '') {
    const structure = { type: typeof obj, path };
    
    if (Array.isArray(obj)) {
      structure.type = 'array';
      structure.length = obj.length;
      if (obj.length > 0) {
        structure.itemType = typeof obj[0];
      }
    } else if (obj && typeof obj === 'object') {
      structure.type = 'object';
      structure.keys = Object.keys(obj);
      structure.nested = {};
      for (const key of Object.keys(obj)) {
        structure.nested[key] = this.analyzeJSONStructure(obj[key], `${path}.${key}`);
      }
    }
    
    return structure;
  }

  extractJSONKeys(obj, keys = new Set()) {
    if (Array.isArray(obj)) {
      obj.forEach(item => this.extractJSONKeys(item, keys));
    } else if (obj && typeof obj === 'object') {
      Object.keys(obj).forEach(key => {
        keys.add(key);
        this.extractJSONKeys(obj[key], keys);
      });
    }
    return Array.from(keys);
  }

  extractJSONValues(obj, values = new Set()) {
    if (Array.isArray(obj)) {
      obj.forEach(item => this.extractJSONValues(item, values));
    } else if (obj && typeof obj === 'object') {
      Object.values(obj).forEach(value => this.extractJSONValues(value, values));
    } else if (obj !== null && obj !== undefined) {
      values.add(String(obj));
    }
    return Array.from(values).slice(0, 100); // Limit to prevent memory issues
  }

  parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  analyzeCSVData(headers, rows) {
    const summary = {
      totalRows: rows.length,
      totalColumns: headers.length,
      columnTypes: {}
    };

    headers.forEach((header, index) => {
      const values = rows.map(row => row[index]).filter(val => val && val.trim());
      const sampleValues = values.slice(0, 10);
      
      summary.columnTypes[header] = {
        sampleValues: sampleValues,
        uniqueCount: new Set(values).size,
        nullCount: rows.length - values.length
      };
    });

    return summary;
  }

  extractMarkdownHeadings(content) {
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    const headings = [];
    let match;
    
    while ((match = headingRegex.exec(content)) !== null) {
      headings.push({
        level: match[1].length,
        text: match[2].trim()
      });
    }
    
    return headings;
  }

  extractMarkdownLinks(content) {
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const links = [];
    let match;
    
    while ((match = linkRegex.exec(content)) !== null) {
      links.push({
        text: match[1],
        url: match[2]
      });
    }
    
    return links;
  }

  extractMarkdownCodeBlocks(content) {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)\n```/g;
    const codeBlocks = [];
    let match;
    
    while ((match = codeBlockRegex.exec(content)) !== null) {
      codeBlocks.push({
        language: match[1] || 'text',
        code: match[2]
      });
    }
    
    return codeBlocks;
  }

  extractMarkdownImages(content) {
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const images = [];
    let match;
    
    while ((match = imageRegex.exec(content)) !== null) {
      images.push({
        alt: match[1],
        src: match[2]
      });
    }
    
    return images;
  }

  extractHTMLHeadings(doc) {
    const headings = [];
    for (let i = 1; i <= 6; i++) {
      const elements = doc.querySelectorAll(`h${i}`);
      elements.forEach(el => {
        headings.push({
          level: i,
          text: el.textContent.trim()
        });
      });
    }
    return headings;
  }

  extractHTMLLinks(doc) {
    const links = Array.from(doc.querySelectorAll('a[href]')).map(link => ({
      text: link.textContent.trim(),
      href: link.href
    }));
    return links;
  }

  extractHTMLScripts(doc) {
    return Array.from(doc.querySelectorAll('script')).map(script => ({
      src: script.src || null,
      inline: !script.src,
      content: script.src ? null : script.textContent
    }));
  }

  extractHTMLStyles(doc) {
    return Array.from(doc.querySelectorAll('style, link[rel="stylesheet"]')).map(style => ({
      inline: style.tagName === 'STYLE',
      href: style.href || null,
      content: style.tagName === 'STYLE' ? style.textContent : null
    }));
  }

  extractHTMLForms(doc) {
    return Array.from(doc.querySelectorAll('form')).map(form => ({
      action: form.action || '',
      method: form.method || 'GET',
      inputs: Array.from(form.querySelectorAll('input, select, textarea')).map(input => ({
        type: input.type || input.tagName.toLowerCase(),
        name: input.name || '',
        id: input.id || ''
      }))
    }));
  }

  extractJSFunctions(content) {
    return this.extractWithRegex(content, /function\s+(\w+)\s*\(|(\w+)\s*:\s*function\s*\(|const\s+(\w+)\s*=\s*\(/g, 0)
      .map(match => match.replace(/function\s+|const\s+|:\s*function.*|=.*/, '').trim())
      .filter(name => name && /^\w+$/.test(name));
  }

  extractJSClasses(content) {
    return this.extractWithRegex(content, /class\s+(\w+)/g);
  }

  extractJSImports(content) {
    const importRegex = /import\s+(?:{[^}]*}|\w+|\*\s+as\s+\w+)\s+from\s+['"]([^'"]+)['"]/g;
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    
    return [
      ...this.extractWithRegex(content, importRegex),
      ...this.extractWithRegex(content, requireRegex)
    ];
  }

  extractJSExports(content) {
    const namedExports = this.extractWithRegex(content, /export\s+(?:const|let|var|function|class)\s+(\w+)/g);
    const exportFrom = this.extractWithRegex(content, /export\s+.*\s+from\s+['"]([^'"]+)['"]/g);
    return [...namedExports, ...exportFrom];
  }

  extractJSVariables(content) {
    return this.extractWithRegex(content, /(?:const|let|var)\s+(\w+)/g);
  }

  extractCSSSelectors(content) {
    return this.extractWithRegex(content, /([^{}]+)\s*\{/g)
      .filter(selector => !selector.includes('/*'));
  }

  extractCSSProperties(content) {
    const properties = new Set(this.extractWithRegex(content, /([a-zA-Z-]+)\s*:\s*[^;]+;/g));
    return Array.from(properties);
  }

  extractCSSMediaQueries(content) {
    return this.extractWithRegex(content, /@media\s*([^{]+)\s*\{/g);
  }

  extractPythonFunctions(content) {
    return this.extractWithRegex(content, /def\s+(\w+)\s*\(/g);
  }

  extractPythonClasses(content) {
    return this.extractWithRegex(content, /class\s+(\w+)/g);
  }

  extractPythonImports(content) {
    const fromImports = this.extractWithRegex(content, /from\s+(\S+)\s+import/g);
    const directImports = this.extractWithRegex(content, /import\s+(\S+)/g);
    return [...fromImports, ...directImports];
  }

  analyzeYAMLStructure(content) {
    const lines = content.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
    const structure = {
      keys: [],
      nestingLevels: new Set(),
      lists: 0
    };
    
    lines.forEach(line => {
      const trimmed = line.trim();
      const indentation = line.length - line.trimStart().length;
      structure.nestingLevels.add(indentation);
      
      if (trimmed.includes(':')) {
        const key = trimmed.split(':')[0].trim();
        structure.keys.push(key);
      }
      
      if (trimmed.startsWith('-')) {
        structure.lists++;
      }
    });
    
    structure.nestingLevels = Array.from(structure.nestingLevels).sort((a, b) => a - b);
    return structure;
  }

  extractXMLElements(doc) {
    const elements = new Set();
    const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_ELEMENT);
    
    let node;
    while (node = walker.nextNode()) {
      elements.add(node.tagName);
    }
    
    return Array.from(elements);
  }

  extractXMLAttributes(doc) {
    const attributes = new Set();
    const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_ELEMENT);
    
    let node;
    while (node = walker.nextNode()) {
      for (let i = 0; i < node.attributes.length; i++) {
        attributes.add(node.attributes[i].name);
      }
    }
    
    return Array.from(attributes);
  }

  extractXMLNamespaces(doc) {
    const namespaces = new Set();
    
    if (doc.documentElement) {
      for (let i = 0; i < doc.documentElement.attributes.length; i++) {
        const attr = doc.documentElement.attributes[i];
        if (attr.name.startsWith('xmlns')) {
          namespaces.add(attr.name);
        }
      }
    }
    
    return Array.from(namespaces);
  }

  // Utility methods
  getFileExtension(filename) {
    return filename.split('.').pop().toLowerCase();
  }

  categorizeFile(file) {
    const ext = this.getFileExtension(file.name);
    
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image';
    if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(ext)) return 'audio';
    if (['pdf'].includes(ext)) return 'document';
    if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'document';
    if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) return 'spreadsheet';
    if (['ppt', 'pptx', 'odp'].includes(ext)) return 'presentation';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
    if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rs'].includes(ext)) return 'code';
    if (['html', 'htm', 'css', 'scss', 'sass'].includes(ext)) return 'web';
    if (['json', 'xml', 'yml', 'yaml', 'toml'].includes(ext)) return 'data';
    if (['txt', 'md', 'markdown', 'rst'].includes(ext)) return 'text';
    
    return 'other';
  }

  isTextBasedFile(file) {
    const category = this.categorizeFile(file);
    return ['text', 'code', 'web', 'data'].includes(category) || 
           file.type.startsWith('text/') ||
           this.supportedTypes.includes(file.type);
  }

  analyzeFileStructure(extractedData, file) {
    const structure = {
      category: this.categorizeFile(file),
      complexity: 'simple',
      hasNestedData: false,
      dataPoints: 0
    };

    if (extractedData.type === 'json' && extractedData.parsed) {
      structure.hasNestedData = this.hasNestedStructure(extractedData.parsed);
      structure.dataPoints = this.countDataPoints(extractedData.parsed);
    } else if (extractedData.type === 'csv') {
      structure.dataPoints = extractedData.rowCount * extractedData.columnCount;
    } else if (extractedData.type === 'html' && extractedData.structure) {
      structure.dataPoints = Object.values(extractedData.structure).flat().length;
    }

    if (structure.dataPoints > 100 || structure.hasNestedData) {
      structure.complexity = 'complex';
    } else if (structure.dataPoints > 20) {
      structure.complexity = 'medium';
    }

    return structure;
  }

  hasNestedStructure(obj, depth = 0) {
    if (depth > 2) return true;
    
    if (Array.isArray(obj)) {
      return obj.some(item => 
        (typeof item === 'object' && item !== null) && 
        this.hasNestedStructure(item, depth + 1)
      );
    } else if (obj && typeof obj === 'object') {
      return Object.values(obj).some(value => 
        (typeof value === 'object' && value !== null) && 
        this.hasNestedStructure(value, depth + 1)
      );
    }
    
    return false;
  }

  countDataPoints(obj) {
    let count = 0;
    
    if (Array.isArray(obj)) {
      count += obj.length;
      obj.forEach(item => {
        if (typeof item === 'object' && item !== null) {
          count += this.countDataPoints(item);
        }
      });
    } else if (obj && typeof obj === 'object') {
      count += Object.keys(obj).length;
      Object.values(obj).forEach(value => {
        if (typeof value === 'object' && value !== null) {
          count += this.countDataPoints(value);
        }
      });
    }
    
    return count;
  }

  // =================== Utility Methods for Regex Extraction ===================
  
  extractWithRegex(content, regex, captureGroup = 1) {
    const results = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      const captured = match[captureGroup];
      if (captured && captured.trim()) {
        results.push(captured.trim());
      }
    }
    return results;
  }
}

// Create global parser instance
const fileContentParser = new FileContentParser();

// =================== File Upload Manager ===================
// Handles file upload functionality

class FileUploadManager {
  constructor() {
    this.isInitialized = false;
    this.dropZone = null;
  }

  initialize() {
    if (this.isInitialized) return;
    
    this.setupDropZone();
    this.isInitialized = true;

  }

  setupDropZone() {
    // Use document body as drop zone
    this.dropZone = document.body;
    
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      this.dropZone.addEventListener(eventName, this.preventDefaults, false);
      document.body.addEventListener(eventName, this.preventDefaults, false);
    });

    // Highlight drop zone when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
      this.dropZone.addEventListener(eventName, this.highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      this.dropZone.addEventListener(eventName, this.unhighlight, false);
    });

    // Handle dropped files
    this.dropZone.addEventListener('drop', this.handleDrop.bind(this), false);
  }

  preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  highlight(e) {
    document.body.classList.add('drag-over');
  }

  unhighlight(e) {
    document.body.classList.remove('drag-over');
  }

  handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    this.handleFilesDrop(files);
  }

  async processFiles(files, source = 'unknown') {
    if (!files || files.length === 0) return;



    for (const file of files) {
      try {
        await this.processFile(file, source);
      } catch (error) {
        console.error('[UPLOAD] Error processing file:', file.name, error);
      }
    }
  }

  async processFile(file, source) {
    try {
      // Parse the file content
      const fileData = await fileContentParser.parseFile(file);
      
      // Format the file data for AI consumption
      const formattedContent = formatFileDataForAI(fileData, 'analysis');
      
      // Create artifact based on file type
      let artifactType = 'file';
      let artifactTitle = file.name;
      
      // Determine better artifact type based on file
      if (file.type.startsWith('image/')) {
        artifactType = 'image';
      } else if (file.type === 'text/html' || file.name.endsWith('.html')) {
        artifactType = 'html';
      } else if (file.type === 'text/markdown' || file.name.endsWith('.md')) {
        artifactType = 'markdown';
      } else if (file.type.startsWith('text/') || fileData.metadata?.category === 'code') {
        artifactType = 'code';
      }

      // Create the artifact silently (don't auto-open)
      const currentMessageId = window.context?.getCurrentMessageId?.() || 'upload-' + Date.now();
      createArtifactSilent(formattedContent, currentMessageId, artifactType);
      
      
      
    } catch (error) {
      console.error('[UPLOAD] Error processing file:', file.name, error);
      throw error;
    }
  }

  handleFilesDrop(files) {
    this.processFiles(Array.from(files), 'drop');
  }

  handleFilesPaste(files) {
    this.processFiles(Array.from(files), 'paste');
  }
}

// Create global upload manager instance
const fileUploadManager = new FileUploadManager();

// =================== AI Formatting Functions ===================
// Functions for formatting parsed file data for AI consumption

function formatFileDataForAI(fileData, purpose = 'analysis') {
  let formatted = '';
  
  // Basic file information
  formatted += `File: ${fileData.name}\n`;
  formatted += `Type: ${fileData.type}\n`;
  formatted += `Size: ${fileData.size} bytes\n`;
  
  // Add metadata if available
  if (fileData.metadata && fileData.metadata.category) {
    formatted += `Category: ${fileData.metadata.category}\n`;
  }
  
  // Add structure information if available
  if (fileData.structure) {
    formatted += `Complexity: ${fileData.structure.complexity}\n`;
    if (fileData.structure.dataPoints > 0) {
      formatted += `Data Points: ${fileData.structure.dataPoints}\n`;
    }
  }
  
  formatted += '\n';
  
  // Handle different file types with extracted data
  if (fileData.extractedData) {
    const extracted = fileData.extractedData;
    
    switch (extracted.type) {
      case 'json':
        formatted += 'JSON Structure:\n';
        if (extracted.keys) {
          formatted += `Keys: ${extracted.keys.slice(0, 20).join(', ')}\n`;
        }
        if (extracted.structure && extracted.structure.valid !== false) {
          formatted += `Structure Type: ${extracted.structure.type}\n`;
        }
        if (purpose === 'analysis' && extracted.parsed) {
          formatted += '\nSample Data:\n```json\n';
          formatted += JSON.stringify(extracted.parsed, null, 2).substring(0, 1000);
          formatted += '\n```\n\n';
        } else if (purpose === 'edit') {
          formatted += '\nFull Content:\n```json\n';
          formatted += extracted.rawContent;
          formatted += '\n```\n\n';
        }
        break;
        
      case 'csv':
        formatted += 'CSV Data:\n';
        formatted += `Rows: ${extracted.rowCount}, Columns: ${extracted.columnCount}\n`;
        formatted += `Headers: ${extracted.headers.join(', ')}\n`;
        if (extracted.summary) {
          formatted += 'Column Analysis:\n';
          Object.entries(extracted.summary.columnTypes).forEach(([header, info]) => {
            formatted += `  ${header}: ${info.uniqueCount} unique values\n`;
          });
        }
        if (purpose === 'analysis') {
          formatted += '\nSample Rows:\n```csv\n';
          formatted += extracted.headers.join(',') + '\n';
          formatted += extracted.rows.slice(0, 5).map(row => row.join(',')).join('\n');
          formatted += '\n```\n\n';
        } else if (purpose === 'edit') {
          formatted += '\nFull Content:\n```csv\n';
          formatted += extracted.rawContent;
          formatted += '\n```\n\n';
        }
        break;
        
      case 'markdown':
        formatted += 'Markdown Structure:\n';
        if (extracted.structure.headings.length > 0) {
          formatted += `Headings: ${extracted.structure.headings.map(h => h.text).slice(0, 10).join(', ')}\n`;
        }
        if (extracted.structure.codeBlocks.length > 0) {
          formatted += `Code Blocks: ${extracted.structure.codeBlocks.length} (languages: ${extracted.structure.codeBlocks.map(cb => cb.language).join(', ')})\n`;
        }
        formatted += `Word Count: ${extracted.wordCount}\n\n`;
        if (purpose === 'edit') {
          formatted += 'Full Content:\n```markdown\n';
          formatted += extracted.rawContent;
          formatted += '\n```\n\n';
        }
        break;
        
      case 'javascript':
        formatted += 'JavaScript Structure:\n';
        if (extracted.structure.functions.length > 0) {
          formatted += `Functions: ${extracted.structure.functions.slice(0, 10).join(', ')}\n`;
        }
        if (extracted.structure.classes.length > 0) {
          formatted += `Classes: ${extracted.structure.classes.slice(0, 10).join(', ')}\n`;
        }
        if (extracted.structure.imports.length > 0) {
          formatted += `Imports: ${extracted.structure.imports.slice(0, 5).join(', ')}\n`;
        }
        formatted += `Lines: ${extracted.lineCount}\n\n`;
        if (purpose === 'edit') {
          formatted += 'Full Content:\n```javascript\n';
          formatted += extracted.rawContent;
          formatted += '\n```\n\n';
        }
        break;
        
      case 'html':
        formatted += 'HTML Structure:\n';
        if (extracted.structure.title) {
          formatted += `Title: ${extracted.structure.title}\n`;
        }
        if (extracted.structure.headings.length > 0) {
          formatted += `Headings: ${extracted.structure.headings.map(h => h.text).slice(0, 5).join(', ')}\n`;
        }
        if (extracted.structure.scripts.length > 0) {
          formatted += `Scripts: ${extracted.structure.scripts.length}\n`;
        }
        if (extracted.structure.forms.length > 0) {
          formatted += `Forms: ${extracted.structure.forms.length}\n`;
        }
        formatted += '\n';
        if (purpose === 'edit') {
          formatted += 'Full Content:\n```html\n';
          formatted += extracted.rawContent;
          formatted += '\n```\n\n';
        }
        break;
        
      case 'python':
        formatted += 'Python Structure:\n';
        if (extracted.structure.functions.length > 0) {
          formatted += `Functions: ${extracted.structure.functions.slice(0, 10).join(', ')}\n`;
        }
        if (extracted.structure.classes.length > 0) {
          formatted += `Classes: ${extracted.structure.classes.slice(0, 10).join(', ')}\n`;
        }
        if (extracted.structure.imports.length > 0) {
          formatted += `Imports: ${extracted.structure.imports.slice(0, 5).join(', ')}\n`;
        }
        formatted += `Lines: ${extracted.lineCount}\n\n`;
        if (purpose === 'edit') {
          formatted += 'Full Content:\n```python\n';
          formatted += extracted.rawContent;
          formatted += '\n```\n\n';
        }
        break;
        
      case 'pdf':
        formatted += 'PDF Document:\n';
        if (extracted.pageCount) {
          formatted += `Pages: ${extracted.pageCount}\n`;
        }
        if (extracted.metadata && extracted.metadata.totalWords) {
          formatted += `Total Words: ${extracted.metadata.totalWords}\n`;
          formatted += `Average Words per Page: ${extracted.metadata.averageWordsPerPage}\n`;
        }
        if (extracted.structure) {
          if (extracted.structure.hasStructuredContent) {
            formatted += 'Document appears to have structured content (sections/chapters)\n';
          }
          if (extracted.structure.possibleSections && extracted.structure.possibleSections.length > 0) {
            formatted += `Possible Sections: ${extracted.structure.possibleSections.slice(0, 5).join(', ')}\n`;
          }
          if (extracted.structure.keyTerms && extracted.structure.keyTerms.length > 0) {
            const topTerms = extracted.structure.keyTerms.slice(0, 10).map(term => term.word).join(', ');
            formatted += `Key Terms: ${topTerms}\n`;
          }
        }
        formatted += '\n';
        if (purpose === 'analysis' && extracted.textContent) {
          const preview = extracted.textContent.substring(0, 1500);
          formatted += 'Document Preview:\n```\n';
          formatted += preview + (extracted.textContent.length > 1500 ? '...' : '');
          formatted += '\n```\n\n';
        } else if (purpose === 'edit' && extracted.textContent) {
          formatted += 'Full Text Content:\n```\n';
          formatted += extracted.textContent;
          formatted += '\n```\n\n';
        } else if (extracted.metadata && extracted.metadata.parseError) {
          formatted += `Content Extraction: ${extracted.metadata.parseError}\n\n`;
        }
        break;
      
      default:
        // Generic text or other types
        if (fileData.searchableContent) {
          const content = fileData.searchableContent;
          formatted += `Content (${content.length} characters):\n`;
          if (purpose === 'analysis') {
            formatted += '```\n' + content.substring(0, 1000) + (content.length > 1000 ? '...' : '') + '\n```\n\n';
          } else if (purpose === 'edit') {
            formatted += '```\n' + content + '\n```\n\n';
          }
        }
        break;
    }
  } else if (fileData.textContent) {
    // Fallback for older format
    const content = fileData.textContent;
    formatted += `Text Content (${content.length} characters):\n`;
    if (purpose === 'analysis') {
      formatted += '```\n' + content.substring(0, 1000) + (content.length > 1000 ? '...' : '') + '\n```\n\n';
    } else if (purpose === 'edit') {
      formatted += '```\n' + content + '\n```\n\n';
    }
  } else {
    const fileSize = fileData.size ? `${Math.round(fileData.size / 1024)}KB` : 'Unknown size';
    formatted += `[Binary file - ${fileSize}, cannot extract text content]\n\n`;
  }
  
  return formatted;
}

function generateArtifactsSummary(artifacts) {
  const summary = {
    types: {},
    fileCategories: {},
    totalFiles: 0,
    hasStructuredData: false,
    complexFiles: 0
  };
  
  artifacts.forEach(artifact => {
    // Count by type
    summary.types[artifact.type] = (summary.types[artifact.type] || 0) + 1;
    
    // For file artifacts, gather more details
    if (artifact.type === 'files' && artifact.fileData) {
      summary.totalFiles++;
      
      const category = artifact.metadata.category || 'unknown';
      summary.fileCategories[category] = (summary.fileCategories[category] || 0) + 1;
      
      if (artifact.metadata.hasStructuredData) {
        summary.hasStructuredData = true;
      }
      
      if (artifact.metadata.complexity !== 'simple') {
        summary.complexFiles++;
      }
    }
  });
  
  return summary;
}

// =================== Module Exports ===================
// Export functions for global access

window.artifactsModule = {
  createArtifact,
  createArtifactSilent,
  updateArtifact,
  getArtifact,
  getArtifactVersion,
  setArtifactVersion,
  deleteArtifactVersion,
  resolveArtifactContent,
  resolveMultipleArtifacts,
  formatFileSize,
  getFileIcon,
  setupArtifactClickHandlers,
  getFaviconUrl,
  
  // Organization functions
  findBestMatchingArtifact,
  shouldUpdateArtifact,
  isRefinedTitle,
  calculateSimilarity,
  calculateContentSimilarity,
  extractHtmlElements,
  levenshteinDistance,
  
  // File upload functions
  initializeFileUpload: () => fileUploadManager.initialize(),
  processFiles: (files, source) => fileUploadManager.processFiles(files, source),
  handleFilesDrop: (files) => fileUploadManager.handleFilesDrop(files),
  handleFilesPaste: (files) => fileUploadManager.handleFilesPaste(files),
  
  // Enhanced file parser
  parseFile: (file) => fileContentParser.parseFile(file),
  
  // AI formatting functions
  formatFileDataForAI,
  generateArtifactsSummary,
  
  init
};

// Also make it available as `artifacts` for backward compatibility
window.artifacts = window.artifactsModule;

// File upload module
window.fileUploadModule = {
  // Core methods
  initialize: () => fileUploadManager.initialize(),
  
  // File processing
  processFiles: (files, source) => fileUploadManager.processFiles(files, source),
  handleFilesDrop: (files) => fileUploadManager.handleFilesDrop(files),
  handleFilesPaste: (files) => fileUploadManager.handleFilesPaste(files)
};