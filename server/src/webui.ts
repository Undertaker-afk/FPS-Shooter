/**
 * Web UI for load management and server statistics
 */

import type { ServerStats, Env } from './types'

/**
 * Generate the admin dashboard HTML
 */
export function generateDashboardHTML(stats: ServerStats): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ENARI FPS - Server Dashboard</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      min-height: 100vh;
      color: white;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      margin-bottom: 30px;
    }

    .logo {
      font-size: 28px;
      font-weight: bold;
      color: #e94560;
      letter-spacing: 3px;
    }

    .status-badge {
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: bold;
    }

    .status-connected {
      background: rgba(76, 175, 80, 0.2);
      border: 1px solid #4CAF50;
      color: #4CAF50;
    }

    .status-disconnected {
      background: rgba(244, 67, 54, 0.2);
      border: 1px solid #f44336;
      color: #f44336;
    }

    .status-partial {
      background: rgba(255, 193, 7, 0.2);
      border: 1px solid #FFC107;
      color: #FFC107;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }

    .stat-card {
      background: rgba(30, 30, 50, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 25px;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .stat-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    }

    .stat-label {
      color: rgba(255, 255, 255, 0.6);
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 10px;
    }

    .stat-value {
      font-size: 36px;
      font-weight: bold;
      color: #e94560;
    }

    .stat-unit {
      font-size: 18px;
      color: rgba(255, 255, 255, 0.5);
      margin-left: 5px;
    }

    .section-title {
      font-size: 20px;
      color: rgba(255, 255, 255, 0.9);
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid #e94560;
      display: inline-block;
    }

    .workers-table {
      width: 100%;
      background: rgba(30, 30, 50, 0.8);
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 30px;
    }

    .workers-table th,
    .workers-table td {
      padding: 15px 20px;
      text-align: left;
    }

    .workers-table th {
      background: rgba(233, 69, 96, 0.2);
      color: #e94560;
      font-weight: bold;
      text-transform: uppercase;
      font-size: 12px;
      letter-spacing: 1px;
    }

    .workers-table tr {
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .workers-table tr:last-child {
      border-bottom: none;
    }

    .workers-table tr:hover {
      background: rgba(255, 255, 255, 0.02);
    }

    .load-bar {
      width: 100px;
      height: 8px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 4px;
      overflow: hidden;
    }

    .load-bar-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s;
    }

    .load-low {
      background: linear-gradient(90deg, #4CAF50, #8BC34A);
    }

    .load-medium {
      background: linear-gradient(90deg, #FFC107, #FF9800);
    }

    .load-high {
      background: linear-gradient(90deg, #FF5722, #f44336);
    }

    .refresh-info {
      text-align: center;
      color: rgba(255, 255, 255, 0.4);
      font-size: 12px;
      margin-top: 20px;
    }

    .actions {
      display: flex;
      gap: 10px;
      margin-bottom: 30px;
    }

    .btn {
      padding: 12px 24px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      font-size: 14px;
      font-weight: bold;
      transition: all 0.2s;
    }

    .btn-primary {
      background: linear-gradient(135deg, #e94560 0%, #c23a51 100%);
      color: white;
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 5px 20px rgba(233, 69, 96, 0.4);
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.1);
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.2);
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.15);
    }

    footer {
      text-align: center;
      padding: 20px;
      color: rgba(255, 255, 255, 0.3);
      font-size: 12px;
      margin-top: 40px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">ENARI FPS ADMIN</div>
      <div class="status-badge status-${stats.workerMeshStatus}">
        Mesh: ${stats.workerMeshStatus.toUpperCase()}
      </div>
    </header>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Players Searching</div>
        <div class="stat-value">${stats.playersSearching}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active Lobbies</div>
        <div class="stat-value">${stats.activeLobbies}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Players Online</div>
        <div class="stat-value">${stats.totalPlayersOnline}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Average Wait Time</div>
        <div class="stat-value">${stats.averageWaitTime}<span class="stat-unit">sec</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Connected Workers</div>
        <div class="stat-value">${stats.connectedWorkers}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Server Uptime</div>
        <div class="stat-value">${formatUptime(stats.uptime)}</div>
      </div>
    </div>

    <h2 class="section-title">Worker Mesh</h2>
    <div class="actions">
      <button class="btn btn-primary" onclick="refreshStats()">Refresh Stats</button>
      <button class="btn btn-secondary" onclick="rebalanceLoad()">Rebalance Load</button>
    </div>

    <table class="workers-table">
      <thead>
        <tr>
          <th>Worker ID</th>
          <th>Region</th>
          <th>Players</th>
          <th>Lobbies</th>
          <th>CPU Load</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody id="workers-list">
        <tr>
          <td>${stats.workerId}</td>
          <td>${stats.region}</td>
          <td>${stats.totalPlayersOnline}</td>
          <td>${stats.activeLobbies}</td>
          <td>
            <div class="load-bar">
              <div class="load-bar-fill load-low" style="width: 35%"></div>
            </div>
          </td>
          <td><span class="status-badge status-connected">Active</span></td>
        </tr>
      </tbody>
    </table>

    <p class="refresh-info">Auto-refreshes every 10 seconds</p>

    <footer>
      ENARI FPS Matchmaking Server v1.0.0 | Worker: ${stats.workerId} | Region: ${stats.region}
    </footer>
  </div>

  <script>
    function refreshStats() {
      location.reload();
    }

    function rebalanceLoad() {
      fetch('/api/rebalance', { method: 'POST' })
        .then(() => alert('Load rebalancing initiated'))
        .catch(err => alert('Error: ' + err.message));
    }

    // Auto-refresh
    setTimeout(() => location.reload(), 10000);
  </script>
</body>
</html>`
}

/**
 * Format uptime in human readable format
 */
function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}

/**
 * Generate API response with current stats
 */
export function generateStatsJSON(stats: ServerStats): string {
  return JSON.stringify(stats, null, 2)
}

/**
 * Collect current server statistics
 */
export async function collectServerStats(
  env: Env,
  matchmakingState: { playersSearching: number; activeLobbies: number },
  startTime: number
): Promise<ServerStats> {
  // Get worker mesh status
  let workerMeshStatus: 'connected' | 'disconnected' | 'partial' = 'disconnected'
  let connectedWorkers = 0

  try {
    const meshId = env.WORKER_MESH.idFromName('global-mesh')
    const meshStub = env.WORKER_MESH.get(meshId)
    const response = await meshStub.fetch('http://internal/workers')
    const workers = await response.json() as unknown[]
    
    connectedWorkers = workers.length
    workerMeshStatus = connectedWorkers > 0 ? 'connected' : 'disconnected'
    
    // Partial if some workers are not responding
    // This would require more sophisticated health checking in production
  } catch {
    workerMeshStatus = 'disconnected'
  }

  return {
    workerId: env.WORKER_ID,
    region: env.WORKER_REGION,
    playersSearching: matchmakingState.playersSearching,
    activeLobbies: matchmakingState.activeLobbies,
    totalPlayersOnline: matchmakingState.playersSearching + matchmakingState.activeLobbies * 4,
    averageWaitTime: calculateAverageWaitTime(matchmakingState.playersSearching),
    workerMeshStatus,
    connectedWorkers,
    uptime: Math.floor((Date.now() - startTime) / 1000)
  }
}

/**
 * Calculate average wait time based on player count
 * This is a simplified estimation
 */
function calculateAverageWaitTime(playersSearching: number): number {
  if (playersSearching >= 4) return 5
  if (playersSearching >= 2) return 15
  return 30
}
