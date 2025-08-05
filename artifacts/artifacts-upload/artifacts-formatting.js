// =================== AI Formatting Functions ===================
// Functions for formatting parsed file data for AI consumption

function formatFileDataForAI(fileData, purpose = 'analysis') {
  let formatted = '';
  
  // Basic file information
  formatted += `File: ${fileData.name}\n`;
  formatted += `Type: ${fileData.type}\n`;
  formatted += `Size: ${fileData.size} bytes\n`;
  
  // Add metadata if available
  if (fileData.metadata && fileData.metadata.category) {
    formatted += `Category: ${fileData.metadata.category}\n`;
  }
  
  // Add structure information if available
  if (fileData.structure) {
    formatted += `Complexity: ${fileData.structure.complexity}\n`;
    if (fileData.structure.dataPoints > 0) {
      formatted += `Data Points: ${fileData.structure.dataPoints}\n`;
    }
  }
  
  formatted += '\n';
  
  // Handle different file types with extracted data
  if (fileData.extractedData) {
    const extracted = fileData.extractedData;
    
    switch (extracted.type) {
      case 'json':
        formatted += 'JSON Structure:\n';
        if (extracted.keys) {
          formatted += `Keys: ${extracted.keys.slice(0, 20).join(', ')}\n`;
        }
        if (extracted.structure && extracted.structure.valid !== false) {
          formatted += `Structure Type: ${extracted.structure.type}\n`;
        }
        if (purpose === 'analysis' && extracted.parsed) {
          formatted += '\nSample Data:\n```json\n';
          formatted += JSON.stringify(extracted.parsed, null, 2).substring(0, 1000);
          formatted += '\n```\n\n';
        } else if (purpose === 'edit') {
          formatted += '\nFull Content:\n```json\n';
          formatted += extracted.rawContent;
          formatted += '\n```\n\n';
        }
        break;
        
      case 'csv':
        formatted += 'CSV Data:\n';
        formatted += `Rows: ${extracted.rowCount}, Columns: ${extracted.columnCount}\n`;
        formatted += `Headers: ${extracted.headers.join(', ')}\n`;
        if (extracted.summary) {
          formatted += 'Column Analysis:\n';
          Object.entries(extracted.summary.columnTypes).forEach(([header, info]) => {
            formatted += `  ${header}: ${info.uniqueCount} unique values\n`;
          });
        }
        if (purpose === 'analysis') {
          formatted += '\nSample Rows:\n```csv\n';
          formatted += extracted.headers.join(',') + '\n';
          formatted += extracted.rows.slice(0, 5).map(row => row.join(',')).join('\n');
          formatted += '\n```\n\n';
        } else if (purpose === 'edit') {
          formatted += '\nFull Content:\n```csv\n';
          formatted += extracted.rawContent;
          formatted += '\n```\n\n';
        }
        break;
        
      case 'markdown':
        formatted += 'Markdown Structure:\n';
        if (extracted.structure.headings.length > 0) {
          formatted += `Headings: ${extracted.structure.headings.map(h => h.text).slice(0, 10).join(', ')}\n`;
        }
        if (extracted.structure.codeBlocks.length > 0) {
          formatted += `Code Blocks: ${extracted.structure.codeBlocks.length} (languages: ${extracted.structure.codeBlocks.map(cb => cb.language).join(', ')})\n`;
        }
        formatted += `Word Count: ${extracted.wordCount}\n\n`;
        if (purpose === 'edit') {
          formatted += 'Full Content:\n```markdown\n';
          formatted += extracted.rawContent;
          formatted += '\n```\n\n';
        }
        break;
        
      case 'javascript':
        formatted += 'JavaScript Structure:\n';
        if (extracted.structure.functions.length > 0) {
          formatted += `Functions: ${extracted.structure.functions.slice(0, 10).join(', ')}\n`;
        }
        if (extracted.structure.classes.length > 0) {
          formatted += `Classes: ${extracted.structure.classes.slice(0, 10).join(', ')}\n`;
        }
        if (extracted.structure.imports.length > 0) {
          formatted += `Imports: ${extracted.structure.imports.slice(0, 5).join(', ')}\n`;
        }
        formatted += `Lines: ${extracted.lineCount}\n\n`;
        if (purpose === 'edit') {
          formatted += 'Full Content:\n```javascript\n';
          formatted += extracted.rawContent;
          formatted += '\n```\n\n';
        }
        break;
        
      case 'html':
        formatted += 'HTML Structure:\n';
        if (extracted.structure.title) {
          formatted += `Title: ${extracted.structure.title}\n`;
        }
        if (extracted.structure.headings.length > 0) {
          formatted += `Headings: ${extracted.structure.headings.map(h => h.text).slice(0, 5).join(', ')}\n`;
        }
        if (extracted.structure.scripts.length > 0) {
          formatted += `Scripts: ${extracted.structure.scripts.length}\n`;
        }
        if (extracted.structure.forms.length > 0) {
          formatted += `Forms: ${extracted.structure.forms.length}\n`;
        }
        formatted += '\n';
        if (purpose === 'edit') {
          formatted += 'Full Content:\n```html\n';
          formatted += extracted.rawContent;
          formatted += '\n```\n\n';
        }
        break;
        
      case 'python':
        formatted += 'Python Structure:\n';
        if (extracted.structure.functions.length > 0) {
          formatted += `Functions: ${extracted.structure.functions.slice(0, 10).join(', ')}\n`;
        }
        if (extracted.structure.classes.length > 0) {
          formatted += `Classes: ${extracted.structure.classes.slice(0, 10).join(', ')}\n`;
        }
        if (extracted.structure.imports.length > 0) {
          formatted += `Imports: ${extracted.structure.imports.slice(0, 5).join(', ')}\n`;
        }
        formatted += `Lines: ${extracted.lineCount}\n\n`;
        if (purpose === 'edit') {
          formatted += 'Full Content:\n```python\n';
          formatted += extracted.rawContent;
          formatted += '\n```\n\n';
        }
        break;
        
      case 'pdf':
        formatted += 'PDF Document:\n';
        if (extracted.pageCount) {
          formatted += `Pages: ${extracted.pageCount}\n`;
        }
        if (extracted.metadata && extracted.metadata.totalWords) {
          formatted += `Total Words: ${extracted.metadata.totalWords}\n`;
          formatted += `Average Words per Page: ${extracted.metadata.averageWordsPerPage}\n`;
        }
        if (extracted.structure) {
          if (extracted.structure.hasStructuredContent) {
            formatted += 'Document appears to have structured content (sections/chapters)\n';
          }
          if (extracted.structure.possibleSections && extracted.structure.possibleSections.length > 0) {
            formatted += `Possible Sections: ${extracted.structure.possibleSections.slice(0, 5).join(', ')}\n`;
          }
          if (extracted.structure.keyTerms && extracted.structure.keyTerms.length > 0) {
            const topTerms = extracted.structure.keyTerms.slice(0, 10).map(term => term.word).join(', ');
            formatted += `Key Terms: ${topTerms}\n`;
          }
        }
        formatted += '\n';
        if (purpose === 'analysis' && extracted.textContent) {
          const preview = extracted.textContent.substring(0, 1500);
          formatted += 'Document Preview:\n```\n';
          formatted += preview + (extracted.textContent.length > 1500 ? '...' : '');
          formatted += '\n```\n\n';
        } else if (purpose === 'edit' && extracted.textContent) {
          formatted += 'Full Text Content:\n```\n';
          formatted += extracted.textContent;
          formatted += '\n```\n\n';
        } else if (extracted.metadata && extracted.metadata.parseError) {
          formatted += `Content Extraction: ${extracted.metadata.parseError}\n\n`;
        }
        break;
      
      default:
        // Generic text or other types
        if (fileData.searchableContent) {
          const content = fileData.searchableContent;
          formatted += `Content (${content.length} characters):\n`;
          if (purpose === 'analysis') {
            formatted += '```\n' + content.substring(0, 1000) + (content.length > 1000 ? '...' : '') + '\n```\n\n';
          } else if (purpose === 'edit') {
            formatted += '```\n' + content + '\n```\n\n';
          }
        }
        break;
    }
  } else if (fileData.textContent) {
    // Fallback for older format
    const content = fileData.textContent;
    formatted += `Text Content (${content.length} characters):\n`;
    if (purpose === 'analysis') {
      formatted += '```\n' + content.substring(0, 1000) + (content.length > 1000 ? '...' : '') + '\n```\n\n';
    } else if (purpose === 'edit') {
      formatted += '```\n' + content + '\n```\n\n';
    }
  } else {
    const fileSize = fileData.size ? `${Math.round(fileData.size / 1024)}KB` : 'Unknown size';
    formatted += `[Binary file - ${fileSize}, cannot extract text content]\n\n`;
  }
  
  return formatted;
}

// Export for module use
if (typeof window !== 'undefined') {
  window.formatFileDataForAI = formatFileDataForAI;
}