import { getDefaultParams, getToolById } from '../tools/registry';
import { ParamValues, ToolId } from '../types';

export interface ParsedAppState {
  hasToolInUrl: boolean;
  toolId: ToolId;
  params: ParamValues;
  mergedWalls: Set<string>;
}

/**
 * 現在のツールとパラメータから共有用 URL を生成する
 */
export function buildShareUrl(
  toolId: ToolId,
  params: ParamValues,
  mergedWalls: Set<string>
): string {
  const url = new URL(window.location.href);
  const q = new URLSearchParams();
  q.set('tool', toolId);

  const tool = getToolById(toolId);
  for (const p of tool.params) {
    const val = params[p.key];
    if (val === undefined) continue;
    if (typeof val === 'boolean') {
      q.set(p.key, val ? '1' : '0');
    } else {
      q.set(p.key, String(val));
    }
  }

  if (mergedWalls.size > 0) {
    q.set('merged', Array.from(mergedWalls).join(','));
  }

  url.search = q.toString();
  return url.toString();
}

/**
 * URL クエリパラメータからツール状態を読み取る
 */
export function parseUrlState(): ParsedAppState {
  const q = new URLSearchParams(window.location.search);
  const rawTool = q.get('tool');
  const hasToolInUrl = Boolean(rawTool);
  const tool = getToolById(rawTool);
  const params = getDefaultParams(tool);

  for (const p of tool.params) {
    const raw = q.get(p.key);
    if (raw === null) continue;
    if (p.type === 'number') {
      const n = Number(raw);
      if (Number.isFinite(n)) {
        const min = p.min ?? -Infinity;
        const max = p.max ?? Infinity;
        params[p.key] = Math.max(min, Math.min(max, n));
      }
    } else if (p.type === 'boolean') {
      params[p.key] = raw === '1' || raw === 'true';
    } else if (p.type === 'select') {
      if (p.options?.some((o) => o.value === raw)) {
        params[p.key] = raw;
      }
    }
  }

  const mergedWalls = new Set<string>();
  const rawMerged = q.get('merged');
  if (rawMerged) {
    for (const token of rawMerged.split(',')) {
      const trimmed = token.trim();
      if (/^[vh]:\d+:\d+$/.test(trimmed)) {
        mergedWalls.add(trimmed);
      }
    }
  }

  return {
    hasToolInUrl,
    toolId: tool.id,
    params,
    mergedWalls,
  };
}

export interface AiParseResult {
  toolId: ToolId;
  params: ParamValues;
  explanation: string;
}

/**
 * 日本語の自然言語指示を解析してツールとパラメータをローカル変換する
 * 例: 「200×100×50の箱を作って。仕切りは縦3列、横2行、側面に模様をつけて蓋付きで」
 */
