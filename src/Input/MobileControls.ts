import { Key, KeyBinding } from './KeyBinding'

export class MobileControls {
  private keys: Map<Key, KeyBinding>
  private container: HTMLDivElement
  private leftJoystick: HTMLDivElement
  private leftJoystickKnob: HTMLDivElement
  private rightJoystick: HTMLDivElement
  private rightJoystickKnob: HTMLDivElement
  private isLeftJoystickActive = false
  private isRightJoystickActive = false
  private leftJoystickStartX = 0
  private leftJoystickStartY = 0
  private rightJoystickStartX = 0
  private rightJoystickStartY = 0
  private onMouseMoveCallback: ((deltaX: number, deltaY: number) => void) | null = null

  // Joystick sensitivity
  private readonly JOYSTICK_RADIUS = 40
  private readonly LOOK_SENSITIVITY = 3

  constructor(keys: Map<Key, KeyBinding>) {
    this.keys = keys
    this.container = this.createContainer()
    this.leftJoystick = this.createJoystick('left')
    this.leftJoystickKnob = this.createJoystickKnob()
    this.leftJoystick.appendChild(this.leftJoystickKnob)
    this.rightJoystick = this.createJoystick('right')
    this.rightJoystickKnob = this.createJoystickKnob()
    this.rightJoystick.appendChild(this.rightJoystickKnob)

    this.container.appendChild(this.leftJoystick)
    this.container.appendChild(this.rightJoystick)
    this.createActionButtons()

    document.body.appendChild(this.container)
    this.setupTouchEvents()

    // Hide on desktop
    this.checkMobile()
    window.addEventListener('resize', () => this.checkMobile())
  }

  private checkMobile(): void {
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    this.container.style.display = isMobile ? 'block' : 'none'
  }

  public show(): void {
    this.container.style.display = 'block'
  }

  public hide(): void {
    this.container.style.display = 'none'
  }

  public setMouseMoveCallback(callback: (deltaX: number, deltaY: number) => void): void {
    this.onMouseMoveCallback = callback
  }

  private createContainer(): HTMLDivElement {
    const container = document.createElement('div')
    container.id = 'mobile-controls'
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1000;
      user-select: none;
      -webkit-user-select: none;
    `
    return container
  }

  private createJoystick(side: 'left' | 'right'): HTMLDivElement {
    const joystick = document.createElement('div')
    joystick.id = `${side}-joystick`
    const isLeft = side === 'left'
    joystick.style.cssText = `
      position: absolute;
      bottom: 80px;
      ${isLeft ? 'left: 60px' : 'right: 60px'};
      width: 120px;
      height: 120px;
      background: rgba(255, 255, 255, 0.15);
      border: 3px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      pointer-events: auto;
      touch-action: none;
    `
    return joystick
  }

  private createJoystickKnob(): HTMLDivElement {
    const knob = document.createElement('div')
    knob.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 50px;
      height: 50px;
      background: rgba(255, 255, 255, 0.5);
      border: 2px solid rgba(255, 255, 255, 0.7);
      border-radius: 50%;
      pointer-events: none;
    `
    return knob
  }

  private createActionButtons(): void {
    // Jump button
    const jumpBtn = this.createButton('JUMP', 'right', 200, () => {
      this.keys.get(Key.Jump)?.setPressed(true)
    }, () => {
      this.keys.get(Key.Jump)?.onKeyUp()
    })
    this.container.appendChild(jumpBtn)

    // Shoot button
    const shootBtn = this.createButton('🔫', 'right', 280, () => {
      this.keys.get(Key.Left_Click)?.setPressed(true)
    }, () => {
      this.keys.get(Key.Left_Click)?.onKeyUp()
    })
    shootBtn.style.fontSize = '24px'
    this.container.appendChild(shootBtn)

    // Reload button
    const reloadBtn = this.createButton('R', 'right', 360, () => {
      this.keys.get(Key.Reload)?.setPressed(true)
    }, () => {
      this.keys.get(Key.Reload)?.onKeyUp()
    })
    this.container.appendChild(reloadBtn)
  }

  private createButton(
    label: string,
    side: 'left' | 'right',
    bottomOffset: number,
    onPress: () => void,
    onRelease: () => void
  ): HTMLButtonElement {
    const button = document.createElement('button')
    button.innerText = label
    const isLeft = side === 'left'
    button.style.cssText = `
      position: absolute;
      bottom: ${bottomOffset}px;
      ${isLeft ? 'left: 200px' : 'right: 200px'};
      width: 60px;
      height: 60px;
      background: rgba(255, 255, 255, 0.2);
      border: 2px solid rgba(255, 255, 255, 0.4);
      border-radius: 50%;
      color: white;
      font-size: 16px;
      font-weight: bold;
      pointer-events: auto;
      touch-action: none;
      outline: none;
      -webkit-tap-highlight-color: transparent;
    `
    button.addEventListener('touchstart', (e) => {
      e.preventDefault()
      button.style.background = 'rgba(255, 255, 255, 0.4)'
      onPress()
    })
    button.addEventListener('touchend', (e) => {
      e.preventDefault()
      button.style.background = 'rgba(255, 255, 255, 0.2)'
      onRelease()
    })
    button.addEventListener('touchcancel', (e) => {
      e.preventDefault()
      button.style.background = 'rgba(255, 255, 255, 0.2)'
      onRelease()
    })
    return button
  }

