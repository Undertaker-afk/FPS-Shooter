// @ts-ignore - trystero module resolution
import { joinRoom, selfId } from 'trystero/nostr'
import type { Room } from 'trystero'
import { Player } from '../Core/Player'
import { Vector3D } from '../Core/Vector'
import { Game } from '../Game'
import { PlayerWrapper } from '../Core/PlayerWrapper'
import { ThirdPersonRenderer } from '../View/Renderer/PlayerRenderer/ThirdPersonRenderer'

export interface PlayerState {
  id: string
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number }
  velocity: { x: number; y: number; z: number }
  lookingDirection: { x: number; y: number; z: number }
}

export interface LobbyState {
  players: string[]
  gameStarted: boolean
  hostId: string
}

export interface ShootEvent {
  position: { x: number; y: number; z: number }
  direction: { x: number; y: number; z: number }
}

// Trystero configuration returned by matchmaking server
export interface TrysteroRoomConfig {
  appId: string
  relayUrls: string[]
  roomId: string
}

// Type guards for runtime validation
function isPlayerState(data: unknown): data is PlayerState {
  if (!data || typeof data !== 'object') return false
  const obj = data as Record<string, unknown>
  return typeof obj.id === 'string' &&
    typeof obj.position === 'object' && obj.position !== null &&
    typeof obj.velocity === 'object' && obj.velocity !== null &&
    typeof obj.lookingDirection === 'object' && obj.lookingDirection !== null
}

function isLobbyState(data: unknown): data is LobbyState {
  if (!data || typeof data !== 'object') return false
  const obj = data as Record<string, unknown>
  return Array.isArray(obj.players) &&
    typeof obj.gameStarted === 'boolean' &&
    typeof obj.hostId === 'string'
}

function isShootEvent(data: unknown): data is ShootEvent {
  if (!data || typeof data !== 'object') return false
  const obj = data as Record<string, unknown>
  return typeof obj.position === 'object' && obj.position !== null &&
    typeof obj.direction === 'object' && obj.direction !== null
}

function isGameStartEvent(data: unknown): data is { start: boolean } {
  if (!data || typeof data !== 'object') return false
  const obj = data as Record<string, unknown>
  return typeof obj.start === 'boolean'
}

// Default Nostr relay for peer-to-peer connections
const DEFAULT_NOSTR_RELAY = 'wss://nos.lol'
const APP_ID = 'enari-fps-shooter-v1'
const MAX_PLAYERS = 4

// Matchmaking server URL (set this to your deployed CF Worker URL)
const MATCHMAKING_SERVER_URL = '' // e.g., 'https://enari-fps-matchmaking.your-subdomain.workers.dev'

export class MultiplayerManager {
  private static instance: MultiplayerManager
  private room: Room | null = null
  private matchmakingWs: WebSocket | null = null
  private remotePlayers: Map<string, PlayerWrapper> = new Map()
  private isHost: boolean = false
  private lobbyState: LobbyState | null = null
  private onLobbyUpdateCallback: ((state: LobbyState) => void) | null = null
  private onGameStartCallback: (() => void) | null = null
  private onMatchmakingStatusCallback: ((status: string) => void) | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sendPosition: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sendLobbyState: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sendGameStart: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sendShoot: any = null

  constructor() {
    // Use Trystero's built-in selfId for consistent peer identification
  }

  public static getInstance(): MultiplayerManager {
    if (!MultiplayerManager.instance) {
      MultiplayerManager.instance = new MultiplayerManager()
    }
    return MultiplayerManager.instance
  }

  /**
   * Get local player ID using Trystero's selfId
   * This is consistent across all rooms the player joins
   */
  public getLocalPlayerId(): string {
    return selfId
  }

  public isConnected(): boolean {
    return this.room !== null
  }

  public getRemotePlayers(): Map<string, PlayerWrapper> {
    return this.remotePlayers
  }

  public setOnLobbyUpdate(callback: (state: LobbyState) => void): void {
    this.onLobbyUpdateCallback = callback
  }

  public setOnGameStart(callback: () => void): void {
    this.onGameStartCallback = callback
  }

  public setOnMatchmakingStatus(callback: (status: string) => void): void {
    this.onMatchmakingStatusCallback = callback
  }

