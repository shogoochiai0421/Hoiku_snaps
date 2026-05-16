// =============================================
// 保育士・子育て向け掲示板 - Cloudflare Worker
// =============================================

const ADMIN_PASSWORD = 'admin1234'; // ← 必ず変更してください

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      // 管理者ルート
      if (path === '/admin' || path === '/admin/') return adminLogin(request, env);
      if (path === '/admin/login' && method === 'POST') return adminDoLogin(request, env);
      if (path === '/admin/logout') return adminLogout(request, env);
      if (path === '/admin/tags' && method === 'GET') return adminTags(request, env);
      if (path === '/admin/tags' && method === 'POST') return adminAddTag(request, env);
      if (path.match(/^\/admin\/tags\/\d+\/delete$/) && method === 'POST') {
        return adminDeleteTag(request, env, path.split('/')[3]);
      }
      if (path.match(/^\/admin\/tags\/\d+\/keywords$/) && method === 'GET') {
        return adminKeywords(request, env, path.split('/')[3]);
      }
      if (path.match(/^\/admin\/tags\/\d+\/keywords$/) && method === 'POST') {
        return adminAddKeyword(request, env, path.split('/')[3]);
      }
      if (path.match(/^\/admin\/keywords\/\d+\/delete$/) && method === 'POST') {
        return adminDeleteKeyword(request, env, path.split('/')[3]);
      }

      // 一般ルート
      if (path === '/' && method === 'GET') return handleTop(env, url);
      if (path === '/post' && method === 'GET') return handlePostPage(env, url);
      if (path === '/new' && method === 'POST') return handleNewThread(request, env);
      if (path.match(/^\/\d+$/) && method === 'GET') return handleThread(env, url, path.slice(1));
      if (path === '/api/like' && method === 'POST') return handleLike(request, env);
      if (path === '/api/suggest-tags' && method === 'POST') return handleSuggestTags(request, env);

      return new Response('Not Found', { status: 404 });
    } catch (e) {
      console.error(e);
      return new Response('Internal Server Error: ' + e.message, { status: 500 });
    }
  }
};

// =============================================
// ユーティリティ
// =============================================

