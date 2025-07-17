window.liveView = {
  renderLiveView: async function ({ sessionId, userId }) {
    // Wait for Yjs to load if not available
    if (!window.Y) {
      console.log("lol doing it");
      await new Promise((resolve) => {
        const check = () => {
          if (window.Y) resolve();
          else setTimeout(check, 100);
        };
        check();
      });
    }

    const Y = window.Y;
    const WebrtcProvider = window.WebrtcProvider;

    const ydoc = new Y.Doc();
    const provider = new WebrtcProvider(`live-${sessionId}`, ydoc);
    const yArray = ydoc.getArray("chatMessages");

    const container = document.createElement("div");
    container.innerHTML = `
      <div id="live-chat-view" style="padding: 20px; max-width: 600px; margin: auto;">
        <h2>Live Chat: ${sessionId}</h2>
        <div id="messages" style="border: 1px solid #ccc; height: 300px; overflow-y: auto; padding: 10px; background: #f9f9f9;"></div>
        <div style="margin-top: 10px; display: flex;">
          <input id="chatInput" type="text" placeholder="Type a message..." style="flex: 1; padding: 8px;" />
          <button id="sendBtn" style="margin-left: 5px;">Send</button>
        </div>
      </div>
    `;

    setTimeout(() => {
      const messagesDiv = container.querySelector("#messages");
      const input = container.querySelector("#chatInput");
      const sendBtn = container.querySelector("#sendBtn");

      function renderMessages() {
        messagesDiv.innerHTML = "";
        yArray.toArray().forEach((msg) => {
          const div = document.createElement("div");
          div.textContent = `${msg.userId}: ${msg.text}`;
          messagesDiv.appendChild(div);
        });
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      }

      // Observe message changes
      yArray.observe(() => renderMessages());

      // Send message
      function sendMessage() {
        const text = input.value.trim();
        if (text) {
          yArray.push([{ userId, text }]);
          input.value = "";
        }
      }

      sendBtn.addEventListener("click", sendMessage);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") sendMessage();
      });

      renderMessages();
    }, 100);

    return container.outerHTML;
  },
};
