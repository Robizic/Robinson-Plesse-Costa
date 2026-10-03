/* ============================================================
   Cloudflare Worker — Stripe Checkout + STOCK PERSISTANT (D1)
   SEULE partie hébergée hors GitHub Pages.

   Routes
     GET  /stock     stock disponible { "gravure-1": 10, ... }
     POST /checkout  vérifie + RÉSERVE le stock, crée la session Stripe
     POST /cancel    libère la réservation si le client revient en arrière
     POST /webhook   (appelé par Stripe) libère le stock d'un paiement
                     expiré ou échoué

   Secrets / variables (jamais dans le code) :
     STRIPE_SECRET_KEY      (secret)  sk_test_... puis sk_live_...
     STRIPE_WEBHOOK_SECRET  (secret)  whsec_...
     SITE_URL               https://robizic.github.io/Robinson-Plesse-Costa
     ALLOWED_ORIGIN         https://robizic.github.io
                            (plusieurs possibles, séparés par des virgules)
     SHIPPING_RATE_ID       (optionnel) shr_...
   Binding D1 : nom de variable  DB

   Principe du stock
     1. Au paiement : stock -= quantité (atomique, jamais négatif).
        Le stock est donc réservé 30 min pour ce client.
     2. Paiement réussi : rien à faire, le stock est déjà décompté.
     3. Paiement abandonné / expiré / échoué : le stock est remis.
============================================================ */

// id du produit (= id dans products.js)
//   priceId : Price ID Stripe (le prix facturé vient d'ici)
//   stock   : stock INITIAL, utilisé une seule fois à la création de la
//             base. Ensuite la base D1 fait foi (voir GUIDE-SHOP.md §14
//             pour réapprovisionner).
//   maxQty  : quantité max par commande
// Les ids : lettres minuscules, chiffres, tirets uniquement.
const CATALOG = {
  "gravure-1": { priceId: "price_REPLACE_ME", stock: 5, maxQty: 5 },
  "gravure-2": { priceId: "price_REPLACE_ME", stock: 20, maxQty: 20 },
  "gravure-3": { priceId: "price_REPLACE_ME", stock: 15, maxQty: 15 },
  "seri-1":    { priceId: "price_REPLACE_ME", stock: 1, maxQty: 1 },
  "seri-2":    { priceId: "price_REPLACE_ME", stock: 1, maxQty: 1 },
  "offset-1":  { priceId: "price_REPLACE_ME", stock: 10, maxQty: 10 }
};

// Pays vers lesquels tu expédies
const ALLOWED_COUNTRIES = ["FR", "BE", "LU", "DE", "NL", "ES", "IT", "PT", "AT", "IE", "CH", "GB"];

const MAX_LINES = 20;
const SESSION_TTL = 31 * 60; // secondes (Stripe impose 30 min minimum)

const MSG = {
  fr: { invalid: "Requête invalide.", cart: "Panier invalide.", unknown: "Article inconnu.",
        qty: "Quantité non autorisée pour un article.",
        stock: "Stock insuffisant : un article n'est plus disponible dans la quantité demandée.",
        pay: "Paiement indisponible pour le moment. Réessayez ou contactez-moi." },
  en: { invalid: "Invalid request.", cart: "Invalid cart.", unknown: "Unknown item.",
        qty: "Quantity not allowed for an item.",
        stock: "Not enough stock: an item is no longer available in the requested quantity.",
        pay: "Checkout is unavailable right now. Please try again or contact me." }
};

/* ---------- base de données ---------- */

let ready = null;
function ensureDb(env) {
  if (!env.DB) throw new Error("Binding D1 'DB' manquant");
  if (!ready) {
    const db = env.DB;
    ready = db.batch([
      db.prepare("CREATE TABLE IF NOT EXISTS stock (id TEXT PRIMARY KEY, qty INTEGER NOT NULL CHECK (qty >= 0))"),
      db.prepare("CREATE TABLE IF NOT EXISTS released (session_id TEXT PRIMARY KEY, at INTEGER NOT NULL)"),
      ...Object.entries(CATALOG).map(([id, c]) =>
        db.prepare("INSERT OR IGNORE INTO stock (id, qty) VALUES (?1, ?2)").bind(id, c.stock))
    ]).catch(e => { ready = null; throw e; });
  }
  return ready;
}

const isConstraint = e => /constraint/i.test(String(e && e.message));

async function readStock(env) {
  const { results } = await env.DB.prepare("SELECT id, qty FROM stock").all();
  const out = {};
  for (const r of results || []) if (Object.prototype.hasOwnProperty.call(CATALOG, r.id)) out[r.id] = r.qty;
  return out;
}

