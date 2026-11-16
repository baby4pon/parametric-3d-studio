import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ComputedMetrics } from '../types';
import { DimensionOverlay } from './dimensionOverlay';
import { IphoneComparisonModel, IphoneOrientation } from './iphoneModel';

export type CameraPreset = 'iso' | 'top' | 'front' | 'right' | 'bottom';

export class ViewportSceneManager {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;

  private modelGroup = new THREE.Group();
  private currentGeometry: THREE.BufferGeometry | null = null;
  private modelMaterial: THREE.MeshStandardMaterial;
  private edgeMaterial: THREE.LineBasicMaterial;

  private buildPlateGroup = new THREE.Group();
  private dimOverlay = new DimensionOverlay();
  private iphoneModel = new IphoneComparisonModel();

  private showDimensions = true;
  private showIphone = false;
  private animFrameId = 0;
  private resizeObserver: ResizeObserver;
  private raycaster = new THREE.Raycaster();
  private pointerDownPos = new THREE.Vector2();

  public onIphoneOrientationChanged?: (orientation: IphoneOrientation) => void;

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene = new THREE.Scene();

    const width = Math.max(100, container.clientWidth);
    const height = Math.max(100, container.clientHeight);

    this.camera = new THREE.PerspectiveCamera(40, width / height, 1, 3000);
    this.camera.position.set(185, 165, 220);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxDistance = 1200;
    this.controls.minDistance = 40;
    this.controls.target.set(0, 20, 0);

    // CAD陰影用ライト構成
    const ambient = new THREE.AmbientLight(0xffffff, 0.72);
    const keyLight = new THREE.DirectionalLight(0xfff9ee, 1.35);
    keyLight.position.set(180, 260, 180);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 50;
    keyLight.shadow.camera.far = 800;
    const d = 220;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;

    const fillLight = new THREE.DirectionalLight(0xdce8ff, 0.55);
    fillLight.position.set(-160, 120, -140);

    const rimLight = new THREE.DirectionalLight(0xffdf99, 0.35);
    rimLight.position.set(0, -120, -160);

    this.scene.add(ambient, keyLight, fillLight, rimLight);

    this.modelMaterial = new THREE.MeshStandardMaterial({
      color: 0xf4a800,
      metalness: 0.06,
      roughness: 0.56,
    });
    this.edgeMaterial = new THREE.LineBasicMaterial({
      color: 0x3a2700,
      transparent: true,
      opacity: 0.55,
    });

    this.scene.add(this.buildPlateGroup);
    this.scene.add(this.modelGroup);
    this.scene.add(this.dimOverlay.group);

    this.iphoneModel.group.visible = false;
    this.scene.add(this.iphoneModel.group);

