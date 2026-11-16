import * as THREE from 'three';
import { GeneratedModel, ParamValues } from '../types';
import {
  combineGeometries,
  computeMeshVolumeMm3,
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

/**
 * 仕切り付きボックス Pro の3Dジオメトリを生成する
 */
export function generateDividedBoxPro(
  params: ParamValues,
  mergedWalls: Set<string>
): GeneratedModel {
  const w = Math.max(30, Math.min(300, num(params, 'w', 140)));
  const d = Math.max(30, Math.min(300, num(params, 'd', 95)));
  const h = Math.max(15, Math.min(200, num(params, 'h', 45)));
  const cols = Math.max(1, Math.min(10, Math.round(num(params, 'cols', 3))));
  const rows = Math.max(1, Math.min(10, Math.round(num(params, 'rows', 2))));
  const wall = Math.max(1.0, Math.min(8, num(params, 'wall', 2.0)));
  const bottom = Math.max(1.0, Math.min(8, num(params, 'bottom', 2.0)));
  const divWall = Math.max(0.8, Math.min(5, num(params, 'divWall', 1.4)));
  const maxR = Math.min(w, d) / 2 - wall - 1;
  const radius = Math.max(0, Math.min(maxR, num(params, 'radius', 4.0)));
  const stack = str(params, 'stack', 'none');
  const pattern = str(params, 'pattern', 'flat');
  const lidMode = str(params, 'lid', 'none');

  const warnings: string[] = [];
  const innerW = w - wall * 2;
  const innerD = d - wall * 2;
  const innerH = h - bottom;

  const cellW = (innerW - divWall * (cols - 1)) / cols;
  const cellD = (innerD - divWall * (rows - 1)) / rows;

  if (cellW < 6 || cellD < 6) {
    warnings.push('仕切り数が多いため、1マスの内寸が 6mm 未満になっています。');
  }
  if (innerH < 5) {
    warnings.push('底板厚に対して高さが低く、収納深さが不足しています。');
  }

  const parts: THREE.BufferGeometry[] = [];

  const createBoxBody = (offsetX: number) => {
    const bodyParts: THREE.BufferGeometry[] = [];
    const lipHeight = stack === 'lip' ? 3.0 : 0;
    const baseHeight = stack === 'lip' ? 1.8 : 0;

    // 1. 底板（スタッキング対応時は底に段差を設ける）
    if (stack === 'lip') {
      const footShape = createRoundedRectShape(
        Math.max(10, w - wall * 1.4),
        Math.max(10, d - wall * 1.4),
        Math.max(0, radius - wall * 0.7)
      );
      bodyParts.push(extrudePlan(footShape, baseHeight, 0));
      const mainBottomShape = createRoundedRectShape(w, d, radius);
      bodyParts.push(extrudePlan(mainBottomShape, bottom, baseHeight));
    } else {
      const bottomShape = createRoundedRectShape(w, d, radius);
      bodyParts.push(extrudePlan(bottomShape, bottom, 0));
    }

    const wallStartY = stack === 'lip' ? baseHeight + bottom : bottom;
    const wallTopY = h;
    const wallHeight = Math.max(4, wallTopY - wallStartY);

    // 2. 外壁リング
    const outerShape = createRoundedRectShape(w, d, radius);
    const innerR = Math.max(0, radius - wall);
    outerShape.holes.push(createRoundedRectHole(innerW, innerD, innerR));
    bodyParts.push(extrudePlan(outerShape, wallHeight, wallStartY));

    // 3. スタッキングリップ（上部段差）
    if (stack === 'lip') {
      const lipWall = Math.max(0.8, wall * 0.55);
      const lipOuterW = w - wall * 0.6;
      const lipOuterD = d - wall * 0.6;
      const lipShape = createRoundedRectShape(
        lipOuterW,
        lipOuterD,
        Math.max(0, radius - wall * 0.3)
      );
      lipShape.holes.push(
        createRoundedRectHole(
          lipOuterW - lipWall * 2,
          lipOuterD - lipWall * 2,
          Math.max(0, radius - wall * 0.3 - lipWall)
        )
      );
      bodyParts.push(extrudePlan(lipShape, lipHeight, wallTopY));
    }

    // 4. 内部仕切り（2Dセル結合状態 mergedWalls を反映）
    const divTopY = wallTopY - (stack === 'lip' ? 1.5 : 0);
    const divH = Math.max(2, divTopY - wallStartY);

    const startX = -innerW / 2;
    const startZ = -innerD / 2;

    // 縦の仕切り壁 (c = 0 .. cols - 2, r = 0 .. rows - 1)
    for (let c = 0; c < cols - 1; c++) {
      const xCenter = startX + (c + 1) * cellW + (c + 0.5) * divWall;
      for (let r = 0; r < rows; r++) {
        const key = `v:${c}:${r}`;
        if (mergedWalls.has(key)) continue;
        const zCenter = startZ + r * (cellD + divWall) + cellD / 2;
        bodyParts.push(makeBox(divWall, divH, cellD + 0.02, xCenter, wallStartY, zCenter));
      }
    }

    // 横の仕切り壁 (c = 0 .. cols - 1, r = 0 .. rows - 2)
    for (let r = 0; r < rows - 1; r++) {
      const zCenter = startZ + (r + 1) * cellD + (r + 0.5) * divWall;
      for (let c = 0; c < cols; c++) {
        const key = `h:${c}:${r}`;
        if (mergedWalls.has(key)) continue;
        const xCenter = startX + c * (cellW + divWall) + cellW / 2;
        bodyParts.push(makeBox(cellW + 0.02, divH, divWall, xCenter, wallStartY, zCenter));
      }
    }

    // 交点柱（隣接4つの仕切りのうち1つでも有効なら交点を埋める）
    for (let c = 0; c < cols - 1; c++) {
      for (let r = 0; r < rows - 1; r++) {
        const hasTop = !mergedWalls.has(`v:${c}:${r}`);
        const hasBottom = !mergedWalls.has(`v:${c}:${r + 1}`);
        const hasLeft = !mergedWalls.has(`h:${c}:${r}`);
        const hasRight = !mergedWalls.has(`h:${c + 1}:${r}`);
        if (hasTop || hasBottom || hasLeft || hasRight) {
          const xCenter = startX + (c + 1) * cellW + (c + 0.5) * divWall;
          const zCenter = startZ + (r + 1) * cellD + (r + 0.5) * divWall;
          bodyParts.push(makeBox(divWall, divH, divWall, xCenter, wallStartY, zCenter));
        }
      }
    }

    // 5. 外壁テクスチャパターン
    const patY0 = wallStartY + 2.5;
    const patY1 = wallTopY - 2.5;
    const patSpanW = Math.max(0, w - radius * 2 - 4);
    const patSpanD = Math.max(0, d - radius * 2 - 4);

    if (pattern !== 'flat' && patY1 - patY0 >= 4) {
      if (pattern === 'rib') {
        const stepY = 5.0;
        for (let y = patY0 + 1; y <= patY1 - 1; y += stepY) {
          if (patSpanW > 6) {
            bodyParts.push(makeBox(patSpanW, 1.4, 0.7, 0, y, d / 2 + 0.25));
            bodyParts.push(makeBox(patSpanW, 1.4, 0.7, 0, y, -d / 2 - 0.25));
          }
          if (patSpanD > 6) {
            bodyParts.push(makeBox(0.7, 1.4, patSpanD, w / 2 + 0.25, y, 0));
            bodyParts.push(makeBox(0.7, 1.4, patSpanD, -w / 2 - 0.25, y, 0));
          }
        }
      } else if (pattern === 'knurl') {
        const ribH = patY1 - patY0;
        const stepX = 5.5;
        for (let x = -patSpanW / 2 + 2; x <= patSpanW / 2 - 2; x += stepX) {
          bodyParts.push(makeBox(1.5, ribH, 0.7, x, patY0, d / 2 + 0.25));
          bodyParts.push(makeBox(1.5, ribH, 0.7, x, patY0, -d / 2 - 0.25));
        }
        for (let z = -patSpanD / 2 + 2; z <= patSpanD / 2 - 2; z += stepX) {
          bodyParts.push(makeBox(0.7, ribH, 1.5, w / 2 + 0.25, patY0, z));
          bodyParts.push(makeBox(0.7, ribH, 1.5, -w / 2 - 0.25, patY0, z));
        }
      } else if (pattern === 'hex') {
        const midY = (patY0 + patY1) / 2;
        const tileSize = Math.min(6, (patY1 - patY0) * 0.45);
        const step = tileSize * 1.9;
        for (let x = -patSpanW / 2 + tileSize; x <= patSpanW / 2 - tileSize; x += step) {
          bodyParts.push(makeBox(tileSize, tileSize, 0.8, x, midY - tileSize / 2, d / 2 + 0.3));
          bodyParts.push(makeBox(tileSize, tileSize, 0.8, x, midY - tileSize / 2, -d / 2 - 0.3));
        }
        for (let z = -patSpanD / 2 + tileSize; z <= patSpanD / 2 - tileSize; z += step) {
          bodyParts.push(makeBox(0.8, tileSize, tileSize, w / 2 + 0.3, midY - tileSize / 2, z));
          bodyParts.push(makeBox(0.8, tileSize, tileSize, -w / 2 - 0.3, midY - tileSize / 2, z));
        }
      }
    }

    if (offsetX !== 0) {
      for (const bp of bodyParts) {
        bp.translate(offsetX, 0, 0);
      }
    }
    parts.push(...bodyParts);
  };

  const createLid = (offsetX: number) => {
    const clearance = 0.35;
    const lidWall = 1.8;
    const lidTopThick = 2.2;
    const lidSkirtH = Math.min(12, Math.max(6, h * 0.25));
    const lidW = w + clearance * 2 + lidWall * 2;
    const lidD = d + clearance * 2 + lidWall * 2;
    const lidR = radius > 0 ? radius + clearance + lidWall : 0;

    // 印刷向き（天板が下 y=0、スカートが上）で生成
    const topShape = createRoundedRectShape(lidW, lidD, lidR);
    const lidTopGeom = extrudePlan(topShape, lidTopThick, 0);
    lidTopGeom.translate(offsetX, 0, 0);
    parts.push(lidTopGeom);

    const skirtShape = createRoundedRectShape(lidW, lidD, lidR);
    skirtShape.holes.push(
      createRoundedRectHole(
        w + clearance * 2,
        d + clearance * 2,
        radius > 0 ? radius + clearance : 0
      )
    );
    const skirtGeom = extrudePlan(skirtShape, lidSkirtH, lidTopThick);
    skirtGeom.translate(offsetX, 0, 0);
    parts.push(skirtGeom);

    // 持ち手スリップ防止用の枠リブを内側に配置
    const grooveW = Math.max(12, lidW - lidWall * 6);
    const grooveD = Math.max(12, lidD - lidWall * 6);
    const grooveShape = createRoundedRectShape(grooveW, grooveD, Math.max(0, lidR - 3));
    grooveShape.holes.push(
      createRoundedRectHole(
        Math.max(4, grooveW - 3),
        Math.max(4, grooveD - 3),
        Math.max(0, lidR - 4.5)
      )
    );
    const grooveGeom = extrudePlan(grooveShape, 0.8, lidTopThick);
    grooveGeom.translate(offsetX, 0, 0);
    parts.push(grooveGeom);
  };

  let totalOuterW = w;
  let totalOuterH = stack === 'lip' ? h + 3.0 : h;

  if (lidMode === 'lid') {
    createLid(0);
    totalOuterW = w + 4.3;
    totalOuterH = 2.2 + Math.min(12, Math.max(6, h * 0.25));
  } else if (lidMode === 'both') {
    const gap = 14;
    const lidW = w + 4.3;
    const shift = (lidW + gap) / 2;
    createBoxBody(-shift);
    createLid(shift);
    totalOuterW = w + gap + lidW;
  } else {
    createBoxBody(0);
  }

  const geometry = combineGeometries(parts);
  const vol = computeMeshVolumeMm3(geometry);
  const stats = estimatePrintStats(vol);

  const cellCenterShiftX = lidMode === 'both' ? -(w + 4.3 + 14) / 2 : 0;
  const firstCellCx =
    cellCenterShiftX - innerW / 2 + cellW / 2;
  const firstCellCz = -innerD / 2 + cellD / 2;

  return {
    geometry,
    warnings,
    metrics: {
      outerW: Math.round(totalOuterW * 10) / 10,
      outerD: d,
      outerH: Math.round(totalOuterH * 10) / 10,
      innerBox:
        lidMode === 'lid'
          ? undefined
          : {
              label: `${Math.round(cellW * 10) / 10} × ${Math.round(cellD * 10) / 10} mm`,
              width: cellW,
              depth: cellD,
              height: innerH,
              yBottom: stack === 'lip' ? bottom + 1.8 : bottom,
              yTop: h,
              centerX: firstCellCx,
              centerZ: firstCellCz,
            },
      summaryLines: [
        `外寸: ${w} × ${d} × ${h} mm`,
        `1マス内寸: ${cellW.toFixed(1)} × ${cellD.toFixed(1)} × 深さ ${innerH.toFixed(1)} mm`,
        `仕切り: 横${cols}列 × 縦${rows}行（結合壁 ${mergedWalls.size} 箇所）`,
      ],
      estimatedFilamentGrams: stats.grams,
      estimatedPrintMinutes: stats.minutes,
    },
  };
}
