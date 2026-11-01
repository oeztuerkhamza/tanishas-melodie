// Erzeugt aus index.html die Sprachfassungen, die Rechtsseiten und die 404-Seite: node build.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { texte, gleich, recht } from './i18n.mjs';

const BASIS = 'https://oeztuerkhamza.github.io/tanishas-melodie/';
const PFAD = new URL(BASIS).pathname;
const SPRACHEN = { de: 'Deutsch', en: 'English', fr: 'Français' };
const DATEIEN = {
  de: { impressum: 'impressum.html', datenschutz: 'datenschutz.html' },
  en: { impressum: 'legal-notice.html', datenschutz: 'privacy.html' },
  fr: { impressum: 'mentions-legales.html', datenschutz: 'confidentialite.html' },
};
const pfad = (lang, seite) => (lang === 'de' ? '' : `${lang}/`) + (seite ? DATEIEN[lang][seite] : '');

/* Sprachwahl für eine Seite in einer Sprache */
function sprachen(lang, seite) {
  const hoch = lang === 'de' ? '' : '../';
  const links = Object.entries(SPRACHEN).map(([l, name]) => {
    const ziel = hoch + pfad(l, seite) || './';
    const aktuell = l === lang ? ' aria-current="true"' : '';
    return `<a href="${ziel}" hreflang="${l}" lang="${l}" aria-label="${name}"${aktuell}>${l.toUpperCase()}</a>`;
  }).join('');
  return `<span class="sprachen" role="group" aria-label="${recht[lang].sprachenLabel}">${links}</span>`;
}

const hreflang = (seite) => Object.keys(SPRACHEN)
  .map((l) => `<link rel="alternate" hreflang="${l}" href="${BASIS}${pfad(l, seite)}">`).join('\n');

/* Startseite übersetzen; jeder Text ohne Übersetzung bricht den Build ab */
function uebersetzen(html, i) {
  const lang = ['en', 'fr'][i - 1];
  const karte = new Map(texte.map((t) => [t[0], t[i]]));
  const fehlt = new Set(), benutzt = new Set();
  const tausch = (roh) => {
    const text = roh.trim();
    if (!/[A-Za-zÀ-ÿ]/.test(text.replace(/&\w+;/g, '')) || gleich.has(text)) return roh;
    if (!karte.has(text)) { fehlt.add(text); return roh; }
    benutzt.add(text);
    return roh.replace(text, karte.get(text));
  };
  const teile = html.replace(/<!--[\s\S]*?-->\n?/g, '').split(/(<script[\s\S]*?<\/script>)/);
  const aus = teile.map((t, n) => (n % 2 ? t : t
    .replace(/<span class="sprachen"[\s\S]*?<\/span>/g, '<SPRACHEN>')
    .replace(/>([^<>]+)</g, (_, x) => `>${tausch(x)}<`)
    .replace(/\b(alt|aria-label)="([^"]+)"/g, (_, a, x) => `${a}="${tausch(x)}"`)
    .replace(/(<meta name="description" content=")([^"]+)/, (_, a, x) => a + tausch(x))
  )).join('');
  const rest = texte.filter((t) => !benutzt.has(t[0])).map((t) => t[0]);
  if (fehlt.size || rest.length) throw new Error(`${lang}: fehlt ${JSON.stringify([...fehlt])}, unbenutzt ${JSON.stringify(rest)}`);

  let seite = aus
    .replace('<html lang="de">', `<html lang="${lang}">`)
    .replace(/(["\s,])assets\//g, '$1../assets/')
    .replace('href="styles.css"', 'href="../styles.css"')
    .replace('src="main.js"', 'src="../main.js"')
    .replace(/href="impressum\.html"/g, `href="${DATEIEN[lang].impressum}"`)
    .replace(/href="datenschutz\.html"/g, `href="${DATEIEN[lang].datenschutz}"`)
    .replace(/<SPRACHEN>/g, sprachen(lang));
  if (lang === 'en') seite = seite.replace(/(<p class="preis">)(<span data-zahl="\d+">\d+<\/span>)&nbsp;€\*/g, '$1€$2*');
  return seite;
}

/* Impressum und Datenschutz */
function rechtsseite(lang, seite) {
  const t = recht[lang], hoch = lang === 'de' ? '' : '../';
  const hinweis = t.uebersetzung ? `<p class="recht-hinweis">${t.uebersetzung.replace('{de}', DATEIEN.de[seite])}</p>\n` : '';
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${t[seite].titel}: Tanishas Melodie</title>
<meta name="robots" content="noindex">
<meta name="theme-color" content="#D8E2E3">
${hreflang(seite)}
<link rel="stylesheet" href="${hoch}styles.css">
</head>
<body class="recht">
<header class="kopf">
  <a class="logo" href="./" aria-label="${t.zurueck}"></a>
  ${sprachen(lang, seite)}
</header>
<main class="recht-inhalt">
<p class="recht-zurueck"><a href="./">${t.zurueck}</a></p>
<h1>${t[seite].titel}</h1>
<p class="recht-hinweis">${t.entwurf}</p>
${hinweis}${t[seite].html}
</main>
<footer class="fuss">
  <p>Tanisha Karle, Tanishas Melodie, Im Mohnacker 12, 79112 Freiburg</p>
  <p class="fuss-links"><a href="${DATEIEN[lang].impressum}">${t.impressum.titel}</a> <a href="${DATEIEN[lang].datenschutz}">${t.datenschutz.titel}</a></p>
</footer>
</body>
</html>
`;
}

/* GitHub Pages liefert die 404-Seite unter jeder Adresse aus, deshalb ein fester Basispfad */
const seite404 = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<base href="${PFAD}">
<title>Seite nicht gefunden: Tanishas Melodie</title>
<meta name="robots" content="noindex">
<link rel="stylesheet" href="styles.css">
</head>
<body class="recht">
<header class="kopf"><a class="logo" href="./" aria-label="Tanishas Melodie"></a></header>
<main class="recht-inhalt">
<h1>Dieser Ton fehlt.</h1>
<p>Diese Seite gibt es nicht. <a href="./">Zur Startseite</a></p>
<p lang="en">This page doesn’t exist. <a href="en/">Back to home</a></p>
<p lang="fr">Cette page n’existe pas. <a href="fr/">Retour à l’accueil</a></p>
</main>
</body>
</html>
`;

const quelle = (await readFile('index.html', 'utf8')).replace(/\r\n/g, '\n');
const start = quelle.replace(/<link rel="alternate"[^\n]*\n/g, '');
const mitLinks = (html) => html.replace('<link rel="preload"', `${hreflang()}\n<link rel="preload"`);

await writeFile('index.html', mitLinks(start));
await mkdir('en', { recursive: true });
await mkdir('fr', { recursive: true });
await writeFile('en/index.html', mitLinks(uebersetzen(start, 1)));
await writeFile('fr/index.html', mitLinks(uebersetzen(start, 2)));
for (const lang of Object.keys(SPRACHEN)) for (const s of ['impressum', 'datenschutz']) {
  await writeFile(pfad(lang, s), rechtsseite(lang, s));
}
await writeFile('404.html', seite404);
console.log('fertig');
