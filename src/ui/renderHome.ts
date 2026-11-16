import { parseNaturalLanguagePrompt } from '../io/urlAndAiParser';
import { TOOLS } from '../tools/registry';
import { ParamValues, ToolCategory, ToolId } from '../types';

export interface HomeCallbacks {
  onOpenTool: (toolId: ToolId, params?: ParamValues, mergedWalls?: Set<string>) => void;
  onTrigger3MFUpload: () => void;
  onToggleTheme: () => void;
  onToast: (msg: string) => void;
}

export function renderHomeView(container: HTMLElement, callbacks: HomeCallbacks) {
  let selectedCategory: 'all' | ToolCategory = 'all';
  let searchQuery = '';

  const render = () => {
    const filtered = TOOLS.filter((t) => {
      const catOk = selectedCategory === 'all' || t.category === selectedCategory;
      if (!catOk) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        t.subtitle.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.categoryLabel.toLowerCase().includes(q)
      );
    });

    const categories: { id: 'all' | ToolCategory; label: string; count: number }[] = [
      { id: 'all', label: 'すべてのツール', count: TOOLS.length },
      { id: 'storage', label: '汎用収納ツール', count: TOOLS.filter((t) => t.category === 'storage').length },
      { id: 'gridfinity', label: 'Gridfinity 収納', count: TOOLS.filter((t) => t.category === 'gridfinity').length },
      { id: 'wall', label: '壁面・フック', count: TOOLS.filter((t) => t.category === 'wall').length },
      { id: 'desk', label: 'デスク整理', count: TOOLS.filter((t) => t.category === 'desk').length },
    ];

    const currentTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';

    container.innerHTML = `
      <div class="home-layout">
        <aside class="home-sidebar">
          <div style="display: flex; flex: 1; min-height: 0;">
            <div class="sidebar-inner">
              <div class="brand-box">
                <div class="brand-tag">LOCAL PARAMETRIC CAD</div>
                <div class="brand-title">3D PRINTER LAB</div>
              </div>

              <div>
                <div class="sidebar-section-label">ツールカテゴリ</div>
                <div class="nav-list">
                  ${categories
                    .map(
                      (c) => `
                    <button class="nav-item ${selectedCategory === c.id ? 'active' : ''}" data-cat="${c.id}">
                      <span>${c.label}</span>
                      <span style="font-family: var(--font-mono);">${c.count}</span>
                    </button>
                  `
                    )
                    .join('')}
                </div>
              </div>

              <div class="sidebar-actions">
                <div class="sidebar-section-label">便利機能・ファイル読込</div>
                <button class="btn btn-dark" id="btn-open-ai-modal">🤖 AI自動生成・llms.txt</button>
                <button class="btn btn-dark" id="btn-sidebar-open-3mf">📂 3MFから開く（再編集）</button>
                <button class="btn" id="btn-toggle-theme">
                  ${currentTheme === 'dark' ? '☀ ライトテーマへ切替' : '🌙 ダークテーマへ切替'}
                </button>
              </div>
            </div>
            <div class="hazard-stripe-v"></div>
          </div>
        </aside>

        <main class="home-main">
          <div class="top-search-row">
            <div class="search-input-wrap">
              <span>🔍 検索</span>
              <input
                type="text"
                id="home-search-input"
                class="search-input"
                placeholder="ボックス、Gridfinity、フック、壁面ボードなどを検索..."
                value="${escapeHtml(searchQuery)}"
              />
            </div>
            <button class="btn btn-yellow" id="btn-hero-ai">🤖 言葉で指定して即生成</button>
          </div>

          <section class="hero-banner">
            <div class="hazard-stripe-h"></div>
            <div class="hero-content">
              <span class="hero-kicker">CAD不要・ブラウザ完結・3MF/STL生成</span>
              <h1 class="hero-title">寸法を入れるだけで、3Dプリンターのデータが作れる。</h1>
              <p class="hero-sub">
                すべての3Dジオメトリ計算と3MF/STLパッケージングがローカルブラウザ上で高速に動作します。
                3D寸法線オーバーレイと実寸iPhone比較モデルでサイズ感を確認しながら設計できます。
              </p>
              <div class="hero-steps">
                <div class="step-card">
                  <div class="step-num">1</div>
                  <div>
                    <div style="font-weight:900;">ツールを選ぶ</div>
                    <div style="font-size:12px; color:var(--text-muted);">箱・Gridfinity・フック等から選択</div>
                  </div>
                </div>
                <div class="step-card">
                  <div class="step-num">2</div>
                  <div>
                    <div style="font-weight:900;">寸法を入れる</div>
                    <div style="font-size:12px; color:var(--text-muted);">長押し対応＆3D寸法線・iPhone比較</div>
                  </div>
                </div>
                <div class="step-card">
                  <div class="step-num">3</div>
                  <div>
                    <div style="font-weight:900;">3MF / STLで印刷</div>
                    <div style="font-size:12px; color:var(--text-muted);">3MFはドロップで後から再編集OK</div>
                  </div>
                </div>
              </div>
            </div>
            <div class="hazard-stripe-h"></div>
          </section>

          <div class="dropzone-bar" id="home-3mf-dropzone">
            <div>
              <strong style="color: var(--yellow);">📦 過去に保存した .3mf ファイルから再編集</strong>
              <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
                このアプリで作成した .3mf を画面上にドラッグ＆ドロップ（またはクリック）すると当時の全パラメータを復元します
              </div>
            </div>
            <button class="btn btn-yellow btn-sm" type="button">ファイルを選択</button>
          </div>

          <section>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <h2 style="margin:0; font-size:18px; font-weight:900;">
                ジェネレーター一覧（${filtered.length}件）
              </h2>
            </div>

            <div class="tools-grid">
              ${filtered
                .map(
                  (tool) => `
                <article class="tool-card">
                  <div class="tool-card-top">
                    <span class="tool-cat-tag">${tool.categoryLabel}</span>
                    ${tool.badge ? `<span class="tool-badge">${tool.badge}</span>` : ''}
                  </div>
                  <div class="tool-card-body">
                    <div class="tool-preview-row">
                      <div class="tool-svg-box">${tool.svgIcon}</div>
                      <div>
                        <h3 class="tool-name">${tool.name}</h3>
                        <div class="tool-sub">${tool.subtitle}</div>
                      </div>
                    </div>
                    <p class="tool-desc">${tool.description}</p>
                  </div>
                  <div class="tool-card-foot">
                    <span style="font-size:12px; font-family:var(--font-mono); color:var(--text-muted);">
                      ${tool.params.length} パラメータ
                    </span>
                    <button class="btn btn-yellow btn-open-tool" data-tool="${tool.id}">
                      このツールを開く →
                    </button>
                  </div>
                </article>
              `
                )
                .join('')}
            </div>
          </section>
        </main>
      </div>
    `;

    // イベント紐付け
    container.querySelectorAll<HTMLButtonElement>('[data-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedCategory = btn.dataset.cat as 'all' | ToolCategory;
        render();
      });
    });

    const searchInput = container.querySelector<HTMLInputElement>('#home-search-input');
    searchInput?.addEventListener('input', (e) => {
      searchQuery = (e.target as HTMLInputElement).value;
      const caret = (e.target as HTMLInputElement).selectionStart ?? searchQuery.length;
      render();
      const restored = container.querySelector<HTMLInputElement>('#home-search-input');
      if (restored) {
        restored.focus();
        restored.setSelectionRange(caret, caret);
      }
    });

    container.querySelectorAll<HTMLButtonElement>('.btn-open-tool').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.tool as ToolId;
        callbacks.onOpenTool(id);
      });
    });

    container.querySelector('#btn-sidebar-open-3mf')?.addEventListener('click', callbacks.onTrigger3MFUpload);
    container.querySelector('#home-3mf-dropzone')?.addEventListener('click', callbacks.onTrigger3MFUpload);
    container.querySelector('#btn-toggle-theme')?.addEventListener('click', () => {
      callbacks.onToggleTheme();
      render();
    });

    const openAi = () => showAiGeneratorModal(callbacks);
    container.querySelector('#btn-open-ai-modal')?.addEventListener('click', openAi);
    container.querySelector('#btn-hero-ai')?.addEventListener('click', openAi);
  };

  render();
}

