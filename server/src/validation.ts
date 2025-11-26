/**
 * Network packet validation for anti-cheat
 * Validates player actions to detect and prevent cheating
 */

import type { GamePacket, PositionData, ShootData, ValidationResult } from './types'

// Constants for validation
const MAX_SPEED = 20 // Maximum units per second
const MAX_POSITION_CHANGE = 50 // Maximum position change per packet
const MIN_SHOOT_INTERVAL = 50 // Minimum ms between shots
const MAX_SEQUENCE_GAP = 10 // Maximum allowed gap in sequence numbers
const POSITION_HISTORY_SIZE = 20 // Number of positions to track

// Player state tracking for validation
interface PlayerValidationState {
  lastPosition: PositionData | null
  lastShootTime: number
  lastSequence: number
  lastTimestamp: number
  positionHistory: PositionData[]
  violations: ValidationViolation[]
  warningCount: number
}

interface ValidationViolation {
  type: string
  severity: 'warning' | 'violation' | 'ban'
  timestamp: number
  details: string
}

const playerStates: Map<string, PlayerValidationState> = new Map()

/**
 * Get or create validation state for a player
 */
function getPlayerState(playerId: string): PlayerValidationState {
  let state = playerStates.get(playerId)
  if (!state) {
    state = {
      lastPosition: null,
      lastShootTime: 0,
      lastSequence: -1,
      lastTimestamp: 0,
      positionHistory: [],
      violations: [],
      warningCount: 0
    }
    playerStates.set(playerId, state)
  }
  return state
}

/**
 * Clear validation state for a player (when they disconnect)
 */
export function clearValidationState(playerId: string): void {
  playerStates.delete(playerId)
}

/**
 * Validate a game packet
 */
export function validatePacket(packet: GamePacket): ValidationResult {
  const state = getPlayerState(packet.playerId)
  
  // Validate timestamp
  const timestampResult = validateTimestamp(packet, state)
  if (!timestampResult.valid) return timestampResult
  
  // Validate sequence number
  const sequenceResult = validateSequence(packet, state)
  if (!sequenceResult.valid) return sequenceResult
  
  // Type-specific validation
  switch (packet.type) {
    case 'position':
      return validatePosition(packet.data as PositionData, packet.playerId, state)
    case 'shoot':
      return validateShoot(packet.data as ShootData, packet.playerId, state)
    default:
      return { valid: true }
  }
}

/**
 * Validate packet timestamp
 */
function validateTimestamp(packet: GamePacket, state: PlayerValidationState): ValidationResult {
  const now = Date.now()
  
  // Check for packets from the future (clock manipulation)
  if (packet.timestamp > now + 5000) {
    return recordViolation(packet.playerId, state, {
      type: 'future_timestamp',
      severity: 'violation',
      timestamp: now,
      details: `Packet timestamp ${packet.timestamp} is in the future`
    })
  }
  
  // Check for packets significantly in the past (replay attack)
  if (packet.timestamp < state.lastTimestamp - 1000) {
    return recordViolation(packet.playerId, state, {
      type: 'replay_attack',
      severity: 'violation',
      timestamp: now,
      details: `Packet timestamp ${packet.timestamp} is before last timestamp ${state.lastTimestamp}`
    })
  }
  
  state.lastTimestamp = packet.timestamp
  return { valid: true }
}

/**
 * Validate packet sequence number
 */
function validateSequence(packet: GamePacket, state: PlayerValidationState): ValidationResult {
  // First packet
  if (state.lastSequence === -1) {
    state.lastSequence = packet.sequence
    return { valid: true }
  }
  
  const expectedSequence = state.lastSequence + 1
  const gap = packet.sequence - expectedSequence
  
  // Allow small gaps (network jitter)
  if (gap > MAX_SEQUENCE_GAP) {
    return recordViolation(packet.playerId, state, {
      type: 'sequence_gap',
      severity: 'warning',
      timestamp: Date.now(),
      details: `Sequence gap: expected ${expectedSequence}, got ${packet.sequence}`
    })
  }
  
  // Duplicate or out-of-order packet
  if (gap < 0) {
    return { valid: false, reason: 'Duplicate or out-of-order packet' }
  }
  
  state.lastSequence = packet.sequence
  return { valid: true }
}

/**
 * Validate position data
 */
