// =================== Artifacts Group Management ===================
// Functions for managing artifact groups and hierarchical organization

function createGroup(name, parentId = null) {
  const activeChatId = window.context?.getActiveChatId();
  if (!activeChatId) return null;
  
  const currentMessageId = window.context?.getCurrentMessageId?.() || 'group-' + Date.now();
  
  // Create a group artifact (no content needed for groups)
  const group = {
    id: Date.now().toString(),
    title: name,
    type: 'group',
    versions: [{ content: '', timestamp: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageId: currentMessageId,
    chatId: activeChatId,
    parentId: parentId
  };
  
  const currentArtifacts = window.context?.getArtifacts() || [];
  window.context?.setContext({ artifacts: [...currentArtifacts, group] });
  window.memory?.saveArtifacts();
  

  
  return group;
}

function moveArtifact(artifactId, targetGroupId) {
  const artifacts = (window.context?.getArtifacts() || []).slice();
  const activeChatId = window.context?.getActiveChatId();
  
  const artifact = artifacts.find(a => a.id === artifactId && a.chatId === activeChatId);
  const targetGroup = artifacts.find(a => a.id === targetGroupId && a.chatId === activeChatId);
  
  if (!artifact) return false;
  
  // Validate target is a group (or null for root)
  if (targetGroupId && (!targetGroup || targetGroup.type !== 'group')) {
    return false;
  }
  
  // Prevent moving a group into itself or its descendants
  if (artifact.type === 'group' && targetGroupId) {
    if (isDescendantOf(targetGroupId, artifactId, artifacts)) {
      return false;
    }
  }
  
  // Update parent relationship
  artifact.parentId = targetGroupId;
  artifact.updatedAt = new Date().toISOString();
  
  window.context?.setContext({ artifacts });
  window.memory?.saveArtifacts();
  

  
  return true;
}

function deleteGroup(groupId) {
  const artifacts = (window.context?.getArtifacts() || []).slice();
  const activeChatId = window.context?.getActiveChatId();
  
  const group = artifacts.find(a => a.id === groupId && a.chatId === activeChatId);
  if (!group || group.type !== 'group') return false;
  
  // Move all children to root level (parentId = null)
  artifacts.forEach(artifact => {
    if (artifact.parentId === groupId) {
      artifact.parentId = null;
      artifact.updatedAt = new Date().toISOString();
    }
  });
  
  // Remove the group itself
  const updatedArtifacts = artifacts.filter(a => a.id !== groupId);
  
  window.context?.setContext({ artifacts: updatedArtifacts });
  window.memory?.saveArtifacts();
  

  
  return true;
}

function isDescendantOf(potentialDescendantId, ancestorId, artifacts) {
  const descendant = artifacts.find(a => a.id === potentialDescendantId);
  if (!descendant || !descendant.parentId) return false;
  
  if (descendant.parentId === ancestorId) return true;
  
  return isDescendantOf(descendant.parentId, ancestorId, artifacts);
}

// Export group management functions
const groupsModule = {
  createGroup,
  moveArtifact,
  deleteGroup,
  isDescendantOf
};

// Make available globally
if (typeof window !== 'undefined') {
  window.groupsModule = groupsModule;
}