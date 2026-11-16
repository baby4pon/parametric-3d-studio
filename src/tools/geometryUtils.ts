import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * 2D角丸長方形の Shape または Path を生成する（中心が cx, cy）
 */
export function createRoundedRectShape(
  w: number,
  h: number,
  r: number,
  cx = 0,
  cy = 0
): THREE.Shape {
  const shape = new THREE.Shape();
  const radius = Math.max(0, Math.min(r, w / 2 - 0.01, h / 2 - 0.01));
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  const x1 = cx + w / 2;
  const y1 = cy + h / 2;

  if (radius <= 0.01) {
    shape.moveTo(x0, y0);
    shape.lineTo(x1, y0);
    shape.lineTo(x1, y1);
    shape.lineTo(x0, y1);
    shape.closePath();
    return shape;
  }

  shape.moveTo(x0 + radius, y0);
  shape.lineTo(x1 - radius, y0);
  shape.quadraticCurveTo(x1, y0, x1, y0 + radius);
  shape.lineTo(x1, y1 - radius);
  shape.quadraticCurveTo(x1, y1, x1 - radius, y1);
  shape.lineTo(x0 + radius, y1);
  shape.quadraticCurveTo(x0, y1, x0, y1 - radius);
  shape.lineTo(x0, y0 + radius);
  shape.quadraticCurveTo(x0, y0, x0 + radius, y0);
  shape.closePath();
  return shape;
}

/**
 * 穴抜き用の角丸長方形 Path（時計回りにして外周と逆向きにする）
 */
export function createRoundedRectHole(
  w: number,
  h: number,
  r: number,
  cx = 0,
  cy = 0
): THREE.Path {
  const path = new THREE.Path();
  const radius = Math.max(0, Math.min(r, w / 2 - 0.01, h / 2 - 0.01));
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  const x1 = cx + w / 2;
  const y1 = cy + h / 2;

  if (radius <= 0.01) {
    path.moveTo(x0, y0);
    path.lineTo(x0, y1);
    path.lineTo(x1, y1);
    path.lineTo(x1, y0);
    path.closePath();
    return path;
  }

  // 時計回り (CW)
  path.moveTo(x0 + radius, y0);
  path.quadraticCurveTo(x0, y0, x0, y0 + radius);
  path.lineTo(x0, y1 - radius);
  path.quadraticCurveTo(x0, y1, x0 + radius, y1);
  path.lineTo(x1 - radius, y1);
  path.quadraticCurveTo(x1, y1, x1, y1 - radius);
  path.lineTo(x1, y0 + radius);
  path.quadraticCurveTo(x1, y0, x1 - radius, y0);
  path.closePath();
  return path;
}

/**
 * 穴抜き用の円形 Path（時計回り）
 */
export function createCircleHole(cx: number, cy: number, radius: number): THREE.Path {
  const path = new THREE.Path();
  path.absarc(cx, cy, Math.max(0.1, radius), 0, Math.PI * 2, true);
  return path;
}

/**
 * 穴抜き用の正六角形 Path（時計回り）
 */
export function createHexHole(cx: number, cy: number, flatToFlat: number): THREE.Path {
  const path = new THREE.Path();
  const r = flatToFlat / Math.sqrt(3);
  for (let i = 0; i < 6; i++) {
    // 時計回り (-i)
    const angle = (-i * Math.PI) / 3 + Math.PI / 6;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();
  return path;
}

/**
 * XZ水平面の2D形状を +Y方向へ押し出し、yBottom に配置する。
 * 注意: Shapeの (sx, sy) は 3D空間の (x = sx, z = -sy) に対応する。
 */
export function extrudePlan(
  shape: THREE.Shape,
  height: number,
  yBottom = 0,
  curveSegments = 16
): THREE.BufferGeometry {
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.05, height),
    bevelEnabled: false,
    steps: 1,
    curveSegments,
  });
  geom.rotateX(-Math.PI / 2);
  if (yBottom !== 0) {
    geom.translate(0, yBottom, 0);
  }
  return normalizeGeometry(geom);
}

/**
 * 側面プロファイル（XY断面）を X軸方向（幅方向）に押し出して、X=0中心に配置する。
 * フックや斜めスタンドなどの断面押し出し用。
 */
