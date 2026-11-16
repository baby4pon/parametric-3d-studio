import './style.css';
import { importFrom3MF } from './io/threemfCodec';
import { parseUrlState } from './io/urlAndAiParser';
import { getDefaultParams, getToolById } from './tools/registry';
import { ParamValues, ToolId } from './types';
import { EditorController } from './ui/renderEditor';
import { renderHomeView } from './ui/renderHome';

const appEl = document.querySelector<HTMLElement>('#app')!;
let editorController: EditorController | null = null;
let toastTimer: number | undefined;

// テーマ復元
const savedTheme = localStorage.getItem('p3d_theme');
if (savedTheme === 'light' || savedTheme === 'dark') {
  document.documentElement.setAttribute('data-theme', savedTheme);
}

// 隠しファイル選択インプット (3MF再編集用)
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = '.3mf';
fileInput.style.display = 'none';
document.body.appendChild(fileInput);

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (file) {
    await handle3MFFile(file);
  }
});

// ドラッグ＆ドロップ用オーバーレイ
const dropOverlay = document.createElement('div');
dropOverlay.className = 'drop-overlay';
dropOverlay.style.display = 'none';
dropOverlay.textContent = '📦 .3mf ファイルをドロップしてプロジェクトを復元';
document.body.appendChild(dropOverlay);

let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  dropOverlay.style.display = 'flex';
});
window.addEventListener('dragover', (e) => {
  e.preventDefault();
});
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropOverlay.style.display = 'none';
});
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  dropOverlay.style.display = 'none';
  const file = e.dataTransfer?.files?.[0];
  if (file) {
    await handle3MFFile(file);
  }
});

async function handle3MFFile(file: File) {
  if (!file.name.toLowerCase().endsWith('.3mf')) {
    showToast('⚠ .3mf 形式のファイルを選択してください');
    return;
  }
  try {
    const res = await importFrom3MF(file);
    if (res.kind === 'exact' && res.metadata) {
      showToast(`✅ ${res.sourceFileName} から全パラメータを復元しました`);
      openEditor(
        res.metadata.toolId,
        res.metadata.params,
        new Set(res.metadata.mergedWalls ?? [])
      );
    } else if (res.kind === 'fallback-bbox' && res.fallbackDims) {
      const tool = getToolById(res.fallbackToolId ?? 'divided-box-pro');
      const params = {
        ...getDefaultParams(tool),
        w: res.fallbackDims.w,
        d: res.fallbackDims.d,
        h: res.fallbackDims.h,
      };
      showToast(
        `📦 汎用3MFの外寸 (${res.fallbackDims.w}×${res.fallbackDims.d}×${res.fallbackDims.h}mm) を読み取りました`
      );
      openEditor(tool.id, params);
    }
  } catch (err) {
    showToast(`❌ 3MFの読み込みに失敗しました: ${(err as Error).message}`);
  }
}

function showToast(msg: string) {
  document.querySelectorAll('.toast').forEach((el) => el.remove());
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  if (toastTimer !== undefined) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.remove(), 3600);
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('p3d_theme', next);
}

function openHome() {
  editorController?.dispose();
  editorController = null;
  const cleanUrl = window.location.pathname;
  window.history.replaceState(null, '', cleanUrl);

  renderHomeView(appEl, {
    onOpenTool: (toolId, params, mergedWalls) => openEditor(toolId, params, mergedWalls),
    onTrigger3MFUpload: () => fileInput.click(),
    onToggleTheme: toggleTheme,
    onToast: showToast,
  });
}

function openEditor(toolId: ToolId, customParams?: ParamValues, mergedWalls?: Set<string>) {
  editorController?.dispose();
  const tool = getToolById(toolId);
  const params = customParams ? { ...getDefaultParams(tool), ...customParams } : getDefaultParams(tool);
  const walls = mergedWalls ?? new Set<string>();

  editorController = new EditorController(appEl, tool, params, walls, {
    onBackHome: openHome,
    onTrigger3MFUpload: () => fileInput.click(),
    onToggleTheme: toggleTheme,
    onToast: showToast,
  });
}

// 初期起動：URLに tool パラメータがあれば直接エディタを開く
const urlState = parseUrlState();
if (urlState.hasToolInUrl) {
  openEditor(urlState.toolId, urlState.params, urlState.mergedWalls);
} else {
  openHome();
}
