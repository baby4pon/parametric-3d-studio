import JSZip from 'jszip';
import * as THREE from 'three';
import { ProjectMetadata, ToolId } from '../types';

export interface ThreeMFImportResult {
  kind: 'exact' | 'fallback-bbox';
  metadata?: ProjectMetadata;
  fallbackToolId?: ToolId;
  fallbackDims?: { w: number; d: number; h: number };
  sourceFileName: string;
}

/**
 * Three.js BufferGeometry + ProjectMetadata を 3MF (ZIP) Blob にパックする
 */
export async function exportTo3MF(
  geometry: THREE.BufferGeometry,
  metadata: ProjectMetadata,
  thumbnailDataUrl?: string
): Promise<Blob> {
  const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = nonIndexed.getAttribute('position');
  const triCount = Math.floor(pos.count / 3);

  // 頂点重複を統合して水密性の高いメッシュとしてXMLを生成（Y-up -> Z-up (x, -z, y)）
  const vertexMap = new Map<string, number>();
  const verticesXml: string[] = [];
  const trianglesXml: string[] = [];

  const getVertexIndex = (x: number, y: number, z: number): number => {
    // 115mm などのベッド中心に置くため、Z-up では X, Y を +110 程度ずらしてもよいが
    // 多くのスライサー(Bambu/Prusa/Cura)は原点中心でも自動センタリングする。そのまま Z>=0 で出力する
    const rx = Math.round(x * 10000) / 10000;
    const ry = Math.round(-z * 10000) / 10000;
    const rz = Math.round(y * 10000) / 10000;
    const key = `${rx}|${ry}|${rz}`;
    const existing = vertexMap.get(key);
    if (existing !== undefined) return existing;
    const idx = vertexMap.size;
    vertexMap.set(key, idx);
    verticesXml.push(`          <vertex x="${rx}" y="${ry}" z="${rz}" />`);
    return idx;
  };

  for (let i = 0; i < triCount; i++) {
    const base = i * 3;
    const v1 = getVertexIndex(pos.getX(base), pos.getY(base), pos.getZ(base));
    const v2 = getVertexIndex(pos.getX(base + 1), pos.getY(base + 1), pos.getZ(base + 1));
    const v3 = getVertexIndex(pos.getX(base + 2), pos.getY(base + 2), pos.getZ(base + 2));
    if (v1 !== v2 && v2 !== v3 && v3 !== v1) {
      trianglesXml.push(`          <triangle v1="${v1}" v2="${v2}" v3="${v3}" />`);
    }
  }

  const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="ja-JP" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <metadata name="Title">${escapeXml(metadata.toolId)}</metadata>
  <metadata name="Designer">Parametric 3D Studio</metadata>
  <metadata name="CreationDate">${escapeXml(metadata.exportedAt)}</metadata>
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>
${verticesXml.join('\n')}
        </vertices>
        <triangles>
${trianglesXml.join('\n')}
        </triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1" />
  </build>
</model>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/contenttypes">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
  <Default Extension="png" ContentType="image/png" />
  <Default Extension="json" ContentType="application/json" />
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />
  ${thumbnailDataUrl ? '<Relationship Target="/Metadata/thumbnail.png" Id="rel1" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail" />' : ''}
</Relationships>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', relsXml);
  zip.file('3D/3dmodel.model', modelXml);
  zip.file('Metadata/yoshida3d_project.json', JSON.stringify(metadata, null, 2));

  if (thumbnailDataUrl && thumbnailDataUrl.startsWith('data:image/png;base64,')) {
    const base64 = thumbnailDataUrl.replace('data:image/png;base64,', '');
    zip.file('Metadata/thumbnail.png', base64, { base64: true });
  }

  return await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

/**
 * 3MF ファイルを読み込み、埋め込まれたプロジェクト設定 JSON を復元する。
 * 外部ツールの汎用 3MF の場合は外寸バウンディングボックスを解析してフォールバック復元する。
 */
export async function importFrom3MF(file: File): Promise<ThreeMFImportResult> {
  const zip = await JSZip.loadAsync(file);

  const metaEntry =
    zip.file('Metadata/yoshida3d_project.json') ??
    zip.file(/yoshida3d_project\.json$/i)[0];

  if (metaEntry) {
    const text = await metaEntry.async('string');
    const parsed = JSON.parse(text) as ProjectMetadata;
    if (parsed && parsed.toolId && parsed.params) {
      return {
        kind: 'exact',
        metadata: parsed,
        sourceFileName: file.name,
      };
    }
  }

  // 汎用 3MF からの外寸抽出フォールバック
  const modelEntries = zip.file(/\.model$/i);
  if (modelEntries.length === 0) {
    throw new Error('有効な 3MF ファイルではありません（.model が見つかりません）。');
  }

  const xmlText = await modelEntries[0].async('string');
  const vertexRegex = /<vertex\s+[^>]*x="([^"]+)"[^>]*y="([^"]+)"[^>]*z="([^"]+)"/g;
  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;
  let minZ = Infinity,
    maxZ = -Infinity;
  let count = 0;

  let match: RegExpExecArray | null;
  while ((match = vertexRegex.exec(xmlText)) !== null) {
    const x = parseFloat(match[1]);
    const y = parseFloat(match[2]);
    const z = parseFloat(match[3]);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
      count++;
    }
  }

  if (count === 0) {
    throw new Error('3MF ファイル内に頂点データが見つかりませんでした。');
  }

  const w = Math.max(30, Math.min(300, Math.round((maxX - minX) * 10) / 10));
  const d = Math.max(30, Math.min(300, Math.round((maxY - minY) * 10) / 10));
  const h = Math.max(15, Math.min(200, Math.round((maxZ - minZ) * 10) / 10));

  return {
    kind: 'fallback-bbox',
    fallbackToolId: 'divided-box-pro',
    fallbackDims: { w, d, h },
    sourceFileName: file.name,
  };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
