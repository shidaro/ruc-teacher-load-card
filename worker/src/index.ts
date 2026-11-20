interface Env {
  ALLOWED_ORIGIN: string
}

const UPSTREAM = 'https://api-schedule.ruc.su/api/v1'
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const ROUTES = [
  /^\/api\/v1\/get_branches$/,
  new RegExp(`^/api/v1/get_employees/${UUID}$`),
  new RegExp(`^/api/v1/get_schedule/employee/${UUID}/${UUID}/no$`),
  new RegExp(`^/api/v1/get_schedule/employee/${UUID}/${UUID}/\\d{4}\\.\\d{2}\\.\\d{2}$`),
]

function cacheTtl(pathname: string) {
  if (pathname === '/api/v1/get_branches') return 86_400
  if (/^\/api\/v1\/get_employees\//.test(pathname)) return 21_600
  return 300
}

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
}

function jsonError(message: string, status: number, headers: HeadersInit = {}) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin')

    if (origin !== env.ALLOWED_ORIGIN) {
      return jsonError('Origin is not allowed', 403)
    }

    const cors = corsHeaders(env.ALLOWED_ORIGIN)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }
    if (request.method !== 'GET') {
      return jsonError('Method not allowed', 405, { ...cors, Allow: 'GET, OPTIONS' })
    }
    if (!ROUTES.some((route) => route.test(url.pathname))) {
      return jsonError('Endpoint is not allowed', 404, cors)
    }

    const upstreamUrl = `${UPSTREAM}${url.pathname.slice('/api/v1'.length)}`
    const ttl = cacheTtl(url.pathname)
    try {
      const upstream = await fetch(upstreamUrl, {
        headers: { Accept: 'application/json' },
        cf: { cacheTtl: ttl, cacheEverything: true },
      })
      const responseHeaders = new Headers(cors)
      responseHeaders.set('Content-Type', upstream.headers.get('Content-Type') ?? 'application/json')
      responseHeaders.set('Cache-Control', upstream.ok ? `public, max-age=${ttl}` : 'no-store')
      return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
    } catch {
      return jsonError('Schedule API is temporarily unavailable', 502, cors)
    }
  },
}
