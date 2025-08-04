// =================== NoHost Debug Window ===================
// Shows current files in the active chat's nohost folder

class NoHostDebugger {
  constructor() {
    this.debugWindow = null;
    this.isVisible = false;
    this.updateInterval = null;
  }

  createDebugWindow() {
    if (this.debugWindow) return;

    this.debugWindow = document.createElement('div');
    this.debugWindow.id = 'nohost-debug';
    this.debugWindow.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        width: 300px;
        max-height: 400px;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 15px;
        border-radius: 8px;
        font-family: 'Courier New', monospace;
        font-size: 12px;
        z-index: 10000;
        overflow-y: auto;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        border: 1px solid #333;
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid #333; padding-bottom: 8px;">
          <strong>🗂️ NoHost Files</strong>
          <button onclick="window.noHostDebugger.toggle()" style="
            background: #ff4444;
            color: white;
            border: none;
            padding: 2px 6px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 10px;
          ">✕</button>
        </div>
        <div id="debug-content">Loading...</div>
        <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #333; font-size: 10px; opacity: 0.7;">
          Updates every 2s
        </div>
      </div>
    `;
    
    document.body.appendChild(this.debugWindow);
  }

  async updateDebugInfo() {
    const contentDiv = document.getElementById('debug-content');
    if (!contentDiv) return;

    try {
      const chatId = window.context?.getActiveChatId();
      const artifacts = window.context?.getCurrentChatArtifacts() || [];
      
      let content = `<div style="margin-bottom: 8px;">
        <strong>Chat ID:</strong> ${chatId || 'None'}
      </div>`;

      content += `<div style="margin-bottom: 8px;">
        <strong>Artifacts:</strong> ${artifacts.length}
      </div>`;

      if (window.noHostManager && window.noHostManager.isReady) {
        content += `<div style="margin-bottom: 8px; color: #4ade80;">
          <strong>NoHost:</strong> ✅ Ready
        </div>`;

        if (chatId) {
          const folderPath = `/chat-${chatId}`;
          content += `<div style="margin-bottom: 8px;">
            <strong>Folder:</strong> ${folderPath}
          </div>`;

          // List expected files
          content += `<div style="margin-bottom: 4px;"><strong>Expected Files:</strong></div>`;
          if (artifacts.length === 0) {
            content += `<div style="margin-left: 10px; color: #888;">No artifacts</div>`;
          } else {
                      artifacts.forEach(artifact => {
            if (artifact.type === 'group') {
              const folderName = window.noHostManager.sanitizeFolderName(artifact.title);
              content += `<div style="margin-left: 10px; margin-bottom: 2px;">
                <span style="color: #60a5fa;">📁</span>
                <span style="color: #e5e7eb;">${folderName}/</span>
                <span style="color: #6b7280; font-size: 10px;">(group)</span>
              </div>`;
            } else {
              const fileName = window.noHostManager.getArtifactFileName(artifact);
              const filePath = artifact.parentId ? 
                window.noHostManager.getArtifactFilePath(chatId, artifact, artifacts) :
                fileName;
              const typeColor = {
                'html': '#60a5fa',
                'css': '#f59e0b',
                'javascript': '#10b981', 
                'js': '#10b981',
                'json': '#8b5cf6',
                'image': '#ef4444',
                'markdown': '#6b7280',
                'text': '#9ca3af',
                'files': '#ef4444'
              }[artifact.type] || '#6b7280';
              
              const displayPath = filePath.replace(`/chat-${chatId}/`, '');
              content += `<div style="margin-left: 10px; margin-bottom: 2px;">
                <span style="color: ${typeColor};">📄</span>
                <span style="color: #e5e7eb;">${displayPath}</span>
                <span style="color: #6b7280; font-size: 10px;">(${artifact.type})</span>
              </div>`;
            }
          });
          }

          // Try to list actual files in filesystem
          if (window.noHostManager.fs) {
            try {
              await this.listActualFiles(chatId, content);
            } catch (error) {
              content += `<div style="margin-top: 8px; color: #ef4444;">
                <strong>Error reading files:</strong> ${error.message}
              </div>`;
            }
          }
        }
      } else {
        content += `<div style="margin-bottom: 8px; color: #ef4444;">
          <strong>NoHost:</strong> ❌ Not Ready
        </div>`;
      }

      contentDiv.innerHTML = content;
    } catch (error) {
      contentDiv.innerHTML = `<div style="color: #ef4444;">Error: ${error.message}</div>`;
    }
  }

  async listActualFiles(chatId, content) {
    return new Promise((resolve, reject) => {
      const folderPath = `/chat-${chatId}`;
      
      window.noHostManager.fs.readdir(folderPath, (err, files) => {
        const contentDiv = document.getElementById('debug-content');
        if (!contentDiv) return resolve();

        let updatedContent = content;
        
        if (err) {
          if (err.code === 'ENOENT') {
            updatedContent += `<div style="margin-top: 8px; color: #f59e0b;">
              <strong>Actual Files:</strong> Folder not created yet
            </div>`;
          } else {
            updatedContent += `<div style="margin-top: 8px; color: #ef4444;">
              <strong>Actual Files:</strong> Error: ${err.message}
            </div>`;
          }
          contentDiv.innerHTML = updatedContent;
          resolve();
        } else {
          updatedContent += `<div style="margin-top: 8px;">
            <strong>Actual Files:</strong>
          </div>`;
          
          if (files.length === 0) {
            updatedContent += `<div style="margin-left: 10px; color: #888;">No files in folder</div>`;
            contentDiv.innerHTML = updatedContent;
            resolve();
          } else {
            this.listFilesRecursively(folderPath, '', (fileListHtml) => {
              updatedContent += fileListHtml;
              contentDiv.innerHTML = updatedContent;
              resolve();
            });
          }
        }
      });
    });
  }

  listFilesRecursively(dirPath, relativePath, callback, level = 0) {
    const indent = '  '.repeat(level);
    let html = '';
    
    window.noHostManager.fs.readdir(dirPath, (err, items) => {
      if (err) {
        html += `<div style="margin-left: ${10 + level * 20}px; color: #ef4444;">Error reading directory</div>`;
        callback(html);
        return;
      }

      let pendingStats = items.length;
      if (pendingStats === 0) {
        callback(html);
        return;
      }

      items.forEach(item => {
        const itemPath = `${dirPath}/${item}`;
        const displayPath = relativePath ? `${relativePath}/${item}` : item;
        
        window.noHostManager.fs.stat(itemPath, (statErr, stats) => {
          if (!statErr) {
            if (stats.isDirectory()) {
              html += `<div style="margin-left: ${10 + level * 20}px; margin-bottom: 2px;">
                <span style="color: #60a5fa;">📁</span>
                <span style="color: #4ade80;">${item}/</span>
              </div>`;
              
              // Recursively list subdirectory contents
              this.listFilesRecursively(itemPath, displayPath, (subHtml) => {
                html += subHtml;
                pendingStats--;
                if (pendingStats === 0) {
                  callback(html);
                }
              }, level + 1);
              
            } else {
              const ext = item.split('.').pop().toLowerCase();
              const icon = {
                'html': '🌐',
                'css': '🎨',
                'js': '⚡', 
                'json': '📋',
                'svg': '🎨', 
                'md': '📝',
                'txt': '📄'
              }[ext] || '📄';
              
              html += `<div style="margin-left: ${10 + level * 20}px; margin-bottom: 2px;">
                <span>${icon}</span>
                <span style="color: #4ade80;">${displayPath}</span>
              </div>`;
              
              pendingStats--;
              if (pendingStats === 0) {
                callback(html);
              }
            }
          } else {
            pendingStats--;
            if (pendingStats === 0) {
              callback(html);
            }
          }
        });
      });
    });
  }

  show() {
    this.createDebugWindow();
    this.isVisible = true;
    this.debugWindow.style.display = 'block';
    
    // Update immediately and then every 2 seconds
    this.updateDebugInfo();
    this.updateInterval = setInterval(() => {
      this.updateDebugInfo();
    }, 2000);
  }

  hide() {
    if (this.debugWindow) {
      this.debugWindow.style.display = 'none';
    }
    this.isVisible = false;
    
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  refresh() {
    if (this.isVisible) {
      this.updateDebugInfo();
    }
  }
}

// Global instance
window.noHostDebugger = new NoHostDebugger();

// Auto-show debug window if in development/testing
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  // Show after a brief delay to let everything initialize
  setTimeout(() => {
    window.noHostDebugger.show();
  }, 1000);
}

// Keyboard shortcut: Ctrl+Shift+D to toggle
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'D') {
    e.preventDefault();
    window.noHostDebugger.toggle();
  }
});