# BIKE-0.1

Bike is a minimal computing environment where conversation drives creation.

It's not an app. It's not a tool. It's a loop. Chat is the engine. Artifacts are the result.

**Example**: Say "Create a todo list for my project." Bike generates a structured artifact and displays it. Later, say "Add deployment tasks" and it updates seamlessly.

Messages create artifacts. Artifacts are memory. Views are display. Chat drives everything.

## Flow Architecture

**Core Loop:**

user + context ───► input ───► process ───► orchestrate
          ▲                                      │
          │                                      ▼
          │ ◄─────────────────────────────────  chat ←→ view
          │                                      │
          │                                      ▼
          │ ◄─────────────────────────────────  actions ←→ view
          │                                      │
          │                                      ▼
          │ ◄─────────────────────────────────  artifacts ←→ view
          │                                      │
          │                                      ▼
          │ ◄─────────────────────────────────  memory ←→ view
                                                 │
                                                 ▼
                                                sync ←→ integrations
                                                 │                                                  ├── external services
                                                 ├── APIs
                                                 └── webhooks


**Always Active:**
- Chat Interface
- Context State  
- Background Sync

Core components:
* **User** — owns data, initiates interactions. Supports organizations and roles.
* **Context** — active conversation state. Tracks history, artifacts, and participants.
* **Input** — visual interface for capturing messages. Handles UI/UX, context highlighting, and user input processing.
* **System** — prompt builder. Converts app state into AI instructions using modular prompt sections.
* **Process** — AI communication. Handles API calls, message flow, and response coordination.
* **Orchestrate** — response coordinator. Orchestrates AI responses into system changes and operations.
* **Actions** — system commands: create artifacts, switch views, manage chats.
* **Messages** — chat interface (always available)
* **Artifacts** — persistent content units created/modified by messages.
* **View** — current display renderer. Shows artifacts fullscreen with transitions.
* **Memory** — data persistence for artifacts, chats, preferences, and state.
* **Sync** — real-time synchronization between local storage and cloud with offline support.
* **Integrations** — bridges to external services, APIs, and automation workflows.

## Artifacts

Artifacts are persistent conversation memory.

### Types

* **Text** — documents, notes (`@meeting-notes-jan-15`)
* **Image** — visuals, diagrams (`@app-wireframe`)
* **Structured** — lists, tables, calendars (`@project-todos`)  
* **External** — links to files, URLs (`@figma-designs`)

### Features
* Persist across sessions
* Referenceable in chat (`@name`, `#id`)
* Modifiable through conversation
* Linkable and versionable
* Real-time collaboration
* External sync through integrations

## Display System

The View Engine automatically determines display and ensures always-active presentation.

### View Types
* **Artifacts** — grid for multiple artifacts
* **Calendar** — time-based organization
* **Canvas** — freeform spatial layout
* **Document** — structured text
* **Table** — structured data

### Features
* **Single focus** — one view at a time with smooth transitions
* **Auto-display** — based on artifact type and context
* **Minimal UI** — full-screen with minimal chrome
* **Responsive** — adapts to content and screen
* **Fallback chain** — preferred → document → chat view
* **Multi-mode** — 2D/3D/AR support

## Context

Living conversation thread containing:

* Message history and artifact relationships
* Participant state and permissions  
* Current processing flow
* Error recovery state

## Integrations

Extensible bridges connecting BIKE to external services and automation workflows.

### Types
* **Storage** — Google Drive, Dropbox, OneDrive, GitHub repositories
* **Productivity** — Notion, Airtable, Linear, Slack, Discord
* **AI Services** — Custom models, specialized APIs, processing pipelines
* **Webhooks** — Real-time triggers and event-driven automation
* **APIs** — REST endpoints, GraphQL services, custom integrations

### Features
* **Bidirectional sync** — read from and write to external services
* **Event-driven** — trigger actions based on external changes
* **Contextual** — integrate with current conversation and artifacts
* **Conversational** — manage integrations through chat interface
* **Secure** — encrypted connections with proper authentication
* **Extensible** — plugin architecture for custom integrations

### Operations
* Connect/disconnect services through chat commands
* Automatic data synchronization with conflict resolution
* Cross-platform artifact sharing and collaboration
* Real-time notifications and webhook processing
* Custom automation workflows and triggers

## Design Principles

### Rules
* **One view at a time** — focus over multitasking
* **Artifacts = memory** — storage only
* **Views = display** — rendering only
* **Chat is interface** — no separate modes

### Constraints
* No apps — everything through chat
* No modes — consistent interaction
* No empty states — always meaningful display
* No complex UI — minimal chrome
* No manual file management — automatic handling

## Implementation

### Performance
* **Response time**: < 2s for most operations
* **View transitions**: 300-500ms animations
* **Memory usage**: < 500MB base, scales with artifacts
* **Storage**: Local-first with cloud sync

### Error Handling
* Graceful degradation with simpler alternatives
* Retry logic with exponential backoff
* Clear error messages with suggested actions
* Offline support for basic functionality
* Automatic backups and consistency checks

### Data Flow
1. User input → Input interface (UI/UX processing)
2. Context + user state → System module (builds AI instructions)
3. Processed input + system prompt → Process engine (AI communication, content generation & logic)
4. AI response → Orchestrate coordinator (response handling)
5. Actions triggered → Create/Modify artifacts
6. Artifacts saved → Memory layer
7. View updated → View engine
8. Display rendered → User sees result

---

**Philosophy**: No apps. No modes. Just flow.

The system disappears. The conversation remains. The artifacts persist.