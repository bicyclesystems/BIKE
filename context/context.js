const AppContext = {
  chats: [], messagesByChat: {}, artifacts: [], activeChatId: null, messages: [],
  activeMessageIndex: -1, messagesContainer: null, viewElement: null, activeView: null,
  activeVersionIdxByArtifact: {}, showAllMessages: false
};

const setContext = (partial) => Object.assign(AppContext, partial);

const getContext = () => {
  const memoryData = window.memory?.getContextData() || {};
  const session = window.user?.getActiveSession();
  
  return {
    authStatus: { isLoggedIn: !!session, currentUser: session?.user?.email || null },
    userPreferences: memoryData.userPreferences || {},
    chats: memoryData.chats || [],
    artifacts: (memoryData.artifacts || []).filter(a => a.chatId === AppContext.activeChatId),
    activeView: AppContext.activeView,
    activeChatId: AppContext.activeChatId,
    messages: AppContext.messages,
    activeVersionIdxByArtifact: AppContext.activeVersionIdxByArtifact
  };
};

window.context = {
  setContext, getContext,
  getActiveChatId: () => AppContext.activeChatId,
  getChats: () => AppContext.chats,
  getMessages: () => AppContext.messages,
  getMessagesByChat: () => AppContext.messagesByChat,
  getActiveView: () => AppContext.activeView,
  getArtifacts: () => AppContext.artifacts,
  getActiveVersionIndex: (id) => AppContext.activeVersionIdxByArtifact[id],
  setActiveVersionIndex: (id, idx) => setContext({ 
    activeVersionIdxByArtifact: { ...AppContext.activeVersionIdxByArtifact, [id]: idx } 
  }),
  getActiveMessageIndex: () => AppContext.activeMessageIndex,
  setActiveMessageIndex: (idx) => setContext({ activeMessageIndex: idx }),
  getShowAllMessages: () => AppContext.showAllMessages,
  setShowAllMessages: (show) => setContext({ showAllMessages: show }),
  getMessagesContainer: () => AppContext.messagesContainer,
  setMessagesContainer: (container) => setContext({ messagesContainer: container }),
  getViewElement: () => AppContext.viewElement,
  setViewElement: (element) => setContext({ viewElement: element })
};