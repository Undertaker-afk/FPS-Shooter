import { MultiplayerManager } from '../Multiplayer/MultiplayerManager'

export class EscMenu {
  private static readonly CONTROLS_MODAL_ID = 'controls-modal'
  private static readonly ESCAPE_KEY = 'Escape'
  
  private container: HTMLDivElement
  private isVisible = false
  private onResumeCallback: (() => void) | null = null
  private onDisconnectCallback: (() => void) | null = null
  private multiplayerManager: MultiplayerManager

  constructor() {
    this.multiplayerManager = MultiplayerManager.getInstance()
    this.container = this.createContainer()
    document.body.appendChild(this.container)
    this.setupKeyListener()
  }

  public setResumeCallback(callback: () => void): void {
    this.onResumeCallback = callback
  }

  public setDisconnectCallback(callback: () => void): void {
    this.onDisconnectCallback = callback
  }
  
  private removeControlsModal(): void {
    const modal = document.getElementById(EscMenu.CONTROLS_MODAL_ID)
    if (modal) {
      modal.remove()
    }
  }

  private createContainer(): HTMLDivElement {
    const container = document.createElement('div')
    container.id = 'esc-menu'
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 2000;
      flex-direction: column;
    `

    const menuBox = document.createElement('div')
    menuBox.style.cssText = `
      background: rgba(30, 30, 30, 0.95);
      border: 2px solid rgba(255, 255, 255, 0.2);
      border-radius: 10px;
      padding: 40px;
      text-align: center;
      min-width: 300px;
    `

    const title = document.createElement('h1')
    title.innerText = 'PAUSED'
    title.style.cssText = `
      color: white;
      font-family: 'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif;
      font-size: 32px;
      margin: 0 0 30px 0;
      letter-spacing: 4px;
    `
    menuBox.appendChild(title)

    // Resume button
    const resumeBtn = this.createMenuButton('RESUME', () => this.hide())
    menuBox.appendChild(resumeBtn)

    // Settings button (placeholder for future functionality)
    const settingsBtn = this.createMenuButton('SETTINGS', () => {
      // Future settings implementation
      console.log('Settings clicked')
    })
    menuBox.appendChild(settingsBtn)

    // Controls info button
    const controlsBtn = this.createMenuButton('CONTROLS', () => this.showControls())
    menuBox.appendChild(controlsBtn)

    // Disconnect button
    const disconnectBtn = this.createMenuButton('DISCONNECT', () => this.handleDisconnect(), true)
    menuBox.appendChild(disconnectBtn)

    container.appendChild(menuBox)
    return container
  }

  private handleDisconnect(): void {
    this.multiplayerManager.disconnect()
    this.hide()
    if (this.onDisconnectCallback) {
      this.onDisconnectCallback()
    }
    // Reload the page to return to main menu
    window.location.reload()
  }

  private createMenuButton(label: string, onClick: () => void, isDanger: boolean = false): HTMLButtonElement {
    const button = document.createElement('button')
    button.innerText = label
    const baseBackground = isDanger ? 'rgba(233, 69, 96, 0.3)' : 'rgba(255, 255, 255, 0.1)'
    const baseBorder = isDanger ? 'rgba(233, 69, 96, 0.6)' : 'rgba(255, 255, 255, 0.3)'
    const hoverBackground = isDanger ? 'rgba(233, 69, 96, 0.5)' : 'rgba(255, 255, 255, 0.2)'
    const hoverBorder = isDanger ? 'rgba(233, 69, 96, 0.8)' : 'rgba(255, 255, 255, 0.5)'
    button.style.cssText = `
      display: block;
      width: 100%;
      padding: 15px 30px;
      margin: 10px 0;
      background: ${baseBackground};
      border: 1px solid ${baseBorder};
      border-radius: 5px;
      color: white;
      font-family: 'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif;
      font-size: 18px;
      letter-spacing: 2px;
      cursor: pointer;
      transition: all 0.2s ease;
      outline: none;
    `
    button.addEventListener('mouseenter', () => {
      button.style.background = hoverBackground
      button.style.borderColor = hoverBorder
    })
    button.addEventListener('mouseleave', () => {
      button.style.background = baseBackground
      button.style.borderColor = baseBorder
    })
    button.addEventListener('click', onClick)
    return button
  }

  private showControls(): void {
    this.removeControlsModal()

    const modal = document.createElement('div')
    modal.id = EscMenu.CONTROLS_MODAL_ID
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.9);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 2001;
    `

    const controlsBox = document.createElement('div')
    controlsBox.style.cssText = `
      background: rgba(30, 30, 30, 0.95);
      border: 2px solid rgba(255, 255, 255, 0.2);
      border-radius: 10px;
      padding: 30px;
      max-width: 400px;
    `

    const title = document.createElement('h2')
    title.innerText = 'CONTROLS'
    title.style.cssText = `
      color: white;
      font-family: 'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif;
      margin: 0 0 20px 0;
      text-align: center;
      letter-spacing: 2px;
    `
    controlsBox.appendChild(title)

    const controls = [
      { key: 'W/Z', action: 'Move Forward' },
      { key: 'S', action: 'Move Backward' },
      { key: 'A/Q', action: 'Move Left' },
      { key: 'D', action: 'Move Right' },
      { key: 'SPACE', action: 'Jump' },
      { key: 'SHIFT', action: 'Sprint' },
      { key: 'R', action: 'Reload' },
      { key: 'LMB', action: 'Shoot' },
      { key: 'RMB', action: 'Zoom' },
      { key: '1/2/3', action: 'Switch Weapons' },
      { key: 'ESC', action: 'Pause Menu' },
    ]

    controls.forEach(({ key, action }) => {
      const row = document.createElement('div')
      row.style.cssText = `
        display: flex;
        justify-content: space-between;
        padding: 8px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        color: white;
        font-family: 'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif;
      `
      const keySpan = document.createElement('span')
      keySpan.innerText = key
      keySpan.style.cssText = `
        background: rgba(255, 255, 255, 0.1);
        padding: 4px 8px;
        border-radius: 4px;
        font-weight: bold;
      `
      const actionSpan = document.createElement('span')
      actionSpan.innerText = action
      actionSpan.style.color = 'rgba(255, 255, 255, 0.8)'

      row.appendChild(keySpan)
      row.appendChild(actionSpan)
      controlsBox.appendChild(row)
    })

    const closeBtn = this.createMenuButton('BACK', () => modal.remove())
    closeBtn.style.marginTop = '20px'
    controlsBox.appendChild(closeBtn)

    modal.appendChild(controlsBox)
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove()
      }
    })

    document.body.appendChild(modal)
  }

  private setupKeyListener(): void {
    document.addEventListener('keydown', (e) => {
      if (e.key === EscMenu.ESCAPE_KEY) {
        this.toggle()
      }
    })
  }

  public show(): void {
    this.isVisible = true
    this.container.style.display = 'flex'
    document.exitPointerLock()
  }

  public hide(): void {
    this.isVisible = false
    this.container.style.display = 'none'
    this.removeControlsModal()
    if (this.onResumeCallback) {
      this.onResumeCallback()
    }
  }

  public toggle(): void {
    if (this.isVisible) {
      this.hide()
    } else {
      this.show()
    }
  }

  public getIsVisible(): boolean {
    return this.isVisible
  }
}
