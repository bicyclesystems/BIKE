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
let clockViewMode = false; // false = calendar, true = clock

// Navigation
const navigateWeek = (direction) => {
  currentWeekOffset += direction;
  renderCurrentView();
};

// Clock update interval
let clockInterval = null;

// Update only clock elements without full re-render
const updateClockElements = () => {
  if (!clockViewMode) return;
  
  const now = new Date();
  const hours = now.getHours() % 12;
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  
  // Calculate angles
  const hourAngle = (hours * 30) + (minutes * 0.5);
  const minuteAngle = minutes * 6;
  const secondAngle = seconds * 6;
  
  // Update clock hands
  const hourHand = document.querySelector('.clock-hour-hand');
  const minuteHand = document.querySelector('.clock-minute-hand');
  const secondHand = document.querySelector('.clock-second-hand');
  const digitalTime = document.querySelector('.clock-digital-time');
  
  if (hourHand && minuteHand && secondHand && digitalTime) {
    hourHand.style.transform = `translateX(-50%) translateY(-100%) rotate(${hourAngle}deg)`;
    minuteHand.style.transform = `translateX(-50%) translateY(-100%) rotate(${minuteAngle}deg)`;
    secondHand.style.transform = `translateX(-50%) translateY(-100%) rotate(${secondAngle}deg)`;
    digitalTime.textContent = now.toLocaleTimeString();
  }
};

// Clock view toggle
const toggleClockView = () => {
  clockViewMode = !clockViewMode;
  
  if (clockViewMode) {
    // Start clock update interval - only update elements, not full re-render
    clockInterval = setInterval(updateClockElements, 1000);
  } else {
    // Clear clock update interval
    if (clockInterval) {
      clearInterval(clockInterval);
      clockInterval = null;
    }
  }
  
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
  const clickHandler = event.chatId ? `onclick="window.chat.switchToChat('${event.chatId}')"` : '';
  const isActive = event.color === "#3b82f6";
  const colorClass = isActive ? 'color-primary' : 'background-tertiary foreground-primary';
  
  return `<div class="padding-xs radius-xs ${colorClass}" style="
    margin: 1px;
    overflow: hidden;
    ${event.chatId ? 'cursor: pointer;' : ''}
  " ${clickHandler}>
    ${event.title}
  </div>`;
};

// Render compact events list for clock view
const renderCompactEventsList = () => {
  const chatEvents = generateChatEvents();
  const today = new Date();
  
  // Get today's events
  const todayEvents = chatEvents.filter(event => {
    const eventDate = new Date(event.start);
    return eventDate.toDateString() === today.toDateString();
  });
  
  // Get upcoming events (next 3 days)
  const upcomingEvents = chatEvents.filter(event => {
    const eventDate = new Date(event.start);
    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(today.getDate() + 3);
    return eventDate > today && eventDate <= threeDaysFromNow;
  }).slice(0, 5); // Limit to 5 upcoming events
  
  let html = `
    <div class="column padding-m background-secondary radius-s" style="
      max-width: 300px;
      margin-left: 20px;
    ">
      <h3 class="opacity-s" style="margin: 0 0 15px 0;">Events</h3>
  `;
  
  if (todayEvents.length > 0) {
    html += `
      <div class="column gap-xs" style="margin-bottom: 15px;">
        <h4 class="opacity-s" style="margin: 0;">Today</h4>
    `;
    todayEvents.forEach(event => {
      const startTime = new Date(event.start);
      const isActive = event.color === "#3b82f6";
      const colorClass = isActive ? 'color-primary' : 'background-tertiary foreground-primary';
      html += `
        <div class="column padding-xs radius-xs ${colorClass}" style="
          cursor: pointer;
        " onclick="window.chat.switchToChat('${event.chatId}')">
          <div style="font-weight: bold;">${formatTime(startTime.getHours())}</div>
          <div>${event.title}</div>
        </div>
      `;
    });
    html += `</div>`;
  }
  
  if (upcomingEvents.length > 0) {
    html += `
      <div class="column gap-xs">
        <h4 class=" opacity-s" style="margin: 0;">Upcoming</h4>
    `;
    upcomingEvents.forEach(event => {
      const startTime = new Date(event.start);
      const isActive = event.color === "#3b82f6";
      const colorClass = isActive ? 'color-primary' : 'background-tertiary foreground-primary';
      html += `
        <div class="column padding-xs radius-xs ${colorClass}" style="
          cursor: pointer;
        " onclick="window.chat.switchToChat('${event.chatId}')">
          <div style="font-weight: bold;">${formatDayName(startTime)} ${formatDate(startTime)}</div>
          <div>${event.title}</div>
        </div>
      `;
    });
    html += `</div>`;
  }
  
  if (todayEvents.length === 0 && upcomingEvents.length === 0) {
    html += `<div class="opacity-s" style="font-style: italic;">No upcoming events</div>`;
  }
  
  html += `</div>`;
  return html;
};

