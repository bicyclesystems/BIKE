// =================== Minimal Calendar View ===================

// Helper function to get effective end time for calendar (explicit, inferred, or default)
function getCalendarEndTime(chat) {
  if (chat.endTime) {
    return new Date(chat.endTime);
  }
  
  // Try to infer from last message
  const messages = window.context?.getMessagesByChat()[chat.id] || [];
  if (messages.length > 0) {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.timestamp) {
      const lastTime = lastMessage.timestamp.includes('M') && !lastMessage.timestamp.includes(',')
        ? new Date(`${new Date().toDateString()} ${lastMessage.timestamp}`)
        : new Date(lastMessage.timestamp);
      
      if (!isNaN(lastTime) && lastTime > new Date(chat.timestamp)) {
        return lastTime;
      }
    }
  }
  
  // Default to 1 hour if no other duration available
  const defaultEnd = new Date(chat.timestamp);
  defaultEnd.setHours(defaultEnd.getHours() + 1);
  return defaultEnd;
}

// Smart chat events generation with real durations
const generateChatEvents = () => {
  const chats = window.context?.getChats() || [];
  
  return chats.map(chat => {
    const startTime = new Date(chat.timestamp);
    const endTime = getCalendarEndTime(chat);
    const isActive = chat.id === window.context?.getActiveChatId();
    const color = isActive ? "#3b82f6" : "#9ca3af";
    
    return {
      id: chat.id,
      title: chat.title,
      start: startTime.toISOString(),
      end: endTime.toISOString(),
      color: color,
      chatId: chat.id,
      hasExplicitDuration: !!chat.endTime
    };
  });
};

// Calendar state
let currentWeekOffset = 0;

// Navigation
const navigateWeek = (direction) => {
  currentWeekOffset += direction;
  renderCurrentView();
};

// Utilities
const formatTime = (hour) => `${hour.toString().padStart(2, '0')}:00`;
const formatDate = (date) => date.getDate();
const formatDayName = (date) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
const formatMonthYear = (date) => {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
};

const isEventOnDay = (event, date) => {
  const eventDate = new Date(event.start);
  return eventDate.toDateString() === date.toDateString();
};

const getEventHour = (event) => new Date(event.start).getHours();

// Generate 24-hour time slots (00:00 to 23:00)
const generateTimeSlots = () => {
  const slots = [];
  for (let hour = 0; hour < 24; hour++) {
    slots.push(hour);
  }
  return slots;
};

// Generate week days
const generateWeekDays = (startDate) => {
  const days = [];
  const currentDate = new Date(startDate);
  for (let i = 0; i < 7; i++) {
    days.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return days;
};

// Render event
const renderEvent = (event) => {
  const clickHandler = event.chatId ? `onclick="window.calendarView.switchToChat('${event.chatId}')"` : '';
  const cursor = event.chatId ? 'cursor: pointer;' : '';
  
  return `<div style="
    background: ${event.color}; 
    color: white; 
    padding: 2px 4px;
    margin: 1px;
    border-radius: 2px;
    font-size: 11px;
    overflow: hidden;
    ${cursor}
  " ${clickHandler}>
    ${event.title}
  </div>`;
};

function renderCalendarView() {
  const chatEvents = generateChatEvents();
  const today = new Date();
  
  // Calculate week start (Monday)
  const startOfWeek = new Date(today);
  const dayOfWeek = today.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  startOfWeek.setDate(today.getDate() - daysToMonday + (currentWeekOffset * 7));
  
  const weekDays = generateWeekDays(startOfWeek);
  const timeSlots = generateTimeSlots();
  
  let html = `
    <div style="font-family: monospace; padding: 10px;">
      <!-- Navigation -->
      <div style="text-align: center; margin-bottom: 20px;">
        <button onclick="window.calendarView.navigateWeek(-1)" style="margin-right: 10px;">‹ Prev</button>
        <span style="font-weight: bold;">${formatMonthYear(weekDays[0])}</span>
        <button onclick="window.calendarView.navigateWeek(1)" style="margin-left: 10px;">Next ›</button>
      </div>
      
      <!-- Calendar Grid -->
      <div style="display: flex; border: 1px solid #ccc;">
        <!-- Time Column -->
        <div style="width: 60px; border-right: 1px solid #ccc;">
          <div style="height: 40px; border-bottom: 1px solid #ccc;"></div>`;
  
  // Time labels
  timeSlots.forEach(hour => {
    html += `<div style="height: 30px; border-bottom: 1px solid #eee; padding: 5px; font-size: 10px; text-align: center;">
      ${formatTime(hour)}
    </div>`;
  });
  
  html += `</div>`;
  
  // Day columns
  weekDays.forEach((day, dayIndex) => {
    const isToday = day.toDateString() === today.toDateString();
    html += `<div style="flex: 1; border-right: 1px solid #ccc;">
      <!-- Day header -->
      <div style="height: 40px; border-bottom: 1px solid #ccc; padding: 5px; text-align: center; font-size: 12px; ${isToday ? 'background: #e3f2fd;' : ''}">
        ${formatDayName(day)} ${formatDate(day)}
      </div>`;
    
    // Time slots for this day
    timeSlots.forEach(hour => {
      const eventsForSlot = chatEvents.filter(event => isEventOnDay(event, day) && getEventHour(event) === hour);
      html += `<div style="height: 30px; border-bottom: 1px solid #eee; position: relative;"`;
      if (eventsForSlot.length === 0) {
        html += ` onclick=\"window.calendarView.createChatAt('${day.toISOString()}',${hour})\" style=\"cursor:pointer;\" onmouseover=\"this.style.backgroundColor='#f5f5f5'\" onmouseout=\"this.style.backgroundColor=''\"`;
      }
      html += '>';
      // Add events for this hour and day
      eventsForSlot.forEach(event => {
        html += renderEvent(event);
      });
      html += `</div>`;
    });
    
    html += `</div>`;
  });
  
  html += `</div></div>`;
  
  return html;
}

// Chat switching
const switchToChat = (chatId) => {
        if (window.actions && window.actions.executeAction) {
        window.actions.executeAction('messages.switch', { chatId });
  }
};

// Create a new chat at a given date and hour
const createChatAt = (date, hour) => {
  if (!window.context) return;
  const chatDate = new Date(date);
  chatDate.setHours(hour, 0, 0, 0);
        if (window.actions.executeAction) {
        window.actions.executeAction('messages.create', { timestamp: chatDate.toISOString() });
  }
  if (window.views?.renderCurrentView) {
    window.views.renderCurrentView();
  }
};

// Export
window.calendarView = {
  renderCalendarView,
  navigateWeek,
  switchToChat,
  createChatAt
}; 