function validatePosition(position: PositionData, playerId: string, state: PlayerValidationState): ValidationResult {
  // First position - just record it
  if (!state.lastPosition) {
    state.lastPosition = position
    state.positionHistory.push(position)
    return { valid: true }
  }
  
  // Calculate distance moved
  const dx = position.x - state.lastPosition.x
  const dy = position.y - state.lastPosition.y
  const dz = position.z - state.lastPosition.z
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
  
  // Check for teleportation (speed hack)
  if (distance > MAX_POSITION_CHANGE) {
    const result = recordViolation(playerId, state, {
      type: 'teleport',
      severity: 'violation',
      timestamp: Date.now(),
      details: `Moved ${distance.toFixed(2)} units in one packet (max: ${MAX_POSITION_CHANGE})`
    })
    
    // Still update position to prevent false positives on subsequent packets
    state.lastPosition = position
    return result
  }
  
  // Check velocity consistency
  const velocityMagnitude = Math.sqrt(
    position.velocityX * position.velocityX +
    position.velocityY * position.velocityY +
    position.velocityZ * position.velocityZ
  )
  
  if (velocityMagnitude > MAX_SPEED) {
    const result = recordViolation(playerId, state, {
      type: 'speed_hack',
      severity: 'violation',
      timestamp: Date.now(),
      details: `Velocity ${velocityMagnitude.toFixed(2)} exceeds max speed ${MAX_SPEED}`
    })
    state.lastPosition = position
    return result
  }
  
  // Track position history for pattern detection
  state.positionHistory.push(position)
  if (state.positionHistory.length > POSITION_HISTORY_SIZE) {
    state.positionHistory.shift()
  }
  
  state.lastPosition = position
  return { valid: true }
}

/**
 * Validate shoot data
 */
function validateShoot(shoot: ShootData, playerId: string, state: PlayerValidationState): ValidationResult {
  const now = Date.now()
  
  // Check fire rate (rapid fire hack)
  const timeSinceLastShot = now - state.lastShootTime
  if (timeSinceLastShot < MIN_SHOOT_INTERVAL) {
    const result = recordViolation(playerId, state, {
      type: 'rapid_fire',
      severity: 'violation',
      timestamp: now,
      details: `Shot interval ${timeSinceLastShot}ms is below minimum ${MIN_SHOOT_INTERVAL}ms`
    })
    state.lastShootTime = now
    return result
  }
  
  // Validate shoot direction is normalized (aimbot detection)
  const dirMagnitude = Math.sqrt(
    shoot.directionX * shoot.directionX +
    shoot.directionY * shoot.directionY +
    shoot.directionZ * shoot.directionZ
  )
  
  if (Math.abs(dirMagnitude - 1.0) > 0.01) {
    return recordViolation(playerId, state, {
      type: 'invalid_direction',
      severity: 'warning',
      timestamp: now,
      details: `Shoot direction magnitude ${dirMagnitude.toFixed(4)} is not normalized`
    })
  }
  
  // Check if shoot origin matches last known position (with tolerance)
  if (state.lastPosition) {
    const originDistance = Math.sqrt(
      Math.pow(shoot.originX - state.lastPosition.x, 2) +
      Math.pow(shoot.originY - state.lastPosition.y, 2) +
      Math.pow(shoot.originZ - state.lastPosition.z, 2)
    )
    
    // Allow some tolerance for player height and camera offset
    if (originDistance > 5) {
      return recordViolation(playerId, state, {
        type: 'position_mismatch',
        severity: 'warning',
        timestamp: now,
        details: `Shoot origin is ${originDistance.toFixed(2)} units from player position`
      })
    }
  }
  
  state.lastShootTime = now
  return { valid: true }
}

/**
 * Record a violation and determine the result
 */
function recordViolation(playerId: string, state: PlayerValidationState, violation: ValidationViolation): ValidationResult {
  state.violations.push(violation)
  
  // Keep only recent violations (last 5 minutes)
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
  state.violations = state.violations.filter(v => v.timestamp > fiveMinutesAgo)
  
  // Count severity
  const violationCount = state.violations.filter(v => v.severity === 'violation').length
  const warningCount = state.violations.filter(v => v.severity === 'warning').length
  
  // Determine action based on violation count
  if (violationCount >= 5) {
    return { valid: false, reason: violation.details, severity: 'ban' }
  } else if (violationCount >= 3) {
    return { valid: false, reason: violation.details, severity: 'violation' }
  } else if (warningCount >= 10) {
    return { valid: false, reason: violation.details, severity: 'violation' }
  }
  
  // Allow the packet but log the warning
  return { valid: true, reason: violation.details, severity: 'warning' }
}

/**
 * Get violation summary for a player
 */
export function getViolationSummary(playerId: string): { warnings: number; violations: number; shouldBan: boolean } {
  const state = playerStates.get(playerId)
  if (!state) {
    return { warnings: 0, violations: 0, shouldBan: false }
  }
  
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
  const recentViolations = state.violations.filter(v => v.timestamp > fiveMinutesAgo)
  
  const warnings = recentViolations.filter(v => v.severity === 'warning').length
  const violations = recentViolations.filter(v => v.severity === 'violation').length
  
  return {
    warnings,
    violations,
    shouldBan: violations >= 5 || (violations >= 3 && warnings >= 5)
  }
}