export function extrudeSideProfileX(
  shape: THREE.Shape,
  width: number,
  centerX = 0,
  curveSegments = 16
): THREE.BufferGeometry {
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.1, width),
    bevelEnabled: false,
    steps: 1,
    curveSegments,
  });
  // ExtrudeGeometryは +Z に押し出す。これを X軸に沿って幅方向へ回転させる
  // rotateY(PI/2): (x, y, z) -> (z, y, -x)
  geom.rotateY(Math.PI / 2);
  geom.translate(centerX - width / 2, 0, 0);
  return normalizeGeometry(geom);
}

/**
 * 2枚の異なるサイズの角丸長方形を上下で繋ぐテーパー（台形角柱）を生成する
 * 3Dプリンタの45度オーバーハング対応やGridfinityの段差ベース用
 */
export function createRoundedFrustum(
  wBottom: number,
  dBottom: number,
  rBottom: number,
  wTop: number,
  dTop: number,
  rTop: number,
  height: number,
  yBottom = 0,
  cx = 0,
  cz = 0,
  segmentsPerCorner = 6
): THREE.BufferGeometry {
  const sampleOutline = (w: number, d: number, r: number): [number, number][] => {
    const pts: [number, number][] = [];
    const rad = Math.max(0, Math.min(r, w / 2 - 0.01, d / 2 - 0.01));
    const hw = w / 2 - rad;
    const hd = d / 2 - rad;
    const corners: [number, number, number, number][] = [
      [hw, -hd, -Math.PI / 2, 0],
      [hw, hd, 0, Math.PI / 2],
      [-hw, hd, Math.PI / 2, Math.PI],
      [-hw, -hd, Math.PI, Math.PI * 1.5],
    ];
    for (const [ccx, ccz, a0, a1] of corners) {
      if (rad <= 0.01) {
        pts.push([ccx, ccz]);
      } else {
        for (let i = 0; i <= segmentsPerCorner; i++) {
          const a = a0 + ((a1 - a0) * i) / segmentsPerCorner;
          pts.push([ccx + Math.cos(a) * rad, ccz + Math.sin(a) * rad]);
        }
      }
    }
    return pts;
  };

  const botPts = sampleOutline(wBottom, dBottom, rBottom);
  const topPts = sampleOutline(wTop, dTop, rTop);
  const n = botPts.length;
  const y0 = yBottom;
  const y1 = yBottom + height;

  const positions: number[] = [];

  const pushTri = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx3: number,
    cy3: number,
    cz3: number
  ) => {
    positions.push(ax, ay, az, bx, by, bz, cx3, cy3, cz3);
  };

  // 側面クワッド（外向き法線 CCW）
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [bx0, bz0] = botPts[i];
    const [bx1, bz1] = botPts[j];
    const [tx0, tz0] = topPts[i];
    const [tx1, tz1] = topPts[j];

    // botPts は XZ平面で時計回り風(a0増加すると +x -> +z)
    // 外向き法線を保証するため外積チェックを行うのではなく順序を固定
    // x = cos, z = sin: i=0 (hw, -hd) -> (hw, +hd) は +Z 方向。上(y1)と組むと外向き(+X)法線は (bot_i, top_i, top_j) か (bot_i, top_j, bot_j)
    // ベクトルチェック: A=bot_i=(1,0,0), B=bot_j=(1,0,1), C=top_i=(1,1,0)
    // (C - A) x (B - A) = (0,1,0) x (0,0,1) = (+1, 0, 0) -> 外向き(+X)!
    // よって (bot_i, top_i, bot_j) と (bot_j, top_i, top_j) が外向き！
    pushTri(cx + bx0, y0, cz + bz0, cx + tx0, y1, cz + tz0, cx + bx1, y0, cz + bz1);
    pushTri(cx + bx1, y0, cz + bz1, cx + tx0, y1, cz + tz0, cx + tx1, y1, cz + tz1);
  }

  // 底面キャップ (法線 -Y)
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [bx0, bz0] = botPts[i];
    const [bx1, bz1] = botPts[j];
    // (center, bot_i, bot_j) -> (0,0,0), (1,0,0), (1,0,1) => (1,0,0)x(1,0,1) = (0, -1, 0) -> -Y!
    pushTri(cx, y0, cz, cx + bx0, y0, cz + bz0, cx + bx1, y0, cz + bz1);
  }

  // 上面キャップ (法線 +Y)
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [tx0, tz0] = topPts[i];
    const [tx1, tz1] = topPts[j];
    pushTri(cx, y1, cz, cx + tx1, y1, cz + tz1, cx + tx0, y1, cz + tz0);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  return geom;
}

