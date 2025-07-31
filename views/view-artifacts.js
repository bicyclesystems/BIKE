// =================== Artifacts View ===================

// Debug function to test artifact creation and view
function debugArtifactsView() {
  console.log("[ARTIFACTS-VIEW-DEBUG] Debugging artifacts view:");
  console.log("  - Context artifacts:", window.context?.getArtifacts()?.length || 0);
  console.log("  - Current chat artifacts:", window.context?.getCurrentChatArtifacts()?.length || 0);
  console.log("  - Active chat ID:", window.context?.getActiveChatId());
  console.log("  - Collaboration state:", {
    isCollaborating: window.collaboration?.isCollaborating,
    isLeader: window.collaboration?.isLeader,
    collaborationActive: localStorage.getItem("collaborationActive")
  });
  
  // Test creating a simple artifact
  if (window.artifactsModule?.createArtifact) {
    console.log("[ARTIFACTS-VIEW-DEBUG] Testing artifact creation...");
    window.artifactsModule.createArtifact(
      "Test artifact for debugging",
      "test-message-id",
      "text"
    ).then(testArtifact => {
      console.log("[ARTIFACTS-VIEW-DEBUG] Test artifact created:", testArtifact?.id);
    }).catch(error => {
      console.error("[ARTIFACTS-VIEW-DEBUG] Error creating test artifact:", error);
    });
  } else {
    console.warn("[ARTIFACTS-VIEW-DEBUG] Artifacts module not available");
  }
}

// Make debug function globally available
window.debugArtifactsView = debugArtifactsView;

// Function to test database sync
function testDatabaseSync() {
  console.log("[ARTIFACTS-VIEW-DEBUG] Testing database sync...");
  
  // Check sync status
  if (window.syncManager?.getStatus) {
    const status = window.syncManager.getStatus();
    console.log("[ARTIFACTS-VIEW-DEBUG] Sync status:", status);
  }
  
  // Check collaboration protection
  const isCollabProtected = window.isCollaborationProtected ? window.isCollaborationProtected() : false;
  console.log("[ARTIFACTS-VIEW-DEBUG] Collaboration protection:", isCollabProtected);
  
  // Force enable sync if needed
  if (window.enableDatabaseSync) {
    console.log("[ARTIFACTS-VIEW-DEBUG] Force enabling database sync...");
    window.enableDatabaseSync();
  }
  
  // Test artifact creation
  if (window.artifactsModule?.createArtifact) {
    console.log("[ARTIFACTS-VIEW-DEBUG] Creating test artifact for sync...");
    window.artifactsModule.createArtifact(
      "Database sync test artifact",
      "sync-test-message-id",
      "text"
    ).then(testArtifact => {
      console.log("[ARTIFACTS-VIEW-DEBUG] Test artifact created:", testArtifact?.id);
    }).catch(error => {
      console.error("[ARTIFACTS-VIEW-DEBUG] Error creating test artifact:", error);
    });
  }
}

window.testDatabaseSync = testDatabaseSync;

// Function to test the new versioning system
function testVersioningSystem() {
  console.log("[ARTIFACTS-VIEW-DEBUG] Testing versioning system...");
  
  // Create a test artifact
  if (window.artifactsModule?.createArtifact) {
    console.log("[ARTIFACTS-VIEW-DEBUG] Creating test artifact...");
    window.artifactsModule.createArtifact(
      "Versioning test artifact",
      "version-test-message-id",
      "text"
    ).then(testArtifact => {
      if (testArtifact) {
        console.log("[ARTIFACTS-VIEW-DEBUG] Test artifact created:", testArtifact.id);
        
        // Test updating the artifact
        setTimeout(async () => {
          console.log("[ARTIFACTS-VIEW-DEBUG] Testing artifact update...");
          const updateResult = await window.artifactsModule.updateArtifact(testArtifact.id, "Updated content for versioning test");
          console.log("[ARTIFACTS-VIEW-DEBUG] Update result:", updateResult);
          
          // Check version structure
          const updatedArtifact = window.context?.getArtifact(testArtifact.id);
          if (updatedArtifact) {
            console.log("[ARTIFACTS-VIEW-DEBUG] Updated artifact versions:", updatedArtifact.versions);
            console.log("[ARTIFACTS-VIEW-DEBUG] Latest version (index 0):", updatedArtifact.versions[0]);
            console.log("[ARTIFACTS-VIEW-DEBUG] Previous version (index 1):", updatedArtifact.versions[1]);
          }
        }, 1000);
      }
    }).catch(error => {
      console.error("[ARTIFACTS-VIEW-DEBUG] Error creating test artifact:", error);
    });
  } else {
    console.warn("[ARTIFACTS-VIEW-DEBUG] Artifacts module not available");
  }
}

