import * as THREE from 'three';
import { ComputedMetrics } from '../types';

/**
 * 3D空間にCAD図面スタイルの寸法線・補助線・矢印・数値ラベルを描画するオーバーレイ管理クラス
 */
export class DimensionOverlay {
  public readonly group = new THREE.Group();

  constructor() {
    this.group.name = 'dimension-overlay';
  }

  public clear() {
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
      child.traverse((obj) => {
        if ((obj as THREE.Mesh).geometry) {
          (obj as THREE.Mesh).geometry.dispose();
        }
        const mat = (obj as THREE.Mesh).material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => m.dispose());
        } else if (mat) {
          if ((mat as THREE.SpriteMaterial).map) {
            (mat as THREE.SpriteMaterial).map?.dispose();
          }
          mat.dispose();
        }
      });
    }
  }

  public update(bounds: THREE.Box3, metrics: ComputedMetrics, visible: boolean) {
    this.clear();
    this.group.visible = visible;
    if (!visible || bounds.isEmpty()) return;

    const min = bounds.min;
    const max = bounds.max;
    const w = max.x - min.x;
    const h = max.y - min.y;
    const d = max.z - min.z;
    const maxDim = Math.max(w, d, h, 40);
    const labelScale = Math.max(0.13, Math.min(0.26, maxDim * 0.0018));

    const outerColor = 0xffb000;
    const innerColor = 0x00e5ff;
    const offset = Math.max(12, Math.min(20, maxDim * 0.12));

    // 1. 幅 W (手前下 +Z 側)
    const wz = max.z + offset;
    this.addDimensionLine(
      new THREE.Vector3(min.x, min.y + 0.5, wz),
      new THREE.Vector3(max.x, min.y + 0.5, wz),
      new THREE.Vector3(min.x, min.y + 0.5, max.z + 2),
      new THREE.Vector3(max.x, min.y + 0.5, max.z + 2),
      `W ${w.toFixed(1)} mm`,
      outerColor,
      '#141518',
      '#ffb000',
      new THREE.Vector3(0, 6, 4),
      labelScale
    );

    // 2. 奥行 D (右側下 +X 側)
    const dx = max.x + offset;
    this.addDimensionLine(
      new THREE.Vector3(dx, min.y + 0.5, min.z),
      new THREE.Vector3(dx, min.y + 0.5, max.z),
      new THREE.Vector3(max.x + 2, min.y + 0.5, min.z),
      new THREE.Vector3(max.x + 2, min.y + 0.5, max.z),
      `D ${d.toFixed(1)} mm`,
      outerColor,
      '#141518',
      '#ffb000',
      new THREE.Vector3(10, 6, 0),
      labelScale
    );

    // 3. 高さ H (右奥 +X, -Z 側)
    const hx = max.x + offset;
    const hz = min.z - 2;
    this.addDimensionLine(
      new THREE.Vector3(hx, min.y, hz),
      new THREE.Vector3(hx, max.y, hz),
      new THREE.Vector3(max.x + 2, min.y, min.z),
      new THREE.Vector3(max.x + 2, max.y, min.z),
      `H ${h.toFixed(1)} mm`,
      outerColor,
      '#141518',
      '#ffb000',
      new THREE.Vector3(14, 0, 0),
      labelScale
    );

    // 4. セル内寸オーバーレイ（上面にシアンで表示）
    if (metrics.innerBox && metrics.innerBox.width > 4 && metrics.innerBox.depth > 4) {
      const ib = metrics.innerBox;
      const cx = ib.centerX ?? 0;
      const cz = ib.centerZ ?? 0;
      const iy = ib.yTop + 6;

      // 横方向内寸線
      const x0 = cx - ib.width / 2;
      const x1 = cx + ib.width / 2;
      this.addDimensionLine(
        new THREE.Vector3(x0, iy, cz),
        new THREE.Vector3(x1, iy, cz),
        new THREE.Vector3(x0, ib.yTop, cz),
        new THREE.Vector3(x1, ib.yTop, cz),
        `内寸 ${ib.label}`,
        innerColor,
        '#0c1a20',
        '#00e5ff',
        new THREE.Vector3(0, 8, 0),
        labelScale * 0.92
      );
    }
  }

  private addDimensionLine(
    pStart: THREE.Vector3,
    pEnd: THREE.Vector3,
    anchorStart: THREE.Vector3,
    anchorEnd: THREE.Vector3,
    label: string,
    lineColor: number,
    bgCss: string,
    fgCss: string,
    labelOffset: THREE.Vector3,
    labelScale: number
  ) {
    const lineMat = new THREE.LineBasicMaterial({ color: lineColor });

    // 主寸法線
    const mainGeom = new THREE.BufferGeometry().setFromPoints([pStart, pEnd]);
    this.group.add(new THREE.Line(mainGeom, lineMat));

    // 引き出し線（補助線）
    const extMat = new THREE.LineBasicMaterial({
      color: lineColor,
      transparent: true,
      opacity: 0.55,
    });
    const ext1 = new THREE.BufferGeometry().setFromPoints([anchorStart, pStart]);
    const ext2 = new THREE.BufferGeometry().setFromPoints([anchorEnd, pEnd]);
    this.group.add(new THREE.Line(ext1, extMat), new THREE.Line(ext2, extMat));

    // 両端矢印コーン
    const dir = new THREE.Vector3().subVectors(pEnd, pStart);
    const len = dir.length();
    if (len > 6) {
      dir.normalize();
      const arrowMat = new THREE.MeshBasicMaterial({ color: lineColor });
      const coneGeom = new THREE.ConeGeometry(1.5, 4.2, 8);

      const arrowEnd = new THREE.Mesh(coneGeom, arrowMat);
      arrowEnd.position.copy(pEnd).addScaledVector(dir, -2.1);
      arrowEnd.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

      const arrowStart = new THREE.Mesh(coneGeom.clone(), arrowMat);
      arrowStart.position.copy(pStart).addScaledVector(dir, 2.1);
      arrowStart.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());

      this.group.add(arrowStart, arrowEnd);
    }

    // テキストラベルスプライト
    const mid = new THREE.Vector3().addVectors(pStart, pEnd).multiplyScalar(0.5).add(labelOffset);
    const sprite = this.createTextSprite(label, bgCss, fgCss, labelScale);
    sprite.position.copy(mid);
    this.group.add(sprite);
  }

  private createTextSprite(
    text: string,
    bgCss: string,
    fgCss: string,
    scaleFactor: number
  ): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const fontSize = 30;
    ctx.font = `bold ${fontSize}px "JetBrains Mono", "BIZ UDGothic", monospace`;
    const textWidth = ctx.measureText(text).width;

    const padX = 22;
    const w = Math.max(180, Math.ceil(textWidth + padX * 2));
    const h = 58;
    canvas.width = w;
    canvas.height = h;

    ctx.fillStyle = bgCss;
    ctx.fillRect(2, 2, w - 4, h - 4);
    ctx.strokeStyle = fgCss;
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);

    ctx.fillStyle = fgCss;
    ctx.font = `bold ${fontSize}px "JetBrains Mono", "BIZ UDGothic", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 1);

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(w * scaleFactor, h * scaleFactor, 1);
    sprite.renderOrder = 100;
    return sprite;
  }
}
