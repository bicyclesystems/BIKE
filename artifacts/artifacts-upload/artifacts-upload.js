// =================== File Upload Manager ===================
// Handles file upload functionality

class FileUploadManager {
  constructor() {
    this.isInitialized = false;
    this.dropZone = null;
  }

  initialize() {
    if (this.isInitialized) return;
    
    this.setupDropZone();
    this.isInitialized = true;
  }

  setupDropZone() {
    // Use document body as drop zone
    this.dropZone = document.body;
    
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      this.dropZone.addEventListener(eventName, this.preventDefaults, false);
      document.body.addEventListener(eventName, this.preventDefaults, false);
    });

    // Highlight drop zone when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
      this.dropZone.addEventListener(eventName, this.highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      this.dropZone.addEventListener(eventName, this.unhighlight, false);
    });

    // Handle dropped files
    this.dropZone.addEventListener('drop', this.handleDrop.bind(this), false);
  }

  preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  highlight(e) {
    document.body.classList.add('drag-over');
  }

  unhighlight(e) {
    document.body.classList.remove('drag-over');
  }

  handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    this.handleFilesDrop(files);
  }

  async processFiles(files, source = 'unknown') {
    if (!files || files.length === 0) return;

    for (const file of files) {
      try {
        await this.processFile(file, source);
      } catch (error) {
        console.error('[UPLOAD] Error processing file:', file.name, error);
      }
    }
  }

  async processFile(file, source) {
    try {
      // Check if parser is available
      if (!window.fileContentParser) {
        console.error('[UPLOAD] File content parser not available');
        return;
      }

      // Check if formatting function is available
      if (!window.formatFileDataForAI) {
        console.error('[UPLOAD] File formatting function not available');
        return;
      }

      // Parse the file content
      const fileData = await window.fileContentParser.parseFile(file);
      
      // Format the file data for AI consumption
      const formattedContent = window.formatFileDataForAI(fileData, 'analysis');
      
      // Create artifact based on file type
      let artifactType = 'file';
      let artifactTitle = file.name;
      
      // Determine better artifact type based on file
      if (file.type.startsWith('image/')) {
        artifactType = 'image';
      } else if (file.type === 'text/html' || file.name.endsWith('.html')) {
        artifactType = 'html';
      } else if (file.type === 'text/markdown' || file.name.endsWith('.md')) {
        artifactType = 'markdown';
      } else if (file.type.startsWith('text/') || fileData.metadata?.category === 'code') {
        artifactType = 'code';
      }

      // Create the artifact silently (don't auto-open)
      const currentMessageId = window.context?.getCurrentMessageId?.() || 'upload-' + Date.now();
      
      // Check if artifacts module is available
      if (window.artifactsModule && window.artifactsModule.createArtifactSilent) {
        window.artifactsModule.createArtifactSilent(formattedContent, currentMessageId, artifactType);
      } else {
        console.error('[UPLOAD] Artifacts module not available');
      }
      
    } catch (error) {
      console.error('[UPLOAD] Error processing file:', file.name, error);
      throw error;
    }
  }

  handleFilesDrop(files) {
    this.processFiles(Array.from(files), 'drop');
  }

  handleFilesPaste(files) {
    this.processFiles(Array.from(files), 'paste');
  }
}

// Export for module use
if (typeof window !== 'undefined') {
  window.FileUploadManager = FileUploadManager;
}

// Create and export manager instance
const fileUploadManager = new FileUploadManager();

if (typeof window !== 'undefined') {
  window.fileUploadManager = fileUploadManager;
}