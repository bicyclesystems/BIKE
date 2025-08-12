// =================== INPUT MODULE ===================
// This module handles user input from typing to AI response orchestration
// Organized in 4 conceptual sections: Interface → Processing → AI Communication → Coordination

// =================== INPUT INTERFACE ===================
// Everything about the visual input experience: DOM, UI, events, animations

class InputManager {
  constructor() {
    this.inputElement = null;
    this.inputContainer = null;
    this.highlightTimeout = null;
    this.submitCallback = null;
    this.changeCallback = null;
    this.navigationCallback = null;
    this.isInitialized = false;
    this.globalKeyboardEnabled = true; // Flag to enable/disable global keyboard
    this.animatedWords = new Set(); // Track words that have already been animated
    this.placeholderTimeout = null; // Track placeholder animation
    this.isShowingPlaceholder = false; // Track placeholder state
    this.placeholderText = "say something";
  }

  // =================== Lifecycle Management ===================

  initialize() {
    if (this.isInitialized) return;
    
    this.createInputElements();
    this.setupEventListeners();
    this.setupGlobalKeyboardListener();
    this.setupMessageHandler();
    this.isInitialized = true;
  }

  destroy() {
    window.utils.removeElement('input-container');
    
    this.inputElement = null;
    this.inputContainer = null;
    this.isInitialized = false;
  }

  // =================== DOM Element Management ===================

  createInputElements() {
    // Create input container if it doesn't exist
    if (!document.getElementById('input-container')) {
      const inputContainer = window.utils.createElementWithClass('div', 'transition hidden');
      inputContainer.id = 'input-container';
      
      // Positioning styles must stay inline (no Renée equivalent for fixed centering)
      inputContainer.style.cssText = 'position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 99999;';
      
      const input = document.createElement('h1');
      input.id = 'input';
      input.contentEditable = 'true';
      input.setAttribute('aria-label', 'Message input');
      
      // Remove browser outline (necessary for contentEditable)
      input.style.outline = 'none';
      
      inputContainer.appendChild(input);
      document.body.appendChild(inputContainer);
    }
    
    this.inputContainer = document.getElementById('input-container');
    this.inputElement = document.getElementById('input');
  }

  // Dynamic DOM elements (no caching to avoid stale references during view switching)
  get viewElement() {
    return window.context?.getViewElement() || document.getElementById('view');
  }

  // =================== Visibility & Animation Management ===================

  // Efficient focus state methods using Renée classes
  blurViews() { 
    if (!this.viewElement) return;
    this.viewElement.classList.add('opacity-xs', 'blur-m', 'transition-slow');
  }
  
  unblurViews() { 
    if (!this.viewElement) return;
    this.viewElement.classList.remove('opacity-xs', 'blur-m', 'blur-s', 'blur-l', 'blur-xl');
  }
  
  blurInput() { 
    if (!this.inputElement) return;
    this.inputElement.classList.add('opacity-xs', 'blur-s', 'transition-slow');
  }
  
  unblurInput() { 
    if (!this.inputElement) return;
    this.inputElement.classList.remove('opacity-xs', 'blur-s', 'blur-m', 'blur-l', 'blur-xl');
  }

  show() {
    // Hide messages when showing input
    const container = window.context?.getMessagesContainer();
    if (container) {
      container.innerHTML = '';
    }
    if (this.inputContainer) {
      // Show input using Renée classes and reset all states
      this.inputContainer.classList.remove('opacity-xl', 'hidden', 'scale-50', 'blur-l', 'blur-m', 'blur-s');
      this.inputContainer.style.pointerEvents = ''; // Reset pointer events
      
      // Blur the views when input is shown, but keep input focused
      this.blurViews();
      
      if (this.inputElement) {
        this.inputElement.focus();
        // Start placeholder animation if input is empty
        if (!this.getText()) {
          this.startPlaceholderAnimation();
        }
      }
    }
  }