function esc(str) {
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

function html(title, body, head = '') {
  return new Response(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+Antique:wght@400;700&display=swap" rel="stylesheet">
${head}
<style>${CSS}</style>
</head>
<body>
${body}
</body>
</html>`, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
}

async function getAdminSession(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/admin_session=([^;]+)/);
  if (!match) return null;
  const session = await env.DB.prepare('SELECT * FROM admin_sessions WHERE id = ?').bind(match[1]).first();
  return session;
}

function setCookie(name, value, maxAge = 86400) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
}

const PAGE_SIZE = 20;

// =============================================
// CSS
// =============================================

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:#faf8f2;color:#333;font-family:'Zen Kaku Gothic Antique','Hiragino Kaku Gothic ProN','メイリオ',sans-serif;min-height:100vh}
a{color:inherit;text-decoration:none}

.header{background:#faf8f2;border-bottom:1px solid #e8e0d0;padding:.6rem 1.5rem;display:flex;align-items:center;gap:.75rem;position:sticky;top:0;z-index:100}
.logo{width:160px;height:44px;flex-shrink:0;background:#f0ead8;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#bbb;font-size:.72rem}
.search-wrap{flex:1;display:flex;align-items:center;background:#fff;border:1px solid #e0d8c8;border-radius:20px;padding:.35rem .9rem;gap:.4rem;max-width:480px;margin:0 auto}
.search-wrap input{border:none;outline:none;width:100%;background:transparent;font-size:.88rem}
.search-btn{border:none;background:#f5c842;color:#333;border-radius:12px;padding:.2rem .7rem;font-size:.78rem;cursor:pointer;white-space:nowrap;font-weight:700;flex-shrink:0}
.btn-post{background:#f5c842;color:#333;border:none;border-radius:20px;padding:.45rem 1.1rem;font-size:.88rem;cursor:pointer;white-space:nowrap;font-weight:700;margin-left:auto}
.btn-post:hover{background:#e8b800}

.container{display:flex;max-width:1000px;margin:0 auto;padding:1rem;gap:1rem;align-items:flex-start}
.main{flex:1;min-width:0}
.sidebar{width:210px;flex-shrink:0;position:sticky;top:68px}

.tabs{display:flex;border-bottom:2px solid #e8e0d0;margin-bottom:1rem}
.tab{padding:.45rem 1.25rem;cursor:pointer;color:#888;font-size:.88rem;border-bottom:2px solid transparent;margin-bottom:-2px;display:block}
.tab.active{color:#333;border-bottom-color:#f5c842;font-weight:700}
.tab:hover{color:#555}

.card{background:#fff;border:1px solid #ede8dc;border-radius:8px;padding:1rem;margin-bottom:.65rem;cursor:pointer;transition:box-shadow .15s}
.card:hover{box-shadow:0 2px 8px rgba(0,0,0,.08)}
.card-body{font-size:.88rem;color:#444;line-height:1.6;margin-bottom:.6rem;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-wrap}
.card-attrs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:.5rem}
.attr-chip{background:#f0ead8;color:#6b5a3e;padding:2px 8px;border-radius:10px;font-size:.72rem}
.card-tags{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:.5rem}
.tag-chip{background:#fff3cd;color:#856404;padding:2px 8px;border-radius:10px;font-size:.72rem}
.card-meta{font-size:.75rem;color:#bbb;display:flex;align-items:center;gap:.6rem}
.card-reactions{margin-left:auto;display:flex;gap:.5rem}
.reaction{display:flex;align-items:center;gap:3px;font-size:.75rem;color:#bbb}

.sidebar-box{background:#fff;border:1px solid #ede8dc;border-radius:8px;padding:.9rem;margin-bottom:.9rem}
.sidebar-title{font-size:.78rem;font-weight:700;color:#999;margin-bottom:.65rem;letter-spacing:.05em}
.tag-list{display:flex;flex-wrap:wrap;gap:5px}
.tag-link{background:#f5f0e8;color:#666;padding:3px 9px;border-radius:12px;font-size:.75rem;cursor:pointer;text-decoration:none;display:inline-block}
.tag-link:hover{background:#ede8dc}
.tag-selected{background:#f5c842!important;color:#333!important;font-weight:700}

.pagination{display:flex;justify-content:center;gap:.5rem;margin:1.25rem 0}
.pagination a,.pagination span{padding:.35rem .75rem;border:1px solid #e0d8c8;border-radius:6px;font-size:.82rem;color:#555}
.pagination a:hover{background:#f5f0e8}
.pagination .current{background:#f5c842;color:#333;border-color:#f5c842;font-weight:700}

.thread-detail{background:#fff;border:1px solid #ede8dc;border-radius:8px;padding:1.25rem;margin-bottom:.9rem}
.thread-body{font-size:.92rem;line-height:1.75;color:#333;white-space:pre-wrap;margin-bottom:1rem}
.thread-attrs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:.75rem}
.thread-tags{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:.75rem}
.reactions-bar{display:flex;gap:.65rem;padding-top:.9rem;border-top:1px solid #f0ead8;flex-wrap:wrap}
.reaction-btn{display:flex;align-items:center;gap:5px;background:#f5f0e8;border:1px solid #e0d8c8;border-radius:20px;padding:.35rem .9rem;font-size:.88rem;cursor:pointer;color:#555;transition:background .15s}
.reaction-btn:hover{background:#ede8dc}
.reaction-btn.active-like{background:#fff3cd;border-color:#f5c842;color:#856404}
.reaction-btn.active-surprise{background:#fde8e8;border-color:#f5a0a0;color:#8b2c2c}

.breadcrumb{font-size:.78rem;color:#bbb;margin-bottom:.65rem}
.breadcrumb a{color:#aaa}

.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;align-items:flex-start;justify-content:center;padding:1rem;overflow-y:auto}
.modal-overlay.open{display:flex}
.modal{background:#fff;border-radius:12px;padding:1.25rem;width:100%;max-width:560px;margin:auto}
.modal-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem}
.modal-header h2{font-size:.95rem}
.modal-close{cursor:pointer;color:#aaa;font-size:1.2rem;background:none;border:none;line-height:1}

.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:.6rem}
.form-group{margin-bottom:.7rem}
.form-group.full{grid-column:1/-1}
.form-group label{display:block;font-size:.75rem;color:#777;margin-bottom:.25rem}
.form-group input,.form-group textarea,.form-group select{width:100%;padding:.45rem .65rem;border:1px solid #e0d8c8;border-radius:6px;font-size:.88rem;background:#faf8f2;font-family:inherit}
.form-group textarea{resize:vertical}

.tag-search-bar{display:flex;align-items:center;background:#f5f0e8;border:1px solid #e0d8c8;border-radius:8px;padding:.35rem .65rem;gap:.4rem;margin-bottom:.5rem}
.tag-search-bar input{border:none;outline:none;background:transparent;font-size:.85rem;width:100%}
.attached-tags{display:flex;flex-wrap:wrap;gap:5px;min-height:24px;margin-bottom:.5rem}
.attached-tag{background:#f5c842;color:#333;padding:2px 8px;border-radius:10px;font-size:.75rem;cursor:pointer;display:flex;align-items:center;gap:3px}
.attached-tag:hover{background:#e8b800}
.tag-candidates{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:.35rem}
.tag-candidate{background:#f5f0e8;color:#666;padding:2px 9px;border-radius:10px;font-size:.75rem;cursor:pointer;border:1px solid #e0d8c8}
.tag-candidate:hover{background:#fff3cd;border-color:#f5c842}
.suggest-label{font-size:.72rem;color:#aaa;margin-bottom:.3rem}

.btn-submit{background:#f5c842;color:#333;border:none;border-radius:20px;padding:.55rem 2rem;font-size:.88rem;cursor:pointer;font-weight:700;width:100%;margin-top:.4rem}
.btn-submit:hover{background:#e8b800}

/* 管理画面 */
.admin-wrap{max-width:800px;margin:2rem auto;padding:1rem}
.admin-wrap h1{font-size:1.2rem;margin-bottom:1.5rem;padding-bottom:.5rem;border-bottom:2px solid #f5c842}
.admin-wrap h2{font-size:1rem;margin-bottom:1rem;color:#555}
.admin-table{width:100%;border-collapse:collapse;margin-bottom:1.5rem;font-size:.88rem}
.admin-table th{background:#f5f0e8;padding:.5rem .75rem;text-align:left;border:1px solid #e8e0d0}
.admin-table td{padding:.5rem .75rem;border:1px solid #e8e0d0;vertical-align:middle}
.btn-sm{padding:.25rem .75rem;border-radius:4px;font-size:.78rem;cursor:pointer;border:none}
.btn-danger{background:#fee2e2;color:#b91c1c}
.btn-danger:hover{background:#fecaca}
.btn-primary{background:#f5c842;color:#333}
.btn-primary:hover{background:#e8b800}
.admin-form{display:flex;gap:.5rem;margin-bottom:1rem}
.admin-form input{flex:1;padding:.4rem .65rem;border:1px solid #e0d8c8;border-radius:6px;font-size:.88rem}
.admin-login{max-width:360px;margin:4rem auto;background:#fff;border:1px solid #ede8dc;border-radius:12px;padding:2rem}
.admin-login h1{font-size:1rem;margin-bottom:1.25rem;text-align:center}
.back-link{display:inline-block;margin-bottom:1rem;font-size:.82rem;color:#888}
.back-link:hover{color:#333}

@media(max-width:640px){.sidebar{display:none}.header{flex-wrap:wrap}.form-grid{grid-template-columns:1fr}}
`;

// =============================================
// 投稿フォーム モーダル
// =============================================

function renderPostModal(tags) {
  const tagOptions = tags.map(t =>
    `<option value="${t.id}">${esc(t.name)}</option>`
  ).join('');

  return `
<div class="modal-overlay" id="post-modal">
  <div class="modal">
    <div class="modal-header">
      <h2>投稿する</h2>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <form id="post-form" method="POST" action="/new">
      <div class="form-group full">
        <label>本文（必須）</label>
        <textarea name="body" id="post-body" rows="5" required placeholder="相談・経験談などを自由に書いてください" oninput="onBodyInput(this.value)"></textarea>
      </div>
      <div class="form-grid">
        <div class="form-group">
          <label>場所</label>
          <select name="place">
            <option value="">選択しない</option>
            <option>保育園</option>
            <option>幼稚園</option>
            <option>認定こども園</option>
            <option>小学校</option>
            <option>学童保育</option>
            <option>放課後児童支援</option>
            <option>家庭</option>
            <option>その他</option>
          </select>
        </div>
        <div class="form-group">
          <label>子どもの年齢</label>
          <select name="child_age">
            <option value="">選択しない</option>
            <option>0歳</option>
            <option>1歳</option>
            <option>2歳</option>
            <option>3歳</option>
            <option>4歳</option>
            <option>5歳</option>
            <option>6歳以上</option>
          </select>
        </div>
        <div class="form-group">
          <label>投稿者の年代</label>
          <select name="poster_age">
            <option value="">選択しない</option>
            <option>10代</option>
            <option>20代</option>
            <option>30代</option>
            <option>40代</option>
            <option>50代以上</option>
          </select>
        </div>
        <div class="form-group">
          <label>性別</label>
          <select name="poster_gender">
            <option value="">選択しない</option>
            <option>男性</option>
            <option>女性</option>
            <option>その他</option>
          </select>
        </div>
        <div class="form-group full">
          <label>立場</label>
          <select name="poster_role">
            <option value="">選択しない</option>
            <option>保育士</option>
            <option>幼稚園教諭</option>
            <option>保育補助</option>
            <option>学童支援員</option>
            <option>保護者</option>
            <option>学生</option>
            <option>その他</option>
          </select>
        </div>
      </div>

      <div class="form-group full">
        <label>タグ</label>
        <div class="tag-search-bar">
          <span>🏷</span>
          <input type="text" id="tag-search" placeholder="タグを検索..." oninput="searchTags(this.value)">
        </div>
        <div class="attached-tags" id="attached-tags"></div>
        <div id="suggest-area" style="display:none">
          <div class="suggest-label">📌 おすすめタグ</div>
          <div class="tag-candidates" id="suggest-tags"></div>
        </div>
        <div class="tag-candidates" id="tag-candidates"></div>
        <input type="hidden" name="tag_ids" id="tag-ids-input">
      </div>

      <div class="form-group full">
        <label>削除パスワード（任意）</label>
        <input name="delete_password" type="password" placeholder="後で削除したいときに使います">
      </div>
      <button class="btn-submit" type="submit">投稿する</button>
    </form>
  </div>
</div>`;
}

// =============================================
// 共通ヘッダー
// =============================================

function renderHeader(searchQuery = '') {
  return `
<header class="header">
  <div class="logo"><!-- ロゴ画像 --></div>
  <form class="search-wrap" action="/" method="GET">
    <span>🔍</span>
    <input type="text" name="q" placeholder="本文・タグを検索" value="${esc(searchQuery)}" id="search-input">
    <button type="submit" class="search-btn">検索</button>
  </form>
  <a class="btn-post" href="/post">＋ 投稿する</a>
</header>`;
}

// =============================================
// サイドバー
// =============================================

function renderSidebar(tags, selectedTags = []) {
  const selectedNames = selectedTags.map(t => t.name);
  const tagLinks = tags.map(t => {
    const isSelected = selectedNames.includes(t.name);
    let newSelected;
    if (isSelected) {
      newSelected = selectedNames.filter(n => n !== t.name);
    } else {
      newSelected = [...selectedNames, t.name];
    }
    const href = newSelected.length > 0
      ? '/?tags=' + encodeURIComponent(newSelected.join(','))
      : '/';
    return `<a class="tag-link${isSelected ? ' tag-selected' : ''}" href="${href}">#${esc(t.name)}</a>`;
  }).join('');

  const clearLink = selectedNames.length > 0
    ? `<a href="/" style="font-size:.72rem;color:#aaa;display:block;margin-bottom:.5rem">✕ タグ選択を解除</a>`
    : '';

  return `
<aside class="sidebar">
  <div class="sidebar-box">
    <div class="sidebar-title">タグ一覧（複数選択可）</div>
    ${clearLink}
    <div class="tag-list">${tagLinks}</div>
  </div>
</aside>`;
}

// =============================================
// カード
// =============================================

function renderCard(t) {
  const tagChips = t.tag_names
    ? t.tag_names.split(',').map(n => `<span class="tag-chip">#${esc(n)}</span>`).join('')
    : '';
  const attrList = [t.place, t.child_age, t.poster_age, t.poster_gender, t.poster_role]
    .filter(Boolean).join(' ');
  return `
<div class="card" onclick="location.href='/${t.id}'">
  <div class="card-body">${esc(t.body)}</div>
  ${tagChips ? `<div class="card-tags">${tagChips}</div>` : ''}
  <div class="card-meta">
    <span>${timeAgo(t.created_at)}</span>
    <div class="card-reactions">
      <span class="reaction">😊 ${t.likes || 0}</span>
      <span class="reaction">😲 ${t.surprises || 0}</span>
      ${attrList ? `<span class="reaction" style="color:#bbb;margin-left:.25rem">${esc(attrList)}</span>` : ''}
    </div>
  </div>
</div>`;
}

// =============================================
// ページネーション
// =============================================

function pagination(page, hasNext, base) {
  const sep = base.includes('?') ? '&' : '?';
  const parts = [];
  if (page > 1) parts.push(`<a href="${base}${sep}page=${page - 1}">← 前へ</a>`);
  parts.push(`<span class="current">${page}</span>`);
  if (hasNext) parts.push(`<a href="${base}${sep}page=${page + 1}">次へ →</a>`);
  return parts.length > 1 ? `<div class="pagination">${parts.join('')}</div>` : '';
}

// =============================================
// JavaScript（クライアント側）
// =============================================

function clientJS(allTags) {
  return `
<script>
const ALL_TAGS = ${JSON.stringify(allTags)};
let attachedIds = new Set();

function openModal(){ document.getElementById('post-modal').classList.add('open'); }
function closeModal(){ document.getElementById('post-modal').classList.remove('open'); }
document.getElementById('post-modal')?.addEventListener('click', e => { if(e.target.id==='post-modal') closeModal(); });

function renderAttached(){
  const el = document.getElementById('attached-tags');
  el.innerHTML = [...attachedIds].map(id => {
    const t = ALL_TAGS.find(x=>x.id===id);
    return t ? \`<span class="attached-tag" onclick="removeTag(\${id})">#\${t.name} ✕</span>\` : '';
  }).join('');
  document.getElementById('tag-ids-input').value = [...attachedIds].join(',');
}

function addTag(id){
  attachedIds.add(id);
  renderAttached();
  searchTags(document.getElementById('tag-search').value);
}

function removeTag(id){
  attachedIds.delete(id);
  renderAttached();
  searchTags(document.getElementById('tag-search').value);
}

function searchTags(q){
  const filtered = ALL_TAGS.filter(t => !attachedIds.has(t.id) && (q===''||t.name.includes(q)));
  const el = document.getElementById('tag-candidates');
  el.innerHTML = filtered.slice(0,20).map(t =>
    \`<span class="tag-candidate" onclick="addTag(\${t.id})">#\${t.name}</span>\`
  ).join('');
}

searchTags('');

let suggestTimer;
async function onBodyInput(text){
  const cc = document.getElementById('char-count');
  if(cc) cc.textContent = text.length + '/250字';
  clearTimeout(suggestTimer);
  suggestTimer = setTimeout(async ()=>{
    if(text.length < 5){ document.getElementById('suggest-area').style.display='none'; return; }
    const res = await fetch('/api/suggest-tags', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({body: text})
    });
    const data = await res.json();
    const area = document.getElementById('suggest-area');
    const el = document.getElementById('suggest-tags');
    const hits = data.tags.filter(t => !attachedIds.has(t.id));
    if(hits.length===0){ area.style.display='none'; return; }
    el.innerHTML = hits.map(t =>
      \`<span class="tag-candidate" onclick="addTag(\${t.id})">#\${t.name}</span>\`
    ).join('');
    area.style.display='block';
  }, 500);
}

async function sendReaction(threadId, type){
  const res = await fetch('/api/like',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({thread_id: threadId, type})
  });
  const data = await res.json();
  if(data.ok){
    document.querySelector('[data-count="'+type+'"]').textContent = data.count;
    const btn = document.querySelector('[data-reaction="'+type+'"]');
    if(type==='like') btn.classList.toggle('active-like', data.action==='added');
    if(type==='surprise') btn.classList.toggle('active-surprise', data.action==='added');
  }
}
</script>`;
}

// =============================================
// トップページ
// =============================================

async function handleTop(env, url) {
  const page = parseInt(url.searchParams.get('page') || '1');
  const sort = url.searchParams.get('sort') || 'new';
  const tag = url.searchParams.get('tags') || '';  // カンマ区切りタグ名
  const searchQuery = (url.searchParams.get('q') || '').trim();
  const offset = (page - 1) * PAGE_SIZE;
  const orderBy = sort === 'popular' ? 't.likes DESC' : 't.created_at DESC';

  const { results: tags } = await env.DB.prepare('SELECT * FROM tags ORDER BY name').all();

  // 選択中のタグ名リスト
  const selectedTagNames = tag ? tag.split(',').map(s => s.trim()).filter(Boolean) : [];
  const selectedTags = tags.filter(t => selectedTagNames.includes(t.name));

  let threads;
  if (searchQuery && selectedTagNames.length > 0) {
    // 検索 + タグフィルター
    const placeholders = selectedTagNames.map(() => '?').join(',');
    const { results } = await env.DB.prepare(`
      SELECT t.*, GROUP_CONCAT(tg.name) as tag_names
      FROM threads t
      JOIN thread_tags tt2 ON tt2.thread_id = t.id
      JOIN tags tg2 ON tg2.id = tt2.tag_id AND tg2.name IN (${placeholders})
      LEFT JOIN thread_tags tt ON tt.thread_id = t.id
      LEFT JOIN tags tg ON tg.id = tt.tag_id
      WHERE t.body LIKE ? OR tg2.name LIKE ?
      GROUP BY t.id ORDER BY ${orderBy} LIMIT ? OFFSET ?
    `).bind(...selectedTagNames, '%'+searchQuery+'%', '%'+searchQuery+'%', PAGE_SIZE + 1, offset).all();
    threads = results;
  } else if (selectedTagNames.length > 0) {
    // タグフィルターのみ（複数タグはAND条件）
    const placeholders = selectedTagNames.map(() => '?').join(',');
    const { results } = await env.DB.prepare(`
      SELECT t.*, GROUP_CONCAT(tg.name) as tag_names,
        COUNT(DISTINCT tg2.id) as matched_tags
      FROM threads t
      JOIN thread_tags tt2 ON tt2.thread_id = t.id
      JOIN tags tg2 ON tg2.id = tt2.tag_id AND tg2.name IN (${placeholders})
      LEFT JOIN thread_tags tt ON tt.thread_id = t.id
      LEFT JOIN tags tg ON tg.id = tt.tag_id
      GROUP BY t.id
      HAVING matched_tags = ${selectedTagNames.length}
      ORDER BY ${orderBy} LIMIT ? OFFSET ?
    `).bind(...selectedTagNames, PAGE_SIZE + 1, offset).all();
    threads = results;
  } else if (searchQuery) {
    // テキスト検索のみ（本文 OR タグ名）
    const { results } = await env.DB.prepare(`
      SELECT t.*, GROUP_CONCAT(tg.name) as tag_names
      FROM threads t
      LEFT JOIN thread_tags tt ON tt.thread_id = t.id
      LEFT JOIN tags tg ON tg.id = tt.tag_id
      WHERE t.body LIKE ? OR tg.name LIKE ?
      GROUP BY t.id ORDER BY ${orderBy} LIMIT ? OFFSET ?
    `).bind('%'+searchQuery+'%', '%'+searchQuery+'%', PAGE_SIZE + 1, offset).all();
    threads = results;
  } else {
    const { results } = await env.DB.prepare(`
      SELECT t.*, GROUP_CONCAT(tg.name) as tag_names
      FROM threads t
      LEFT JOIN thread_tags tt ON tt.thread_id = t.id
      LEFT JOIN tags tg ON tg.id = tt.tag_id
      GROUP BY t.id ORDER BY ${orderBy} LIMIT ? OFFSET ?
    `).bind(PAGE_SIZE + 1, offset).all();
    threads = results;
  }

  const hasNext = threads.length > PAGE_SIZE;
  const items = threads.slice(0, PAGE_SIZE);
  const tagParam = selectedTagNames.length > 0 ? '&tags=' + encodeURIComponent(selectedTagNames.join(',')) : '';
  const qParam = searchQuery ? '&q=' + encodeURIComponent(searchQuery) : '';
  const baseUrl = `/?sort=${sort}${tagParam}${qParam}`;

  const cards = items.map(renderCard).join('') ||
    '<p style="color:#bbb;text-align:center;padding:2rem">まだ投稿がありません</p>';

  const body = `
${renderHeader(searchQuery)}
<div class="container">
  <main class="main">
    ${searchQuery ? `<p style="margin-bottom:.65rem;font-size:.82rem;color:#888">「${esc(searchQuery)}」の検索結果 <a href="/" style="color:#bbb;margin-left:.4rem">✕ 解除</a></p>` : ''}
    ${tag ? `<p style="margin-bottom:.65rem;font-size:.82rem;color:#888">${selectedTagNames.map(n=>'#'+esc(n)).join(' ')} の投稿 <a href="/" style="color:#bbb;margin-left:.4rem">✕ 解除</a></p>` : ''}
    <div class="tabs">
      <a class="tab${sort !== 'popular' ? ' active' : ''}" href="/?sort=new${tag ? '&tags=' + encodeURIComponent(tag) : ''}${searchQuery ? '&q=' + encodeURIComponent(searchQuery) : ''}">新着</a>
      <a class="tab${sort === 'popular' ? ' active' : ''}" href="/?sort=popular${tag ? '&tags=' + encodeURIComponent(tag) : ''}${searchQuery ? '&q=' + encodeURIComponent(searchQuery) : ''}">人気</a>
    </div>
    ${cards}
    ${pagination(page, hasNext, baseUrl)}
  </main>
  ${renderSidebar(tags, selectedTags)}
</div>
${renderPostModal(tags)}
${clientJS(tags)}`;

  return html('保育士・子育て掲示板', body);
}

// =============================================
// スレッド詳細
// =============================================

async function handleThread(env, url, threadId) {
  const { results: tags } = await env.DB.prepare('SELECT * FROM tags ORDER BY name').all();
  const thread = await env.DB.prepare('SELECT * FROM threads WHERE id = ?').bind(threadId).first();
  if (!thread) return new Response('Not Found', { status: 404 });

  const { results: threadTags } = await env.DB.prepare(`
    SELECT tg.name FROM thread_tags tt JOIN tags tg ON tg.id = tt.tag_id WHERE tt.thread_id = ?
  `).bind(threadId).all();

  const attrs = [thread.place, thread.child_age, thread.poster_age, thread.poster_gender, thread.poster_role]
    .filter(Boolean).map(a => `<span class="attr-chip">${esc(a)}</span>`).join('');
  const tagChips = threadTags.map(t => `<span class="tag-chip" style="cursor:pointer" onclick="location.href='/?tag=${encodeURIComponent(t.name)}'">#${esc(t.name)}</span>`).join('');

  const attrText = [thread.place, thread.child_age, thread.poster_age, thread.poster_gender, thread.poster_role]
    .filter(Boolean).join(' ');

  const body = `
${renderHeader()}
<div class="container">
  <main class="main">
    <div class="breadcrumb"><a href="/">← 一覧に戻る</a></div>
    <div class="thread-detail">
      <div class="thread-body">${esc(thread.body)}</div>
      ${tagChips ? `<div class="thread-tags">${tagChips}</div>` : ''}
      <div style="font-size:.75rem;color:#bbb;margin-bottom:.75rem">${timeAgo(thread.created_at)}</div>
      <div class="reactions-bar">
        <button class="reaction-btn" data-reaction="like" onclick="sendReaction(${thread.id},'like')">
          😊 <span data-count="like">${thread.likes || 0}</span>
        </button>
        <button class="reaction-btn" data-reaction="surprise" onclick="sendReaction(${thread.id},'surprise')">
          😲 <span data-count="surprise">${thread.surprises || 0}</span>
        </button>
        ${attrText ? `<span style="font-size:.78rem;color:#bbb;margin-left:.5rem;align-self:center">${esc(attrText)}</span>` : ''}
      </div>
    </div>
  </main>
  ${renderSidebar(tags)}
</div>
${renderPostModal(tags)}
${clientJS(tags)}`;

  return html(thread.body.slice(0, 30) + '...', body);
}


// =============================================
// 投稿専用ページ
// =============================================

async function handlePostPage(env, url) {
  const { results: tags } = await env.DB.prepare('SELECT * FROM tags ORDER BY name').all();

  const tagOptions = tags.map(t =>
    `<option value="${t.id}">${esc(t.name)}</option>`
  ).join('');

  const body = `
${renderHeader()}
<div style="max-width:640px;margin:1.5rem auto;padding:0 1rem">
  <h1 style="font-size:1.05rem;margin-bottom:1.25rem;color:#555">新しい投稿</h1>
  <form method="POST" action="/new" style="background:#fff;border:1px solid #ede8dc;border-radius:10px;padding:1.5rem">
    <div class="form-group full">
      <label>本文（必須）</label>
      <div style="position:relative">
        <textarea name="body" id="post-body" rows="6" required maxlength="250" placeholder="相談・経験談などを自由に書いてください" oninput="onBodyInput(this.value)" style="width:100%;padding:.45rem .65rem;border:1px solid #e0d8c8;border-radius:6px;font-size:.88rem;background:#faf8f2;font-family:inherit;resize:vertical"></textarea>
        <div id="char-count" style="text-align:right;font-size:.72rem;color:#bbb;margin-top:2px">0/250字</div>
      </div>
    </div>
    <div class="form-grid">
      <div class="form-group">
        <label>場所</label>
        <select name="place">
          <option value="">選択しない</option>
          <option>保育園</option>
          <option>幼稚園</option>
          <option>認定こども園</option>
          <option>小学校</option>
          <option>学童保育</option>
          <option>放課後児童支援</option>
          <option>家庭</option>
          <option>その他</option>
        </select>
      </div>
      <div class="form-group">
        <label>子どもの年齢</label>
        <select name="child_age">
          <option value="">選択しない</option>
          <option>0歳</option>
          <option>1歳</option>
          <option>2歳</option>
          <option>3歳</option>
          <option>4歳</option>
          <option>5歳</option>
          <option>6歳以上</option>
        </select>
      </div>
      <div class="form-group">
        <label>投稿者の年代</label>
        <select name="poster_age">
          <option value="">選択しない</option>
          <option>10代</option>
          <option>20代</option>
          <option>30代</option>
          <option>40代</option>
          <option>50代以上</option>
        </select>
      </div>
      <div class="form-group">
        <label>性別</label>
        <select name="poster_gender">
          <option value="">選択しない</option>
          <option>男性</option>
          <option>女性</option>
          <option>その他</option>
        </select>
      </div>
      <div class="form-group full">
        <label>立場</label>
        <select name="poster_role">
          <option value="">選択しない</option>
          <option>保育士</option>
          <option>幼稚園教諭</option>
          <option>保育補助</option>
          <option>学童支援員</option>
          <option>保護者</option>
          <option>学生</option>
          <option>その他</option>
        </select>
      </div>
    </div>
    <div class="form-group full">
      <label>タグ</label>
      <div class="tag-search-bar">
        <span>🏷</span>
        <input type="text" id="tag-search" placeholder="タグを検索..." oninput="searchTags(this.value)">
      </div>
      <div class="attached-tags" id="attached-tags"></div>
      <div id="suggest-area" style="display:none;margin-bottom:.4rem">
        <div class="suggest-label">📌 おすすめタグ</div>
        <div class="tag-candidates" id="suggest-tags"></div>
      </div>
      <div class="tag-candidates" id="tag-candidates"></div>
      <input type="hidden" name="tag_ids" id="tag-ids-input">
    </div>
    <div class="form-group full">
      <label>削除パスワード（任意）</label>
      <input name="delete_password" type="password" placeholder="後で削除したいときに使います">
    </div>
    <button class="btn-submit" type="submit">投稿する</button>
  </form>
</div>
${clientJS(tags)}`;

  return html('投稿する | 保育士・子育て掲示板', body);
}

// =============================================
// 投稿作成
// =============================================

async function handleNewThread(request, env) {
  const form = await request.formData();
  const body = (form.get('body') ?? '').trim();
  const place = (form.get('place') ?? '').trim() || null;
  const child_age = (form.get('child_age') ?? '').trim() || null;
  const poster_age = (form.get('poster_age') ?? '').trim() || null;
  const poster_gender = (form.get('poster_gender') ?? '').trim() || null;
  const poster_role = (form.get('poster_role') ?? '').trim() || null;
  const delete_password = (form.get('delete_password') ?? '').trim() || null;
  const tagIds = (form.get('tag_ids') ?? '').split(',').map(Number).filter(Boolean);
  const ip = request.headers.get('CF-Connecting-IP') ?? '';

  if (!body) return new Response('本文は必須です', { status: 400 });

  const result = await env.DB.prepare(
    'INSERT INTO threads (body,place,child_age,poster_age,poster_gender,poster_role,ip_address,delete_password) VALUES (?,?,?,?,?,?,?,?)'
  ).bind(body, place, child_age, poster_age, poster_gender, poster_role, ip, delete_password).run();

  const threadId = result.meta.last_row_id;
  for (const tagId of tagIds) {
    await env.DB.prepare('INSERT OR IGNORE INTO thread_tags (thread_id,tag_id) VALUES (?,?)').bind(threadId, tagId).run();
  }

  return Response.redirect(`${new URL(request.url).origin}/${threadId}`, 303);
}

// =============================================
// API: タグ推薦
// =============================================

async function handleSuggestTags(request, env) {
  let body;
  try { body = await request.json(); } catch { return Response.json({ tags: [] }); }
  const text = (body.body ?? '').toLowerCase();
  if (!text) return Response.json({ tags: [] });

  const { results: keywords } = await env.DB.prepare(`
    SELECT tk.keyword, tk.tag_id, tg.name
    FROM tag_keywords tk JOIN tags tg ON tg.id = tk.tag_id
  `).all();

  const matched = new Map();
  for (const kw of keywords) {
    if (text.includes(kw.keyword.toLowerCase())) {
      if (!matched.has(kw.tag_id)) {
        matched.set(kw.tag_id, { id: kw.tag_id, name: kw.name });
      }
    }
  }

  return Response.json({ tags: [...matched.values()] });
}

// =============================================
// API: いいね / びっくり
// =============================================

async function handleLike(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  let body;
  try { body = await request.json(); } catch { return Response.json({ ok: false }, { status: 400 }); }

  const { thread_id, type } = body;
  if (!thread_id || !['like', 'surprise'].includes(type)) {
    return Response.json({ ok: false }, { status: 400 });
  }

  const column = type === 'like' ? 'likes' : 'surprises';
  const existing = await env.DB.prepare(
    'SELECT id FROM likes WHERE thread_id=? AND ip_address=? AND type=?'
  ).bind(thread_id, ip, type).first();

  let action;
  if (existing) {
    await env.DB.prepare('DELETE FROM likes WHERE id=?').bind(existing.id).run();
    await env.DB.prepare(`UPDATE threads SET ${column}=MAX(0,${column}-1) WHERE id=?`).bind(thread_id).run();
    action = 'removed';
  } else {
    await env.DB.prepare('INSERT INTO likes (thread_id,ip_address,type) VALUES (?,?,?)').bind(thread_id, ip, type).run();
    await env.DB.prepare(`UPDATE threads SET ${column}=${column}+1 WHERE id=?`).bind(thread_id).run();
    action = 'added';
  }

  const thread = await env.DB.prepare(`SELECT ${column} FROM threads WHERE id=?`).bind(thread_id).first();
  return Response.json({ ok: true, action, count: thread?.[column] ?? 0 });
}

// =============================================
// 管理者画面
// =============================================

function adminLayout(title, body) {
  return html(title, `<div class="admin-wrap">${body}</div>`);
}

async function requireAdmin(request, env) {
  const session = await getAdminSession(request, env);
  if (!session) return Response.redirect(new URL(request.url).origin + '/admin', 302);
  return null;
}

async function adminLogin(request, env) {
  const session = await getAdminSession(request, env);
  if (session) return Response.redirect(new URL(request.url).origin + '/admin/tags', 302);
  return adminLayout('管理者ログイン', `
    <div class="admin-login">
      <h1>🔐 管理者ログイン</h1>
      <form method="POST" action="/admin/login">
        <div class="form-group"><label>パスワード</label><input type="password" name="password" required autofocus></div>
        <button class="btn-submit" type="submit">ログイン</button>
      </form>
    </div>`);
}

async function adminDoLogin(request, env) {
  const form = await request.formData();
  const pw = form.get('password') ?? '';
  if (pw !== ADMIN_PASSWORD) return adminLayout('ログイン失敗', '<p>パスワードが違います。<a href="/admin">戻る</a></p>');

  const sessionId = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO admin_sessions (id) VALUES (?)').bind(sessionId).run();

  return new Response('', {
    status: 302,
    headers: { Location: '/admin/tags', 'Set-Cookie': setCookie('admin_session', sessionId) }
  });
}

async function adminLogout(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/admin_session=([^;]+)/);
  if (match) await env.DB.prepare('DELETE FROM admin_sessions WHERE id=?').bind(match[1]).run();
  return new Response('', { status: 302, headers: { Location: '/admin', 'Set-Cookie': setCookie('admin_session', '', 0) } });
}

async function adminTags(request, env) {
  const redirect = await requireAdmin(request, env);
  if (redirect) return redirect;

  const { results: tags } = await env.DB.prepare(`
    SELECT t.*, COUNT(tk.id) as kw_count FROM tags t
    LEFT JOIN tag_keywords tk ON tk.tag_id = t.id
    GROUP BY t.id ORDER BY t.name
  `).all();

  const rows = tags.map(t => `
    <tr>
      <td>${esc(t.name)}</td>
      <td>${t.kw_count}個</td>
      <td>
        <a href="/admin/tags/${t.id}/keywords" class="btn-sm btn-primary" style="text-decoration:none;padding:.25rem .75rem;border-radius:4px;display:inline-block">キーワード管理</a>
      </td>
      <td>
        <form method="POST" action="/admin/tags/${t.id}/delete" style="display:inline" onsubmit="return confirm('削除しますか？')">
          <button class="btn-sm btn-danger" type="submit">削除</button>
        </form>
      </td>
    </tr>`).join('');

  return adminLayout('タグ管理', `
    <h1>タグ管理</h1>
    <a class="back-link" href="/admin/logout">ログアウト</a>
    <h2>新しいタグを追加</h2>
    <form class="admin-form" method="POST" action="/admin/tags">
      <input name="name" placeholder="タグ名（例: 排泄）" required>
      <button class="btn-sm btn-primary" type="submit">追加</button>
    </form>
    <table class="admin-table">
      <thead><tr><th>タグ名</th><th>キーワード数</th><th>キーワード</th><th>削除</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`);
}

async function adminAddTag(request, env) {
  const redirect = await requireAdmin(request, env);
  if (redirect) return redirect;
  const form = await request.formData();
  const name = (form.get('name') ?? '').trim();
  if (name) await env.DB.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').bind(name).run();
  return Response.redirect(new URL(request.url).origin + '/admin/tags', 302);
}

async function adminDeleteTag(request, env, tagId) {
  const redirect = await requireAdmin(request, env);
  if (redirect) return redirect;
  await env.DB.prepare('DELETE FROM tags WHERE id=?').bind(tagId).run();
  return Response.redirect(new URL(request.url).origin + '/admin/tags', 302);
}

async function adminKeywords(request, env, tagId) {
  const redirect = await requireAdmin(request, env);
  if (redirect) return redirect;

  const tag = await env.DB.prepare('SELECT * FROM tags WHERE id=?').bind(tagId).first();
  if (!tag) return new Response('Not Found', { status: 404 });

  const { results: keywords } = await env.DB.prepare(
    'SELECT * FROM tag_keywords WHERE tag_id=? ORDER BY keyword'
  ).bind(tagId).all();

  const rows = keywords.map(k => `
    <tr>
      <td>${esc(k.keyword)}</td>
      <td>
        <form method="POST" action="/admin/keywords/${k.id}/delete" style="display:inline">
          <button class="btn-sm btn-danger" type="submit">削除</button>
        </form>
      </td>
    </tr>`).join('');

  return adminLayout(`#${tag.name} のキーワード管理`, `
    <h1>#${esc(tag.name)} のキーワード管理</h1>
    <a class="back-link" href="/admin/tags">← タグ一覧に戻る</a>
    <h2>キーワードを追加</h2>
    <p style="font-size:.82rem;color:#888;margin-bottom:.75rem">このキーワードが本文に含まれると #${esc(tag.name)} がおすすめタグとして表示されます</p>
    <form class="admin-form" method="POST" action="/admin/tags/${tagId}/keywords">
      <input name="keyword" placeholder="例: トイレ" required>
      <button class="btn-sm btn-primary" type="submit">追加</button>
    </form>
    <table class="admin-table">
      <thead><tr><th>キーワード</th><th>削除</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="2" style="color:#bbb;text-align:center">まだキーワードがありません</td></tr>'}</tbody>
    </table>`);
}

async function adminAddKeyword(request, env, tagId) {
  const redirect = await requireAdmin(request, env);
  if (redirect) return redirect;
  const form = await request.formData();
  const keyword = (form.get('keyword') ?? '').trim();
  if (keyword) await env.DB.prepare('INSERT OR IGNORE INTO tag_keywords (tag_id,keyword) VALUES (?,?)').bind(tagId, keyword).run();
  return Response.redirect(new URL(request.url).origin + `/admin/tags/${tagId}/keywords`, 302);
}

async function adminDeleteKeyword(request, env, keywordId) {
  const redirect = await requireAdmin(request, env);
  if (redirect) return redirect;
  const kw = await env.DB.prepare('SELECT tag_id FROM tag_keywords WHERE id=?').bind(keywordId).first();
  await env.DB.prepare('DELETE FROM tag_keywords WHERE id=?').bind(keywordId).run();
  return Response.redirect(new URL(request.url).origin + `/admin/tags/${kw?.tag_id}/keywords`, 302);
}
