// =================== CHAT & MESSAGES MODULE ===================
// Handles all chat and message display, user input, and conversation UI functionality
// Main sections: Configuration → State Management → Typewriter System → Message Display → Event Handling → Public API

// =================== CONFIGURATION ===================

// =================== STATE MANAGEMENT ===================

// =================== CHAT MANAGEMENT ===================

// Simple chat creation function (moved from actions)
function create(options = {}) {
  const { timestamp, title, description, endTime } = options;
  
  // Reset chat state for new chat
  messages = [];
  activeMessageIndex = -1;
  
  // Create chat object with embedded messages
  const id = Date.now().toString();
  const chatTitle = title && typeof title === 'string' && title.trim() ? title.trim() : "New Chat";
  const chatDescription = description && typeof description === 'string' && description.trim() ? description.trim() : "";
  const chatTimestamp = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();
  const chat = { 
    id, 
    title: chatTitle, 
    description: chatDescription, 
    timestamp: chatTimestamp,
    messages: []
  };
  
  if (endTime) {
    chat.endTime = new Date(endTime).toISOString();
  }
  
  // Add to chats array
  const currentChats = window.chat?.getChats() || [];
  chats = [...currentChats, chat];
  
  // Save and switch to new chat
  window.memory?.saveChats(chats);
  switchChat(id);
  
  return chat;
}

// Simple chat switching function
function switchChat(chatId) {
  if (!chatId) return;
  
  // Find chat and get its messages
  const chat = chats.find(c => c.id === chatId);
  const chatMessages = chat?.messages || [];
  
  // Update chat state
  activeChatId = chatId;
  messages = chatMessages;
  activeMessageIndex = chatMessages.length - 1;
  
  // Save active chat ID to localStorage
  localStorage.setItem(ACTIVE_CHAT_ID_KEY, chatId || '');
  
  // Update messages display if available
  if (window.chat?.updateMessagesDisplay) {
    window.chat.updateMessagesDisplay();
  }
}

// Rename a chat
function rename(title, chatId = null) {
  if (!title || typeof title !== 'string') {
    throw new Error('Title is required and must be a string');
  }
  
  const trimmedTitle = title.trim();
  if (trimmedTitle.length === 0) {
    throw new Error('Chat title cannot be empty');
  }
  
  const targetChatId = chatId || window.chat?.getActiveChatId();
  if (!targetChatId) {
    throw new Error('No chat ID provided and no active chat');
  }
  
  const chats = window.chat?.getChats() || [];
  const chat = chats.find(c => c.id === targetChatId);
  if (!chat) {
    throw new Error(`Chat ${targetChatId} does not exist`);
  }
  
  const oldTitle = chat.title;
  if (oldTitle === trimmedTitle) {
    throw new Error(`Chat title is already "${trimmedTitle}"`);
  }
  
  // Update the chat
  const chatIndex = chats.findIndex(c => c.id === targetChatId);
  const updatedChats = [...chats];
  updatedChats[chatIndex] = { ...updatedChats[chatIndex], title: trimmedTitle };
  
  chats = updatedChats;
  window.memory?.saveChats(chats);
  
  return { 
    success: true, 
    message: `Renamed chat from "${oldTitle}" to "${trimmedTitle}"`,
    oldTitle,
    newTitle: trimmedTitle,
    chatId: targetChatId
  };
}

// Set chat description
function setDescription(description, chatId = null) {
  if (description !== null && typeof description !== 'string') {
    throw new Error('Description must be a string or null');
  }
  
  const trimmedDescription = description ? description.trim() : "";
  const targetChatId = chatId || window.chat?.getActiveChatId();
  if (!targetChatId) {
    throw new Error('No chat ID provided and no active chat');
  }
  
  const chats = window.chat?.getChats() || [];
  const chat = chats.find(c => c.id === targetChatId);
  if (!chat) {
    throw new Error(`Chat ${targetChatId} does not exist`);
  }
  
  const oldDescription = chat.description || "";
  if (oldDescription === trimmedDescription) {
    throw new Error(`Chat description is already "${trimmedDescription}"`);
  }
  
  // Update the chat
  const chatIndex = chats.findIndex(c => c.id === targetChatId);
  const updatedChats = [...chats];
  updatedChats[chatIndex] = { ...updatedChats[chatIndex], description: trimmedDescription };
  
  chats = updatedChats;
  window.memory?.saveChats(chats);
  
  return {
    success: true,
    message: trimmedDescription ? 
      `Set chat "${chat.title}" description to "${trimmedDescription}"` :
      `Cleared chat "${chat.title}" description`,
    oldDescription,
    newDescription: trimmedDescription,
    chatId: targetChatId
  };
}



