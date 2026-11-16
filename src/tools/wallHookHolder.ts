import * as THREE from 'three';
import { GeneratedModel, ParamValues } from '../types';
import {
  combineGeometries,
  computeMeshVolumeMm3,
  createCircleHole,
  createRoundedRectShape,
  estimatePrintStats,
  extrudeSideProfileX,
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
 * 多目的フック・ツールホルダーを生成する（J/L字 + ネジ穴/両面テープ/デスククランプ）
 */
export function generateWallHookHolder(params: ParamValues): GeneratedModel {
  const width = Math.max(12, Math.min(80, num(params, 'width', 24)));
  const hookDepth = Math.max(15, Math.min(120, num(params, 'hookDepth', 40)));
  const backHeight = Math.max(25, Math.min(120, num(params, 'backHeight', 50)));
  const tipHeight = Math.max(8, Math.min(60, num(params, 'tipHeight', 18)));
  const thickness = Math.max(3, Math.min(10, num(params, 'thickness', 5)));
  const angleDeg = Math.max(75, Math.min(115, num(params, 'angle', 90)));
  const mountType = str(params, 'mountType', 'screw');
  const clampGap = Math.max(10, Math.min(50, num(params, 'clampGap', 25)));

  const parts: THREE.BufferGeometry[] = [];
  const warnings: string[] = [];

  // 側面断面を XY 平面で描き、X方向 (width) に押し出す。
  // extrudeSideProfileX では rotateY(PI/2) を使うため:
  // (x, y, z) -> (z, y, -x) になる。
  // つまり Shapeの X 座標が 3D の -Z 座標になる。
  // 見た目上、背板が奥 (-Z)、フックが手前 (+Z) に伸びるようにするため、
  // Backplate を ShapeX = +backX とし、Hook を ShapeX が減少する方向（負方向）へ伸ばす！
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  const tipOffsetZ = Math.sin(rad) * tipHeight;

  // 背板背面を基準 u=0 とし、手前フック方向が -u、後ろ(クランプ側)が +u
  const t = thickness;
  const effBackH =
    mountType === 'clamp' ? Math.max(backHeight, clampGap + t * 2 + 12) : backHeight;
  const shape = new THREE.Shape();

  // 背板外周からスタート（自己交差なしの単一閉ループ）
  if (mountType === 'clamp') {
    const clampDepth = Math.max(22, clampGap + 6);
    const jawBottomY = effBackH - t * 2 - clampGap;
    shape.moveTo(0, 0);
    shape.lineTo(0, jawBottomY);
    shape.lineTo(clampDepth, jawBottomY);
    shape.lineTo(clampDepth, jawBottomY + t);
    shape.lineTo(0, jawBottomY + t);
    shape.lineTo(0, effBackH - t);
    shape.lineTo(clampDepth, effBackH - t);
    shape.lineTo(clampDepth, effBackH);
    shape.lineTo(-t, effBackH);
    shape.lineTo(-t, t);
  } else {
    shape.moveTo(0, 0);
    shape.lineTo(0, effBackH);
    shape.lineTo(-t, effBackH);
    shape.lineTo(-t, t);
  }

  // 下部アーム（背板から手前へ hookDepth 伸びる）
  // 手前方向は u が負になる方向
  const uArmEnd = -(t + hookDepth);
  const uTipTop = uArmEnd - tipOffsetZ;

  // 内側ライン -> 先端上 -> 先端外側 -> 底面
  shape.lineTo(uArmEnd, t);
  shape.lineTo(uTipTop, t + tipHeight);
  shape.lineTo(uTipTop - t, t + tipHeight);
  shape.lineTo(uArmEnd - t, 0);
  shape.closePath();

  const body = extrudeSideProfileX(shape, width, 0);
  parts.push(body);

  // コーナー補強リブ（ガセット）をフック付け根に追加
  const gussetSize = Math.min(10, hookDepth * 0.35, backHeight * 0.3);
  const gShape = new THREE.Shape();
  gShape.moveTo(-t, t);
  gShape.lineTo(-t - gussetSize, t);
  gShape.lineTo(-t, t + gussetSize);
  gShape.closePath();
  parts.push(extrudeSideProfileX(gShape, Math.min(width, 6), 0));

  // ネジ穴マウント時は、穴の開いたプレートを背板に置換またはビス穴付きバックプレートを重ねる
  if (mountType === 'screw') {
    // 背板に2つのM4ネジ穴をあけたプレートを生成し、背板部分と統合
    // すでに背板は 0..-t (z = 0..+t) にあるので、上部に拡張フランジとして穴付き背板を追加するか、
    // 一度背板上部 (y = backHeight..backHeight+16) に穴あきフランジを付けると非常にクリーン！
    const flangeH = 18;
    const flangeShape = createRoundedRectShape(width, flangeH, 3);
    flangeShape.holes.push(createCircleHole(0, 0, 2.3)); // M4穴
    const flangeGeom = new THREE.ExtrudeGeometry(flangeShape, {
      depth: t,
      bevelEnabled: false,
    });
    // flangeShape は XY なのでそのまま +Z に押し出されている (z: 0..t -> Shapeのu=0..-tに対応)
    // ただし u=0..-t は 3Dで z = 0..+t なのでそのまま一致！
    flangeGeom.translate(0, backHeight + flangeH / 2 - 2, 0);
    parts.push(flangeGeom);

    // 下側にも簡易な座ぐりリブ表現またはフランジ上部だけでしっかり保持
    const lowerTab = makeBox(width, 3, t, 0, backHeight - 2, t / 2);
    parts.push(lowerTab);
  }

  const combined = combineGeometries(parts);
  combined.computeBoundingBox();
  const bb = combined.boundingBox!;
  // X, Z を中心化、底面を Y=0 に揃える
  const cx = (bb.min.x + bb.max.x) / 2;
  const cz = (bb.min.z + bb.max.z) / 2;
  combined.translate(-cx, -bb.min.y, -cz);
  combined.computeBoundingBox();
  const bb2 = combined.boundingBox!;

  const outerW = Math.round((bb2.max.x - bb2.min.x) * 10) / 10;
  const outerD = Math.round((bb2.max.z - bb2.min.z) * 10) / 10;
  const outerH = Math.round((bb2.max.y - bb2.min.y) * 10) / 10;

  const vol = computeMeshVolumeMm3(combined);
  const stats = estimatePrintStats(vol);

  return {
    geometry: combined,
    warnings,
    metrics: {
      outerW,
      outerD,
      outerH,
      innerBox: {
        label: `懐奥行 ${hookDepth} mm`,
        width: width,
        depth: hookDepth,
        height: tipHeight,
        yBottom: thickness,
        yTop: thickness + tipHeight,
        centerX: 0,
        centerZ: outerD / 2 - thickness - hookDepth / 2,
      },
      summaryLines: [
        `外形寸法: 幅 ${outerW} × 奥行 ${outerD} × 高さ ${outerH} mm`,
        `フック内幅(懐): ${hookDepth}mm / 先端返し ${tipHeight}mm`,
        `固定方式: ${mountType === 'screw' ? 'M4ビス穴フランジ' : mountType === 'clamp' ? `デスククランプ (${clampGap}mm厚)` : 'フラット両面テープ'}`,
      ],
      estimatedFilamentGrams: stats.grams,
      estimatedPrintMinutes: stats.minutes,
    },
  };
}
