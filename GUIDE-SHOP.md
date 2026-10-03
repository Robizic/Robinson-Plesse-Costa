# Guide — Boutique Stripe (GitHub Pages + 1 Worker Cloudflare)

## 1. Ce qui a été fait

| Fichier | Statut | Rôle |
|---|---|---|
| `shop.html` | **modifié** | Overlay « coming soon » retiré ; grille générée par JS (mêmes classes CSS) ; panier ; note « paiement par virement/PayPal » remplacée par Stripe |
| `styles.css` | **modifié (ajout en fin de fichier uniquement)** | Bloc `SHOP — PANIER`. Rien d'existant n'est changé |
| `products.js` | **nouveau** | Liste des produits (seul fichier à éditer) + URL du Worker |
| `shop.js` | **nouveau** | Rendu, panier (localStorage), appel au checkout |
| `success.html` | **nouveau** | Page de confirmation (vide le panier) |
| `worker/worker.js` | **nouveau** | Fonction serverless (à héberger sur Cloudflare) |
| `worker/wrangler.toml` | nouveau, optionnel | Seulement pour déploiement en ligne de commande |

Non touchés : `index.html`, `cursor.js`, `robots.txt`, `sitemap.xml`, fichier Google, header, menu, projets, About.

**Emplacement** : `shop.html`, `styles.css`, `products.js`, `shop.js`, `success.html` à la **racine de ton repo** (à côté de `index.html`). Le dossier `worker/` n'a pas besoin d'être dans le repo (voir §6).

## 2. Ce qui est hébergé où

- **GitHub Pages** : tout le site (HTML/CSS/JS, images). Aucun secret.
- **Cloudflare Workers** (gratuit, 100 000 requêtes/jour, pas d'abonnement) : uniquement `worker.js`, qui détient la clé secrète Stripe et crée la session de paiement.
- **Stripe** : page de paiement, reçus e-mail, gestion des cartes.

## 3. Configurer Stripe

1. Crée un compte sur stripe.com. Reste en **mode Test** (interrupteur en haut à droite du dashboard).
2. **Product catalog → Add product** pour chaque œuvre : nom, image, prix **one-time** en EUR (le même prix que dans `products.js`). Après création, copie le **Price ID** (`price_...`) dans la section Pricing.
3. **Frais de port** : Product catalog → *Shipping rates* → crée un tarif (ex. 9 € ou 0 €) et copie son ID `shr_...` (optionnel mais recommandé ; plusieurs tarifs possibles en adaptant le Worker).
4. **Clé secrète** : Developers → API keys → *Secret key* `sk_test_...` (à ne coller QUE dans Cloudflare, jamais dans GitHub).
5. **Notifications** : Settings → Business → *Customer emails* → active les reçus ; Settings → Notifications → active l'e-mail « paiement réussi » pour être prévenu de chaque vente. Aucun webhook n'est nécessaire dans cette version simple.

## 4. Relier les produits aux Price IDs

Chaque produit a le **même `id`** à deux endroits :

- `products.js` → ce que le visiteur voit (titre, image, prix affiché).
- `worker/worker.js` → `CATALOG["gravure-1"] = { priceId: "price_...", stock, maxQty }` (`stock` = stock de départ, voir §14).

**Ajouter** un produit : 1) crée-le dans Stripe, 2) copie un bloc dans `products.js`, 3) ajoute la ligne dans `CATALOG`, 4) redéploie le Worker (copier-coller) et pousse `products.js` sur GitHub.
**Retirer** : supprime le bloc des deux côtés.
**Stock** : il n'est plus géré à la main dans `available`. Il vit dans la base D1 du Worker (voir §14) ; à 0, le produit passe tout seul en « Épuisé ».

> Dérogation volontaire à ta structure de données : `stripePriceId` n'est pas dans `products.js` mais dans le Worker. Le navigateur ne décide ainsi jamais de ce qui est facturé.

> Le prix affiché dans `products.js` est cosmétique ; le prix facturé est celui du Price Stripe. Garde-les identiques.

## 5. Sécurité (vérifié)

- Aucune clé secrète dans HTML/CSS/JS : le front n'a ni clé publique ni secrète (Stripe Checkout hébergé, redirection par URL).
- Le navigateur n'envoie que `{id, quantity}`. Le Worker ignore tout prix venu du client et utilise ses Price IDs.
- Le Worker rejette : origine inconnue (CORS + contrôle `Origin`), id inconnu, quantité ≤ 0 / non entière / > `maxQty`, produit `available:false`, plus de 20 lignes, corps > 5 Ko (testé en local).
- Les erreurs détaillées Stripe restent dans les logs du Worker, pas renvoyées au visiteur.
- Le stock est géré côté serveur (§14) : réservé atomiquement à l'ouverture du paiement, jamais négatif, remis si le paiement est abandonné.