// Delete a chat
function deleteChat(chatId, confirmDelete = false) {
  const chats = window.chat?.getChats() || [];
  const chat = chats.find(c => c.id === chatId);
  
  if (!chat) {
    throw new Error(`Chat ${chatId} does not exist`);
  }
  
  // Prevent deleting the last chat
  if (chats.length <= 1) {
    throw new Error('Cannot delete the last remaining chat. Create a new chat first.');
  }
  
  // Safety check - require confirmation for non-empty chats
  const chatMessages = chat.messages || [];
  const artifacts = (window.artifactsModule?.getArtifacts() || []).filter(a => a.chatId === chatId);
  
  if ((chatMessages.length > 0 || artifacts.length > 0) && !confirmDelete) {
    throw new Error(`Chat "${chat.title}" contains ${chatMessages.length} messages and ${artifacts.length} artifacts. Set confirmDelete=true to proceed.`);
  }
  
  try {
    // 1. Remove chat from chats array (messages are embedded, so this removes everything)
    const updatedChats = chats.filter(c => c.id !== chatId);
    
    // 2. Remove artifacts for this chat
    const currentArtifacts = window.artifactsModule?.getArtifacts() || [];
    const updatedArtifacts = currentArtifacts.filter(a => a.chatId !== chatId);
    
    // 3. Update module states
    chats.length = 0;
    chats.push(...updatedChats);
    
    if (window.artifactsModule?.getArtifacts) {
      const artifactsArray = window.artifactsModule.getArtifacts();
      artifactsArray.length = 0;
      artifactsArray.push(...updatedArtifacts);
    }
    
    // 5. Handle active chat switching
    if (window.chat?.getActiveChatId() === chatId) {
      const sortedChats = updatedChats.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      const newActiveChatId = sortedChats[0].id;
      switchChat(newActiveChatId);
    } else {
      // Just save the data since we're not switching chats
      window.memory?.saveChats(updatedChats);
      window.memory?.saveArtifacts(updatedArtifacts);
    }
    
    // 6. No need to clear activeChatId since we don't store it in localStorage
    
    // 7. Delete from database if sync is available
    if (window.syncManager?.deleteChatFromDatabase) {
      window.syncManager.deleteChatFromDatabase(chatId).catch(error => {
        console.warn('[CHAT] Failed to delete chat from database:', error);
      });
    }
    
    // 8. Notify sync system
    window.memory?.events?.dispatchEvent(new CustomEvent('dataChanged', { 
      detail: { type: 'chatDeleted', data: { chatId } } 
    }));
    
    return {
      success: true,
      message: `Deleted chat "${chat.title}" with ${chatMessages.length} messages and ${artifacts.length} artifacts`,
      chatId,
      chatTitle: chat.title,
      deletedMessageCount: chatMessages.length,
      deletedArtifactCount: artifacts.length
    };
    
  } catch (error) {
    console.error('[CHAT] Error deleting chat:', error);
    throw new Error(`Failed to delete chat: ${error.message}`);
  }
}

// Typewriter animation state
const TypewriterState = {
  currentAnimation: null,
  isActive: false,

  cancel() {
    if (this.currentAnimation) {
      clearTimeout(this.currentAnimation);
      this.currentAnimation = null;
    }
    this.isActive = false;
  },
};

// Centralized state tracking for messages functionality
const MessagesState = {
  get isThinking() {
    return (
      dom.getContainer()?.querySelector(".typewriter-container") !== null ||
      TypewriterState.isActive
    );
  },

  get hasMessages() {
    const messages = window.chat?.getMessages();
    return messages && messages.length > 0;
  },

  get isVisible() {
    const container = dom.getContainer();
    return (
      !container?.classList.contains("hidden") &&
      !container?.classList.contains("opacity-xl")
    );
  },
};

// UI visibility helpers with first-principles approach
const MessagesVisibility = {
  show() {
    const container = dom.getContainer();
    if (!container) return;
    dom.removeEffectClasses(container);
    container.classList.remove("hidden");
  },

  hide() {
    const container = dom.getContainer();
    if (!container) return;
    container.classList.add("hidden");
    dom.removeEffectClasses(container);
  },

  fadeOut() {
    const container = dom.getContainer();
    if (!container) return;
    container.classList.add("opacity-xl");
  },
};

// Hover functionality state
let hoverTimeout = null;

// =================== TYPEWRITER SYSTEM ===================

function smartTypewriter(element, content, options = {}) {
  const { baseSpeed = 15, punctuationPause = 120, onComplete = null } = options;

  if (!element || !content) {
    if (onComplete) onComplete();
    return;
  }

  TypewriterState.isActive = true;
  let index = 0;
  let displayText = "";
  element.innerHTML = "";

  function getCharacterSpeed(char, nextChar) {
    if (/[.!?]/.test(char) && nextChar === " ")
      return baseSpeed + punctuationPause;
    if (char === "," && nextChar === " ") return baseSpeed + 60;
    return baseSpeed;
  }

  function typeNextCharacter() {
    if (!TypewriterState.isActive) {
      if (onComplete) onComplete();
      return;
    }

    if (index < content.length) {
      const char = content[index];
      displayText += char === "\n" ? "<br>" : char;
      element.innerHTML = displayText;

      // Apply highlighting to just-completed word after spaces/punctuation
      if (char === " " || /[.!?,:;]/.test(char)) {
        // Small delay to let the character render, then highlight
        setTimeout(() => {
          if (TypewriterState.isActive) {
            // Only if still typing
            window.contextHighlight.highlightContextWords(element);
          }
        }, 10);
      }

      index++;
      const speed = getCharacterSpeed(char, content[index]);
      TypewriterState.currentAnimation = setTimeout(typeNextCharacter, speed);
    } else {
      TypewriterState.isActive = false;
      TypewriterState.currentAnimation = null;
      if (onComplete) onComplete();
    }
  }

  typeNextCharacter();
}

