// =================== System View ===================

async function renderSystemView(data = {}) {
  try {
    const systemMessage = await window.systemModule.system();
    const escapedMessage = window.utils?.escapeHtml ? window.utils.escapeHtml(systemMessage) : systemMessage;
    
    return `<div class="view" style="white-space: pre-wrap; font-family: monospace; font-size: 0.85em; line-height: 1.5; padding: 1rem; overflow: auto; height: 100vh;">${escapedMessage}</div>`;
  } catch (error) {
    return `<div class="column align-center justify-center padding-xl">
      <div>⚠️</div>
      <div>Error: ${error.message}</div>
    </div>`;
  }
}

// =================== System View API ===================

window.systemView = {
  renderSystemView
}; 