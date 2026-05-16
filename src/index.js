export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (path === '/' && method === 'GET') return handleTop(env, url);
    if (path.match(/^\/[a-z0-9_-]+$/) && method === 'GET') return handleBoard(env, url, path.slice(1));
    if (path.match(/^\/[a-z0-9_-]+\/\d+$/) && method === 'GET') {
      const [, slug, threadId] = path.split('/');
      return handleThread(env, slug, threadId);
    }
    if (path.match(/^\/[a-z0-9_-]+\/new$/) && method === 'POST') return handleNewThread(request, env, path.split('/')[1]);
    if (path.match(/^\/[a-z0-9_-]+\/\d+\/reply$/) && method === 'POST') {
      const [, slug, threadId] = path.split('/');
      return handleReply(request, env, slug, threadId);
    }
    return new Response('Not Found', { status: 404 });
  }
};

function escape(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr + 'Z')) / 1000);
  if (diff < 60) return 'たった今';
  if (diff < 3600) return `${Math.floor(diff/60)}分前`;
  if (diff < 86400) return `${Math.floor(diff/3600)}時間前`;
  if (diff < 86400*30) return `${Math.floor(diff/86400)}日前`;
  return `${Math.floor(diff/86400/30)}ヶ月前`;
}

const CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #faf8f2; color: #333; font-family: 'Hiragino Kaku Gothic ProN', 'メイリオ', sans-serif; }
a { color: inherit; text-decoration: none; }

