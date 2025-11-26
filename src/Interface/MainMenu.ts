import { LobbyState, MultiplayerManager } from '../Multiplayer/MultiplayerManager'

export class MainMenu {
  private container: HTMLDivElement
  private lobbyContainer: HTMLDivElement | null = null
  private multiplayerManager: MultiplayerManager
  private onStartGameCallback: (() => void) | null = null
  private isSearching: boolean = false

  constructor() {
    this.multiplayerManager = MultiplayerManager.getInstance()
    this.container = this.createMainMenu()
    document.body.appendChild(this.container)

    // Set up multiplayer callbacks
    this.multiplayerManager.setOnLobbyUpdate((state) => this.updateLobbyUI(state))
    this.multiplayerManager.setOnGameStart(() => this.onGameStartFromNetwork())
  }

  public setOnStartGame(callback: () => void): void {
    this.onStartGameCallback = callback
  }

  private createMainMenu(): HTMLDivElement {
    const container = document.createElement('div')
    container.id = 'main-menu'
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      z-index: 3000;
      font-family: 'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif;
    `

    // Game title
    const title = document.createElement('h1')
    title.innerText = 'ENARI FPS'
    title.style.cssText = `
      color: #e94560;
      font-size: 72px;
      margin: 0 0 10px 0;
      letter-spacing: 8px;
      text-shadow: 0 0 20px rgba(233, 69, 96, 0.5);
      animation: pulse 2s ease-in-out infinite;
    `
    container.appendChild(title)

    // Subtitle
    const subtitle = document.createElement('p')
    subtitle.innerText = 'MULTIPLAYER ARENA SHOOTER'
    subtitle.style.cssText = `
      color: rgba(255, 255, 255, 0.7);
      font-size: 18px;
      letter-spacing: 4px;
      margin: 0 0 60px 0;
    `
    container.appendChild(subtitle)

    // Menu box
    const menuBox = document.createElement('div')
    menuBox.style.cssText = `
      background: rgba(30, 30, 50, 0.9);
      border: 2px solid rgba(233, 69, 96, 0.3);
      border-radius: 15px;
      padding: 40px 60px;
      text-align: center;
      min-width: 400px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
    `

    // Start Match Search button (Official matchmaking via CF Workers)
    const searchBtn = this.createMenuButton('OFFICIAL MATCHMAKING', async () => {
      await this.startMatchSearch()
    }, true)
    menuBox.appendChild(searchBtn)

    // Join Room button (Custom room via peer-to-peer)
    const joinRoomBtn = this.createMenuButton('JOIN ROOM', () => {
      this.showJoinRoomDialog()
    })
    menuBox.appendChild(joinRoomBtn)

    // Create Room button (Custom room via peer-to-peer)
    const createRoomBtn = this.createMenuButton('CREATE ROOM', () => {
      this.showCreateRoomDialog()
    })
    menuBox.appendChild(createRoomBtn)

    // Solo Play button
    const soloBtn = this.createMenuButton('SOLO PLAY', () => {
      this.startSoloGame()
    })
    menuBox.appendChild(soloBtn)

    // Settings button
    const settingsBtn = this.createMenuButton('SETTINGS', () => {
      // Future settings implementation
      console.log('Settings clicked')
    })
    menuBox.appendChild(settingsBtn)

    container.appendChild(menuBox)

    // Player ID display
    const playerIdDisplay = document.createElement('p')
    playerIdDisplay.innerText = `Player ID: ${this.multiplayerManager.getLocalPlayerId()}`
    playerIdDisplay.style.cssText = `
      color: rgba(255, 255, 255, 0.4);
      font-size: 12px;
      position: absolute;
      bottom: 20px;
      left: 20px;
    `
    container.appendChild(playerIdDisplay)

    // Add CSS animation
    const style = document.createElement('style')
    style.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.8; }
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `
    document.head.appendChild(style)

    return container
  }

