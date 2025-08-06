// =================== JAVASCRIPT UTILITIES ===================
// Common utility functions for DOM manipulation, local storage, 
// animations, and data management that can be reused across projects

/**
 * DOM Utilities
 */
const DOM = {
  // Element selection shortcuts
  $(selector) {
    return document.querySelector(selector);
  },

  $$(selector) {
    return document.querySelectorAll(selector);
  },

  // Element creation with attributes
  create(tag, attributes = {}, textContent = '') {
    const element = document.createElement(tag);
    
    Object.entries(attributes).forEach(([key, value]) => {
      if (key === 'className') {
        element.className = value;
      } else if (key === 'innerHTML') {
        element.innerHTML = value;
      } else {
        element.setAttribute(key, value);
      }
    });
    
    if (textContent) {
      element.textContent = textContent;
    }
    
    return element;
  },

  // Event delegation helper
  on(parent, event, selector, handler) {
    parent.addEventListener(event, (e) => {
      if (e.target.matches(selector)) {
        handler(e);
      }
    });
  },

  // Toggle visibility
  toggle(element, show = null) {
    if (show === null) {
      element.style.display = element.style.display === 'none' ? '' : 'none';
    } else {
      element.style.display = show ? '' : 'none';
    }
  },

  // Add/remove classes with animation support
  fadeIn(element, duration = 300) {
    element.style.opacity = '0';
    element.style.display = '';
    element.style.transition = `opacity ${duration}ms`;
    
    requestAnimationFrame(() => {
      element.style.opacity = '1';
    });
  },

  fadeOut(element, duration = 300) {
    element.style.transition = `opacity ${duration}ms`;
    element.style.opacity = '0';
    
    setTimeout(() => {
      element.style.display = 'none';
    }, duration);
  }
};

/**
 * Local Storage Utilities
 */
const Storage = {
  // Get item with optional default value
  get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      return item !== null ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.warn(`Error parsing localStorage item "${key}":`, error);
      return defaultValue;
    }
  },

  // Set item (automatically stringifies objects)
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn(`Error setting localStorage item "${key}":`, error);
      return false;
    }
  },

  // Remove item
  remove(key) {
    localStorage.removeItem(key);
  },

  // Check if key exists
  has(key) {
    return localStorage.getItem(key) !== null;
  },

  // Clear all storage or specific prefix
  clear(prefix = null) {
    if (prefix) {
      Object.keys(localStorage)
        .filter(key => key.startsWith(prefix))
        .forEach(key => localStorage.removeItem(key));
    } else {
      localStorage.clear();
    }
  }
};

/**
 * Animation Utilities
 */
const Animation = {
  // Smooth scroll to element or position
  scrollTo(target, options = {}) {
    const defaultOptions = {
      behavior: 'smooth',
      block: 'start',
      ...options
    };

    if (typeof target === 'string') {
      const element = document.querySelector(target);
      if (element) {
        element.scrollIntoView(defaultOptions);
      }
    } else if (typeof target === 'number') {
      window.scrollTo({
        top: target,
        behavior: defaultOptions.behavior
      });
    } else if (target instanceof Element) {
      target.scrollIntoView(defaultOptions);
    }
  },

  // Bounce animation
  bounce(element, duration = 600) {
    element.style.animation = `bounce ${duration}ms ease-in-out`;
    setTimeout(() => {
      element.style.animation = '';
    }, duration);
  },

  // Shake animation
  shake(element, duration = 600) {
    element.style.animation = `shake ${duration}ms ease-in-out`;
    setTimeout(() => {
      element.style.animation = '';
    }, duration);
  },

  // Pulse animation
  pulse(element, duration = 1000) {
    element.style.animation = `pulse ${duration}ms ease-in-out`;
    setTimeout(() => {
      element.style.animation = '';
    }, duration);
  },

  // Staggered animation for multiple elements
  stagger(elements, animationFn, delay = 100) {
    elements.forEach((element, index) => {
      setTimeout(() => {
        animationFn(element);
      }, index * delay);
    });
  }
};

