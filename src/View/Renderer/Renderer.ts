import * as THREE from 'three'
import { ParticleManager } from '../Particle/ParticleManager'
import { IUpdatable } from '../../Interface/IUpdatable'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { SAOPass } from 'three/examples/jsm/postprocessing/SAOPass.js'

import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { PlayerWrapper } from '../../Core/PlayerWrapper'
import { GameObject } from '../../Core/GameObject'
import { Vector3D } from '../../Core/Vector'
import { RenderingConfig } from '../../Interface/utils'
import { SceneLighting } from './SceneLighting'
import { ViewmodelRenderer } from './ViewmodelRenderer'
import { PeriodicUpdater } from '../../Core/PeriodicUpdater'
import { BokehPass, SSAOPass, ShaderPass, UnrealBloomPass } from 'three/examples/jsm/Addons'
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass'
import { LensDistortionPassGen } from 'three-lens-distortion'

export class Renderer extends THREE.WebGLRenderer implements IUpdatable {
  public scene: THREE.Scene
  private fps!: number
  public camera!: THREE.PerspectiveCamera
  public viewmodelRenderer: ViewmodelRenderer
  public currentPlayer!: PlayerWrapper
  public particleManager: ParticleManager
  public renderingConfig!: RenderingConfig
  private composer!: EffectComposer
  public players: Array<PlayerWrapper>
  private debugCamera!: THREE.PerspectiveCamera
  private debugCameraPosition!: Vector3D
  private sky!: Sky
  public sceneLighting!: SceneLighting
  constructor(players: Array<PlayerWrapper>) {
    super({ antialias: false })
    this.autoClear = false
    this.shadowMap.autoUpdate = false
    this.players = players
    this.scene = new THREE.Scene()
    this.viewmodelRenderer = new ViewmodelRenderer()
    this.particleManager = new ParticleManager(this.scene)
    this.setSize(window.innerWidth, window.innerHeight)
    this.setRenderingConfig()
    this.onWindowResize = this.onWindowResize.bind(this)
    this.setPixelRatio(this.renderingConfig.resolution)
    this.fpsUpdater = new PeriodicUpdater(
      1000,
      (dt: number) => {
        this.updateFpsScreenText(dt)
      },
      this
    )
    window.addEventListener('resize', this.onWindowResize, false)
    document.body.appendChild(this.domElement)
  }

  private createDebugCamera() {
    this.debugCamera = new THREE.PerspectiveCamera(90)
    this.debugCamera.aspect = window.innerWidth / window.innerHeight
    this.debugCamera.updateProjectionMatrix()
    this.debugCameraPosition = new Vector3D(-5.4, 1, 0)
  }
  public setCurrentPlayer(player: PlayerWrapper) {
    this.setCamera(player.renderer!.camera)
    if (this.renderingConfig.hasPostProcess) {
      this.addPostProcess()
    }

    if (!this.currentPlayer) {
      this.sceneLighting = new SceneLighting(this)
      //this.setSkybox();

      if (this.renderingConfig.debugCamera) {
        this.createDebugCamera()
      }
    }
    this.currentPlayer = player
  }

  private createScissor(viewleft: number, viewbottom: number, viewwidth: number, viewheight: number) {
    const windowWidth = window.innerWidth
    const windowHeight = window.innerHeight

    const left = Math.floor(windowWidth * viewleft)
    const bottom = Math.floor(windowHeight * viewbottom)
    const width = Math.floor(windowWidth * viewwidth)
    const height = Math.floor(windowHeight * viewheight)

    this.setViewport(left, bottom, width, height)
    this.setScissor(left, bottom, width, height)
    this.setScissorTest(true)
  }

  private addPostProcess() {
    this.composer = new EffectComposer(this)
    this.composer.setSize(window.innerWidth, window.innerHeight)
    this.composer.addPass(new RenderPass(this.scene, this.camera))

    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85)
    bloomPass.threshold = 0.71
    bloomPass.strength = 0.2
    bloomPass.radius = 0.3

    this.composer.addPass(bloomPass)

    const dofParams = {
      focus: 0.4,
      aperture: 0.125,
      maxblur: 0.001,
    }