function animateExtrasSequentially(extrasContainer, fileAnalysisInfo) {
  const sequence = [];

  if (fileAnalysisInfo) {
    sequence.push({
      content: `<div class="opacity-xl scale-75">${fileAnalysisInfo}</div>`,
      delay: 100,
    });
  }

  if (sequence.length === 0) return;

  extrasContainer.classList.remove("opacity-xl");

  let currentIndex = 0;
  function animateNext() {
    if (currentIndex >= sequence.length) return;

    const item = sequence[currentIndex];
    extrasContainer.insertAdjacentHTML("beforeend", item.content);

    const newElement = extrasContainer.lastElementChild;
    setTimeout(() => {
      newElement.classList.remove("opacity-xl", "scale-75");
      newElement.classList.add("transition");
    }, 25);

    currentIndex++;
    setTimeout(animateNext, item.delay);
  }

  setTimeout(animateNext, 150);
}

function showLoadingIndicator() {
  const messagesContainer = dom.getContainer();
  if (!messagesContainer) return;

  window.inputModule.hide();
  MessagesVisibility.show();
  messagesContainer.className = "column align-center justify-center box-s";

  messagesContainer.innerHTML = `
    <div class="column align-center justify-center padding-xl">
      <div class="background-secondary padding-l radius-l typewriter-container column align-center justify-center transition blur-s" style="width: 72px; height: 72px;">
        <h4 class="typewriter-content opacity-xl"></h4>
        <h4 class="typewriter-extras opacity-xl gap-s"></h4>
      </div>
    </div>
  `;

  // Generic breathing animation
  const container = messagesContainer.querySelector(".typewriter-container");
  if (container) {
    const breathingClasses = [["blur-s"], ["blur-xl", "scale-125"]];
    let state = 0;

    const breathingInterval = setInterval(() => {
      if (!TypewriterState.isActive) {
        dom.removeEffectClasses(container);
        container.classList.add("transition-slow", ...breathingClasses[state]);
        state = 1 - state; // Toggle between 0 and 1
      } else {
        clearInterval(breathingInterval);
      }
    }, 800);

    container._breathingInterval = breathingInterval;
  }
}

function fillIncrementalMessage(content, fileAnalysisInfo = "") {
  const messagesContainer = dom.getContainer();
  const container = messagesContainer?.querySelector(".typewriter-container");
  if (!container) return;

  // Stop breathing and transform to message format
  if (container._breathingInterval) {
    clearInterval(container._breathingInterval);
  }

  dom.removeEffectClasses(container);
  container.classList.remove("column", "align-center", "justify-center");
  container.classList.add("column", "align-start");

  messagesContainer.className = "column align-center justify-center box-s";

  const bubbles = createBubbles(content);

  // Apply message indexing using utility
  dom.addMessageIndex(container.parentElement);
  dom.addMessageIndex(container);

  // All bubbles (whether 1 or many) use the same consistent approach
  fillBubbles(bubbles, fileAnalysisInfo);
}

function fillBubbles(bubbles, fileAnalysisInfo) {
  const messagesContainer = dom.getContainer();
  if (!messagesContainer) return;

  const container = messagesContainer.querySelector(
    ".typewriter-container"
  ).parentElement;
  dom.addMessageIndex(container);

  let currentBubbleIndex = 0;

  function createNextBubble() {
    if (currentBubbleIndex >= bubbles.length) {
      if (fileAnalysisInfo) {
        const lastBubble = container.lastElementChild;
        if (lastBubble) {
          const extrasContainer = document.createElement("h4");
          extrasContainer.className = "opacity-xl gap-s";
          lastBubble.appendChild(extrasContainer);
          animateExtrasSequentially(extrasContainer, fileAnalysisInfo);
        }
      }
      setupMessageEventHandlers(false);
      return;
    }

    const bubble = bubbles[currentBubbleIndex];
    const bubbleContainer = document.createElement("div");
    bubbleContainer.className =
      "background-secondary padding-l radius-m opacity-xl scale-75 transition blur-s";
    dom.addMessageIndex(bubbleContainer);

    const bubbleContent = document.createElement("h4");
    bubbleContainer.appendChild(bubbleContent);

    if (currentBubbleIndex === 0) {
      container.innerHTML = "";
      container.className = "column align-start gap-xs";
    }

    container.appendChild(bubbleContainer);

    setTimeout(() => {
      dom.removeEffectClasses(bubbleContainer);
      bubbleContainer.classList.add("transition");

      setTimeout(() => {
        smartTypewriter(bubbleContent, bubble, {
          onComplete: () => {
            currentBubbleIndex++;
            setTimeout(createNextBubble, 150);
          },
        });
      }, 100);
    }, 25);
  }

  createNextBubble();
}