/**
 * Data Management Utilities
 */
const Data = {
  // Generate unique ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  },

  // Deep clone object
  clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  },

  // Check if object is empty
  isEmpty(obj) {
    return Object.keys(obj).length === 0;
  },

  // Merge objects deeply
  merge(target, ...sources) {
    if (!sources.length) return target;
    const source = sources.shift();

    if (this.isObject(target) && this.isObject(source)) {
      for (const key in source) {
        if (this.isObject(source[key])) {
          if (!target[key]) Object.assign(target, { [key]: {} });
          this.merge(target[key], source[key]);
        } else {
          Object.assign(target, { [key]: source[key] });
        }
      }
    }

    return this.merge(target, ...sources);
  },

  // Check if value is object
  isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  },

  // Debounce function
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  // Throttle function
  throttle(func, limit) {
    let inThrottle;
    return function() {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },

  // Format date nicely
  formatDate(date, format = 'relative') {
    const d = new Date(date);
    const now = new Date();
    
    if (format === 'relative') {
      const diff = now - d;
      const seconds = Math.floor(diff / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      
      if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
      if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
      if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
      return 'Just now';
    }
    
    return d.toLocaleDateString();
  },

  // Validate email
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  // Truncate text
  truncate(text, length = 100, suffix = '...') {
    if (text.length <= length) return text;
    return text.substr(0, length) + suffix;
  }
};

/**
 * CSS Utilities
 */
const CSS = {
  // Add required CSS animations if not present
  addAnimations() {
    if (document.getElementById('utils-animations')) return;
    
    const style = document.createElement('style');
    style.id = 'utils-animations';
    style.textContent = `
      @keyframes bounce {
        0%, 20%, 53%, 80%, 100% { transform: translate3d(0,0,0); }
        40%, 43% { transform: translate3d(0,-20px,0); }
        70% { transform: translate3d(0,-10px,0); }
        90% { transform: translate3d(0,-4px,0); }
      }
      
      @keyframes shake {
        0%, 100% { transform: translate3d(0, 0, 0); }
        10%, 30%, 50%, 70%, 90% { transform: translate3d(-5px, 0, 0); }
        20%, 40%, 60%, 80% { transform: translate3d(5px, 0, 0); }
      }
      
      @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); }
      }
      
      .fade-in {
        animation: fadeIn 0.3s ease-in;
      }
      
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
};

/**
 * Form Utilities
 */
const Form = {
  // Serialize form data to object
  serialize(form) {
    const formData = new FormData(form);
    const data = {};
    
    for (let [key, value] of formData.entries()) {
      if (data[key]) {
        // Handle multiple values (checkboxes, etc.)
        if (Array.isArray(data[key])) {
          data[key].push(value);
        } else {
          data[key] = [data[key], value];
        }
      } else {
        data[key] = value;
      }
    }
    
    return data;
  },

  // Validate form fields
  validate(form, rules = {}) {
    const errors = {};
    const data = this.serialize(form);
    
    Object.entries(rules).forEach(([field, rule]) => {
      const value = data[field];
      
      if (rule.required && (!value || value.trim() === '')) {
        errors[field] = rule.message || `${field} is required`;
      } else if (value && rule.pattern && !rule.pattern.test(value)) {
        errors[field] = rule.message || `${field} is invalid`;
      } else if (value && rule.minLength && value.length < rule.minLength) {
        errors[field] = rule.message || `${field} must be at least ${rule.minLength} characters`;
      }
    });
    
    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }
};

// Initialize animations on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => CSS.addAnimations());
} else {
  CSS.addAnimations();
}

// Export utilities for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DOM, Storage, Animation, Data, CSS, Form };
}

// Global availability
window.Utils = { DOM, Storage, Animation, Data, CSS, Form };

console.log('🔧 JavaScript Utilities loaded successfully!');