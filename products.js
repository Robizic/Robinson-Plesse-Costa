/* ============================================================
   products.js — LE fichier de réglages de la boutique
   (réglages + liste des produits à afficher).
   Les prix réellement facturés et le stock sont gérés côté
   serveur (worker.js + Stripe) : voir GUIDE-SHOP.md.
============================================================ */


/* ============================================================
   ★ OUVRIR / FERMER LE SHOP ★   (le seul endroit à modifier)

   true  → boutique ouverte
   false → boutique fermée : la page Shop affiche uniquement
           l'image « coming soon » (voir comingSoonImage plus bas).
           Aucun produit, aucun bouton d'achat, aucun panier.
============================================================ */
const SHOP_OPEN = true;


window.SHOP_CONFIG = {
  shopOpen: SHOP_OPEN,

  // Image affichée en plein écran quand le Shop est fermé
  comingSoonImage: "images/coming-soon.jpg",

  // URL de ton Cloudflare Worker (voir guide) + /checkout
  checkoutEndpoint: "https://XXXX.workers.dev/checkout",

  // APERÇU UNIQUEMENT : affiche un bouton « Acheter avec Apple Pay » sur les
  // navigateurs qui ne sont pas Safari/Apple, pour voir la mise en page.
  // Sur iPhone/Mac, Safari affiche le vrai bouton officiel Apple Pay.
  // Désactivé automatiquement dès que le Worker est configuré.
  previewApplePay: true,

  // APERÇU UNIQUEMENT : quantités d'essai affichées tant que le Worker n'est
  // pas configuré (checkoutEndpoint contient encore "XXXX"). Aucun effet sur
  // les ventes. Dès que tu mets la vraie adresse du Worker, ce bloc est ignoré
  // (le vrai stock vient du serveur) : tu peux alors le supprimer.
  previewStock: {
    "gravure-1": 5,
    "gravure-2": 20,
    "gravure-3": 15,
    "seri-1":    20,
    "seri-2":    3,
    "offset-1":  3
  },

  // Technique — noms des données gardées dans le navigateur (ne pas modifier)
  cartKey:    "rpc_cart_v1",
  pendingKey: "rpc_pending_session"
};


/* ============================================================
   PRODUITS
============================================================ */
/* Un produit = un objet. Pour ajouter : copie un bloc, change l'id.
   Pour retirer : supprime le bloc. L'ordre ici = l'ordre d'affichage.
   - id         : identique à celui du CATALOG dans worker/worker.js
   - description: ligne 1 (technique, année)
   - dimensions : ligne 2 (format — papier)
   - price      : AFFICHAGE uniquement, doit égaler le prix Stripe
   - STOCK      : n'est PAS ici. Le stock réel est géré côté serveur
                  (base D1 du Worker, voir worker.js) : il s'affiche tout seul sous la
                  description et diminue à chaque vente. Voir GUIDE-SHOP.md §14.
   - available  : (optionnel) false => "Épuisé" quoi qu'il arrive
   - maxQty     : quantité max par commande (1 pour une pièce unique)
   - en         : traduction anglaise { title, description, dimensions,
                  note } — tout champ absent reprend le français
   Champs optionnels :
   - images     : galerie de la fiche (flèches, clavier ← →, balayage mobile).
                  AUTOMATIQUE : si tu déposes shop-gravure-1-2.jpg,
                  shop-gravure-1-3.jpg… à côté de shop-gravure-1.jpg (même
                  extension, jusqu'à -10), elles sont ajoutées toutes seules.
                  Pour choisir l'ordre ou les noms toi-même :
                  images: ["shop-gravure-1.jpg", "shop-gravure-1-2.jpg"]
                  (le dossier images/ est ajouté si tu ne l'écris pas)
                  Une seule image : pas de flèches.
   - note       : phrase affichée sous le bouton d'achat dans la fiche
   - fit        : "cover" pour remplir le cadre (par défaut l'œuvre est
                  montrée entière sur un fond passe-partout)             */
window.PRODUCTS = [
  {
    id: "gravure-1",
    title: "Panopticon City", image: "images/shop-gravure-1.jpg",
    description: "Gravure sur bois gravé en plaque perdue, 3 passages,", dimensions: "54 x 67 cm papier ivoire 250 g",
    price: 250, currency: "EUR", available: true, maxQty: 5,
    en: { title: "Panopticon City", description: "Woodcut, 3 passes", dimensions: "54 x 67 cm, 250 g ivory paper" }
  },
  {
    id: "gravure-2",
    title: "Melencolia", image: "images/shop-gravure-2.jpg",
    description: "Risographie quadrichromie", dimensions: "29,7 x 42 cm papier recyclé 180 g",
    price: 15, currency: "EUR", available: true, maxQty: 20,
    en: { title: "Melencolia", description: "Four-color Risograph printing", dimensions: "29.7 x 42 cm 180 g recycled paper" }
  },
  {
    id: "gravure-3",
    title: "Gloria Nazarenorum", image: "images/shop-gravure-3.jpg",
    description: "Livre sérigraphié. Recueil de dessins et gravures, 16 pages, imprimé en trois couleurs,", dimensions: "21 x 30 cm papier ivoir 300 g",
    price: 25, currency: "EUR", available: true, maxQty: 15,
    en: { title: "Gloria Nazarenorum", description: "Screen-printed book. Collection of drawings and engravings, 16 pages, printed in three colors,", dimensions: "21 x 30 cm papier ivoir 300 g" }
  },
  {
    id: "seri-1",
    title: "Anatomix", image: "images/shop-seri-1.jpg",
    description: "Risographie trichromie", dimensions: "13 x 20 cm papier 200 g",
    price: 6, currency: "EUR", available: true, maxQty: 20,
    en: { title: "Anatomix", description: "Three-color Risograph printing", dimensions: "13 x 20 cm 200 g paper" }
  },
  {
    id: "seri-2",
    title: "La Soupe à la Belladone", image: "images/shop-seri-2.jpg",
    description: "Gravure sur bois", dimensions: "65 x 50 cm BFK Rives 250 g",
    price: 190, currency: "EUR", available: true, maxQty: 3,
    en: { title: "Belladonna Soup", description: "Woodcut", dimensions: "65 x 50 cm BFK Rives 250 g" }
  },
  {
    id: "offset-1",
    title: "Titre de la publication", image: "images/shop-offset-1.jpg",
    description: "Impression offset, 2024", dimensions: "A5, 32 pages, couverture riso",
    price: 15, currency: "EUR", available: true, maxQty: 10,
    en: { title: "Title of the publication", description: "Offset printing, 2024", dimensions: "A5, 32 pages, risograph cover",}
  }
];