function hideLoadingIndicator() {
  TypewriterState.cancel();

  const messagesContainer = dom.getContainer();
  if (messagesContainer) {
    MessagesVisibility.hide();
    messagesContainer.innerHTML = "";
  }

  window.inputModule.show();
}

// =================== UTILITY FUNCTIONS ===================

// Chat module state
let messagesContainer = null;
let showAllMessages = false;
let activeMessageIndex = -1;
let chats = []; // Now contains embedded messages: [{ id, title, messages: [...] }]
let activeChatId = null;
let messages = []; // Current active chat's messages (derived from chats)

// Active chat persistence
const ACTIVE_CHAT_ID_KEY = 'activeChatId';



// Initialize chat state from memory
function initChatState() {
  // Load chats from memory (already loaded in memory.js initMemory)
  const chatsFromMemory = window.chat?.getChats() || [];
  
  // Get saved active chat ID from localStorage
  const savedActiveChatId = localStorage.getItem(ACTIVE_CHAT_ID_KEY) || null;
  
  if (chatsFromMemory.length > 0) {
    // Use saved active chat ID if it exists and the chat still exists
    const savedActiveChat = chatsFromMemory.find(c => c.id === savedActiveChatId);
    if (savedActiveChat) {
      activeChatId = savedActiveChatId;
      messages = savedActiveChat.messages || [];
      activeMessageIndex = messages.length - 1;
    } else {
      // Fall back to the most recent chat if saved ID doesn't exist
      const latestChat = chatsFromMemory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
      activeChatId = latestChat.id;
      messages = latestChat.messages || [];
      activeMessageIndex = messages.length - 1;
      // Save this as the new active chat
      localStorage.setItem(ACTIVE_CHAT_ID_KEY, activeChatId || '');
    }
  } else {
    // No chats available
    activeChatId = null;
    messages = [];
    activeMessageIndex = -1;
  }
}

// First-principles DOM utilities
const dom = {
  getContainer: () => messagesContainer,

  removeEffectClasses: (element) => {
    element.className = element.className.replace(
      /\s*(blur-\w+|opacity-\w+|scale-\w+)/g,
      ""
    );
  },

  addMessageIndex: (element, index = null) => {
    const msgIndex = index ?? activeMessageIndex;
    element.setAttribute("data-msg-idx", msgIndex);
    return element;
  },
};

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}



function showError(message) {
  console.error("Error:", message);
}

// Export utilities for global access
window.utils = {
  escapeHtml,
  showError,

  hideElement: (selector) => {
    const element =
      typeof selector === "string"
        ? document.getElementById(selector) || document.querySelector(selector)
        : selector;
    if (element) element.classList.add("hidden");
  },

  removeElement: (selector) => {
    const element =
      typeof selector === "string"
        ? document.getElementById(selector) || document.querySelector(selector)
        : selector;
    if (element) element.remove();
  },

  createElementWithClass: (tag, className, content = "") => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content) element.innerHTML = content;
    return element;
  },
};

function applyContextHighlightingToMessage(content) {
  const tempElement = document.createElement("div");
  tempElement.innerHTML = content;

  window.contextHighlight.highlightContextWords(tempElement);

  return tempElement.innerHTML;
}

function createBubbles(text) {
  const parts = text.split(/([.!?])\s+/).filter((s) => s.trim());
  const bubbles = [];

  for (let i = 0; i < parts.length; i += 2) {
    const content = parts[i] + (parts[i + 1] || "");
    if (content.trim()) bubbles.push(content.trim());
  }

  return bubbles.length > 1 ? bubbles : [text];
}

// =================== MESSAGE CONTENT GENERATORS ===================

function generateFileAnalysisDisplay(fileAnalysisContext) {
  if (!fileAnalysisContext?.analyzedFiles?.length) return "";

  let html = `<div class="column gap-s background-secondary padding-l radius-s gap-m">`;
  html += `<div class="foreground-secondary"><strong>📂 Files Analyzed</strong></div>`;

  fileAnalysisContext.analyzedFiles.forEach((file) => {
    const fileIcon = "📋";
    html += `<div class="row align-center gap-s">`;
    html += `<div>${fileIcon}</div>`;
    html += `<div class="foreground-primary">${applyContextHighlightingToMessage(
      window.utils.escapeHtml(file.title)
    )}</div>`;
    html += `</div>`;
  });

  html += `</div>`;
  return html;
}

// =================== MESSAGE DISPLAY ===================

