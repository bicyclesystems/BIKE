// =================== Context Highlighting System ===================
// Handles real-time highlighting and reference extraction for user input

// Global state for tracking animated words across all elements
const globalAnimatedWords = new Set();

// =================== Context Highlighting Functions ===================

function highlightContextWords(element = null) {
  if (!element && window.inputModule && window.inputModule._manager) {
    element = window.inputModule._manager.inputElement;
  }
  
  if (!element || !window.context) return;
  
  const elementText = element.innerText;
  if (!elementText.trim()) {
    return;
  }
  
  // Get available context items
  const artifacts = window.context?.getCurrentChatArtifacts() || [];
  const viewTypes = window.context?.getViewTypes() || [];
  
  // Build simple word map (just exact title matches for simplicity)
  const contextWords = new Map();
  
  artifacts.forEach(artifact => {
    const title = artifact.title.toLowerCase();
    contextWords.set(title, {
      type: 'artifact',
      id: artifact.id,
      title: artifact.title
    });
  });
  
  viewTypes.forEach(viewType => {
    const title = viewType.title.toLowerCase();
    contextWords.set(title, {
      type: 'view',
      viewType: viewType.type,
      title: viewType.title
    });
  });

  // Add actions from the actions registry
  if (window.actions && window.actions.ACTIONS_REGISTRY) {
    Object.values(window.actions.ACTIONS_REGISTRY).forEach(action => {
      // Add full action names (e.g., "Create New Chat", "Switch View", etc.)
      const actionName = action.name.toLowerCase();
      if (!contextWords.has(actionName)) {
        contextWords.set(actionName, {
          type: 'action',
          actionId: action.id,
          actionName: action.name,
          title: action.name,
          description: action.description
        });
      }
      
      // Also add simplified versions of action names for better matching
      const words = actionName.split(' ').filter(w => w.length > 2);
      
      // Add individual significant words
      words.forEach(word => {
        if (!contextWords.has(word) && word.length > 2) {
          contextWords.set(word, {
            type: 'action',
            actionId: action.id,
            actionName: action.name,
            word: word,
            isPartial: true
          });
        }
      });
      
      // Add two-word combinations
      for (let i = 0; i < words.length - 1; i++) {
        const combination = `${words[i]} ${words[i + 1]}`;
        if (!contextWords.has(combination)) {
          contextWords.set(combination, {
            type: 'action',
            actionId: action.id,
            actionName: action.name,
            word: combination,
            isPartial: true
          });
        }
      }
      
      // Add action ID parts (e.g., "chat.create" -> "create")
      const idParts = action.id.split('.');
      if (idParts.length > 1) {
        const actionPart = idParts[1].toLowerCase();
        if (!contextWords.has(actionPart)) {
          contextWords.set(actionPart, {
            type: 'action',
            actionId: action.id,
            actionName: action.name,
            word: actionPart,
            isPartial: true
          });
        }
      }
    });
  }
  

  
  // Add chat names to context highlighting
  const chats = window.context?.getChats() || [];
  chats.forEach(chat => {
    const title = chat.title.toLowerCase();
    contextWords.set(title, {
      type: 'chat',
      id: chat.id,
      title: chat.title
    });
  });
  
  if (contextWords.size === 0) return;
  
  // Smart highlighting - find all matches first, then apply in priority order
  const allMatches = [];
  
  contextWords.forEach((contextItem, word) => {
    let regexPattern;
    if (/^[\p{Emoji}\s]|[^\w\s]/u.test(word)) {
      regexPattern = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    } else {
      regexPattern = `\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`;
    }
    
    const regex = new RegExp(regexPattern, 'gi');
    let match;
    
    while ((match = regex.exec(elementText)) !== null) {
      allMatches.push({
        word: word,
        contextItem: contextItem,
        start: match.index,
        end: match.index + match[0].length,
        matchText: match[0],
        length: match[0].length
      });
    }
  });
  
  // Sort matches by priority: longer matches first, then by position
  allMatches.sort((a, b) => {
    if (a.length !== b.length) {
      return b.length - a.length;
    }
    return a.start - b.start;
  });
  
  // Remove overlapping matches
  const finalMatches = [];
  const usedRanges = [];
  
  allMatches.forEach(match => {
    const overlaps = usedRanges.some(range => 
      (match.start < range.end && match.end > range.start)
    );
    
    if (!overlaps) {
      finalMatches.push(match);
      usedRanges.push({ start: match.start, end: match.end });
    }
  });
  
  // Sort final matches by position for proper replacement
  finalMatches.sort((a, b) => b.start - a.start);
  
  // Apply highlighting
  let highlightedHtml = elementText;
  
  finalMatches.forEach(match => {
    const { word, contextItem, start, end, matchText } = match;
    
    // Determine color based on context type
    let contextStyle = '';
    let animationClass = 'fade-in ease-out duration-normal once';
    
    if (contextItem.type === 'artifact') {
      contextStyle = 'style="color: var(--color-blue);"';
    } else if (contextItem.type === 'view') {
      contextStyle = 'style="color: var(--color-orange);"';
    } else if (contextItem.type === 'action') {
      contextStyle = 'style="color: var(--color-dark-green);"';
    } else if (contextItem.type === 'chat') {
      contextStyle = 'style="color: var(--color-violet);"';
    }
    
    const hasBeenAnimated = globalAnimatedWords.has(word);
    const finalAnimationClass = hasBeenAnimated ? '' : animationClass;
    
    const escapeHtml = (text) => window.utils?.escapeHtml ? window.utils.escapeHtml(text) : text.replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
    
    const replacement = `<span class="${finalAnimationClass}" ${contextStyle} data-word="${escapeHtml(word)}" data-animated="${hasBeenAnimated}">${escapeHtml(matchText)}</span>`;
    
    highlightedHtml = highlightedHtml.substring(0, start) + replacement + highlightedHtml.substring(end);
  });
  
  if (highlightedHtml !== element.innerHTML) {
    element.innerHTML = highlightedHtml;
    
    setTimeout(() => {
      const newlyAnimatedSpans = element.querySelectorAll('span[data-animated="false"]');
      newlyAnimatedSpans.forEach(span => {
        const word = span.getAttribute('data-word');
        if (word) {
          globalAnimatedWords.add(word);
          span.setAttribute('data-animated', 'true');
        }
      });
    }, 10);
    
    if (element.contentEditable === 'true') {
      try {
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(element);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (e) {
        // Ignore cursor placement errors
      }
    }
  }
}

function extractContextReferences(element = null) {
  if (!element && window.inputModule && window.inputModule._manager) {
    element = window.inputModule._manager.inputElement;
  }
  
  if (!element) return { cleanText: element?.innerText || '', references: [] };
  
  const elementText = element.innerText;
  const artifacts = window.context?.getCurrentChatArtifacts() || [];
  const viewTypes = window.context?.getViewTypes() || [];
  const references = [];
  
  const highlightedSpans = element.querySelectorAll('span[data-word]');
  
  if (highlightedSpans.length === 0) {
    return { cleanText: element.innerText.trim(), references: [] };
  }
  
  // Build lookup maps
  const artifactsByTitle = new Map();
  artifacts.forEach(artifact => {
    artifactsByTitle.set(artifact.title.toLowerCase(), artifact);
  });
  
  const viewsByTitle = new Map();
  viewTypes.forEach(viewType => {
    viewsByTitle.set(viewType.title.toLowerCase(), viewType);
  });
  
  // Build action lookup
  const actionsByWord = new Map();
  if (window.actions && window.actions.ACTIONS_REGISTRY) {
    Object.values(window.actions.ACTIONS_REGISTRY).forEach(action => {
      const actionName = action.name.toLowerCase();
      actionsByWord.set(actionName, action);
      
      const words = actionName.split(' ').filter(w => w.length > 2);
      words.forEach(word => {
        if (!actionsByWord.has(word)) {
          actionsByWord.set(word, action);
        }
      });
      
      for (let i = 0; i < words.length - 1; i++) {
        const combination = `${words[i]} ${words[i + 1]}`;
        if (!actionsByWord.has(combination)) {
          actionsByWord.set(combination, action);
        }
      }
      
      const idParts = action.id.split('.');
      if (idParts.length > 1) {
        const actionPart = idParts[1].toLowerCase();
        if (!actionsByWord.has(actionPart)) {
          actionsByWord.set(actionPart, action);
        }
      }
    });
  }


  
  const clonedElement = element.cloneNode(true);
  const clonedSpans = clonedElement.querySelectorAll('span[data-word]');
  
  clonedSpans.forEach(span => {
    const word = span.getAttribute('data-word');
    let replacement = span.innerText;
    
    if (artifactsByTitle.has(word)) {
      const artifact = artifactsByTitle.get(word);
      replacement = `[[artifact:${artifact.id}]]`;
      references.push(replacement);
    } else if (viewsByTitle.has(word)) {
      const viewType = viewsByTitle.get(word);
      replacement = `[[view:${viewType.type}]]`;
      references.push(replacement);
    } else if (actionsByWord.has(word)) {
      const action = actionsByWord.get(word);
      replacement = `[[action:${action.id}]]`;
      references.push(replacement);
    }
    
    const textNode = document.createTextNode(replacement);
    span.parentNode.replaceChild(textNode, span);
  });
  
  const cleanText = clonedElement.innerText.trim();
  
  return { cleanText, references };
}

// =================== Public API ===================

window.contextHighlight = {
  highlightContextWords,
  extractContextReferences
}; 