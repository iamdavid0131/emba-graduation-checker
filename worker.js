// ── 課程評價 API（Cloudflare D1）──────────────────────────────
// 只處理 /api/*，其餘靜態檔由 assets 直接回應（見 wrangler.jsonc）

const LIMITS = { course_name: 100, instructor: 50, nickname: 20, comment: 200 };
const PUBLIC_COLS = 'id, course_name, instructor, nickname, rating, comment, created_at';

const json = (data, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

const fail = (status, error) => json({ error }, status);

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const validRating = v => Number.isInteger(v) && v >= 1 && v <= 5;

async function readBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : {};
  } catch {
    return {};
  }
}

// ── 統計摘要（僅 3 欄，輕量）─────────────────────────────────
async function listStats(env) {
  const { results } = await env.DB
    .prepare('SELECT course_name, instructor, rating FROM reviews')
    .all();
  return json(results);
}

// ── 單一課程完整評價（不含 token）────────────────────────────
async function listCourse(env, course) {
  if (!course) return fail(400, 'course is required');
  const { results } = await env.DB
    .prepare(`SELECT ${PUBLIC_COLS} FROM reviews WHERE course_name = ? ORDER BY created_at DESC`)
    .bind(course)
    .all();
  return json(results);
}

// ── 新增評價（回傳 id + token，token 只在此時給一次）─────────
async function createReview(env, body) {
  const row = {
    id:          crypto.randomUUID(),
    course_name: text(body.course_name, LIMITS.course_name),
    instructor:  text(body.instructor, LIMITS.instructor),
    nickname:    text(body.nickname, LIMITS.nickname) || '匿名',
    rating:      body.rating,
    comment:     text(body.comment, LIMITS.comment),
    token:       crypto.randomUUID(),
    created_at:  new Date().toISOString(),
  };
  if (!row.course_name)         return fail(400, 'course_name is required');
  if (!validRating(row.rating)) return fail(400, 'rating must be 1-5');

  await env.DB
    .prepare(
      'INSERT INTO reviews (id, course_name, instructor, nickname, rating, comment, token, created_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(row.id, row.course_name, row.instructor, row.nickname, row.rating, row.comment, row.token, row.created_at)
    .run();
  return json(row, 201);
}

// ── 更新評價（驗 token）──────────────────────────────────────
async function updateReview(env, id, body) {
  if (typeof body.token !== 'string' || !body.token) return fail(403, 'forbidden');
  if (!validRating(body.rating)) return fail(400, 'rating must be 1-5');

  const { meta } = await env.DB
    .prepare('UPDATE reviews SET rating = ?, comment = ? WHERE id = ? AND token = ?')
    .bind(body.rating, text(body.comment, LIMITS.comment), id, body.token)
    .run();
  return meta.changes ? json({ ok: true }) : fail(403, 'forbidden');
}

// ── 刪除評價（驗 token）──────────────────────────────────────
async function deleteReview(env, id, body) {
  if (typeof body.token !== 'string' || !body.token) return fail(403, 'forbidden');

  const { meta } = await env.DB
    .prepare('DELETE FROM reviews WHERE id = ? AND token = ?')
    .bind(id, body.token)
    .run();
  return meta.changes ? json({ ok: true }) : fail(403, 'forbidden');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { method } = request;
    const path = url.pathname.replace(/\/+$/, '');

    try {
      if (path === '/api/reviews/stats' && method === 'GET') return await listStats(env);

      if (path === '/api/reviews') {
        if (method === 'GET')  return await listCourse(env, url.searchParams.get('course'));
        if (method === 'POST') return await createReview(env, await readBody(request));
        return fail(405, 'method not allowed');
      }

      const m = path.match(/^\/api\/reviews\/([0-9a-f-]{36})$/i);
      if (m) {
        if (method === 'PATCH')  return await updateReview(env, m[1], await readBody(request));
        if (method === 'DELETE') return await deleteReview(env, m[1], await readBody(request));
        return fail(405, 'method not allowed');
      }

      return fail(404, 'not found');
    } catch (err) {
      console.error(err);
      return fail(500, 'internal error');
    }
  },
};