function addMessageAttributes(html, messageIndex, isShowAllMode) {
  const opacityClass = isShowAllMode
    ? messageIndex === activeMessageIndex
      ? ""
      : "opacity-xs"
    : "";

  if (
    html.includes("background-secondary") ||
    html.includes("background-tertiary")
  ) {
    const classToAdd = opacityClass ? ` ${opacityClass}` : "";
    return html.replace(
      /(<div class="background-(secondary|tertiary)[^"]*")/g,
      `$1${classToAdd}" data-msg-idx="${messageIndex}"`
    );
  }

  const classToAdd = opacityClass ? ` ${opacityClass}` : "";
  let processedHtml = html.replace(/data-msg-idx="[^"]*"/, "");
  return processedHtml.replace(
    /class="([^"]*)"/,
    `class="$1${classToAdd}" data-msg-idx="${messageIndex}"`
  );
}

function renderMessage(message, processedContent, isUser, returnHtml) {
  let mainContent;

  // Simply remove brackets from AI responses, no link conversion
  mainContent = !isUser 
    ? processedContent.replace(/\[([^\]]+)\]/g, '$1')
    : processedContent;

  const fileAnalysisInfo = generateFileAnalysisDisplay(
    message?.fileAnalysisContext || {}
  );

  // Apply context highlighting
  if (!isUser) {
    mainContent = applyContextHighlightingToMessage(mainContent);
  }

  // Check if we should render as bubbles
  if (!isUser && mainContent.includes(".") && !message.artifactIds) {
    const bubbles = createBubbles(mainContent);
    if (bubbles.length > 1) {
      let bubbleHtml = "";
      bubbles.forEach((bubble) => {
        bubbleHtml += `<div class="background-secondary padding-l radius-m transition">
          <h4>${applyContextHighlightingToMessage(bubble)}</h4>
        </div>`;
      });

      if (fileAnalysisInfo) {
        bubbleHtml += fileAnalysisInfo;
      }

      const html = `<div class="column align-start gap-xs">${bubbleHtml}</div>`;
      if (returnHtml) return html;

      // Single batched DOM update instead of multiple innerHTML assignments
      if (messagesContainer) {
        messagesContainer.innerHTML = html;
      }
      return;
    }
  }

  const messageClass = isUser ? "background-tertiary" : "background-secondary";
  const alignment = isUser ? "align-end" : "align-start";
  const allInfo = fileAnalysisInfo;

  const html = `<div class="column ${alignment}"><div class="${messageClass} padding-l radius-m transition">
    <h4>${mainContent}${allInfo}</h4>
  </div></div>`;

  if (returnHtml) return html;

  // Single batched DOM update instead of multiple innerHTML assignments
  if (messagesContainer) {
    messagesContainer.innerHTML = html;
  }
}

// =================== EVENT HANDLING ===================

function animateMessageToggle(callback) {
  const messagesContainer = dom.getContainer();
  if (!messagesContainer) {
    callback();
    return;
  }

  messagesContainer.classList.add("scale-75", "opacity-m");

  setTimeout(() => {
    callback();
    requestAnimationFrame(() => {
      messagesContainer.classList.remove("scale-75", "opacity-m");
    });
  }, 150);
}

function setupMessageEventHandlers(isShowAllMode) {
  const messagesContainer = dom.getContainer();
  if (!messagesContainer) return;

  // Generic click handler factory
  const createToggleHandler = (shouldToggle) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    animateMessageToggle(() => {
      showAllMessages = shouldToggle;
      updateMessagesDisplay();
    });
  };

  Array.from(messagesContainer.querySelectorAll("[data-msg-idx]")).forEach(
    (el) => {
      el.onclick = createToggleHandler(!isShowAllMode);
      el.classList.add("cursor-pointer", "transition", "hover-grow");

      // Add hover blur effect for both single message and show all modes
      el.onmouseenter = () => {
        window.inputModule.blurViews();
      };

      el.onmouseleave = () => {
        window.inputModule.unblurViews();
      };
    }
  );

  setupContextWordHandlers();
}

