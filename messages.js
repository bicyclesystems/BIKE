// =================== MESSAGES MODULE ===================
// Handles all message display, user input, and conversation UI functionality
// Main sections: Configuration → State Management → Typewriter System → Message Display → Event Handling → Public API

// =================== CONFIGURATION ===================

window.API_KEY = window.API_KEY || "";

// =================== STATE MANAGEMENT ===================

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
    const messages = window.context?.getMessages();
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
      <div class="background-secondary padding-l radius-m typewriter-container column align-center justify-center transition blur-s">
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

  if (bubbles.length > 1) {
    fillMultipleBubbles(bubbles, fileAnalysisInfo);
  } else {
    const contentElement = container.querySelector(".typewriter-content");
    const extrasElement = container.querySelector(".typewriter-extras");

    if (contentElement) {
      contentElement.classList.remove("opacity-xl");

      smartTypewriter(contentElement, content, {
        onComplete: () => {
          if (extrasElement && fileAnalysisInfo) {
            animateExtrasSequentially(extrasElement, fileAnalysisInfo);
          }
          setupMessageEventHandlers(false);
        },
      });
    }
  }
}

function fillMultipleBubbles(bubbles, fileAnalysisInfo) {
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

// First-principles DOM utilities
const dom = {
  getContainer: () => window.context?.getMessagesContainer(),

  removeEffectClasses: (element) => {
    element.className = element.className.replace(
      /\s*(blur-\w+|opacity-\w+|scale-\w+)/g,
      ""
    );
  },

  addMessageIndex: (element, index = null) => {
    const msgIndex = index ?? window.context?.getActiveMessageIndex();
    element.setAttribute("data-msg-idx", msgIndex);
    return element;
  },

  createBreathingElement: () => {
    const element = document.createElement("div");
    element.className =
      "background-secondary padding-l radius-m typewriter-container column align-center justify-center transition blur-s";
    return element;
  },
};

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function getDomainFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return url;
  }
}

function showError(message) {
  console.error("Error:", message);
}

// Export utilities for global access
window.utils = {
  escapeHtml,
  getDomainFromUrl,
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

function getFaviconHtml(artifact) {
  if (artifact?.type === "link" && artifact.versions?.length > 0) {
    const url = artifact.versions[artifact.versions.length - 1].content.trim();
    const faviconUrl = window.artifactsModule.getFaviconUrl(url);
    return faviconUrl
      ? `<img src="${faviconUrl}" alt="favicon" onerror="this.classList.add('hidden')"> `
      : "";
  }
  return "";
}

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
    const fileIcon = file.type === "files" ? "📄" : "📋";
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
    ? messageIndex === window.context?.getActiveMessageIndex()
      ? ""
      : "opacity-s"
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

  if (!isUser && message.artifactIds) {
    // Convert [bracketed] references to clickable links
    mainContent = processedContent.replace(/\[([^\]]+)\]/g, (match, title) => {
      const artifactId = message.artifactIds[title];
      if (artifactId) {
        const artifact = window.context?.getArtifact(artifactId);
        if (artifact) {
          const favicon = getFaviconHtml(artifact);
          return `${favicon}<a href="#" data-artifact-id="${artifactId}" class="color-primary transition">${window.utils.escapeHtml(
            title
          )}</a>`;
        }
      }
      return match;
    });
  } else {
    mainContent = processedContent;
  }

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
      const messagesContainer = window.context?.getMessagesContainer();
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
  const messagesContainer = window.context?.getMessagesContainer();
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
      window.context?.setShowAllMessages(shouldToggle);
      updateMessagesDisplay();
    });
  };

  Array.from(messagesContainer.querySelectorAll("[data-msg-idx]")).forEach(
    (el) => {
      el.onclick = createToggleHandler(!isShowAllMode);
      el.classList.add("cursor-pointer", "transition", "hover-grow");

      // Add hover blur effect for single message mode
      if (!isShowAllMode) {
        el.onmouseenter = () => {
          window.inputModule.blurViews();
        };

        el.onmouseleave = () => {
          window.inputModule.unblurViews();
        };
      }
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
        const artifacts = window.context?.getCurrentChatArtifacts() || [];
        const viewTypes = window.context.getViewTypes();

        // Check for artifact
        const artifact = artifacts.find(
          (a) => a.title.toLowerCase() === word.toLowerCase()
        );
        if (artifact) {
          window.context.setActiveArtifactId(artifact.id);
          return;
        }

        // Check for view
        const viewType = viewTypes.find(
          (v) => v.title.toLowerCase() === word.toLowerCase()
        );
        if (viewType) {
          window.context.setActiveView(viewType.type);
          return;
        }

        // Check for action
        const action = Object.values(window.actions.ACTIONS_REGISTRY).find(
          (a) =>
            a.name.toLowerCase() === word.toLowerCase() ||
            a.id.toLowerCase().includes(word.toLowerCase()) ||
            a.name.toLowerCase().includes(word.toLowerCase())
        );
        if (action) {
          window.actions.executeAction(action.id);
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
        window.context.setActiveArtifactId(artifactId);
      }
    }
  });
}

