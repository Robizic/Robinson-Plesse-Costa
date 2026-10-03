/* ============================================================
   shop.js — boutique : grille, fiche œuvre (galerie), panier,
   stock et paiement.

   Vanilla JS, aucune dépendance, aucun secret. Le navigateur ne
   fait qu'afficher : prix, stock et paiement sont décidés côté
   serveur (worker.js).

   Réglages : products.js (SHOP_OPEN ouvre / ferme la boutique).

   Organisation du fichier
     1. Réglages et données        6. Fiche œuvre (galerie)
     2. Utilitaires                7. Panier (interface)
     3. Stock et Worker            8. Paiement
     4. Panier (état)              9. Événements
     5. Grille                    10. Démarrage
============================================================ */
(() => {
  'use strict';

  /* ============================================================
     1. RÉGLAGES ET DONNÉES
  ============================================================ */
  const CFG         = window.SHOP_CONFIG || {};
  const PRODUCTS    = window.PRODUCTS    || [];
  const CART_KEY    = CFG.cartKey    || 'rpc_cart_v1';
  const PENDING_KEY = CFG.pendingKey || 'rpc_pending_session'; // session Stripe en cours (libère le stock si retour arrière)

  const LOW_STOCK     = 5;    // à partir de 5 exemplaires : texte rouge
  const GALLERY_MAX   = 10;   // images détectées automatiquement : -2 … -10
  const SWAP_MS       = 160;  // fondu entre deux images (= transition CSS .16s)
  const SWIPE_MIN_PX  = 45;   // balayage tactile : distance minimale
  const STOCK_POLL_MS = 60000;

  const byId = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));

  // Éléments de la page, récupérés une fois au démarrage
  const DOM_IDS = [
    'shopRoot',
    'pdp', 'pdpClose', 'pdpStage', 'pdpImg', 'pdpPrev', 'pdpNext', 'pdpCount', 'pdpThumbs',
    'pdpTitle', 'pdpDesc', 'pdpEdition', 'pdpPrice', 'pdpAction', 'pdpError', 'pdpNote',
    'cartToggle', 'cartCount', 'cartBackdrop', 'cartDrawer', 'cartClose', 'cartItems',
    'cartTotal', 'cartError', 'cartCheckout', 'cartContinue'
  ];
  const dom = {};

  /* ============================================================
     2. UTILITAIRES
  ============================================================ */
  const t    = key => window.I18N.t(key);
  const lang = () => window.I18N.lang;

  // Champ d'un produit dans la langue courante (retombe sur le français)
  const field = (p, name) => (lang() === 'en' && p.en && p.en[name]) ? p.en[name] : p[name];

  const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => HTML_ESCAPES[c]);

  const money = (amount, currency) => {
    try {
      return new Intl.NumberFormat(lang() === 'en' ? 'en-GB' : 'fr-FR', {
        style: 'currency', currency: currency || 'EUR',
        minimumFractionDigits: amount % 1 ? 2 : 0, maximumFractionDigits: 2
      }).format(amount);
    } catch (e) { return amount + ' €'; }
  };

  // "shop-gravure-1.jpg" (sans dossier) => "images/shop-gravure-1.jpg"
  const imgSrc = path => {
    path = String(path || '');
    return (path.includes('/') || /^https?:/i.test(path)) ? path : 'images/' + path;
  };

  // Ligne « technique » + ligne « dimensions » d'un produit
  const metaHtml = p =>
    esc(field(p, 'description') || '') + (field(p, 'dimensions') ? '<br>' + esc(field(p, 'dimensions')) : '');

  // localStorage sans jamais planter (navigation privée, stockage plein…)
  const storage = {
    get(key)        { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (e) {} },
    remove(key)     { try { localStorage.removeItem(key); } catch (e) {} }
  };

  const isOpen = el => el.classList.contains('open');

  // Bloque le défilement de la page quand la fiche ou le panier est ouvert
  const syncScrollLock = () => {
    document.body.style.overflow = (isOpen(dom.pdp) || isOpen(dom.cartDrawer)) ? 'hidden' : '';
  };

  /* ============================================================
     3. STOCK ET WORKER
  ============================================================ */
  const stock = {};   // id -> nombre (absent tant que le serveur n'a pas répondu)

  const api        = () => String(CFG.checkoutEndpoint || '').replace(/\/checkout\/?$/, '');
  const configured = () => { const url = api(); return !!url && !url.includes('XXXX'); };
  const postJson   = (path, body) => fetch(api() + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const stockOf = p => (typeof stock[p.id] === 'number' ? stock[p.id] : null);
  const soldOut = p => {
    const s = stockOf(p);
    return p.available === false || (s !== null && s <= 0);
  };
  const maxQty = p => Math.max(1, parseInt(p.maxQty, 10) || 1);
  // Quantité maximale achetable : min(maxQty, stock)
  const limit = p => {
    const s = stockOf(p);
    return s === null ? maxQty(p) : Math.max(0, Math.min(maxQty(p), s));
  };

  // Texte « N exemplaires disponibles » (null si inconnu ou épuisé)
  function stockInfo(p) {
    const s = stockOf(p);
    if (s === null || soldOut(p)) return null;
    const low = s <= LOW_STOCK;
    const key = !low ? 'stockMany' : (s === 1 ? 'stockOne' : 'stockFew');
    return { text: t(key).replace('{n}', s), low };
  }

  function applyStock(data) {
    if (!data || typeof data !== 'object') return;
    PRODUCTS.forEach(p => {
      const n = data[p.id];
      if (typeof n === 'number' && n >= 0) stock[p.id] = Math.floor(n);
    });
    updateStockUI();
  }

  function loadStock() {
    // Mode aperçu : Worker pas encore en ligne => quantités d'essai de products.js
    // (SHOP_CONFIG.previewStock). Ignoré dès que checkoutEndpoint est renseigné.
    if (!configured()) { applyStock(CFG.previewStock); return Promise.resolve(); }
    return fetch(api() + '/stock', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(applyStock)
      .catch(() => { /* hors-ligne : on garde l'affichage actuel */ });
  }

  // Libère la réservation d'un paiement Stripe abandonné (retour arrière)
  function cancelPending() {
    const sessionId = storage.get(PENDING_KEY);
    if (!sessionId || !configured()) return Promise.resolve();
    storage.remove(PENDING_KEY);
    return postJson('/cancel', { session_id: sessionId }).catch(() => {});
  }

  /* ============================================================
     4. PANIER (ÉTAT)
  ============================================================ */
  let cart = [];   // [{ id, qty }]

  const findLine = id => cart.find(line => line.id === id);
  const saveCart = () => storage.set(CART_KEY, JSON.stringify(cart));

  function loadCart() {
    let raw = [];
    try { raw = JSON.parse(storage.get(CART_KEY) || '[]'); } catch (e) {}
    if (!Array.isArray(raw)) raw = [];
    cart = [];
    raw.forEach(item => {
      const p = item && byId[item.id];
      if (!p || soldOut(p) || findLine(p.id)) return;
      cart.push({ id: p.id, qty: Math.min(maxQty(p), Math.max(1, parseInt(item.qty, 10) || 1)) });
    });
  }

  // Aligne le panier sur le stock réel. Renvoie true si quelque chose a changé.
  function reconcileCart() {
    let changed = false;
    cart = cart.filter(line => {
      const p = byId[line.id];
      if (!p || soldOut(p)) { changed = true; return false; }
      const max = limit(p);
      if (line.qty > max) { line.qty = max; changed = true; }
      return true;
    });
    if (changed) saveCart();
    return changed;
  }

  function addToCart(id) {
    const p = byId[id];
    if (!p || soldOut(p) || limit(p) < 1) return;
    const line = findLine(id);
    if (line) line.qty = Math.min(limit(p), line.qty + 1);
    else      cart.push({ id, qty: 1 });
    dom.cartError.textContent = '';
    saveCart(); renderCart(); bumpCartButton(); setCartOpen(true);
  }

  function setQty(id, qty) {
    const p = byId[id], line = findLine(id);
    if (!p || !line) return;
    if (qty < 1) return removeFromCart(id);
    line.qty = Math.min(limit(p), qty);
    saveCart(); renderCart();
  }

  function changeQty(id, delta) {
    const line = findLine(id);
    if (line) setQty(id, line.qty + delta);
  }

  function removeFromCart(id) {
    cart = cart.filter(line => line.id !== id);
    saveCart(); renderCart();
  }

  // Petite animation du bouton panier à chaque ajout
  function bumpCartButton() {
    const btn = dom.cartToggle;
    btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump');
  }

  /* ============================================================
     5. GRILLE
  ============================================================ */
  const soldOutHtml = () => `<span class="shop-link sold-out">${esc(t('soldOut'))}</span>`;
  const addButtonHtml = (p, extraClass = '') =>
    `<button type="button" class="shop-link${extraClass}" data-add="${esc(p.id)}">${esc(t('add'))}</button>`;

  const actionHtml = p => (soldOut(p) ? soldOutHtml() : addButtonHtml(p));

  function stockHtml(p) {
    const info = stockInfo(p);
    return `<span class="shop-stock${info && info.low ? ' is-low' : ''}" data-stock="${esc(p.id)}">${info ? esc(info.text) : ''}</span>`;
  }

  const cardHtml = (p, i) => [
    `<article class="shop-item${soldOut(p) ? ' is-sold' : ''}" data-card="${esc(p.id)}" style="--i:${Math.min(i, 8)}">`,
      `<button type="button" class="shop-img${p.fit === 'cover' ? ' is-cover' : ''}" data-open="${esc(p.id)}" aria-label="${esc(t('view') + field(p, 'title'))}">`,
        `<img src="${esc(imgSrc(p.image))}" alt="${esc(field(p, 'title'))}" loading="lazy">`,
      '</button>',
      `<p class="shop-item-title"><button type="button" class="shop-item-name" data-open="${esc(p.id)}"><em>${esc(field(p, 'title'))}</em></button></p>`,
      `<p class="shop-item-meta">${metaHtml(p)}${stockHtml(p)}</p>`,
      `<div class="shop-item-footer"><span class="shop-price">${esc(money(p.price, p.currency))}</span>`,
        `<span class="shop-action" data-action="${esc(p.id)}" data-sold="${soldOut(p)}">${actionHtml(p)}</span></div>`,
    '</article>'
  ].join('');

  function renderGrid() {
    dom.shopRoot.innerHTML = '<div class="shop-grid">' + PRODUCTS.map(cardHtml).join('') + '</div>';
  }

  // Met à jour stock / bouton SANS redessiner la grille (pas de clignotement)
  function updateStockUI() {
    document.querySelectorAll('[data-card]').forEach(card => {
      const p = byId[card.getAttribute('data-card')];
      if (!p) return;
      const sold = soldOut(p), info = stockInfo(p);
      card.classList.toggle('is-sold', sold);

      const stockEl = card.querySelector('[data-stock]');
      stockEl.textContent = info ? info.text : '';
      stockEl.classList.toggle('is-low', !!(info && info.low));

      const action = card.querySelector('[data-action]');
      if (action.getAttribute('data-sold') !== String(sold)) {
        action.setAttribute('data-sold', String(sold));
        action.innerHTML = actionHtml(p);
      }
    });

    const cartChanged = reconcileCart();
    renderCart();
    if (cartChanged && cart.length) dom.cartError.textContent = t('stockAdjusted');
    if (pdp.id && byId[pdp.id]) refreshPdpInfo(byId[pdp.id]);
  }

  /* ============================================================
     6. FICHE ŒUVRE (galerie)
  ============================================================ */
  // État de la fiche ouverte
  const pdp = { id: null, images: [], index: 0, swapTimer: null, lastFocus: null };
  const autoImages = {};   // id -> images détectées automatiquement (-2, -3, …)

  // Liste explicite (images: [...]) sinon image principale + images détectées
  const galleryOf = p =>
    ((p.images && p.images.length) ? p.images.slice() : [p.image].concat(autoImages[p.id] || [])).map(imgSrc);

  // Détecte shop-xxx-2.jpg, shop-xxx-3.jpg… (même extension) jusqu'à la 1re absente
  function detectGallery(p) {
    if (p.images && p.images.length) return;
    const match = /^(.*?)(\.[A-Za-z0-9]+)$/.exec(imgSrc(p.image));
    if (!match) return;
    const found = [];
    const finish = () => {
      if (!found.length) return;
      autoImages[p.id] = found;
      if (pdp.id === p.id) setGallery(p, true);
    };
    const probe = n => {
      if (n > GALLERY_MAX) return finish();
      const url = `${match[1]}-${n}${match[2]}`, img = new Image();
      img.onload  = () => { found.push(url); probe(n + 1); };
      img.onerror = finish;
      img.src = url;
    };
    probe(2);
  }

  function showImage(src, alt) {
    dom.pdpImg.src = src;
    dom.pdpImg.alt = alt || '';
  }

  // Flèches, compteur « 2 / 3 » et miniature active
  function syncGallery() {
    const count = pdp.images.length, multiple = count > 1;
    dom.pdpPrev.hidden = !multiple;
    dom.pdpNext.hidden = !multiple;
    dom.pdpCount.textContent = multiple ? `${pdp.index + 1} / ${count}` : '';
    document.querySelectorAll('.pdp-thumb').forEach((btn, i) => btn.classList.toggle('is-active', i === pdp.index));
  }

  function setGallery(p, keepIndex) {
    pdp.images = galleryOf(p);
    pdp.index  = keepIndex ? Math.min(pdp.index, pdp.images.length - 1) : 0;
    if (!keepIndex) {
      showImage(pdp.images[pdp.index], field(p, 'title'));
      dom.pdpImg.classList.remove('is-swapping');
    } else {
      dom.pdpImg.alt = field(p, 'title');
    }
    dom.pdpThumbs.innerHTML = pdp.images.length > 1
      ? pdp.images.map((src, i) =>
          `<button type="button" class="pdp-thumb" data-thumb="${i}" aria-label="${esc(t('image') + (i + 1))}"><img src="${esc(src)}" alt=""></button>`
        ).join('')
      : '';
    syncGallery();
  }

  // Passe à l'image i (boucle aux extrémités), avec un fondu court
  function goTo(i) {
    const count = pdp.images.length;
    if (count < 2) return;
    i = (i + count) % count;
    if (i === pdp.index) return;
    pdp.index = i;
    syncGallery();

    const img = dom.pdpImg, alt = dom.pdpTitle.textContent;
    img.classList.add('is-swapping');
    clearTimeout(pdp.swapTimer);
    pdp.swapTimer = setTimeout(() => {
      const done = () => img.classList.remove('is-swapping');
      img.onload = done; img.onerror = done;
      showImage(pdp.images[pdp.index], alt);
      if (img.complete) done();
    }, SWAP_MS);

    // précharge les images voisines
    [pdp.index + 1, pdp.index - 1].forEach(k => { new Image().src = pdp.images[(k + count) % count]; });
  }

  /* ----- Boutons d'achat direct (Apple Pay / Acheter maintenant) ----- */

  // Logo Apple (aperçu uniquement : sur Safari le vrai bouton officiel Apple est utilisé)
  const APPLE_LOGO = '<svg class="pdp-apple" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>';

  // Vrai bouton Apple Pay (rendu par Safari) uniquement si l'appareil le permet
  function applePayNative() {
    try {
      return !!(window.ApplePaySession && window.ApplePaySession.canMakePayments() &&
                window.CSS && CSS.supports('-webkit-appearance', '-apple-pay-button'));
    } catch (e) { return false; }
  }

  // Achat direct (1 exemplaire) vers Stripe Checkout, qui propose Apple Pay,
  // Google Pay, carte, etc. selon l'appareil et les réglages Stripe.
  function buyHtml(p) {
    const id = esc(p.id);
    const more = `<button type="button" class="pdp-more" data-buy="${id}">${esc(t('moreMethods'))}</button>`;

    if (applePayNative()) {
      // bouton officiel Apple (rendu natif par Safari, localisé via lang)
      return `<button type="button" class="pdp-buy pdp-buy--native" data-buy="${id}" lang="${esc(lang())}" aria-label="${esc(t('buyApplePay'))}"></button>` + more;
    }
    if (!configured() && CFG.previewApplePay) {
      // aperçu visuel tant que le Worker n'est pas en ligne (SHOP_CONFIG.previewApplePay)
      return `<button type="button" class="pdp-buy" data-buy="${id}" aria-label="${esc(t('buyApplePay'))}"><span>${esc(t('buyWith'))}</span>${APPLE_LOGO}<span class="pdp-pay">Pay</span></button>` + more;
    }
    return `<button type="button" class="pdp-buy" data-buy="${id}">${esc(t('buyNow'))}</button>` + more;
  }

  /* ----- Contenu de la fiche ----- */

  // Ligne de stock + boutons (mis à jour seuls quand le stock change)
  function refreshPdpInfo(p) {
    const info = stockInfo(p);
    dom.pdpEdition.textContent = info ? info.text : '';
    dom.pdpEdition.classList.toggle('is-low', !!(info && info.low));
    dom.pdpAction.innerHTML = soldOut(p) ? soldOutHtml() : addButtonHtml(p, ' shop-link--primary') + buyHtml(p);
  }

  function fillPdp(p, keepIndex) {
    dom.pdpError.textContent = '';
    dom.pdpTitle.textContent = field(p, 'title');
    setGallery(p, keepIndex);
    dom.pdpDesc.innerHTML = metaHtml(p);
    dom.pdpPrice.textContent = money(p.price, p.currency);
    refreshPdpInfo(p);
    dom.pdpNote.innerHTML = (field(p, 'note') ? esc(field(p, 'note')) + '<br>' : '') + esc(t('pdpShip'));
  }

  function openPdp(id) {
    const p = byId[id];
    if (!p) return;
    pdp.lastFocus = document.activeElement;
    pdp.id = id;
    fillPdp(p);
    dom.pdp.classList.add('open');
    dom.pdp.setAttribute('aria-hidden', 'false');
    dom.pdp.scrollTop = 0;
    syncScrollLock();
    try { history.replaceState(null, '', '#' + encodeURIComponent(p.id)); } catch (e) {}
    dom.pdpClose.focus();
  }

  function closePdp() {
    if (!isOpen(dom.pdp)) return;
    dom.pdp.classList.remove('open');
    dom.pdp.setAttribute('aria-hidden', 'true');
    pdp.id = null;
    syncScrollLock();
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    if (pdp.lastFocus && document.body.contains(pdp.lastFocus)) pdp.lastFocus.focus();
  }

  /* ============================================================
     7. PANIER (interface)
  ============================================================ */
  function cartQtyHtml(p, line) {
    if (limit(p) <= 1) return `<span class="cart-qty"><span>${esc(t('qtyOne'))}</span></span>`;
    return [
      '<div class="cart-qty">',
        `<button type="button" class="cart-qty-btn" data-dec="${esc(p.id)}" aria-label="${esc(t('dec'))}">−</button>`,
        `<span aria-live="polite">${line.qty}</span>`,
        `<button type="button" class="cart-qty-btn" data-inc="${esc(p.id)}" aria-label="${esc(t('inc'))}"${line.qty >= limit(p) ? ' disabled' : ''}>+</button>`,
      '</div>'
    ].join('');
  }

  const cartRowHtml = (p, line) => [
    '<div class="cart-row">',
      `<div class="cart-thumb"><img src="${esc(imgSrc(p.image))}" alt=""></div>`,
      '<div class="cart-info">',
        `<p class="cart-name">${esc(field(p, 'title'))}</p>`,
        `<p class="cart-meta">${esc(field(p, 'description') || '')}</p>`,
        `<div class="cart-line">${cartQtyHtml(p, line)}<span class="shop-price">${esc(money(p.price * line.qty, p.currency))}</span></div>`,
        `<div class="cart-line cart-line--end"><button type="button" class="cart-remove" data-remove="${esc(p.id)}">${esc(t('remove'))}</button></div>`,
      '</div>',
    '</div>'
  ].join('');

  function renderCart() {
    let count = 0, total = 0, currency = 'EUR', rows = '';
    cart.forEach(line => {
      const p = byId[line.id];
      if (!p) return;
      count += line.qty;
      total += p.price * line.qty;
      currency = p.currency || currency;
      rows += cartRowHtml(p, line);
    });
    dom.cartItems.innerHTML = rows || `<p class="cart-empty">${esc(t('cartEmpty'))}</p>`;
    dom.cartTotal.textContent = money(total, currency);
    dom.cartCount.textContent = count;
    dom.cartToggle.hidden = count === 0;
    dom.cartCheckout.disabled = count === 0;
    if (count === 0) setCartOpen(false);
  }

  function setCartOpen(open) {
    dom.cartDrawer.classList.toggle('open', open);
    dom.cartBackdrop.classList.toggle('open', open);
    dom.cartDrawer.setAttribute('aria-hidden', String(!open));
    syncScrollLock();
  }

  /* ============================================================
     8. PAIEMENT
  ============================================================ */
  // Lance Stripe Checkout pour une liste {id, quantity}. Prix et stock sont
  // décidés par le serveur : on n'envoie QUE id + quantité.
  function startCheckout(items, onError) {
    if (!configured()) { onError(t('errConfig')); return; }
    cancelPending()
      .then(() => postJson('/checkout', { lang: lang(), items }))
      .then(r => r.json().catch(() => ({})).then(data => ({ ok: r.ok, status: r.status, data })))
      .then(({ ok, status, data }) => {
        if (!ok || !data.url) {
          if (status === 409) loadStock();   // stock changé entre-temps : on se resynchronise
          throw new Error(data.error || t('errPay'));
        }
        storage.set(PENDING_KEY, data.id || '');
        window.location.href = data.url;
      })
      .catch(err => onError(err.message || t('errNet')));
  }

  // Bouton « Payer » du panier
  function checkoutCart() {
    if (!cart.length) return;
    dom.cartError.textContent = '';
    dom.cartCheckout.disabled = true;
    startCheckout(cart.map(line => ({ id: line.id, quantity: line.qty })), message => {
      dom.cartError.textContent = message;
      dom.cartCheckout.disabled = cart.length === 0;
    });
  }

  // « Acheter maintenant » : 1 exemplaire, sans passer par le panier (le panier n'est pas modifié)
  function buyNow(id) {
    const p = byId[id];
    if (!p || soldOut(p) || limit(p) < 1) return;
    dom.pdpError.textContent = '';
    const buttons = dom.pdpAction.querySelectorAll('button');
    const setBusy = busy => buttons.forEach(btn => { btn.disabled = busy; });
    setBusy(true);
    startCheckout([{ id, quantity: 1 }], message => { dom.pdpError.textContent = message; setBusy(false); });
  }

  /* ============================================================
     9. ÉVÉNEMENTS
  ============================================================ */
  // Un seul écouteur de clic pour tous les boutons marqués data-<action>="<valeur>"
  const ACTIONS = {
    add:    id => { closePdp(); addToCart(id); },
    buy:    buyNow,
    open:   openPdp,
    thumb:  index => goTo(parseInt(index, 10)),
    inc:    id => changeQty(id, +1),
    dec:    id => changeQty(id, -1),
    remove: removeFromCart
  };
  const ACTION_NAMES    = Object.keys(ACTIONS);
  const ACTION_SELECTOR = ACTION_NAMES.map(name => `[data-${name}]`).join(',');

  function bindEvents() {
    document.addEventListener('click', e => {
      const el = e.target.closest(ACTION_SELECTOR);
      if (!el) return;
      const name = ACTION_NAMES.find(n => el.hasAttribute(`data-${n}`));
      ACTIONS[name](el.getAttribute(`data-${name}`));
    });

    dom.cartToggle.addEventListener('click', () => setCartOpen(true));
    dom.cartClose.addEventListener('click', () => setCartOpen(false));
    dom.cartContinue.addEventListener('click', () => setCartOpen(false));
    dom.cartBackdrop.addEventListener('click', () => setCartOpen(false));
    dom.cartCheckout.addEventListener('click', checkoutCart);
    dom.pdpClose.addEventListener('click', closePdp);
    dom.pdpPrev.addEventListener('click', () => goTo(pdp.index - 1));
    dom.pdpNext.addEventListener('click', () => goTo(pdp.index + 1));

    // Clavier : Échap ferme (panier d'abord), ← → changent d'image
    document.addEventListener('keydown', e => {
      const cartOpen = isOpen(dom.cartDrawer), pdpOpen = isOpen(dom.pdp);
      if (e.key === 'Escape')                              { if (cartOpen) setCartOpen(false); else closePdp(); }
      else if (pdpOpen && !cartOpen && e.key === 'ArrowLeft')  goTo(pdp.index - 1);
      else if (pdpOpen && !cartOpen && e.key === 'ArrowRight') goTo(pdp.index + 1);
    });

    // Balayage tactile sur l'image (mobile)
    let startX = 0, startY = 0;
    dom.pdpStage.addEventListener('touchstart', e => {
      startX = e.changedTouches[0].clientX;
      startY = e.changedTouches[0].clientY;
    }, { passive: true });
    dom.pdpStage.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - startX, dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.3) goTo(pdp.index + (dx < 0 ? 1 : -1));
    }, { passive: true });

    // Bascule de langue : on redessine ce qui est généré en JS
    document.addEventListener('langchange', () => {
      renderGrid(); renderCart();
      if (pdp.id && byId[pdp.id]) fillPdp(byId[pdp.id], true);
      dom.cartError.textContent = '';
    });

    // Retour depuis Stripe (cache navigateur) ou modification depuis un autre onglet
    window.addEventListener('pageshow', e => {
      if (!e.persisted) return;
      loadCart(); renderCart(); dom.cartError.textContent = '';
      if (pdp.id && byId[pdp.id]) { refreshPdpInfo(byId[pdp.id]); dom.pdpError.textContent = ''; }
      cancelPending().then(loadStock);
    });
    window.addEventListener('storage', e => {
      if (e.key === CART_KEY) { loadCart(); renderCart(); }
    });

    // Stock : rafraîchi toutes les 60 s et au retour sur l'onglet
    setInterval(() => { if (!document.hidden) loadStock(); }, STOCK_POLL_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) loadStock(); });
  }

  /* ============================================================
     10. DÉMARRAGE
  ============================================================ */
  // Boutique fermée (SHOP_OPEN = false dans products.js) : on retire toute la
  // boutique de la page et on affiche uniquement l'image « coming soon ».
  function showClosedState() {
    document.querySelectorAll('[data-shop-only]').forEach(node => node.remove());
    const template = document.getElementById('shopClosedTpl');
    if (!template) return;
    const view = template.content.firstElementChild.cloneNode(true);
    view.querySelector('img').src = CFG.comingSoonImage || 'images/coming-soon.jpg';
    document.body.appendChild(view);
  }

  function init() {
    if (CFG.shopOpen !== true) { showClosedState(); return; }

    DOM_IDS.forEach(id => { dom[id] = document.getElementById(id); });
    loadCart();
    renderGrid();
    renderCart();
    bindEvents();

    // Stock : au chargement (après libération d'un éventuel paiement abandonné)
    cancelPending().then(loadStock);

    // Galerie : détecte les images -2, -3… de chaque produit
    setTimeout(() => PRODUCTS.forEach(detectGallery), 300);

    // Lien direct vers une œuvre : shop.html#gravure-1
    const hash = decodeURIComponent((location.hash || '').slice(1));
    if (hash && byId[hash]) openPdp(hash);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
