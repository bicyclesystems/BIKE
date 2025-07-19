# 🤝 Live Collaboration System

This project includes a real-time collaboration system using Yjs and WebRTC for peer-to-peer communication.

## 🚀 Quick Start

### 1. Start the Signaling Server

First, start the local signaling server:

```bash
node signaling-server.js
```

You should see:
```
[SIGNALING] Starting signaling server on port 4444...
[SIGNALING] Signaling server listening on ws://localhost:4444
```

### 2. Open the Application

Open `index.html` in your browser. The collaboration system will automatically initialize.

### 3. Create a Collaboration Session

1. **Leader**: Click the "Create Link" button
2. **Link is copied to clipboard** automatically
3. **Share the link** with others

### 4. Join a Collaboration Session

1. **Collaborator**: Open the shared collaboration link
2. **Automatically joins** the session
3. **See real-time updates** of connected peers

## 🔧 How It Works

### Architecture
- **Yjs**: CRDT framework for conflict-free real-time editing
- **WebRTC**: Peer-to-peer communication between browsers
- **Local Signaling Server**: WebSocket server for peer discovery
- **STUN Servers**: Google's public STUN servers for NAT traversal

### Features
- ✅ **Real-time collaboration** - Changes sync instantly
- ✅ **Auto-join from URL** - No manual setup required
- ✅ **Peer discovery** - Automatic connection between peers
- ✅ **Session management** - Create, join, and leave sessions
- ✅ **Role distinction** - Leader vs Collaborator UI
- ✅ **Local signaling** - No external dependencies

### UI States

#### Leader (Session Creator)
- Shows "Create Link" button
- After creation: Shows session info with shareable link
- Displays connected peer count

#### Collaborator (Session Joiner)
- Automatically joins when opening link
- Shows session info without "Create Link" button
- Displays connected peer count

## 📊 Debugging

All collaboration logs are prefixed with `[COLLAB]` for easy filtering in the browser console.

### Key Log Messages
- `[COLLAB] Initializing collaboration module...`
- `[COLLAB] Creating collaboration link...`
- `[COLLAB] Auto-joining collaboration: collab-xxx`
- `[COLLAB] Peers event received:`
- `[COLLAB] Peer connected: peer-id`

### Signaling Server Logs
- `[SIGNALING] Starting signaling server...`
- `[SIGNALING] New client connected...`
- `[SIGNALING] Client joining room: room-name`

## 🔍 Troubleshooting

### Common Issues

1. **WebSocket Connection Failed**
   - Make sure the signaling server is running: `node signaling-server.js`
   - Check if port 4444 is available

2. **Peers Not Connecting**
   - Check browser console for `[COLLAB]` logs
   - Verify STUN servers are accessible
   - Check firewall settings

3. **Auto-join Not Working**
   - Ensure URL contains `#/collab-xxx` format
   - Check browser console for auto-join logs

### Network Requirements
- **Local network**: Works on same network
- **Internet**: Requires STUN servers for NAT traversal
- **Firewall**: Allow WebSocket connections on port 4444

## 🛠️ Technical Details

### Files
- `collaboration.js` - Main collaboration module
- `signaling-server.js` - Local WebSocket signaling server
- `views/view-memory.js` - UI integration
- `index.html` - Yjs library imports

### Dependencies
- **Yjs**: Loaded via CDN (Skypack)
- **y-webrtc**: WebRTC provider for Yjs
- **ws**: Node.js WebSocket library (for signaling server)

### Configuration
- **Signaling Server**: `ws://localhost:4444`
- **STUN Servers**: Google's public STUN servers
- **Max Connections**: 20 peers per room
- **Room Naming**: `collab-{random-id}` format

## 🎯 Usage Examples

### Creating a Session
1. Open application in browser
2. Click "Create Link" button
3. Link copied: `http://localhost:5500/#/collab-abc123`
4. Share link with team members

### Joining a Session
1. Open shared collaboration link
2. Automatically joins session
3. See "Live Collaboration Active" status
4. Real-time peer count updates

### Leaving a Session
1. Click "Leave Session" button
2. Returns to normal view
3. Can create new session or join different one

## 🔒 Security Notes

- **Local signaling server** - No external data transmission
- **Peer-to-peer** - Direct browser-to-browser communication
- **No authentication** - Anyone with the link can join
- **Session isolation** - Each room is independent

## 📈 Performance

- **Low latency** - Direct peer connections
- **Scalable** - Multiple rooms supported
- **Efficient** - Only changed data is transmitted
- **Reliable** - Automatic reconnection handling 