window.testVersioningSystem = testVersioningSystem;

// Function to debug database state and check existing artifacts
function debugDatabaseState() {
  console.log("[ARTIFACTS-VIEW-DEBUG] Debugging database state...");
  
  // Check if Supabase is available
  if (!window.supabase || !window.SUPABASE_CONFIG) {
    console.warn("[ARTIFACTS-VIEW-DEBUG] Supabase not available");
    return;
  }
  
  // Create Supabase client
  const supabaseClient = window.supabase.createClient(
    window.SUPABASE_CONFIG.url,
    window.SUPABASE_CONFIG.key
  );
  
  // Get all artifacts from database
  supabaseClient
    .from("artifacts")
    .select("*")
    .then(({ data, error }) => {
      if (error) {
        console.error("[ARTIFACTS-VIEW-DEBUG] Error fetching artifacts from DB:", error);
        return;
      }
      
      console.log("[ARTIFACTS-VIEW-DEBUG] Database artifacts:", data);
      console.log("[ARTIFACTS-VIEW-DEBUG] Database artifact IDs:", data?.map(a => a.id) || []);
      
      // Compare with local artifacts
      const localArtifacts = window.context?.getArtifacts() || [];
      console.log("[ARTIFACTS-VIEW-DEBUG] Local artifacts:", localArtifacts);
      console.log("[ARTIFACTS-VIEW-DEBUG] Local artifact IDs:", localArtifacts.map(a => a.id));
      
      // Find mismatches
      const localIds = new Set(localArtifacts.map(a => a.id));
      const dbIds = new Set(data?.map(a => a.id) || []);
      
      const missingInDB = localArtifacts.filter(a => !dbIds.has(a.id));
      const missingInLocal = data?.filter(a => !localIds.has(a.id)) || [];
      
      console.log("[ARTIFACTS-VIEW-DEBUG] Missing in DB:", missingInDB);
      console.log("[ARTIFACTS-VIEW-DEBUG] Missing in local:", missingInLocal);
    });
}

window.debugDatabaseState = debugDatabaseState;