  hide() {
    if (this.inputContainer) {
      // Stop placeholder animation
      this.stopPlaceholderAnimation();
      
      // Clear the input text when hiding
      this.clear();
      
      // Remove blur from both views and input when input is hidden
      this.unblurViews();
      this.unblurInput();
      
      // Hide using Renée classes and reset all animation states
      this.inputContainer.classList.add('hidden');
      this.inputContainer.classList.remove('opacity-xl', 'scale-50', 'blur-l', 'blur-m', 'blur-s');
      this.inputContainer.style.pointerEvents = ''; // Reset pointer events
    }
  }

  toggle() {
    if (this.isVisible()) {
      this.hide();
    } else {
      this.show();
    }
  }

  playSubmitAnimation() {
    return new Promise((resolve) => {
      if (!this.inputContainer) {
        resolve();
        return;
      }

      // Apply animation styling using Renée classes and minimal inline styles
      this.inputContainer.classList.add('opacity-xl', 'scale-50', 'blur-l', 'transition');
      this.inputContainer.style.pointerEvents = 'none';

      // Wait for animation to complete
      const animationDuration = 400; // matches CSS transition duration
      setTimeout(() => {
        this.hide(); // Now hide after animation
        resolve();
      }, animationDuration);
    });
  }

  isVisible() {
    return this.inputContainer && !this.inputContainer.classList.contains('hidden');
  }

  // =================== Content Management ===================

  clear() {
    if (this.inputElement) {
      this.inputElement.innerText = '';
    }
    // Reset animated words when input is cleared
    this.animatedWords.clear();
    // Stop placeholder animation
    this.stopPlaceholderAnimation();
  }

  getText() {
    return this.inputElement ? this.inputElement.innerText.trim() : '';
  }

  focus() {
    if (this.inputElement) {
      this.inputElement.focus();
    }
  }

  blur() {
    if (this.inputElement) {
      this.inputElement.blur();
    }
  }

  // =================== Placeholder Animation System ===================

  startPlaceholderAnimation() {
    if (this.isShowingPlaceholder || !this.inputElement) return;
    
    this.isShowingPlaceholder = true;
    this.inputElement.innerText = this.placeholderText;
    this.inputElement.style.color = 'var(--color-secondary-foreground)'; // Keep for semantic color
    this.inputElement.classList.add('opacity-xl');
    
    this.setCursorAtEnd();
    this.fadeInPlaceholder();
    
    // Start deletion sequence after delay
    this.placeholderTimeout = setTimeout(() => {
      this.deletePlaceholderLetters();
    }, 400);
  }

  fadeInPlaceholder() {
    if (!this.isShowingPlaceholder || !this.inputElement) return;
    
    // Remove low opacity and add fade-in animation
    this.inputElement.classList.remove('opacity-xl');
    this.inputElement.classList.add('fade-in', 'duration-slow', 'ease-out', 'once');
  }

  deletePlaceholderLetters() {
    if (!this.isShowingPlaceholder || !this.inputElement) return;
    
    const currentText = this.inputElement.innerText;
    if (currentText.length > 0) {
      this.inputElement.innerText = currentText.slice(0, -1);
      this.placeholderTimeout = setTimeout(() => {
        this.deletePlaceholderLetters();
      }, 30);
    } else {
      this.resetPlaceholderState();
    }
  }

  stopPlaceholderAnimation() {
    if (this.placeholderTimeout) {
      clearTimeout(this.placeholderTimeout);
      this.placeholderTimeout = null;
    }
    this.resetPlaceholderState();
  }

  resetPlaceholderState() {
    this.isShowingPlaceholder = false;
    if (this.inputElement) {
      // Remove all placeholder-related classes and styles
      this.inputElement.classList.remove(
        'opacity-xl', 'fade-in', 'duration-slow', 'ease-out', 'once'
      );
      this.inputElement.style.color = ''; // Reset to default color
      // Clear placeholder text if it's still there
      if (this.inputElement.innerText === this.placeholderText) {
        this.inputElement.innerText = '';
      }
    }
  }

