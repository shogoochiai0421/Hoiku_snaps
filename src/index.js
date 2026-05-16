// =============================================
// 保育士・子育て向け掲示板 - Cloudflare Worker
// =============================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // ルーティング
    if (path === '/' && method === 'GET') return handleTop(env, url);
    if (path === '/api/like' && method === 'POST') return handleLike(request, env);
    if (path.match(/^\/[a-z0-9_-]+$/) && method === 'GET') return handleBoard(env, url, path.slice(1));
    if (path.match(/^\/[a-z0-9_-]+\/\d+$/) && method === 'GET') {
      const [, slug, threadId] = path.split('/');
      return handleThread(env, slug, threadId);
    }
    if (path.match(/^\/[a-z0-9_-]+\/new$/) && method === 'POST') {
      return handleNewThread(request, env, path.split('/')[1]);
    }

    return new Response('Not Found', { status: 404 });
  }
};

// =============================================
// ユーティリティ
// =============================================

function escape(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr + 'Z')) / 1000);
  if (diff < 60) return 'たった今';
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}日前`;
  return `${Math.floor(diff / 86400 / 30)}ヶ月前`;
}

const PAGE_SIZE = 20;

// =============================================
// CSS
// =============================================

const CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #faf8f2; color: #333; font-family: 'Hiragino Kaku Gothic ProN', 'メイリオ', sans-serif; min-height: 100vh; }
a { color: inherit; text-decoration: none; }

/* ヘッダー */
.header {
  background: #faf8f2;
  border-bottom: 1px solid #e8e0d0;
  padding: 0.75rem 1.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  position: sticky;
  top: 0;
  z-index: 100;
}
.logo {
  width: 160px;
  height: 48px;
  flex-shrink: 0;
  background: #f0ead8;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #aaa;
  font-size: 0.75rem;
  /* ロゴ画像を入れる場合: background-image: url('/logo.png'); background-size: contain; background-repeat: no-repeat; */
}
.search-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  background: #fff;
  border: 1px solid #e0d8c8;
  border-radius: 20px;
  padding: 0.4rem 1rem;
  gap: 0.5rem;
  max-width: 420px;
}
.search-wrap input {
  border: none;
  outline: none;
  width: 100%;
  background: transparent;
  font-size: 0.9rem;
}
.btn-post {
  background: #f5c842;
  color: #333;
  border: none;
  border-radius: 20px;
  padding: 0.5rem 1.2rem;
  font-size: 0.9rem;
  cursor: pointer;
  white-space: nowrap;
  font-weight: bold;
  margin-left: auto;
}
.btn-post:hover { background: #e8b800; }

/* レイアウト */
.container {
  display: flex;
  max-width: 1000px;
  margin: 0 auto;
  padding: 1rem;
  gap: 1rem;
  align-items: flex-start;
}
.main { flex: 1; min-width: 0; }
.sidebar { width: 220px; flex-shrink: 0; position: sticky; top: 72px; }

/* タブ */
.tabs {
  display: flex;
  border-bottom: 2px solid #e8e0d0;
  margin-bottom: 1rem;
}
.tab {
  padding: 0.5rem 1.5rem;
  cursor: pointer;
  color: #888;
  font-size: 0.9rem;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  text-decoration: none;
  display: block;
}
.tab.active {
  color: #333;
  border-bottom-color: #f5c842;
  font-weight: bold;
}
.tab:hover { color: #555; }

/* カード */
.card {
  background: #fff;
  border: 1px solid #ede8dc;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 0.75rem;
  cursor: pointer;
  transition: box-shadow 0.15s;
}
.card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
.card-title { font-size: 0.95rem; font-weight: bold; margin-bottom: 0.4rem; }
.card-body {
  font-size: 0.85rem;
  color: #555;
  margin-bottom: 0.6rem;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 0.5rem; }
.tag-chip {
  background: #fff3cd;
  color: #856404;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.72rem;
}
.card-meta {
  font-size: 0.78rem;
  color: #aaa;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.card-board { color: #888; }
.card-reactions { margin-left: auto; display: flex; gap: 0.75rem; }
.reaction { display: flex; align-items: center; gap: 3px; font-size: 0.78rem; color: #aaa; }

/* サイドバー */
.sidebar-box {
  background: #fff;
  border: 1px solid #ede8dc;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
}
.sidebar-title { font-size: 0.82rem; font-weight: bold; color: #888; margin-bottom: 0.75rem; letter-spacing: 0.05em; }
.board-link {
  display: block;
  padding: 0.35rem 0;
  font-size: 0.85rem;
  color: #555;
  border-bottom: 1px solid #f5f0e8;
}
.board-link:last-child { border-bottom: none; }
.board-link:hover { color: #333; }
.board-link.active { color: #333; font-weight: bold; }
.tag-list { display: flex; flex-wrap: wrap; gap: 6px; }
.tag-link {
  background: #f5f0e8;
  color: #666;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 0.78rem;
  cursor: pointer;
}
.tag-link:hover { background: #ede8dc; }

/* ページネーション */
.pagination {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  margin: 1.5rem 0;
}
.pagination a, .pagination span {
  padding: 0.4rem 0.8rem;
  border: 1px solid #e0d8c8;
  border-radius: 6px;
  font-size: 0.85rem;
  color: #555;
}
.pagination a:hover { background: #f5f0e8; }
.pagination .current { background: #f5c842; color: #333; border-color: #f5c842; font-weight: bold; }

/* スレッド詳細 */
.thread-detail {
  background: #fff;
  border: 1px solid #ede8dc;
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 1rem;
}
.thread-detail h1 { font-size: 1.15rem; margin-bottom: 0.5rem; }
.thread-detail .meta { font-size: 0.82rem; color: #aaa; margin-bottom: 1rem; }
.thread-detail .body { font-size: 0.92rem; line-height: 1.7; color: #444; white-space: pre-wrap; }
.thread-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 1rem; }

/* リアクションボタン */
.reactions-bar {
  display: flex;
  gap: 0.75rem;
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid #f0ead8;
  flex-wrap: wrap;
}
.reaction-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  background: #f5f0e8;
  border: 1px solid #e0d8c8;
  border-radius: 20px;
  padding: 0.4rem 1rem;
  font-size: 0.88rem;
  cursor: pointer;
  transition: background 0.15s;
  color: #555;
}
.reaction-btn:hover { background: #ede8dc; }
.reaction-btn.liked { background: #fff3cd; border-color: #f5c842; color: #856404; }
.reaction-btn.surprised { background: #fde8e8; border-color: #f5a0a0; color: #8b2c2c; }
.reaction-btn.count { font-weight: bold; }

/* モーダル */
.modal-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  z-index: 200;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
.modal-overlay.open { display: flex; }
.modal {
  background: #fff;
  border-radius: 12px;
  padding: 1.5rem;
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  overflow-y: auto;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
}
.modal-header h2 { font-size: 1rem; }
.modal-close { cursor: pointer; color: #aaa; font-size: 1.3rem; line-height: 1; background: none; border: none; }
.form-group { margin-bottom: 0.9rem; }
.form-group label { display: block; font-size: 0.8rem; color: #666; margin-bottom: 0.3rem; }
.form-group input, .form-group textarea, .form-group select {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid #e0d8c8;
  border-radius: 6px;
  font-size: 0.9rem;
  background: #faf8f2;
  font-family: inherit;
}
.form-group textarea { resize: vertical; }
.tag-select { display: flex; flex-wrap: wrap; gap: 6px; }
.tag-check { display: none; }
.tag-check + label {
  background: #f5f0e8;
  color: #666;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 0.78rem;
  cursor: pointer;
  border: 1px solid transparent;
}
.tag-check:checked + label { background: #fff3cd; color: #856404; border-color: #f5c842; }
.btn-submit {
  background: #f5c842;
  color: #333;
  border: none;
  border-radius: 20px;
  padding: 0.6rem 2rem;
  font-size: 0.9rem;
  cursor: pointer;
  font-weight: bold;
  width: 100%;
  margin-top: 0.5rem;
}
.btn-submit:hover { background: #e8b800; }

/* パンくず */
.breadcrumb { font-size: 0.82rem; color: #aaa; margin-bottom: 0.75rem; }
.breadcrumb a { color: #888; }
.breadcrumb a:hover { color: #333; }

@media (max-width: 640px) {
  .sidebar { display: none; }
  .header { flex-wrap: wrap; }
  .logo { width: 120px; height: 40px; }
}
`;

