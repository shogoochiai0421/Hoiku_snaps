export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // ルーティングa
    if (path === '/' && method === 'GET') {
      return handleTop(env);
    }
    if (path.match(/^\/[a-z0-9_-]+$/) && method === 'GET') {
      const slug = path.slice(1);
      return handleBoard(env, slug);
    }
    if (path.match(/^\/[a-z0-9_-]+\/\d+$/) && method === 'GET') {
      const [, slug, threadId] = path.split('/');
      return handleThread(env, slug, threadId);
    }
    if (path.match(/^\/[a-z0-9_-]+\/new$/) && method === 'POST') {
      const slug = path.split('/')[1];
      return handleNewThread(request, env, slug);
    }
    if (path.match(/^\/[a-z0-9_-]+\/\d+\/reply$/) && method === 'POST') {
      const [, slug, threadId] = path.split('/');
      return handleReply(request, env, slug, threadId);
    }

    return new Response('Not Found', { status: 404 });
  }
};

// HTMLのヘッダー・フッター
function layout(title, body) {
  return new Response(`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 1rem; }
    a { color: #0066cc; }
    .post { border: 1px solid #ddd; padding: 0.75rem; margin: 0.5rem 0; border-radius: 4px; }
    .post-meta { color: #888; font-size: 0.85rem; margin-bottom: 0.25rem; }
    form { margin: 1rem 0; }
    input, textarea { width: 100%; box-sizing: border-box; padding: 0.5rem; margin: 0.25rem 0; }
    button { padding: 0.5rem 1.5rem; background: #0066cc; color: white; border: none; border-radius: 4px; cursor: pointer; }
    .deleted { color: #aaa; font-style: italic; }
  </style>
</head>
<body>
<p><a href="/">トップあああ</a></p>
${body}
</body>
</html>`, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
}

function escape(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// トップ: 板一覧
async function handleTop(env) {
  const { results } = await env.DB.prepare('SELECT * FROM boards ORDER BY id').all();
  const items = results.map(b => `
    <div class="post">
      <a href="/${escape(b.slug)}"><strong>${escape(b.name)}</strong></a>
      <p>${escape(b.description ?? '')}</p>
    </div>`).join('');
  return layout('掲示板トップ', `<h1>掲示板テsssトs</h1>${items}`);
}

// 板: スレッド一覧
async function handleBoard(env, slug) {
  const board = await env.DB.prepare('SELECT * FROM boards WHERE slug = ?').bind(slug).first();
  if (!board) return new Response('Not Found', { status: 404 });

  const { results } = await env.DB.prepare(
    'SELECT * FROM threads WHERE board_id = ? ORDER BY last_replied_at DESC'
  ).bind(board.id).all();

  const items = results.map(t => `
    <div class="post">
      <a href="/${escape(slug)}/${t.id}">${escape(t.title)}</a>
      <div class="post-meta">${escape(t.author_name)} ・ ${t.created_at}</div>
    </div>`).join('');

  const form = `
    <h2>スレッドを立てる</h2>
    <form method="POST" action="/${escape(slug)}/new">
      <input name="title" placeholder="タイトル（必須）" required>
      <input name="author_name" placeholder="名前（省略で名無しさん）">
      <textarea name="body" rows="4" placeholder="本文（必須）" required></textarea>
      <input name="delete_password" placeholder="削除パスワード（任意）" type="password">
      <button type="submit">投稿する</button>
    </form>`;

  return layout(board.name, `<h1>${escape(board.name)}</h1>${form}<h2>スレッド一覧</h2>${items || '<p>まだスレッドがありません</p>'}`);
}

// スレッド詳細
async function handleThread(env, slug, threadId) {
  const board = await env.DB.prepare('SELECT * FROM boards WHERE slug = ?').bind(slug).first();
  if (!board) return new Response('Not Found', { status: 404 });

  const thread = await env.DB.prepare('SELECT * FROM threads WHERE id = ? AND board_id = ?').bind(threadId, board.id).first();
  if (!thread) return new Response('Not Found', { status: 404 });

  const { results: posts } = await env.DB.prepare(
    'SELECT * FROM posts WHERE thread_id = ? ORDER BY created_at ASC'
  ).bind(threadId).all();

  const postItems = posts.map((p, i) => `
    <div class="post">
      <div class="post-meta">${i + 1}. ${escape(p.author_name)} ・ ${p.created_at}</div>
      ${p.is_deleted ? '<span class="deleted">この投稿は削除されました</span>' : `<p>${escape(p.body)}</p>`}
    </div>`).join('');

  const form = `
    <h2>返信する</h2>
    <form method="POST" action="/${escape(slug)}/${threadId}/reply">
      <input name="author_name" placeholder="名前ああｓああ（省略で名無しさん）">
      <textarea name="body" rows="4" placeholder="本文あああああああ（必須）" required></textarea>
      <input name="delete_password" placeholder="削除パスワード（任意）" type="password">
      <button type="submit">返信する</button>
    </form>`;

  return layout(thread.title, `
    <h1>${escape(thread.title)}</h1>
    <div class="post">
      <div class="post-meta">${escape(thread.author_name)} ・ ${thread.created_at}</div>
      <p>${escape(thread.body)}</p>
    </div>
    <h2>返信 (${posts.length}件)</h2>
    ${postItems || '<p>まだ返信がありません</p>'}
    ${form}`);
}

// スレッド新規作成
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

// 返信投稿
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

  await env.DB.prepare(
    'UPDATE threads SET last_replied_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(threadId).run();

  return Response.redirect(`/${slug}/${threadId}`, 303);
}