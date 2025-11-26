/**
 * TypeScript interfaces for the ENARI FPS Matchmaking Server
 */

// Player state for matchmaking
export interface PlayerInfo {
  id: string
  joinedAt: number
  ping: number // Average ping in ms
  region: string
  lastHeartbeat: number
}

// Lobby state
export interface LobbyInfo {
  id: string
  players: string[]
  hostId: string
  maxPlayers: number
  createdAt: number
  gameStarted: boolean
  workerId: string
  region: string
}

// Ping measurement request/response
export interface PingRequest {
  type: 'ping'
  timestamp: number
  playerId: string
}

export interface PingResponse {
  type: 'pong'
  timestamp: number
  serverTimestamp: number
  playerId: string
}

// Matchmaking messages
export interface MatchmakingMessage {
  type: 'join' | 'leave' | 'heartbeat' | 'ping' | 'lobbyUpdate' | 'gameStart'
  playerId: string
  data?: Record<string, unknown>
}

// Network packet for validation
export interface GamePacket {
  type: 'position' | 'shoot' | 'action'
  playerId: string
  timestamp: number
  sequence: number
  data: PositionData | ShootData | ActionData
  signature?: string
}

export interface PositionData {
  x: number
  y: number
  z: number
  velocityX: number
  velocityY: number
  velocityZ: number
  lookX: number
  lookY: number
  lookZ: number
}

export interface ShootData {
  originX: number
  originY: number
  originZ: number
  directionX: number
  directionY: number
  directionZ: number
  weaponId: string
}

export interface ActionData {
  action: string
  targetId?: string
}

// Validation result
export interface ValidationResult {
  valid: boolean
  reason?: string
  severity?: 'warning' | 'violation' | 'ban'
}

// Worker mesh communication
export interface WorkerInfo {
  id: string
  region: string
  endpoint: string
  lastSeen: number
  load: WorkerLoad
  publicKey: string
}

export interface WorkerLoad {
  activePlayers: number
  activeLobbies: number
  cpuUsage: number
  memoryUsage: number
}

export interface MeshMessage {
  type: 'sync' | 'transfer' | 'balance' | 'heartbeat'
  fromWorkerId: string
  toWorkerId?: string
  timestamp: number
  encrypted: boolean
  payload: string // Encrypted JSON
  signature: string
}

// Trystero configuration for matchmaking
export interface TrysteroConfig {
  appId: string
  relayUrls: string[]
  roomId: string
}

// Lobby creation response with Trystero info
export interface LobbyCreatedResponse {
  type: 'lobbyCreated'
  lobbyId: string
  players: string[]
  hostId: string
  isHost: boolean
  trystero: TrysteroConfig
}

// Web UI stats
export interface ServerStats {
  workerId: string
  region: string
  playersSearching: number
  activeLobbies: number
  totalPlayersOnline: number
  averageWaitTime: number
  workerMeshStatus: 'connected' | 'disconnected' | 'partial'
  connectedWorkers: number
  uptime: number
}

// Environment bindings
export interface Env {
  MATCHMAKING: DurableObjectNamespace
  LOBBY: DurableObjectNamespace
  WORKER_MESH: DurableObjectNamespace
  WORKER_REGISTRY: KVNamespace
  WORKER_ID: string
  WORKER_REGION: string
  MESH_SECRET: string
}
