/**
 * ENARI FPS Matchmaking Server
 * Cloudflare Workers entry point
 * 
 * Features:
 * - Ping-based matchmaking to group players with similar latency
 * - Network packet validation for anti-cheat
 * - Web UI for load management and statistics
 * - Worker mesh for distributed load balancing via Trystero
 * - Player connections via Trystero (same as game client)
 */

import type { 
  Env, 
  PlayerInfo, 
  LobbyInfo, 
  MatchmakingMessage, 
  PingRequest, 
  GamePacket,
  ServerStats
} from './types'
import { 
  createPingResponse, 
  recordPingSample, 
  getAveragePing, 
  clearPingHistory,
  selectPlayersForLobby
} from './ping'
import { validatePacket, clearValidationState, getViolationSummary } from './validation'
import { generateDashboardHTML, generateStatsJSON, collectServerStats } from './webui'
import { WorkerMeshDO, getLocalWorkerLoad, selectBestWorker, getWorkerMeshConfig } from './workers-mesh'

// Re-export Durable Objects
export { WorkerMeshDO }

// Trystero configuration - same as game client for consistency
const NOSTR_RELAY = 'wss://nos.lol'
const APP_ID = 'enari-fps-shooter-v1'

// Server start time for uptime calculation
const SERVER_START_TIME = Date.now()

// Constants
const LOBBY_SIZE = 4
const HEARTBEAT_TIMEOUT = 30000 // 30 seconds

/**
 * Matchmaking Durable Object
 * Handles player queue and lobby creation
 */
export class MatchmakingDO {
  private state: DurableObjectState
  private env: Env
  private players: Map<string, PlayerInfo> = new Map()
  private lobbies: Map<string, LobbyInfo> = new Map()
  private connections: Map<string, WebSocket> = new Map()

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env

    // Load stored state
    this.state.blockConcurrencyWhile(async () => {
      const storedPlayers = await this.state.storage.get<Map<string, PlayerInfo>>('players')
      const storedLobbies = await this.state.storage.get<Map<string, LobbyInfo>>('lobbies')
      if (storedPlayers) this.players = storedPlayers
      if (storedLobbies) this.lobbies = storedLobbies
    })