// =============================================
// HTML部品
// =============================================

function renderHeader() {
  return `
<header class="header">
  <div class="logo"><!-- ロゴ画像 --></div>
  <div class="search-wrap">
    <span>🔍</span>
    <input type="text" placeholder="投稿を検索">
  </div>
  <button class="btn-post" onclick="openModal()">＋ 投稿する</button>
</header>`;
}

function renderSidebar(boards, tags, currentSlug = '') {
  const boardLinks = boards.map(b => `
    <a class="board-link${b.slug === currentSlug ? ' active' : ''}" href="/${escape(b.slug)}">${escape(b.name)}</a>
  `).join('');

  const tagLinks = tags.map(t => `
    <span class="tag-link" onclick="filterByTag('${escape(t.name)}')">#${escape(t.name)}</span>
  `).join('');

  return `
<aside class="sidebar">
  <div class="sidebar-box">
    <div class="sidebar-title">板一覧</div>
    <a class="board-link${!currentSlug ? ' active' : ''}" href="/">すべて</a>
    ${boardLinks}
  </div>
  <div class="sidebar-box">
    <div class="sidebar-title">タグ</div>
    <div class="tag-list">${tagLinks}</div>
  </div>
</aside>`;
}

function renderNewThreadModal(boards, tags, defaultSlug = '') {
  const boardOptions = boards.map(b =>
    `<option value="${escape(b.slug)}"${b.slug === defaultSlug ? ' selected' : ''}>${escape(b.name)}</option>`
  ).join('');

  const tagCheckboxes = tags.map(t => `
    <input class="tag-check" type="checkbox" name="tags" id="tag-${escape(t.id)}" value="${escape(t.id)}">
    <label for="tag-${escape(t.id)}">#${escape(t.name)}</label>
  `).join('');

  return `
<div class="modal-overlay" id="post-modal">
  <div class="modal">
    <div class="modal-header">
      <h2>投稿する</h2>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <form id="post-form" method="POST">
      <div class="form-group">
        <label>板を選ぶ</label>
        <select name="board" id="modal-board" onchange="updateFormAction(this.value)">
          ${boardOptions}
        </select>
      </div>
      <div class="form-group">
        <label>タイトル（必須）</label>
        <input name="title" required placeholder="例：イヤイヤ期の対応で困っています">
      </div>
      <div class="form-group">
        <label>名前</label>
        <input name="author_name" placeholder="名無しさん">
      </div>
      <div class="form-group">
        <label>本文（必須）</label>
        <textarea name="body" rows="5" required placeholder="具体的な状況や質問を書いてください"></textarea>
      </div>
      <div class="form-group">
        <label>タグ（複数選択可）</label>
        <div class="tag-select">${tagCheckboxes}</div>
      </div>
      <div class="form-group">
        <label>削除パスワード（任意）</label>
        <input name="delete_password" type="password" placeholder="後で削除したいときに使います">
      </div>
      <button class="btn-submit" type="submit">投稿する</button>
    </form>
  </div>
</div>`;
}