// Décompte atomique : tout ou rien. false si stock insuffisant.
async function reserve(env, lines) {
  const stmts = [...lines].map(([id, q]) =>
    env.DB.prepare("UPDATE stock SET qty = qty - ?1 WHERE id = ?2").bind(q, id));
  let res;
  try { res = await env.DB.batch(stmts); }
  catch (e) { if (isConstraint(e)) return false; throw e; } // CHECK qty>=0 => rollback complet
  if (res.some(r => !r.meta || r.meta.changes !== 1)) { await restore(env, lines); return false; }
  return true;
}

async function restore(env, lines) {
  await env.DB.batch([...lines].map(([id, q]) =>
    env.DB.prepare("UPDATE stock SET qty = qty + ?1 WHERE id = ?2").bind(q, id)));
}

// "id:qty,id:qty" <-> Map
function encodeItems(lines) { return [...lines].map(([id, q]) => id + ":" + q).join(","); }
function parseItems(str) {
  const m = new Map();
  String(str || "").split(",").forEach(pair => {
    const [id, q] = pair.split(":");
    const n = Number(q);
    if (Object.prototype.hasOwnProperty.call(CATALOG, id) && Number.isInteger(n) && n > 0) m.set(id, (m.get(id) || 0) + n);
  });
  return m;
}

// Remet le stock d'une session, UNE seule fois (idempotent par session_id)
async function release(env, sessionId, itemsStr) {
  const lines = parseItems(itemsStr);
  if (!sessionId || !lines.size) return false;
  const stmts = [
    env.DB.prepare("INSERT INTO released (session_id, at) VALUES (?1, ?2)").bind(sessionId, Math.floor(Date.now() / 1000)),
    ...[...lines].map(([id, q]) => env.DB.prepare("UPDATE stock SET qty = qty + ?1 WHERE id = ?2").bind(q, id))
  ];
  try { await env.DB.batch(stmts); return true; }
  catch (e) { if (isConstraint(e)) return false; throw e; } // déjà libéré
}

/* ---------- Stripe ---------- */

async function verifyStripeSignature(raw, header, secret, tolerance = 300) {
  if (!header || !secret) return false;
  let t = null; const v1 = [];
  header.split(",").forEach(kv => {
    const i = kv.indexOf("=");
    const k = kv.slice(0, i).trim(), v = kv.slice(i + 1).trim();
    if (k === "t") t = v; else if (k === "v1") v1.push(v);
  });
  if (!t || !v1.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > tolerance) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(t + "." + raw));
  const hex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
  return v1.some(v => {
    if (v.length !== hex.length) return false;
    let r = 0; for (let i = 0; i < v.length; i++) r |= v.charCodeAt(i) ^ hex.charCodeAt(i);
    return r === 0;
  });
}

const stripeHeaders = env => ({
  "Authorization": "Bearer " + env.STRIPE_SECRET_KEY,
  "Content-Type": "application/x-www-form-urlencoded"
});

/* ---------- HTTP ---------- */

