// =================== Artifacts Version Management ===================
// Functions for version management and smart artifact deduplication

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

// =================== Smart Deduplication & Matching ===================

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

// Helper function that needs to be imported from core
function getArtifact(id) {
  return window.context?.findCurrentChatArtifact(id);
}

// Export version management functions
const versionsModule = {
  // Version management
  getArtifactVersion,
  setArtifactVersion,
  deleteArtifactVersion,
  
  // Smart deduplication
  findBestMatchingArtifact,
  shouldUpdateArtifact,
  isRefinedTitle,
  calculateSimilarity,
  calculateContentSimilarity,
  extractHtmlElements,
  levenshteinDistance
};

// Make available globally
if (typeof window !== 'undefined') {
  window.versionsModule = versionsModule;
}