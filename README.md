# PHYS 116 Demo Website

Static course-support site for interactive PHYS 116 signal-analysis demos.

This project is intentionally plain HTML, CSS, and JavaScript. There is no framework, bundler, TypeScript, package manager, or build step.

## Run Locally

From the repository root:

```sh
python3 -m http.server 8123
```

Open `http://127.0.0.1:8123/docs/`.

Most pages can be opened directly from disk, but a local server is the best way to test portal iframe behavior, relative paths, and GitHub Pages-style routing.

## Structure

- `docs/index.html`: main portal page.
- `docs/demos/`: standalone demo HTML pages.
- `docs/content/`: short explanatory text loaded by the portal.
- `docs/assets/css/design.css`: global tokens and portal styling.
- `docs/assets/css/demo.css`: shared standalone/embedded demo layout.
- `docs/assets/css/demos/`: demo-specific CSS only.
- `docs/assets/js/portal.js`: portal navigation, content loading, and iframe sizing.
- `docs/assets/js/demo-utils.js`: shared demo browser/layout helpers.
- `docs/assets/js/demos/`: one readable JavaScript file per demo.

## Adding Or Updating A Demo

1. Add or edit the standalone page in `docs/demos/`.
2. Put demo behavior in one file under `docs/assets/js/demos/`.
3. Use `docs/assets/css/demos/` only for styles that are genuinely demo-specific.
4. Add the short supporting description in `docs/content/`.
5. Register the demo in `DEMOS` in `docs/assets/js/portal.js`.
6. Add the matching sidebar button in `docs/index.html`.
7. Include `demo-utils.js` before the demo script.

Keep educational formulas, signal-processing logic, renderer setup, and demo-specific math close to the demo that uses them. Move code into `demo-utils.js` only when multiple demos clearly share the same browser or layout behavior.

## Dependencies

External scripts are loaded from CDNs:

- Plotly `2.27.0` for Plotly-based demos.
- MathJax `3.2.2` for rendered equations.

Pin versions deliberately so course material does not change unexpectedly between semesters.

## Deployment

GitHub Pages deployment is handled by `.github/workflows/deploy-pages.yml`, which uploads `./docs`. The file `docs/.nojekyll` keeps GitHub Pages from applying Jekyll processing.