function respond(body, status, cors, extra) {
  return new Response(JSON.stringify(body), {
    status,
    headers: Object.assign({ "Content-Type": "application/json" }, cors, extra || {})
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGIN || "").split(",").map(s => s.trim().replace(/\/$/, "")).filter(Boolean);
    const originOk = allowed.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": originOk ? origin : (allowed[0] || ""),
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    };
    const path = url.pathname;

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    try {
      /* ===== Webhook Stripe (pas de CORS : appelé par Stripe, authentifié par signature) ===== */
      if (path === "/webhook" && request.method === "POST") {
        const raw = await request.text();
        const ok = await verifyStripeSignature(raw, request.headers.get("Stripe-Signature"), env.STRIPE_WEBHOOK_SECRET);
        if (!ok) return respond({ error: "Bad signature" }, 400, {});
        let event;
        try { event = JSON.parse(raw); } catch (e) { return respond({ error: "Bad payload" }, 400, {}); }
        await ensureDb(env);
        if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
          const s = event.data && event.data.object;
          if (s && s.id && s.metadata) await release(env, s.id, s.metadata.items);
        }
        return respond({ received: true }, 200, {});
      }

      /* ===== Stock public (lecture seule) ===== */
      if (path === "/stock" && request.method === "GET") {
        await ensureDb(env);
        return respond(await readStock(env), 200, cors, { "Cache-Control": "no-store" });
      }

      if (request.method !== "POST" || (path !== "/checkout" && path !== "/cancel")) {
        return respond({ error: "Not found" }, 404, cors);
      }
      if (!originOk) return respond({ error: "Origin not allowed" }, 403, cors);
      if (!env.STRIPE_SECRET_KEY || !env.SITE_URL) return respond({ error: "Server not configured" }, 500, cors);

      let payload;
      try {
        const text = await request.text();
        if (text.length > 5000) throw new Error("too large");
        payload = JSON.parse(text);
      } catch (e) {
        return respond({ error: MSG.fr.invalid }, 400, cors);
      }

      /* ===== Annulation : le client est revenu en arrière depuis Stripe ===== */
      if (path === "/cancel") {
        const sid = payload && payload.session_id;
        if (typeof sid !== "string" || !/^cs_[A-Za-z0-9_]+$/.test(sid)) return respond({ error: MSG.fr.invalid }, 400, cors);
        await ensureDb(env);
        const r = await fetch("https://api.stripe.com/v1/checkout/sessions/" + sid + "/expire", {
          method: "POST", headers: stripeHeaders(env), body: ""
        });
        const s = await r.json();
        // Si la session était déjà payée, Stripe refuse d'expirer : on ne touche à rien.
        if (r.ok && s.status === "expired" && s.metadata) await release(env, s.id, s.metadata.items);
        return respond({ ok: true }, 200, cors);
      }

      /* ===== Checkout ===== */
      const lang = payload && payload.lang === "en" ? "en" : payload && payload.lang === "fr" ? "fr" : "auto";
      const M = MSG[lang] || MSG.fr;

      const items = payload && payload.items;
      if (!Array.isArray(items) || items.length === 0 || items.length > MAX_LINES) {
        return respond({ error: M.cart }, 400, cors);
      }

      const lines = new Map(); // fusionne les doublons
      for (const it of items) {
        const entry = it && typeof it.id === "string" && Object.prototype.hasOwnProperty.call(CATALOG, it.id) ? CATALOG[it.id] : null;
        const qty = it && Number.isInteger(it.quantity) ? it.quantity : 0;
        if (!entry || qty < 1) return respond({ error: M.unknown }, 400, cors);
        const total = (lines.get(it.id) || 0) + qty;
        if (total > entry.maxQty) return respond({ error: M.qty }, 400, cors);
        lines.set(it.id, total);
      }
      const itemsStr = encodeItems(lines);
      if (itemsStr.length > 480) return respond({ error: M.cart }, 400, cors); // limite metadata Stripe

      await ensureDb(env);

      // 1) Réservation atomique du stock (jamais en dessous de 0)
      if (!(await reserve(env, lines))) return respond({ error: M.stock }, 409, cors);

      // 2) Session Stripe — le prix vient de CATALOG, jamais du navigateur
      const site = env.SITE_URL.replace(/\/$/, "");
      const p = new URLSearchParams();
      p.set("mode", "payment");
      p.set("success_url", site + "/success.html?session_id={CHECKOUT_SESSION_ID}");
      p.set("cancel_url", site + "/shop.html");
      p.set("locale", lang);
      p.set("expires_at", String(Math.floor(Date.now() / 1000) + SESSION_TTL));
      p.set("phone_number_collection[enabled]", "true");
      ALLOWED_COUNTRIES.forEach((c, i) => p.set(`shipping_address_collection[allowed_countries][${i}]`, c));
      if (env.SHIPPING_RATE_ID) p.set("shipping_options[0][shipping_rate]", env.SHIPPING_RATE_ID);
      let i = 0;
      for (const [id, qty] of lines) {
        p.set(`line_items[${i}][price]`, CATALOG[id].priceId);
        p.set(`line_items[${i}][quantity]`, String(qty));
        i++;
      }
      p.set("metadata[items]", itemsStr);

      let data;
      try {
        const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
          method: "POST", headers: stripeHeaders(env), body: p.toString()
        });
        data = await res.json();
        if (!res.ok || !data.url) { console.log("Stripe error:", JSON.stringify(data.error || data)); data = null; }
      } catch (e) { console.log("Stripe fetch failed:", String(e)); data = null; }

      if (!data) {
        await restore(env, lines); // la session n'existe pas : on rend le stock
        return respond({ error: M.pay }, 502, cors);
      }
      return respond({ url: data.url, id: data.id }, 200, cors);
    } catch (e) {
      console.log("Worker error:", String(e && e.stack || e));
      return respond({ error: "Server error" }, 500, cors);
    }
  }
};
