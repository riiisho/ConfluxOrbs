# ConfluxOrbs

A multi-window canvas experiment where glowing particle orbs react to each other across browser windows. Open the page in two or more windows, position them side by side, and watch the orbs reach toward one another with plasma tendrils, swell with anger as they approach, and erupt into a galaxy collision when they meet.

**[Live demo](https://riiisho.github.io/ConfluxOrbs/)**

## How it works

Each window runs an independent orb simulation on an HTML5 canvas. Windows communicate their screen positions in real time using the [`BroadcastChannel` API](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel), which works across tabs and windows of the same origin without a server.

Proximity drives behaviour:

| Distance | Effect |
|---|---|
| < 700 px | Spring force — orbs attract and orbit each other |
| < 450 px | **Anger** ramps up — particles spin faster, colour shifts blue → red |
| < 220 px | **Merge** kicks in — orbs swell, tendrils stream across, shockwave rings pulse |

The particle system has three layers rendered back-to-front each frame:

- **Halo** — slow outer wisps, deep violet/nebula blue
- **Ring** — main vortex band that forms the glowing tendrils
- **Core** — 256 fast, turbulent particles; colour ramps from icy blue-white (calm) to plasma magenta-white (merging)

A warped grid is drawn beneath the orbs, displaced by each orb's gravity well.

## Getting started

No build step — just open the file directly.

```bash
git clone https://github.com/<your-username>/ConfluxOrbs.git   # update username if needed
cd ConfluxOrbs/docs
# open index.html in your browser (or serve with any static server)
npx serve .
```

Then open `http://localhost:3000` in two separate windows and drag them next to each other.

> **Note:** `BroadcastChannel` only works between pages on the same origin, so both windows must be served from the same host (or both opened as `file://`). It does **not** work across different machines.

## Deployment

The repo uses a GitHub Actions workflow ([`.github/workflows/static.yml`](.github/workflows/static.yml)) that automatically deploys the `docs/` folder to GitHub Pages on every push to `main`.

To enable it:

1. Push the repo to GitHub.
2. Go to **Settings → Pages**.
3. Set **Source** to **GitHub Actions**.

The live URL will be `https://<your-username>.github.io/ConfluxOrbs/`.

## Project structure

```
docs/
  index.html      # single-page shell
  site.js         # orb simulation, particle system, BroadcastChannel logic
  site.css        # dark background, full-screen canvas
  site.min.js     # minified build
  site.min.css
.github/
  workflows/
    static.yml    # GitHub Pages deployment workflow
```

## Browser support

Requires `BroadcastChannel` and `Canvas 2D` — supported in all modern browsers. Does not work in Safari on iOS (BroadcastChannel is cross-tab only there, not cross-window).

## License

See [LICENSE](LICENSE).