// Render analog clock
const renderAnalogClock = () => {
  const now = new Date();
  const hours = now.getHours() % 12;
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  
  // Calculate angles
  const hourAngle = (hours * 30) + (minutes * 0.5);
  const minuteAngle = minutes * 6;
  const secondAngle = seconds * 6;
  
  return `
    <div class="column align-center justify-center padding-xl">
      <div style="
        width: 300px; 
        height: 300px; 
        border: 1px solid var(--color-tertiary-background); 
        border-radius: 50%; 
        position: relative; 
        background: var(--color-primary-background);
      ">
        <!-- Hour hand -->
        <div class="clock-hour-hand" style="
          position: absolute;
          width: 3px;
          height: 60px;
          background: var(--color-primary-foreground);
          left: 50%;
          top: 50%;
          transform-origin: 50% 100%;
          transform: translateX(-50%) translateY(-100%) rotate(${hourAngle}deg);
        "></div>
        
        <!-- Minute hand -->
        <div class="clock-minute-hand" style="
          position: absolute;
          width: 2px;
          height: 90px;
          background: var(--color-primary-foreground);
          left: 50%;
          top: 50%;
          transform-origin: 50% 100%;
          transform: translateX(-50%) translateY(-100%) rotate(${minuteAngle}deg);
        "></div>
        
        <!-- Second hand -->
        <div class="clock-second-hand" style="
          position: absolute;
          width: 1px;
          height: 100px;
          background: var(--color-negative);
          left: 50%;
          top: 50%;
          transform-origin: 50% 100%;
          transform: translateX(-50%) translateY(-100%) rotate(${secondAngle}deg);
        "></div>
        
        <!-- Center dot -->
        <div style="
          position: absolute;
          width: 6px;
          height: 6px;
          background: var(--color-primary-foreground);
          border-radius: 50%;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
        "></div>
      </div>
    </div>
  `;
};

// Render clock view
const renderClockView = () => {
  // Start clock update interval if not already running
  if (!clockInterval) {
    clockInterval = setInterval(updateClockElements, 1000);
  }
  
  return `
    <div class="column padding-m">
      <!-- Navigation -->
      <div class="row align-center justify-center gap-s" style="margin-bottom: 20px;">
        <button onclick="window.calendarView.navigateWeek(-1)" class="padding-xs background-secondary border radius-xs" style="cursor: pointer;">‹ Prev</button>
        <span style="font-weight: bold;">${formatMonthYear(new Date())}</span>
        <button onclick="window.calendarView.navigateWeek(1)" class="padding-xs background-secondary border radius-xs" style="cursor: pointer;">Next ›</button>
        <button onclick="window.calendarView.toggleClockView()" class="padding-xs background-secondary border radius-xs" style="cursor: pointer;">📅 Calendar</button>
      </div>
      
      <!-- Clock and Events Layout -->
      <div class="row align-start justify-center">
        ${renderAnalogClock()}
        ${renderCompactEventsList()}
      </div>
    </div>
  `;
};

function renderCalendarView() {
  // Return clock view if clock mode is active
  if (clockViewMode) {
    return renderClockView();
  }
  
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
    <div class="column padding-m">
      <!-- Navigation -->
      <div class="row align-center justify-center gap-s" style="margin-bottom: 20px;">
        <button onclick="window.calendarView.navigateWeek(-1)" class="padding-xs background-secondary border radius-xs" style="cursor: pointer;">‹ Prev</button>
        <span style="font-weight: bold;">${formatMonthYear(weekDays[0])}</span>
        <button onclick="window.calendarView.navigateWeek(1)" class="padding-xs background-secondary border radius-xs" style="cursor: pointer;">Next ›</button>
        <button onclick="window.calendarView.toggleClockView()" class="padding-xs background-secondary border radius-xs" style="cursor: pointer;">🕐 Clock</button>
      </div>
      
      <!-- Calendar Grid -->
      <div class="row border">
        <!-- Time Column -->
        <div class="border-right" style="width: 60px;">
          <div class="border-bottom" style="height: 40px;"></div>`;
  
  // Time labels
  timeSlots.forEach(hour => {
    html += `<div class="padding-xs text-center" style="height: 30px; border-bottom: 1px solid #eee;">
      ${formatTime(hour)}
    </div>`;
  });
  
  html += `</div>`;
  
  // Day columns
  weekDays.forEach((day, dayIndex) => {
    const isToday = day.toDateString() === today.toDateString();
    const todayClass = isToday ? 'background-secondary' : '';
    html += `<div class="box border-right">
      <!-- Day header -->
      <div class="padding-xs text-center border-bottom ${todayClass}" style="height: 40px;">
        ${formatDayName(day)} ${formatDate(day)}
      </div>`;
    
    // Time slots for this day
    timeSlots.forEach(hour => {
      const eventsForSlot = chatEvents.filter(event => isEventOnDay(event, day) && getEventHour(event) === hour);
      html += `<div style="height: 30px; border-bottom: 1px solid #eee; position: relative;"`;
      if (eventsForSlot.length === 0) {
        html += ` onclick=\"window.calendarView.createChatAt('${day.toISOString()}',${hour})\" style=\"cursor:pointer;\" onmouseover=\"this.style.backgroundColor='var(--color-secondary-background)'\" onmouseout=\"this.style.backgroundColor=''\"`;
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



// Create a new chat at a given date and hour
const createChatAt = (date, hour) => {
  if (!window.context) return;
  const chatDate = new Date(date);
  chatDate.setHours(hour, 0, 0, 0);
  if (window.chat && window.chat.createNewChat) {
    window.chat.createNewChat({ timestamp: chatDate.toISOString() });
  }
  if (window.views?.renderCurrentView) {
    window.views.renderCurrentView();
  }
};

// Cleanup function
const cleanup = () => {
  if (clockInterval) {
    clearInterval(clockInterval);
    clockInterval = null;
  }
  clockViewMode = false;
};

// Export
window.calendarView = {
  renderCalendarView,
  navigateWeek,
  toggleClockView,
  createChatAt,
  cleanup
}; 