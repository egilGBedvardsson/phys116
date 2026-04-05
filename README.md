# demo_website

Denne mappen er klar til bruk som statisk nettside på GitHub Pages.

## Innhold

- `index.html` – landingsside med lenker til demoene
- `demos/` – demo-filene
- `assets/` – statiske ressurser (logo)
- `.nojekyll` – hindrer Jekyll-prosessering

## Publisering med GitHub Pages (anbefalt)

Denne repoen inneholder en workflow som publiserer **akkurat `demo_website/`**.

1. Push til GitHub
2. Gå til **Settings -> Pages**
3. Sett **Source** til **GitHub Actions**
4. Workflowen `Deploy demo_website to GitHub Pages` kjører automatisk på push til `main`

