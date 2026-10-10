// ── 評價 API（同源 Cloudflare Worker + D1，見 worker.js）──────
const API = '/api/reviews';
const HEADERS = { 'Content-Type': 'application/json' };

// ── Token 本機儲存（id → token 對應）─────────────────────────
const TOKEN_KEY = 'rv_tokens';

export function saveToken(id, token) {
  const map = getTokens();
  map[id] = token;
  localStorage.setItem(TOKEN_KEY, JSON.stringify(map));
}

export function getTokens() {
  try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || '{}'); }
  catch { return {}; }
}

// ── 取得統計摘要（僅 3 欄，輕量）────────────────────────────
export async function fetchReviewStats() {
  try {
    const res = await fetch(`${API}/stats`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// ── 取得單一課程完整評價 ──────────────────────────────────────
export async function fetchCourseReviews(courseName) {
  try {
    const res = await fetch(`${API}?course=${encodeURIComponent(courseName)}`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// ── 送出評價（回傳 id + token）───────────────────────────────
export async function submitReview({ course_name, nickname, rating, comment, instructor = '' }) {
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ course_name, nickname, rating, comment, instructor }),
    });
    if (!res.ok) return null;
    return await res.json(); // { id, token, ... }
  } catch {
    return null;
  }
}

// ── 刪除評價（server 端驗 token）──────────────────────────────
export async function deleteReview(id, token) {
  try {
    const res = await fetch(`${API}/${id}`, {
      method: 'DELETE',
      headers: HEADERS,
      body: JSON.stringify({ token }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── 更新評價（server 端驗 token）──────────────────────────────
export async function updateReview(id, token, rating, comment) {
  try {
    const res = await fetch(`${API}/${id}`, {
      method: 'PATCH',
      headers: HEADERS,
      body: JSON.stringify({ token, rating, comment }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
