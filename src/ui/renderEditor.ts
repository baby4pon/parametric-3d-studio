import { exportGeometryToBinarySTL, triggerBlobDownload } from '../io/stlExporter';
import { exportTo3MF } from '../io/threemfCodec';
import { buildShareUrl } from '../io/urlAndAiParser';
import { getDefaultParams } from '../tools/registry';
import { ComputedMetrics, ParamDef, ParamValues, ProjectMetadata, ToolDefinition } from '../types';
import { IphoneOrientation } from '../viewport/iphoneModel';
import { CameraPreset, ViewportSceneManager } from '../viewport/sceneManager';

export interface EditorCallbacks {
  onBackHome: () => void;
  onTrigger3MFUpload: () => void;
  onToggleTheme: () => void;
  onToast: (msg: string) => void;
}

interface HistorySnapshot {
  params: ParamValues;
  mergedWalls: string[];
}

export class EditorController {
  private container: HTMLElement;
  private tool: ToolDefinition;
  private params: ParamValues;
  private mergedWalls: Set<string>;
  private callbacks: EditorCallbacks;

  private sceneManager: ViewportSceneManager | null = null;
  private latestMetrics: ComputedMetrics | null = null;
  private latestWarnings: string[] = [];

  private showDimensions = true;
  private showIphone = false;
  private iphoneOrientation: IphoneOrientation = 'flat';
  private showAdvanced = false;
  private selectedColorHex = 0xf4a800;

  private undoStack: HistorySnapshot[] = [];
  private redoStack: HistorySnapshot[] = [];
  private keydownHandler: (e: KeyboardEvent) => void;

