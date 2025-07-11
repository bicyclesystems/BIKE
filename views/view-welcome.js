// =================== Welcome View Rendering ===================

function renderWelcomeView() {

  // Get current chat title
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

    // Check if chat has explicit end time
    if (currentChat.endTime) {
      const endTime = new Date(currentChat.endTime);
      const endFormatted = endTime.toLocaleDateString('en-US', { 
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
      });
      
      // Calculate duration
      const durationMs = endTime - startTime;
      const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
      const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
      let durationText = '';
      if (durationHours > 0) {
        durationText = `${durationHours}h ${durationMinutes}m`;
      } else {
        durationText = `${durationMinutes}m`;
      }
      
      // Check if chat is in the future, current, or past
      const now = new Date();
      if (startTime > now) {
        // Future scheduled chat
        timelineInfo = `Scheduled ${startFormatted} - ${endFormatted} (${durationText})`;
      } else if (endTime > now) {
        // Currently active chat
        timelineInfo = `Started ${startFormatted} • Ends ${endFormatted} (${durationText})`;
      } else {
        // Past chat with explicit duration
        timelineInfo = `${startFormatted} - ${endFormatted} (${durationText})`;
      }
    } else {
      // Original logic for chats without explicit end time
      // Get last message time
      const messages = window.context?.getMessagesByChat()[activeChatId] || [];
      let lastMessageInfo = '';
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        // Try to parse the timestamp - it might be just time like "2:30 PM" or full date
        let lastTime;
        if (lastMessage.timestamp) {
          // If it's just time format, use today's date
          if (lastMessage.timestamp.includes('M') && !lastMessage.timestamp.includes(',')) {
            lastTime = new Date(`${new Date().toDateString()} ${lastMessage.timestamp}`);
          } else {
            lastTime = new Date(lastMessage.timestamp);
          }
          
          if (!isNaN(lastTime)) {
            const lastFormatted = lastTime.toLocaleDateString('en-US', { 
              month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
            });
            lastMessageInfo = ` • Last message ${lastFormatted}`;
          }
        }
      }

      timelineInfo = `Started ${startFormatted}${lastMessageInfo}`;
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