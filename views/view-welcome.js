// =================== Welcome View Rendering ===================

function renderWelcomeView() {

  // Get current chat title
  const activeChatId = window.context?.getActiveChatId();
  const chats = window.context?.getChats() || [];
  const currentChat = chats.find(c => c.id === activeChatId);
  const currentChatTitle = currentChat?.title;

  return `
    <div class="column align-start justify-center padding-xl" style="min-height: 100vh;">
      <div class="column align-start" style="max-width: calc(var(--base-size) * 200); width: 100%;">
        <div class="column align-start gap-l">
          <div class="column align-start gap-m">
            ${currentChatTitle ? `
              <h1 class="text-xxl" style="font-size: 3rem; font-weight: 300; margin: 0;">${currentChatTitle}</h1>
              ${currentChat?.description ? `
                <h3 class="text-l" style="font-weight: 400; margin: 0; color: var(--text-secondary, #6b7280);">${currentChat.description}</h3>
              ` : ''}
            ` : `
              <h1 class="text-xxl" style="font-size: 3rem; font-weight: 300; margin: 0;">No active chat</h1>
            `}
          </div>
        </div>
      </div>
    </div>
  `;
}

// =================== Welcome View Event Handlers ===================

function setupWelcomeHandlers() {
  // No specific handlers needed for welcome view currently
}

// =================== Welcome View Initialization ===================

function init() {
  setupWelcomeHandlers();
}

// Export functions for global access
window.welcomeView = {
  renderWelcomeView,
  setupWelcomeHandlers,
  init
}; 