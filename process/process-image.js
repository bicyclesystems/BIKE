// =================== IMAGE PROCESSING MODULE ===================
// Specialized module for image generation and analysis

// =================== IMAGE SETTINGS ===================

const IMAGE_SETTINGS = {
  DEFAULT_SIZE: '1792x1024',
  DEFAULT_QUALITY: 'standard',
  DEFAULT_STYLE: 'vivid',
  VISION_MAX_TOKENS: 500,
  VISION_TEMPERATURE: 0.3,
  VISION_DETAIL: 'high'
};

// =================== IMAGE FUNCTIONS ===================

// Image prompt extraction
function extractImagePrompt(title, context) {
  // Extract image description from title and context
  const titleWords = title.toLowerCase().replace(/image of |picture of |drawing of |illustration of /g, '');
  
  // Look for descriptive words in the conversation context
  const contextMatch = context.match(/(?:create|generate|make|draw).*?(?:image|picture|drawing|illustration).*?(?:of|showing|with)?\s*([^.!?]*)/i);
  
  if (contextMatch && contextMatch[1]) {
    return `${titleWords} - ${contextMatch[1].trim()}`;
  }
  
  return titleWords || title;
}

// Image analysis with Vision API
async function analyzeImageWithVision(imageUrl, utilities) {
  try {
    const payload = {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text", 
              text: "Describe this image in 1-2 sentences, focusing on the main elements, style, and purpose."
            },
            {
              type: "image_url",
              image_url: { url: imageUrl }
            }
          ]
        }
      ],
      max_tokens: 150
    };

    const data = await utilities.generateContent('chat', payload, { context: 'Image analysis' });
    return data.choices[0].message.content;
  } catch (error) {
    console.error('[PROCESS-IMAGE] Vision API analysis failed:', error);
    return null;
  }
}

// Basic image generation
async function generateBasicImage(prompt, utilities) {
  const imagePrompt = extractImagePrompt('Generated Image', prompt);
  
  const payload = {
    model: "dall-e-3",
    prompt: imagePrompt,
    n: 1,
    size: "1024x1024",
    quality: "standard"
  };

  try {
    const data = await utilities.generateContent('images', payload, { context: 'Basic image generation' });
    return data.data[0].url;
  } catch (error) {
    throw new Error(`Image generation failed: ${error.message}`);
  }
}

// Enhanced image generation with context
async function generateImage(prompt, baseImageUrl = null, baseDescription = null, utilities) {
  if (baseImageUrl || baseDescription) {
    let imageContext = baseDescription;
    
    // If we have a base image URL but no description, analyze it first
    if (baseImageUrl && !baseDescription) {
      imageContext = await analyzeImageWithVision(baseImageUrl, utilities);
    }
    
    // Use the image context to enhance the prompt
    let finalPrompt = prompt;
    if (imageContext) {
      finalPrompt = `Based on this existing image (${imageContext}), create a new image: ${prompt}`;
    }
    
    // Generate the new image using the enhanced prompt
    return await generateBasicImage(finalPrompt, utilities);
  } else {
    // No context available, generate with original prompt
    return await generateBasicImage(prompt, utilities);
  }
}

// =================== PUBLIC API ===================

window.processImageModule = {
  // Image generation functions
  generateImage,
  generateBasicImage,
  analyzeImageWithVision,
  extractImagePrompt,
  
  // Settings
  IMAGE_SETTINGS
}; 