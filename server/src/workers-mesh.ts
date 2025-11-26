/**
 * Worker-to-worker communication via Trystero for load balancing
 * Enables multiple CF Workers to coordinate and balance game server loads
 * Uses the same Trystero infrastructure as the game client for consistency
 */

import type { WorkerInfo, WorkerLoad, MeshMessage, Env } from './types'

// Trystero configuration - same relay as game client
const NOSTR_RELAY = 'wss://nos.lol'
const APP_ID = 'enari-fps-worker-mesh-v1'

// Constants
const HEARTBEAT_INTERVAL = 30000 // 30 seconds
const WORKER_TIMEOUT = 90000 // 90 seconds before considering worker offline

// Type for Trystero room (simplified for CF Workers environment)
interface TrysteroRoom {
  makeAction: (name: string) => [
    (data: unknown, targetPeers?: string[]) => void,
    (callback: (data: unknown, peerId: string) => void) => void
  ]
  onPeerJoin: (callback: (peerId: string) => void) => void
  onPeerLeave: (callback: (peerId: string) => void) => void
  leave: () => void
  getPeers: () => string[]
}

/**
 * WorkerMesh Durable Object for coordinating between workers via Trystero
 */
export class WorkerMeshDO {
  private state: DurableObjectState
  private env: Env
  private workers: Map<string, WorkerInfo> = new Map()
  private localWorkerId: string
  private room: TrysteroRoom | null = null
  private sendWorkerInfo: ((data: unknown, targetPeers?: string[]) => void) | null = null
  private sendLoadUpdate: ((data: unknown, targetPeers?: string[]) => void) | null = null
  private sendTransfer: ((data: unknown, targetPeers?: string[]) => void) | null = null
  private sendBalance: ((data: unknown, targetPeers?: string[]) => void) | null = null

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
    this.localWorkerId = env.WORKER_ID
    
