// =================== System View ===================

function renderSystemView() {
  // Check if system module is available
  if (!window.systemModule) {
    return `
      <div class="column align-center justify-center padding-xl">
        <div>🔧</div>
        <div>System Module Not Available</div>
        <div class="opacity-s">The system module is not loaded yet</div>
      </div>
    `;
  }

  // Get system sections
  const sections = window.systemModule.getSystemSections();
  const sectionCount = Object.keys(sections).length;

  // Helper function to create styled data badges
  const createDataBadge = (content) =>
    `<span class="padding-xs radius-s" data-no-highlight="true">${window.utils?.escapeHtml ? window.utils.escapeHtml(content) : content}</span>`;

  return `
    <div class="column gap-l padding-l view">
      <div class="padding-l radius-l">        
        ${Object.entries(sections).map(([key, content]) => `
          <div class="margin-top-l">
            <h2>${key.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}</h2>
            <div class="margin-top-s padding-s radius-s">${window.utils?.escapeHtml ? window.utils.escapeHtml(content) : content}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// =================== System View API ===================

window.systemView = {
  renderSystemView
}; 