## 6. Déployer le Worker (méthode sans terminal)

1. Compte gratuit sur dash.cloudflare.com → **Workers & Pages → Create → Create Worker** → nomme-le `rpc-shop-checkout` → Deploy.
2. **Edit code** → remplace tout par le contenu de `worker/worker.js` (avec tes Price IDs) → Deploy.
3. **Settings → Variables and Secrets** :
   - `STRIPE_SECRET_KEY` (type **Secret**) = `sk_test_...`
   - `SITE_URL` (Text) = `https://robizic.github.io/Robinson-Plesse-Costa`
   - `ALLOWED_ORIGIN` (Text) = `https://robizic.github.io`
   - `SHIPPING_RATE_ID` (Text, optionnel) = `shr_...`
   - `STRIPE_WEBHOOK_SECRET` (Secret) et le binding D1 `DB` : voir §14
4. Ton URL est `https://rpc-shop-checkout.<ton-compte>.workers.dev`. Dans `products.js`, mets :
   `checkoutEndpoint: "https://rpc-shop-checkout.<ton-compte>.workers.dev/checkout"`

(Alternative terminal : `npx wrangler deploy` puis `npx wrangler secret put STRIPE_SECRET_KEY` dans le dossier `worker/`.)

## 7. Déployer le front sur GitHub Pages

1. Copie les fichiers à la racine du repo `Robinson-Plesse-Costa`, remplace `shop.html` et `styles.css`.
2. Vérifie que les images existent (`images/shop-gravure-1.jpg`, etc.) ; adapte les chemins dans `products.js`.
3. `git add . && git commit -m "Shop Stripe" && git push` → en ligne en ~1 min.

## 8. Tester sans vraie transaction

Avec la clé `sk_test_...` et des Price IDs **de test** :
- Carte réussie : `4242 4242 4242 4242`, date future, CVC et code postal au choix.
- Carte refusée : `4000 0000 0000 0002`. 3D Secure : `4000 0027 6000 3184`.
- Vérifie : ajout → panier → quantité (produit `offset-1`) → total → Stripe → paiement → retour sur `success.html` → panier vidé.
- Annulation : bouton retour sur Stripe → retour sur `shop.html`, panier conservé.
- Le paiement apparaît dans Stripe (mode Test) → Payments.
- Test local : `python3 -m http.server 8000`, et mets `ALLOWED_ORIGIN` = `https://robizic.github.io,http://localhost:8000`.

## 9. Checklist avant production

