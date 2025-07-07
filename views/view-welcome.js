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
          <div class="row align-center gap-l">
            ${currentChatTitle ? `
              <div class="row align-center gap-m">
                <h1 class="text-xxl" style="font-size: 3rem; font-weight: 300; margin: 0;">${currentChatTitle}</h1>
                <button 
                  onclick="window.welcomeView.deleteCurrentChat()" 
                  class="background-quaternary padding-xs radius-s text-xs transition hover:background-error"
                  style="border: none; cursor: pointer; color: var(--color-error); opacity: 0.7;"
                  title="Delete current chat"
                >
                  ×
                </button>
              </div>
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

function deleteCurrentChat() {
  const activeChatId = window.context?.getActiveChatId();
  const chats = window.context?.getChats() || [];
  const currentChat = chats.find(c => c.id === activeChatId);
  
  if (!currentChat) {
    return;
  }
  
  // Prevent deleting the last chat
  if (chats.length <= 1) {
    alert('Cannot delete the last chat. Create another chat first.');
    return;
  }
  
  // Simple confirmation
  if (!confirm(`Delete "${currentChat.title}"?`)) {
    return;
  }
  
  // Execute deletion
  if (window.actions?.executeAction) {
    window.actions.executeAction('chat.delete', { 
      chatId: activeChatId, 
      confirmDelete: true 
    }).catch(error => {
      console.error('[WELCOME] Error deleting chat:', error);
      alert('Failed to delete chat');
    });
  } else {
    // Fallback to direct method
    window.context?.deleteChat(activeChatId);
  }
}

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
  deleteCurrentChat,
  init
}; 