// Theme Management System
// Simple light/dark/system theme switching
// 
// Color Variables:
// Semantic color variables are dynamically injected here for consistent theming

// Color definitions for light and dark themes
const THEME_COLORS = {
  light: {
    'color-blue': '#1e40af',
    'color-purple': '#7c3aed',
    'color-violet': '#8b5cf6',
    'color-orange-red': '#ea580c',
    'color-orange': '#d97706',
    'color-gold': '#ca8a04',
    'color-dark-green': '#047857'
  },
  dark: {
    'color-blue': '#3b82f6',
    'color-purple': '#a855f7',
    'color-violet': '#a78bfa',
    'color-orange-red': '#f97316',
    'color-orange': '#fb923c',
    'color-gold': '#eab308',
    'color-dark-green': '#10b981'
  }
};

// Inject color variables into CSS
function injectColorVariables(theme = 'light') {
  const colors = THEME_COLORS[theme];
  const root = document.documentElement;
  
  Object.entries(colors).forEach(([name, value]) => {
    root.style.setProperty(`--${name}`, value);
  });
}

// Immediate theme initialization
(function initializeTheme() {
  const storedTheme = localStorage.getItem("theme");
  if (storedTheme) {
    document.documentElement.setAttribute("data-theme", storedTheme);
    injectColorVariables(storedTheme);
  } else {
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = isDark ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);
    injectColorVariables(theme);
  }
})();

// Set system theme based on user's preference
const setSystemTheme = () => {
  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = isDark ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
  injectColorVariables(theme);
};

// Set specific theme directly (for AI control)
const setTheme = (themeName) => {
  const validThemes = ['light', 'dark', 'system'];
  if (!validThemes.includes(themeName)) {
    return {
      success: false,
      message: `Invalid theme: ${themeName}. Valid themes: ${validThemes.join(', ')}`,
      currentTheme: localStorage.getItem("theme") || "system"
    };
  }

  const previousTheme = localStorage.getItem("theme") || "system";
  
  if (themeName === 'system') {
    localStorage.removeItem("theme");
    setSystemTheme();
  } else {
    document.documentElement.setAttribute("data-theme", themeName);
    injectColorVariables(themeName);
    localStorage.setItem("theme", themeName);
  }

  return {
    success: true,
    message: `Theme changed to ${themeName}`,
    currentTheme: themeName,
    previousTheme: previousTheme
  };
};

// Toggle between system, light, and dark themes
const toggle = () => {
  const currentTheme = localStorage.getItem("theme") || "system";
  let newTheme;

  switch (currentTheme) {
    case "system":
      newTheme = "light";
      document.documentElement.setAttribute("data-theme", "light");
      injectColorVariables("light");
      localStorage.setItem("theme", "light");
      break;
    case "light":
      newTheme = "dark";
      document.documentElement.setAttribute("data-theme", "dark");
      injectColorVariables("dark");
      localStorage.setItem("theme", "dark");
      break;
    case "dark":
      newTheme = "system";
      localStorage.removeItem("theme");
      setSystemTheme();
      break;
  }

  return { 
    success: true, 
    message: `Theme changed to ${newTheme}`,
    currentTheme: newTheme,
    previousTheme: currentTheme
  };
};

// Handle system theme changes
function handleSystemThemeChange(e) {
  const storedTheme = localStorage.getItem("theme");
  if (storedTheme) return; // Don't override user preference

  const theme = e.matches ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
  injectColorVariables(theme);
}





// Listen for system theme changes
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", handleSystemThemeChange);

// Export functions for external use
window.themeManager = {
  setSystemTheme,
  setTheme,
  toggle,
  injectColorVariables,
  THEME_COLORS
}; 