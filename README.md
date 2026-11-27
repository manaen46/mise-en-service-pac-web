# Mise en Service PAC — version web

Version web de l'appli **Mise en Service PAC** (mises en service de PAC et de climatisations : contrôles, relevés, photos, PV et Cerfa 15497), pour l'iPhone et tout navigateur.

**Adresse :** https://manaen46.github.io/mise-en-service-pac-web/

Sur iPhone : ouvrir l'adresse dans Safari → bouton Partager → « Sur l'écran d'accueil ». L'appli s'ouvre alors comme une appli, marche sans réseau et garde les chantiers sur le téléphone.

## Contenu

- `site/` : l'appli (copiée depuis le dépôt de l'appli Android, ne pas modifier ici).
- `.github/workflows/site.yml` : à chaque envoi, ajoute le lecteur de texte (Tesseract.js) et jsPDF, essaie la lecture sur `test/photos`, puis met le site en ligne (branche `gh-pages`).
- `test/` : essai du lecteur de texte sur des photos de test (images de synthèse).

Aucune donnée de chantier ne passe par ce dépôt ni par le site : tout reste dans le téléphone.