    const bokehPass = new BokehPass(this.scene, this.camera, dofParams)
    //this.composer.addPass(bokehPass)

    const ssaoPass = new SSAOPass(this.scene, this.camera, window.innerWidth, window.innerHeight)
    ssaoPass.kernelRadius = 0.5
    ssaoPass.minDistance = 0.001
    ssaoPass.maxDistance = 0.081
    this.composer.addPass(ssaoPass)

    const LensDistortionPass = new LensDistortionPassGen({ THREE, Pass, FullScreenQuad })
    const params = {
      distortion: new THREE.Vector2(0.24, 0.24),
      principalPoint: new THREE.Vector2(0, 0),
      focalLength: new THREE.Vector2(0.64, 0.64),
      skew: 0,
    }
    const lensDistortionPass = new LensDistortionPass(params)
    this.composer.addPass(lensDistortionPass)
  }
  private setSkybox(): void {
    const loader = new THREE.TextureLoader()
    const texture = loader.load('skybox - Copy.png', () => {
      const rt = new THREE.WebGLCubeRenderTarget(texture.image.height)
      rt.fromEquirectangularTexture(this, texture)
      this.scene.background = rt.texture
    })
  }
  private setRenderingConfig() {
    this.renderingConfig = {
      resolution: 1,
      hasParticle: true,
      hasPostProcess: false,
      hasLight: true,
      hasShadow: true,
      debugCamera: false,
      updateViewmodel: true,
      showViewmodel: true,
      legacyViewmodel: true,
    }
  }
  public setCamera(camera: THREE.PerspectiveCamera) {
    this.camera = camera
    this.scene.add(camera)
  }
  private onWindowResize(): void {
    if (this.camera instanceof THREE.PerspectiveCamera) {
      const width = window.innerWidth
      const height = window.innerHeight

      this.camera.aspect = width / height
      this.setPixelRatio(this.renderingConfig.resolution)
      this.camera.updateProjectionMatrix()
      this.viewmodelRenderer.camera.aspect = width / height
      this.viewmodelRenderer.camera.updateProjectionMatrix()
      this.setSize(width, height)
      this.update()
    }
  }
  public addToRenderer(gameObject: GameObject, viewmodel = false) {
    if (!viewmodel) this.scene.add(gameObject)
    else this.viewmodelRenderer.scene.add(gameObject)
  }

  private fpsUpdater: PeriodicUpdater
  private updateFps(dt: number) {
    this.fps = Math.floor(1 / dt)
  }
  private updateFpsScreenText(dt: number) {
    this.updateFps(dt)
    document.getElementById('fps')!.innerText = this.fps + ' FPS'
  }

  public update(dt: number = 1 / 60): void {
    if (!this.camera) {
      throw new Error('No camera to render to!')
    }
    this.currentPlayer.cameraManager!.update(dt)
    this.fpsUpdater.update(dt)
    if (this.renderingConfig.hasParticle) {
      this.particleManager.update(dt)
    }
    this.sceneLighting.update(dt)

    for (let i = 0; i < this.players.length; i++) {
      if (this.players[i].renderer) {
        this.players[i].renderer?.update(dt)
      } else {
        console.log(this.players[i] + "doesn't have a PlayerRenderer")
      }
    }
    if (this.renderingConfig.debugCamera) {
      this.createScissor(0, 0, 1, 1)
    }
    if (this.renderingConfig.hasPostProcess) {
      this.composer.render()
    } else {
      this.render(this.scene, this.camera)
    }
    if (this.renderingConfig.showViewmodel && !this.renderingConfig.legacyViewmodel) {
      this.viewmodelRenderer.render(this, dt)
    }

    if (this.renderingConfig.debugCamera) {
      this.createScissor(0, 0.5, 0.2, 0.2)
      this.debugCamera.position.copy(this.currentPlayer.player.position).add(this.debugCameraPosition)
      this.debugCamera.lookAt(this.currentPlayer.player.position)
      this.render(this.scene, this.debugCamera)
    }
    //this.camera.updateProjectionMatrix();
  }
}
