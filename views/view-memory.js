// =================== Memory View ===================

// Helper function to extract name from email
function getNameFromEmail(email) {
  if (!email) return "there";
  // Extract the part before @ and capitalize first letter
  const namePart = email.split("@")[0];
  // Replace dots, underscores, numbers with spaces and capitalize
  const cleanName = namePart.replace(/[._\d]/g, " ").trim();
  // Capitalize first letter of each word
  return (
    cleanName
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ") || "there"
  );
}

// =================== Real-time Update System ===================

let memoryViewEventListenersSetup = false;

function setupMemoryViewEventListeners() {
  // Prevent duplicate event listeners
  if (memoryViewEventListenersSetup) return;

  // Set up real-time updates when memory system events occur
  if (window.memory?.events) {
    window.memory.events.addEventListener("dataChanged", (event) => {
      // Only refresh if memory view is currently active
      if (window.context?.getActiveView()?.type === "memory") {
        console.log(
          "[MEMORY VIEW] Data changed, refreshing view:",
          event.detail?.type
        );
        refreshMemoryView();
      }
    });

    
    memoryViewEventListenersSetup = true;
  } else {
    // Memory system not ready yet, try again in a moment
    setTimeout(setupMemoryViewEventListeners, 100);
  }
}

// =================== Context Highlighting ===================
// Note: Context highlighting is now handled automatically by the global auto-highlighting system

// =================== Memory View Rendering ===================