    // Set up periodic cleanup
    this.state.setAlarm(Date.now() + 10000)
  }

  async alarm(): Promise<void> {
    await this.cleanupInactivePlayers()
    await this.tryCreateLobbies()
    // Schedule next alarm
    this.state.setAlarm(Date.now() + 10000)
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // Handle WebSocket upgrade for real-time matchmaking
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request)
    }

    // REST API endpoints
    switch (url.pathname) {
      case '/join':
        return this.handleJoin(request)
      case '/leave':
        return this.handleLeave(request)
      case '/ping':
        return this.handlePing(request)
      case '/status':
        return this.handleStatus()
      case '/stats':
        return this.handleStats()
      default:
        return new Response('Not found', { status: 404 })
    }
  }

  /**
   * Handle WebSocket connection for real-time matchmaking
   */
  private handleWebSocket(request: Request): Response {
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)

    this.state.acceptWebSocket(server)

    server.addEventListener('message', async (event) => {
      try {
        const message = JSON.parse(event.data as string) as MatchmakingMessage
        await this.handleMessage(server, message)
      } catch (error) {
        server.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }))
      }
    })

    server.addEventListener('close', () => {
      // Find and remove player associated with this connection
      for (const [playerId, ws] of this.connections) {
        if (ws === server) {
          this.removePlayer(playerId)
          break
        }
      }
    })

    return new Response(null, { status: 101, webSocket: client })
  }

  /**
   * Handle incoming WebSocket message
   */
  private async handleMessage(ws: WebSocket, message: MatchmakingMessage): Promise<void> {
    switch (message.type) {
      case 'join':
        await this.addPlayer(message.playerId, ws, message.data?.region as string || 'unknown')
        break
      case 'leave':
        await this.removePlayer(message.playerId)
        break
      case 'heartbeat':
        this.updateHeartbeat(message.playerId)
        break
      case 'ping':
        this.handlePingMessage(ws, message)
        break
    }
  }

  /**
   * Add a player to matchmaking queue
   */
  private async addPlayer(playerId: string, ws: WebSocket, region: string): Promise<void> {
    const playerInfo: PlayerInfo = {
      id: playerId,
      joinedAt: Date.now(),
      ping: -1, // Unknown until measured
      region,
      lastHeartbeat: Date.now()
    }

    this.players.set(playerId, playerInfo)
    this.connections.set(playerId, ws)
    await this.state.storage.put('players', this.players)

    // Notify player they joined
    ws.send(JSON.stringify({
      type: 'joined',
      playerId,
      queuePosition: this.players.size
    }))

    // Try to create lobbies with new player
    await this.tryCreateLobbies()
  }

  /**
   * Remove a player from matchmaking
   */
  private async removePlayer(playerId: string): Promise<void> {
    this.players.delete(playerId)
    this.connections.delete(playerId)
    clearPingHistory(playerId)
    clearValidationState(playerId)
    await this.state.storage.put('players', this.players)
  }

  /**
   * Update player heartbeat
   */
  private updateHeartbeat(playerId: string): void {
    const player = this.players.get(playerId)
    if (player) {
      player.lastHeartbeat = Date.now()
      this.players.set(playerId, player)
    }
  }

  /**
   * Handle ping measurement
   */
  private handlePingMessage(ws: WebSocket, message: MatchmakingMessage): void {
    const pingData = message.data as PingRequest
    const response = createPingResponse(pingData)
    ws.send(JSON.stringify(response))
  }

  /**
   * REST endpoint: Join matchmaking
   */
  private async handleJoin(request: Request): Promise<Response> {
    const { playerId, region } = await request.json() as { playerId: string; region: string }

    const playerInfo: PlayerInfo = {
      id: playerId,
      joinedAt: Date.now(),
      ping: -1,
      region: region || 'unknown',
      lastHeartbeat: Date.now()
    }

    this.players.set(playerId, playerInfo)
    await this.state.storage.put('players', this.players)

    return new Response(JSON.stringify({
      success: true,
      playerId,
      queuePosition: this.players.size
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * REST endpoint: Leave matchmaking
   */
  private async handleLeave(request: Request): Promise<Response> {
    const { playerId } = await request.json() as { playerId: string }
    await this.removePlayer(playerId)

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * REST endpoint: Ping measurement
   */
  private async handlePing(request: Request): Promise<Response> {
    const pingRequest = await request.json() as PingRequest
    const response = createPingResponse(pingRequest)

    // Record ping sample if player is in queue
    const player = this.players.get(pingRequest.playerId)
    if (player) {
      const ping = Date.now() - pingRequest.timestamp
      recordPingSample(pingRequest.playerId, ping)
      player.ping = getAveragePing(pingRequest.playerId)
      this.players.set(pingRequest.playerId, player)
    }

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * REST endpoint: Get matchmaking status
   */
  private handleStatus(): Response {
    return new Response(JSON.stringify({
      playersInQueue: this.players.size,
      activeLobbies: this.lobbies.size,
      players: Array.from(this.players.values()).map(p => ({
        id: p.id,
        ping: p.ping,
        region: p.region,
        waitTime: Math.floor((Date.now() - p.joinedAt) / 1000)
      }))
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * REST endpoint: Get stats for web UI
   */
  private handleStats(): Response {
    return new Response(JSON.stringify({
      playersSearching: this.players.size,
      activeLobbies: this.lobbies.size
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Try to create lobbies from waiting players
   */
  private async tryCreateLobbies(): Promise<void> {
    const playersArray = Array.from(this.players.values())
    
    // Need at least 4 players to create a lobby
    if (playersArray.length < LOBBY_SIZE) return

    // Select players with similar ping
    const selectedPlayers = selectPlayersForLobby(playersArray, LOBBY_SIZE)
    
    if (selectedPlayers.length >= LOBBY_SIZE) {
      await this.createLobby(selectedPlayers.slice(0, LOBBY_SIZE))
    }
  }

  /**
   * Create a new lobby with selected players
   */
  private async createLobby(players: PlayerInfo[]): Promise<void> {
    const lobbyId = `lobby_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
    const hostId = players[0].id // First player is host

    const lobby: LobbyInfo = {
      id: lobbyId,
      players: players.map(p => p.id),
      hostId,
      maxPlayers: LOBBY_SIZE,
      createdAt: Date.now(),
      gameStarted: false,
      workerId: this.env.WORKER_ID,
      region: this.env.WORKER_REGION
    }

    this.lobbies.set(lobbyId, lobby)
    await this.state.storage.put('lobbies', this.lobbies)

    // Trystero configuration for this lobby - players will connect via Trystero
    const trysteroConfig = {
      appId: APP_ID,
      relayUrls: [NOSTR_RELAY],
      roomId: `official-lobby-${lobbyId}` // Official matchmaking prefix
    }

    // Notify all players in the lobby with Trystero connection info
    for (const player of players) {
      const ws = this.connections.get(player.id)
      if (ws) {
        ws.send(JSON.stringify({
          type: 'lobbyCreated',
          lobbyId,
          players: lobby.players,
          hostId,
          isHost: player.id === hostId,
          trystero: trysteroConfig // Include Trystero config for peer-to-peer connection
        }))
      }

      // Remove from queue
      this.players.delete(player.id)
    }

    await this.state.storage.put('players', this.players)
  }

  /**
   * Clean up inactive players
   */
  private async cleanupInactivePlayers(): Promise<void> {
    const now = Date.now()
    let changed = false

    for (const [playerId, player] of this.players) {
      if (now - player.lastHeartbeat > HEARTBEAT_TIMEOUT) {
        this.players.delete(playerId)
        this.connections.delete(playerId)
        clearPingHistory(playerId)
        changed = true
      }
    }

    if (changed) {
      await this.state.storage.put('players', this.players)
    }
  }
}

/**
 * Lobby Durable Object
 * Handles game state for a single lobby
 */
export class LobbyDO {
  private state: DurableObjectState
  private env: Env
  private lobby: LobbyInfo | null = null
  private connections: Map<string, WebSocket> = new Map()

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env

    this.state.blockConcurrencyWhile(async () => {
      this.lobby = await this.state.storage.get<LobbyInfo>('lobby') || null
    })
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request)
    }

    switch (url.pathname) {
      case '/init':
        return this.handleInit(request)
      case '/status':
        return this.handleStatus()
      case '/validate':
        return this.handleValidate(request)
      default:
        return new Response('Not found', { status: 404 })
    }
  }

  /**
   * Handle WebSocket connection for game communication
   */
  private handleWebSocket(request: Request): Response {
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)

    this.state.acceptWebSocket(server)

    server.addEventListener('message', async (event) => {
      try {
        const packet = JSON.parse(event.data as string) as GamePacket
        await this.handleGamePacket(server, packet)
      } catch (error) {
        server.send(JSON.stringify({ type: 'error', message: 'Invalid packet format' }))
      }
    })

    server.addEventListener('close', () => {
      for (const [playerId, ws] of this.connections) {
        if (ws === server) {
          this.handlePlayerDisconnect(playerId)
          break
        }
      }
    })

    return new Response(null, { status: 101, webSocket: client })
  }

  /**
   * Handle incoming game packet
   */
  private async handleGamePacket(ws: WebSocket, packet: GamePacket): Promise<void> {
    // Validate the packet
    const validationResult = validatePacket(packet)

    if (!validationResult.valid) {
      if (validationResult.severity === 'ban') {
        // Kick player from lobby
        ws.send(JSON.stringify({
          type: 'kicked',
          reason: 'Anti-cheat violation: ' + validationResult.reason
        }))
        ws.close()
        return
      }

      if (validationResult.severity === 'violation') {
        // Log violation but allow packet
        console.warn(`Violation from ${packet.playerId}: ${validationResult.reason}`)
      }
    }

    // Broadcast to other players
    this.broadcastToOthers(packet.playerId, packet)
  }

  /**
   * Broadcast packet to all other players
   */
  private broadcastToOthers(senderId: string, packet: GamePacket): void {
    for (const [playerId, ws] of this.connections) {
      if (playerId !== senderId) {
        ws.send(JSON.stringify(packet))
      }
    }
  }

  /**
   * Handle player disconnect
   */
  private handlePlayerDisconnect(playerId: string): void {
    this.connections.delete(playerId)
    clearValidationState(playerId)

    if (this.lobby) {
      this.lobby.players = this.lobby.players.filter(id => id !== playerId)
      
      // Notify remaining players
      this.broadcastToOthers(playerId, {
        type: 'action',
        playerId,
        timestamp: Date.now(),
        sequence: 0,
        data: { action: 'disconnect' }
      })
    }
  }

  /**
   * Initialize lobby
   */
  private async handleInit(request: Request): Promise<Response> {
    this.lobby = await request.json() as LobbyInfo
    await this.state.storage.put('lobby', this.lobby)

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Get lobby status
   */
  private handleStatus(): Response {
    return new Response(JSON.stringify(this.lobby), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Validate a game packet
   */
  private async handleValidate(request: Request): Promise<Response> {
    const packet = await request.json() as GamePacket
    const result = validatePacket(packet)

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

/**
 * Main worker entry point
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    // Route to appropriate handler
    const path = url.pathname

    // Web UI
    if (path === '/' || path === '/admin') {
      const stats = await getServerStats(env)
      return new Response(generateDashboardHTML(stats), {
        headers: { ...corsHeaders, 'Content-Type': 'text/html' }
      })
    }

    // API: Stats JSON
    if (path === '/api/stats') {
      const stats = await getServerStats(env)
      return new Response(generateStatsJSON(stats), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // API: Get best worker for player
    if (path === '/api/best-worker') {
      const { region } = await request.json() as { region: string }
      const result = await selectBestWorker(env, region)
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // API: Rebalance load
    if (path === '/api/rebalance') {
      // TODO: Implement load rebalancing
      return new Response(JSON.stringify({ success: true, message: 'Rebalancing initiated' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Matchmaking endpoints - route to Durable Object
    if (path.startsWith('/matchmaking')) {
      const matchmakingId = env.MATCHMAKING.idFromName('global-matchmaking')
      const matchmakingStub = env.MATCHMAKING.get(matchmakingId)
      
      // Create new URL without the /matchmaking prefix
      const newUrl = new URL(request.url)
      newUrl.pathname = path.replace('/matchmaking', '') || '/'
      
      const response = await matchmakingStub.fetch(new Request(newUrl.toString(), request))
      return new Response(response.body, {
        status: response.status,
        headers: { ...corsHeaders, ...Object.fromEntries(response.headers) }
      })
    }

    // Lobby endpoints - route to Durable Object
    if (path.startsWith('/lobby/')) {
      const lobbyId = path.split('/')[2]
      const lobbyDOId = env.LOBBY.idFromName(lobbyId)
      const lobbyStub = env.LOBBY.get(lobbyDOId)
      
      const newUrl = new URL(request.url)
      newUrl.pathname = path.replace(`/lobby/${lobbyId}`, '') || '/'
      
      const response = await lobbyStub.fetch(new Request(newUrl.toString(), request))
      return new Response(response.body, {
        status: response.status,
        headers: { ...corsHeaders, ...Object.fromEntries(response.headers) }
      })
    }

    // Worker mesh endpoints
    if (path.startsWith('/mesh')) {
      const meshId = env.WORKER_MESH.idFromName('global-mesh')
      const meshStub = env.WORKER_MESH.get(meshId)
      
      const newUrl = new URL(request.url)
      newUrl.pathname = path.replace('/mesh', '') || '/'
      
      const response = await meshStub.fetch(new Request(newUrl.toString(), request))
      return new Response(response.body, {
        status: response.status,
        headers: { ...corsHeaders, ...Object.fromEntries(response.headers) }
      })
    }

    return new Response('Not found', { status: 404, headers: corsHeaders })
  }
}

/**
 * Get server statistics
 */
async function getServerStats(env: Env): Promise<ServerStats> {
  try {
    const matchmakingId = env.MATCHMAKING.idFromName('global-matchmaking')
    const matchmakingStub = env.MATCHMAKING.get(matchmakingId)
    const response = await matchmakingStub.fetch('http://internal/stats')
    const matchmakingStats = await response.json() as { playersSearching: number; activeLobbies: number }

    return collectServerStats(env, matchmakingStats, SERVER_START_TIME)
  } catch {
    return {
      workerId: env.WORKER_ID,
      region: env.WORKER_REGION,
      playersSearching: 0,
      activeLobbies: 0,
      totalPlayersOnline: 0,
      averageWaitTime: 0,
      workerMeshStatus: 'disconnected',
      connectedWorkers: 0,
      uptime: Math.floor((Date.now() - SERVER_START_TIME) / 1000)
    }
  }
}
