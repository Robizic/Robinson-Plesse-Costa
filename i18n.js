/* ============================================================
   i18n.js — bascule FR / EN (interrupteur style Apple)
   - Textes statiques : attributs data-i18n / data-i18n-html / data-i18n-label
   - Textes dynamiques : window.I18N.t("clé")
   - Choix mémorisé dans localStorage ; par défaut : français
   - Événement "langchange" émis à chaque bascule
============================================================ */
(function () {
  'use strict';

  var KEY = 'rpc_lang_v1';
  var MAIL = '<a href="mailto:robinson.pc@outlook.fr">robinson.pc@outlook.fr</a>';

  var S = {
    fr: {
      headIntro: 'Tirages originaux en édition limitée, numérotés et signés.<br>Contact : ' + MAIL,
      note: 'Expédition sous 5 à 7 jours. Emballage soigné, tubes rigides grands formats. Œuvres envoyées sans cadre. Paiement sécurisé par carte via Stripe.',
      switchLabel: 'Langue : français / anglais',
      viewCart: 'Voir le panier', openCart: 'Ouvrir le panier',
      cart: 'Panier', close: 'Fermer', total: 'Total', pay: 'Payer', continueShopping: 'Continuer mes achats',
      cartNote: 'Les frais de livraison sont ajoutés à l\u2019étape suivante. Paiement sécurisé par Stripe.',
      cartEmpty: 'Votre panier est vide.',
      stockMany: '{n} exemplaires disponibles', stockFew: 'Plus que {n} exemplaires disponibles', stockOne: 'Plus qu\u2019un exemplaire disponible',
      stockAdjusted: 'Certaines quantités ont été ajustées selon le stock disponible.',
      buyApplePay: 'Acheter avec Apple Pay', buyWith: 'Acheter avec', buyNow: 'Acheter maintenant', moreMethods: 'Plus de moyens de paiement',
      add: 'Ajouter au panier', soldOut: 'Épuisé', view: 'Voir : ', remove: 'Retirer',
      prevImg: 'Image précédente', nextImg: 'Image suivante',
      qtyOne: 'Quantité : 1', dec: 'Diminuer la quantité', inc: 'Augmenter la quantité', image: 'Image ',
      pdpShip: 'Expédition sous 5 à 7 jours. Œuvre envoyée sans cadre.',
      errConfig: 'Le paiement n\u2019est pas encore configuré. Écrivez-moi : robinson.pc@outlook.fr',
      errPay: 'Le paiement a échoué. Réessayez dans un instant.',
      errNet: 'Erreur réseau. Vérifiez votre connexion et réessayez.',
      successDoc: 'Commande confirmée — Robinson Plesse-Costa',
      successTitle: 'Commande confirmée',
      successText: 'Merci. Votre paiement a bien été reçu et Stripe vous a envoyé un reçu par e-mail. Je vous contacterai pour l\u2019expédition de votre commande (5 à 7 jours).<br>Contact : ' + MAIL,
      back: '← Retour au shop'
    },
    en: {
      headIntro: 'Original limited-edition prints, numbered and hand-signed.<br>Contact: ' + MAIL,
      note: 'Shipping within 5–7 business days. Careful packaging, rigid tubes for large formats. Works are sent unframed. Secure card payment via Stripe.',
      switchLabel: 'Language: French / English',
      viewCart: 'View cart', openCart: 'Open cart',
      cart: 'Cart', close: 'Close', total: 'Total', pay: 'Checkout', continueShopping: 'Continue shopping',
      cartNote: 'Shipping is added at the next step. Secure payment by Stripe.',
      cartEmpty: 'Your cart is empty.',
      stockMany: '{n} copies available', stockFew: 'Only {n} copies left', stockOne: 'Only 1 copy left',
      stockAdjusted: 'Some quantities were adjusted to the available stock.',
      buyApplePay: 'Buy with Apple Pay', buyWith: 'Buy with', buyNow: 'Buy now', moreMethods: 'More payment options',
      add: 'Add to cart', soldOut: 'Sold out', view: 'View: ', remove: 'Remove',
      prevImg: 'Previous image', nextImg: 'Next image',
      qtyOne: 'Quantity: 1', dec: 'Decrease quantity', inc: 'Increase quantity', image: 'Image ',
      pdpShip: 'Shipping within 5–7 business days. Work is sent unframed.',
      errConfig: 'Checkout is not configured yet. Please email me: robinson.pc@outlook.fr',
      errPay: 'Payment failed. Please try again in a moment.',
      errNet: 'Network error. Check your connection and try again.',
      successDoc: 'Order confirmed — Robinson Plesse-Costa',
      successTitle: 'Order confirmed',
      successText: 'Thank you. Your payment has been received and Stripe has emailed you a receipt. I will contact you about shipping your order (5–7 days).<br>Contact: ' + MAIL,
      back: '← Back to shop'
    }
  };

  var lang = 'fr';
  try { var st = localStorage.getItem(KEY); if (st === 'fr' || st === 'en') lang = st; } catch (e) {}

  function t(k) { return (S[lang] && S[lang][k]) || S.fr[k] || k; }

  function apply() {
    document.documentElement.lang = lang;
    var i, n;
    n = document.querySelectorAll('[data-i18n]');
    for (i = 0; i < n.length; i++) n[i].textContent = t(n[i].getAttribute('data-i18n'));
    n = document.querySelectorAll('[data-i18n-html]');
    for (i = 0; i < n.length; i++) n[i].innerHTML = t(n[i].getAttribute('data-i18n-html'));
    n = document.querySelectorAll('[data-i18n-label]');
    for (i = 0; i < n.length; i++) n[i].setAttribute('aria-label', t(n[i].getAttribute('data-i18n-label')));

    var sw = document.getElementById('langSwitch');
    if (sw) sw.setAttribute('aria-checked', lang === 'en' ? 'true' : 'false');
    n = document.querySelectorAll('[data-setlang]');
    for (i = 0; i < n.length; i++) n[i].classList.toggle('is-active', n[i].getAttribute('data-setlang') === lang);
  }

  function set(l) {
    if (l !== 'fr' && l !== 'en') return;
    if (l === lang) return;
    lang = l;
    try { localStorage.setItem(KEY, lang); } catch (e) {}
    apply();
    document.dispatchEvent(new CustomEvent('langchange', { detail: lang }));
  }

  window.I18N = { t: t, set: set, get lang() { return lang; } };

  function init() {
    var sw = document.getElementById('langSwitch');
    if (sw) sw.addEventListener('click', function () { set(lang === 'fr' ? 'en' : 'fr'); });
    var labels = document.querySelectorAll('[data-setlang]');
    for (var i = 0; i < labels.length; i++) {
      labels[i].addEventListener('click', function (e) { set(e.currentTarget.getAttribute('data-setlang')); });
    }
    apply();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