- [ ] Compte Stripe activé (identité, IBAN) ; passage en mode **Live**
- [ ] Produits et **Shipping rate recréés en mode Live** (les IDs `price_`/`shr_` sont différents)
- [ ] `CATALOG` du Worker mis à jour avec les Price IDs live ; `SHIPPING_RATE_ID` live
- [ ] Secret `STRIPE_SECRET_KEY` remplacé par `sk_live_...` dans Cloudflare
- [ ] `ALLOWED_ORIGIN` = uniquement `https://robizic.github.io` (retirer localhost)
- [ ] `checkoutEndpoint` correct dans `products.js`, aucun `XXXX` restant
- [ ] Prix de `products.js` = prix Stripe ; vrais titres / images / dimensions
- [ ] Un vrai paiement de quelques euros, puis remboursement depuis le dashboard
- [ ] Recherche `sk_` dans tout le repo : aucun résultat
- [ ] Reçus Stripe + notification de vente activés ; nom de l'entreprise et logo configurés dans Stripe (Branding)
- [ ] Mentions légales, CGV, droit de rétractation (vente à distance en UE : 14 jours, sauf œuvres personnalisées) et politique de retour à ajouter sur le site (Stripe permet d'afficher un lien CGV dans Checkout)
- [ ] Statut fiscal (TVA / micro-entreprise / Maison des Artistes) vérifié pour les factures
- [ ] Test sur iPhone et Android (panier, scroll bloqué, bouton retour)

## 10. Remarques sur l'existant (non modifié)

- `favicon` en chemin absolu `/images/favicon.png` : sur GitHub Pages en sous-dossier (`/Robinson-Plesse-Costa/`) il pointe vers la racine du domaine, donc ne se charge pas. `success.html` utilise un chemin relatif.
- `sitemap.xml` : `index.html` est listé deux fois, les pages projets n'existent pas, et l'`xmlns` devrait être `http://www.sitemaps.org/schemas/sitemap/0.9`. À corriger plus tard, si tu veux ; ajoute `shop.html`.

---

## 11. Refonte visuelle du Shop (v2)

Modifiés : `styles.css` (bloc `SHOP` remplacé, le reste du fichier est identique), `shop.html`, `shop.js`, `products.js`. Le header, le menu, les projets, l'About et le cursor ne sont pas touchés.

- **Lisibilité** : textes nettement plus grands (les anciens faisaient 7 à 10 px), contraste relevé, boutons de 44 px minimum de haut.
- **Œuvres montrées entières** sur un fond « passe-partout », sans recadrage. Pour remplir le cadre, ajoute `fit: "cover"` au produit.
- **Filtres** par catégorie (Tout / Gravure / Sérigraphie / Éditions) et compteur de pièces. Libellés dans `SHOP_SECTIONS`.
- **Fiche œuvre** plein écran au clic sur l'image ou le titre. Lien direct possible : `shop.html#gravure-1`. Champs optionnels dans `products.js` : `images: [...]` (galerie), `note: "..."` (phrase sous le bouton).
- **Panier** : bouton « Voir le panier (n) » en bas de page (pleine largeur sur mobile), tiroir plus lisible, bouton « Payer » plein, lien « Continuer mes achats ».
- **Mouvement** : un seul fondu échelonné à l'affichage de la grille ; désactivé si le visiteur a réduit les animations.
- `badge` s'affiche tel quel (« 3 / 10 », « Édition ouverte ») : écris-y le texte voulu, par exemple « Édition de 10 ».

---

## 12. Sans catégories + interrupteur FR / EN (v3)

- **Catégories retirées** : plus de filtres ni de compteur ; tous les produits s'affichent ensemble, dans l'ordre de `products.js`. Les champs `section` et `SHOP_SECTIONS` n'existent plus.
- **Interrupteur FR / EN** (style iOS) en haut à droite du Shop et de la page de confirmation. Le choix est mémorisé ; le français reste la langue par défaut.
- **Nouveau fichier `i18n.js`** (à placer à la racine, à côté de `shop.js`). Il contient tous les textes de l'interface en FR et EN.
- **Produits** : la traduction de chaque œuvre est dans son champ `en: { title, description, dimensions, badge, note }` dans `products.js`. Un champ absent reprend le français.
- **Stripe Checkout** s'ouvre dans la langue choisie. Les noms de produits affichés sur la page Stripe viennent de Stripe : ils restent dans la langue saisie dans le dashboard.
- **Worker** : `worker/worker.js` a changé (langue du checkout et messages d'erreur FR/EN). **Pense à le recopier dans Cloudflare** (Edit code, puis Deploy).
- **Limite** : la bascule couvre le Shop et la page de confirmation. `index.html` (projets, About) reste en français ; il faudrait y ajouter l'interrupteur et les traductions pour l'étendre.

---

## 13. Croix de fermeture + galerie d'images (v4)

- Les boutons « Fermer » (fiche œuvre et panier) sont remplacés par une **croix** dessinée en CSS (deux traits, comme ton menu hamburger). L'étiquette « Fermer / Close » reste lue par les lecteurs d'écran (`aria-label`).
- **Galerie dans la fiche œuvre** : flèches ‹ › de chaque côté de l'image, compteur « 2 / 3 », miniatures cliquables, touches du clavier ← →, balayage du doigt sur mobile, fondu entre les images, retour au début après la dernière.
- Pour activer la galerie, ajoute le champ `images` à un produit dans `products.js` (vue d'ensemble en premier, puis détails, photos rapprochées, vue en situation). Sans ce champ : une seule image, sans flèches.
- Fichiers modifiés : `shop.html`, `shop.js`, `styles.css`, `i18n.js`, `products.js` (commentaire d'exemple uniquement).


---

## 14. Stock réel, badges retirés, galerie automatique (v5)

### Ce qui a changé
- **Badges « 3 / 10 » supprimés** de l'image. À la place, une ligne de stock sous la description (et dans la fiche œuvre) :
  - plus de 5 : « 15 exemplaires disponibles »
  - 5 ou moins, en **rouge** : « Plus que 5 exemplaires disponibles » … « Plus qu'un exemplaire disponible »
  - 0 : le bouton devient « Épuisé » / « Sold out » (rien d'autre n'est affiché)
- **Stock persistant** : base **Cloudflare D1** (gratuite, sans abonnement) liée au Worker. Le navigateur ne fait qu'afficher (`GET /stock`, rafraîchi toutes les 60 s) ; il ne peut ni le modifier ni le contourner.
- **Galerie automatique** : dépose `shop-gravure-1-2.jpg`, `shop-gravure-1-3.jpg`… (même extension que `shop-gravure-1.jpg`, jusqu'à `-10`) dans `images/` : elles deviennent les images d'UNE seule fiche, sans toucher à `products.js`. Tu peux aussi les lister à la main : `images: ["shop-gravure-1.jpg", "shop-gravure-1-2.jpg"]` (le dossier `images/` est ajouté tout seul).

### Comment le stock suit les ventes
1. Le client clique sur **Payer** : le Worker retire les quantités du stock, en une opération atomique et jamais sous 0 (deux clients ne peuvent pas acheter le dernier exemplaire). Le stock est **réservé 30 min**.
2. **Paiement réussi** : rien d'autre à faire, le stock est déjà décompté.
3. **Paiement abandonné ou échoué** : le stock est remis (immédiatement si le client revient en arrière depuis Stripe ; sinon par le webhook à l'expiration des 30 min).
Le stock affiché est donc le stock réellement achetable.

### Mise en place (une seule fois)
1. **Créer la base** : dashboard Cloudflare → *Storage & databases* → *D1 SQL database* → *Create* → nom `rpc-shop-stock`. Les tables sont créées et remplies par le Worker au premier appel : rien à saisir.
2. **La relier au Worker** : Workers & Pages → ton Worker → *Settings* → *Bindings* → *Add* → *D1 database* → nom de variable **`DB`** → base `rpc-shop-stock` → Deploy.
3. **Recopier `worker/worker.js`** (Edit code → Deploy) après avoir mis tes Price IDs et le `stock` de départ de chaque produit dans `CATALOG`.
4. **Webhook Stripe** (indispensable pour remettre le stock des paiements abandonnés) : Stripe → Developers → *Webhooks* → *Add endpoint* :
   - URL : `https://<ton-worker>.workers.dev/webhook`
   - Événements : `checkout.session.expired`, `checkout.session.async_payment_failed` (et `checkout.session.completed`, facultatif)
   - Copie la clé de signature `whsec_...` dans Cloudflare : *Settings → Variables and Secrets* → secret **`STRIPE_WEBHOOK_SECRET`**.
   - Mode Test et mode Live ont chacun leur endpoint et leur `whsec_` : refais l'étape au passage en Live.

> Sans le webhook, rien ne casse mais le stock des paiements abandonnés n'est jamais remis (il ne peut que baisser, jamais être survendu).

### Gérer le stock ensuite
Le `stock` de `CATALOG` n'est lu **qu'une fois**, à la création de la base. Ensuite c'est D1 qui fait foi. Dans Cloudflare → D1 → ta base → *Console* :
- voir : `SELECT * FROM stock;`
- réapprovisionner / corriger : `UPDATE stock SET qty = 20 WHERE id = 'gravure-1';`
- bloquer la vente d'un produit : `UPDATE stock SET qty = 0 WHERE id = 'gravure-1';`
Nouveau produit : ajoute-le à `products.js` **et** à `CATALOG` (avec son `stock` de départ) : sa ligne est créée automatiquement.

### Tester
- Mode Test : ouvre un paiement, vérifie que le stock baisse sur le Shop (rechargé), puis clique sur « retour » dans Stripe : le stock revient.
- Paie avec `4242 4242 4242 4242` : le stock reste décompté.
- Dans la console D1, mets un produit à `qty = 1` et essaie d'en acheter 2 : refusé.

### Limites
- Un client qui ouvre Stripe bloque ses exemplaires jusqu'à 30 min s'il abandonne sans revenir sur le site (ils reviennent alors à l'expiration).
- Quotas gratuits Cloudflare (D1 et Workers) très largement suffisants pour une boutique d'artiste.
- Pas de remise en stock automatique après un remboursement : fais-le avec la requête `UPDATE` ci-dessus.

### Fichiers modifiés
`worker/worker.js` (réécrit : stock, `/stock`, `/cancel`, `/webhook`), `worker/wrangler.toml`, `shop.js`, `i18n.js`, `styles.css` (retrait du badge, texte rouge), `success.html` (1 ligne), `products.js` (badges retirés, commentaires). Inchangés : `shop.html`, header, menu, projets, About, cursor.

---

## 15. Achat direct « Apple Pay » + « Plus de moyens de paiement » (v6)

Dans la fiche œuvre, sous « Ajouter au panier » :
1. un bouton d'achat direct (1 exemplaire, sans passer par le panier, le panier n'est pas modifié) ;
2. en dessous, un petit lien souligné « Plus de moyens de paiement ».

Les deux ouvrent **Stripe Checkout** pour ce seul produit. Le prix et le stock sont toujours vérifiés par le Worker.

### Selon l'appareil (comme Shopify)
- **iPhone / iPad / Mac Safari avec Apple Pay** : le bouton officiel Apple « Acheter avec Apple Pay » (rendu par Safari, c'est le seul conforme aux règles d'Apple).
- **Autres appareils** : un bouton « Acheter maintenant ». Un bouton « Apple Pay » n'aurait pas de sens sans Apple Pay.
- **Aperçu** : tant que le Worker n'est pas configuré (`checkoutEndpoint` avec `XXXX`) et que `previewApplePay: true` est dans `products.js`, un rendu « Acheter avec  Pay » s'affiche dans tous les navigateurs pour voir la mise en page. Ce réglage est ignoré dès que le Worker est configuré.

### Pour que Apple Pay (et autres) apparaisse vraiment
Aucun changement dans le Worker : Stripe affiche les moyens de paiement activés dans ton compte.
Stripe → Paramètres → *Moyens de paiement* : active **Apple Pay**, **Google Pay**, **Link**, cartes, etc. Apple Pay fonctionne sur la page Checkout hébergée par Stripe sans configuration de domaine. Il n'apparaît que sur un appareil Apple avec une carte dans Wallet.
Le lien « Plus de moyens de paiement » mène à la même page Stripe, où tous les moyens activés sont listés.

### Fichiers modifiés
`shop.js`, `styles.css`, `i18n.js`, `shop.html` (une zone de message d'erreur dans la fiche). Le Worker n'est pas modifié.

---

## 16. Ouvrir / fermer le Shop + organisation du code (v7)

### Ouvrir ou fermer le Shop
Une seule valeur, tout en haut de `products.js` :

```js
const SHOP_OPEN = true;    // boutique ouverte
const SHOP_OPEN = false;   // boutique fermée : image « coming soon »
```

Boutique fermée, la page `shop.html` affiche uniquement l'image `images/coming-soon.jpg` en plein écran (le header et le menu mobile restent utilisables). Les produits, la fiche œuvre, le panier et les boutons d'achat sont retirés de la page, et le navigateur n'appelle plus le Worker. Un lien direct du type `shop.html#gravure-1` n'ouvre rien.
Pour changer le nom ou l'emplacement de l'image : `comingSoonImage` dans `products.js`.

Limite à connaître : c'est un interrupteur du **site**. Il n'empêche pas quelqu'un qui connaîtrait l'adresse du Worker d'appeler directement `/checkout`. Pour une fermeture totale, mets aussi le Worker en pause dans Cloudflare.

### Organisation des fichiers
| Fichier | Rôle |
|---|---|
| `products.js` | **Réglages** : `SHOP_OPEN`, image coming soon, adresse du Worker, aperçus, liste des produits |
| `shop.js` | Logique du Shop, découpée en 10 sections numérotées (utilitaires, stock, panier, grille, fiche, paiement, événements, démarrage) |
| `site.js` | Menu hamburger et curseur des pages Shop et Confirmation (auparavant recopiés dans chaque page) |
| `i18n.js` | Textes FR / EN |
| `shop.html`, `success.html` | Pages. Dans `shop.html`, tout ce qui est retiré quand le Shop est fermé porte l'attribut `data-shop-only` |
| `styles.css` | Sommaire en haut, une seule déclaration de variables, Shop regroupé à la fin |
| `worker.js`, `wrangler.toml` | Inchangés |

### Nettoyage effectué
- JS : un seul écouteur de clic piloté par un tableau d'actions ; état de la fiche regroupé ; fonctions ouvrir/fermer du panier fusionnées ; clés de stockage partagées via `SHOP_CONFIG` (`cartKey`, `pendingKey`) au lieu d'être écrites à deux endroits.
- CSS : variables du Shop fusionnées dans le `:root` principal ; règles en double regroupées ; règles sans effet supprimées (`.slider-track.snapping`, une déclaration `padding` invalide sur `.project-slider`, `width` écrasé par `min-width` sur `.about-block strong`, deux `em` jamais utilisés) ; un style écrit en ligne dans le JS remplacé par la classe `.cart-line--end`.
- Vérification : 46 scénarios comparés avant/après (grille FR/EN, survols, fiche, galerie, panier, erreurs, menu mobile, confirmation, accueil, mouvement réduit) sur les styles calculés de tous les éléments, le HTML généré et les captures : aucune différence.
