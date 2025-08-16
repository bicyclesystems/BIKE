const getContext = () => {
  const session = window.user?.getActiveSession();
  const memoryData = window.memory?.getContextData() || {};
  
  return {
    authStatus: { isLoggedIn: !!session, currentUser: session?.user?.email || null },
    userPreferences: memoryData.userPreferences || {},
    chats: window.chat?.getChats() || [],
    artifacts: window.artifactsModule?.getCurrentChatArtifacts() || [],
    activeView: window.views?.getActiveView(),
    activeChatId: window.chat?.getActiveChatId(),
    messages: window.chat?.getMessages() || []
  };
};

window.context = {
  // ONLY collect current state for AI/debugging context
  getContext
};