function setupHoverFunctionality() {
  if (!window.hoverMouseMoveHandler) {
    window.hoverMouseMoveHandler = function (e) {
      if (!window.context?.getMessagesContainer()) return;

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
    !window.context?.getShowAllMessages()
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

  messagesContainer.classList.remove("hidden");
  messagesContainer.classList.add("opacity-xl", "blur-l");
  updateMessagesDisplay();

  requestAnimationFrame(() => {
    MessagesVisibility.show();
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

  MessagesVisibility.fadeOut();

  setTimeout(() => {
    if (messagesContainer && !MessagesState.isThinking) {
      MessagesVisibility.hide();
    }
  }, 300);
}

function handleInputNavigation(direction) {
  const currentIndex = window.context.getActiveMessageIndex();
  const messages = window.context.getMessages();

  if (direction === "up" && currentIndex > 0) {
    window.context.setActiveMessageIndex(currentIndex - 1);
    updateMessagesDisplay();
  } else if (direction === "down" && currentIndex < messages.length - 1) {
    window.context.setActiveMessageIndex(currentIndex + 1);
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
        "[MESSAGES] processModule not available. Available modules:",
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
    const messagesContainer = window.utils.createElementWithClass(
      "div",
      "transition padding-l"
    );
    messagesContainer.id = "messages";
    messagesContainer.style.zIndex = "10000";
    document.body.appendChild(messagesContainer);

    messagesContainer.addEventListener("click", function (e) {
      e.stopPropagation();
    });
  }

  window.context.setMessagesContainer(document.getElementById("messages"));

  // Add document click listener
  if (!window.messagesDocumentClickHandler) {
    window.messagesDocumentClickHandler = function (e) {
      if (window.context.getMessagesContainer()) {
        const wasShowingAll = window.context.getShowAllMessages();
        window.context.setShowAllMessages(false);

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

  window.context.setMessagesContainer(null);
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
  let messages =
    window.context.getMessagesByChat()[window.context.getActiveChatId()] || [];

  // Generating the unique message id to keep the track
  const userId = localStorage.getItem("userId") || "guest";
  const timePart = Date.now().toString(36);
  const randPart = Math.random().toString(36).slice(2, 8);
  const message_id = `${userId.slice(-4)}_${timePart}_${randPart}`;
  const message = { role, content, timestamp, message_id };

  // Only add extra fields if NOT in collaboration mode
  const isCollaborating =
    window.collaboration && window.collaboration.isCollaborating;
  if (!isCollaborating) {
    if (artifactIds !== null) {
      message.artifactIds = artifactIds;
    }
    if (structuredData) {
      message.structuredData = structuredData;
    }
  } else {
  }

  messages.push(message);
  window.context.setActiveMessages(messages);
  window.context.setActiveMessageIndex(messages.length - 1);

  // --- COLLABORATION SYNC ---
  if (window.collaboration && window.collaboration.pushMessageToCollab) {
    const chatId = window.context.getActiveChatId();
    if (chatId && !message.chatId) message.chatId = chatId;
    window.collaboration.pushMessageToCollab(message);
  }
  // --- END COLLABORATION SYNC ---

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

  const viewElement = window.context.getViewElement();
  if (!viewElement)
    window.context.setViewElement(document.getElementById("view"));

  container.classList.remove("hidden");

  const messages = window.context.getMessages();
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
    window.context.getActiveMessageIndex(),
    messages.length
  );
  window.context.setActiveMessageIndex(currentIndex);

  if (window.context.getShowAllMessages()) {
    renderAllMessagesMode();
  } else {
    renderSingleMessageMode();
  }
}

function renderAllMessagesMode() {
  const container = dom.getContainer();
  const messages = window.context.getMessages();

  container.className = "column box-m transition gap-xs";

  // Generic message processor
  const processMessage = (message, idx) => {
    const processedContent = message.structuredData
      ? message.structuredData.main
      : message.content;
    const isUser = message.role === "user";
    let html = renderMessage(message, processedContent, isUser, true);

    html = addMessageAttributes(html, idx, true);

    if (idx > 0) {
      const wrapperClasses = isUser ? "gap-xs row justify-end" : "gap-xs row";
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
    if (container && container.scrollHeight > container.clientHeight) {
      container.scrollTop = container.scrollHeight;
    } else {
      window.scrollTo(0, document.body.scrollHeight);
    }
  });
}

function renderSingleMessageMode() {
  const container = dom.getContainer();
  const messages = window.context.getMessages();
  const activeIndex = window.context.getActiveMessageIndex();

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

window.messages = {
  // Core lifecycle
  renderMessagesUI,
  removeMessagesUI,
  updateMessagesDisplay,

  // Message management (unified interface)
  addMessage,

  // Loading states
  showLoadingIndicator,
  hideLoadingIndicator,
};
