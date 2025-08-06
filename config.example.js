// Configuration file for Bike app
// This file contains sensitive configuration and should not be committed to git

// SECURITY WARNING: These keys are exposed in plain text
// In production, these should be loaded from environment variables or a secure key management service

// OpenAI API Key for AI functionality
// Get your API key from: https://platform.openai.com/api-keys
window.API_KEY = 'sk-proj-YOUR_OPENAI_API_KEY_HERE';

// Supabase Configuration for database and authentication
// Get your credentials from: https://supabase.com/dashboard/project/YOUR_PROJECT/settings/api
window.SUPABASE_CONFIG = {
  url: 'https://your-project-ref.supabase.co',
  key: 'your-supabase-anon-key-here'
};

// Optional: Additional configuration options (uncomment and configure as needed)

// Custom API endpoints (if using different providers)
// window.CUSTOM_API_ENDPOINT = 'https://your-custom-api.com/v1';

// Feature flags
// window.FEATURE_FLAGS = {
//   enableMemorySync: true,
//   enableTemplates: true,
//   enableArtifacts: true,
//   debugMode: false
// };

// Theme and UI configuration
// window.UI_CONFIG = {
//   defaultTheme: 'light', // 'light' or 'dark'
//   animationsEnabled: true,
//   compactMode: false
// };

// Analytics and tracking (if using)
// window.ANALYTICS_CONFIG = {
//   googleAnalyticsId: 'GA-XXXXXXXXX',
//   enableUserTracking: false
// };