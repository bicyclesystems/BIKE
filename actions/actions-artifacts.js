// =================== Artifacts Actions ===================
// Actions related to artifact management and manipulation
// These actions correspond to operations handled by artifacts.js

const ARTIFACTS_ACTIONS = {
  'artifacts.create': {
    id: 'artifacts.create',
    name: 'Create Artifact',
    description: 'Create a new artifact with content (used by action system, structured responses create artifacts directly)',
    category: window.actions?.ACTION_CATEGORIES?.ARTIFACTS || 'artifacts',
    requiredParams: ['content'],
    optionalParams: ['type', 'messageId'],
    availableData: () => ({
      currentChatArtifacts: window.context?.getCurrentChatArtifacts() || [],
      supportedTypes: ['html', 'markdown', 'text', 'image', 'link']
    }),
    handler: async (params) => {
      const { content, type = null, messageId = Date.now().toString() } = params;
      if (!window.artifactsModule || !window.artifactsModule.createArtifact) {
        return window.actions.createStandardizedResult(
          'artifacts.create',
          'Create Artifact',
          false,
          {},
          'Artifacts module not available',
          'Artifacts module not available'
        );
      }
      const artifact = await window.artifactsModule.createArtifact(content, messageId, type);
      return window.actions.createStandardizedResult(
        'artifacts.create',
        'Create Artifact',
        true,
        { 
          artifactId: artifact.id, 
          title: artifact.title, 
          type: artifact.type, 
          action: 'Created artifact'
        },
        null,
        `Created ${artifact.type} artifact "${artifact.title}"`
      );
    }
  },

  'artifacts.update': {
    id: 'artifacts.update',
    name: 'Update Artifact',
    description: 'Update an existing artifact with new content',
    category: window.actions?.ACTION_CATEGORIES?.ARTIFACTS || 'artifacts',
    requiredParams: ['artifactId', 'content'],
    optionalParams: [],
    availableData: () => ({
      currentChatArtifacts: (window.context?.getCurrentChatArtifacts() || []).map(a => ({
        id: a.id, title: a.title, type: a.type, versionCount: a.versions.length
      }))
    }),
    handler: (params) => {
      const { artifactId, content } = params;
      if (!window.artifactsModule || !window.artifactsModule.updateArtifact) {
        return window.actions.createStandardizedResult(
          'artifacts.update',
          'Update Artifact',
          false,
          {},
          'Artifacts module not available',
          'Artifacts module not available'
        );
      }
      const artifact = window.artifactsModule.updateArtifact(artifactId, content);
      if (!artifact) {
        return window.actions.createStandardizedResult(
          'artifacts.update',
          'Update Artifact',
          false,
          {},
          'Artifact not found or not in current chat',
          'Artifact not found or not in current chat'
        );
      }
      return window.actions.createStandardizedResult(
        'artifacts.update',
        'Update Artifact',
        true,
        { 
          artifactId, 
          title: artifact.title,
          type: artifact.type,
          versionCount: artifact.versions.length, 
          action: 'Updated artifact'
        },
        null,
        `Updated ${artifact.type} artifact "${artifact.title}" (now has ${artifact.versions.length} versions)`
      );
    }
  },

  'artifacts.view': {
    id: 'artifacts.view',
    name: 'View Artifact',
    description: 'View a specific artifact',
    category: window.actions?.ACTION_CATEGORIES?.ARTIFACTS || 'artifacts',
    requiredParams: ['artifactId'],
    optionalParams: [],
    availableData: () => ({
      currentChatArtifacts: (window.context?.getCurrentChatArtifacts() || []).map(a => ({
        id: a.id, title: a.title, type: a.type, createdAt: a.createdAt
      })),
      currentlyViewing: window.context?.getActiveView()?.type === 'artifact' ? window.context?.getActiveView()?.data?.artifactId : null
    }),
    handler: (params) => {
      const { artifactId } = params;
      const artifact = window.context?.findCurrentChatArtifact(artifactId);
      if (!artifact) {
        return window.actions.createStandardizedResult(
          'artifacts.view',
          'View Artifact',
          false,
          {},
          'Artifact not found in current chat',
          'Artifact not found in current chat'
        );
      }
      window.context.setActiveArtifactId(artifactId);
      return window.actions.createStandardizedResult(
        'artifacts.view',
        'View Artifact',
        true,
        { 
          artifactId, 
          title: artifact.title, 
          type: artifact.type, 
          action: 'Viewing artifact'
        },
        null,
        `Now viewing ${artifact.type} artifact "${artifact.title}"`
      );
    }
  }
};

// Register these actions with the core system
if (window.actions && window.actions.registerActions) {
  window.actions.registerActions(ARTIFACTS_ACTIONS);
}

// Also export for direct access
window.artifactsActions = ARTIFACTS_ACTIONS;

 