import * as THREE from 'three';
import { GeneratedModel, ParamValues } from '../types';
import {
  combineGeometries,
  computeMeshVolumeMm3,
  createCircleHole,
  createRoundedFrustum,
  createRoundedRectHole,
  createRoundedRectShape,
  estimatePrintStats,
  extrudePlan,
  extrudeSideProfileX,
  makeBox,
} from './geometryUtils';

function num(p: ParamValues, k: string, fallback: number): number {
  const v = Number(p[k]);
  return Number.isFinite(v) ? v : fallback;
}

function bool(p: ParamValues, k: string, fallback: boolean): boolean {
  if (typeof p[k] === 'boolean') return p[k] as boolean;
  if (p[k] === '1' || p[k] === 'true') return true;
  if (p[k] === '0' || p[k] === 'false') return false;
  return fallback;
}

/**
 * Gridfinity 規格準拠の収納ビンを生成する (42mmピッチ, 1U高さ=7mm)
 */
export function generateGridfinityBin(params: ParamValues): GeneratedModel {
  const gx = Math.max(1, Math.min(6, Math.round(num(params, 'gx', 2))));
  const gy = Math.max(1, Math.min(6, Math.round(num(params, 'gy', 1))));
  const gu = Math.max(2, Math.min(12, Math.round(num(params, 'gu', 6))));
  const cols = Math.max(1, Math.min(6, Math.round(num(params, 'cols', 2))));
  const rows = Math.max(1, Math.min(4, Math.round(num(params, 'rows', 1))));
  const wall = Math.max(1.0, Math.min(3.2, num(params, 'wall', 1.6)));
  const hasLip = bool(params, 'lip', true);
  const hasLabel = bool(params, 'label', true);
  const hasScoop = bool(params, 'scoop', true);
  const hasMagnets = bool(params, 'magnets', false);

  const pitch = 42.0;
  const clearance = 0.5;
  const outerW = gx * pitch - clearance;
  const outerD = gy * pitch - clearance;
  const bodyHeight = gu * 7.0;
  const lipHeight = hasLip ? 4.4 : 0;
  const totalH = bodyHeight + lipHeight;
  const baseFootH = 4.75;
  const floorTopY = 7.0;

  const parts: THREE.BufferGeometry[] = [];
  const warnings: string[] = [];

  // 1. 各42x42ブロック毎のGridfinity底面テーパー足 (0 .. 4.75mm)
  for (let ix = 0; ix < gx; ix++) {
    for (let iy = 0; iy < gy; iy++) {
      const cx = (ix - (gx - 1) / 2) * pitch;
      const cz = (iy - (gy - 1) / 2) * pitch;

      // 最下段のマグネット穴付きベース (0 .. 2.6mm 垂直・底部テーパー)
      const magHoleOffset = 13.0;
      const footBaseH = 0.8;
      // 0..0.8mm テーパー (35.6 -> 37.1)
      parts.push(createRoundedFrustum(35.6, 35.6, 0.8, 37.2, 37.2, 1.6, footBaseH, 0, cx, cz));

      // 0.8..2.6mm 垂直部 (37.2mm) - マグネット穴表現
      if (hasMagnets) {
        const plateShape = createRoundedRectShape(37.2, 37.2, 1.6, cx, -cz);
        const rMag = 3.25; // φ6.5mm
        plateShape.holes.push(createCircleHole(cx - magHoleOffset, -cz - magHoleOffset, rMag));
        plateShape.holes.push(createCircleHole(cx + magHoleOffset, -cz - magHoleOffset, rMag));
        plateShape.holes.push(createCircleHole(cx - magHoleOffset, -cz + magHoleOffset, rMag));
        plateShape.holes.push(createCircleHole(cx + magHoleOffset, -cz + magHoleOffset, rMag));
        parts.push(extrudePlan(plateShape, 1.8, 0.8));
      } else {
        parts.push(createRoundedFrustum(37.2, 37.2, 1.6, 37.2, 37.2, 1.6, 1.8, 0.8, cx, cz));
      }

      // 2.6..4.75mm 45度拡幅テーパー (37.2 -> 41.5)
      parts.push(createRoundedFrustum(37.2, 37.2, 1.6, 41.5, 41.5, 3.75, 2.15, 2.6, cx, cz));
    }
  }

  // 2. フット連結＆床プレート (4.75 .. 7.0mm)
  const floorShape = createRoundedRectShape(outerW, outerD, 3.75);
  parts.push(extrudePlan(floorShape, floorTopY - baseFootH, baseFootH));

  // 3. 外壁リング (7.0 .. bodyHeight)
  const innerW = outerW - wall * 2;
  const innerD = outerD - wall * 2;
  const wallRing = createRoundedRectShape(outerW, outerD, 3.75);
  wallRing.holes.push(createRoundedRectHole(innerW, innerD, Math.max(0.5, 3.75 - wall)));
  parts.push(extrudePlan(wallRing, bodyHeight - floorTopY, floorTopY));

  // 4. スタッキングリップ (bodyHeight .. bodyHeight + 4.4mm)
  if (hasLip) {
    const lipThickness = 2.6;
    const lipRing = createRoundedRectShape(outerW, outerD, 3.75);
    lipRing.holes.push(
      createRoundedRectHole(
        outerW - lipThickness * 2,
        outerD - lipThickness * 2,
        Math.max(0.5, 3.75 - lipThickness)
      )
    );
    parts.push(extrudePlan(lipRing, 2.5, bodyHeight));

    const topBevelRing = createRoundedRectShape(outerW - 1.2, outerD - 1.2, 3.1);
    topBevelRing.holes.push(
      createRoundedRectHole(
        outerW - lipThickness * 2,
        outerD - lipThickness * 2,
        Math.max(0.5, 3.75 - lipThickness)
      )
    );
    parts.push(extrudePlan(topBevelRing, 1.9, bodyHeight + 2.5));
  }

  // 5. 内部仕切り壁
  const divWall = 1.2;
  const cellW = (innerW - divWall * (cols - 1)) / cols;
  const cellD = (innerD - divWall * (rows - 1)) / rows;
  const divH = bodyHeight - floorTopY - 0.5;

  if (cellW < 8 || cellD < 8) {
    warnings.push('内部セルが非常に狭くなっています（8mm未満）。');
  }

  for (let c = 1; c < cols; c++) {
    const x = -innerW / 2 + c * cellW + (c - 0.5) * divWall;
    parts.push(makeBox(divWall, divH, innerD, x, floorTopY, 0));
  }
  for (let r = 1; r < rows; r++) {
    const z = -innerD / 2 + r * cellD + (r - 0.5) * divWall;
    parts.push(makeBox(innerW, divH, divWall, 0, floorTopY, z));
  }

  // 6. ラベル棚 (奥側 -Z 内壁から手前にせり出す棚)
  if (hasLabel && bodyHeight >= 21) {
    const shelfDepth = Math.min(11.5, cellD * 0.38);
    const shelfY = bodyHeight - 1.2;
    const zStart = -innerD / 2;
    // 側面プロファイル (XYで Yが上、XがZに対応: extrudeSideProfileXは rotateY(PI/2) で (x,y,z)->(z,y,-x) つまり断面Xは-Z側になる)
    // 断面座標 u = -z で定義すると分かりやすい。奥壁 -Z = innerD/2 (u = +innerD/2) から内側 (u減少) に棚を伸ばす
    const uWall = innerD / 2;
    const labelShape = new THREE.Shape();
    labelShape.moveTo(uWall, shelfY);
    labelShape.lineTo(uWall - shelfDepth, shelfY);
    labelShape.lineTo(uWall, shelfY - shelfDepth);
    labelShape.closePath();
    parts.push(extrudeSideProfileX(labelShape, innerW, 0));

    // 上面リップが少しある棚
    parts.push(makeBox(innerW, 1.2, shelfDepth, 0, shelfY, zStart + shelfDepth / 2));
  }

  // 7. 指入れスクープ（手前底面 +Z 側の緩やかなスロープ）
  if (hasScoop && cellD >= 18) {
    const scoopR = Math.min(12, cellD * 0.35, (bodyHeight - floorTopY) * 0.55);
    const uFront = -innerD / 2; // 手前(+Z)は u = -innerD/2
    for (let r = 0; r < rows; r++) {
      const zCellFront = -innerD / 2 + (r + 1) * cellD + r * divWall;
      const uCellFront = -zCellFront;
      const scoopShape = new THREE.Shape();
      scoopShape.moveTo(uCellFront, floorTopY);
      scoopShape.lineTo(uCellFront + scoopR, floorTopY);
      // 凹弧を描く
      scoopShape.quadraticCurveTo(uCellFront, floorTopY, uCellFront, floorTopY + scoopR);
      scoopShape.closePath();
      parts.push(extrudeSideProfileX(scoopShape, innerW, 0));
    }
    void uFront;
  }

  const geometry = combineGeometries(parts);
  const vol = computeMeshVolumeMm3(geometry);
  const stats = estimatePrintStats(vol);

  return {
    geometry,
    warnings,
    metrics: {
      outerW,
      outerD,
      outerH: Math.round(totalH * 10) / 10,
      innerBox: {
        label: `${cellW.toFixed(1)} × ${cellD.toFixed(1)} mm`,
        width: cellW,
        depth: cellD,
        height: bodyHeight - floorTopY,
        yBottom: floorTopY,
        yTop: bodyHeight,
        centerX: -innerW / 2 + cellW / 2,
        centerZ: -innerD / 2 + cellD / 2,
      },
      summaryLines: [
        `規格サイズ: ${gx}×${gy} (${gu}U) = ${outerW} × ${outerD} × ${totalH.toFixed(1)} mm`,
        `1マス内寸: ${cellW.toFixed(1)} × ${cellD.toFixed(1)} × 深さ ${(bodyHeight - floorTopY).toFixed(1)} mm`,
        `オプション: ${[hasLip ? 'リップ' : '', hasLabel ? 'ラベル棚' : '', hasScoop ? 'スクープ' : '', hasMagnets ? '磁石穴' : ''].filter(Boolean).join(' / ') || '標準'}`,
      ],
      estimatedFilamentGrams: stats.grams,
      estimatedPrintMinutes: stats.minutes,
    },
  };
}