  constructor(
    container: HTMLElement,
    tool: ToolDefinition,
    initialParams: ParamValues,
    initialMergedWalls: Set<string>,
    callbacks: EditorCallbacks
  ) {
    this.container = container;
    this.tool = tool;
    this.params = { ...getDefaultParams(tool), ...initialParams };
    this.mergedWalls = new Set(initialMergedWalls);
    this.callbacks = callbacks;

    this.keydownHandler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))
      ) {
        e.preventDefault();
        this.redo();
      }
    };
    window.addEventListener('keydown', this.keydownHandler);

    this.mount();
  }

  private mount() {
    const basicParams = this.tool.params.filter((p) => p.group === 'basic');
    const advParams = this.tool.params.filter((p) => p.group === 'advanced');

    const colors = [
      { hex: 0xf4a800, css: '#f4a800', name: 'セーフティイエロー' },
      { hex: 0xff6b1a, css: '#ff6b1a', name: 'フィラメントオレンジ' },
      { hex: 0x525a66, css: '#525a66', name: 'マットチャコール' },
      { hex: 0xe6e8ec, css: '#e6e8ec', name: 'マットホワイト' },
    ];

    this.container.innerHTML = `
      <div class="editor-shell">
        <header class="editor-header">
          <div class="editor-header-left">
            <button class="btn btn-dark btn-sm" id="btn-back-home">← 一覧へ</button>
            <div class="editor-title-block">
              <h1>${this.tool.name}</h1>
              <span>${this.tool.subtitle}</span>
            </div>
            <div class="color-swatches" title="表示フィラメント色">
              ${colors
                .map(
                  (c) => `
                <button
                  class="color-swatch ${c.hex === this.selectedColorHex ? 'active' : ''}"
                  data-color="${c.hex}"
                  style="background:${c.css};"
                  title="${c.name}"
                ></button>
              `
                )
                .join('')}
            </div>
          </div>

          <div class="editor-header-right">
            <button class="btn btn-dark btn-sm" id="btn-undo" title="元に戻す (Ctrl+Z)" disabled>↶ 戻す</button>
            <button class="btn btn-dark btn-sm" id="btn-redo" title="やり直す (Ctrl+Y)" disabled>↷ やり直し</button>
            <button class="btn btn-dark btn-sm" id="btn-reset-params">↺ 初期値</button>
            <button class="btn btn-dark btn-sm" id="btn-open-3mf">📂 3MF読込</button>
            <button class="btn btn-dark btn-sm" id="btn-copy-url">🔗 URL共有</button>
            <button class="btn btn-dark btn-sm" id="btn-print-profile">⚙ 推奨設定</button>
            <button class="btn btn-dark btn-sm" id="btn-theme-toggle">🌓 テーマ</button>
            <button class="btn btn-sm" id="btn-export-stl">⬇ STL保存</button>
            <button class="btn btn-yellow btn-sm" id="btn-export-3mf">★ 3MF保存（推奨）</button>
          </div>
        </header>
        <div class="hazard-stripe-h" style="height:5px;"></div>

        <div class="viewport-area">
          <div id="viewport-canvas-host"></div>

          <div class="floating-top-left">
            <div class="floating-row">
              <div class="hud-group" id="camera-preset-group">
                <button class="btn btn-sm" data-preset="iso">全体</button>
                <button class="btn btn-sm" data-preset="top">上</button>
                <button class="btn btn-sm" data-preset="front">正面</button>
                <button class="btn btn-sm" data-preset="right">右</button>
                <button class="btn btn-sm" data-preset="bottom">下</button>
              </div>
            </div>
            <div class="floating-row">
              <button class="btn btn-sm ${this.showDimensions ? 'btn-active' : ''}" id="btn-toggle-dims">
                📏 寸法線: ${this.showDimensions ? 'ON' : 'OFF'}
              </button>
              <button class="btn btn-sm ${this.showIphone ? 'btn-active' : ''}" id="btn-toggle-iphone">
                📱 iPhone実寸比較: ${this.showIphone ? 'ON' : 'OFF'}
              </button>
              <button class="btn btn-sm" id="btn-flip-iphone" style="display: ${this.showIphone ? 'inline-flex' : 'none'};">
                🔄 ${this.iphoneOrientation === 'flat' ? '横置き中（縦置きへ）' : '縦置き中（横置きへ）'}
              </button>
            </div>
          </div>

          <div class="floating-top-right" id="metrics-hud">
            <div class="metrics-title">
              <span>リアルタイム寸法・見積</span>
              <span>mm (Z-up出力)</span>
            </div>
            <div id="metrics-lines-box"></div>
            <div class="metrics-stats" id="metrics-stats-box"></div>
            <div id="metrics-warnings-box"></div>
          </div>
        </div>

        <section class="editor-bottom-dock">
          <div class="basic-params-bar" id="basic-params-host">
            ${basicParams.map((p) => this.renderBasicParamCard(p)).join('')}
            <div class="param-card" style="min-width: 170px; justify-content: center;">
              <button class="btn ${this.showAdvanced ? 'btn-active' : ''}" id="btn-toggle-advanced" style="height:100%;">
                ${this.showAdvanced ? '▼ 詳細設定を閉じる' : '▲ 詳細設定 ＆ 仕切り編集'}
              </button>
            </div>
          </div>

          <div class="advanced-drawer ${this.showAdvanced ? '' : 'hidden'}" id="advanced-drawer-host">
            ${advParams.map((p) => this.renderAdvancedParamItem(p)).join('')}
            ${this.tool.supportsCellMerge ? '<div class="cell-editor-panel" id="cell-editor-host"></div>' : ''}
          </div>
        </section>
      </div>
    `;

    // Three.js シーン初期化
    const host = this.container.querySelector<HTMLElement>('#viewport-canvas-host')!;
    this.sceneManager = new ViewportSceneManager(host);
    this.sceneManager.setModelColor(this.selectedColorHex);
    this.sceneManager.setShowDimensions(this.showDimensions);
    this.sceneManager.setShowIphone(this.showIphone);
    this.sceneManager.onIphoneOrientationChanged = (mode) => {
      this.iphoneOrientation = mode;
      this.updateIphoneButtons();
    };

    this.bindHeaderEvents();
    this.bindViewportHudEvents();
    this.bindParamInputs();
    this.rebuildModel(true);
    this.updateHistoryButtons();
  }

  private renderBasicParamCard(p: ParamDef): string {
    const val = this.params[p.key];
    if (p.type === 'select') {
      return `
        <div class="param-card">
          <div class="param-card-label">
            <span>${p.shortLabel ?? p.label}</span>
          </div>
          <select class="select-input param-select" data-key="${p.key}">
            ${(p.options ?? [])
              .map(
                (o) =>
                  `<option value="${o.value}" ${String(val) === o.value ? 'selected' : ''}>${o.label}</option>`
              )
              .join('')}
          </select>
        </div>
      `;
    }

    return `
      <div class="param-card">
        <div class="param-card-label">
          <span>${p.shortLabel ?? p.label}</span>
          <span class="param-card-unit">${p.unit ?? ''}</span>
        </div>
        <div class="stepper-row">
          <button class="stepper-btn" data-step-dir="-1" data-key="${p.key}" type="button">−</button>
          <input
            type="number"
            class="stepper-input param-number"
            data-key="${p.key}"
            value="${val}"
            min="${p.min ?? ''}"
            max="${p.max ?? ''}"
            step="${p.step ?? 1}"
          />
          <button class="stepper-btn" data-step-dir="1" data-key="${p.key}" type="button">＋</button>
        </div>
      </div>
    `;
  }

  private renderAdvancedParamItem(p: ParamDef): string {
    const val = this.params[p.key];
    if (p.type === 'boolean') {
      return `
        <div class="adv-item">
          <label class="checkbox-row">
            <span>${p.label}</span>
            <input type="checkbox" class="param-checkbox" data-key="${p.key}" ${val ? 'checked' : ''} />
          </label>
        </div>
      `;
    }
    if (p.type === 'select') {
      return `
        <div class="adv-item">
          <div class="param-card-label"><span>${p.label}</span></div>
          <select class="select-input param-select" data-key="${p.key}">
            ${(p.options ?? [])
              .map(
                (o) =>
                  `<option value="${o.value}" ${String(val) === o.value ? 'selected' : ''}>${o.label}</option>`
              )
              .join('')}
          </select>
        </div>
      `;
    }
    return `
      <div class="adv-item">
        <div class="param-card-label">
          <span>${p.label}</span>
          <span class="param-card-unit">${p.unit ?? ''}</span>
        </div>
        <div class="stepper-row">
          <button class="stepper-btn" data-step-dir="-1" data-key="${p.key}" type="button">−</button>
          <input
            type="number"
            class="stepper-input param-number"
            data-key="${p.key}"
            value="${val}"
            min="${p.min ?? ''}"
            max="${p.max ?? ''}"
            step="${p.step ?? 1}"
          />
          <button class="stepper-btn" data-step-dir="1" data-key="${p.key}" type="button">＋</button>
        </div>
      </div>
    `;
  }

  private bindHeaderEvents() {
    this.container.querySelector('#btn-back-home')?.addEventListener('click', () => {
      this.callbacks.onBackHome();
    });

    this.container.querySelectorAll<HTMLButtonElement>('.color-swatch').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedColorHex = Number(btn.dataset.color);
        this.sceneManager?.setModelColor(this.selectedColorHex);
        this.container
          .querySelectorAll('.color-swatch')
          .forEach((b) => b.classList.toggle('active', b === btn));
      });
    });

    this.container.querySelector('#btn-undo')?.addEventListener('click', () => this.undo());
    this.container.querySelector('#btn-redo')?.addEventListener('click', () => this.redo());

    this.container.querySelector('#btn-reset-params')?.addEventListener('click', () => {
      this.pushHistory();
      this.params = getDefaultParams(this.tool);
      this.mergedWalls.clear();
      this.syncAllInputsFromState();
      this.rebuildModel(true);
      this.callbacks.onToast('初期値にリセットしました');
    });

    this.container.querySelector('#btn-open-3mf')?.addEventListener('click', () => {
      this.callbacks.onTrigger3MFUpload();
    });

    this.container.querySelector('#btn-copy-url')?.addEventListener('click', async () => {
      const shareUrl = buildShareUrl(this.tool.id, this.params, this.mergedWalls);
      await navigator.clipboard.writeText(shareUrl);
      this.callbacks.onToast('現在の設定を含むURLをクリップボードにコピーしました');
    });

    this.container.querySelector('#btn-print-profile')?.addEventListener('click', () => {
      this.openPrintProfileModal();
    });

    this.container.querySelector('#btn-theme-toggle')?.addEventListener('click', () => {
      this.callbacks.onToggleTheme();
      const theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      this.sceneManager?.setTheme(theme);
    });

    this.container.querySelector('#btn-export-stl')?.addEventListener('click', () => {
      const geom = this.sceneManager?.getCurrentGeometry();
      if (!geom) return;
      const blob = exportGeometryToBinarySTL(geom);
      const fname = `${this.tool.id}_${this.latestMetrics?.outerW ?? 0}x${this.latestMetrics?.outerD ?? 0}.stl`;
      triggerBlobDownload(blob, fname);
      this.callbacks.onToast(`STLファイルを生成・ダウンロードしました (${fname})`);
    });

    this.container.querySelector('#btn-export-3mf')?.addEventListener('click', async () => {
      const geom = this.sceneManager?.getCurrentGeometry();
      if (!geom) return;
      const meta: ProjectMetadata = {
        app: 'parametric-3d-studio',
        version: 1,
        toolId: this.tool.id,
        params: { ...this.params },
        mergedWalls: Array.from(this.mergedWalls),
        exportedAt: new Date().toISOString(),
      };
      const thumb = this.sceneManager?.captureThumbnailDataUrl();
      const blob = await exportTo3MF(geom, meta, thumb);
      const fname = `${this.tool.id}_${this.latestMetrics?.outerW ?? 0}x${this.latestMetrics?.outerD ?? 0}.3mf`;
      triggerBlobDownload(blob, fname);
      this.callbacks.onToast(`設定データ埋め込み済み 3MF をダウンロードしました (${fname})`);
    });
  }

  private bindViewportHudEvents() {
    this.container
      .querySelectorAll<HTMLButtonElement>('#camera-preset-group [data-preset]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          this.sceneManager?.setViewPreset(btn.dataset.preset as CameraPreset);
        });
      });

    const dimBtn = this.container.querySelector<HTMLButtonElement>('#btn-toggle-dims');
    dimBtn?.addEventListener('click', () => {
      this.showDimensions = !this.showDimensions;
      if (this.latestMetrics) {
        this.sceneManager?.setShowDimensions(this.showDimensions, this.latestMetrics);
      }
      dimBtn.classList.toggle('btn-active', this.showDimensions);
      dimBtn.textContent = `📏 寸法線: ${this.showDimensions ? 'ON' : 'OFF'}`;
    });

    const iphoneBtn = this.container.querySelector<HTMLButtonElement>('#btn-toggle-iphone');
    const flipBtn = this.container.querySelector<HTMLButtonElement>('#btn-flip-iphone');

    iphoneBtn?.addEventListener('click', () => {
      this.showIphone = !this.showIphone;
      this.sceneManager?.setShowIphone(this.showIphone, this.latestMetrics?.outerW);
      this.updateIphoneButtons();
    });

    flipBtn?.addEventListener('click', () => {
      if (!this.sceneManager) return;
      const next: IphoneOrientation = this.iphoneOrientation === 'flat' ? 'standing' : 'flat';
      this.iphoneOrientation = next;
      this.sceneManager.setIphoneOrientation(next);
      this.updateIphoneButtons();
    });
  }

  private updateIphoneButtons() {
    const iphoneBtn = this.container.querySelector<HTMLButtonElement>('#btn-toggle-iphone');
    const flipBtn = this.container.querySelector<HTMLButtonElement>('#btn-flip-iphone');
    if (iphoneBtn) {
      iphoneBtn.classList.toggle('btn-active', this.showIphone);
      iphoneBtn.textContent = `📱 iPhone実寸比較: ${this.showIphone ? 'ON' : 'OFF'}`;
    }
    if (flipBtn) {
      flipBtn.style.display = this.showIphone ? 'inline-flex' : 'none';
      flipBtn.textContent =
        this.iphoneOrientation === 'flat' ? '🔄 横置き中（縦置きへ）' : '🔄 縦置き中（横置きへ）';
    }
  }

  private bindParamInputs() {
    // 数値直接入力
    this.container.querySelectorAll<HTMLInputElement>('.param-number').forEach((input) => {
      input.addEventListener('change', () => {
        const key = input.dataset.key!;
        const def = this.tool.params.find((p) => p.key === key);
        if (!def) return;
        let val = Number(input.value);
        if (!Number.isFinite(val)) val = Number(def.defaultValue);
        if (def.min !== undefined) val = Math.max(def.min, val);
        if (def.max !== undefined) val = Math.min(def.max, val);
        val = Math.round(val * 100) / 100;
        input.value = String(val);

        if (this.params[key] !== val) {
          this.pushHistory();
          this.params[key] = val;
          this.rebuildModel();
        }
      });
    });

    // 長押し連続増減ボタン (bindRepeat)
    this.container.querySelectorAll<HTMLButtonElement>('.stepper-btn').forEach((btn) => {
      const key = btn.dataset.key!;
      const dir = Number(btn.dataset.stepDir);
      const applyStep = (pushHist: boolean) => {
        const def = this.tool.params.find((p) => p.key === key);
        if (!def) return;
        const step = def.step ?? 1;
        const cur = Number(this.params[key] ?? def.defaultValue);
        let next = Math.round((cur + dir * step) * 100) / 100;
        if (def.min !== undefined) next = Math.max(def.min, next);
        if (def.max !== undefined) next = Math.min(def.max, next);
        if (next === cur) return;
        if (pushHist) this.pushHistory();
        this.params[key] = next;
        const inputEl = this.container.querySelector<HTMLInputElement>(
          `.param-number[data-key="${key}"]`
        );
        if (inputEl) inputEl.value = String(next);
        this.rebuildModel();
      };

      let holdTimer: number | undefined;
      let repeatInterval: number | undefined;

      const stopRepeat = () => {
        if (holdTimer !== undefined) clearTimeout(holdTimer);
        if (repeatInterval !== undefined) clearInterval(repeatInterval);
        holdTimer = undefined;
        repeatInterval = undefined;
      };

      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        applyStep(true);
        holdTimer = window.setTimeout(() => {
          repeatInterval = window.setInterval(() => applyStep(false), 65);
        }, 360);
      });
      btn.addEventListener('pointerup', stopRepeat);
      btn.addEventListener('pointerleave', stopRepeat);
      btn.addEventListener('pointercancel', stopRepeat);
    });

    // セレクトボックス
    this.container.querySelectorAll<HTMLSelectElement>('.param-select').forEach((sel) => {
      sel.addEventListener('change', () => {
        const key = sel.dataset.key!;
        this.pushHistory();
        this.params[key] = sel.value;
        this.rebuildModel();
      });
    });

    // チェックボックス
    this.container.querySelectorAll<HTMLInputElement>('.param-checkbox').forEach((chk) => {
      chk.addEventListener('change', () => {
        const key = chk.dataset.key!;
        this.pushHistory();
        this.params[key] = chk.checked;
        this.rebuildModel();
      });
    });

    // 詳細設定ドロワー開閉
    const advBtn = this.container.querySelector<HTMLButtonElement>('#btn-toggle-advanced');
    const drawer = this.container.querySelector<HTMLElement>('#advanced-drawer-host');
    advBtn?.addEventListener('click', () => {
      this.showAdvanced = !this.showAdvanced;
      drawer?.classList.toggle('hidden', !this.showAdvanced);
      advBtn.classList.toggle('btn-active', this.showAdvanced);
      advBtn.textContent = this.showAdvanced
        ? '▼ 詳細設定を閉じる'
        : '▲ 詳細設定 ＆ 仕切り編集';
    });
  }

  private syncAllInputsFromState() {
    for (const p of this.tool.params) {
      const val = this.params[p.key];
      if (p.type === 'number') {
        const el = this.container.querySelector<HTMLInputElement>(
          `.param-number[data-key="${p.key}"]`
        );
        if (el) el.value = String(val);
      } else if (p.type === 'select') {
        const el = this.container.querySelector<HTMLSelectElement>(
          `.param-select[data-key="${p.key}"]`
        );
        if (el) el.value = String(val);
      } else if (p.type === 'boolean') {
        const el = this.container.querySelector<HTMLInputElement>(
          `.param-checkbox[data-key="${p.key}"]`
        );
        if (el) el.checked = Boolean(val);
      }
    }
  }

  private rebuildModel(fitCamera = false) {
    const result = this.tool.generate(this.params, this.mergedWalls);
    this.latestMetrics = result.metrics;
    this.latestWarnings = result.warnings;

    this.sceneManager?.updateModel(result.geometry, result.metrics);
    if (fitCamera) {
      this.sceneManager?.setViewPreset('iso');
    }

    // URLをサイレント同期
    const shareUrl = buildShareUrl(this.tool.id, this.params, this.mergedWalls);
    window.history.replaceState(null, '', shareUrl);

    this.updateMetricsHud();
    if (this.tool.supportsCellMerge) {
      this.renderCellMergeEditor();
    }
  }

  private updateMetricsHud() {
    if (!this.latestMetrics) return;
    const linesHost = this.container.querySelector('#metrics-lines-box');
    const statsHost = this.container.querySelector('#metrics-stats-box');
    const warnHost = this.container.querySelector('#metrics-warnings-box');

    if (linesHost) {
      linesHost.innerHTML = this.latestMetrics.summaryLines
        .map((line) => `<div class="metrics-line">${line}</div>`)
        .join('');
    }
    if (statsHost) {
      const mins = this.latestMetrics.estimatedPrintMinutes;
      const timeStr = mins >= 60 ? `${Math.floor(mins / 60)}時間${mins % 60}分` : `${mins}分`;
      statsHost.innerHTML = `
        <span>フィラメント目安: <strong>${this.latestMetrics.estimatedFilamentGrams} g</strong></span>
        <span>印刷時間: <strong>約 ${timeStr}</strong></span>
      `;
    }
    if (warnHost) {
      warnHost.innerHTML = this.latestWarnings
        .map((w) => `<div class="warning-box">⚠ ${w}</div>`)
        .join('');
    }
  }

  /**
   * 2D仕切りセル結合エディタを描画する（divided-box-pro用）
   */
  private renderCellMergeEditor() {
    const host = this.container.querySelector('#cell-editor-host');
    if (!host) return;

    const cols = Math.max(1, Math.min(10, Math.round(Number(this.params.cols ?? 3))));
    const rows = Math.max(1, Math.min(10, Math.round(Number(this.params.rows ?? 2))));

    if (cols === 1 && rows === 1) {
      host.innerHTML = `
        <div class="cell-editor-head">
          <strong style="color:var(--yellow);">🧱 2D 仕切り結合エディタ</strong>
          <span style="font-size:12px; color:var(--text-muted);">列または行を2以上に増やすと、仕切り壁を個別にクリックして結合（大部屋化）できます。</span>
        </div>
      `;
      return;
    }

    const totalGridCols = cols * 2 - 1;
    let gridHtml = '';

    for (let gr = 0; gr < rows * 2 - 1; gr++) {
      for (let gc = 0; gc < cols * 2 - 1; gc++) {
        const isCellRow = gr % 2 === 0;
        const isCellCol = gc % 2 === 0;
        const r = Math.floor(gr / 2);
        const c = Math.floor(gc / 2);

        if (isCellRow && isCellCol) {
          gridHtml += `<div class="cell-box">${c + 1},${r + 1}</div>`;
        } else if (isCellRow && !isCellCol) {
          const key = `v:${c}:${r}`;
          const isMerged = this.mergedWalls.has(key);
          gridHtml += `<button class="wall-btn-v ${isMerged ? 'merged' : ''}" data-wall-key="${key}" title="クリックで縦仕切りを${isMerged ? '復活' : '削除(結合)'}"></button>`;
        } else if (!isCellRow && isCellCol) {
          const key = `h:${c}:${r}`;
          const isMerged = this.mergedWalls.has(key);
          gridHtml += `<button class="wall-btn-h ${isMerged ? 'merged' : ''}" data-wall-key="${key}" title="クリックで横仕切りを${isMerged ? '復活' : '削除(結合)'}"></button>`;
        } else {
          gridHtml += `<div class="wall-corner"></div>`;
        }
      }
    }

    host.innerHTML = `
      <div class="cell-editor-head">
        <div>
          <strong style="color:var(--yellow);">🧱 2D 仕切りセル結合エディタ（黄色の仕切り壁をクリックして大部屋化）</strong>
          <div style="font-size:12px; color:var(--text-muted);">赤の点線になった箇所の仕切りが消え、隣接するマスが結合されます</div>
        </div>
        <button class="btn btn-sm" id="btn-reset-merged-walls">全仕切りを復活させる</button>
      </div>
      <div class="cell-grid-board" style="grid-template-columns: repeat(${totalGridCols}, auto);">
        ${gridHtml}
      </div>
    `;

    host.querySelectorAll<HTMLButtonElement>('[data-wall-key]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.wallKey!;
        this.pushHistory();
        if (this.mergedWalls.has(key)) {
          this.mergedWalls.delete(key);
        } else {
          this.mergedWalls.add(key);
        }
        this.rebuildModel();
      });
    });

    host.querySelector('#btn-reset-merged-walls')?.addEventListener('click', () => {
      if (this.mergedWalls.size === 0) return;
      this.pushHistory();
      this.mergedWalls.clear();
      this.rebuildModel();
    });
  }

  private openPrintProfileModal() {
    const p = this.tool.printProfile;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal-box">
        <div class="modal-head">
          <span>⚙ スライサー推奨設定: ${this.tool.name}</span>
          <button class="btn btn-sm btn-dark" id="modal-close-profile">✕ 閉じる</button>
        </div>
        <div class="modal-body">
          <table class="profile-table">
            <tr><th>サポート材</th><td>${p.supports}</td></tr>
            <tr><th>推奨ノズル径</th><td>${p.nozzle}</td></tr>
            <tr><th>推奨積層ピッチ</th><td>${p.layerHeight}</td></tr>
            <tr><th>推奨インフィル</th><td>${p.infill}</td></tr>
          </table>

          <div>
            <strong style="color:var(--yellow);">フィラメント素材適性</strong>
            <table class="profile-table" style="margin-top:6px;">
              ${p.materials
                .map(
                  (m) => `
                <tr>
                  <th>${m.name}</th>
                  <td><strong style="font-size:15px; margin-right:8px;">${m.rating}</strong> ${m.note ?? ''}</td>
                </tr>
              `
                )
                .join('')}
            </table>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    const close = () => backdrop.remove();
    backdrop.querySelector('#modal-close-profile')?.addEventListener('click', close);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });
  }

  private pushHistory() {
    this.undoStack.push({
      params: { ...this.params },
      mergedWalls: Array.from(this.mergedWalls),
    });
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
    this.updateHistoryButtons();
  }

  private undo() {
    const snap = this.undoStack.pop();
    if (!snap) return;
    this.redoStack.push({
      params: { ...this.params },
      mergedWalls: Array.from(this.mergedWalls),
    });
    this.params = { ...snap.params };
    this.mergedWalls = new Set(snap.mergedWalls);
    this.syncAllInputsFromState();
    this.rebuildModel();
    this.updateHistoryButtons();
  }

  private redo() {
    const snap = this.redoStack.pop();
    if (!snap) return;
    this.undoStack.push({
      params: { ...this.params },
      mergedWalls: Array.from(this.mergedWalls),
    });
    this.params = { ...snap.params };
    this.mergedWalls = new Set(snap.mergedWalls);
    this.syncAllInputsFromState();
    this.rebuildModel();
    this.updateHistoryButtons();
  }

  private updateHistoryButtons() {
    const undoBtn = this.container.querySelector<HTMLButtonElement>('#btn-undo');
    const redoBtn = this.container.querySelector<HTMLButtonElement>('#btn-redo');
    if (undoBtn) undoBtn.disabled = this.undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = this.redoStack.length === 0;
  }

  public dispose() {
    window.removeEventListener('keydown', this.keydownHandler);
    this.sceneManager?.dispose();
    this.sceneManager = null;
  }
}