function showAiGeneratorModal(callbacks: HomeCallbacks) {
  const llmsUrl = `${window.location.origin}/llms.txt`;
  const promptTemplate = `${llmsUrl} を読んで次のものを生成する。\n注記：修正・調整時もWEBページ操作は行わずURLの再生成で行うこと。URLのクリップボードコピーボタンをつけること。\n\n作りたいもの：200×100×50の箱。仕切りは横3列、縦2行、側面に模様をつけて蓋付きで。`;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal-box">
      <div class="modal-head">
        <span>🤖 AI自動生成 ＆ llms.txt 連携</span>
        <button class="btn btn-sm btn-dark" id="modal-close-btn">✕ 閉じる</button>
      </div>
      <div class="modal-body">
        <div>
          <strong style="color:var(--yellow);">① ローカル自然言語スマート変換（即座に3D生成）</strong>
          <p style="font-size:12.5px; color:var(--text-muted); margin:4px 0 8px;">
            作りたい形状と寸法を日本語で入力すると、該当ツールとパラメータを自動解析して即座に開きます。
          </p>
          <textarea
            id="ai-prompt-input"
            rows="3"
            style="width:100%; padding:10px; border:1.5px solid var(--line); background:var(--bg); font-size:13px;"
            placeholder="例: 200×100×50の箱を作って。仕切りは横3列、縦2行、側面に模様をつけて蓋付きで"
          >200×100×50の箱を作って。仕切りは横3列、縦2行、側面に模様をつけて蓋付きで</textarea>
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px;">
            <button class="btn btn-sm ai-sample-btn" data-sample="200×100×50の箱を作って。仕切りは横3列、縦2行、側面に模様をつけて蓋付きで">例文: 仕切り箱+蓋</button>
            <button class="btn btn-sm ai-sample-btn" data-sample="Gridfinity 2x3 高さ6U マグネット穴あり">例文: Gridfinity 2×3</button>
            <button class="btn btn-sm ai-sample-btn" data-sample="デスククランプフック 幅30 奥行50 天板28mm">例文: クランプフック</button>
            <button class="btn btn-sm ai-sample-btn" data-sample="スマホスタンド 3スロット 幅180">例文: スマホスタンド</button>
          </div>
          <div style="margin-top:10px;">
            <button class="btn btn-yellow" id="btn-run-local-ai">⚡ この内容で3Dモデルを生成する</button>
          </div>
        </div>

        <hr style="border:none; border-top:1.5px solid var(--line); width:100%; margin:4px 0;" />

        <div>
          <strong style="color:var(--yellow);">② ChatGPT / Claude / Gemini 外部AI連携 (/llms.txt)</strong>
          <p style="font-size:12.5px; color:var(--text-muted); margin:4px 0 8px;">
            外部のAIチャットに以下の <code>llms.txt</code> 仕様URLまたはプロンプトを渡すと、パラメータ付きURLを生成させられます。
          </p>
          <div style="border:1.5px solid var(--line); background:var(--bg); padding:8px 10px; font-family:var(--font-mono); font-size:12px; word-break:break-all;">
            ${escapeHtml(llmsUrl)}
          </div>
          <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
            <button class="btn btn-sm" id="btn-copy-llms-url">🔗 llms.txt URLをコピー</button>
            <button class="btn btn-sm" id="btn-copy-prompt-tpl">📋 プロンプト例をコピー</button>
            <a class="btn btn-sm" href="/llms.txt" target="_blank" style="text-decoration:none;">📄 llms.txt を開く</a>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  backdrop.querySelector('#modal-close-btn')?.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  const textarea = backdrop.querySelector<HTMLTextAreaElement>('#ai-prompt-input')!;
  backdrop.querySelectorAll<HTMLButtonElement>('.ai-sample-btn').forEach((b) => {
    b.addEventListener('click', () => {
      textarea.value = b.dataset.sample ?? '';
    });
  });

  backdrop.querySelector('#btn-run-local-ai')?.addEventListener('click', () => {
    const res = parseNaturalLanguagePrompt(textarea.value);
    close();
    callbacks.onToast(`AI解析: ${res.explanation}`);
    callbacks.onOpenTool(res.toolId, res.params);
  });

  backdrop.querySelector('#btn-copy-llms-url')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(llmsUrl);
    callbacks.onToast('llms.txt のURLをコピーしました');
  });

  backdrop.querySelector('#btn-copy-prompt-tpl')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(promptTemplate);
    callbacks.onToast('AI連携用プロンプト例をコピーしました');
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