function renderCard(t, slug) {
  const tagsHtml = t.tag_names
    ? t.tag_names.split(',').map(tag => `<span class="tag-chip">#${escape(tag)}</span>`).join('')
    : '';

  return `
<div class="card" onclick="location.href='/${escape(slug || t.board_slug)}/${t.id}'">
  <div class="card-title">${escape(t.title)}</div>
  <div class="card-body">${escape(t.body)}</div>
  ${tagsHtml ? `<div class="card-tags">${tagsHtml}</div>` : ''}
  <div class="card-meta">
    ${t.board_name ? `<span class="card-board">${escape(t.board_name)}</span>` : ''}
    <span>${escape(t.author_name)}</span>
    <span>${timeAgo(t.created_at)}</span>
    <div class="card-reactions">
      <span class="reaction">😊 ${t.likes || 0}</span>
      <span class="reaction">😲 ${t.surprises || 0}</span>
    </div>
  </div>
</div>`;
}

function buildPagination(page, hasNext, base) {
  const parts = [];
  if (page > 1) parts.push(`<a href="${base}${base.includes('?') ? '&' : '?'}page=${page - 1}">← 前へ</a>`);
  parts.push(`<span class="current">${page}</span>`);
  if (hasNext) parts.push(`<a href="${base}${base.includes('?') ? '&' : '?'}page=${page + 1}">次へ →</a>`);
  return parts.length > 1 ? `<div class="pagination">${parts.join('')}</div>` : '';
}

