// =================== Chat View Rendering ===================

// Helper function to calculate duration display
function formatDuration(startTime, endTime) {
  const durationMs = endTime - startTime;
  const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
  const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
  return durationHours > 0 ? `${durationHours}h ${durationMinutes}m` : `${durationMinutes}m`;
}

// Helper function to get effective end time (explicit or inferred)
function getEffectiveEndTime(chat, activeChatId) {
  if (chat.endTime) {
    return new Date(chat.endTime);
  }
  
  // Infer from last message
  const messages = window.context?.getMessagesByChat()[activeChatId] || [];
  if (messages.length > 0) {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.timestamp) {
      const lastTime = lastMessage.timestamp.includes('M') && !lastMessage.timestamp.includes(',')
        ? new Date(`${new Date().toDateString()} ${lastMessage.timestamp}`)
        : new Date(lastMessage.timestamp);
      
      if (!isNaN(lastTime)) {
        return lastTime;
      }
    }
  }
  
  return null; // No end time available
}

function renderChatView() {
  const activeChatId = window.context?.getActiveChatId();
  const chats = window.context?.getChats() || [];
  const currentChat = chats.find(c => c.id === activeChatId);
  const currentChatTitle = currentChat?.title;

  // Get chat timeline info
  let timelineInfo = '';
  if (currentChat) {
    const startTime = new Date(currentChat.timestamp);
    const startFormatted = startTime.toLocaleDateString('en-US', { 
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
    });

    const endTime = getEffectiveEndTime(currentChat, activeChatId);
    
    if (endTime) {
      const endFormatted = endTime.toLocaleDateString('en-US', { 
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
      });
      
      const durationText = formatDuration(startTime, endTime);
      timelineInfo = `${startFormatted} - ${endFormatted} (${durationText})`;
    } else {
      timelineInfo = `${startFormatted} - ongoing`;
    }
  }

  return `
    <div class="column align-start justify-center padding-xl">
      <div class="column align-start">
        <div class="column align-start gap-l">
          <div class="column align-start gap-m">
            ${currentChatTitle ? `
              <h1>${currentChatTitle}</h1>
              <h3 class="${currentChat?.description ? 'opacity-full' : 'opacity-half'}">
                ${currentChat?.description || 'No description'}
              </h3>
              ${timelineInfo ? `
                <h3>
                  ${timelineInfo}
                </h3>
              ` : ''}
            ` : `
              <h1>No active chat</h1>
            `}
          </div>
        </div>
      </div>
    </div>
  `;
}

// =================== Chat View Event Handlers ===================

function setupChatHandlers() {
  // No specific handlers needed for chat view currently
}

// =================== Chat View Initialization ===================

function init() {
  setupChatHandlers();
}

// Export functions for global access
window.chatView = {
  renderChatView,
  setupChatHandlers,
  init,
  formatDuration, // Export for reuse
  getEffectiveEndTime // Export for reuse
}; 