  setCursorAtEnd() {
    if (!this.inputElement) return;
    try {
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(this.inputElement);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {
      // Ignore cursor placement errors
    }
  }

  // =================== Event System ===================

  // Event callback setters
  onSubmit(callback) {
    this.submitCallback = callback;
  }

  onChange(callback) {
    this.changeCallback = callback;
  }

  onNavigation(callback) {
    this.navigationCallback = callback;
  }

  // Global keyboard controls
  enableGlobalKeyboard() {
    this.globalKeyboardEnabled = true;
  }

  disableGlobalKeyboard() {
    this.globalKeyboardEnabled = false;
  }

  isGlobalKeyboardEnabled() {
    return this.globalKeyboardEnabled;
  }

  // =================== Event Listeners Setup ===================

  setupEventListeners() {
    if (!this.inputElement || !this.inputContainer) return;

    // Right-click to show input (logged out) or trigger processing (logged in)
    document.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      
      // Check if user is logged in
      const session = window.user?.getActiveSession();
      const isLoggedIn = !!session;
      
      if (isLoggedIn) {
        // Logged in mode: trigger processing
        if (window.processModule?.process) {
          window.processModule.process();
        } else if (window.process) {
          window.process();
        } else {
          console.warn('[INPUT] Process function not available');
        }
      } else {
        // Logged out mode: show input with "write something" animation
        this.show();
      }
    });

    // Click outside to hide input
    document.addEventListener('mousedown', (e) => {
      if (this.inputContainer && 
          this.isVisible() && 
          !this.inputContainer.contains(e.target)) {
        this.hide();
      }
    });

    // Hover effects for input container
    this.inputContainer.addEventListener('mouseenter', () => {
      if (this.isVisible()) {
        this.unblurInput();
        this.blurViews();
      }
    });

    this.inputContainer.addEventListener('mouseleave', () => {
      if (this.isVisible()) {
        this.blurInput();
        this.unblurViews();
      }
    });

    // Input keyboard navigation and sending
    this.inputElement.addEventListener('keydown', (e) => {
      // Handle message navigation
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.navigationCallback) {
          this.navigationCallback('up');
        }
        return;
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.navigationCallback) {
          this.navigationCallback('down');
        }
        return;
      }

      // Handle message sending
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (this.submitCallback) {
          // Start animation and call submit callback
          this.playSubmitAnimation();
          this.submitCallback();
        }
      }

      // Handle escape to hide input
      if (e.key === 'Escape') {
        e.preventDefault();
        this.hide();
      }
    });

    // Real-time word highlighting on input
    this.inputElement.addEventListener('input', () => {
      // If placeholder is showing, clear it immediately and preserve only the newly typed content
      if (this.isShowingPlaceholder) {
        this.stopPlaceholderAnimation();
        // Get the current content which includes both placeholder and new input
        const currentContent = this.inputElement.innerText;
        // Clear everything and let the user's new input naturally appear
        this.inputElement.innerText = '';
        // The browser will automatically insert the user's typed character
      }
      
      // Check if input became empty and hide it (simple approach)
      const currentText = this.getText();
      if (currentText === '' && this.isVisible()) {
        this.hide();
        return;
      }
      
      // Debounce the highlighting to avoid excessive updates and animations
      clearTimeout(this.highlightTimeout);
      this.highlightTimeout = setTimeout(() => {
        this.highlightContextWords();
        
        if (this.changeCallback) {
          this.changeCallback();
        }
      }, 150);
    });

    // Enhanced paste handler that checks for files
    this.inputElement.addEventListener('paste', (e) => {
      const clipboardData = e.clipboardData || window.clipboardData;
      

      // Original paste behavior for text/context
      setTimeout(() => {
        this.highlightContextWords();
        
        if (this.changeCallback) {
          this.changeCallback();
        }
      }, 10);
    });
  }

  setupMessageHandler() {
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'showInput') {
        this.show();
      } else if (event.data && event.data.type === 'hideInput') {
        this.hide();
      }
    });
  }

  setupGlobalKeyboardListener() {
    document.addEventListener('keydown', (e) => {
      // Don't trigger if input is already visible and focused
      if (this.isVisible() && document.activeElement === this.inputElement) {
        return;
      }

      // Don't trigger if global keyboard is disabled
      if (!this.globalKeyboardEnabled) {
        return;
      }

      // Don't trigger for modifier keys, function keys, or special keys
      if (e.ctrlKey || e.metaKey || e.altKey || 
          e.key.startsWith('F') || // F1, F2, etc.
          e.key === 'Tab' || 
          e.key === 'Escape' || 
          e.key === 'Enter' ||
          e.key.startsWith('Arrow') ||
          e.key === 'Shift' ||
          e.key === 'Control' ||
          e.key === 'Alt' ||
          e.key === 'Meta' ||
          e.key === 'CapsLock' ||
          e.key === 'NumLock' ||
          e.key === 'ScrollLock' ||
          e.key === 'Insert' ||
          e.key === 'Delete' ||
          e.key === 'Home' ||
          e.key === 'End' ||
          e.key === 'PageUp' ||
          e.key === 'PageDown') {
        return;
      }

      // Don't trigger if we're typing in another input/textarea/contenteditable
      const activeElement = document.activeElement;
      if (activeElement && (
          activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.contentEditable === 'true'
        )) {
        return;
      }

      // For printable characters, show input and let the character through
      if (e.key.length === 1) {
        this.show();
        // Clear placeholder for new user input
        if (this.isShowingPlaceholder) {
          this.stopPlaceholderAnimation();
          this.inputElement.innerText = '';
        }
        // The character will naturally appear in the input since we're focusing it
        // We don't prevent default here so the character gets typed
      }
    });
  }


  // =================== INPUT PROCESSING ===================
  // Everything about understanding and analyzing what the user typed

  getProcessedInput() {
    const rawInput = this.getText();
    if (!rawInput) return { cleanText: '', references: [], originalText: rawInput };
    
    try {
      // Use context highlight module for processing
      const { cleanText, references } = window.contextHighlight ? 
        window.contextHighlight.extractContextReferences(this.inputElement) : 
        { cleanText: rawInput, references: [] };
      return { cleanText, references, originalText: rawInput };
    } catch (error) {
      console.error('Error in getProcessedInput:', error);
      return { cleanText: rawInput, references: [], originalText: rawInput };
    }
  }

  // =================== Context Analysis & Highlighting ===================

  highlightContextWords() {
    // Delegate to context highlight module
    if (window.contextHighlight && window.contextHighlight.highlightContextWords) {
      window.contextHighlight.highlightContextWords(this.inputElement);
    }
  }


}



