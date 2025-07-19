// Simple WebSocket signaling server for Yjs
// Uses Node.js built-in modules only

const http = require("http");
const crypto = require("crypto");

class SimpleWebSocketServer {
  constructor(port = 4444) {
    this.port = port;
    this.server = null;
    this.clients = new Map(); // ws -> { room, id }
    this.rooms = new Map(); // room -> Set of ws
  }

  start() {
    console.log(
      `[COLLAB] Starting simple WebSocket server on port ${this.port}...`
    );

    this.server = http.createServer((req, res) => {
      if (req.headers.upgrade === "websocket") {
        this.handleWebSocketUpgrade(req, res);
      } else {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Simple WebSocket Server");
      }
    });

    this.server.listen(this.port, () => {
      console.log(`[COLLAB] Server listening on ws://localhost:${this.port}`);
    });
  }

  handleWebSocketUpgrade(req, res) {
    const key = req.headers["sec-websocket-key"];
    if (!key) {
      res.writeHead(400);
      res.end();
      return;
    }

    // Generate accept key
    const acceptKey = crypto
      .createHash("sha1")
      .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
      .digest("base64");

    // Send upgrade response
    res.writeHead(101, {
      Upgrade: "websocket",
      Connection: "Upgrade",
      "Sec-WebSocket-Accept": acceptKey,
    });
    res.end();

    // Handle the WebSocket connection
    const clientId = Math.random().toString(36).substr(2, 9);
    console.log(`[COLLAB] Client connected: ${clientId}`);

    this.clients.set(req.socket, { room: null, id: clientId });

    // Handle incoming data
    req.socket.on("data", (data) => {
      try {
        const message = this.parseWebSocketFrame(req.socket, data);
        if (message) {
          const parsed = JSON.parse(message);
          console.log(`[COLLAB] ${clientId} -> ${JSON.stringify(parsed)}`);
          this.handleMessage(req.socket, parsed);
        }
      } catch (error) {
        console.error(`[COLLAB] Error parsing message:`, error);
      }
    });

    req.socket.on("close", () => {
      console.log(`[COLLAB] Client disconnected: ${clientId}`);
      this.removeClient(req.socket);
    });
  }

  parseWebSocketFrame(ws, data) {
    if (data.length < 2) return null;

    const fin = (data[0] & 0x80) !== 0;
    const opcode = data[0] & 0x0f;
    const masked = (data[1] & 0x80) !== 0;
    let payloadLength = data[1] & 0x7f;
    let offset = 2;

    // Extended payload length
    if (payloadLength === 126) {
      if (data.length < 4) return null;
      payloadLength = data.readUInt16BE(2);
      offset += 2;
    } else if (payloadLength === 127) {
      if (data.length < 10) return null;
      payloadLength = Number(data.readBigUInt64BE(2));
      offset += 8;
    }

    // Masking key
    let maskingKey = null;
    if (masked) {
      if (data.length < offset + 4) return null;
      maskingKey = data.slice(offset, offset + 4);
      offset += 4;
    }

    // Check if we have enough data
    if (data.length < offset + payloadLength) return null;

    // Extract payload
    const payload = data.slice(offset, offset + payloadLength);

    // Unmask if necessary
    if (masked && maskingKey) {
      for (let i = 0; i < payload.length; i++) {
        payload[i] = payload[i] ^ maskingKey[i % 4];
      }
    }

    // Handle different opcodes
    if (opcode === 0x8) {
      // Close frame
      return null;
    } else if (opcode === 0x9) {
      // Ping frame
      this.sendPong(ws);
      return null;
    } else if (opcode === 0x1) {
      // Text frame
      return payload.toString("utf8");
    }

    return null;
  }

  sendPong(ws) {
    const frame = Buffer.alloc(2);
    frame[0] = 0x8a; // FIN + pong frame
    frame[1] = 0x00; // No payload
    ws.write(frame);
  }

