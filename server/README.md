# ENARI FPS Matchmaking Server

A Cloudflare Workers-based matchmaking server for the ENARI FPS game. This server provides:

- **Ping-based Matchmaking**: Players with similar latency are grouped together
- **Network Packet Validation**: Anti-cheat system that validates player actions
- **Web UI Dashboard**: Real-time statistics and load management interface
- **Worker Mesh via Trystero**: Distributed load balancing across multiple CF Workers using Trystero/Nostr
- **Player Connections via Trystero**: Same peer-to-peer infrastructure as the game client

## Architecture Overview

This server uses **Trystero** for both:
1. **Worker-to-Worker Communication**: Workers coordinate via Trystero/Nostr for load balancing
2. **Player Connections**: After matchmaking, players receive Trystero room credentials to connect peer-to-peer

This ensures consistency with the game client which also uses Trystero for multiplayer communication.

## Features

### Ping-Based Matchmaking
- Measures player ping through ping/pong exchange
- Groups players with similar latency (within 100ms difference)
- Ensures fair gameplay by matching players with comparable network conditions

### Anti-Cheat Validation
- Speed hack detection (teleportation, velocity manipulation)
- Rapid fire detection
- Packet replay attack prevention
- Sequence number validation
- Position consistency checking

### Web UI Dashboard
- Real-time player count and lobby statistics
- Connected workers status
- Average wait time monitoring
- Load rebalancing controls

### Worker Mesh (via Trystero)
- Multiple CF Workers coordinate via Trystero/Nostr relay
- Encrypted worker-to-worker communication using shared secret
- Automatic load balancing based on region and load
- Player region-aware routing

### Trystero Integration
- Uses same Nostr relay as game client (`wss://nos.lol`)
- Official matchmaking lobbies use `official-lobby-{id}` room prefix
- Custom rooms use `custom-room-{id}` room prefix (handled client-side)
- Worker mesh uses `worker-mesh-{id}` room prefix

## Setup

### Prerequisites
- Node.js 18+
- Cloudflare account with Workers enabled
- Wrangler CLI (`npm install -g wrangler`)

### Installation

```bash
cd server
npm install
```

### Configuration

1. Update `wrangler.toml` with your KV namespace ID:
   ```toml
   [[kv_namespaces]]
   binding = "WORKER_REGISTRY"
   id = "your-kv-namespace-id"
   ```

2. Set environment variables in Cloudflare dashboard or `wrangler.toml`:
   - `WORKER_ID`: Unique identifier for this worker
   - `WORKER_REGION`: Geographic region (e.g., "us-east", "eu-west")
   - `MESH_SECRET`: Secret key for worker-to-worker encryption (change in production!)

### Development

```bash
npm run dev
```

### Deployment

```bash
npm run deploy
```

## API Endpoints

### Matchmaking

- `GET /matchmaking/status` - Get current matchmaking queue status
- `POST /matchmaking/join` - Join matchmaking queue
- `POST /matchmaking/leave` - Leave matchmaking queue
- `POST /matchmaking/ping` - Ping measurement
- `WS /matchmaking` - WebSocket for real-time matchmaking

### Lobby

- `GET /lobby/{id}/status` - Get lobby status
- `POST /lobby/{id}/validate` - Validate a game packet
- `WS /lobby/{id}` - WebSocket for game communication

### Admin

- `GET /` or `GET /admin` - Web UI dashboard
- `GET /api/stats` - JSON statistics
- `POST /api/best-worker` - Get best worker for player region
- `POST /api/rebalance` - Trigger load rebalancing

### Worker Mesh

- `POST /mesh/register` - Register worker in mesh
- `POST /mesh/heartbeat` - Worker heartbeat
- `GET /mesh/workers` - Get active workers
- `POST /mesh/message` - Inter-worker encrypted message

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Edge Network                   │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  Worker 1   │  │  Worker 2   │  │  Worker 3   │   ...   │
│  │  (us-east)  │  │  (eu-west)  │  │ (asia-east) │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                  │
│         └────────────────┼────────────────┘                  │
│                          │                                   │
│              ┌───────────▼───────────┐                      │
│              │    Worker Mesh DO     │                      │
│              │  (Coordination Layer) │                      │
│              └───────────────────────┘                      │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Durable Objects                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │ Matchmaking │  │   Lobby 1   │  │   Lobby 2   │  │   │
│  │  │     DO      │  │     DO      │  │     DO      │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Client Integration

### Connecting to Matchmaking

```typescript
// Connect to matchmaking WebSocket
const ws = new WebSocket('wss://your-worker.your-subdomain.workers.dev/matchmaking');

ws.onopen = () => {
  // Join matchmaking
  ws.send(JSON.stringify({
    type: 'join',
    playerId: 'player_123',
    data: { region: 'us-east' }
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  if (message.type === 'lobbyCreated') {
    // Lobby found! Connect to game server
    console.log('Lobby:', message.lobbyId);
    console.log('Players:', message.players);
    console.log('Is Host:', message.isHost);
  }
};

// Send periodic heartbeats
setInterval(() => {
  ws.send(JSON.stringify({
    type: 'heartbeat',
    playerId: 'player_123'
  }));
}, 10000);
```

### Ping Measurement

```typescript
// Measure ping
const pingStart = Date.now();
ws.send(JSON.stringify({
  type: 'ping',
  playerId: 'player_123',
  data: { timestamp: pingStart }
}));

// Handle pong
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.type === 'pong') {
    const ping = Date.now() - message.timestamp;
    console.log('Ping:', ping, 'ms');
  }
};
```

## License

Part of the ENARI FPS project.