    this.setTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
    this.bindEvents();

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    this.animate();
  }

  private bindEvents() {
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', (e) => {
      this.pointerDownPos.set(e.clientX, e.clientY);
    });
    dom.addEventListener('pointerup', (e) => {
      const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
      if (dist > 5 || !this.showIphone) return;

      const rect = dom.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      this.raycaster.setFromCamera(ndc, this.camera);
      const hits = this.raycaster.intersectObjects(this.iphoneModel.group.children, true);
      if (hits.some((h) => h.object.userData?.isIphoneCompare)) {
        const next = this.iphoneModel.toggleOrientation();
        this.onIphoneOrientationChanged?.(next);
      }
    });
  }

  public setTheme(theme: 'dark' | 'light') {
    const isLight = theme === 'light';
    this.scene.background = new THREE.Color(isLight ? 0xe7e4dc : 0x141518);
    this.rebuildBuildPlate(isLight);
  }

  private rebuildBuildPlate(isLight: boolean) {
    while (this.buildPlateGroup.children.length > 0) {
      const obj = this.buildPlateGroup.children[0];
      this.buildPlateGroup.remove(obj);
    }

    // 256×256mm ビルドプレート (Bambu / 汎用標準サイズ)
    const size = 256;
    const plateGeom = new THREE.PlaneGeometry(size, size);
    plateGeom.rotateX(-Math.PI / 2);
    const plateMat = new THREE.MeshStandardMaterial({
      color: isLight ? 0xd9d5cb : 0x1b1d22,
      roughness: 0.9,
      metalness: 0.05,
    });
    const plate = new THREE.Mesh(plateGeom, plateMat);
    plate.position.y = -0.05;
    plate.receiveShadow = true;
    this.buildPlateGroup.add(plate);

    // 16分割 (16mmピッチ) + 細グリッド
    const gridMain = new THREE.GridHelper(
      size,
      16,
      isLight ? 0x8a8578 : 0x454b54,
      isLight ? 0xbbb6aa : 0x2a2d34
    );
    gridMain.position.y = 0.01;
    this.buildPlateGroup.add(gridMain);

    // プレート外枠（イエローアクセント）
    const borderPts = [
      new THREE.Vector3(-size / 2, 0.05, -size / 2),
      new THREE.Vector3(size / 2, 0.05, -size / 2),
      new THREE.Vector3(size / 2, 0.05, size / 2),
      new THREE.Vector3(-size / 2, 0.05, size / 2),
      new THREE.Vector3(-size / 2, 0.05, -size / 2),
    ];
    const borderGeom = new THREE.BufferGeometry().setFromPoints(borderPts);
    const borderLine = new THREE.Line(
      borderGeom,
      new THREE.LineBasicMaterial({ color: 0xffb000, transparent: true, opacity: 0.7 })
    );
    this.buildPlateGroup.add(borderLine);
  }

  public updateModel(geometry: THREE.BufferGeometry, metrics: ComputedMetrics) {
    // 古いメッシュ解放
    while (this.modelGroup.children.length > 0) {
      const child = this.modelGroup.children[0] as THREE.Mesh;
      this.modelGroup.remove(child);
      if (child.geometry && child.geometry !== this.currentGeometry) {
        child.geometry.dispose();
      }
    }
    if (this.currentGeometry) {
      this.currentGeometry.dispose();
    }

    this.currentGeometry = geometry;
    const mesh = new THREE.Mesh(geometry, this.modelMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.modelGroup.add(mesh);

    const edges = new THREE.EdgesGeometry(geometry, 28);
    const lineSegments = new THREE.LineSegments(edges, this.edgeMaterial);
    this.modelGroup.add(lineSegments);

    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox ?? new THREE.Box3();

    this.dimOverlay.update(bounds, metrics, this.showDimensions);
    this.iphoneModel.placeBesideModel(metrics.outerW);
  }

  public setShowDimensions(show: boolean, metrics?: ComputedMetrics) {
    this.showDimensions = show;
    if (this.currentGeometry && metrics) {
      this.currentGeometry.computeBoundingBox();
      this.dimOverlay.update(
        this.currentGeometry.boundingBox ?? new THREE.Box3(),
        metrics,
        this.showDimensions
      );
    } else {
      this.dimOverlay.group.visible = show;
    }
  }

  public setShowIphone(show: boolean, outerW?: number) {
    this.showIphone = show;
    this.iphoneModel.group.visible = show;
    if (show && outerW) {
      this.iphoneModel.placeBesideModel(outerW);
    }
  }

  public setIphoneOrientation(mode: IphoneOrientation) {
    this.iphoneModel.setOrientation(mode);
  }

  public getIphoneOrientation(): IphoneOrientation {
    return this.iphoneModel.getOrientation();
  }

  public setModelColor(hex: number) {
    this.modelMaterial.color.setHex(hex);
  }

  public setViewPreset(preset: CameraPreset) {
    const box = new THREE.Box3();
    if (this.currentGeometry) {
      this.currentGeometry.computeBoundingBox();
      if (this.currentGeometry.boundingBox) {
        box.copy(this.currentGeometry.boundingBox);
      }
    }
    if (box.isEmpty()) {
      box.set(new THREE.Vector3(-60, 0, -60), new THREE.Vector3(60, 50, 60));
    }

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 80);
    const dist = maxDim * 2.05;

    this.controls.target.copy(center);

    switch (preset) {
      case 'top':
        this.camera.position.set(center.x, center.y + dist * 1.15, center.z + 0.01);
        break;
      case 'front':
        this.camera.position.set(center.x, center.y + size.y * 0.15, center.z + dist);
        break;
      case 'right':
        this.camera.position.set(center.x + dist, center.y + size.y * 0.15, center.z);
        break;
      case 'bottom':
        this.camera.position.set(center.x, center.y - dist * 1.15, center.z + 0.01);
        break;
      case 'iso':
      default:
        this.camera.position.set(center.x + dist * 0.72, center.y + dist * 0.65, center.z + dist * 0.85);
        break;
    }
    this.controls.update();
  }

  public getCurrentGeometry(): THREE.BufferGeometry | null {
    return this.currentGeometry;
  }

  public captureThumbnailDataUrl(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  private handleResize() {
    const w = Math.max(100, this.container.clientWidth);
    const h = Math.max(100, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private animate = () => {
    this.animFrameId = requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  public dispose() {
    cancelAnimationFrame(this.animFrameId);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
