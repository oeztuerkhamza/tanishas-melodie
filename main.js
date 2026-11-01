/*
 * Tanishas Melodie
 *
 * Das Herzstück sind fünf Notenlinien auf einem festen Canvas. Sie sind echte
 * Saiten (Wellengleichung): Maus und Scrollen bringen sie zum Schwingen. Über
 * die gesamte Scrollstrecke läuft „Treulich geführt“ (Wagner, gemeinfrei) unter
 * einer Abspielposition durch. Jede Note zupft ihre Linie und klingt, wenn der
 * Ton eingeschaltet ist. Rückwärts scrollen spielt die Melodie rückwärts.
 *
 * Jeder Abschnitt beschreibt seinen Zustand in data-Attributen (Farben, Lage
 * der Linien, Ringe). Daraus entsteht eine einzige Tabelle, die alle Farben und
 * das Canvas in einem Durchlauf steuert.
 */
(() => {
  const root = document.documentElement;
  const motion = root.classList.contains('motion');
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const isMobile = () => innerWidth <= 900;

  /* ---------- Ton ---------- */
  const klang = {
    ctx: null, master: null, an: false, zuletzt: 0,
    start() {
      if (!this.ctx) {
        const C = window.AudioContext || window.webkitAudioContext;
        if (!C) return false;
        this.ctx = new C();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.22;
        const hall = this.ctx.createDelay(1);
        hall.delayTime.value = 0.27;
        const rueck = this.ctx.createGain();
        rueck.gain.value = 0.32;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1800;
        this.master.connect(this.ctx.destination);
        this.master.connect(hall);
        hall.connect(filter);
        filter.connect(rueck);
        rueck.connect(hall);
        filter.connect(this.ctx.destination);
      }
      this.ctx.resume();
      return true;
    },
    /* Spieluhr: Grundton, Oktave und ein schnell verklingender, leicht unharmonischer Anschlag */
    note(midi, staerke = 1) {
      if (!this.an || !this.ctx) return;
      const now = this.ctx.currentTime;
      if (now - this.zuletzt < 0.07) return;
      this.zuletzt = now;
      const f = 440 * 2 ** ((midi - 69) / 12);
      [[1, 0.8, 1.8], [2, 0.26, 1.1], [4.07, 0.09, 0.28]].forEach(([m, g, d]) => {
        const o = this.ctx.createOscillator();
        const v = this.ctx.createGain();
        o.frequency.value = f * m;
        v.gain.setValueAtTime(0.0001, now);
        v.gain.exponentialRampToValueAtTime(g * staerke, now + 0.008);
        v.gain.exponentialRampToValueAtTime(0.0001, now + d);
        o.connect(v);
        v.connect(this.master);
        o.start(now);
        o.stop(now + d + 0.05);
      });
    },
  };
  const tonKnopf = $('.ton');
  tonKnopf.addEventListener('click', () => {
    const an = !klang.an;
    if (an && !klang.start()) return;
    klang.an = an;
    tonKnopf.setAttribute('aria-pressed', String(an));
    if (an) klang.note(67);
  });

  /* ---------- Zustandstabelle aus den data-Attributen ---------- */
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const css = (c) => `rgb(${c[0] | 0} ${c[1] | 0} ${c[2] | 0})`;
  let halte = [];
  const zustand = {};
  /* Auf kleinen Schirmen richten sich Notenlinien und Bogen nach der Höhe des Texts */
  let bogenOben = 48;
  function auftaktLage() {
    if (!motion || !isMobile()) return;
    const text = $('.unterzeile'), szene = $('#auftakt');
    const abstand = +szene.dataset.gapM * 2 + 14;
    const y = text.offsetTop + text.offsetHeight + abstand;
    bogenOben = Math.min(66, (y + abstand) / $('#auftakt .buehne').clientHeight * 100);
    [szene, $('#auftakt .marke')].forEach((el) => { el.dataset.yM = (y / innerHeight).toFixed(3); });
  }
  function tabelle() {
    auftaktLage();
    const m = isMobile();
    const zahl = (el, k, f) => { const v = el.dataset[k + (m ? 'M' : '')] ?? el.dataset[k]; return v === undefined ? f : +v; };
    /* Die helle Schrift im Auftakt gilt nur, solange das Foto dahinter liegt */
    halte = $$(motion ? '[data-bg]' : '[data-bg]:not(#auftakt .marke)').map((el) => ({
      pos: el.getBoundingClientRect().top + scrollY - innerHeight * 0.55,
      fenster: innerHeight * 0.5 * +(el.dataset.win || 1),
      bg: hex(el.dataset.bg), ink: hex(el.dataset.ink), line: hex(el.dataset.line),
      y: zahl(el, 'y', 0.5), gap: m && !el.dataset.gapM ? zahl(el, 'gap', 20) * 0.55 : zahl(el, 'gap', 20), amp: m ? zahl(el, 'amp', 0) * 0.5 : zahl(el, 'amp', 0),
      alpha: zahl(el, 'alpha', 0.5), notes: zahl(el, 'notes', 0), ring: zahl(el, 'ring', 0),
    })).sort((a, b) => a.pos - b.pos);
  }
  const FELDER = ['y', 'gap', 'amp', 'alpha', 'notes', 'ring'];
  let letzteFarbe = '';
  function zustandBerechnen(sy) {
    const z = zustand;
    const s0 = halte[0];
    FELDER.forEach((k) => { z[k] = s0[k]; });
    z.bg = [...s0.bg]; z.ink = [...s0.ink]; z.line = [...s0.line];
    for (let i = 1; i < halte.length; i++) {
      const s = halte[i];
      const t = smooth((sy - (s.pos - s.fenster / 2)) / s.fenster);
      if (t <= 0) break;
      FELDER.forEach((k) => { z[k] = lerp(z[k], s[k], t); });
      for (let c = 0; c < 3; c++) {
        z.bg[c] = lerp(z.bg[c], s.bg[c], t);
        z.ink[c] = lerp(z.ink[c], s.ink[c], t);
        z.line[c] = lerp(z.line[c], s.line[c], t);
      }
    }
    const farbe = css(z.bg) + css(z.ink);
    if (farbe !== letzteFarbe) {
      letzteFarbe = farbe;
      root.style.setProperty('--bg', css(z.bg));
      root.style.setProperty('--ink', css(z.ink));
    }
  }

  /* ---------- Saiten ---------- */
  const canvas = $('#saiten');
  const g = canvas.getContext('2d');
  const LINIEN = 5, K = 72;
  const LINIEN_TON = [64, 67, 71, 74, 77];
  const aus = [], tempo = [];
  for (let l = 0; l < LINIEN; l++) { aus.push(new Float32Array(K)); tempo.push(new Float32Array(K)); }
  let B = 0, H = 0, dpr = 1, intro = motion ? 0 : 1, zeit = 0;

  function groesse() {
    dpr = Math.min(devicePixelRatio || 1, isMobile() ? 1.5 : 2);
    B = innerWidth; H = innerHeight;
    canvas.width = B * dpr; canvas.height = H * dpr;
  }

  function zupfen(l, xAnteil, kraft) {
    const mitte = xAnteil * (K - 1), breite = 5;
    for (let i = 1; i < K - 1; i++) tempo[l][i] += kraft * Math.exp(-((i - mitte) ** 2) / (2 * breite * breite));
  }
  function simulieren() {
    for (let l = 0; l < LINIEN; l++) {
      const d = aus[l], v = tempo[l];
      for (let i = 1; i < K - 1; i++) v[i] = (v[i] + 0.22 * (d[i - 1] - 2 * d[i] + d[i + 1])) * 0.985;
      for (let i = 1; i < K - 1; i++) { d[i] += v[i]; d[i] *= 0.996; }
    }
  }

  /* Treulich geführt, in C. Stufen zählen von der untersten Linie (E4) aufwärts. */
  const STUFE = { 67: 2, 71: 4, 72: 5, 74: 6, 76: 7, 77: 8 };
  const PHRASE = [67, 72, 72, 72, 67, 74, 71, 72, 67, 72, 77, 77, 76, 74, 72, 71, 72];
  const ABSTAND_NOTEN = () => (isMobile() ? 90 : 150);
  let notenZahl = 34, rate = 0.5, playX = 0, letzterIndex = 0, notenBlitz = new Map();

  function notenRechnen() {
    const strecke = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const abstand = ABSTAND_NOTEN();
    notenZahl = Math.max(PHRASE.length, Math.round((strecke * 0.5) / abstand));
    rate = (abstand * (notenZahl - 1)) / strecke;
    playX = B * (isMobile() ? 0.5 : 0.4);
    letzterIndex = (scrollY * rate) / abstand;
  }

  function punkt(l, i, z, wackeln, out) {
    const lage = z.y * H + (l - 2) * z.gap;
    const xx = (i / (K - 1)) * (B * 1.04) - B * 0.02;
    const welle = z.amp * Math.sin(xx * 0.0042 + zeit * 0.35 + l * 0.22) + wackeln * Math.sin(xx * 0.014 + zeit * 7 + l * 0.9);
    let x = xx, y = lage + welle + aus[l][i];
    if (z.ring > 0.001) {
      const t = smooth(z.ring);
      const R = Math.min(B, H) * (isMobile() ? 0.27 : 0.25);
      const links = l < 3;
      const cx = B / 2 + (links ? -1 : 1) * R * 0.62;
      const cy = H * 0.5;
      const w = (i / (K - 1)) * Math.PI * 2 + (links ? 0.4 : 2.6) + zeit * 0.05 * (links ? 1 : -1);
      const r = R + (links ? l - 1 : l - 3.5) * 5;
      x = lerp(x, cx + Math.cos(w) * r, t);
      y = lerp(y, cy + Math.sin(w) * r, t);
    }
    out[0] = x; out[1] = y;
  }

  const p = [0, 0], q = [0, 0];
  function zeichnen(wackeln, sy) {
    const z = zustand;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, B, H);
    if (z.alpha < 0.01) return;
    g.strokeStyle = css(z.line);
    g.lineWidth = 1 + z.ring * 0.4;
    g.globalAlpha = z.alpha;
    const bis = Math.floor(intro * (K - 1));
    for (let l = 0; l < LINIEN; l++) {
      g.beginPath();
      punkt(l, 0, z, wackeln, p);
      g.moveTo(p[0], p[1]);
      for (let i = 1; i <= bis; i++) {
        punkt(l, i, z, wackeln, q);
        g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
        p[0] = q[0]; p[1] = q[1];
      }
      g.lineTo(p[0], p[1]);
      g.stroke();
    }
    /* Noten */
    const sichtbar = z.notes * (1 - smooth(z.ring)) * intro;
    if (sichtbar < 0.02) return;
    const abstand = ABSTAND_NOTEN();
    const versatz = sy * rate;
    const erste = Math.max(0, Math.floor((versatz - playX - 60) / abstand));
    const letzte = Math.min(notenZahl - 1, Math.ceil((versatz + B - playX + 60) / abstand));
    g.fillStyle = css(z.line);
    const kopf = z.gap * 0.56;
    for (let n = erste; n <= letzte; n++) {
      const midi = PHRASE[n % PHRASE.length];
      const stufe = STUFE[midi];
      const x = playX + n * abstand - versatz;
      const linie = clamp(4 - Math.round(stufe / 2), 0, 4);
      const iSaite = clamp(Math.round(((x + B * 0.02) / (B * 1.04)) * (K - 1)), 0, K - 1);
      const y = z.y * H + z.gap * 2 - stufe * (z.gap / 2)
        + z.amp * Math.sin(x * 0.0042 + zeit * 0.35 + (linie) * 0.22) + aus[linie][iSaite];
      const blitz = notenBlitz.get(n) || 0;
      g.globalAlpha = clamp(sichtbar * z.alpha * (1.15 + blitz * 0.5), 0, 1);
      const s = 1 + blitz * 0.5;
      g.beginPath();
      g.ellipse(x, y, kopf * s, kopf * 0.72 * s, -0.35, 0, Math.PI * 2);
      g.fill();
      const hoch = stufe < 4 ? 1 : -1;
      g.fillRect(x + (hoch > 0 ? kopf * 0.86 - 1 : -kopf * 0.86), y - (hoch > 0 ? z.gap * 3.3 : 0), Math.max(1.2, z.gap * 0.08), z.gap * 3.3);
    }
    g.globalAlpha = 1;
  }

  function notenAbspielen(sy) {
    const abstand = ABSTAND_NOTEN();
    const jetzt = (sy * rate) / abstand;
    const a = Math.min(letzterIndex, jetzt), b = Math.max(letzterIndex, jetzt);
    const von = Math.ceil(a), zu = Math.floor(b);
    if (von <= zu && a !== b) {
      /* Bei schnellem Scrollen klingt nur die letzte überquerte Note */
      const n = jetzt > letzterIndex ? zu : von;
      if (n >= 0 && n < notenZahl) {
        const midi = PHRASE[n % PHRASE.length];
        const linie = clamp(4 - Math.round(STUFE[midi] / 2), 0, 4);
        if (motion && zustand.ring < 0.2) zupfen(linie, playX / B, zustand.gap * 0.06);
        klang.note(midi);
        notenBlitz.set(n, 1);
      }
    }
    letzterIndex = jetzt;
    notenBlitz.forEach((w, n) => { w *= 0.93; if (w < 0.02) notenBlitz.delete(n); else notenBlitz.set(n, w); });
  }

  /* Maus zupft die Linien */
  let mausY = null;
  if (motion && matchMedia('(pointer: fine)').matches) {
    addEventListener('pointermove', (e) => {
      if (mausY !== null && zustand.ring < 0.3 && zustand.alpha > 0.1) {
        for (let l = 0; l < LINIEN; l++) {
          const ly = zustand.y * H + (l - 2) * zustand.gap + zustand.amp * Math.sin(e.clientX * 0.0042 + zeit * 0.35 + l * 0.22);
          if ((mausY - ly) * (e.clientY - ly) < 0) {
            zupfen(l, e.clientX / B, clamp((e.clientY - mausY) * 0.3, -1.5, 1.5));
            klang.note(LINIEN_TON[4 - l], 0.6);
          }
        }
      }
      mausY = e.clientY;
    }, { passive: true });
  }

  /* Schleife */
  let vorher = scrollY, wackeln = 0, rest = 0, tZuvor = performance.now();
  function schleife(now) {
    const dt = Math.min(0.05, (now - tZuvor) / 1000);
    tZuvor = now;
    if (!document.hidden) {
      zeit += dt;
      rest += dt;
      let schritte = 0;
      while (rest > 1 / 60 && schritte < 3) { simulieren(); rest -= 1 / 60; schritte++; }
      if (schritte === 3) rest = 0;
      const sy = scrollY;
      const v = Math.abs(sy - vorher);
      vorher = sy;
      wackeln += (clamp(v * 0.14, 0, 9) - wackeln) * 0.12;
      zustandBerechnen(sy);
      notenAbspielen(sy);
      zeichnen(wackeln, sy);
    }
    requestAnimationFrame(schleife);
  }

  function statisch() {
    zustandBerechnen(scrollY);
    zeichnen(0, scrollY);
  }

  /* ---------- Texte, die erst im Skript entstehen ---------- */
  const T = {
    de: { spielen: (t) => `${t} abspielen (lädt ein Video von YouTube)`, name: 'Name', mail: 'E-Mail', termin: 'Datum und Ort', betreff: 'Anfrage Hochzeit: ', status: 'Euer E-Mail-Programm öffnet sich mit der fertigen Anfrage. Falls nicht, schreibt direkt an info@tanishasmelodie.de.' },
    en: { spielen: (t) => `Play ${t} (loads a video from YouTube)`, name: 'Name', mail: 'Email', termin: 'Date and place', betreff: 'Wedding enquiry: ', status: 'Your email program will open with the finished request. If it doesn’t, write directly to info@tanishasmelodie.de.' },
    fr: { spielen: (t) => `Lire ${t} (charge une vidéo depuis YouTube)`, name: 'Nom', mail: 'E-mail', termin: 'Date et lieu', betreff: 'Demande de mariage : ', status: 'Votre messagerie s’ouvre avec la demande prête à partir. Sinon, écrivez directement à info@tanishasmelodie.de.' },
  }[document.documentElement.lang];

  /* ---------- Hörproben: Video erst nach Klick laden ---------- */
  $$('.video').forEach((v) => {
    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.className = 'spielen';
    knopf.setAttribute('aria-label', T.spielen(v.dataset.titel));
    knopf.innerHTML = '<span><svg viewBox="0 0 20 24" aria-hidden="true"><path d="M0 0l20 12L0 24z" fill="currentColor"/></svg></span>';
    knopf.addEventListener('click', () => {
      const f = document.createElement('iframe');
      f.src = `https://www.youtube-nocookie.com/embed/${v.dataset.yt}?autoplay=1&rel=0`;
      f.title = v.dataset.titel;
      f.allow = 'autoplay; encrypted-media; picture-in-picture';
      f.allowFullscreen = true;
      v.replaceChildren(f);
      if (klang.an) $('.ton').click();
      f.focus();
    });
    v.append(knopf);
  });

  /* ---------- Formular ---------- */
  $('#formular').addEventListener('submit', (e) => {
    e.preventDefault();
    const d = new FormData(e.target);
    const text = `${T.name}: ${d.get('name')}\n${T.mail}: ${d.get('email')}\n${T.termin}: ${d.get('termin')}\n\n${d.get('infos')}`;
    location.href = `mailto:info@tanishasmelodie.de?subject=${encodeURIComponent(T.betreff + d.get('termin'))}&body=${encodeURIComponent(text)}`;
    $('.status').textContent = T.status;
  });

  /* ---------- Menü ---------- */
  const kopf = $('.kopf'), menu = $('.menu-knopf');
  const menuSetzen = (offen) => {
    kopf.classList.toggle('offen', offen);
    menu.setAttribute('aria-expanded', String(offen));
  };
  menu.addEventListener('click', () => menuSetzen(!kopf.classList.contains('offen')));
  $$('#navigation a').forEach((a) => a.addEventListener('click', () => menuSetzen(false)));

  /* ---------- Start ohne Bewegung ---------- */
  groesse();
  tabelle();
  notenRechnen();
  if (!motion) {
    statisch();
    addEventListener('scroll', statisch, { passive: true });
    const neu = () => { groesse(); tabelle(); notenRechnen(); statisch(); };
    addEventListener('resize', neu);
    addEventListener('load', neu);
    return;
  }

  /* ---------- Choreografie ---------- */
  gsap.registerPlugin(ScrollTrigger);

  const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);

  /* Anker ziehen über die Bühnen hinweg, statt sie zu überspringen */
  $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const ziel = document.querySelector(a.getAttribute('href'));
    if (!ziel) return;
    e.preventDefault();
    lenis.scrollTo(ziel, { duration: 1.6 });
    ziel.setAttribute('tabindex', '-1');
    ziel.focus({ preventScroll: true });
  }));

  /* Kopfzeile weicht beim Herunterscrollen aus */
  ScrollTrigger.create({
    start: 300, end: 'max',
    onUpdate: (st) => {
      if (!kopf.classList.contains('offen')) kopf.classList.toggle('weg', st.direction > 0);
      tonKnopf.classList.toggle('kompakt', st.scroll() > 900);
    },
    onLeaveBack: () => kopf.classList.remove('weg'),
  });

  /* Einmaliger Einstieg: Linien ziehen durch, die Überschrift steigt auf.
     Er bewegt innere Elemente, damit er sich nicht mit dem Scrollen im Auftakt überschreibt. */
  const start = gsap.timeline({ defaults: { ease: 'power3.out' } });
  start.to({ v: 0 }, { v: 1, duration: 1.8, ease: 'power2.inOut', onUpdate() { intro = this.targets()[0].v; } }, 0)
    .from('.zeile .ein', { yPercent: 112, duration: 1.2, stagger: 0.09 }, 0.15)
    .from('.bogen', { y: '12vh', autoAlpha: 0, duration: 1.3 }, 0.3)
    .from('.unterzeile, .ton-tipp', { autoAlpha: 0, duration: 0.9, stagger: 0.1 }, 0.9)
    .from('.kopf, .ton', { autoAlpha: 0, duration: 0.9 }, 1);

  /* Wörter für den Lese-Effekt trennen */
  $$('.vorlesen').forEach((el) => {
    const woerter = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    woerter.forEach((w, i) => {
      const s = document.createElement('span');
      s.className = 'wort';
      s.textContent = w;
      el.append(s, i < woerter.length - 1 ? ' ' : '');
    });
  });

  const mm = gsap.matchMedia();

  mm.add({ gross: '(min-width: 901px)', klein: '(max-width: 900px)' }, (ctx) => {
    const { gross } = ctx.conditions;

    /* Auftakt */
    const auf = gsap.timeline({ scrollTrigger: { trigger: '#auftakt', start: 'top top', end: 'bottom bottom', scrub: true, invalidateOnRefresh: true } });
    auf.to('.h-a .zeile > span', { yPercent: -110, stagger: 0.02, duration: 0.2, ease: 'power2.in' }, 0)
      .to('.unter', { autoAlpha: 0, duration: 0.1 }, 0)
      .fromTo('.bogen', { clipPath: () => (gross ? 'inset(17% 7% 0% 57% round 22vw 22vw 0px 0px)' : `inset(${bogenOben}% 14% 0% 14% round 36vw 36vw 0px 0px)`) },
        { clipPath: 'inset(0% 0% 0% 0% round 0vw 0vw 0px 0px)', duration: 0.55, ease: 'power2.inOut' }, 0.05)
      .fromTo('.bogen img', { x: gross ? '26vw' : 0, y: () => (gross ? 0 : `${bogenOben - 18}vh`), scale: 1.16 }, { x: 0, y: 0, scale: 1, duration: 0.55, ease: 'power2.inOut' }, 0.05)
      .to('.bogen-schatten', { opacity: 1, duration: 0.2 }, 0.42)
      .set('.h-b', { visibility: 'visible' }, 0.5)
      .fromTo('.h-b', { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.2, ease: 'power2.out' }, 0.52)
      .to('.bogen img', { yPercent: -3, duration: 0.3, ease: 'none' }, 0.7);

    /* Willkommen: Der Text wird beim Lesen hell */
    gsap.fromTo('.vorlesen .wort', { opacity: 0.2 }, {
      opacity: 1, stagger: 0.05, ease: 'none',
      scrollTrigger: { trigger: '.vorlesen', start: 'top 78%', end: 'bottom 48%', scrub: true },
    });
    gsap.fromTo('.garten', { clipPath: 'inset(35% 0% 0% 0% round 50vw 50vw 0px 0px)' }, {
      clipPath: 'inset(0% 0% 0% 0% round 50vw 50vw 0px 0px)', ease: 'none',
      scrollTrigger: { trigger: '.garten', start: 'top 95%', end: 'top 35%', scrub: true },
    });
    gsap.fromTo('.garten img', { yPercent: -14 }, {
      yPercent: 0, ease: 'none',
      scrollTrigger: { trigger: '.garten', start: 'top bottom', end: 'bottom top', scrub: true },
    });

    /* Ablauf */
    $$('.takte li').forEach((li) => ScrollTrigger.create({
      trigger: li, start: 'top 72%', end: 'bottom 30%',
      toggleClass: { targets: li, className: 'an' },
    }));
    gsap.fromTo('.ablauf-bild img', { scale: 1.22 }, {
      scale: 1, ease: 'none',
      scrollTrigger: { trigger: '.ablauf-raster', start: 'top bottom', end: 'bottom bottom', scrub: true },
    });

    /* Hörproben: quer nur auf großen Bildschirmen */
    if (gross) {
      const spur = $('.quer-spur');
      const weg = () => -(spur.scrollWidth - innerWidth);
      const fahrt = gsap.to(spur, {
        x: weg, ease: 'none',
        scrollTrigger: { trigger: '.quer', start: 'top top', end: 'bottom bottom', scrub: true, invalidateOnRefresh: true },
      });
      $$('.lied').forEach((lied) => {
        gsap.fromTo($('.lied-text', lied), { x: '9vw' }, {
          x: '-3vw', ease: 'none',
          scrollTrigger: { trigger: lied, containerAnimation: fahrt, start: 'left right', end: 'right left', scrub: true },
        });
        gsap.fromTo($('.lied-bild', lied), { scale: 1.18 }, {
          scale: 1, ease: 'none',
          scrollTrigger: { trigger: lied, containerAnimation: fahrt, start: 'left right', end: 'center center', scrub: true },
        });
      });
      /* Tastatur: Fokus in einer Tafel fährt die Spur dorthin */
      spur.addEventListener('focusin', (e) => {
        const tafel = e.target.closest('.tafel');
        const st = fahrt.scrollTrigger;
        const anteil = clamp(tafel.offsetLeft / (spur.scrollWidth - innerWidth), 0, 1);
        /* Erst nach dem eingebauten Scrollen des Browsers, sonst überschreibt es das Ziel */
        requestAnimationFrame(() => {
          $('.quer-buehne').scrollLeft = 0;
          lenis.scrollTo(st.start + (st.end - st.start) * anteil, { immediate: true, force: true });
        });
      });
    }

    /* Über mich */
    gsap.fromTo('.name-gross', { xPercent: -10 }, {
      xPercent: 6, ease: 'none',
      scrollTrigger: { trigger: '.ueber-raster', start: 'top 80%', end: 'bottom 40%', scrub: true },
    });
    gsap.fromTo('.jahr span', { xPercent: -6 }, {
      xPercent: 8, ease: 'none',
      scrollTrigger: { trigger: '.jahr', start: 'top bottom', end: 'bottom top', scrub: true },
    });

    /* Meine Melodie: Der Stimmungswechsel */
    const mel = gsap.timeline({ scrollTrigger: { trigger: '#melodie', start: 'top top', end: 'bottom bottom', scrub: true } });
    mel.from('.m-a', { scale: 1.2, duration: 0.5, ease: 'none' }, 0)
      .fromTo('.m-b', { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.3, ease: 'power2.inOut' }, 0.36)
      .fromTo('.m-b', { scale: 1.25 }, { scale: 1, duration: 0.64, ease: 'none' }, 0.36)
      .to('.s-a', { yPercent: -18, autoAlpha: 0, duration: 0.14, ease: 'power1.in' }, 0.36)
      .set('.s-b', { visibility: 'visible' }, 0.48)
      .fromTo('.s-b', { yPercent: 18, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.14, ease: 'power1.out' }, 0.48);

    /* Preise */
    gsap.fromTo('.laufband span', { xPercent: 0 }, {
      xPercent: -38, ease: 'none',
      scrollTrigger: { trigger: '.laufband', start: 'top bottom', end: 'bottom top', scrub: true },
    });
    $$('.preisliste li').forEach((li) => {
      gsap.fromTo(li, { '--strich': 0 }, { '--strich': 1, ease: 'none', scrollTrigger: { trigger: li, start: 'top 92%', end: 'top 55%', scrub: true } });
      gsap.fromTo($('.preis', li), { x: gross ? '6vw' : 0 }, { x: 0, ease: 'none', scrollTrigger: { trigger: li, start: 'top 92%', end: 'top 55%', scrub: true } });
      const zahl = $('[data-zahl]', li), ziel = +zahl.dataset.zahl, wert = { v: Math.round(ziel * 0.6) };
      ScrollTrigger.create({
        trigger: li, start: 'top 80%', once: true,
        onEnter: () => gsap.to(wert, { v: ziel, duration: 1.1, ease: 'power3.out', onUpdate: () => { zahl.textContent = Math.round(wert.v); } }),
      });
    });

    /* Stimmen: Die Laternen steigen unterschiedlich schnell */
    gsap.fromTo('.zitat p', { xPercent: gross ? 8 : 0 }, {
      xPercent: 0, ease: 'none',
      scrollTrigger: { trigger: '.zitat', start: 'top bottom', end: 'bottom 60%', scrub: true },
    });
    $$('.laternen img').forEach((img, i) => gsap.fromTo(img, { y: 70 + i * 34 }, {
      y: -40 - i * 24, ease: 'none',
      scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
    }));

    /* Ja */
    const ja = gsap.timeline({ scrollTrigger: { trigger: '#ja', start: 'top top', end: 'bottom bottom', scrub: true } });
    ja.fromTo('.ja-wort', { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.3 }, 0.2)
      .fromTo('.ja-buehne h2', { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.3 }, 0.5);

    return () => gsap.set('.quer-spur', { clearProps: 'x' });
  });

  function aktualisieren() { groesse(); tabelle(); notenRechnen(); }
  ScrollTrigger.addEventListener('refreshInit', auftaktLage);
  ScrollTrigger.addEventListener('refresh', aktualisieren);
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
  addEventListener('load', () => ScrollTrigger.refresh());

  requestAnimationFrame(schleife);
})();