const JS = `
function openModal() {
  document.getElementById('post-modal').classList.add('open');
}
function closeModal() {
  document.getElementById('post-modal').classList.remove('open');
}
function updateFormAction(slug) {
  document.getElementById('post-form').action = '/' + slug + '/new';
}
function filterByTag(tag) {
  location.href = '/?tag=' + encodeURIComponent(tag);
}
document.getElementById('post-modal')?.addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

// リアクションボタン
async function sendReaction(threadId, type) {
  const btn = document.querySelector('[data-reaction="' + type + '"]');
  const res = await fetch('/api/like', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ thread_id: threadId, type })
  });
  const data = await res.json();
  if (data.ok) {
    const countEl = document.querySelector('[data-count="' + type + '"]');
    if (countEl) countEl.textContent = data.count;
    btn.classList.toggle('liked', type === 'like' && data.action === 'added');
    btn.classList.toggle('surprised', type === 'surprise' && data.action === 'added');
  }
}
`;

function layout(title, body, extraJs = '') {
  return new Response(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escape(title)} | 保育士・子育て掲示板</title>
<style>${CSS}</style>
</head>
<body>
${renderHeader()}
${body}
<script>${JS}${extraJs}</script>
</body>
</html>`, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
}

// =============================================
// ページハンドラー
// =============================================

async function handleTop(env, url) {
  const page = parseInt(url.searchParams.get('page') || '1');
  const sort = url.searchParams.get('sort') || 'new';
  const tag = url.searchParams.get('tag') || '';
  const offset = (page - 1) * PAGE_SIZE;

  const [{ results: boards }, { results: tags }] = await Promise.all([
    env.DB.prepare('SELECT * FROM boards ORDER BY id').all(),
    env.DB.prepare('SELECT * FROM tags ORDER BY name').all(),
  ]);

  let query, binds;
  const orderBy = sort === 'popular' ? 't.likes DESC' : 't.last_replied_at DESC';

  if (tag) {
    query = `
      SELECT t.*, b.name as board_name, b.slug as board_slug,
        GROUP_CONCAT(tg.name) as tag_names
      FROM threads t
      JOIN boards b ON t.board_id = b.id
      JOIN thread_tags tt ON tt.thread_id = t.id
      JOIN tags tg2 ON tg2.id = tt.tag_id
      LEFT JOIN thread_tags tt2 ON tt2.thread_id = t.id
      LEFT JOIN tags tg ON tg.id = tt2.tag_id
      WHERE tg2.name = ?
      GROUP BY t.id
      ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
    binds = [tag, PAGE_SIZE + 1, offset];
  } else {
    query = `
      SELECT t.*, b.name as board_name, b.slug as board_slug,
        GROUP_CONCAT(tg.name) as tag_names
      FROM threads t
      JOIN boards b ON t.board_id = b.id
      LEFT JOIN thread_tags tt ON tt.thread_id = t.id
      LEFT JOIN tags tg ON tg.id = tt.tag_id
      GROUP BY t.id
      ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
    binds = [PAGE_SIZE + 1, offset];
  }

  const { results: threads } = await env.DB.prepare(query).bind(...binds).all();
  const hasNext = threads.length > PAGE_SIZE;
  const items = threads.slice(0, PAGE_SIZE);

  const baseUrl = tag ? `/?tag=${encodeURIComponent(tag)}&sort=${sort}` : `/?sort=${sort}`;
  const cards = items.map(t => renderCard(t, t.board_slug)).join('') ||
    '<p style="color:#aaa;text-align:center;padding:2rem">まだ投稿がありません</p>';

  const body = `
<div class="container">
  <main class="main">
    ${tag ? `<p style="margin-bottom:0.75rem;font-size:0.85rem">🏷 #${escape(tag)} の投稿 <a href="/" style="color:#aaa;margin-left:0.5rem">✕ 解除</a></p>` : ''}
    <div class="tabs">
      <a class="tab${sort !== 'popular' ? ' active' : ''}" href="/?sort=new${tag ? '&tag=' + encodeURIComponent(tag) : ''}">新着</a>
      <a class="tab${sort === 'popular' ? ' active' : ''}" href="/?sort=popular${tag ? '&tag=' + encodeURIComponent(tag) : ''}">人気</a>
    </div>
    ${cards}
    ${buildPagination(page, hasNext, baseUrl)}
  </main>
  ${renderSidebar(boards, tags, '')}
</div>
${renderNewThreadModal(boards, tags, boards[0]?.slug || '')}`;

  return layout('掲示板トップ', body, `updateFormAction('${escape(boards[0]?.slug || '')}');`);
}

async function handleBoard(env, url, slug) {
  const page = parseInt(url.searchParams.get('page') || '1');
  const sort = url.searchParams.get('sort') || 'new';
  const offset = (page - 1) * PAGE_SIZE;

  const [{ results: boards }, { results: tags }] = await Promise.all([
    env.DB.prepare('SELECT * FROM boards ORDER BY id').all(),
    env.DB.prepare('SELECT * FROM tags ORDER BY name').all(),
  ]);

  const board = boards.find(b => b.slug === slug);
  if (!board) return new Response('Not Found', { status: 404 });

  const orderBy = sort === 'popular' ? 't.likes DESC' : 't.last_replied_at DESC';
  const { results: threads } = await env.DB.prepare(`
    SELECT t.*, GROUP_CONCAT(tg.name) as tag_names
    FROM threads t
    LEFT JOIN thread_tags tt ON tt.thread_id = t.id
    LEFT JOIN tags tg ON tg.id = tt.tag_id
    WHERE t.board_id = ?
    GROUP BY t.id
    ORDER BY ${orderBy} LIMIT ? OFFSET ?
  `).bind(board.id, PAGE_SIZE + 1, offset).all();

  const hasNext = threads.length > PAGE_SIZE;
  const items = threads.slice(0, PAGE_SIZE);
  const baseUrl = `/${slug}?sort=${sort}`;

  const cards = items.map(t => renderCard(t, slug)).join('') ||
    '<p style="color:#aaa;text-align:center;padding:2rem">まだ投稿がありません</p>';

  const body = `
<div class="container">
  <main class="main">
    <div class="breadcrumb"><a href="/">トップ</a> &gt; ${escape(board.name)}</div>
    <div class="tabs">
      <a class="tab${sort !== 'popular' ? ' active' : ''}" href="/${slug}?sort=new">新着</a>
      <a class="tab${sort === 'popular' ? ' active' : ''}" href="/${slug}?sort=popular">人気</a>
    </div>
    ${cards}
    ${buildPagination(page, hasNext, baseUrl)}
  </main>
  ${renderSidebar(boards, tags, slug)}
</div>
${renderNewThreadModal(boards, tags, slug)}`;

  return layout(board.name, body, `updateFormAction('${escape(slug)}');`);
}

async function handleThread(env, slug, threadId) {
  const [{ results: boards }, { results: tags }] = await Promise.all([
    env.DB.prepare('SELECT * FROM boards ORDER BY id').all(),
    env.DB.prepare('SELECT * FROM tags ORDER BY name').all(),
  ]);

  const board = boards.find(b => b.slug === slug);
  if (!board) return new Response('Not Found', { status: 404 });

  const thread = await env.DB.prepare(
    'SELECT * FROM threads WHERE id = ? AND board_id = ?'
  ).bind(threadId, board.id).first();
  if (!thread) return new Response('Not Found', { status: 404 });

  const { results: threadTags } = await env.DB.prepare(`
    SELECT tg.name FROM thread_tags tt
    JOIN tags tg ON tg.id = tt.tag_id
    WHERE tt.thread_id = ?
  `).bind(threadId).all();

  const tagsHtml = threadTags.map(t => `<span class="tag-chip">#${escape(t.name)}</span>`).join('');

  const body = `
<div class="container">
  <main class="main">
    <div class="breadcrumb">
      <a href="/">トップ</a> &gt; <a href="/${escape(slug)}">${escape(board.name)}</a> &gt; ${escape(thread.title)}
    </div>
    <div class="thread-detail">
      <h1>${escape(thread.title)}</h1>
      <div class="meta">${escape(thread.author_name)} ・ ${timeAgo(thread.created_at)}</div>
      <div class="body">${escape(thread.body)}</div>
      ${tagsHtml ? `<div class="thread-tags">${tagsHtml}</div>` : ''}
      <div class="reactions-bar">
        <button class="reaction-btn" data-reaction="like" onclick="sendReaction(${thread.id}, 'like')">
          😊 <span data-count="like">${thread.likes || 0}</span>
        </button>
        <button class="reaction-btn" data-reaction="surprise" onclick="sendReaction(${thread.id}, 'surprise')">
          😲 <span data-count="surprise">${thread.surprises || 0}</span>
        </button>
      </div>
    </div>
  </main>
  ${renderSidebar(boards, tags, slug)}
</div>
${renderNewThreadModal(boards, tags, slug)}`;

  return layout(thread.title, body, `updateFormAction('${escape(slug)}');`);
}