  private createMenuButton(label: string, onClick: () => void, isPrimary: boolean = false): HTMLButtonElement {
    const button = document.createElement('button')
    button.innerText = label
    button.style.cssText = `
      display: block;
      width: 100%;
      padding: 18px 40px;
      margin: 12px 0;
      background: ${isPrimary ? 'linear-gradient(135deg, #e94560 0%, #c23a51 100%)' : 'rgba(255, 255, 255, 0.05)'};
      border: 2px solid ${isPrimary ? '#e94560' : 'rgba(255, 255, 255, 0.2)'};
      border-radius: 8px;
      color: white;
      font-family: 'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif;
      font-size: 16px;
      font-weight: bold;
      letter-spacing: 3px;
      cursor: pointer;
      transition: all 0.3s ease;
      outline: none;
      text-transform: uppercase;
    `
    button.addEventListener('mouseenter', () => {
      button.style.transform = 'translateY(-2px)'
      button.style.boxShadow = isPrimary ? '0 5px 20px rgba(233, 69, 96, 0.4)' : '0 5px 15px rgba(255, 255, 255, 0.1)'
    })
    button.addEventListener('mouseleave', () => {
      button.style.transform = 'translateY(0)'
      button.style.boxShadow = 'none'
    })
    button.addEventListener('click', onClick)
    return button
  }

  private async startMatchSearch(): Promise<void> {
    if (this.isSearching) return
    this.isSearching = true

    // Show lobby UI
    this.showLobbyScreen()

    // Connect to official matchmaking (will use CF Workers in the future)
    await this.multiplayerManager.joinMatchmaking()
  }

  private showLobbyScreen(customRoomId?: string): void {
    // Create lobby container
    this.lobbyContainer = document.createElement('div')
    this.lobbyContainer.id = 'lobby-screen'
    this.lobbyContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      z-index: 3001;
      font-family: 'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif;
    `

    // Lobby title
    const title = document.createElement('h2')
    title.innerText = customRoomId ? `ROOM: ${customRoomId}` : 'MATCHMAKING'
    title.style.cssText = `
      color: #e94560;
      font-size: 36px;
      margin: 0 0 30px 0;
      letter-spacing: 4px;
    `
    this.lobbyContainer.appendChild(title)

    // Searching indicator
    const searchingDiv = document.createElement('div')
    searchingDiv.id = 'searching-indicator'
    searchingDiv.style.cssText = `
      display: flex;
      align-items: center;
      gap: 15px;
      margin-bottom: 30px;
    `
    
    const spinner = document.createElement('div')
    spinner.style.cssText = `
      width: 24px;
      height: 24px;
      border: 3px solid rgba(233, 69, 96, 0.3);
      border-top-color: #e94560;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    `
    searchingDiv.appendChild(spinner)
    
    const searchText = document.createElement('span')
    searchText.innerText = customRoomId ? 'Waiting for players...' : 'Searching for players...'
    searchText.style.cssText = `
      color: rgba(255, 255, 255, 0.8);
      font-size: 18px;
    `
    searchingDiv.appendChild(searchText)
    this.lobbyContainer.appendChild(searchingDiv)

    // Lobby box
    const lobbyBox = document.createElement('div')
    lobbyBox.id = 'lobby-box'
    lobbyBox.style.cssText = `
      background: rgba(30, 30, 50, 0.9);
      border: 2px solid rgba(233, 69, 96, 0.3);
      border-radius: 15px;
      padding: 30px 50px;
      min-width: 350px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
    `

    // Player count
    const playerCountDiv = document.createElement('div')
    playerCountDiv.id = 'player-count'
    playerCountDiv.style.cssText = `
      color: white;
      font-size: 24px;
      text-align: center;
      margin-bottom: 20px;
    `
    playerCountDiv.innerHTML = '<span style="color: #e94560;">1</span> / 4 Players'
    lobbyBox.appendChild(playerCountDiv)

    // Player list
    const playerList = document.createElement('div')
    playerList.id = 'player-list'
    playerList.style.cssText = `
      margin: 20px 0;
    `
    lobbyBox.appendChild(playerList)

    // Status message
    const statusMsg = document.createElement('p')
    statusMsg.id = 'lobby-status'
    statusMsg.innerText = 'Waiting for 3 more players to start...'
    statusMsg.style.cssText = `
      color: rgba(255, 255, 255, 0.6);
      font-size: 14px;
      text-align: center;
      margin-top: 20px;
    `
    lobbyBox.appendChild(statusMsg)

    this.lobbyContainer.appendChild(lobbyBox)

    // Cancel button
    const cancelBtn = this.createMenuButton('CANCEL', () => {
      this.cancelMatchSearch()
    })
    cancelBtn.style.marginTop = '30px'
    cancelBtn.style.width = 'auto'
    cancelBtn.style.padding = '12px 40px'
    this.lobbyContainer.appendChild(cancelBtn)

    document.body.appendChild(this.lobbyContainer)
    
    // Initial UI update
    const localPlayerId = this.multiplayerManager.getLocalPlayerId()
    this.updateLobbyUI({
      players: [localPlayerId],
      gameStarted: false,
      hostId: localPlayerId
    })
  }

