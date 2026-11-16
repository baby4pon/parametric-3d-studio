import * as THREE from 'three';
import { createRoundedRectShape, extrudePlan } from '../tools/geometryUtils';

export type IphoneOrientation = 'flat' | 'standing';

export class IphoneComparisonModel {
  public readonly group = new THREE.Group();
  private bodyGroup = new THREE.Group();
  private labelSprite: THREE.Sprite;
  private orientation: IphoneOrientation = 'flat';

  // iPhone 16 実寸 (mm)
  public static readonly LENGTH = 147.6;
  public static readonly WIDTH = 71.6;
  public static readonly THICKNESS = 7.8;

  constructor() {
    this.group.name = 'iphone-comparison-group';
    this.buildMesh();
    this.labelSprite = this.createTagSprite();
    this.group.add(this.bodyGroup);
    this.group.add(this.labelSprite);
    this.applyOrientation();
  }

  private buildMesh() {
    const W = IphoneComparisonModel.WIDTH;
    const L = IphoneComparisonModel.LENGTH;
    const T = IphoneComparisonModel.THICKNESS;

    // まずローカル座標で「Y=0..T の平置き（Z長辺, X短辺）」として構築する
    // 1. アルミフレーム本体
    const frameShape = createRoundedRectShape(W, L, 11.5);
    const frameGeom = extrudePlan(frameShape, T, 0, 20);
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x3b424c,
      metalness: 0.45,
      roughness: 0.35,
    });
    const frameMesh = new THREE.Mesh(frameGeom, frameMat);
    frameMesh.castShadow = true;
    frameMesh.receiveShadow = true;
    frameMesh.userData.isIphoneCompare = true;
    this.bodyGroup.add(frameMesh);

    // CAD輪郭線
    const edgeGeom = new THREE.EdgesGeometry(frameGeom, 32);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x111317 });
    this.bodyGroup.add(new THREE.LineSegments(edgeGeom, edgeMat));

    // 2. 前面ガラスディスプレイ (上面 y = T + 0.05)
    const screenShape = createRoundedRectShape(W - 4.2, L - 4.2, 9.5);
    const screenGeom = extrudePlan(screenShape, 0.25, T);
    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x101318,
      metalness: 0.15,
      roughness: 0.12,
    });
    const screenMesh = new THREE.Mesh(screenGeom, screenMat);
    screenMesh.userData.isIphoneCompare = true;
    this.bodyGroup.add(screenMesh);

    // 3. Dynamic Island (上部 -Z 側)
    const islandShape = createRoundedRectShape(20, 5.5, 2.7, 0, L / 2 - 11);
    const islandGeom = extrudePlan(islandShape, 0.15, T + 0.25);
    const islandMat = new THREE.MeshBasicMaterial({ color: 0x050608 });
    const islandMesh = new THREE.Mesh(islandGeom, islandMat);
    islandMesh.userData.isIphoneCompare = true;
    this.bodyGroup.add(islandMesh);

    // 4. 背面カメラバンプ (底面 y = -1.6..0)
    const camBumpShape = createRoundedRectShape(27, 29, 6, -W / 2 + 18, L / 2 - 19);
    const camBumpGeom = extrudePlan(camBumpShape, 1.4, -1.4);
    const camMesh = new THREE.Mesh(camBumpGeom, frameMat);
    camMesh.userData.isIphoneCompare = true;
    this.bodyGroup.add(camMesh);

    // 背面カメラレンズ2個
    const lensMat = new THREE.MeshStandardMaterial({ color: 0x181b20, metalness: 0.6, roughness: 0.2 });
    const lensGeom = new THREE.CylinderGeometry(5.5, 5.5, 0.8, 20);
    const lens1 = new THREE.Mesh(lensGeom, lensMat);
    lens1.position.set(-W / 2 + 13, -1.8, -L / 2 + 14);
    lens1.userData.isIphoneCompare = true;
    const lens2 = new THREE.Mesh(lensGeom, lensMat);
    lens2.position.set(-W / 2 + 13, -1.8, -L / 2 + 26);
    lens2.userData.isIphoneCompare = true;
    this.bodyGroup.add(lens1, lens2);
  }

  private createTagSprite(): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#141518';
    ctx.fillRect(4, 4, 504, 88);
    ctx.strokeStyle = '#ffb000';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 504, 88);

    ctx.fillStyle = '#ffb000';
    ctx.font = 'bold 26px "BIZ UDGothic", "Yu Gothic UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('iPhone 16 実寸 (147.6×71.6mm)', 256, 36);

    ctx.fillStyle = '#d4d8e0';
    ctx.font = '20px "BIZ UDGothic", "Yu Gothic UI", sans-serif';
    ctx.fillText('クリックで横置き ⇔ 縦置き切替', 256, 68);

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(92, 17.5, 1);
    sprite.renderOrder = 90;
    sprite.userData.isIphoneCompare = true;
    return sprite;
  }

  public setOrientation(mode: IphoneOrientation) {
    this.orientation = mode;
    this.applyOrientation();
  }

  public toggleOrientation(): IphoneOrientation {
    this.orientation = this.orientation === 'flat' ? 'standing' : 'flat';
    this.applyOrientation();
    return this.orientation;
  }

  public getOrientation(): IphoneOrientation {
    return this.orientation;
  }

  private applyOrientation() {
    if (this.orientation === 'flat') {
      this.bodyGroup.rotation.set(0, 0, 0);
      // 背面レンズが1.8mm下に突き出しているので少し浮かせて接地表現
      this.bodyGroup.position.set(0, 1.8, 0);
      this.labelSprite.position.set(0, 22, 0);
    } else {
      // 直立状態: X軸周りに -90度起こして底面(Y=0)に接地させる
      // ローカルZ (-L/2..+L/2) が +Y/-Y になるため Y = L/2
      this.bodyGroup.rotation.set(-Math.PI / 2, 0, 0);
      this.bodyGroup.position.set(0, IphoneComparisonModel.LENGTH / 2, 0);
      this.labelSprite.position.set(0, IphoneComparisonModel.LENGTH + 18, 0);
    }
  }

  /**
   * 生成されたモデルの横に干渉しない位置へ配置する
   */
  public placeBesideModel(modelOuterW: number) {
    const gap = 22;
    const xPos = -(modelOuterW / 2 + IphoneComparisonModel.WIDTH / 2 + gap);
    this.group.position.set(xPos, 0, 0);
  }
}
