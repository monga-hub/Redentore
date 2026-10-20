import * as THREE from 'three';

// The character sheet's figure, WoW style: the hero himself, full length and as dressed now, idling in the middle of the
// paper doll; a drag turns him round. No second copy of him: the game's renderer draws the hero (his meshes, his gear,
// his materials) with two lights of its own, a layer apart, into a corner of its own canvas just before the frame's own
// draw paints over it, and the corner is copied into the sheet's canvas. Only while the sheet is open; closed, the
// sheet's canvas gives its pixels back.

const LAYER = 7;
const TURN = 0.012; // rad a dragged px

export class Figure {
  private readonly cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  private readonly key = new THREE.DirectionalLight(0xffe2b8, 2.8);
  private readonly fill = new THREE.DirectionalLight(0x8aa8ff, 1.3);
  private readonly floor: THREE.Mesh;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly hero: THREE.Object3D;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  /** The viewer's turn round the hero (dragged), from three-quarters on his left. */
  private yaw = 0.45;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, hero: THREE.Object3D, canvas: HTMLCanvasElement) {
    this.renderer = renderer;
    this.scene = scene;
    this.hero = hero;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    // A warm pool of light on the floor under his feet, fading out.
    const disc = new THREE.CircleGeometry(0.75, 28).rotateX(-Math.PI / 2), n = disc.attributes.position.count, rgba = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) rgba.set([0.42, 0.3, 0.16, i ? 0 : 0.75], i * 4); // the centre lit, the rim clear
    disc.setAttribute('color', new THREE.BufferAttribute(rgba, 4));
    this.floor = new THREE.Mesh(disc, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
    for (const o of [new THREE.HemisphereLight(0xd8d2ff, 0x2a1e14, 1.7), this.key, this.fill, this.floor]) { o.layers.set(LAYER); scene.add(o); }
    this.cam.layers.set(LAYER);
    let x = -1;
    canvas.addEventListener('pointerdown', (e) => { x = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (x < 0) return; this.yaw -= (e.clientX - x) * TURN; x = e.clientX; });
    const up = () => { x = -1; };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  }

  /** Before the frame's own draw, while the sheet is open: the hero into the sheet's canvas. */
  draw(): void {
    const r = this.renderer, s = this.scene, gl = r.domElement, css = this.canvas.getBoundingClientRect();
    const px = r.getPixelRatio(), w = Math.round(css.width * px), h = Math.round(css.height * px); // the game's own sharpness, rung and all
    if (!w || !h || w > gl.width || h > gl.height) return;
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.hero.traverse((o) => o.layers.enable(LAYER)); // pieces come and go: every time
    const at = this.hero.getWorldPosition(new THREE.Vector3()), ahead = this.hero.getWorldDirection(new THREE.Vector3()).negate().setY(0).normalize(); // he faces -Z
    ahead.applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.yaw);
    const side = new THREE.Vector3(ahead.z, 0, -ahead.x);
    this.cam.aspect = w / h;
    this.cam.fov = 2 * THREE.MathUtils.radToDeg(Math.atan(1.06 / 4.6)); // 2.12 m tall at 4.6 m: a mitre or a staff and the feet
    this.cam.updateProjectionMatrix();
    this.cam.position.copy(at).addScaledVector(ahead, 4.6).setY(at.y + 1.25);
    this.cam.lookAt(at.x, at.y + 1.02, at.z);
    this.key.position.copy(at).addScaledVector(ahead, 3).addScaledVector(side, 2.2).setY(at.y + 3.4);
    this.fill.position.copy(at).addScaledVector(ahead, -2).addScaledVector(side, -2.5).setY(at.y + 1.6);
    for (const l of [this.key, this.fill]) { l.target.position.copy(at).setY(at.y + 1); l.target.updateMatrixWorld(); }
    this.floor.position.copy(at).setY(at.y + 0.01);
    const bg = s.background, fog = s.fog, clear = r.getClearColor(new THREE.Color()), alpha = r.getClearAlpha(), vp = r.getViewport(new THREE.Vector4());
    const scissor = r.getScissor(new THREE.Vector4()), cut = r.getScissorTest(), target = r.getRenderTarget(), cw = w / px, ch = h / px;
    s.background = null;
    s.fog = null;
    r.setRenderTarget(null);
    r.setViewport(0, 0, cw, ch);
    r.setScissor(0, 0, cw, ch);
    r.setScissorTest(true);
    r.setClearColor(0x120c08, 1);
    r.clear();
    r.render(s, this.cam);
    this.ctx.drawImage(gl, 0, gl.height - h, w, h, 0, 0, w, h); // GL's bottom-left corner
    s.background = bg;
    s.fog = fog;
    r.setClearColor(clear, alpha);
    r.setScissorTest(cut);
    r.setScissor(scissor);
    r.setViewport(vp);
    r.setRenderTarget(target);
  }

  /** The sheet closed: its canvas's pixels go back; the next open starts from three-quarters again. */
  free(): void {
    this.canvas.width = this.canvas.height = 0;
    this.yaw = 0.45;
  }
}
