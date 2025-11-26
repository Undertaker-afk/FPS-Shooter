// @ts-ignore - trystero module resolution
import { joinRoom } from 'trystero/nostr'
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

const NOSTR_RELAY = 'wss://nos.lol'
const APP_ID = 'enari-fps-shooter-v1'
const MAX_PLAYERS = 4

export class MultiplayerManager {
  private static instance: MultiplayerManager
  private room: Room | null = null
  private localPlayerId: string
  private remotePlayers: Map<string, PlayerWrapper> = new Map()
  private isHost: boolean = false
  private lobbyState: LobbyState | null = null
  private onLobbyUpdateCallback: ((state: LobbyState) => void) | null = null
  private onGameStartCallback: (() => void) | null = null
  private sendPosition: ((data: any, targetPeers?: string[]) => void) | null = null
  private sendLobbyState: ((data: any, targetPeers?: string[]) => void) | null = null
  private sendGameStart: ((data: any, targetPeers?: string[]) => void) | null = null
  private sendShoot: ((data: any, targetPeers?: string[]) => void) | null = null

  constructor() {
    this.localPlayerId = this.generatePlayerId()
  }

  public static getInstance(): MultiplayerManager {
    if (!MultiplayerManager.instance) {
      MultiplayerManager.instance = new MultiplayerManager()
    }
    return MultiplayerManager.instance
  }

  private generatePlayerId(): string {
    return 'player_' + Math.random().toString(36).substr(2, 9)
  }

  public getLocalPlayerId(): string {
    return this.localPlayerId
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

  public async joinMatchmaking(): Promise<void> {
    console.log('Joining matchmaking...')
    
    // Join the matchmaking room
    this.room = joinRoom(
      { appId: APP_ID, relayUrls: [NOSTR_RELAY] },
      'matchmaking-lobby'
    )

    // Set up action handlers (without explicit type parameters due to TypeScript issues)
    const [sendPosition, getPosition] = this.room!.makeAction('position')
    const [sendLobbyState, getLobbyState] = this.room!.makeAction('lobbyState')
    const [sendGameStart, getGameStart] = this.room!.makeAction('gameStart')
    const [sendShoot, getShoot] = this.room!.makeAction('shoot')

    this.sendPosition = sendPosition
    this.sendLobbyState = sendLobbyState
    this.sendGameStart = sendGameStart
    this.sendShoot = sendShoot

    // Handle peer join
    this.room!.onPeerJoin((peerId) => {
      console.log('Peer joined:', peerId)
      this.handlePeerJoin(peerId)
    })

    // Handle peer leave
    this.room!.onPeerLeave((peerId) => {
      console.log('Peer left:', peerId)
      this.handlePeerLeave(peerId)
    })

    // Handle position updates
    getPosition((data, peerId) => {
      this.handlePositionUpdate(data as unknown as PlayerState, peerId)
    })

    // Handle lobby state updates
    getLobbyState((data, peerId) => {
      this.handleLobbyStateUpdate(data as unknown as LobbyState, peerId)
    })

    // Handle game start
    getGameStart((data) => {
      const gameData = data as { start?: boolean }
      if (gameData && gameData.start) {
        this.handleGameStart()
      }
    })

    // Handle shoot events
    getShoot((data, peerId) => {
      this.handleRemoteShoot(data as { position: { x: number; y: number; z: number }; direction: { x: number; y: number; z: number } }, peerId)
    })

    // Initialize lobby state
    this.initializeLobby()
  }

  private initializeLobby(): void {
    // Start as host initially, will be updated when peers are discovered
    this.isHost = true
    this.lobbyState = {
      players: [this.localPlayerId],
      gameStarted: false,
      hostId: this.localPlayerId
    }
    this.notifyLobbyUpdate()
  }

  private handlePeerJoin(peerId: string): void {
    if (!this.lobbyState) return

    // Add peer to lobby if not full
    if (this.lobbyState.players.length < MAX_PLAYERS && !this.lobbyState.players.includes(peerId)) {
      this.lobbyState.players.push(peerId)
    }

    // Determine host (lowest ID)
    this.lobbyState.hostId = this.lobbyState.players.sort()[0]
    this.isHost = this.lobbyState.hostId === this.localPlayerId

    // Broadcast lobby state if host
    if (this.isHost && this.sendLobbyState) {
      this.sendLobbyState(this.lobbyState)
    }

    this.notifyLobbyUpdate()

    // Auto-start game when 4 players join
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
      this.lobbyState.hostId = this.lobbyState.players.sort()[0]
      this.isHost = this.lobbyState.hostId === this.localPlayerId
    }

    this.notifyLobbyUpdate()
  }

  private handleLobbyStateUpdate(state: LobbyState, peerId: string): void {
    // Only accept lobby state from host
    if (state.hostId !== peerId) return

    this.lobbyState = state
    this.isHost = state.hostId === this.localPlayerId
    
    // Make sure local player is in the list
    if (!this.lobbyState.players.includes(this.localPlayerId)) {
      this.lobbyState.players.push(this.localPlayerId)
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

  private handleRemoteShoot(data: { position: { x: number; y: number; z: number }; direction: { x: number; y: number; z: number } }, peerId: string): void {
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
      id: this.localPlayerId,
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
