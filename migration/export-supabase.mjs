// 一次性腳本：把 Supabase 的 reviews 匯出成 D1 可匯入的 seed.sql
// 用法：node migration/export-supabase.mjs
// seed.sql 內含編輯用 token，已列入 .gitignore 與 .assetsignore，請勿公開。
import { writeFileSync } from 'node:fs';

const SUPABASE_URL = 'https://ilqokehzrylqlihqjrgl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_neJCMKv8KkHChWinEJjiOA_-26CPbfZ';
const PAGE = 1000;

const q = v => `'${String(v ?? '').replace(/'/g, "''")}'`;

const rows = [];
for (let from = 0; ; from += PAGE) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/reviews?select=*&order=created_at.asc`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Range: `${from}-${from + PAGE - 1}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase 回應 ${res.status}: ${await res.text()}`);
  const page = await res.json();
  rows.push(...page);
  if (page.length < PAGE) break;
}

const sql = rows.map(r =>
  'INSERT OR REPLACE INTO reviews (id, course_name, instructor, nickname, rating, comment, token, created_at) VALUES (' +
  [
    q(r.id), q(r.course_name), q(r.instructor), q(r.nickname || '匿名'),
    Number(r.rating), q(r.comment), q(r.token), q(new Date(r.created_at).toISOString()),
  ].join(', ') + ');'
).join('\n') + '\n';

const out = new URL('./seed.sql', import.meta.url);
writeFileSync(out, sql);
console.log(`已匯出 ${rows.length} 筆 → migration/seed.sql`);