function setupMessageBubbleHoverEffects() {
  const elements = Array.from(
    dom.getContainer()?.querySelectorAll("[data-msg-idx]") || []
  );
  let hoverEffectTimeout = null;

  // Generic distance-based effect calculator
  const calculateEffects = (distance) => {
    const blurLevels = ["", "blur-xs", "blur-s"];
    const opacityLevels = ["", "opacity-xs", "opacity-s"];

    // Cap the maximum distance effect and make it more gradual
    const cappedDistance = Math.min(distance, 3);
    const blurIntensity = Math.min(
      Math.max(cappedDistance - 1, 0),
      blurLevels.length - 1
    );
    const opacityIntensity = Math.min(
      Math.max(cappedDistance - 2, 0),
      opacityLevels.length - 1
    );

    return [blurLevels[blurIntensity], opacityLevels[opacityIntensity]].filter(
      Boolean
    );
  };

  const applyHoverEffects = (hoveredIndex) => {
    elements.forEach((other, j) => {
      if (hoveredIndex === j) return;

      const distance = Math.abs(hoveredIndex - j);
      const effects = calculateEffects(distance);

      // Add delay based on distance for more gradual effect
      const delay = distance * 50; // 50ms per step away from hovered element

      setTimeout(() => {
        dom.removeEffectClasses(other);
        if (effects.length > 0) {
          other.classList.add(...effects);
        }
      }, delay);
    });
  };

  const clearHoverEffects = () => {
    if (hoverEffectTimeout) {
      clearTimeout(hoverEffectTimeout);
      hoverEffectTimeout = null;
    }
    elements.forEach(dom.removeEffectClasses);
  };

  elements.forEach((el, i) => {
    el.onmouseenter = () => {
      if (hoverEffectTimeout) {
        clearTimeout(hoverEffectTimeout);
      }

      // Add slight delay before starting hover effects
      hoverEffectTimeout = setTimeout(() => {
        applyHoverEffects(i);
      }, 100);
    };

    el.onmouseleave = () => {
      // Add delay to hover out effect to allow bridging gaps between bubbles
      if (hoverEffectTimeout) {
        clearTimeout(hoverEffectTimeout);
      }

      hoverEffectTimeout = setTimeout(() => {
        clearHoverEffects();
      }, 300); // 300ms delay gives time to move to adjacent bubbles
    };
  });
}

function setupContextWordHandlers() {
  const messagesContainer = dom.getContainer();
  if (!messagesContainer) return;

  messagesContainer.addEventListener("click", (e) => {
    // Handle context word clicks
    const span = e.target.closest("span[data-word]");
    if (span) {
      e.preventDefault();
      e.stopPropagation();

      const word = span.getAttribute("data-word");
      if (word) {
        const artifacts = window.artifactsModule?.getCurrentChatArtifacts() || [];
        const viewTypes = window.views?.getAllViews() || [];

        // Check for artifact
        const artifact = artifacts.find(
          (a) => a.title.toLowerCase() === word.toLowerCase()
        );
        if (artifact) {
          window.views?.switchToArtifact(artifact.id);
          return;
        }

        // Check for view (note: getAllViews() uses 'name', not 'title')
        const viewType = viewTypes.find(
          (v) => v.name.toLowerCase() === word.toLowerCase()
        );
        if (viewType) {
          window.views?.switchView(viewType.type);
          return;
        }


      }
    }

    // Handle artifact links
    const artifactLink = e.target.closest("[data-artifact-id]");
    if (artifactLink) {
      e.preventDefault();
      e.stopPropagation();
      const artifactId = artifactLink.getAttribute("data-artifact-id");
      if (artifactId) {
        window.views?.switchToArtifact(artifactId);
      }
    }
  });
}

function setupHoverFunctionality() {
  if (!window.hoverMouseMoveHandler) {
    window.hoverMouseMoveHandler = function (e) {
      if (!messagesContainer) return;

      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
        hoverTimeout = null;
      }

      hoverTimeout = setTimeout(() => {
        checkHoverState(e.clientX, e.clientY);
        hoverTimeout = null;
      }, 1500);
    };

    document.addEventListener("mousemove", window.hoverMouseMoveHandler);
  }
}

function checkHoverState(x, y) {
  if (!dom.getContainer()) return;

  if (MessagesState.isThinking || !MessagesState.hasMessages) {
    return;
  }

  const middleAreaPercent = 0.4;
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;

  const middleAreaLeft = (screenWidth * (1 - middleAreaPercent)) / 2;
  const middleAreaRight = (screenWidth * (1 + middleAreaPercent)) / 2;
  const middleAreaTop = (screenHeight * (1 - middleAreaPercent)) / 2;
  const middleAreaBottom = (screenHeight * (1 + middleAreaPercent)) / 2;

  const isInMiddleArea =
    x >= middleAreaLeft &&
    x <= middleAreaRight &&
    y >= middleAreaTop &&
    y <= middleAreaBottom;
  const isCurrentlyHidden = !MessagesState.isVisible;

  if (isInMiddleArea && isCurrentlyHidden && MessagesState.hasMessages) {
    // Show last message instead of triggering processing
    showMessagesWithEffect();
  } else if (
    !isInMiddleArea &&
    !isCurrentlyHidden &&
    !showAllMessages
  ) {
    hideMessagesWithEffect();
  }
}

function showMessagesWithEffect() {
  const messagesContainer = dom.getContainer();
  if (!messagesContainer || MessagesState.isThinking) return;

  hoverTimeout = setTimeout(() => {
    hoverTimeout = null;
  }, 1000);

  // Show container and add dramatic slow transition
  messagesContainer.classList.remove("hidden");
  messagesContainer.classList.add("transition-slow");
  updateMessagesDisplay();

  // Start completely invisible and heavily blurred using rene classes
  messagesContainer.classList.add("opacity-xl", "blur-xl");

  // Force reflow then transition to visible and sharp
  requestAnimationFrame(() => {
    setTimeout(() => {
      messagesContainer.classList.remove("opacity-xl", "blur-xl");
    }, 50);
  });
}