// =================== INPUT MODULE INSTANCE & PUBLIC API ===================

const inputManager = new InputManager();

// =================== Public API ===================

window.inputModule = {
  // Core methods
  initialize: () => inputManager.initialize(),
  destroy: () => inputManager.destroy(),
  
  // Visibility
  show: () => inputManager.show(),
  hide: () => inputManager.hide(),
  toggle: () => inputManager.toggle(),
  isVisible: () => inputManager.isVisible(),
  playSubmitAnimation: () => inputManager.playSubmitAnimation(),
  
  // Content
  clear: () => inputManager.clear(),
  getText: () => inputManager.getText(),
  getProcessedInput: () => inputManager.getProcessedInput(),
  
  // State
  focus: () => inputManager.focus(),
  blur: () => inputManager.blur(),
  
  // Blur helpers (shared with other modules)
  blurViews: () => inputManager.blurViews(),
  unblurViews: () => inputManager.unblurViews(),
  
  // Global keyboard controls
  enableGlobalKeyboard: () => inputManager.enableGlobalKeyboard(),
  disableGlobalKeyboard: () => inputManager.disableGlobalKeyboard(),
  isGlobalKeyboardEnabled: () => inputManager.isGlobalKeyboardEnabled(),
  
  // Event callbacks
  onSubmit: (callback) => inputManager.onSubmit(callback),
  onChange: (callback) => inputManager.onChange(callback),
  onNavigation: (callback) => inputManager.onNavigation(callback),
  
  // Utilities
  highlightContextWords: () => inputManager.highlightContextWords(),
  stopPlaceholderAnimation: () => inputManager.stopPlaceholderAnimation(),
  
  // Legacy send function - now delegates to processModule
  send: () => {
    if (window.processModule && window.processModule.process) {
      window.processModule.process();
    } else {
      console.error('[INPUT] processModule not available');
    }
  }
}; 