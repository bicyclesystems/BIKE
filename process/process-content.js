// =================== CONTENT PROCESSING MODULE ===================
// Specialized module for content generation (HTML, markdown, code, etc.)

// =================== CONTENT SETTINGS ===================

const CONTENT_SETTINGS = {
  DEFAULT_TEMPERATURE: 0.3
};

// Detection keywords organized by type
const CONTENT_TYPE_KEYWORDS = {
  html: ['app', 'website', 'site', 'tool', 'interactive', 'calculator'],
  markdown: ['guide', 'tutorial', 'documentation', 'how to', 'learning', 'step-by-step'],
  code: ['code', 'script', 'function', 'example', 'snippet', 'programming']
};

// Content generation templates
const CONTENT_TEMPLATES = {
  html: (title, context) => `Create a complete HTML file with CSS and JavaScript for: "${title}"
  
Context: ${context}

Requirements:
- Complete, functional HTML page
- Modern, clean design with CSS
- Interactive JavaScript functionality
- Mobile-responsive
- Include the title "${title}" prominently
- Make it production-ready and fully functional

Return only the complete HTML code.`,

  markdown: (title, context) => `Create a comprehensive guide for: "${title}"
  
Context: ${context}

Create a detailed, well-structured markdown guide that includes:
- Clear introduction
- Step-by-step instructions
- Examples where helpful
- Tips and best practices
- Conclusion

Make it practical and actionable.`,

  code: (title, context) => `Create code for: "${title}"
  
Context: ${context}

Provide clean, well-commented code that matches the request. Include explanations where helpful.`,

  auto: (title, context) => `Based on the title "${title}" and this context: "${context}"

What type of content should this be? Choose from: html, markdown, code, text
Then create appropriate content for it.

If it's a web app, tool, or interactive element: use HTML with CSS and JavaScript
If it's documentation, guide, or explanation: use Markdown
If it's code examples or programming: use Code
Otherwise: use Text

Respond with just the content, no explanations.`
};

// Content fallback templates
const CONTENT_FALLBACKS = {
  html: (title) => `<h1>${title}</h1><p>Failed to generate app content.</p>`,
  markdown: (title) => `# ${title}\n\nFailed to generate guide content.`,
  code: (title) => `// ${title}\n// Failed to generate code content.`,
  auto: (title) => ({ type: 'text', content: `Content for: ${title}\n\nFailed to generate specific content.` })
};

// =================== CONTENT FUNCTIONS ===================

// Content type detection
function detectContentType(title, content) {
  const titleLower = title.toLowerCase();
  const contentLower = content.toLowerCase();
  
  for (const [type, keywords] of Object.entries(CONTENT_TYPE_KEYWORDS)) {
    const hasKeyword = keywords.some(keyword => 
      titleLower.includes(keyword) || contentLower.includes(keyword)
    );
    if (hasKeyword) return type;
  }
  
  return 'auto'; // Default to auto-detection
}

// Low-level content generator (used internally by specific generators)
async function generateContentFromPrompt(prompt, fallbackContent = null, utilities) {
  try {
    const payload = {
      model: utilities.AI_CONFIG.CHAT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: CONTENT_SETTINGS.DEFAULT_TEMPERATURE
    };
    
    const data = await utilities.generateContent('chat', payload, { context: 'Content generation' });
    return data.choices[0].message.content;
  } catch (error) {
    return fallbackContent || `Failed to generate content: ${error.message}`;
  }
}

// Unified content generation by type
async function generateContentByType(type, title, context, utilities) {
  const prompt = CONTENT_TEMPLATES[type](title, context);
  const fallback = CONTENT_FALLBACKS[type](title);
  const content = await generateContentFromPrompt(prompt, fallback, utilities);
  
  // Handle auto-detection type specially
  if (type === 'auto') {
    // Return early if we got a fallback object
    if (typeof content === 'object' && content.type) {
      return content;
    }
    
    // Try to detect the type from the content
    if (content.includes('<!DOCTYPE html>') || content.includes('<html')) {
      return { type: 'html', content };
    } else if (content.includes('```') || content.includes('#')) {
      return { type: 'markdown', content };
    } else if (content.includes('function') || content.includes('const ') || content.includes('//')) {
      return { type: 'code', content };
    } else {
      return { type: 'text', content };
    }
  }
  
  return content;
}

// =================== PUBLIC API ===================

window.processContentModule = {
  // Content generation functions
  generateContentByType,
  generateContentFromPrompt,
  detectContentType,
  
  // Settings and templates
  CONTENT_SETTINGS,
  CONTENT_TYPE_KEYWORDS,
  CONTENT_TEMPLATES,
  CONTENT_FALLBACKS
}; 