function hideMessagesWithEffect() {
  const messagesContainer = dom.getContainer();
  if (
    !messagesContainer ||
    MessagesState.isThinking ||
    !MessagesState.hasMessages
  )
    return;

  hoverTimeout = setTimeout(() => {
    hoverTimeout = null;
  }, 1000);

  // Ensure slow transition is active
  messagesContainer.classList.add("transition-slow");

  // Transition to invisible and heavily blurred (reverse of show)
  messagesContainer.classList.add("opacity-xl", "blur-xl");

  // Hide after transition completes
  setTimeout(() => {
    if (messagesContainer && !MessagesState.isThinking) {
      messagesContainer.classList.add("hidden");
      // Clean up rene classes
      messagesContainer.classList.remove("opacity-xl", "blur-xl");
    }
  }, 600); // Match transition-slow duration
}

function handleInputNavigation(direction) {
  const currentIndex = activeMessageIndex;
  const messages = window.chat?.getMessages();

  if (direction === "up" && currentIndex > 0) {
    activeMessageIndex = currentIndex - 1;
    updateMessagesDisplay();
  } else if (direction === "down" && currentIndex < messages.length - 1) {
    activeMessageIndex = currentIndex + 1;
    updateMessagesDisplay();
  }
}

// =================== UI LIFECYCLE MANAGEMENT ===================

function renderMessagesUI() {
  // Initialize input module
  window.inputModule.initialize();

  window.inputModule.onSubmit(() => {
    if (window.processModule && window.processModule.process) {
      window.processModule.process();
    } else {
      console.error(
        "[CHAT] processModule not available. Available modules:",
        Object.keys(window).filter((k) => k.includes("Module"))
      );
      window.utils?.showError?.(
        "Process module not loaded. Please refresh the page."
      );
    }
  });
  window.inputModule.onNavigation(handleInputNavigation);

  // Create messages container
  if (!document.getElementById("messages")) {
    messagesContainer = window.utils.createElementWithClass(
      "div",
      "transition padding-l"
    );
    messagesContainer.id = "messages";
    messagesContainer.style.zIndex = "10000";
    document.body.appendChild(messagesContainer);

    messagesContainer.addEventListener("click", function (e) {
      e.stopPropagation();
    });
  } else {
    messagesContainer = document.getElementById("messages");
  }

  // Add document click listener
  if (!window.messagesDocumentClickHandler) {
    window.messagesDocumentClickHandler = function (e) {
      if (messagesContainer) {
        const wasShowingAll = showAllMessages;
        showAllMessages = false;

        // Remove blur effect if we were showing all messages
        if (wasShowingAll) {
          window.inputModule.unblurViews();
        }

        // Always just hide directly when clicking outside, regardless of previous mode
        hideMessagesWithEffect();
      }
    };
    document.addEventListener("click", window.messagesDocumentClickHandler);
  }

  setupHoverFunctionality();
}

function removeMessagesUI() {
  window.inputModule.destroy();

  window.utils.removeElement("messages");

  if (window.messagesDocumentClickHandler) {
    document.removeEventListener("click", window.messagesDocumentClickHandler);
    window.messagesDocumentClickHandler = null;
  }

  if (window.hoverMouseMoveHandler) {
    document.removeEventListener("mousemove", window.hoverMouseMoveHandler);
    window.hoverMouseMoveHandler = null;
  }

  if (hoverTimeout) {
    clearTimeout(hoverTimeout);
    hoverTimeout = null;
  }

  messagesContainer = null;
}

// =================== MESSAGE MANAGEMENT ===================

function addMessage(role, content, options = {}) {
  const {
    artifactIds = null,
    structuredData = null,
    isIncremental = false,
  } = options;

  const timestamp = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  let chatMessages = window.chat?.getMessages() || [];

  // Generating the unique message id to keep the track
  const userId = localStorage.getItem("userId") || "guest";
  const timePart = Date.now().toString(36);
  const randPart = Math.random().toString(36).slice(2, 8);
  const message_id = `${userId.slice(-4)}_${timePart}_${randPart}`;
  const message = { role, content, timestamp, message_id };
  if (artifactIds !== null) {
    message.artifactIds = artifactIds;
  }
  if (structuredData) {
    message.structuredData = structuredData;
  }

  chatMessages.push(message);
  
  // Update active chat's messages and save
  if (activeChatId) {
    const chatIndex = chats.findIndex(c => c.id === activeChatId);
    if (chatIndex !== -1) {
      chats[chatIndex] = { ...chats[chatIndex], messages: chatMessages };
      messages = chatMessages;
      window.memory?.saveChats(chats);
    }
  }
  activeMessageIndex = chatMessages.length - 1;

  window.inputModule.hide();

  // Handle incremental display for assistant messages
  if (isIncremental && role === "assistant") {
    const mainContent = structuredData ? structuredData.main : content;
    let fileAnalysisInfo = "";

    if (structuredData?.fileAnalysisContext) {
      fileAnalysisInfo = generateFileAnalysisDisplay(
        structuredData.fileAnalysisContext
      );
    }

    fillIncrementalMessage(mainContent, fileAnalysisInfo);
  } else {
    updateMessagesDisplay();
  }
}