// =============================================
// API: いいね / びっくり
// =============================================

async function handleLike(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  let body;
  try { body = await request.json(); } catch { return jsonError('invalid json'); }

  const { thread_id, type } = body;
  if (!thread_id || !['like', 'surprise'].includes(type)) {
    return jsonError('invalid params');
  }

  const column = type === 'like' ? 'likes' : 'surprises';
  const likeType = type;

  // 同一IPの重複チェック
  const existing = await env.DB.prepare(
    'SELECT id FROM likes WHERE thread_id = ? AND ip_address = ? AND type = ?'
  ).bind(thread_id, ip, likeType).first();

  let action, count;
  if (existing) {
    // 取り消し
    await env.DB.prepare('DELETE FROM likes WHERE id = ?').bind(existing.id).run();
    await env.DB.prepare(`UPDATE threads SET ${column} = MAX(0, ${column} - 1) WHERE id = ?`).bind(thread_id).run();
    action = 'removed';
  } else {
    // 追加
    await env.DB.prepare(
      'INSERT INTO likes (thread_id, ip_address, type) VALUES (?, ?, ?)'
    ).bind(thread_id, ip, likeType).run();
    await env.DB.prepare(`UPDATE threads SET ${column} = ${column} + 1 WHERE id = ?`).bind(thread_id).run();
    action = 'added';
  }

  const thread = await env.DB.prepare(`SELECT ${column} FROM threads WHERE id = ?`).bind(thread_id).first();
  count = thread?.[column] ?? 0;

  return new Response(JSON.stringify({ ok: true, action, count }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

function jsonError(msg) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' }
  });
}

