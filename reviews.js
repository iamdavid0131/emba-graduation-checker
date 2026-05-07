// ── Supabase 設定 ─────────────────────────────────────────────
const SUPABASE_URL = 'https://ilqokehzrylqlihqjrgl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_neJCMKv8KkHChWinEJjiOA_-26CPbfZ';
const HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

// ── 取得所有評價 ──────────────────────────────────────────────
export async function fetchAllReviews() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/reviews?select=*&order=created_at.desc`,
      { headers: HEADERS }
    );
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// ── 送出評價 ──────────────────────────────────────────────────
export async function submitReview({ course_name, nickname, rating, comment, instructor = '' }) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/reviews`, {
      method: 'POST',
      headers: { ...HEADERS, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ course_name, nickname, rating, comment, instructor }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