  handleMessage(ws, data) {
    const client = this.clients.get(ws);
    if (!client) return;

    console.log(`[COLLAB] ${client.id} -> ${JSON.stringify(data)}`);

    // Handle Yjs protocol messages
    if (data.type === "join" || data.type === "room") {
      this.joinRoom(ws, data.room);
    } else if (data.type === "subscribe" && data.topics) {
      // Yjs sends subscribe messages with topics array
      console.log(
        `[COLLAB] Client ${client.id} subscribing to topics:`,
        data.topics
      );
      if (data.topics.length > 0) {
        this.joinRoom(ws, data.topics[0]); // Join first topic as room
      }
    } else if (data.type === "leave") {
      this.leaveRoom(ws);
    } else if (data.type === "ping") {
      this.send(ws, { type: "pong" });
    } else {
      // Broadcast all other messages to room (WebRTC signaling)
      console.log(`[COLLAB] Broadcasting ${data.type} to room ${client.room}`);
      this.broadcastToRoom(ws, data);
    }
  }

  joinRoom(ws, room) {
    const client = this.clients.get(ws);
    if (!client) return;

    console.log(`[COLLAB] Client ${client.id} joining room: ${room}`);

    // Leave previous room
    this.leaveRoom(ws);

    // Join new room
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room).add(ws);
    client.room = room;

    console.log(
      `[COLLAB] Room ${room} has ${this.rooms.get(room).size} clients`
    );
  }

  leaveRoom(ws) {
    const client = this.clients.get(ws);
    if (!client || !client.room) return;

    const room = client.room;
    const roomSet = this.rooms.get(room);
    if (roomSet) {
      roomSet.delete(ws);
      if (roomSet.size === 0) {
        this.rooms.delete(room);
      }
    }
    client.room = null;
  }

  removeClient(ws) {
    this.leaveRoom(ws);
    this.clients.delete(ws);
  }

  broadcastToRoom(sender, data) {
    const client = this.clients.get(sender);
    if (!client || !client.room) {
      console.log(`[COLLAB] Cannot broadcast - client not in room`);
      return;
    }

    const room = client.room;
    const roomSet = this.rooms.get(room);
    if (!roomSet) {
      console.log(`[COLLAB] Cannot broadcast - room ${room} not found`);
      return;
    }

    console.log(
      `[COLLAB] Broadcasting to ${roomSet.size} clients in room ${room}`
    );

    let sentCount = 0;
    roomSet.forEach((clientWs) => {
      if (clientWs !== sender && !clientWs.destroyed) {
        const targetClient = this.clients.get(clientWs);
        console.log(`[COLLAB] Sending to ${targetClient?.id}: ${data.type}`);
        this.send(clientWs, data);
        sentCount++;
      }
    });

    console.log(`[COLLAB] Sent ${sentCount} messages for ${data.type}`);
  }

  send(ws, data) {
    if (ws && !ws.destroyed) {
      const message = JSON.stringify(data);
      console.log(`[COLLAB] Sending message: ${message}`);
      const frame = this.createWebSocketFrame(message);
      ws.write(frame);
    }
  }

  createWebSocketFrame(data) {
    const payload = Buffer.from(data);
    const length = payload.length;

    // Handle different payload lengths
    let frame;
    if (length < 126) {
      frame = Buffer.alloc(2 + length);
      frame[0] = 0x81; // FIN + text frame
      frame[1] = length;
      payload.copy(frame, 2);
    } else if (length < 65536) {
      frame = Buffer.alloc(4 + length);
      frame[0] = 0x81; // FIN + text frame
      frame[1] = 126; // Extended payload length (16-bit)
      frame.writeUInt16BE(length, 2);
      payload.copy(frame, 4);
    } else {
      frame = Buffer.alloc(10 + length);
      frame[0] = 0x81; // FIN + text frame
      frame[1] = 127; // Extended payload length (64-bit)
      frame.writeBigUInt64BE(BigInt(length), 2);
      payload.copy(frame, 10);
    }

    return frame;
  }

  stop() {
    if (this.server) {
      this.server.close();
      console.log("[COLLAB] Server stopped");
    }
  }
}

// Start server if run directly
if (require.main === module) {
  const server = new SimpleWebSocketServer(4444);
  server.start();

  // Log stats every 10 seconds
  setInterval(() => {
    const stats = {
      clients: server.clients.size,
      rooms: server.rooms.size,
      roomsInfo: Array.from(server.rooms.entries()).map(([room, clients]) => ({
        room,
        clients: clients.size,
      })),
    };
    console.log(`[COLLAB] Stats:`, stats);
  }, 10000);

  process.on("SIGINT", () => {
    console.log("\n[COLLAB] Shutting down...");
    server.stop();
    process.exit(0);
  });
}

module.exports = SimpleWebSocketServer;
