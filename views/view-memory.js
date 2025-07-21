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

    console.log("[MEMORY VIEW] Real-time event listeners established");
    memoryViewEventListenersSetup = true;
  } else {
    // Memory system not ready yet, try again in a moment
    setTimeout(setupMemoryViewEventListeners, 100);
  }

  // Listen for collaboration updates
  document.addEventListener("collaborationUpdate", () => {
    console.log("[COLLAB] Collaboration update received, refreshing view");
    refreshMemoryView();
  });
}

// =================== Context Highlighting ===================

function applyContextHighlighting() {
  if (!window.contextHighlight) return;

  setTimeout(() => {
    const viewElement = window.context?.getViewElement();
    if (viewElement) {
      // Find all text elements that could benefit from context highlighting
      const textElements = viewElement.querySelectorAll(
        "h1, h2, h3, h4, h5, h6, .text-xs, .text-s, .text-m, .text-l, .text-xl"
      );
      textElements.forEach((element) => {
        if (element.innerText && element.innerText.trim()) {
          // If element contains trait tags, preserve them by applying highlighting carefully
          const traitTags = element.querySelectorAll(
            '[data-no-highlight="true"]'
          );
          if (traitTags.length > 0) {
            // Save trait tag content and temporarily replace with placeholders
            const traitData = [];
            traitTags.forEach((tag, index) => {
              const placeholder = `__TRAIT_PLACEHOLDER_${index}__`;
              traitData.push({ placeholder, originalHTML: tag.outerHTML });
              tag.outerHTML = placeholder;
            });

            // Apply highlighting to the modified content
            window.contextHighlight.highlightContextWords(element);

            // Restore trait tags
            let html = element.innerHTML;
            traitData.forEach(({ placeholder, originalHTML }) => {
              html = html.replace(placeholder, originalHTML);
            });
            element.innerHTML = html;
          } else {
            // No trait tags, apply highlighting normally
            window.contextHighlight.highlightContextWords(element);
          }
        }
      });
    }
  }, 50);
}

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
      ? ` You like your AI to sound ${aiTraits
          .map((trait, index) => {
            const tag = `<span class="background-secondary padding-xs radius-s gap-xs" data-no-highlight="true" style="margin: 0; display: inline-block; vertical-align: baseline;">${escapeHtml(
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
    `<span class="background-secondary padding-xs radius-s gap-xs" data-no-highlight="true" style="margin: 0; display: inline-block; vertical-align: baseline;">${escapeHtml(
      content
    )}</span>`;

  // Get collaboration status
  const collabStatus = window.collaboration?.getStatus() || {};
  const isCollaborating = collabStatus.isCollaborating || false;
  const collaborationId = collabStatus.collaborationId;
  const peerCount = collabStatus.peerCount || 0;
  const isLeader = collabStatus.isLeader || false;

  // Create collaboration UI
  const collaborationUI = isCollaborating
    ? `
      <div class="background-secondary padding-m radius-m">
        <div class="row align-center justify-between">
          <div class="column gap-xs">
            <div class="text-m">🤝 Live Collaboration Active</div>
            <div class="text-s opacity-s">Session: ${collaborationId}</div>
            <div class="text-s opacity-s">${peerCount} peer${
        peerCount === 1 ? "" : "s"
      } connected</div>
            <div class="text-s opacity-s">Role: ${
              isLeader ? "Leader" : "Collaborator"
            }</div>
            ${
              isLeader
                ? `<div class="text-s opacity-s">Share this link: ${window.location.origin}${window.location.pathname}#/collab-${collaborationId}</div>`
                : ""
            }
          </div>
          <button class="button-secondary" onclick="window.collaboration.leaveSession()">
            Leave Session
          </button>
          <button class="button-secondary" onclick="handleTestConnection()">
            Test Connection
          </button>
          <button class="button-secondary" onclick="handleTriggerDiscovery()">
            Trigger Discovery
          </button>
        </div>
      </div>
    `
    : `
      <div class="background-secondary padding-m radius-m">
        <div class="row align-center justify-between">
          <div class="column gap-xs">
            <div class="text-m">🤝 Start Live Collaboration</div>
            <div class="text-s opacity-s">Share your session with others in real-time</div>
          </div>
          <button class="button-primary" onclick="handleCreateCollaboration()">
            Create Link
          </button>
        </div>
      </div>
    `;

  return `
    <div class="column gap-l padding-l view">
      <div class="background-primary padding-l radius-l">
        <h1>
          Hello ${createDataBadge(
            userPreferences.name || getNameFromEmail(email)
          )}.${
    hasNoMemory
      ? " A moment of pure possibility. An invitation to discover. A celebration of the present moment before memory begins."
      : ""
  } You're logged in as ${createDataBadge(
    email || "guest user"
  )}${signupTimeText}${
    userPreferences.role
      ? ` with the role of ${createDataBadge(userPreferences.role)}`
      : ""
  }${
    userPreferences.usingFor
      ? ` using this for ${createDataBadge(userPreferences.usingFor)}`
      : ""
  }.${traitsText} Your calendar shows ${createDataBadge(totalChats)} chat${
    totalChats === 1 ? "" : "s"
  } containing ${createDataBadge(totalMessages)} total message${
    totalMessages === 1 ? "" : "s"
  }. You've created ${createDataBadge(totalArtifacts)} artifact${
    totalArtifacts === 1 ? "" : "s"
  }. You've connected ${createDataBadge(
    "0"
  )} services. You have ${createDataBadge(totalActions)} available action${
    totalActions === 1 ? "" : "s"
  }.
        </h1>
      </div>
      
      ${collaborationUI}
    </div>
  `;
}

function refreshMemoryView() {
  if (window.context?.getActiveView()?.type === "memory") {
    window.views?.renderCurrentView();
    applyContextHighlighting();
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

// =================== Collaboration Functions ===================

async function handleCreateCollaboration() {
  console.log("[COLLAB] handleCreateCollaboration called");

  if (!window.collaboration) {
    console.error("[COLLAB] Collaboration module not available");
    alert(
      "Collaboration module not loaded. Please refresh the page and try again."
    );
    return;
  }

  try {
    console.log("[COLLAB] Creating collaboration link...");
    const result = await window.collaboration.createCollaborationLink();

    console.log("[COLLAB] createCollaborationLink result:", result);

    if (result.success) {
      console.log("[COLLAB] Collaboration link created:", result.shareableLink);

      // Show success message
      alert(result.message);

      // Refresh the view to show collaboration status
      refreshMemoryView();
    } else {
      console.error(
        "[COLLAB] Failed to create collaboration link:",
        result.error
      );
      alert(`Failed to create collaboration link: ${result.error}`);
    }
  } catch (error) {
    console.error("[COLLAB] Error creating collaboration:", error);
    alert(`Error creating collaboration: ${error.message}`);
  }
}

async function handleTestConnection() {
  console.log("[COLLAB] handleTestConnection called");

  if (!window.collaboration) {
    console.error("[COLLAB] Collaboration module not available");
    alert("Collaboration module not loaded");
    return;
  }

  try {
    console.log("[COLLAB] Testing connection...");
    const result = await window.collaboration.testConnection();

    console.log("[COLLAB] testConnection result:", result);

    if (result.success) {
      console.log("[COLLAB] Connection test completed");
      alert("Connection test completed. Check console for details.");
    } else {
      console.error("[COLLAB] Connection test failed:", result.error);
      alert(`Connection test failed: ${result.error}`);
    }
  } catch (error) {
    console.error("[COLLAB] Error testing connection:", error);
    alert(`Error testing connection: ${error.message}`);
  }
}

async function handleTriggerDiscovery() {
  console.log("[COLLAB] handleTriggerDiscovery called");

  if (!window.collaboration) {
    console.error("[COLLAB] Collaboration module not available");
    alert("Collaboration module not loaded");
    return;
  }

  try {
    console.log("[COLLAB] Triggering peer discovery...");
    const result = await window.collaboration.triggerPeerDiscovery();

    console.log("[COLLAB] triggerPeerDiscovery result:", result);

    if (result.success) {
      console.log("[COLLAB] Peer discovery triggered");
      alert("Peer discovery triggered. Check console for details.");
    } else {
      console.error("[COLLAB] Peer discovery failed:", result.error);
      alert(`Peer discovery failed: ${result.error}`);
    }
  } catch (error) {
    console.error("[COLLAB] Error triggering peer discovery:", error);
    alert(`Error triggering peer discovery: ${error.message}`);
  }
}

function escapeHtml(text) {
  if (window.utils?.escapeHtml) {
    return window.utils.escapeHtml(text);
  }
  // Fallback implementation
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

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

// Export functions for global access
window.memoryView = {
  renderMemoryView,
  refreshMemoryView,
  applyContextHighlighting,
  setupMemoryViewEventListeners,
};