// Function to manually create an artifact in the database for testing
function createTestArtifactInDB() {
  console.log("[ARTIFACTS-VIEW-DEBUG] Creating test artifact in database...");
  
  // Check if Supabase is available
  if (!window.supabase || !window.SUPABASE_CONFIG) {
    console.warn("[ARTIFACTS-VIEW-DEBUG] Supabase not available");
    return;
  }
  
  // Create Supabase client
  const supabaseClient = window.supabase.createClient(
    window.SUPABASE_CONFIG.url,
    window.SUPABASE_CONFIG.key
  );
  
  // Create a test artifact
  const testArtifact = {
    id: Date.now().toString(),
    title: "Test Artifact for DB",
    type: "text",
    versions: [{
      content: "Test content",
      timestamp: new Date().toISOString(),
      editedBy: "test"
    }],
    chat_id: window.context?.getActiveChatId() || "test-chat",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  console.log("[ARTIFACTS-VIEW-DEBUG] Test artifact to insert:", testArtifact);
  
  // Insert into database
  supabaseClient
    .from("artifacts")
    .insert(testArtifact)
    .select()
    .single()
    .then(({ data, error }) => {
      if (error) {
        console.error("[ARTIFACTS-VIEW-DEBUG] Error creating test artifact:", error);
        return;
      }
      
      console.log("[ARTIFACTS-VIEW-DEBUG] Test artifact created successfully:", data);
      
      // Try to update it immediately
      setTimeout(() => {
        console.log("[ARTIFACTS-VIEW-DEBUG] Testing update of created artifact...");
        const updatedVersions = [
          {
            content: "Updated test content",
            timestamp: new Date().toISOString(),
            editedBy: "test"
          },
          ...testArtifact.versions
        ];
        
        supabaseClient
          .from("artifacts")
          .update({ 
            versions: updatedVersions,
            updated_at: new Date().toISOString()
          })
          .eq("id", testArtifact.id)
          .select()
          .single()
          .then(({ data: updateData, error: updateError }) => {
            if (updateError) {
              console.error("[ARTIFACTS-VIEW-DEBUG] Error updating test artifact:", updateError);
              return;
            }
            
            console.log("[ARTIFACTS-VIEW-DEBUG] Test artifact updated successfully:", updateData);
          });
      }, 1000);
    });
}

window.createTestArtifactInDB = createTestArtifactInDB;

// Function to check database schema and table structure
function checkDatabaseSchema() {
  console.log("[ARTIFACTS-VIEW-DEBUG] Checking database schema...");
  
  // Check if Supabase is available
  if (!window.supabase || !window.SUPABASE_CONFIG) {
    console.warn("[ARTIFACTS-VIEW-DEBUG] Supabase not available");
    return;
  }
  
  // Create Supabase client
  const supabaseClient = window.supabase.createClient(
    window.SUPABASE_CONFIG.url,
    window.SUPABASE_CONFIG.key
  );
  
  // Check if artifacts table exists and get its structure
  supabaseClient
    .from("artifacts")
    .select("*")
    .limit(1)
    .then(({ data, error }) => {
      if (error) {
        console.error("[ARTIFACTS-VIEW-DEBUG] Error accessing artifacts table:", error);
        console.log("[ARTIFACTS-VIEW-DEBUG] This might indicate the table doesn't exist or has different permissions");
        return;
      }
      
      console.log("[ARTIFACTS-VIEW-DEBUG] Artifacts table is accessible");
      console.log("[ARTIFACTS-VIEW-DEBUG] Sample data structure:", data?.[0] ? Object.keys(data[0]) : "No data");
      
      // Get total count
      supabaseClient
        .from("artifacts")
        .select("*", { count: 'exact' })
        .then(({ count, error: countError }) => {
          if (countError) {
            console.error("[ARTIFACTS-VIEW-DEBUG] Error getting count:", countError);
            return;
          }
          
          console.log("[ARTIFACTS-VIEW-DEBUG] Total artifacts in database:", count);
        });
    });
}

window.checkDatabaseSchema = checkDatabaseSchema;

// Function to manually insert a specific artifact into the database
function insertArtifactToDB(artifactId) {
  console.log("[ARTIFACTS-VIEW-DEBUG] Manually inserting artifact to database:", artifactId);
  
  // Check if Supabase is available
  if (!window.supabase || !window.SUPABASE_CONFIG) {
    console.warn("[ARTIFACTS-VIEW-DEBUG] Supabase not available");
    return;
  }
  
  // Get the artifact from local context
  const artifact = window.context?.getArtifact(artifactId);
  if (!artifact) {
    console.error("[ARTIFACTS-VIEW-DEBUG] Artifact not found in local context:", artifactId);
    return;
  }
  
  console.log("[ARTIFACTS-VIEW-DEBUG] Local artifact to insert:", artifact);
  
  // Create Supabase client
  const supabaseClient = window.supabase.createClient(
    window.SUPABASE_CONFIG.url,
    window.SUPABASE_CONFIG.key
  );
  
  // Prepare artifact for database insertion
  const dbArtifact = {
    id: artifact.id,
    title: artifact.title,
    type: artifact.type,
    versions: artifact.versions,
    chat_id: artifact.chatId,
    created_at: artifact.createdAt || new Date().toISOString(),
    updated_at: artifact.updatedAt || new Date().toISOString()
  };
  
  console.log("[ARTIFACTS-VIEW-DEBUG] Database artifact format:", dbArtifact);
  
  // Insert into database
  supabaseClient
    .from("artifacts")
    .insert(dbArtifact)
    .select()
    .single()
    .then(({ data, error }) => {
      if (error) {
        console.error("[ARTIFACTS-VIEW-DEBUG] Error inserting artifact:", error);
        return;
      }
      
      console.log("[ARTIFACTS-VIEW-DEBUG] Artifact inserted successfully:", data);
      
      // Try to update it immediately to test the update functionality
      setTimeout(() => {
        console.log("[ARTIFACTS-VIEW-DEBUG] Testing update of inserted artifact...");
        const updatedVersions = [
          {
            content: "Test update content",
            timestamp: new Date().toISOString(),
            editedBy: "test-insert"
          },
          ...artifact.versions
        ];
        
        supabaseClient
          .from("artifacts")
          .eq("id", artifact.id)
          .update({ 
            versions: updatedVersions,
            updated_at: new Date().toISOString()
          })
          .select()
          .single()
          .then(({ data: updateData, error: updateError }) => {
            if (updateError) {
              console.error("[ARTIFACTS-VIEW-DEBUG] Error updating inserted artifact:", updateError);
              return;
            }
            
            console.log("[ARTIFACTS-VIEW-DEBUG] Inserted artifact updated successfully:", updateData);
          });
      }, 1000);
    });
}

window.insertArtifactToDB = insertArtifactToDB;

function renderArtifactsView(data) {
  console.log('[ARTIFACTS-VIEW] renderArtifactsView called with data:', data);
  
  // For collaborators, show all artifacts from all chats
  // For leaders, show only artifacts from active chat
  const isCollaborator = window.collaboration?.isCollaborating && !window.collaboration?.isLeader;
  
  let artifacts;
  if (isCollaborator) {
    artifacts = window.context?.getArtifacts() || []; // All artifacts for collaborators
  } else {
    artifacts = window.context?.getCurrentChatArtifacts() || []; // Only active chat for leaders
  }
  
  console.log('[ARTIFACTS-VIEW] Found artifacts:', artifacts.length, 'isCollaborator:', isCollaborator);
  
  // Group artifacts by their base artifact (same id) to show all versions together
  const artifactGroups = {};
  artifacts.forEach(artifact => {
    if (!artifactGroups[artifact.id]) {
      artifactGroups[artifact.id] = [];
    }
    artifactGroups[artifact.id].push(artifact);
  });
  
  // Convert to array and sort each group by version timestamp
  const groupedArtifacts = Object.values(artifactGroups).map(group => 
    group.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  );
  
  if (groupedArtifacts.length === 0) {
    const emptyMessage = isCollaborator 
      ? "No artifacts available in this collaboration session yet"
      : "No artifacts in this chat yet";
    const subMessage = isCollaborator
      ? "The leader will create artifacts that you can view here"
      : "Create some content to see it here";
      
    return `
      <div class="column align-center justify-center padding-xl">
        <div class="text-xl opacity-s">📁</div>
        <div class="text-m opacity-s">${emptyMessage}</div>
        <div class="text-s opacity-s">${subMessage}</div>
      </div>
    `;
  }
  
  const headerTitle = isCollaborator ? "All Artifacts" : "Artifacts";
  const headerSubtitle = isCollaborator ? "from all chats" : "";
  
  // Check if collaborator can edit artifacts
  const canEditArtifacts = window.collaboration?.canPerformAction('editArtifact') || false;
  
  let html = `
    <div class="column gap-l padding-l">
      <div class="row align-center gap-s">
        <div class="text-xl">🎨</div>
        <h2 class="text-xl">${headerTitle}</h2>
        <div class="background-tertiary padding-xs radius-s text-s opacity-s">${groupedArtifacts.length}</div>
        ${isCollaborator && canEditArtifacts ? '<div class="background-primary padding-xs radius-s text-s">✏️ Can Edit</div>' : ''}
        ${isCollaborator && !canEditArtifacts ? '<div class="background-secondary padding-xs radius-s text-s">👁️ View Only</div>' : ''}
      </div>
      ${headerSubtitle ? `<div class="text-s opacity-s">${headerSubtitle}</div>` : ''}
      ${isCollaborator ? `<div class="text-s opacity-s">${canEditArtifacts ? 'You can edit artifacts by saying "edit artifact [title]" in chat' : 'You can only view artifacts - ask leader for edit permissions'}</div>` : ''}
      <div class="row gap-m" style="flex-wrap: wrap;">`;
  
  // Render each artifact group (with all versions)
  groupedArtifacts.forEach(artifactGroup => {
    const latestArtifact = artifactGroup[0]; // First one is the latest due to sorting
    
    // Safety checks for artifact structure
    if (!latestArtifact || !latestArtifact.versions || !Array.isArray(latestArtifact.versions) || latestArtifact.versions.length === 0) {
      console.warn('[ARTIFACTS] Skipping malformed artifact:', latestArtifact);
      return;
    }
    
    // Get current version index - default to 0 (latest version) since we now store latest first
    const currentVersionIdx = window.context?.getActiveVersionIndex(latestArtifact.id) ?? 0;
    const currentVersion = latestArtifact.versions[currentVersionIdx];
    
    // Safety check for current version
    if (!currentVersion || !currentVersion.content) {
      console.warn('[ARTIFACTS] Skipping artifact with invalid version:', latestArtifact.id, currentVersion);
      return;
    }
    
    const versionCount = latestArtifact.versions.length;
    const hasMultipleVersions = versionCount > 1;
    
    let preview = currentVersion.content.substring(0, 100) + '...';
    let typeEmoji = '📄';
    
    if (latestArtifact.type === 'link') {
      const url = currentVersion.content.trim();
      const domain = window.utils.getDomainFromUrl ? window.utils.getDomainFromUrl(url) : 'unknown';
      const contentType = window.artifactView?.detectLinkContentType ? 
        window.artifactView.detectLinkContentType(url) : 'webpage';
      
      switch (contentType) {
        case 'image':
          typeEmoji = '🖼️';
          preview = `Image from ${domain}`;
          break;
        case 'video':
          typeEmoji = '🎥';
          preview = `Video from ${domain}`;
          break;
        case 'pdf':
          typeEmoji = '📄';
          preview = `PDF from ${domain}`;
          break;
        case 'code':
          typeEmoji = '💻';
          preview = `Repository on ${domain}`;
          break;
        default:
          typeEmoji = '🌐';
          preview = `Website: ${domain}`;
          break;
      }
    } else if (latestArtifact.type === 'files') {
      try {
        const fileData = JSON.parse(currentVersion.content);
        const fileSize = window.artifactsModule.formatFileSize(fileData.size);
        const fileIcon = window.artifactsModule.getFileIcon(fileData.name, fileData.type);
        typeEmoji = fileIcon;
        preview = `${fileData.name} (${fileSize})`;
      } catch (e) {
        typeEmoji = '📁';
        preview = 'File (invalid data)';
      }
    } else if (currentVersion.content && currentVersion.content.startsWith('```')) {
      typeEmoji = '💻';
      const codeMatch = currentVersion.content.match(/```(\w+)?/);
      const language = codeMatch && codeMatch[1] ? codeMatch[1] : 'code';
      preview = `${language.charAt(0).toUpperCase() + language.slice(1)} code`;
    } else if (currentVersion.content && currentVersion.content.startsWith('[[image:')) {
      typeEmoji = '🖼️';
      preview = 'Image';
    }
    
    // For file artifacts, add emoji to title for display
    let displayTitle = latestArtifact.title;
    if (latestArtifact.type === 'files') {
      try {
        const fileData = JSON.parse(currentVersion.content);
        const fileIcon = window.artifactsModule.getFileIcon(fileData.name, fileData.type);
        displayTitle = artifact.title; // Keep title clean, emoji handled separately
      } catch (e) {
        displayTitle = artifact.title;
      }
    }
    
    const escapedTitle = window.utils?.escapeHtml ? window.utils.escapeHtml(displayTitle) : displayTitle;
    const escapedPreview = window.utils?.escapeHtml ? window.utils.escapeHtml(preview) : preview;
    const escapedId = window.utils?.escapeHtml ? window.utils.escapeHtml(latestArtifact.id) : latestArtifact.id;
    

    
    // Handle click behavior differently for link artifacts
    let clickHandler;
    if (latestArtifact.type === 'link') {
      const url = currentVersion.content.trim();
      const escapedUrl = window.utils.escapeHtml ? window.utils.escapeHtml(url) : url;
      clickHandler = `onclick="window.open('${escapedUrl}', '_blank', 'noopener,noreferrer')"`;
    } else {
      clickHandler = `onclick="console.log('[ARTIFACTS] Clicking artifact:', '${escapedId}'); window.context.setActiveView('artifact', { artifactId: '${escapedId}' })"`;
    }
    
    // Enhanced version indicator with expandable version history
    let versionIndicator = '';
    if (hasMultipleVersions) {
      const isCurrentVersion = currentVersionIdx === 0; // Latest version is now at index 0
      const versionHistoryId = `version-history-${latestArtifact.id}`;
      
      versionIndicator = `
        <div class="column gap-xs">
          <div class="row align-center gap-xs background-tertiary padding-xs radius-s transition" 
               onclick="event.stopPropagation(); toggleVersionHistory('${versionHistoryId}')">
            <span class="text-s">📚</span>
            <span class="text-s">${versionCount} versions</span>
          </div>
          
          <div class="row align-center gap-xs">
            <div class="background-${!isCurrentVersion ? 'negative' : 'positive'} foreground-primary padding-xs radius-s text-xs">
              v${currentVersionIdx + 1}
            </div>
            ${!isCurrentVersion ? '<div class="text-xs color-negative">⚠️ Older</div>' : '<div class="text-xs color-positive">✓ Current</div>'}
          </div>
          
          <div class="column gap-xs background-primary padding-m radius-s transition" id="${versionHistoryId}" style="display: block;">
            <div class="text-s color-primary">Version History</div>
            <div class="column gap-xs">
                             ${latestArtifact.versions.map((version, idx) => {
                 const isActive = idx === currentVersionIdx;
                 const timestamp = new Date(version.timestamp).toLocaleString();
                 const versionNumber = latestArtifact.versions.length - idx; // Reverse numbering since latest is at index 0
                 return `
                   <div class="row align-center gap-s padding-s radius-s transition artifact-version-item ${isActive ? 'background-secondary' : 'background-tertiary'}" 
                        data-artifact-id="${latestArtifact.id}" 
                        data-version-idx="${idx}"
                        style="cursor: pointer; border: calc(var(--base-size) * 0.25) solid var(--color-tertiary-background); opacity: ${isActive ? '1' : '0.7'};"
                        onmouseover="this.style.opacity='1'; this.style.background='var(--color-tertiary-background)'; this.style.transform='translateX(calc(var(--base-size) * 1))'"
                        onmouseout="this.style.opacity='${isActive ? '1' : '0.7'}'; this.style.background='${isActive ? 'var(--color-secondary-background)' : 'var(--color-tertiary-background)'}'; this.style.transform='translateX(0)'"
                        onclick="event.stopPropagation(); window.artifactsView.switchToArtifactVersion('${latestArtifact.id}', ${idx});">
                     <div class="background-${isActive ? 'primary' : 'tertiary'} padding-xs radius-s text-xs">v${versionNumber}</div>
                     <div class="text-xs opacity-s">${timestamp}</div>
                     ${isActive ? '<div class="text-xs color-positive">Current</div>' : ''}
                   </div>
                 `;
               }).join('')}
            </div>
          </div>
        </div>
      `;
    }
    

    
    // Card styling with better visual hierarchy
    const cardClass = `background-secondary padding-l radius-l transition`;
    
    // Add chat information for collaborators
    let chatInfo = '';
    if (isCollaborator && latestArtifact.chatId) {
      const chats = window.context?.getChats() || [];
      const chat = chats.find(c => c.id === latestArtifact.chatId);
      const chatName = chat ? chat.name : `Chat ${latestArtifact.chatId.substring(0, 8)}`;
      chatInfo = `<div class="text-xs opacity-s background-tertiary padding-xs radius-s">📝 ${window.utils.escapeHtml(chatName)}</div>`;
    }
    
    html += `
      <div class="${cardClass}" ${clickHandler} style="min-width: 320px; max-width: 400px; flex: 1;">
        <div class="column gap-m">
          <!-- Header with type and title -->
          <div class="row justify-between align-start gap-m">
            <div class="row align-center gap-m">
              <div class="text-xl">${typeEmoji}</div>
              <div class="column gap-xs">
                <div class="text-l">${escapedTitle}</div>
                <div class="text-s opacity-s">${escapedPreview}</div>
                ${chatInfo}
              </div>
            </div>
            <div class="row align-center gap-s">
              ${versionIndicator}
            </div>
          </div>
          
                     <!-- Metadata footer -->
           <div class="row justify-between align-center gap-m background-tertiary padding-s radius-s">
             <div class="text-xs opacity-s">
               ${hasMultipleVersions ? 
                 `Version ${versionCount - currentVersionIdx} of ${versionCount} • ${new Date(currentVersion.timestamp).toLocaleString()}` :
                 `Updated ${new Date(latestArtifact.updatedAt).toLocaleString()}`
               }
             </div>
             ${hasMultipleVersions ? 
               `<div class="text-xs opacity-s">Created ${new Date(latestArtifact.createdAt).toLocaleString()}</div>` : 
               ''
             }
           </div>
        </div>
      </div>
    `;
  });
  
  html += '</div></div>';
  return html;
}

// =================== Enhanced Artifacts Interaction Functions ===================

function toggleVersionHistory(historyId) {
  const historyElement = document.getElementById(historyId);
  if (!historyElement) return;
  
  // Close all other open version histories first
  const allHistories = document.querySelectorAll('[id^="version-history-"]');
  allHistories.forEach(history => {
    if (history.id !== historyId) {
      window.utils.hideElement(history);
    }
  });
  
  // Toggle the current one
      if (historyElement.style.display === 'none' || !historyElement.style.display) {
    historyElement.style.display = 'block';
    
    // Add click outside to close
    setTimeout(() => {
      document.addEventListener('click', function closeVersionHistory(e) {
        if (!historyElement.contains(e.target) && !e.target.closest('[onclick*="toggleVersionHistory"]')) {
          historyElement.style.display = 'none';
          document.removeEventListener('click', closeVersionHistory);
        }
      });
    }, 100);
  } else {
    historyElement.style.display = 'none';
  }
}

function refreshArtifactsView() {
  // Re-render the artifacts view to reflect version changes
  const activeView = window.context?.getActiveView();
  if (activeView && activeView.type === 'artifacts') {
    if (window.views?.renderCurrentView) {
      window.views.renderCurrentView();
    }
  }
}

// =================== Enhanced Version Management ===================

function switchToArtifactVersion(artifactId, versionIdx) {
  const success = window.artifactsModule.setArtifactVersion(artifactId, versionIdx);
  if (success) {
    // Refresh artifacts to show updated version state
    refreshArtifactsView();
    
    // If the artifact is currently being viewed, update that too
    const activeView = window.context?.getActiveView();
    if (activeView && activeView.type === 'artifact' && 
        activeView.data.artifactId === artifactId) {
      if (window.views?.renderCurrentView) {
        window.views.renderCurrentView();
      }
    }
  }
}

function deleteArtifactVersionFromArtifacts(artifactId, versionIdx) {
  const success = window.artifactsModule.deleteArtifactVersion(artifactId, versionIdx);
  if (success) {
    // Refresh artifacts to show updated version state
    refreshArtifactsView();
  }
}

// =================== Module Exports ===================

// Export view-specific functions for global access
window.artifactsView = {
  renderArtifactsView,
  toggleVersionHistory,
  refreshArtifactsView,
  switchToArtifactVersion,
  deleteArtifactVersionFromArtifacts
};

// Make functions globally available for onclick handlers
window.toggleVersionHistory = toggleVersionHistory; 