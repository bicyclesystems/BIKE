const globalAnimatedWords = new Set();

// Build context word map from all sources
function buildContextWords() {
  const contextWords = new Map();
  
  // Add artifacts
  (window.artifactsModule?.getCurrentChatArtifacts() || []).forEach(artifact => {
    contextWords.set(artifact.title.toLowerCase(), { type: 'artifact', id: artifact.id, title: artifact.title });
  });
  
  // Add views
  (window.views?.getAllViews() || []).forEach(view => {
    contextWords.set(view.name.toLowerCase(), { type: 'view', viewType: view.type, title: view.name });
  });
  
  // Add chats
  (window.context?.getChats() || []).forEach(chat => {
    contextWords.set(chat.title.toLowerCase(), { type: 'chat', id: chat.id, title: chat.title });
  });
  
  // Add actions
  if (window.actionsView?.getAvailableActions) {
    window.actionsView.getAvailableActions().forEach(action => {
      const name = action.name.toLowerCase();
      const words = name.split(' ').filter(w => w.length > 2);
      
      // Full name
      contextWords.set(name, { type: 'action', actionId: action.id, actionName: action.name, title: action.name });
      
      // Individual words
      words.forEach(word => {
        if (!contextWords.has(word)) {
          contextWords.set(word, { type: 'action', actionId: action.id, actionName: action.name, isPartial: true });
        }
      });
      
      // Word combinations
      for (let i = 0; i < words.length - 1; i++) {
        const combo = `${words[i]} ${words[i + 1]}`;
        if (!contextWords.has(combo)) {
          contextWords.set(combo, { type: 'action', actionId: action.id, actionName: action.name, isPartial: true });
        }
      }
      
      // Action ID suffix
      const idParts = action.id.split('.');
      if (idParts[1] && !contextWords.has(idParts[1])) {
        contextWords.set(idParts[1], { type: 'action', actionId: action.id, actionName: action.name, isPartial: true });
      }
    });
  }
  
  return contextWords;
}

function highlightContextWords(element = null) {
  element = element || window.inputModule?._manager?.inputElement;
  if (!element || !window.context || element.dataset.highlighting === 'true') return;
  
  const text = element.innerText;
  if (!text.trim()) return;
  
  const contextWords = buildContextWords();
  if (contextWords.size === 0) return;
  
  // Find all matches
  const matches = [];
  contextWords.forEach((item, word) => {
    const pattern = /^[\p{Emoji}\s]|[^\w\s]/u.test(word) ? 
      word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : 
      `\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`;
    
    const regex = new RegExp(pattern, 'gi');
    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        word, item, start: match.index, end: match.index + match[0].length,
        matchText: match[0], length: match[0].length
      });
    }
  });
  
  // Sort by length (longer first), then position
  matches.sort((a, b) => b.length - a.length || a.start - b.start);
  
  // Remove overlaps
  const final = [];
  const used = [];
  matches.forEach(match => {
    if (!used.some(range => match.start < range.end && match.end > range.start)) {
      final.push(match);
      used.push({ start: match.start, end: match.end });
    }
  });
  
  // Apply highlighting (reverse order for string replacement)
  let html = text;
  final.sort((a, b) => b.start - a.start).forEach(({ word, item, start, end, matchText }) => {
    const colors = { artifact: 'blue', view: 'orange', action: 'dark-green', chat: 'violet' };
    const animated = globalAnimatedWords.has(word);
    const anim = animated ? '' : 'fade-in ease-out duration-normal once';
    const escape = t => t.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
    
    const span = `<span class="${anim}" style="color: var(--color-${colors[item.type]});" data-word="${escape(word)}" data-animated="${animated}">${escape(matchText)}</span>`;
    html = html.substring(0, start) + span + html.substring(end);
  });
  
  if (html !== element.innerHTML) {
    element.dataset.highlighting = 'true';
    element.innerHTML = html;
    delete element.dataset.highlighting;
    
    // Mark new words as animated
    setTimeout(() => {
      element.querySelectorAll('span[data-animated="false"]').forEach(span => {
        const word = span.getAttribute('data-word');
        if (word) {
          globalAnimatedWords.add(word);
          span.setAttribute('data-animated', 'true');
        }
      });
    }, 10);
    
    // Restore cursor for editable elements
    if (element.contentEditable === 'true') {
      try {
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
      } catch (e) {}
    }
  }
}

function extractContextReferences(element = null) {
  element = element || window.inputModule?._manager?.inputElement;
  if (!element) return { cleanText: '', references: [] };
  
  const spans = element.querySelectorAll('span[data-word]');
  if (spans.length === 0) return { cleanText: element.innerText.trim(), references: [] };
  
  const contextWords = buildContextWords();
  const references = [];
  const clone = element.cloneNode(true);
  
  clone.querySelectorAll('span[data-word]').forEach(span => {
    const word = span.getAttribute('data-word');
    const item = contextWords.get(word);
    let replacement = span.innerText;
    
    if (item) {
      if (item.type === 'artifact') {
        replacement = `[[artifact:${item.id}]]`;
      } else if (item.type === 'view') {
        replacement = `[[view:${item.viewType}]]`;
      } else if (item.type === 'action') {
        replacement = `[[action:${item.actionId}]]`;
      } else if (item.type === 'chat') {
        replacement = `[[chat:${item.id}]]`;
      }
      references.push(replacement);
    }
    
    span.parentNode.replaceChild(document.createTextNode(replacement), span);
  });
  
  return { cleanText: clone.innerText.trim(), references };
}

function highlightViewContent() {
  const view = document.getElementById('view');
  if (!view) return;
  
  view.querySelectorAll('*').forEach(el => {
    if (!el.innerText?.trim() || el.dataset.highlighting === 'true') return;
    
    const hasTextChildren = Array.from(el.children).some(child => child.innerText?.trim());
    if (hasTextChildren && !Array.from(el.children).every(child => 
      !child.innerText?.trim() || child.getAttribute('data-no-highlight') === 'true')) return;
    
    const noHighlight = el.querySelectorAll('[data-no-highlight="true"]');
    if (noHighlight.length > 0) {
      const preserved = [];
      noHighlight.forEach((tag, i) => {
        const placeholder = `__PRESERVE_${i}__`;
        preserved.push({ placeholder, html: tag.outerHTML });
        tag.outerHTML = placeholder;
      });
      
      highlightContextWords(el);
      
      let html = el.innerHTML;
      preserved.forEach(({ placeholder, html: originalHTML }) => {
        html = html.replace(placeholder, originalHTML);
      });
      el.innerHTML = html;
    } else {
      highlightContextWords(el);
    }
  });
}

window.contextHighlight = { highlightContextWords, extractContextReferences, highlightViewContent }; 