import * as THREE from 'three';
import { GeneratedModel, ParamValues } from '../types';
import {
  combineGeometries,
  computeMeshVolumeMm3,
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
 * ケーブル＆ガジェットスタンド（傾斜スロット＋手前小物トレイ＋充電ケーブルスリット）
 */
export function generateDeskOrganizerTray(params: ParamValues): GeneratedModel {
  const w = Math.max(80, Math.min(240, num(params, 'w', 150)));
  const d = Math.max(60, Math.min(180, num(params, 'd', 110)));
  const trayH = Math.max(12, Math.min(40, num(params, 'trayH', 18)));
  const slots = Math.max(1, Math.min(4, Math.round(num(params, 'slots', 2))));
  const slotGap = Math.max(8, Math.min(24, num(params, 'slotGap', 13)));
  const backH = Math.max(25, Math.min(90, num(params, 'backH', 48)));
  const tiltDeg = Math.max(5, Math.min(25, num(params, 'tilt', 12)));
  const cableSlit = bool(params, 'cableSlit', true);

  const wall = 2.4;
  const bottom = 2.4;
  const parts: THREE.BufferGeometry[] = [];
  const warnings: string[] = [];

  // 1. ベース底板
  const baseShape = createRoundedRectShape(w, d, 5.0);
  parts.push(extrudePlan(baseShape, bottom, 0));

  // 2. スロット領域の計算（奥側 -Z に配置）
  const slotWallThick = 4.0;
  const slotsTotalDepth = slots * slotGap + (slots + 1) * slotWallThick;
  const trayDepth = d - slotsTotalDepth;

  if (trayDepth < 16) {
    warnings.push('スロット数・溝幅に対して全体奥行(D)が狭く、手前トレイが小さくなっています。');
  }

  // 3. 手前側小物トレイの周壁 (+Z 側)
  const frontTrayD = Math.max(18, trayDepth + wall);
  const trayCenterZ = d / 2 - frontTrayD / 2;
  const trayOuter = createRoundedRectShape(w, frontTrayD, 5.0, 0, -trayCenterZ);
  trayOuter.holes.push(
    createRoundedRectHole(w - wall * 2, frontTrayD - wall * 2, 3.0, 0, -trayCenterZ)
  );
  parts.push(extrudePlan(trayOuter, trayH - bottom, bottom));

  // 4. スロット仕切り壁（傾斜付き壁を押し出し）
  // スロット仕切りのZ開始位置は手前トレイの奥壁から奥(-Z)へ向かう
  const slotZoneStartZ = d / 2 - frontTrayD; // ここが最も手前のスロット境界
  const tiltOffset = Math.tan((tiltDeg * Math.PI) / 180) * (backH - bottom);

  for (let s = 0; s <= slots; s++) {
    // 最も奥の壁を高く(backH)、手前側は少し段階的に低めにする
    const wallH = s === slots ? backH : Math.max(trayH + 6, backH * (0.55 + (0.45 * s) / slots));
    const wallZ = slotZoneStartZ - s * (slotGap + slotWallThick) - slotWallThick / 2;
    const uBase = -wallZ; // Shapeの u = -z

    const wallShape = new THREE.Shape();
    wallShape.moveTo(uBase - slotWallThick / 2, bottom);
    wallShape.lineTo(uBase + slotWallThick / 2, bottom);
    wallShape.lineTo(uBase + slotWallThick / 2 + tiltOffset * (wallH / backH), wallH);
    wallShape.lineTo(uBase - slotWallThick / 2 + tiltOffset * (wallH / backH), wallH);
    wallShape.closePath();

    if (cableSlit && w >= 60) {
      // 中央に幅16mmのケーブル通しスリットを残すため左右2分割で押し出す
      const slitW = 16;
      const segW = (w - slitW) / 2 - 2;
      if (segW > 8) {
        parts.push(extrudeSideProfileX(wallShape, segW, -(slitW / 2 + segW / 2)));
        parts.push(extrudeSideProfileX(wallShape, segW, slitW / 2 + segW / 2));
      } else {
        parts.push(extrudeSideProfileX(wallShape, w - 4, 0));
      }
    } else {
      parts.push(extrudeSideProfileX(wallShape, w - 4, 0));
    }
  }

  // スロット両サイドの抑えフレーム（左右側面壁を奥まで伸ばす）
  const sideWallD = Math.min(d, slotsTotalDepth + 6);
  const sideWallZ = -d / 2 + sideWallD / 2;
  parts.push(makeBox(wall, trayH + 4, sideWallD, -w / 2 + wall / 2, bottom, sideWallZ));
  parts.push(makeBox(wall, trayH + 4, sideWallD, w / 2 - wall / 2, bottom, sideWallZ));

  const geometry = combineGeometries(parts);
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox!;
  const outerW = Math.round((bb.max.x - bb.min.x) * 10) / 10;
  const outerD = Math.round((bb.max.z - bb.min.z) * 10) / 10;
  const outerH = Math.round((bb.max.y - bb.min.y) * 10) / 10;

  const vol = computeMeshVolumeMm3(geometry);
  const stats = estimatePrintStats(vol);

  return {
    geometry,
    warnings,
    metrics: {
      outerW,
      outerD,
      outerH,
      innerBox: {
        label: `手前トレイ ${Math.round(w - wall * 2)} × ${Math.max(10, Math.round(frontTrayD - wall * 2))} mm`,
        width: w - wall * 2,
        depth: Math.max(10, frontTrayD - wall * 2),
        height: trayH - bottom,
        yBottom: bottom,
        yTop: trayH,
        centerX: 0,
        centerZ: trayCenterZ,
      },
      summaryLines: [
        `全体サイズ: ${outerW} × ${outerD} × ${outerH} mm`,
        `ガジェットスロット: ${slots}列（溝幅 ${slotGap}mm / 傾斜 ${tiltDeg}°）`,
        `充電ケーブルスリット: ${cableSlit ? 'あり（中央16mm溝）' : 'なし'}`,
      ],
      estimatedFilamentGrams: stats.grams,
      estimatedPrintMinutes: stats.minutes,
    },
  };
}
