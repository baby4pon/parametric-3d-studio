import * as THREE from 'three';
import { GeneratedModel, ParamValues } from '../types';
import {
  combineGeometries,
  computeMeshVolumeMm3,
  createCircleHole,
  createRoundedRectHole,
  createRoundedRectShape,
  estimatePrintStats,
  extrudePlan,
  makeBox,
} from './geometryUtils';

function num(p: ParamValues, k: string, fallback: number): number {
  const v = Number(p[k]);
  return Number.isFinite(v) ? v : fallback;
}

function str(p: ParamValues, k: string, fallback: string): string {
  return typeof p[k] === 'string' ? (p[k] as string) : fallback;
}

function bool(p: ParamValues, k: string, fallback: boolean): boolean {
  if (typeof p[k] === 'boolean') return p[k] as boolean;
  if (p[k] === '1' || p[k] === 'true') return true;
  if (p[k] === '0' || p[k] === 'false') return false;
  return fallback;
}

/**
 * Gridfinity ベースプレート（42mmピッチのグリッド枠＋外周余白スペーサー）
 */
export function generateGridfinityBaseplate(params: ParamValues): GeneratedModel {
  const gx = Math.max(1, Math.min(6, Math.round(num(params, 'gx', 3))));
  const gy = Math.max(1, Math.min(6, Math.round(num(params, 'gy', 3))));
  const style = str(params, 'style', 'thin');
  const padX = Math.max(0, Math.min(40, num(params, 'padX', 0)));
  const padY = Math.max(0, Math.min(40, num(params, 'padY', 0)));
  const hasMagnets = bool(params, 'magnets', false);

  const pitch = 42.0;
  const gridW = gx * pitch;
  const gridD = gy * pitch;
  const totalW = gridW + padX * 2;
  const totalD = gridD + padY * 2;

  const isWeighted = style === 'weighted';
  const basePlateH = isWeighted ? 2.8 : 0;
  const frameH = 4.65;
  const totalH = basePlateH + frameH;

  const parts: THREE.BufferGeometry[] = [];
  const warnings: string[] = [];

  if (totalW > 256 || totalD > 256) {
    warnings.push('サイズが 256×256mm を超えています。一般的なビルドプレートに収まらない場合があります。');
  }

  // 1. 底板（weightedモード時）
  if (isWeighted) {
    const baseShape = createRoundedRectShape(totalW, totalD, 4.0);
    if (hasMagnets) {
      const magOff = 13.0;
      for (let ix = 0; ix < gx; ix++) {
        for (let iy = 0; iy < gy; iy++) {
          const cx = (ix - (gx - 1) / 2) * pitch;
          const cy = -(iy - (gy - 1) / 2) * pitch;
          baseShape.holes.push(createCircleHole(cx - magOff, cy - magOff, 3.25));
          baseShape.holes.push(createCircleHole(cx + magOff, cy - magOff, 3.25));
          baseShape.holes.push(createCircleHole(cx - magOff, cy + magOff, 3.25));
          baseShape.holes.push(createCircleHole(cx + magOff, cy + magOff, 3.25));
        }
      }
    }
    parts.push(extrudePlan(baseShape, basePlateH, 0));
  }

  // 2. 下段グリッド枠 (37.2mm 内抜き)
  const lowerShape = createRoundedRectShape(totalW, totalD, 4.0);
  for (let ix = 0; ix < gx; ix++) {
    for (let iy = 0; iy < gy; iy++) {
      const cx = (ix - (gx - 1) / 2) * pitch;
      const cy = -(iy - (gy - 1) / 2) * pitch;
      lowerShape.holes.push(createRoundedRectHole(37.4, 37.4, 1.8, cx, cy));
    }
  }
  parts.push(extrudePlan(lowerShape, 2.35, basePlateH));

  // 3. 上段グリッド受け枠 (41.6mm 内抜き - ビンのテーパーを受け止めるリップ)
  const upperShape = createRoundedRectShape(totalW, totalD, 4.0);
  for (let ix = 0; ix < gx; ix++) {
    for (let iy = 0; iy < gy; iy++) {
      const cx = (ix - (gx - 1) / 2) * pitch;
      const cy = -(iy - (gy - 1) / 2) * pitch;
      upperShape.holes.push(createRoundedRectHole(41.4, 41.4, 3.7, cx, cy));
    }
  }
  parts.push(extrudePlan(upperShape, 2.3, basePlateH + 2.35));

  // 4. 引き出し内寸フィット用の余白部リブ補強（padX or padY > 8 のとき）
  if (padX >= 8) {
    parts.push(makeBox(padX - 3, frameH * 0.7, totalD - 10, -gridW / 2 - padX / 2, basePlateH, 0));
    parts.push(makeBox(padX - 3, frameH * 0.7, totalD - 10, gridW / 2 + padX / 2, basePlateH, 0));
  }
  if (padY >= 8) {
    parts.push(makeBox(gridW, frameH * 0.7, padY - 3, 0, basePlateH, -gridD / 2 - padY / 2));
    parts.push(makeBox(gridW, frameH * 0.7, padY - 3, 0, basePlateH, gridD / 2 + padY / 2));
  }

  const geometry = combineGeometries(parts);
  const vol = computeMeshVolumeMm3(geometry);
  const stats = estimatePrintStats(vol);

  return {
    geometry,
    warnings,
    metrics: {
      outerW: totalW,
      outerD: totalD,
      outerH: Math.round(totalH * 10) / 10,
      innerBox: {
        label: `1マス 42.0 × 42.0 mm`,
        width: 41.4,
        depth: 41.4,
        height: frameH,
        yBottom: basePlateH,
        yTop: totalH,
        centerX: (-(gx - 1) / 2) * pitch,
        centerZ: (-(gy - 1) / 2) * pitch,
      },
      summaryLines: [
        `全体サイズ: ${totalW} × ${totalD} × ${totalH.toFixed(2)} mm`,
        `グリッド: ${gx} × ${gy} マス（42mm規格）`,
        `外周スペーサー: 左右 +${padX}mm / 前後 +${padY}mm`,
      ],
      estimatedFilamentGrams: stats.grams,
      estimatedPrintMinutes: stats.minutes,
    },
  };
}