function renderMemoryView() {
  // Ensure real-time event listeners are set up
  setupMemoryViewEventListeners();

  // Check if memory module is available
  if (!window.memory) {
    return `
      <div class="column align-center justify-center padding-xl">
        <div class="text-xl">🧠</div>
        <div class="text-l">Memory Module Not Available</div>
        <div class="text-s opacity-s">The memory system is not loaded yet</div>
      </div>
    `;
  }

  const contextData = window.memory.getContextData() || {};
  const {
    userPreferences = {},
    chats = [],
    artifacts = [],
    messagesByChat = {},
    storageStatus = {},
  } = contextData;

  // Calculate some useful stats
  const totalMessages = Object.values(messagesByChat).reduce(
    (sum, messages) => sum + messages.length,
    0
  );
  const totalArtifacts = artifacts.length;
  const totalChats = chats.length;
  const totalActions = getAvailableActionsCount();

  // Get user information
  const session = window.user?.getActiveSession();
  const email = session?.user?.email || "";

  // Check if there's no meaningful memory yet
  // This covers: logged out users (guest mode) OR users with minimal activity (1 empty chat)
  const isLoggedOut = !session || !email;
  const hasMinimalActivity =
    totalChats <= 1 && totalMessages === 0 && totalArtifacts === 0;
  const hasNoMemory = isLoggedOut || hasMinimalActivity;

  // Get actual session signup time information
  let signupTimeText = "";

  if (session?.user && window.sessionManager) {
    // Get signup time from user creation date
    const createdAt = session.user.created_at;
    if (createdAt) {
      const signupDate = new Date(createdAt);
      const now = new Date();
      const diffTime = Math.abs(now - signupDate);
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        signupTimeText = `, and you signed up <span class="background-secondary padding-xs radius-s gap-xs" data-no-highlight="true" style="margin: 0; display: inline-block; vertical-align: baseline;">today</span>`;
      } else if (diffDays === 1) {
        signupTimeText = `, and you signed up <span class="background-secondary padding-xs radius-s gap-xs" data-no-highlight="true" style="margin: 0; display: inline-block; vertical-align: baseline;">yesterday</span>`;
      } else if (diffDays < 30) {
        signupTimeText = `, and you signed up <span class="background-secondary padding-xs radius-s gap-xs" data-no-highlight="true" style="margin: 0; display: inline-block; vertical-align: baseline;">${diffDays} days ago</span>`;
      } else if (diffDays < 365) {
        const months = Math.floor(diffDays / 30);
        signupTimeText = `, and you signed up <span class="background-secondary padding-xs radius-s gap-xs" data-no-highlight="true" style="margin: 0; display: inline-block; vertical-align: baseline;">${months} month${
          months === 1 ? "" : "s"
        } ago</span>`;
      } else {
        const years = Math.floor(diffDays / 365);
        signupTimeText = `, and you signed up <span class="background-secondary padding-xs radius-s gap-xs" data-no-highlight="true" style="margin: 0; display: inline-block; vertical-align: baseline;">${years} year${
          years === 1 ? "" : "s"
        } ago</span>`;
      }
    }
  }

  // Get AI traits for the story
  const aiTraits = userPreferences.aiTraits || [];
  const traitsText =
    aiTraits.length > 0
      ? ` You like to sound ${aiTraits
          .map((trait, index) => {
            const tag = `<span class="background-secondary padding-xs radius-s gap-xs" data-no-highlight="true" style="margin: 0; display: inline-block; vertical-align: baseline;">${window.utils.escapeHtml(
              trait
            )}</span>`;
            if (aiTraits.length === 1) return tag;
            if (aiTraits.length === 2) return index === 0 ? tag : ` & ${tag}`;
            if (index === aiTraits.length - 1) return ` & ${tag}`;
            if (index === 0) return tag;
            return `, ${tag}`;
          })
          .join("")}.`
      : "";

  // Helper function to create styled data badges
  const createDataBadge = (content) =>
    `<span class="background-secondary padding-xs radius-s gap-xs" data-no-highlight="true" style="margin: 0; display: inline-block; vertical-align: baseline;">${window.utils.escapeHtml(
      content
    )}</span>`;

  const html = `
    <div class="column gap-l padding-l view">
      <div class="background-primary padding-l radius-l">
        <h1>
          Hello ${createDataBadge(
            userPreferences.name || getNameFromEmail(email)
          )}.${
    hasNoMemory
      ? " A moment of pure possibility. An invitation to discover. A celebration of the present moment before memory begins."
      : ""
  } ${
    !isLoggedOut
      ? `You're logged in as ${createDataBadge(email)}${signupTimeText}${
          userPreferences.role
            ? ` with the role of ${createDataBadge(userPreferences.role)}`
            : ""
        }${
          userPreferences.usingFor
            ? ` using this for ${createDataBadge(userPreferences.usingFor)}`
            : ""
        }.${traitsText} Your calendar shows ${createDataBadge(totalChats)} chats containing ${createDataBadge(totalMessages)} total messages. You've created ${createDataBadge(totalArtifacts)} artifacts. You've connected ${createDataBadge(
    "0"
  )} services. You have ${createDataBadge(totalActions)} available actions.`
      : `Let's ride? Say your ${createDataBadge("email")}.`
  }
        </h1>
      </div>
    </div>
  `;
  
  return html;
}

function refreshMemoryView() {
  if (window.context?.getActiveView()?.type === "memory") {
    window.views?.renderCurrentView();
  }
}

// =================== Helper Functions ===================

function getAvailableActionsCount() {
  // Get all actions from the actions registry
  if (!window.actions?.ACTIONS_REGISTRY) {
    return 0;
  }

  return Object.keys(window.actions.ACTIONS_REGISTRY).length;
}

// escapeHtml function removed - using window.utils.escapeHtml directly

// =================== Initialization ===================

// Initialize event listeners when the DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  setupMemoryViewEventListeners();
});

// Also try to set up listeners immediately if DOM is already ready
if (document.readyState === "loading") {
  // DOM not ready yet, wait for DOMContentLoaded
} else {
  // DOM already ready
  setupMemoryViewEventListeners();
}

document.addEventListener("DOMContentLoaded", async () => {
  // Wait until supabase client is available (or confirm we're in offline mode)
  while (!window.supabase && window.supabase !== null) {
    await new Promise((r) => setTimeout(r, 100));
  }
  
  // Skip database fetching if no supabase client (offline mode)
  if (!window.supabase) {
    console.log('[MEMORY] Running in offline mode - skipping database fetch');
    return;
  }

  //fetching all the data of the user from database
  try {
    const [user, artifacts, chats, messages] = await Promise.all([
      window.user.getUserData(),
      window.user.getUserArtifacts(),
      window.user.getUserChats(),
      window.user.getUserMessages(),
    ]);

    const messagesByChat = messages.reduce((acc, message) => {
      const chatId = message.chat_id;
      acc[chatId] = acc[chatId] || [];
      acc[chatId].push(message);
      return acc;
    }, {});

    //data stored to the local
    localStorage.setItem("bike_user_data", JSON.stringify({ user }));
    try {
      localStorage.setItem("userPreferences", JSON.stringify(user?.preferences || {}));
    } catch (e) {
      console.warn('[MEMORY] Failed to save userPreferences:', e);
      localStorage.setItem("userPreferences", JSON.stringify({}));
    }
    localStorage.setItem("userId", user?.id || "");
    localStorage.setItem("artifacts", JSON.stringify(artifacts));
    localStorage.setItem("chats", JSON.stringify(chats));
    localStorage.setItem("messagesByChat", JSON.stringify(messagesByChat));

    //the last chat from the db will be the active chat
    const lastChat = chats[chats.length - 1];
    if (lastChat?.id) {
      localStorage.setItem("activeChatId", lastChat.id.toString());
    }

    
  } catch (err) {
    console.warn("[MEMORY] Database fetch failed (tables may not exist or no permission) - continuing in offline mode:", err);
    // Continue in offline mode without database data
  }
});

// Export functions for global access
window.memoryView = {
  renderMemoryView,
  refreshMemoryView,
  setupMemoryViewEventListeners,
};