/**
 * 中心(cx, cz)、底面yBottomに配置された直方体を生成する
 */
export function makeBox(
  w: number,
  h: number,
  d: number,
  cx = 0,
  yBottom = 0,
  cz = 0
): THREE.BufferGeometry {
  const geom = new THREE.BoxGeometry(Math.max(0.05, w), Math.max(0.05, h), Math.max(0.05, d));
  geom.translate(cx, yBottom + h / 2, cz);
  return normalizeGeometry(geom);
}

/**
 * 垂直円柱を生成する（底面 yBottom, 中心 cx, cz）
 */
export function makeCylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  cx = 0,
  yBottom = 0,
  cz = 0,
  radialSegments = 24
): THREE.BufferGeometry {
  const geom = new THREE.CylinderGeometry(
    Math.max(0.05, radiusTop),
    Math.max(0.05, radiusBottom),
    Math.max(0.05, height),
    radialSegments
  );
  geom.translate(cx, yBottom + height / 2, cz);
  return normalizeGeometry(geom);
}

/**
 * ジオメトリの属性を揃えて非インデックス化・法線計算を行い、安全にマージできる形に正規化する
 */
export function normalizeGeometry(geom: THREE.BufferGeometry): THREE.BufferGeometry {
  const nonIndexed = geom.index ? geom.toNonIndexed() : geom.clone();
  if (nonIndexed.hasAttribute('uv')) {
    nonIndexed.deleteAttribute('uv');
  }
  if (nonIndexed.hasAttribute('color')) {
    nonIndexed.deleteAttribute('color');
  }
  nonIndexed.computeVertexNormals();
  return nonIndexed;
}

/**
 * 複数の BufferGeometry を1つの BufferGeometry に結合し、メモリ解放を行う
 */
export function combineGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const validParts = parts.filter(
    (g) => g && g.getAttribute('position') && g.getAttribute('position').count > 0
  );
  if (validParts.length === 0) {
    return makeBox(10, 10, 10, 0, 0, 0);
  }
  const normalized = validParts.map((g) => normalizeGeometry(g));
  const merged = mergeGeometries(normalized, false);
  for (const g of validParts) g.dispose();
  for (const g of normalized) g.dispose();
  if (!merged) {
    return makeBox(10, 10, 10, 0, 0, 0);
  }
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * バウンディングボックスではなく実際の三角錐体積合計からメッシュの体積(mm³)を計算する
 */
export function computeMeshVolumeMm3(geom: THREE.BufferGeometry): number {
  const pos = geom.getAttribute('position');
  if (!pos) return 0;
  let volume = 0;
  const pA = new THREE.Vector3();
  const pB = new THREE.Vector3();
  const pC = new THREE.Vector3();
  const cross = new THREE.Vector3();

  for (let i = 0; i < pos.count; i += 3) {
    pA.fromBufferAttribute(pos, i);
    pB.fromBufferAttribute(pos, i + 1);
    pC.fromBufferAttribute(pos, i + 2);
    cross.crossVectors(pB, pC);
    volume += pA.dot(cross) / 6.0;
  }
  return Math.abs(volume);
}

/**
 * 体積(mm³)から概算フィラメント消費量(g)と印刷時間(分)を算出（PLA密度 1.24g/cm³, 20%インフィル想定近似）
 */
export function estimatePrintStats(volumeMm3: number): { grams: number; minutes: number } {
  const cm3 = volumeMm3 / 1000;
  // ソリッド壁が多いため 0.85 係数で近似
  const grams = Math.max(1, Math.round(cm3 * 1.24 * 0.88 * 10) / 10);
  // 0.4mmノズル標準速度(約 11g/h 〜 0.18g/min) + 準備3分
  const minutes = Math.max(5, Math.round(grams * 4.8 + 3));
  return { grams, minutes };
}