function updateMessagesDisplay() {
  const container = dom.getContainer();
  if (!container) return;

  const viewElement = window.views?.getViewElement();
  if (!viewElement) return;

  container.classList.remove("hidden");

  const messages = window.chat?.getMessages();
  if (messages.length === 0) {
    container.innerHTML = "";
    if (window.views?.renderCurrentView) {
      window.views.renderCurrentView();
    }
    return;
  }

  // Normalize message index using first-principles approach
  const normalizeIndex = (index, max) => Math.max(0, Math.min(index, max - 1));
  const currentIndex = normalizeIndex(
    activeMessageIndex,
    messages.length
  );
  activeMessageIndex = currentIndex;

  if (showAllMessages) {
    renderAllMessagesMode();
  } else {
    renderSingleMessageMode();
  }
}

function renderAllMessagesMode() {
  const container = dom.getContainer();
  const messages = window.chat?.getMessages();

  container.className = "column box-m transition gap-xs";
  
  // Store current scroll position before rendering
  const currentScrollTop = container.scrollTop;
  const wasAtBottom = container.scrollHeight > 0 && 
    (container.scrollTop + container.clientHeight >= container.scrollHeight - 10);

  // Generic message processor
  const processMessage = (message, idx) => {
    const processedContent = message.structuredData
      ? message.structuredData.main
      : message.content;
    const isUser = message.role === "user";
    let html = renderMessage(message, processedContent, isUser, true);

    html = addMessageAttributes(html, idx, true);

    if (idx > 0) {
      const wrapperClasses = isUser ? "gap-xs column align-end" : "gap-xs column align-start";
      html = html.replace(/^<div/, `<div class="${wrapperClasses}"`);
    }

    return html;
  };

  const messagesHtml =
    messages.map(processMessage).join("") + '<div class="padding-xl"></div>';

  container.innerHTML = messagesHtml;
  setupMessageEventHandlers(true);
  setupMessageBubbleHoverEffects();

  window.inputModule.blurViews();

  requestAnimationFrame(() => {
    // Only auto-scroll to bottom if:
    // 1. User was already at the bottom before re-render, OR
    // 2. This is the first time showing all messages (no previous scroll position)
    if (wasAtBottom || currentScrollTop === 0) {
      if (container && container.scrollHeight > container.clientHeight) {
        container.scrollTop = container.scrollHeight;
      } else {
        window.scrollTo(0, document.body.scrollHeight);
      }
    } else {
      // Preserve the user's scroll position
      container.scrollTop = currentScrollTop;
    }
  });
}

function renderSingleMessageMode() {
  const container = dom.getContainer();
  const messages = window.chat?.getMessages();
  const activeIndex = activeMessageIndex;

  container.className = "column align-center justify-center box-s transition";

  // Generic assistant message finder
  const findDisplayMessage = (startIndex) => {
    const message = messages[startIndex];

    if (message.role === "assistant") {
      return { message, index: startIndex };
    }

    // Find next assistant message
    for (let i = startIndex + 1; i < messages.length; i++) {
      if (messages[i].role === "assistant") {
        return { message: messages[i], index: i };
      }
    }

    return null;
  };

  const result = findDisplayMessage(activeIndex);
  if (!result) {
    container.innerHTML = "";
    return;
  }

  const { message: messageToDisplay, index: indexToDisplay } = result;
  const processedContent = messageToDisplay.structuredData
    ? messageToDisplay.structuredData.main
    : messageToDisplay.content;
  const isUser = messageToDisplay.role === "user";
  let html = renderMessage(messageToDisplay, processedContent, isUser, true);

  html = addMessageAttributes(html, indexToDisplay, false);
  container.innerHTML = html;

  setupMessageEventHandlers(false);
  window.inputModule.unblurViews();
}

// =================== PUBLIC API ===================

// Export combined chat and messages functions
window.chat = {
  // Chat management
  create,
  switchChat,
  rename,
  setDescription,
  deleteChat,
  // State management
  initChatState,
  // State getters
  getChats: () => chats,
  getActiveChatId: () => activeChatId,
  getMessages: () => messages,
  // Message UI lifecycle
  renderMessagesUI,
  removeMessagesUI,
  updateMessagesDisplay,
  // Message management
  addMessage,
  // Loading states
  showLoadingIndicator,
  hideLoadingIndicator,
};

// =================== Auto-Initialization ===================
// Chat initialization is handled by user.js auth state changes
// This ensures proper order: auth → memory → chat
window.addEventListener('load', function() {
  console.log('[CHAT] Chat system ready');
});