  /**
   * Join official matchmaking via CF Workers server
   * The server will measure ping, find compatible players, and return a room config
   */
  public async joinMatchmaking(): Promise<void> {
    console.log('Joining official matchmaking...')
    
    if (MATCHMAKING_SERVER_URL) {
      // Connect to CF Workers matchmaking server
      await this.connectToMatchmakingServer()
    } else {
      // Fallback: Use a shared lobby for testing when server is not configured
      console.log('Matchmaking server not configured, using fallback lobby')
      this.notifyMatchmakingStatus('Searching for players...')
      await this.joinRoom('official-matchmaking-lobby')
    }
  }

  /**
   * Connect to CF Workers matchmaking server via WebSocket
   */
  private async connectToMatchmakingServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = MATCHMAKING_SERVER_URL.replace('https://', 'wss://').replace('http://', 'ws://')
      this.matchmakingWs = new WebSocket(`${wsUrl}/matchmaking`)
      
      this.matchmakingWs.onopen = () => {
        console.log('Connected to matchmaking server')
        this.notifyMatchmakingStatus('Connected to matchmaking server...')
        
        // Send join request with player info
        this.matchmakingWs!.send(JSON.stringify({
          type: 'join',
          playerId: selfId,
          data: { region: this.detectRegion() }
        }))
        
        // Start ping measurement
        this.startPingMeasurement()
        resolve()
      }
      
      this.matchmakingWs.onmessage = (event) => {
        const message = JSON.parse(event.data)
        this.handleMatchmakingMessage(message)
      }
      
      this.matchmakingWs.onerror = (error) => {
        console.error('Matchmaking WebSocket error:', error)
        this.notifyMatchmakingStatus('Connection error, retrying...')
        reject(error)
      }
      
