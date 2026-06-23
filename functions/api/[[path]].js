// 刷题先锋 API · Pages Functions catch-all
// 路由 /api/* 到这里
// 通过 Pages Functions 调用 KV namespace binding `SHUATI_WRONG_KV`

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function err(message, status = 400) {
  return json({ error: message }, status);
}

function genCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// 简单 rate limit：30 次/分钟/IP
async function rateLimit(request, env, action) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const key = `rl:${action}:${ip}:${Math.floor(Date.now() / 60000)}`;
  const cur = parseInt((await env.SHUATI_WRONG_KV.get(key)) || '0', 10);
  if (cur > 30) return false;
  await env.SHUATI_WRONG_KV.put(key, String(cur + 1), { expirationTtl: 120 });
  return true;
}

const CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const path = url.pathname;

  try {
    // POST /api/init - 生成新绑定码
    if (path === '/api/init' && request.method === 'POST') {
      if (!await rateLimit(request, env, 'init')) return err('Rate limit exceeded', 429);
      const code = genCode();
      const initData = {
        questions: {},
        stats: { totalWrong: 0, lastUpdatedAt: Date.now() },
        createdAt: Date.now(),
      };
      await env.SHUATI_WRONG_KV.put(`wrong:${code}`, JSON.stringify(initData));
      return json({ code });
    }

    // GET /api/wrong?code=***
    if (path === '/api/wrong' && request.method === 'GET') {
      const code = url.searchParams.get('code');
      if (!code || !CODE_RE.test(code)) return err('Invalid code');
      if (!await rateLimit(request, env, 'get')) return err('Rate limit exceeded', 429);
      const data = await env.SHUATI_WRONG_KV.get(`wrong:${code}`);
      if (!data) return json({ questions: {}, stats: { totalWrong: 0 } });
      return json(JSON.parse(data));
    }

    // POST /api/wrong?code=*** - 覆盖式保存
    if (path === '/api/wrong' && request.method === 'POST') {
      const code = url.searchParams.get('code');
      if (!code || !CODE_RE.test(code)) return err('Invalid code');
      if (!await rateLimit(request, env, 'post')) return err('Rate limit exceeded', 429);
      const body = await request.json();
      if (!body.questions || typeof body.questions !== 'object') return err('Invalid body');
      const dataStr = JSON.stringify({
        questions: body.questions,
        stats: body.stats || { totalWrong: Object.keys(body.questions).length, lastUpdatedAt: Date.now() },
        createdAt: body.createdAt || Date.now(),
      });
      if (dataStr.length > 1024 * 1024) return err('Data too large (>1MB)', 413);
      await env.SHUATI_WRONG_KV.put(`wrong:${code}`, dataStr);
      return json({ ok: true, total: Object.keys(body.questions).length, savedAt: Date.now() });
    }

    // POST /api/wrong/merge?code=*** - 合并式保存
    if (path === '/api/wrong/merge' && request.method === 'POST') {
      const code = url.searchParams.get('code');
      if (!code || !CODE_RE.test(code)) return err('Invalid code');
      if (!await rateLimit(request, env, 'merge')) return err('Rate limit exceeded', 429);
      const body = await request.json();
      if (!body.questions) return err('Invalid body');
      const curStr = await env.SHUATI_WRONG_KV.get(`wrong:${code}`);
      const cur = curStr ? JSON.parse(curStr) : { questions: {}, createdAt: Date.now() };
      const merged = { ...cur.questions };
      for (const [k, v] of Object.entries(body.questions)) {
        if (merged[k]) {
          merged[k] = {
            ...merged[k],
            ...v,
            wrongCount: Math.max(merged[k].wrongCount || 0, v.wrongCount || 0),
            lastWrongAt: Math.max(merged[k].lastWrongAt || 0, v.lastWrongAt || 0),
          };
        } else {
          merged[k] = v;
        }
      }
      const newData = {
        questions: merged,
        stats: { totalWrong: Object.keys(merged).length, lastUpdatedAt: Date.now() },
        createdAt: cur.createdAt || Date.now(),
      };
      const dataStr = JSON.stringify(newData);
      if (dataStr.length > 1024 * 1024) return err('Data too large (>1MB)', 413);
      await env.SHUATI_WRONG_KV.put(`wrong:${code}`, dataStr);
      return json({ ok: true, total: Object.keys(merged).length });
    }

    // DELETE /api/wrong?code=***
    if (path === '/api/wrong' && request.method === 'DELETE') {
      const code = url.searchParams.get('code');
      if (!code || !CODE_RE.test(code)) return err('Invalid code');
      if (!await rateLimit(request, env, 'delete')) return err('Rate limit exceeded', 429);
      await env.SHUATI_WRONG_KV.delete(`wrong:${code}`);
      return json({ ok: true });
    }

    return err('Not found', 404);
  } catch (e) {
    return err(`Server error: ${e.message}`, 500);
  }
}