  private updateLobbyUI(state: LobbyState): void {
    if (!this.lobbyContainer) return

    const playerCount = document.getElementById('player-count')
    const playerList = document.getElementById('player-list')
    const statusMsg = document.getElementById('lobby-status')

    if (playerCount) {
      playerCount.innerHTML = `<span style="color: #e94560;">${state.players.length}</span> / 4 Players`
    }

    if (playerList) {
      playerList.innerHTML = ''
      state.players.forEach((playerId, index) => {
        const playerRow = document.createElement('div')
        playerRow.style.cssText = `
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 15px;
          margin: 5px 0;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          border-left: 3px solid ${playerId === this.multiplayerManager.getLocalPlayerId() ? '#e94560' : '#4CAF50'};
        `
        
        const playerName = document.createElement('span')
        playerName.innerText = playerId === this.multiplayerManager.getLocalPlayerId() ? `${playerId} (You)` : playerId
        playerName.style.cssText = `
          color: white;
          font-size: 14px;
        `
        playerRow.appendChild(playerName)

        if (playerId === state.hostId) {
          const hostBadge = document.createElement('span')
          hostBadge.innerText = 'HOST'
          hostBadge.style.cssText = `
            background: #e94560;
            color: white;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: bold;
          `
          playerRow.appendChild(hostBadge)
        }

        playerList.appendChild(playerRow)
      })
    }

    if (statusMsg) {
      const remaining = 4 - state.players.length
      if (remaining > 0) {
        statusMsg.innerText = `Waiting for ${remaining} more player${remaining > 1 ? 's' : ''} to start...`
      } else {
        statusMsg.innerText = 'All players ready! Starting game...'
        statusMsg.style.color = '#4CAF50'
      }
    }
  }

  private cancelMatchSearch(): void {
    this.isSearching = false
    this.multiplayerManager.disconnect()
    
    if (this.lobbyContainer) {
      this.lobbyContainer.remove()
      this.lobbyContainer = null
    }
  }

  private onGameStartFromNetwork(): void {
    // Hide lobby and main menu
    if (this.lobbyContainer) {
      this.lobbyContainer.remove()
      this.lobbyContainer = null
    }
    this.hide()

    // Start the game
    if (this.onStartGameCallback) {
      this.onStartGameCallback()
    }
  }

  private startSoloGame(): void {
    this.hide()
    if (this.onStartGameCallback) {
      this.onStartGameCallback()
    }
  }

  private showJoinRoomDialog(): void {
    const dialog = this.createDialogOverlay()
    
    const dialogBox = document.createElement('div')
    dialogBox.style.cssText = `
      background: rgba(30, 30, 50, 0.95);
      border: 2px solid rgba(233, 69, 96, 0.3);
      border-radius: 15px;
      padding: 40px;
      text-align: center;
      min-width: 350px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
    `

    const title = document.createElement('h2')
    title.innerText = 'JOIN ROOM'
    title.style.cssText = `
      color: #e94560;
      font-size: 28px;
      margin: 0 0 20px 0;
      letter-spacing: 3px;
    `
    dialogBox.appendChild(title)

    const description = document.createElement('p')
    description.innerText = 'Enter the room ID to join a game with friends'
    description.style.cssText = `
      color: rgba(255, 255, 255, 0.7);
      font-size: 14px;
      margin: 0 0 20px 0;
    `
    dialogBox.appendChild(description)

    const input = document.createElement('input')
    input.type = 'text'
    input.placeholder = 'Enter Room ID'
    input.style.cssText = `
      width: 100%;
      padding: 15px;
      margin: 10px 0 20px 0;
      background: rgba(255, 255, 255, 0.1);
      border: 2px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      color: white;
      font-family: 'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif;
      font-size: 16px;
      outline: none;
      box-sizing: border-box;
    `
    input.addEventListener('focus', () => {
      input.style.borderColor = '#e94560'
    })
    input.addEventListener('blur', () => {
      input.style.borderColor = 'rgba(255, 255, 255, 0.2)'
    })
    dialogBox.appendChild(input)

    const buttonContainer = document.createElement('div')
    buttonContainer.style.cssText = `
      display: flex;
      gap: 10px;
      justify-content: center;
    `

    const joinBtn = this.createMenuButton('JOIN', async () => {
      const roomId = input.value.trim()
      if (roomId) {
        dialog.remove()
        await this.joinCustomRoom(roomId)
      }
    }, true)
    joinBtn.style.width = 'auto'
    joinBtn.style.padding = '12px 30px'
    buttonContainer.appendChild(joinBtn)

    const cancelBtn = this.createMenuButton('CANCEL', () => {
      dialog.remove()
    })
    cancelBtn.style.width = 'auto'
    cancelBtn.style.padding = '12px 30px'
    buttonContainer.appendChild(cancelBtn)

    dialogBox.appendChild(buttonContainer)
    dialog.appendChild(dialogBox)
    document.body.appendChild(dialog)

    input.focus()
  }

