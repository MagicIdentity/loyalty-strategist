// ============================================================
// MAGIC LOYALTY STRATEGIST — Daemon Agent (v1.0)
//
// Thin proxy running on merchants.magicid.cloud.
// Receives chat requests from the frontend, extracts the
// verified daemon identity (party) from the token, and
// forwards the request to the Apps Script doPost() endpoint
// with the daemonId attached.
//
// For orphan users (no daemon token), the request is forwarded
// without a daemonId — Apps Script treats them as new merchants.
// ============================================================

import { Lifecycle } from '$static/lib/ts/Lifecycle.ts'
import { response } from '$static/lib/ts/Responses.ts'
import { Token } from '$static/lib/js/Token.js'

// ── Lifecycle setup ──
const lifecycle = Lifecycle.getInstance()
lifecycle.addEventListener('config', () => {})

// ── Apps Script backend URL ──
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxws-OCDahnaiTOLp4kKNKAoio8kDVX9Synbqp7Tbd91eywyDKYf5D4wOSlTehZQGFjhQ/exec'

// ── CORS helper ──
function makeRes(body: unknown, status = 200, origin?: string | null): Response {
  const h = new Headers({ 'Content-Type': 'application/json' })
  if (origin) {
    h.set('Access-Control-Allow-Origin', origin)
    h.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    h.set('Access-Control-Allow-Headers', 'Content-Type,X-Tabserver-Token')
  }
  return new Response(JSON.stringify(body), { status, headers: h })
}

// ── Request handler ──
async function handler(request: Request): Promise<Response> {
  // Lifecycle requests (daemon internal)
  if (Lifecycle.shouldHandle(request)) return lifecycle.handler(request)

  const origin = request.headers.get('Origin')

  // CORS preflight
  if (request.method === 'OPTIONS') return makeRes({}, 200, origin)

  const url = new URL(request.url)
  const path = url.pathname.split('/v1')[1] || '/'

  try {
    // ── /chat — Main conversation endpoint ──
    if (path === '/chat' && request.method === 'POST') {
      const body = await request.json()

      // Extract verified daemon identity from token
      let daemonId: string | null = null
      try {
        const token = Token.from(request)
        if (token) {
          const counterparty = token.getCounterparty()
          if (counterparty) {
            daemonId = counterparty
          }
        }
      } catch (_e) {
        // No valid token — orphan user, proceed without daemonId
      }

      // Build payload for Apps Script
      const payload: Record<string, unknown> = {
        history: body.history || []
      }

      // Only attach daemonId if we have a verified identity
      if (daemonId) {
        payload.daemonId = daemonId
      }

      // Forward to Apps Script
      const appsScriptResponse = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload),
        redirect: 'follow'
      })

      const result = await appsScriptResponse.json()
      return makeRes(result, 200, origin)
    }

    // ── /ping — Health check ──
    if (path === '/ping') {
      const { system: { party } } = Lifecycle.getConfig()
      return makeRes({ ok: true, party, app: 'loyaltystrategist' }, 200, origin)
    }

    // ── Unknown route ──
    return makeRes({ ok: false, error: 'Unknown route: ' + path }, 404, origin)

  } catch (err) {
    console.error('Agent error:', err)
    return makeRes(
      { ok: false, error: 'Agent error: ' + (err instanceof Error ? err.message : String(err)) },
      500,
      origin
    )
  }
}

Deno.serve({ port: 0 }, handler)