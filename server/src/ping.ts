/**
 * Ping measurement and latency tracking for matchmaking
 */

import type { PlayerInfo, PingRequest, PingResponse } from './types'

// Maximum acceptable ping difference for matchmaking (ms)
const MAX_PING_DIFFERENCE = 100

// Number of ping samples to average
const PING_SAMPLE_COUNT = 5

// Player ping history for averaging
const playerPingHistory: Map<string, number[]> = new Map()

/**
 * Create a ping response
 */
export function createPingResponse(request: PingRequest): PingResponse {
  return {
    type: 'pong',
    timestamp: request.timestamp,
    serverTimestamp: Date.now(),
    playerId: request.playerId
  }
}

/**
 * Calculate player ping from ping/pong exchange
 * @param sentTimestamp - When the ping was sent
 * @param receivedTimestamp - When the pong was received
 * @returns Round-trip time in milliseconds
 */
export function calculatePing(sentTimestamp: number, receivedTimestamp: number): number {
  return receivedTimestamp - sentTimestamp
}

/**
 * Record a ping sample for a player
 */
export function recordPingSample(playerId: string, ping: number): void {
  const history = playerPingHistory.get(playerId) || []
  history.push(ping)
  
  // Keep only the last N samples
  if (history.length > PING_SAMPLE_COUNT) {
    history.shift()
  }
  
  playerPingHistory.set(playerId, history)
}

/**
 * Get the average ping for a player
 */
export function getAveragePing(playerId: string): number {
  const history = playerPingHistory.get(playerId)
  if (!history || history.length === 0) {
    return -1 // Unknown ping
  }
  
  const sum = history.reduce((a, b) => a + b, 0)
  return Math.round(sum / history.length)
}

/**
 * Clear ping history for a player (when they disconnect)
 */
export function clearPingHistory(playerId: string): void {
  playerPingHistory.delete(playerId)
}

/**
 * Check if two players have compatible ping for matchmaking
 * Players with similar ping should be matched together
 */
export function arePingsCompatible(ping1: number, ping2: number): boolean {
  // If either ping is unknown, allow matching
  if (ping1 < 0 || ping2 < 0) {
    return true
  }
  
  return Math.abs(ping1 - ping2) <= MAX_PING_DIFFERENCE
}

/**
 * Group players by ping similarity for matchmaking
 * @param players - Array of players with ping info
 * @returns Groups of players with similar ping
 */
export function groupPlayersByPing(players: PlayerInfo[]): PlayerInfo[][] {
  if (players.length === 0) return []
  
  // Sort players by ping
  const sorted = [...players].sort((a, b) => a.ping - b.ping)
  
  const groups: PlayerInfo[][] = []
  let currentGroup: PlayerInfo[] = [sorted[0]]
  
  for (let i = 1; i < sorted.length; i++) {
    const player = sorted[i]
    const groupBasePing = currentGroup[0].ping
    
    if (arePingsCompatible(groupBasePing, player.ping)) {
      currentGroup.push(player)
    } else {
      groups.push(currentGroup)
      currentGroup = [player]
    }
  }
  
  // Don't forget the last group
  if (currentGroup.length > 0) {
    groups.push(currentGroup)
  }
  
  return groups
}

/**
 * Select the best players for a lobby based on ping similarity
 * @param players - Available players
 * @param lobbySize - Target lobby size
 * @returns Selected players for the lobby
 */
export function selectPlayersForLobby(players: PlayerInfo[], lobbySize: number): PlayerInfo[] {
  if (players.length <= lobbySize) {
    return players
  }
  
  const groups = groupPlayersByPing(players)
  
  // Find the largest group that can fill the lobby
  for (const group of groups) {
    if (group.length >= lobbySize) {
      return group.slice(0, lobbySize)
    }
  }
  
  // If no single group is large enough, combine compatible groups
  let selected: PlayerInfo[] = []
  for (const group of groups) {
    const needed = lobbySize - selected.length
    if (needed <= 0) break
    
    const compatible = group.filter(p => 
      selected.length === 0 || arePingsCompatible(selected[0].ping, p.ping)
    )
    
    selected = selected.concat(compatible.slice(0, needed))
  }
  
  return selected
}

/**
 * Estimate ping between two regions
 * This is a rough estimate based on typical latencies
 */
export function estimateRegionPing(region1: string, region2: string): number {
  const REGION_LATENCIES: Record<string, Record<string, number>> = {
    'us-east': { 'us-east': 20, 'us-west': 70, 'eu-west': 90, 'asia-east': 200 },
    'us-west': { 'us-east': 70, 'us-west': 20, 'eu-west': 140, 'asia-east': 120 },
    'eu-west': { 'us-east': 90, 'us-west': 140, 'eu-west': 20, 'asia-east': 180 },
    'asia-east': { 'us-east': 200, 'us-west': 120, 'eu-west': 180, 'asia-east': 20 }
  }
  
  return REGION_LATENCIES[region1]?.[region2] ?? 150 // Default to 150ms if unknown
}