/* ヘッダー */
.header { background: #faf8f2; border-bottom: 1px solid #e8e0d0; padding: 0.75rem 1.5rem; display: flex; align-items: center; gap: 1rem; position: sticky; top: 0; z-index: 100; }
.logo { font-size: 1.2rem; font-weight: bold; white-space: nowrap; }
.logo small { display: block; font-size: 0.7rem; font-weight: normal; color: #888; }
.search-bar { flex: 1; display: flex; align-items: center; background: #fff; border: 1px solid #e0d8c8; border-radius: 20px; padding: 0.4rem 1rem; gap: 0.5rem; max-width: 400px; }
.search-bar input { border: none; outline: none; width: 100%; background: transparent; font-size: 0.9rem; }
.btn-post { background: #f5c842; color: #333; border: none; border-radius: 20px; padding: 0.5rem 1.2rem; font-size: 0.9rem; cursor: pointer; white-space: nowrap; font-weight: bold; }
.btn-post:hover { background: #e8b800; }

/* レイアウト */
.container { display: flex; max-width: 1000px; margin: 0 auto; padding: 1rem; gap: 1rem; }
.main { flex: 1; min-width: 0; }
.sidebar { width: 220px; flex-shrink: 0; }

/* タブ */
.tabs { display: flex; gap: 0; margin-bottom: 1rem; border-bottom: 2px solid #e8e0d0; }
.tab { padding: 0.5rem 1.5rem; cursor: pointer; color: #888; font-size: 0.9rem; border-bottom: 2px solid transparent; margin-bottom: -2px; }
.tab.active { color: #333; border-bottom-color: #f5c842; font-weight: bold; }

/* カード */
.card { background: #fff; border: 1px solid #ede8dc; border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem; cursor: pointer; transition: box-shadow 0.2s; }
.card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
.card-title { font-size: 0.95rem; font-weight: bold; margin-bottom: 0.4rem; }
.card-body { font-size: 0.85rem; color: #555; margin-bottom: 0.5rem; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.card-meta { font-size: 0.78rem; color: #999; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.card-meta .board-tag { background: #fff3cd; color: #856404; padding: 1px 8px; border-radius: 10px; font-size: 0.75rem; }
.card-replies { margin-left: auto; color: #aaa; }

/* サイドバー */
.sidebar-box { background: #fff; border: 1px solid #ede8dc; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
.sidebar-title { font-size: 0.85rem; font-weight: bold; margin-bottom: 0.75rem; color: #666; }
.board-list a { display: block; padding: 0.4rem 0; font-size: 0.85rem; color: #555; border-bottom: 1px solid #f5f0e8; }
.board-list a:last-child { border-bottom: none; }
.board-list a:hover { color: #333; }

/* ページネーション */
.pagination { display: flex; justify-content: center; gap: 0.5rem; margin: 1.5rem 0; }
.pagination a, .pagination span { padding: 0.4rem 0.8rem; border: 1px solid #e0d8c8; border-radius: 4px; font-size: 0.85rem; color: #555; }
.pagination a:hover { background: #f5f0e8; }
.pagination .current { background: #f5c842; color: #333; border-color: #f5c842; font-weight: bold; }

/* スレッド詳細 */
.thread-header { background: #fff; border: 1px solid #ede8dc; border-radius: 8px; padding: 1.25rem; margin-bottom: 1rem; }
.post-item { background: #fff; border: 1px solid #ede8dc; border-radius: 8px; padding: 1rem; margin-bottom: 0.5rem; }
.post-num { font-size: 0.78rem; color: #aaa; margin-bottom: 0.25rem; }
.post-body { font-size: 0.9rem; line-height: 1.6; color: #444; }
.post-deleted { font-size: 0.85rem; color: #bbb; font-style: italic; }
.reply-form { background: #fff; border: 1px solid #ede8dc; border-radius: 8px; padding: 1.25rem; margin-top: 1rem; }
.reply-form h2 { font-size: 1rem; margin-bottom: 1rem; }
.form-group { margin-bottom: 0.75rem; }
.form-group label { display: block; font-size: 0.8rem; color: #666; margin-bottom: 0.25rem; }
.form-group input, .form-group textarea { width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #e0d8c8; border-radius: 6px; font-size: 0.9rem; background: #faf8f2; }
.form-group textarea { resize: vertical; }
.btn-submit { background: #f5c842; color: #333; border: none; border-radius: 20px; padding: 0.6rem 2rem; font-size: 0.9rem; cursor: pointer; font-weight: bold; }
.btn-submit:hover { background: #e8b800; }

/* モーダル */
.modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4); z-index: 200; align-items: center; justify-content: center; }
.modal-overlay.open { display: flex; }
.modal { background: #fff; border-radius: 12px; padding: 1.5rem; width: 90%; max-width: 500px; }
.modal h2 { font-size: 1rem; margin-bottom: 1rem; }
.modal-close { float: right; cursor: pointer; color: #aaa; font-size: 1.2rem; line-height: 1; }

@media (max-width: 600px) {
  .sidebar { display: none; }
  .header { flex-wrap: wrap; }
}
`;

function pageHeader(boards = []) {
  const boardLinks = boards.map(b => `<a href="/${escape(b.slug)}">${escape(b.name)}</a>`).join('');
  return `
<header class="header">
  <div class="logo">掲示板<small>みんなの広場</small></div>
  <div class="search-bar">
    <span>🔍</span>
    <input type="text" placeholder="投稿を検索">
  </div>
  <button class="btn-post" onclick="document.getElementById('new-thread-modal').classList.add('open')">＋ 投稿する</button>
</header>`;
}

function sidebar(boards = []) {
  const links = boards.map(b => `<a href="/${escape(b.slug)}">${escape(b.name)}（${b.slug}）</a>`).join('');
  return `
<aside class="sidebar">
  <div class="sidebar-box">
    <div class="sidebar-title">板一覧</div>
    <div class="board-list"><a href="/">すべて</a>${links}</div>
  </div>
</aside>`;
}

function newThreadModal(slug) {
  return `
<div class="modal-overlay" id="new-thread-modal">
  <div class="modal">
    <span class="modal-close" onclick="document.getElementById('new-thread-modal').classList.remove('open')">✕</span>
    <h2>新しいスレッドを立てる</h2>
    <form method="POST" action="/${escape(slug)}/new">
      <div class="form-group"><label>タイトル（必須）</label><input name="title" required></div>
      <div class="form-group"><label>名前</label><input name="author_name" placeholder="名無しさん"></div>
      <div class="form-group"><label>本文（必須）</label><textarea name="body" rows="5" required></textarea></div>
      <div class="form-group"><label>削除パスワード（任意）</label><input name="delete_password" type="password"></div>
      <button class="btn-submit" type="submit">投稿する</button>
    </form>
  </div>
</div>`;
}

function layout(title, body, boards = [], slug = 'general') {
  return new Response(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escape(title)}</title>
<style>${CSS}</style>
</head>
<body>
${pageHeader(boards)}
${newThreadModal(slug)}
${body}
</body>
</html>`, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
}

const PAGE_SIZE = 20;

// トップ: 全スレッド一覧
async function handleTop(env, url) {
  const page = parseInt(url.searchParams.get('page') || '1');
  const offset = (page - 1) * PAGE_SIZE;
  const { results: boards } = await env.DB.prepare('SELECT * FROM boards ORDER BY id').all();
  const { results: threads } = await env.DB.prepare(
    'SELECT t.*, b.name as board_name, b.slug as board_slug FROM threads t JOIN boards b ON t.board_id = b.id ORDER BY t.last_replied_at DESC LIMIT ? OFFSET ?'
  ).bind(PAGE_SIZE + 1, offset).all();
  const hasNext = threads.length > PAGE_SIZE;
  const items = threads.slice(0, PAGE_SIZE);

  const cards = items.map(t => `
    <div class="card" onclick="location.href='/${escape(t.board_slug)}/${t.id}'">
      <div class="card-title">${escape(t.title)}</div>
      <div class="card-body">${escape(t.body)}</div>
      <div class="card-meta">
        <span class="board-tag">${escape(t.board_name)}</span>
        <span>${escape(t.author_name)}</span>
        <span>${timeAgo(t.created_at)}</span>
        <span class="card-replies">返信 ${t.reply_count || 0}件</span>
      </div>
    </div>`).join('');

  const pagination = buildPagination(page, hasNext, '/');

  const body = `
<div class="container">
  <main class="main">
    <div class="tabs">
      <div class="tab active">新着</div>
    </div>
    ${cards || '<p style="color:#aaa;text-align:center;padding:2rem">まだ投稿がありません</p>'}
    ${pagination}
  </main>
  ${sidebar(boards)}
</div>`;

  return layout('掲示板', body, boards, boards[0]?.slug || 'general');
}

// 板: スレッド一覧
async function handleBoard(env, url, slug) {
  const page = parseInt(url.searchParams.get('page') || '1');
  const offset = (page - 1) * PAGE_SIZE;
  const { results: boards } = await env.DB.prepare('SELECT * FROM boards ORDER BY id').all();
  const board = boards.find(b => b.slug === slug);
  if (!board) return new Response('Not Found', { status: 404 });

  const { results: threads } = await env.DB.prepare(
    'SELECT * FROM threads WHERE board_id = ? ORDER BY last_replied_at DESC LIMIT ? OFFSET ?'
  ).bind(board.id, PAGE_SIZE + 1, offset).all();
  const hasNext = threads.length > PAGE_SIZE;
  const items = threads.slice(0, PAGE_SIZE);

  const cards = items.map(t => `
    <div class="card" onclick="location.href='/${escape(slug)}/${t.id}'">
      <div class="card-title">${escape(t.title)}</div>
      <div class="card-body">${escape(t.body)}</div>
      <div class="card-meta">
        <span>${escape(t.author_name)}</span>
        <span>${timeAgo(t.created_at)}</span>
      </div>
    </div>`).join('');

  const pagination = buildPagination(page, hasNext, `/${slug}`);

  const body = `
<div class="container">
  <main class="main">
    <div class="tabs">
      <div class="tab active">${escape(board.name)}</div>
    </div>
    ${cards || '<p style="color:#aaa;text-align:center;padding:2rem">まだ投稿がありません</p>'}
    ${pagination}
  </main>
  ${sidebar(boards)}
</div>`;

  return layout(board.name, body, boards, slug);
}

// スレッド詳細
async function handleThread(env, slug, threadId) {
  const { results: boards } = await env.DB.prepare('SELECT * FROM boards ORDER BY id').all();
  const board = boards.find(b => b.slug === slug);
  if (!board) return new Response('Not Found', { status: 404 });

  const thread = await env.DB.prepare('SELECT * FROM threads WHERE id = ? AND board_id = ?').bind(threadId, board.id).first();
  if (!thread) return new Response('Not Found', { status: 404 });

  const { results: posts } = await env.DB.prepare(
    'SELECT * FROM posts WHERE thread_id = ? ORDER BY created_at ASC'
  ).bind(threadId).all();

  const postItems = posts.map((p, i) => `
    <div class="post-item">
      <div class="post-num">${i + 1}. ${escape(p.author_name)} ・ ${timeAgo(p.created_at)}</div>
      ${p.is_deleted
        ? '<div class="post-deleted">この投稿は削除されました</div>'
        : `<div class="post-body">${escape(p.body)}</div>`}
    </div>`).join('');

  const body = `
<div class="container">
  <main class="main">
    <p style="margin-bottom:0.75rem;font-size:0.85rem"><a href="/">トップ</a> &gt; <a href="/${escape(slug)}">${escape(board.name)}</a></p>
    <div class="thread-header">
      <h1 style="font-size:1.1rem;margin-bottom:0.5rem">${escape(thread.title)}</h1>
      <div style="font-size:0.85rem;color:#888;margin-bottom:0.75rem">${escape(thread.author_name)} ・ ${timeAgo(thread.created_at)}</div>
      <div style="font-size:0.9rem;line-height:1.6">${escape(thread.body)}</div>
    </div>
    <div style="font-size:0.85rem;color:#888;margin-bottom:0.5rem">返信 ${posts.length}件</div>
    ${postItems || '<p style="color:#aaa;text-align:center;padding:1rem">まだ返信がありません</p>'}
    <div class="reply-form">
      <h2>返信する</h2>
      <form method="POST" action="/${escape(slug)}/${threadId}/reply">
        <div class="form-group"><label>名前</label><input name="author_name" placeholder="名無しさん"></div>
        <div class="form-group"><label>本文（必須）</label><textarea name="body" rows="4" required></textarea></div>
        <div class="form-group"><label>削除パスワード（任意）</label><input name="delete_password" type="password"></div>
        <button class="btn-submit" type="submit">返信する</button>
      </form>
    </div>
  </main>
  ${sidebar(boards)}
</div>`;

  return layout(thread.title, body, boards, slug);
}

function buildPagination(page, hasNext, base) {
  const parts = [];
  if (page > 1) parts.push(`<a href="${base}?page=${page - 1}">← 前へ</a>`);
  parts.push(`<span class="current">${page}</span>`);
  if (hasNext) parts.push(`<a href="${base}?page=${page + 1}">次へ →</a>`);
  return parts.length > 1 ? `<div class="pagination">${parts.join('')}</div>` : '';
}

async function handleNewThread(request, env, slug) {
  const board = await env.DB.prepare('SELECT * FROM boards WHERE slug = ?').bind(slug).first();
  if (!board) return new Response('Not Found', { status: 404 });
  const form = await request.formData();
  const title = (form.get('title') ?? '').trim();
  const body = (form.get('body') ?? '').trim();
  const author_name = (form.get('author_name') ?? '').trim() || '名無しさん';
  const delete_password = (form.get('delete_password') ?? '').trim() || null;
  const ip = request.headers.get('CF-Connecting-IP') ?? '';
  if (!title || !body) return new Response('タイトルと本文は必須です', { status: 400 });
  const result = await env.DB.prepare(
    'INSERT INTO threads (board_id, title, author_name, body, ip_address, delete_password) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(board.id, title, author_name, body, ip, delete_password).run();
  return Response.redirect(`/${slug}/${result.meta.last_row_id}`, 303);
}

async function handleReply(request, env, slug, threadId) {
  const board = await env.DB.prepare('SELECT * FROM boards WHERE slug = ?').bind(slug).first();
  if (!board) return new Response('Not Found', { status: 404 });
  const form = await request.formData();
  const body = (form.get('body') ?? '').trim();
  const author_name = (form.get('author_name') ?? '').trim() || '名無しさん';
  const delete_password = (form.get('delete_password') ?? '').trim() || null;
  const ip = request.headers.get('CF-Connecting-IP') ?? '';
  if (!body) return new Response('本文は必須です', { status: 400 });
  await env.DB.prepare(
    'INSERT INTO posts (thread_id, author_name, body, ip_address, delete_password) VALUES (?, ?, ?, ?, ?)'
  ).bind(threadId, author_name, body, ip, delete_password).run();
  await env.DB.prepare('UPDATE threads SET last_replied_at = CURRENT_TIMESTAMP WHERE id = ?').bind(threadId).run();
  return Response.redirect(`/${slug}/${threadId}`, 303);
}