  private setupTouchEvents(): void {
    // Left joystick (movement)
    this.leftJoystick.addEventListener('touchstart', (e) => this.onLeftJoystickStart(e))
    this.leftJoystick.addEventListener('touchmove', (e) => this.onLeftJoystickMove(e))
    this.leftJoystick.addEventListener('touchend', (e) => this.onLeftJoystickEnd(e))
    this.leftJoystick.addEventListener('touchcancel', (e) => this.onLeftJoystickEnd(e))

    // Right joystick (look)
    this.rightJoystick.addEventListener('touchstart', (e) => this.onRightJoystickStart(e))
    this.rightJoystick.addEventListener('touchmove', (e) => this.onRightJoystickMove(e))
    this.rightJoystick.addEventListener('touchend', (e) => this.onRightJoystickEnd(e))
    this.rightJoystick.addEventListener('touchcancel', (e) => this.onRightJoystickEnd(e))
  }

  private onLeftJoystickStart(e: TouchEvent): void {
    e.preventDefault()
    this.isLeftJoystickActive = true
    const touch = e.touches[0]
    const rect = this.leftJoystick.getBoundingClientRect()
    this.leftJoystickStartX = rect.left + rect.width / 2
    this.leftJoystickStartY = rect.top + rect.height / 2
  }

  private onLeftJoystickMove(e: TouchEvent): void {
    if (!this.isLeftJoystickActive) return
    e.preventDefault()

    const touch = e.touches[0]
    let deltaX = touch.clientX - this.leftJoystickStartX
    let deltaY = touch.clientY - this.leftJoystickStartY

    // Clamp to radius
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
    if (distance > this.JOYSTICK_RADIUS) {
      deltaX = (deltaX / distance) * this.JOYSTICK_RADIUS
      deltaY = (deltaY / distance) * this.JOYSTICK_RADIUS
    }

    // Update knob position
    this.leftJoystickKnob.style.transform = `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px))`

    // Update movement keys
    const threshold = 10
    this.updateMovementKey(Key.Forward, deltaY < -threshold)
    this.updateMovementKey(Key.Backward, deltaY > threshold)
    this.updateMovementKey(Key.Left, deltaX < -threshold)
    this.updateMovementKey(Key.Right, deltaX > threshold)
  }

  private onLeftJoystickEnd(e: TouchEvent): void {
    e.preventDefault()
    this.isLeftJoystickActive = false
    this.leftJoystickKnob.style.transform = 'translate(-50%, -50%)'

    // Release all movement keys
    this.keys.get(Key.Forward)?.onKeyUp()
    this.keys.get(Key.Backward)?.onKeyUp()
    this.keys.get(Key.Left)?.onKeyUp()
    this.keys.get(Key.Right)?.onKeyUp()
  }

  private onRightJoystickStart(e: TouchEvent): void {
    e.preventDefault()
    this.isRightJoystickActive = true
    const touch = e.touches[0]
    const rect = this.rightJoystick.getBoundingClientRect()
    this.rightJoystickStartX = touch.clientX
    this.rightJoystickStartY = touch.clientY
  }

  private onRightJoystickMove(e: TouchEvent): void {
    if (!this.isRightJoystickActive) return
    e.preventDefault()

    const touch = e.touches[0]
    let deltaX = touch.clientX - this.rightJoystickStartX
    let deltaY = touch.clientY - this.rightJoystickStartY

    // Clamp to radius for visual
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
    let visualDeltaX = deltaX
    let visualDeltaY = deltaY
    if (distance > this.JOYSTICK_RADIUS) {
      visualDeltaX = (deltaX / distance) * this.JOYSTICK_RADIUS
      visualDeltaY = (deltaY / distance) * this.JOYSTICK_RADIUS
    }

    // Update knob position
    this.rightJoystickKnob.style.transform = `translate(calc(-50% + ${visualDeltaX}px), calc(-50% + ${visualDeltaY}px))`

    // Trigger camera movement
    if (this.onMouseMoveCallback) {
      this.onMouseMoveCallback(deltaX * this.LOOK_SENSITIVITY, deltaY * this.LOOK_SENSITIVITY)
    }

    // Update start position for continuous movement
    this.rightJoystickStartX = touch.clientX
    this.rightJoystickStartY = touch.clientY
  }

  private onRightJoystickEnd(e: TouchEvent): void {
    e.preventDefault()
    this.isRightJoystickActive = false
    this.rightJoystickKnob.style.transform = 'translate(-50%, -50%)'
  }

  private updateMovementKey(key: Key, shouldBePressed: boolean): void {
    const keyBinding = this.keys.get(key)
    if (!keyBinding) return

    if (shouldBePressed && !keyBinding.isPressed) {
      keyBinding.setPressed(true)
    } else if (!shouldBePressed && keyBinding.isPressed) {
      keyBinding.onKeyUp()
    }
  }
}