export function parseNaturalLanguagePrompt(inputText: string): AiParseResult {
  const text = inputText.trim();
  const lower = text.toLowerCase();

  // 1. ツール種の判定
  let toolId: ToolId = 'divided-box-pro';
  if (/baseplate|ベースプレート|土台|引き出しベース/.test(lower)) {
    toolId = 'gridfinity-baseplate';
  } else if (/gridfinity|グリッドフィニティ|ビン|磁石穴|スクープ/.test(lower)) {
    toolId = 'gridfinity-bin';
  } else if (/opengrid|壁面|有孔ボード|ペグボード|ボード/.test(lower)) {
    toolId = 'opengrid-board';
  } else if (/フック|クランプ|引っ掛け|ホルダー/.test(lower)) {
    toolId = 'wall-hook-holder';
  } else if (/スタンド|トレイ|ケーブル|スマホ立て|タブレット/.test(lower)) {
    toolId = 'desk-organizer-tray';
  }

  const tool = getToolById(toolId);
  const params = getDefaultParams(tool);
  const notes: string[] = [`ツール「${tool.name}」を選択`];

  // 2. W×D×H などの連続寸法パターン抽出 (例: 200×100×50, 200x100x50, 200*100*50)
  const dim3 = text.match(/(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+(?:\.\d+)?)/);
  const dim2 = text.match(/(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+(?:\.\d+)?)/);

  if (toolId === 'divided-box-pro') {
    if (dim3) {
      params.w = clampParam(Number(dim3[1]), 30, 300);
      params.d = clampParam(Number(dim3[2]), 30, 300);
      params.h = clampParam(Number(dim3[3]), 15, 200);
      notes.push(`外寸 ${params.w}×${params.d}×${params.h}mm`);
    }
    const wMatch = text.match(/(?:幅|w)\s*[:：=]?\s*(\d+)/i);
    const dMatch = text.match(/(?:奥行|奥行き|d)\s*[:：=]?\s*(\d+)/i);
    const hMatch = text.match(/(?:高さ|h)\s*[:：=]?\s*(\d+)/i);
    if (wMatch) params.w = clampParam(Number(wMatch[1]), 30, 300);
    if (dMatch) params.d = clampParam(Number(dMatch[1]), 30, 300);
    if (hMatch) params.h = clampParam(Number(hMatch[1]), 15, 200);

    const colsMatch = text.match(/(?:横|列)\s*(\d+)\s*(?:列|分割|マス)?|(\d+)\s*列/);
    const rowsMatch = text.match(/(?:縦|行)\s*(\d+)\s*(?:行|段|マス)?|(\d+)\s*行/);
    if (colsMatch) {
      params.cols = clampParam(Number(colsMatch[1] ?? colsMatch[2]), 1, 10);
      notes.push(`横${params.cols}列`);
    }
    if (rowsMatch) {
      params.rows = clampParam(Number(rowsMatch[1] ?? rowsMatch[2]), 1, 10);
      notes.push(`縦${params.rows}行`);
    }
    // 「仕切り2枚」等の指定への簡易対応
    if (!colsMatch && /仕切り/.test(text)) {
      const divCount = text.match(/仕切り[^\d]*(\d+)/);
      if (divCount) {
        params.cols = clampParam(Number(divCount[1]) + 1, 1, 10);
        notes.push(`仕切り指定から横${params.cols}列に設定`);
      }
    }

    if (/ローレット/.test(text)) {
      params.pattern = 'knurl';
      notes.push('縦ローレット模様');
    } else if (/模様|リブ|テクスチャ/.test(text)) {
      params.pattern = 'rib';
      notes.push('横リブ模様');
    }

    if (/蓋のみ/.test(text)) {
      params.lid = 'lid';
      notes.push('蓋のみ出力');
    } else if (/蓋|フタ|ふた/.test(text)) {
      params.lid = 'both';
      notes.push('本体＋蓋セット');
    }

    if (/スタッキング|積み重ね/.test(text)) {
      params.stack = 'lip';
      notes.push('スタッキング段差あり');
    }
  } else if (toolId === 'gridfinity-bin' || toolId === 'gridfinity-baseplate') {
    if (dim2) {
      params.gx = clampParam(Number(dim2[1]), 1, 6);
      params.gy = clampParam(Number(dim2[2]), 1, 6);
      notes.push(`グリッド ${params.gx}×${params.gy}`);
    }
    const guMatch = text.match(/(\d+)\s*u/i);
    if (guMatch && toolId === 'gridfinity-bin') {
      params.gu = clampParam(Number(guMatch[1]), 2, 12);
      notes.push(`高さ ${params.gu}U`);
    }
    if (toolId === 'gridfinity-bin') {
      if (/磁石|マグネット/.test(text)) params.magnets = true;
      if (/ラベルなし/.test(text)) params.label = false;
      if (/スクープなし/.test(text)) params.scoop = false;
    } else {
      if (/底板|マグネット/.test(text)) params.style = 'weighted';
      const padMatch = text.match(/余白[^\d]*(\d+)/);
      if (padMatch) params.padX = clampParam(Number(padMatch[1]), 0, 40);
    }
  } else if (toolId === 'opengrid-board') {
    if (dim2) {
      params.cols = clampParam(Number(dim2[1]), 2, 10);
      params.rows = clampParam(Number(dim2[2]), 2, 10);
      notes.push(`セル ${params.cols}×${params.rows}`);
    }
    if (/六角|ハニカム/.test(text)) params.holeType = 'hex';
    else if (/丸穴|ペグ/.test(text)) params.holeType = 'round';
  } else if (toolId === 'wall-hook-holder') {
    if (/クランプ|天板/.test(text)) params.mountType = 'clamp';
    else if (/テープ|両面/.test(text)) params.mountType = 'tape';
    const wMatch = text.match(/幅\s*(\d+)/);
    const dMatch = text.match(/(?:奥行|懐)\s*(\d+)/);
    const cMatch = text.match(/天板\s*(\d+)/);
    if (wMatch) params.width = clampParam(Number(wMatch[1]), 12, 80);
    if (dMatch) params.hookDepth = clampParam(Number(dMatch[1]), 15, 120);
    if (cMatch) params.clampGap = clampParam(Number(cMatch[1]), 10, 50);
  } else if (toolId === 'desk-organizer-tray') {
    const slotMatch = text.match(/(\d+)\s*スロット/);
    if (slotMatch) params.slots = clampParam(Number(slotMatch[1]), 1, 4);
    const wMatch = text.match(/幅\s*(\d+)/);
    if (wMatch) params.w = clampParam(Number(wMatch[1]), 80, 240);
    if (/ケーブルなし/.test(text)) params.cableSlit = false;
  }

  return {
    toolId,
    params,
    explanation: notes.join(' ／ '),
  };
}

function clampParam(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.max(min, Math.min(max, val));
}
