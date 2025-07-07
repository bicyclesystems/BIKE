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
  injectColorVariables,
  THEME_COLORS
}; 