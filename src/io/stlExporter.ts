import * as THREE from 'three';

/**
 * Three.js BufferGeometry (Y-up) を Z-up ミリメートル座標系のバイナリ STL Blob に変換する
 */
export function exportGeometryToBinarySTL(geometry: THREE.BufferGeometry): Blob {
  const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = nonIndexed.getAttribute('position');
  const triCount = Math.floor(pos.count / 3);

  // STL Binary: 80 bytes header + 4 bytes uint32 triCount + 50 bytes per triangle
  const bufferLength = 84 + triCount * 50;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  // 80バイトヘッダ
  const headerText = 'Parametric 3D Studio - Binary STL (mm, Z-up)';
  for (let i = 0; i < 80; i++) {
    view.setUint8(i, i < headerText.length ? headerText.charCodeAt(i) : 0);
  }
  view.setUint32(80, triCount, true);

  let offset = 84;
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const cb = new THREE.Vector3();
  const ab = new THREE.Vector3();

  // Three.js Y-up (x, y, z) -> Z-up 右手系 (x, -z, y)
  const toZUp = (v: THREE.Vector3, out: THREE.Vector3) => {
    out.set(v.x, -v.z, v.y);
  };

  const pA = new THREE.Vector3();
  const pB = new THREE.Vector3();
  const pC = new THREE.Vector3();

  for (let i = 0; i < triCount; i++) {
    const idx = i * 3;
    pA.fromBufferAttribute(pos, idx);
    pB.fromBufferAttribute(pos, idx + 1);
    pC.fromBufferAttribute(pos, idx + 2);

    toZUp(pA, vA);
    toZUp(pB, vB);
    toZUp(pC, vC);

    cb.subVectors(vC, vB);
    ab.subVectors(vA, vB);
    cb.cross(ab).normalize();

    // 法線
    view.setFloat32(offset, cb.x, true);
    view.setFloat32(offset + 4, cb.y, true);
    view.setFloat32(offset + 8, cb.z, true);
    offset += 12;

    // 3頂点
    for (const v of [vA, vB, vC]) {
      view.setFloat32(offset, v.x, true);
      view.setFloat32(offset + 4, v.y, true);
      view.setFloat32(offset + 8, v.z, true);
      offset += 12;
    }

    // 属性バイトカウント
    view.setUint16(offset, 0, true);
    offset += 2;
  }

  return new Blob([arrayBuffer], { type: 'application/octet-stream' });
}

export function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
