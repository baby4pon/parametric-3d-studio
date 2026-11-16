import * as THREE from 'three';
import { GeneratedModel, ParamValues } from '../types';
import {
  combineGeometries,
  computeMeshVolumeMm3,
  createCircleHole,
  createHexHole,
  createRoundedRectHole,
  createRoundedRectShape,
  estimatePrintStats,
  extrudePlan,
  makeCylinder,
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
 * openGrid 壁面収納ボードを生成する
 */
export function generateOpenGridBoard(params: ParamValues): GeneratedModel {
  const cols = Math.max(2, Math.min(10, Math.round(num(params, 'cols', 5))));
  const rows = Math.max(2, Math.min(10, Math.round(num(params, 'rows', 4))));
  const pitch = Math.max(20, Math.min(35, num(params, 'pitch', 28)));
  const thickness = Math.max(3, Math.min(10, num(params, 'thickness', 5)));
  const holeType = str(params, 'holeType', 'square');
  const screwHoles = bool(params, 'screwHoles', true);
  const standoff = Math.max(0, Math.min(12, num(params, 'standoff', 4)));

  const margin = 8;
  const outerW = cols * pitch + margin;
  const outerD = rows * pitch + margin;
  const totalH = thickness + standoff;

  const parts: THREE.BufferGeometry[] = [];
  const warnings: string[] = [];

  if (outerW > 256 || outerD > 256) {
    warnings.push('ボード外寸が 256mm を超えています。分割印刷またはセル数調整を検討してください。');
  }

  // ボード本体 (standoffの上に配置、または0..thicknessに配置して上に脚を生やす)
  // 印刷向け＆見た目良好にするため、底面 y = 0..thickness にボードを置き、
  // 四隅の裏面スペーサー脚は y = thickness .. thickness + standoff に生やす（印刷時にサポートレス！）
  const boardShape = createRoundedRectShape(outerW, outerD, 4.0);

  const holeSize = pitch * 0.68;
  const isCorner = (c: number, r: number) =>
    (c === 0 || c === cols - 1) && (r === 0 || r === rows - 1);

  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const cx = (c - (cols - 1) / 2) * pitch;
      const cy = -(r - (rows - 1) / 2) * pitch;

      if (screwHoles && isCorner(c, r)) {
        // ビス止め穴 (φ4.6mm) のために大きなグリッド穴の代わりに小径ビス穴を開ける
        boardShape.holes.push(createCircleHole(cx, cy, 2.3));
        continue;
      }

      if (holeType === 'round') {
        boardShape.holes.push(createCircleHole(cx, cy, holeSize * 0.45));
      } else if (holeType === 'hex') {
        boardShape.holes.push(createHexHole(cx, cy, holeSize * 0.92));
      } else {
        // openGrid 角丸角穴
        boardShape.holes.push(createRoundedRectHole(holeSize, holeSize, 2.5, cx, cy));
      }
    }
  }

  parts.push(extrudePlan(boardShape, thickness, 0));

  // 裏面スペーサー脚（壁との隙間確保用）
  if (standoff > 0) {
    const cornerCoords: [number, number][] = [
      [(-(cols - 1)) / 2 * pitch, (-(rows - 1)) / 2 * pitch],
      [((cols - 1) / 2) * pitch, (-(rows - 1)) / 2 * pitch],
      [(-(cols - 1)) / 2 * pitch, ((rows - 1) / 2) * pitch],
      [((cols - 1) / 2) * pitch, ((rows - 1) / 2) * pitch],
    ];
    for (const [cx, cz] of cornerCoords) {
      if (screwHoles) {
        // 中空リングスペーサー
        const ringShape = createRoundedRectShape(12, 12, 6, cx, -cz);
        ringShape.holes.push(createCircleHole(cx, -cz, 2.3));
        parts.push(extrudePlan(ringShape, standoff, thickness));
      } else {
        parts.push(makeCylinder(5.5, 6.0, standoff, cx, thickness, cz));
      }
    }
    // 大きなボードなら中央にもサポート脚を追加
    if (cols >= 4 && rows >= 4) {
      parts.push(makeCylinder(5.0, 5.5, standoff, 0, thickness, 0));
    }
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
      outerH: totalH,
      innerBox: {
        label: `穴開口 ${holeSize.toFixed(1)} mm (${pitch}mmピッチ)`,
        width: holeSize,
        depth: holeSize,
        height: thickness,
        yBottom: 0,
        yTop: thickness,
        centerX: (-(cols - 1) / 2 + 1) * pitch,
        centerZ: (-(rows - 1) / 2) * pitch,
      },
      summaryLines: [
        `ボード寸法: ${outerW} × ${outerD} × 板厚 ${thickness} mm`,
        `グリッド: ${cols} × ${rows} セル（ピッチ ${pitch}mm）`,
        `穴形状: ${holeType === 'square' ? 'openGrid角穴' : holeType === 'round' ? 'ペグ丸穴' : '六角ハニカム'} / 裏脚 ${standoff}mm`,
      ],
      estimatedFilamentGrams: stats.grams,
      estimatedPrintMinutes: stats.minutes,
    },
  };
}