// =============================================
// 投稿作成
// =============================================

async function handleNewThread(request, env, slug) {
  const board = await env.DB.prepare('SELECT * FROM boards WHERE slug = ?').bind(slug).first();
  if (!board) return new Response('Not Found', { status: 404 });

  const form = await request.formData();
  const title = (form.get('title') ?? '').trim();
  const body = (form.get('body') ?? '').trim();
  const author_name = (form.get('author_name') ?? '').trim() || '名無しさん';
  const delete_password = (form.get('delete_password') ?? '').trim() || null;
  const ip = request.headers.get('CF-Connecting-IP') ?? '';
  const tagIds = form.getAll('tags').map(Number).filter(Boolean);

  if (!title || !body) return new Response('タイトルと本文は必須です', { status: 400 });

  const result = await env.DB.prepare(
    'INSERT INTO threads (board_id, title, author_name, body, ip_address, delete_password, likes, surprises) VALUES (?, ?, ?, ?, ?, ?, 0, 0)'
  ).bind(board.id, title, author_name, body, ip, delete_password).run();

  const threadId = result.meta.last_row_id;

  // タグ紐付け
  for (const tagId of tagIds) {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO thread_tags (thread_id, tag_id) VALUES (?, ?)'
    ).bind(threadId, tagId).run();
  }

  return Response.redirect(`/${slug}/${threadId}`, 303);
}