  private showCreateRoomDialog(): void {
    const dialog = this.createDialogOverlay()
    
    const dialogBox = document.createElement('div')
    dialogBox.style.cssText = `
      background: rgba(30, 30, 50, 0.95);
      border: 2px solid rgba(233, 69, 96, 0.3);
      border-radius: 15px;
      padding: 40px;
      text-align: center;
      min-width: 350px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
    `

    const title = document.createElement('h2')
    title.innerText = 'CREATE ROOM'
    title.style.cssText = `
      color: #e94560;
      font-size: 28px;
      margin: 0 0 20px 0;
      letter-spacing: 3px;
    `
    dialogBox.appendChild(title)

    const description = document.createElement('p')
    description.innerText = 'Create a room and share the ID with friends'
    description.style.cssText = `
      color: rgba(255, 255, 255, 0.7);
      font-size: 14px;
      margin: 0 0 20px 0;
    `
    dialogBox.appendChild(description)

    // Generate a random room ID
    const roomId = this.generateRoomId()

    const roomIdDisplay = document.createElement('div')
    roomIdDisplay.style.cssText = `
      background: rgba(255, 255, 255, 0.1);
      border: 2px solid rgba(233, 69, 96, 0.3);
      border-radius: 8px;
      padding: 15px;
      margin: 10px 0 20px 0;
    `

    const roomIdLabel = document.createElement('p')
    roomIdLabel.innerText = 'Room ID:'
    roomIdLabel.style.cssText = `
      color: rgba(255, 255, 255, 0.6);
      font-size: 12px;
      margin: 0 0 5px 0;
    `
    roomIdDisplay.appendChild(roomIdLabel)

    const roomIdText = document.createElement('p')
    roomIdText.innerText = roomId
    roomIdText.style.cssText = `
      color: #e94560;
      font-size: 24px;
      font-weight: bold;
      margin: 0;
      letter-spacing: 2px;
      user-select: all;
    `
    roomIdDisplay.appendChild(roomIdText)

    dialogBox.appendChild(roomIdDisplay)

    const copyBtn = this.createMenuButton('COPY ROOM ID', () => {
      navigator.clipboard.writeText(roomId)
      copyBtn.innerText = 'COPIED!'
      setTimeout(() => {
        copyBtn.innerText = 'COPY ROOM ID'
      }, 2000)
    })
    copyBtn.style.marginBottom = '10px'
    dialogBox.appendChild(copyBtn)

    const buttonContainer = document.createElement('div')
    buttonContainer.style.cssText = `
      display: flex;
      gap: 10px;
      justify-content: center;
    `

    const createBtn = this.createMenuButton('CREATE & JOIN', async () => {
      dialog.remove()
      await this.joinCustomRoom(roomId)
    }, true)
    createBtn.style.width = 'auto'
    createBtn.style.padding = '12px 30px'
    buttonContainer.appendChild(createBtn)

    const cancelBtn = this.createMenuButton('CANCEL', () => {
      dialog.remove()
    })
    cancelBtn.style.width = 'auto'
    cancelBtn.style.padding = '12px 30px'
    buttonContainer.appendChild(cancelBtn)

    dialogBox.appendChild(buttonContainer)
    dialog.appendChild(dialogBox)
    document.body.appendChild(dialog)
  }

  private createDialogOverlay(): HTMLDivElement {
    const dialog = document.createElement('div')
    dialog.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 3002;
      font-family: 'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif;
    `
    return dialog
  }

  private generateRoomId(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let result = ''
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  private async joinCustomRoom(roomId: string): Promise<void> {
    this.isSearching = true
    this.showLobbyScreen(roomId)
    await this.multiplayerManager.joinCustomRoom(roomId)
  }

  public show(): void {
    this.container.style.display = 'flex'
  }

  public hide(): void {
    this.container.style.display = 'none'
  }
}