      this.matchmakingWs.onclose = () => {
        console.log('Disconnected from matchmaking server')
        this.matchmakingWs = null
      }
    })
  }

  /**
   * Handle messages from matchmaking server
   */
  private handleMatchmakingMessage(message: Record<string, unknown>): void {
    switch (message.type) {
      case 'joined':
        this.notifyMatchmakingStatus(`In queue (position: ${message.queuePosition})...`)
        break
        
      case 'lobbyCreated':
        // Server found a match! Join the Trystero room
        const trysteroConfig = message.trystero as TrysteroRoomConfig
        console.log('Match found! Joining lobby:', message.lobbyId)
        this.notifyMatchmakingStatus('Match found! Connecting to lobby...')
        
        // Disconnect from matchmaking server
        if (this.matchmakingWs) {
          this.matchmakingWs.close()
          this.matchmakingWs = null
        }
        
        // Join the Trystero room provided by the server
        this.joinOfficialLobby(trysteroConfig)
        break
        
      case 'pong':
        // Ping response - handled by ping measurement
        break
        
      case 'error':
        console.error('Matchmaking error:', message.message)
        this.notifyMatchmakingStatus(`Error: ${message.message}`)
        break
    }
  }

  /**
   * Start periodic ping measurement to matchmaking server
   */
  private startPingMeasurement(): void {
    if (!this.matchmakingWs) return
    
    const measurePing = () => {
      if (this.matchmakingWs && this.matchmakingWs.readyState === WebSocket.OPEN) {
        this.matchmakingWs.send(JSON.stringify({
          type: 'ping',
          playerId: selfId,
          data: { timestamp: Date.now() }
        }))
      }
    }
    
    // Measure ping every 2 seconds
    const pingInterval = setInterval(() => {
      if (!this.matchmakingWs || this.matchmakingWs.readyState !== WebSocket.OPEN) {
        clearInterval(pingInterval)
        return
      }
      measurePing()
    }, 2000)
    
    // Initial ping
    measurePing()
  }

  /**
   * Detect player's region (simplified)
   */
  private detectRegion(): string {
    // In production, use geolocation or IP-based detection
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (timezone.includes('America')) return 'us'
    if (timezone.includes('Europe')) return 'eu'
    if (timezone.includes('Asia')) return 'asia'
    return 'unknown'
  }

  /**
   * Notify matchmaking status update
   */
  private notifyMatchmakingStatus(status: string): void {
    if (this.onMatchmakingStatusCallback) {
      this.onMatchmakingStatusCallback(status)
    }
  }

  /**
   * Join custom room with a room ID (peer-to-peer, no server)
   * Players share room ID manually to play together
   */
  public async joinCustomRoom(roomId: string): Promise<void> {
    console.log('Joining custom room:', roomId)
    // Custom rooms use direct peer-to-peer via Trystero/Nostr
    // Prefix with 'custom-' to separate from official rooms
    await this.joinRoom(`custom-${roomId}`)
  }

  /**
   * Join an official lobby from matchmaking server response
   * Called when the CF Workers server assigns players to a lobby
   */
  public async joinOfficialLobby(config: TrysteroRoomConfig): Promise<void> {
    console.log('Joining official lobby:', config.roomId)
    
    // Use the server-provided Trystero config
    this.room = joinRoom(
      { appId: config.appId, relayUrls: config.relayUrls },
      config.roomId
    )
    
    this.setupRoomHandlers()
    this.initializeLobby()
  }

  /**
   * Join a Trystero room with default config
   */
  private async joinRoom(roomName: string): Promise<void> {
    // Leave existing room if any
    if (this.room) {
      this.room.leave()
    }
    
    // Join the room using Trystero
    this.room = joinRoom(
      { appId: APP_ID, relayUrls: [DEFAULT_NOSTR_RELAY] },
      roomName
    )

    this.setupRoomHandlers()
    this.initializeLobby()
  }

  /**
   * Set up Trystero room action handlers
   * makeAction returns [sender, receiver, progressHandler]
   */
  private setupRoomHandlers(): void {
    if (!this.room) return

    // Set up action handlers
    // makeAction returns [sender, receiver, progressHandler] - we use sender and receiver
    const [sendPosition, getPosition] = this.room.makeAction('position')
    const [sendLobbyState, getLobbyState] = this.room.makeAction('lobbyState')
    const [sendGameStart, getGameStart] = this.room.makeAction('gameStart')
    const [sendShoot, getShoot] = this.room.makeAction('shoot')

    this.sendPosition = sendPosition
    this.sendLobbyState = sendLobbyState
    this.sendGameStart = sendGameStart
    this.sendShoot = sendShoot

    // Handle peer join
    this.room.onPeerJoin((peerId: string) => {
      console.log('Peer joined:', peerId)
      this.handlePeerJoin(peerId)
    })

    // Handle peer leave
    this.room.onPeerLeave((peerId: string) => {
      console.log('Peer left:', peerId)
      this.handlePeerLeave(peerId)
    })

    // Handle position updates
    getPosition((data: unknown, peerId: string) => {
      if (isPlayerState(data)) {
        this.handlePositionUpdate(data, peerId)
      }
    })

    // Handle lobby state updates
    getLobbyState((data: unknown, peerId: string) => {
      if (isLobbyState(data)) {
        this.handleLobbyStateUpdate(data, peerId)
      }
    })

    // Handle game start
    getGameStart((data: unknown) => {
      if (isGameStartEvent(data) && data.start) {
        this.handleGameStart()
      }
    })

    // Handle shoot events
    getShoot((data: unknown, peerId: string) => {
      if (isShootEvent(data)) {
        this.handleRemoteShoot(data, peerId)
      }
    })
  }

  /**
   * Measure ping to a specific peer using Trystero's built-in ping
   */
  public async measurePeerPing(peerId: string): Promise<number> {
    if (!this.room) return -1
    try {
      return await this.room.ping(peerId)
    } catch {
      return -1
    }
  }

  private initializeLobby(): void {
    // Start as host initially, will be updated when peers are discovered
    this.isHost = true
    this.lobbyState = {
      players: [selfId],
      gameStarted: false,
      hostId: selfId
    }
    this.notifyLobbyUpdate()
  }

  private handlePeerJoin(peerId: string): void {
    if (!this.lobbyState) return

    // Add peer to lobby if not full
    if (this.lobbyState.players.length < MAX_PLAYERS && !this.lobbyState.players.includes(peerId)) {
      this.lobbyState.players.push(peerId)
    }

    // Determine host (lowest ID alphabetically for consistency)
    this.lobbyState.hostId = [...this.lobbyState.players].sort()[0]
    this.isHost = this.lobbyState.hostId === selfId

    // Broadcast lobby state if host
    if (this.isHost && this.sendLobbyState) {
      this.sendLobbyState(this.lobbyState)
    }

    this.notifyLobbyUpdate()

    // Auto-start game when 4 players join (for official matchmaking)
    if (this.lobbyState.players.length >= MAX_PLAYERS && this.isHost && !this.lobbyState.gameStarted) {
      this.startGame()
    }
  }

  private handlePeerLeave(peerId: string): void {
    if (!this.lobbyState) return

    // Remove peer from lobby
    this.lobbyState.players = this.lobbyState.players.filter(id => id !== peerId)

    // Remove remote player
    this.removeRemotePlayer(peerId)

    // Re-determine host
    if (this.lobbyState.players.length > 0) {
      this.lobbyState.hostId = [...this.lobbyState.players].sort()[0]
      this.isHost = this.lobbyState.hostId === selfId
    }

    this.notifyLobbyUpdate()
  }

  private handleLobbyStateUpdate(state: LobbyState, peerId: string): void {
    // Only accept lobby state from host
    if (state.hostId !== peerId) return

    this.lobbyState = state
    this.isHost = state.hostId === selfId
    
    // Make sure local player is in the list
    if (!this.lobbyState.players.includes(selfId)) {
      this.lobbyState.players.push(selfId)
    }

    this.notifyLobbyUpdate()
  }

  private handlePositionUpdate(data: PlayerState, peerId: string): void {
    // Create remote player if not exists
    if (!this.remotePlayers.has(peerId)) {
      this.createRemotePlayer(peerId)
    }

    // Update remote player position
    const remotePlayer = this.remotePlayers.get(peerId)
    if (remotePlayer) {
      remotePlayer.player.position.set(data.position.x, data.position.y, data.position.z)
      remotePlayer.player.velocity.set(data.velocity.x, data.velocity.y, data.velocity.z)
      remotePlayer.player.lookingDirection.set(data.lookingDirection.x, data.lookingDirection.y, data.lookingDirection.z)
    }
  }

  private handleRemoteShoot(data: ShootEvent, peerId: string): void {
    // Visual effect for remote player shooting
    const remotePlayer = this.remotePlayers.get(peerId)
    if (remotePlayer && remotePlayer.renderer) {
      // Could add visual/audio feedback here
      console.log('Remote player shot:', peerId)
    }
  }

  private handleGameStart(): void {
    if (this.lobbyState) {
      this.lobbyState.gameStarted = true
    }
    if (this.onGameStartCallback) {
      this.onGameStartCallback()
    }
  }

  private createRemotePlayer(peerId: string): void {
    const game = Game.getInstance()
    const playerWrapper = PlayerWrapper.defaultNoRenderer()
    
    // Create a visible body mesh for the remote player
    const remoteRenderer = new ThirdPersonRenderer(playerWrapper.player)
    playerWrapper.setRenderer(remoteRenderer)
    
    this.remotePlayers.set(peerId, playerWrapper)
    game.addPlayer(playerWrapper)
    
    console.log('Created remote player:', peerId)
  }

  private removeRemotePlayer(peerId: string): void {
    const player = this.remotePlayers.get(peerId)
    if (player) {
      // Hide and clean up the player
      if (player.renderer) {
        player.renderer.hide()
      }
      this.remotePlayers.delete(peerId)
    }
  }

  private notifyLobbyUpdate(): void {
    if (this.lobbyState && this.onLobbyUpdateCallback) {
      this.onLobbyUpdateCallback(this.lobbyState)
    }
  }

  public startGame(): void {
    if (!this.isHost || !this.lobbyState || !this.sendGameStart) return

    this.lobbyState.gameStarted = true
    this.sendGameStart({ start: true })
    this.handleGameStart()
  }

  public broadcastPosition(player: Player): void {
    if (!this.sendPosition || !this.room) return

    const state: PlayerState = {
      id: selfId,
      position: { x: player.position.x, y: player.position.y, z: player.position.z },
      rotation: { x: 0, y: 0, z: 0 },
      velocity: { x: player.velocity.x, y: player.velocity.y, z: player.velocity.z },
      lookingDirection: { x: player.lookingDirection.x, y: player.lookingDirection.y, z: player.lookingDirection.z }
    }

    this.sendPosition(state)
  }

  public broadcastShoot(position: Vector3D, direction: Vector3D): void {
    if (!this.sendShoot || !this.room) return

    this.sendShoot({
      position: { x: position.x, y: position.y, z: position.z },
      direction: { x: direction.x, y: direction.y, z: direction.z }
    })
  }

  public disconnect(): void {
    // Disconnect from matchmaking server if connected
    if (this.matchmakingWs) {
      this.matchmakingWs.close()
      this.matchmakingWs = null
    }
    
    // Leave Trystero room
    if (this.room) {
      this.room.leave()
      this.room = null
    }
    
    this.remotePlayers.clear()
    this.lobbyState = null
  }

  public getLobbyState(): LobbyState | null {
    return this.lobbyState
  }

  public isHostPlayer(): boolean {
    return this.isHost
  }

  public getPlayerCount(): number {
    return this.lobbyState?.players.length || 0
  }
}
