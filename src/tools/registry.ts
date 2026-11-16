import { ParamValues, ToolDefinition, ToolId } from '../types';
import { generateDividedBoxPro } from './dividedBoxPro';
import { generateGridfinityBin } from './gridfinityBin';
import { generateGridfinityBaseplate } from './gridfinityBase';
import { generateOpenGridBoard } from './opengridBoard';
import { generateWallHookHolder } from './wallHookHolder';
import { generateDeskOrganizerTray } from './deskOrganizerTray';

export const TOOLS: ToolDefinition[] = [
  {
    id: 'divided-box-pro',
    name: '仕切り付きボックス Pro',
    subtitle: 'DIVIDED BOX PRO / 自由結合・蓋・模様付き',
    category: 'storage',
    categoryLabel: '汎用収納ツール',
    badge: 'POPULAR',
    description:
      '幅・奥行・高さを入力するだけで、仕切り付き整理ボックスを生成。2D仕切りエディタでセルを結合して大部屋にしたり、スタッキング段差や外壁テクスチャ・専用蓋の追加にも対応。',
    supportsCellMerge: true,
    svgIcon: `<svg viewBox="0 0 120 90" fill="none" stroke="currentColor" stroke-width="2">
      <polygon points="15,32 60,14 105,32 60,50" fill="rgba(255,176,0,0.18)"/>
      <polygon points="15,32 60,50 60,80 15,62" fill="rgba(255,176,0,0.08)"/>
      <polygon points="105,32 60,50 60,80 105,62" fill="rgba(255,176,0,0.12)"/>
      <line x1="37" y1="23" x2="82" y2="41"/>
      <line x1="82" y1="23" x2="37" y2="41"/>
    </svg>`,
    params: [
      { key: 'w', label: '外寸 幅 (W)', shortLabel: '幅 W', group: 'basic', type: 'number', unit: 'mm', min: 30, max: 300, step: 5, defaultValue: 140 },
      { key: 'd', label: '外寸 奥行 (D)', shortLabel: '奥行 D', group: 'basic', type: 'number', unit: 'mm', min: 30, max: 300, step: 5, defaultValue: 95 },
      { key: 'h', label: '外寸 高さ (H)', shortLabel: '高さ H', group: 'basic', type: 'number', unit: 'mm', min: 15, max: 200, step: 5, defaultValue: 45 },
      { key: 'cols', label: '横の列数', shortLabel: '列', group: 'basic', type: 'number', unit: '列', min: 1, max: 10, step: 1, defaultValue: 3 },
      { key: 'rows', label: '縦の行数', shortLabel: '行', group: 'basic', type: 'number', unit: '行', min: 1, max: 10, step: 1, defaultValue: 2 },
      { key: 'wall', label: '外壁の厚み', group: 'advanced', type: 'number', unit: 'mm', min: 1.2, max: 6, step: 0.2, defaultValue: 2.0 },
      { key: 'bottom', label: '底板の厚み', group: 'advanced', type: 'number', unit: 'mm', min: 1.2, max: 6, step: 0.2, defaultValue: 2.0 },
      { key: 'divWall', label: '仕切り壁の厚み', group: 'advanced', type: 'number', unit: 'mm', min: 0.8, max: 4, step: 0.2, defaultValue: 1.4 },
      { key: 'radius', label: '角丸半径', group: 'advanced', type: 'number', unit: 'mm', min: 0, max: 20, step: 0.5, defaultValue: 4.0 },
      {
        key: 'stack',
        label: '積み重ね構造',
        group: 'advanced',
        type: 'select',
        options: [
          { value: 'none', label: '通常（フラット）' },
          { value: 'lip', label: 'スタッキング段差あり' },
        ],
        defaultValue: 'none',
      },
      {
        key: 'pattern',
        label: '外壁テクスチャ模様',
        group: 'advanced',
        type: 'select',
        options: [
          { value: 'flat', label: 'フラット（無地）' },
          { value: 'rib', label: '横リブ溝' },
          { value: 'knurl', label: '縦ローレット' },
          { value: 'hex', label: 'ブロックレリーフ' },
        ],
        defaultValue: 'flat',
      },
      {
        key: 'lid',
        label: '専用蓋の出力',
        group: 'advanced',
        type: 'select',
        options: [
          { value: 'none', label: '本体のみ' },
          { value: 'both', label: '本体＋蓋セット' },
          { value: 'lid', label: '蓋のみ' },
        ],
        defaultValue: 'none',
      },
    ],
    printProfile: {
      supports: '不要（サポート材なし）',
      nozzle: '0.4 mm',
      layerHeight: '0.20 mm',
      infill: '15% (グリッド / ジャイロイド)',
      materials: [
        { name: 'PLA', rating: '◎', note: '反りにくく寸法精度が最も安定' },
        { name: 'PETG', rating: '〇', note: '割れにくく実用向け' },
        { name: 'ABS', rating: '△', note: '大型サイズでは反り対策推奨' },
        { name: 'TPU', rating: '✕', note: '仕切りが柔らかくなりすぎる' },
      ],
    },
    generate: generateDividedBoxPro,
  },
  {
    id: 'gridfinity-bin',
    name: 'Gridfinity 収納ビン',
    subtitle: 'GRIDFINITY STORAGE BIN (42mm規格)',
    category: 'gridfinity',
    categoryLabel: '引き出し収納 (Gridfinity)',
    badge: '42mm規格',
    description:
      'Zack Freedman氏提唱の世界標準モジュール収納「Gridfinity」互換ビン。42mmグリッドと7mm高さユニットで精密設計され、ラベル棚・指入れスクープ・磁石穴もワンクリックで切替可能。',
    svgIcon: `<svg viewBox="0 0 120 90" fill="none" stroke="currentColor" stroke-width="2">
      <polygon points="20,30 60,14 100,30 60,46" fill="rgba(255,176,0,0.2)"/>
      <polygon points="20,30 60,46 60,68 20,52"/>
      <polygon points="100,30 60,46 60,68 100,52"/>
      <polygon points="26,56 56,68 56,76 26,64" fill="rgba(255,176,0,0.12)"/>
      <polygon points="64,68 94,56 94,64 64,76" fill="rgba(255,176,0,0.12)"/>
    </svg>`,
    params: [
      { key: 'gx', label: '横グリッド数 (1U=42mm)', shortLabel: '横グリッド', group: 'basic', type: 'number', unit: 'U', min: 1, max: 6, step: 1, defaultValue: 2 },
      { key: 'gy', label: '縦グリッド数 (1U=42mm)', shortLabel: '縦グリッド', group: 'basic', type: 'number', unit: 'U', min: 1, max: 6, step: 1, defaultValue: 1 },
      { key: 'gu', label: '高さユニット (1U=7mm)', shortLabel: '高さ U', group: 'basic', type: 'number', unit: 'U', min: 2, max: 12, step: 1, defaultValue: 6 },
      { key: 'cols', label: '内部横仕切り数', shortLabel: '列', group: 'basic', type: 'number', unit: '列', min: 1, max: 6, step: 1, defaultValue: 2 },
      { key: 'rows', label: '内部縦仕切り数', shortLabel: '行', group: 'basic', type: 'number', unit: '行', min: 1, max: 4, step: 1, defaultValue: 1 },
      { key: 'wall', label: '外壁厚', group: 'advanced', type: 'number', unit: 'mm', min: 1.2, max: 3.2, step: 0.2, defaultValue: 1.6 },
      { key: 'lip', label: '上積みスタッキングリップ', group: 'advanced', type: 'boolean', defaultValue: true },
      { key: 'label', label: '手書き/テプラ用ラベル棚', group: 'advanced', type: 'boolean', defaultValue: true },
      { key: 'scoop', label: '底面指入れスクープ', group: 'advanced', type: 'boolean', defaultValue: true },
      { key: 'magnets', label: '底面φ6.5mmマグネット穴', group: 'advanced', type: 'boolean', defaultValue: false },
    ],
    printProfile: {
      supports: '不要（45度セルフサポート設計）',
      nozzle: '0.4 mm',
      layerHeight: '0.20 mm',
      infill: '15%',
      materials: [
        { name: 'PLA', rating: '◎', note: 'ベースとの嵌合精度が抜群' },
        { name: 'PETG', rating: '〇', note: '工具入れ等に最適' },
        { name: 'ABS', rating: '△', note: '収縮でベース嵌合がきつくなる場合あり' },
        { name: 'TPU', rating: '✕', note: '不向き' },
      ],
    },
    generate: generateGridfinityBin,
  },
  {
    id: 'gridfinity-baseplate',
    name: 'Gridfinity ベースプレート',
    subtitle: 'GRIDFINITY BASEPLATE / 余白スペーサー対応',
    category: 'gridfinity',
    categoryLabel: '引き出し収納 (Gridfinity)',
    badge: '引き出しフィット',
    description:
      'Gridfinityビンを綺麗に整列・固定するための土台グリッド。引き出し内寸に合わせて左右・前後の外周余白（スペーサー）をミリ単位で追加でき、ズレを防止します。',
    svgIcon: `<svg viewBox="0 0 120 90" fill="none" stroke="currentColor" stroke-width="2">
      <polygon points="16,45 60,24 104,45 60,66" fill="rgba(255,176,0,0.16)"/>
      <line x1="38" y1="34" x2="82" y2="55"/>
      <line x1="82" y1="34" x2="38" y2="55"/>
      <polygon points="16,45 60,66 60,74 16,53"/>
      <polygon points="104,45 60,66 60,74 104,53"/>
    </svg>`,
    params: [
      { key: 'gx', label: '横グリッド数', shortLabel: '横マス', group: 'basic', type: 'number', unit: 'マス', min: 1, max: 6, step: 1, defaultValue: 3 },
      { key: 'gy', label: '縦グリッド数', shortLabel: '縦マス', group: 'basic', type: 'number', unit: 'マス', min: 1, max: 6, step: 1, defaultValue: 3 },
      {
        key: 'style',
        label: 'プレート形式',
        shortLabel: '形式',
        group: 'basic',
        type: 'select',
        options: [
          { value: 'thin', label: '軽量フレーム型（高速印刷）' },
          { value: 'weighted', label: '底板付き高剛性型' },
        ],
        defaultValue: 'thin',
      },
      { key: 'padX', label: '左右余白スペーサー', shortLabel: '左右余白', group: 'advanced', type: 'number', unit: 'mm', min: 0, max: 40, step: 1, defaultValue: 0 },
      { key: 'padY', label: '前後余白スペーサー', shortLabel: '前後余白', group: 'advanced', type: 'number', unit: 'mm', min: 0, max: 40, step: 1, defaultValue: 0 },
      { key: 'magnets', label: '底板φ6.5mmマグネット穴（底板付時）', group: 'advanced', type: 'boolean', defaultValue: false },
    ],
    printProfile: {
      supports: '不要',
      nozzle: '0.4 mm / 0.6 mm',
      layerHeight: '0.20 mm',
      infill: '15%〜20%',
      materials: [
        { name: 'PLA', rating: '◎', note: '反りにくく引き出し敷き詰めに最適' },
        { name: 'PETG', rating: '〇', note: '割れに強い' },
        { name: 'ABS', rating: '△', note: '大型グリッドは反り注意' },
        { name: 'TPU', rating: '✕', note: '不向き' },
      ],
    },
    generate: generateGridfinityBaseplate,
  },
  {
    id: 'opengrid-board',
    name: 'openGrid 壁面収納ボード',
    subtitle: 'OPENGRID MODULAR WALL BOARD',
    category: 'wall',
    categoryLabel: '壁面収納 (openGrid)',
    badge: '壁面カスタム',
    description:
      '壁面やデスクサイドに工具・小物を掛けるためのモジュラー有孔ボード。openGrid角穴・ペグボード丸穴・ハニカム六角穴の切替や、裏面スペーサー脚・ビス穴を自由に設定できます。',
    svgIcon: `<svg viewBox="0 0 120 90" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="24" y="14" width="72" height="62" fill="rgba(255,176,0,0.12)"/>
      <rect x="34" y="24" width="12" height="12"/>
      <rect x="54" y="24" width="12" height="12"/>
      <rect x="74" y="24" width="12" height="12"/>
      <rect x="34" y="42" width="12" height="12"/>
      <rect x="54" y="42" width="12" height="12"/>
      <rect x="74" y="42" width="12" height="12"/>
    </svg>`,
    params: [
      { key: 'cols', label: '横セル数', shortLabel: '横セル', group: 'basic', type: 'number', unit: '列', min: 2, max: 10, step: 1, defaultValue: 5 },
      { key: 'rows', label: '縦セル数', shortLabel: '縦セル', group: 'basic', type: 'number', unit: '行', min: 2, max: 10, step: 1, defaultValue: 4 },
      {
        key: 'pitch',
        label: '穴ピッチ間隔',
        shortLabel: 'ピッチ',
        group: 'basic',
        type: 'select',
        options: [
          { value: '28', label: '28 mm (openGrid標準)' },
          { value: '25', label: '25 mm (汎用ペグボード)' },
          { value: '30', label: '30 mm (ワイド)' },
        ],
        defaultValue: '28',
      },
      {
        key: 'holeType',
        label: '穴形状',
        shortLabel: '穴形状',
        group: 'basic',
        type: 'select',
        options: [
          { value: 'square', label: 'openGrid 角穴' },
          { value: 'round', label: 'ペグボード 丸穴' },
          { value: 'hex', label: 'ハニカム 六角穴' },
        ],
        defaultValue: 'square',
      },
      { key: 'thickness', label: 'ボード板厚', group: 'advanced', type: 'number', unit: 'mm', min: 3, max: 10, step: 0.5, defaultValue: 5 },
      { key: 'standoff', label: '裏面スペーサー脚', group: 'advanced', type: 'number', unit: 'mm', min: 0, max: 12, step: 1, defaultValue: 4 },
      { key: 'screwHoles', label: '四隅ビス固定穴', group: 'advanced', type: 'boolean', defaultValue: true },
    ],
    printProfile: {
      supports: '不要（裏面脚を上向きにして印刷）',
      nozzle: '0.4 mm',
      layerHeight: '0.20 mm',
      infill: '25% (耐荷重重視)',
      materials: [
        { name: 'PLA', rating: '〇', note: '軽量小物向け。高温場所注意' },
        { name: 'PETG', rating: '◎', note: 'クリープ変形しにくく壁掛け最適' },
        { name: 'ABS', rating: '〇', note: '高強度だが反り注意' },
        { name: 'TPU', rating: '✕', note: '剛性不足' },
      ],
    },
    generate: generateOpenGridBoard,
  },
  {
    id: 'wall-hook-holder',
    name: '多目的フック・クランプ',
    subtitle: 'PARAMETRIC HOOK & DESK CLAMP',
    category: 'wall',
    categoryLabel: '汎用ツール',
    badge: '高強度',
    description:
      'ヘッドホン・ケーブル・工具を掛けるJ字/L字フックをミリ単位で設計。壁ネジ止め、両面テープ用フラット背板、または机の天板に差し込むデスククランプ型を切り替え可能。',
    svgIcon: `<svg viewBox="0 0 120 90" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M40 16 L40 68 L84 68 L84 48 L74 48 L74 58 L50 58 L50 16 Z" fill="rgba(255,176,0,0.2)"/>
      <circle cx="45" cy="24" r="2.5"/>
    </svg>`,
    params: [
      { key: 'width', label: 'フック幅 (W)', shortLabel: '幅', group: 'basic', type: 'number', unit: 'mm', min: 12, max: 80, step: 2, defaultValue: 24 },
      { key: 'hookDepth', label: '掛け部 懐奥行', shortLabel: '懐奥行', group: 'basic', type: 'number', unit: 'mm', min: 15, max: 120, step: 5, defaultValue: 40 },
      { key: 'backHeight', label: '背板高さ', shortLabel: '背板高', group: 'basic', type: 'number', unit: 'mm', min: 25, max: 120, step: 5, defaultValue: 50 },
      { key: 'tipHeight', label: '先端返し高さ', shortLabel: '先端高', group: 'basic', type: 'number', unit: 'mm', min: 8, max: 60, step: 2, defaultValue: 18 },
      {
        key: 'mountType',
        label: '固定方式',
        shortLabel: '固定方式',
        group: 'basic',
        type: 'select',
        options: [
          { value: 'screw', label: 'M4 ビス穴フランジ' },
          { value: 'tape', label: 'フラット両面テープ用' },
          { value: 'clamp', label: 'デスク天板クランプ' },
        ],
        defaultValue: 'screw',
      },
      { key: 'thickness', label: '全体厚み', group: 'advanced', type: 'number', unit: 'mm', min: 3, max: 10, step: 0.5, defaultValue: 5 },
      { key: 'angle', label: '先端開き角度', group: 'advanced', type: 'number', unit: '度', min: 75, max: 115, step: 5, defaultValue: 90 },
      { key: 'clampGap', label: 'クランプ天板厚（クランプ時）', group: 'advanced', type: 'number', unit: 'mm', min: 10, max: 50, step: 1, defaultValue: 25 },
    ],
    printProfile: {
      supports: '横向きに90度倒せばサポート不要',
      nozzle: '0.4 mm',
      layerHeight: '0.20 mm',
      infill: '30%〜40%（外周壁4層推奨）',
      materials: [
        { name: 'PLA', rating: '〇', note: '横向き印刷で高い曲げ強度' },
        { name: 'PETG', rating: '◎', note: '耐衝撃性・粘りがあり割れにくい' },
        { name: 'ABS', rating: '◎', note: '重量物・耐熱用途に最適' },
        { name: 'TPU', rating: '✕', note: '荷重で曲がる' },
      ],
    },
    generate: generateWallHookHolder,
  },
  {
    id: 'desk-organizer-tray',
    name: 'ガジェットスタンド＆トレイ',
    subtitle: 'CABLE & GADGET DESK ORGANIZER',
    category: 'desk',
    categoryLabel: 'デスク整理',
    badge: '実用人気',
    description:
      'スマートフォン・タブレットを斜めに立て掛けるマルチスロットと、USBメモリや小物を置ける手前トレイを一体化。背面には充電ケーブルを通せる中央スリットを備えています。',
    svgIcon: `<svg viewBox="0 0 120 90" fill="none" stroke="currentColor" stroke-width="2">
      <polygon points="18,62 96,62 104,74 12,74" fill="rgba(255,176,0,0.16)"/>
      <polygon points="34,62 46,24 54,24 44,62" fill="rgba(255,176,0,0.22)"/>
      <polygon points="62,62 74,20 82,20 72,62" fill="rgba(255,176,0,0.22)"/>
    </svg>`,
    params: [
      { key: 'w', label: '全体幅 (W)', shortLabel: '幅 W', group: 'basic', type: 'number', unit: 'mm', min: 80, max: 240, step: 5, defaultValue: 150 },
      { key: 'd', label: '全体奥行 (D)', shortLabel: '奥行 D', group: 'basic', type: 'number', unit: 'mm', min: 60, max: 180, step: 5, defaultValue: 110 },
      { key: 'slots', label: '立てかけスロット数', shortLabel: 'スロット', group: 'basic', type: 'number', unit: '列', min: 1, max: 4, step: 1, defaultValue: 2 },
      { key: 'slotGap', label: 'スロット溝幅（端末厚）', shortLabel: '溝幅', group: 'basic', type: 'number', unit: 'mm', min: 8, max: 24, step: 1, defaultValue: 13 },
      { key: 'trayH', label: '手前トレイ壁高さ', group: 'advanced', type: 'number', unit: 'mm', min: 12, max: 40, step: 2, defaultValue: 18 },
      { key: 'backH', label: '背面サポート高さ', group: 'advanced', type: 'number', unit: 'mm', min: 25, max: 90, step: 5, defaultValue: 48 },
      { key: 'tilt', label: '立てかけ傾斜角', group: 'advanced', type: 'number', unit: '度', min: 5, max: 25, step: 1, defaultValue: 12 },
      { key: 'cableSlit', label: '中央充電ケーブルスリット', group: 'advanced', type: 'boolean', defaultValue: true },
    ],
    printProfile: {
      supports: '不要（そのまま底面を下にして印刷）',
      nozzle: '0.4 mm',
      layerHeight: '0.20 mm',
      infill: '15%〜20%',
      materials: [
        { name: 'PLA', rating: '◎', note: 'デスクトップ用途に最適・美麗な仕上がり' },
        { name: 'PETG', rating: '〇', note: '光沢感があり頑丈' },
        { name: 'ABS', rating: '△', note: '大型幅では反り注意' },
        { name: 'TPU', rating: '✕', note: 'スロットが自立しない' },
      ],
    },
    generate: generateDeskOrganizerTray,
  },
];

export function getToolById(id: string | null | undefined): ToolDefinition {
  return TOOLS.find((t) => t.id === (id as ToolId)) ?? TOOLS[0];
}

export function getDefaultParams(tool: ToolDefinition): ParamValues {
  const result: ParamValues = {};
  for (const p of tool.params) {
    result[p.key] = p.defaultValue;
  }
  return result;
}