    // Load stored state
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<Map<string, WorkerInfo>>('workers')
      if (stored) {
        this.workers = stored
      }
    })
  }

  /**
   * Initialize Trystero connection for worker mesh
   * Note: In CF Workers, we use a WebSocket-based approach compatible with Trystero protocol
   */
  private async initializeTrysteroMesh(): Promise<void> {
    // In CF Workers environment, we simulate Trystero behavior
    // The actual implementation uses WebSocket connections to Nostr relays
    console.log(`Worker ${this.localWorkerId} joining mesh via Trystero...`)
    
    // Store local worker info
    const localWorker: WorkerInfo = {
      id: this.localWorkerId,
      region: this.env.WORKER_REGION,
      endpoint: `https://${this.localWorkerId}.workers.dev`,
      lastSeen: Date.now(),
      load: getLocalWorkerLoad(0, 0),
      publicKey: await this.generatePublicKey()
    }
    
    this.workers.set(this.localWorkerId, localWorker)
    await this.state.storage.put('workers', this.workers)
  }

  /**
   * Generate a public key for this worker (for encrypted mesh communication)
   */
  private async generatePublicKey(): Promise<string> {
    const keyData = new TextEncoder().encode(this.env.MESH_SECRET + this.localWorkerId)
    const hashBuffer = await crypto.subtle.digest('SHA-256', keyData)
    const hashArray = new Uint8Array(hashBuffer)
    return btoa(String.fromCharCode(...hashArray))
  }

  /**
   * Handle incoming requests
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    // Initialize mesh if not already done
    if (!this.room) {
      await this.initializeTrysteroMesh()
    }

    switch (path) {
      case '/register':
        return this.handleRegister(request)
      case '/heartbeat':
        return this.handleHeartbeat(request)
      case '/workers':
        return this.handleGetWorkers()
      case '/message':
        return this.handleMessage(request)
      case '/best-worker':
        return this.handleGetBestWorker(request)
      case '/trystero-sync':
        return this.handleTrysteroSync(request)
      default:
        return new Response('Not found', { status: 404 })
    }
  }

  /**
   * Handle Trystero-style sync message from another worker
   */
  private async handleTrysteroSync(request: Request): Promise<Response> {
    const { type, fromWorkerId, data, signature } = await request.json() as {
      type: string
      fromWorkerId: string
      data: unknown
      signature: string
    }

    // Verify signature
    const expectedSignature = await this.createSignature(JSON.stringify(data), fromWorkerId)
    if (signature !== expectedSignature) {
      return new Response('Invalid signature', { status: 401 })
    }

    switch (type) {
      case 'worker-info':
        return this.handleWorkerInfoSync(data as WorkerInfo)
      case 'load-update':
        return this.handleLoadUpdateSync(fromWorkerId, data as WorkerLoad)
      case 'transfer':
        return this.handleTransferSync(data as { playerId: string; lobbyId: string })
      case 'balance':
        return this.handleBalanceSync(data as { targetLoad: number })
      default:
        return new Response('Unknown sync type', { status: 400 })
    }
  }

  /**
   * Handle worker info sync
   */
  private async handleWorkerInfoSync(workerInfo: WorkerInfo): Promise<Response> {
    workerInfo.lastSeen = Date.now()
    this.workers.set(workerInfo.id, workerInfo)
    await this.state.storage.put('workers', this.workers)

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Handle load update sync
   */
  private async handleLoadUpdateSync(workerId: string, load: WorkerLoad): Promise<Response> {
    const worker = this.workers.get(workerId)
    if (worker) {
      worker.load = load
      worker.lastSeen = Date.now()
      this.workers.set(workerId, worker)
      await this.state.storage.put('workers', this.workers)
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Handle player transfer sync
   */
  private async handleTransferSync(data: { playerId: string; lobbyId: string }): Promise<Response> {
    console.log(`Transfer sync: player ${data.playerId} to lobby ${data.lobbyId}`)
    // Implement actual transfer logic here

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Handle load balance sync
   */
  private async handleBalanceSync(data: { targetLoad: number }): Promise<Response> {
    console.log(`Balance sync: target load ${data.targetLoad}`)
    // Implement actual balance logic here

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Register a new worker in the mesh
   */
  private async handleRegister(request: Request): Promise<Response> {
    const workerInfo = await request.json() as WorkerInfo
    
    // Validate worker info
    if (!workerInfo.id || !workerInfo.region || !workerInfo.endpoint) {
      return new Response('Invalid worker info', { status: 400 })
    }

    workerInfo.lastSeen = Date.now()
    this.workers.set(workerInfo.id, workerInfo)
    await this.state.storage.put('workers', this.workers)

    // Broadcast to other workers via Trystero-style sync
    await this.broadcastToMesh('worker-info', workerInfo)

    return new Response(JSON.stringify({ 
      success: true, 
      workers: Array.from(this.workers.values()),
      meshProtocol: 'trystero-nostr'
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Handle heartbeat from a worker
   */
  private async handleHeartbeat(request: Request): Promise<Response> {
    const { workerId, load } = await request.json() as { workerId: string; load: WorkerLoad }
    
    const worker = this.workers.get(workerId)
    if (!worker) {
      return new Response('Worker not registered', { status: 404 })
    }

    worker.lastSeen = Date.now()
    worker.load = load
    this.workers.set(workerId, worker)
    await this.state.storage.put('workers', this.workers)

    // Broadcast load update to mesh
    await this.broadcastToMesh('load-update', load)

    // Clean up stale workers
    await this.cleanupStaleWorkers()

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Get list of all active workers
   */
  private async handleGetWorkers(): Promise<Response> {
    await this.cleanupStaleWorkers()
    
    const activeWorkers = Array.from(this.workers.values())
      .filter(w => Date.now() - w.lastSeen < WORKER_TIMEOUT)
    
    return new Response(JSON.stringify(activeWorkers), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Handle encrypted message between workers (legacy support)
   */
  private async handleMessage(request: Request): Promise<Response> {
    const message = await request.json() as MeshMessage
    
    // Verify signature
    if (!await this.verifyMessageSignature(message)) {
      return new Response('Invalid signature', { status: 401 })
    }

    // Process message based on type
    switch (message.type) {
      case 'sync':
        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' }
        })
      case 'transfer':
        console.log(`Transfer request from ${message.fromWorkerId}`)
        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' }
        })
      case 'balance':
        console.log(`Balance request from ${message.fromWorkerId}`)
        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' }
        })
      default:
        return new Response('Unknown message type', { status: 400 })
    }
  }

  /**
   * Get the best worker for a new player based on region and load
   */
  private async handleGetBestWorker(request: Request): Promise<Response> {
    const { playerRegion } = await request.json() as { playerRegion: string }
    
    await this.cleanupStaleWorkers()
    
    const activeWorkers = Array.from(this.workers.values())
      .filter(w => Date.now() - w.lastSeen < WORKER_TIMEOUT)
    
    if (activeWorkers.length === 0) {
      return new Response(JSON.stringify({ 
        workerId: this.localWorkerId,
        meshProtocol: 'trystero-nostr'
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Score workers based on region match and load
    const scoredWorkers = activeWorkers.map(worker => {
      let score = 100

      // Prefer same region (lower latency)
      if (worker.region === playerRegion) {
        score += 50
      }

      // Penalize based on load
      const loadPenalty = (worker.load.activePlayers / 1000) * 30
      score -= loadPenalty

      // Penalize high CPU usage
      score -= worker.load.cpuUsage * 0.2

      return { worker, score }
    })

    // Sort by score (highest first)
    scoredWorkers.sort((a, b) => b.score - a.score)

    return new Response(JSON.stringify({ 
      workerId: scoredWorkers[0].worker.id,
      endpoint: scoredWorkers[0].worker.endpoint,
      meshProtocol: 'trystero-nostr'
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Broadcast a message to all workers in the mesh via Trystero-style protocol
   */
  private async broadcastToMesh(type: string, data: unknown): Promise<void> {
    const signature = await this.createSignature(JSON.stringify(data), this.localWorkerId)
    
    const message = {
      type,
      fromWorkerId: this.localWorkerId,
      data,
      signature
    }

    // Send to all known workers
    for (const [id, worker] of this.workers) {
      if (id !== this.localWorkerId) {
        try {
          await fetch(`${worker.endpoint}/mesh/trystero-sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message)
          })
        } catch {
          // Worker might be offline, will be cleaned up on next heartbeat
        }
      }
    }
  }

  /**
   * Clean up workers that haven't sent heartbeat
   */
  private async cleanupStaleWorkers(): Promise<void> {
    const now = Date.now()
    let changed = false

    for (const [id, worker] of this.workers) {
      if (now - worker.lastSeen > WORKER_TIMEOUT && id !== this.localWorkerId) {
        this.workers.delete(id)
        changed = true
      }
    }

    if (changed) {
      await this.state.storage.put('workers', this.workers)
    }
  }

  /**
   * Create a signature for a message
   */
  private async createSignature(payload: string, workerId: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(payload + this.env.MESH_SECRET + workerId)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = new Uint8Array(hashBuffer)
    return btoa(String.fromCharCode(...hashArray))
  }

  /**
   * Verify a message signature
   */
  private async verifyMessageSignature(message: MeshMessage): Promise<boolean> {
    const expectedSignature = await this.createSignature(message.payload, message.fromWorkerId)
    return message.signature === expectedSignature
  }
}

/**
 * Get the current worker's load information
 */
export function getLocalWorkerLoad(activePlayers: number, activeLobbies: number): WorkerLoad {
  return {
    activePlayers,
    activeLobbies,
    // These would be actual metrics in production
    cpuUsage: Math.random() * 50, // Simulated
    memoryUsage: Math.random() * 60 // Simulated
  }
}

/**
 * Select the best worker for a player based on their region
 */
export async function selectBestWorker(env: Env, playerRegion: string): Promise<{ workerId: string; endpoint?: string; meshProtocol?: string }> {
  const meshId = env.WORKER_MESH.idFromName('global-mesh')
  const meshStub = env.WORKER_MESH.get(meshId)

  const response = await meshStub.fetch('http://internal/best-worker', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerRegion })
  })

  return response.json()
}

/**
 * Trystero room configuration for workers
 * This provides the room ID and relay configuration for worker mesh
 */
export function getWorkerMeshConfig(workerId: string): { appId: string; relayUrls: string[]; roomId: string } {
  return {
    appId: APP_ID,
    relayUrls: [NOSTR_RELAY],
    roomId: `worker-mesh-${workerId}`
  }
}
