// ── Supabase 設定 ─────────────────────────────────────────────
const SUPABASE_URL = 'https://ilqokehzrylqlihqjrgl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_neJCMKv8KkHChWinEJjiOA_-26CPbfZ';
const HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

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
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/reviews?select=course_name,instructor,rating`,
      { headers: HEADERS }
    );
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// ── 取得單一課程完整評價 ──────────────────────────────────────
export async function fetchCourseReviews(courseName) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/reviews?course_name=eq.${encodeURIComponent(courseName)}&select=*&order=created_at.desc`,
      { headers: HEADERS }
    );
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// ── 送出評價（回傳 id + token）───────────────────────────────
export async function submitReview({ course_name, nickname, rating, comment, instructor = '' }) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/reviews`, {
      method: 'POST',
      headers: { ...HEADERS, 'Prefer': 'return=representation' },
      body: JSON.stringify({ course_name, nickname, rating, comment, instructor }),
    });
    if (!res.ok) return null;
    const [row] = await res.json();
    return row; // { id, token, ... }
  } catch {
    return null;
  }
}

// ── 刪除評價（透過 RPC，server 端驗 token）────────────────────
export async function deleteReview(id, token) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/delete_review`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ p_id: id, p_token: token }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── 更新評價（透過 RPC，server 端驗 token）────────────────────
export async function updateReview(id, token, rating, comment) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/update_review`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ p_id: id, p_token: token, p_rating: rating, p_comment: comment }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
