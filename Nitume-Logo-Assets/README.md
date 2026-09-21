# Nitume Logo — Asset Package

The Nitume mark is a map pin with a solid dot at its center — the visual shorthand for the product itself: a verified person, physically present, right where you need them. It's built entirely from the brand's own palette (Deep Trust Blue `#0B2545`, Action Green `#04AF4D`, White `#FFFFFF`) and the wordmark is set in Fira Sans Bold, matching `nitume_design_system.html`.

## What's in this package

```
svg/                          Vector masters — the source of truth. Infinitely scalable, edit these, not the PNGs.
  nitume-logo-full-color.svg      Primary horizontal lockup (icon + wordmark) — use this by default
  nitume-logo-reversed.svg        Horizontal lockup, white — for dark/blue backgrounds
  nitume-logo-stacked.svg         Icon above wordmark, centered — for square/tall placements
  nitume-logo-stacked-reversed.svg
  nitume-icon.svg                 Icon mark alone, transparent bg, full color
  nitume-icon-reversed.svg        Icon mark alone, white pin + green dot — for dark backgrounds
  nitume-icon-monochrome-blue.svg Single-color flattened mark — for 1-color print, embossing, watermarks
  nitume-icon-monochrome-white.svg
  nitume-app-icon.svg             Icon on a solid rounded-square badge — for OS app icons & favicons
  nitume-wordmark.svg             "Nitume" text only, no mark
  nitume-wordmark-reversed.svg

png/                          Rasterized exports, transparent background unless noted.
  logo-horizontal/            Primary lockup — 400 / 800 / 1600px wide
  logo-horizontal-reversed/   White version — 400 / 800 / 1600px wide
  logo-stacked/                512 / 1024px, full color and reversed
  wordmark/                    Text-only lockup, 800 / 1600px wide, full color and reversed
  icon/                         Icon mark alone — 16 to 1024px, transparent
  icon-reversed/                White version of the icon alone
  icon-monochrome/              Single-color versions, blue and white, 128 / 512px
  app-icon/                     Solid-badge version at every standard iOS/Android/PWA size
                                 (16–1024px, including 57/60/72/76/114/120/144/152/167/180/192)
  favicon/                       favicon-16.png, favicon-32.png, favicon-48.png, and a combined favicon.ico
```

## Which file to use

- **Website header, app top bar, most everyday use:** `svg/nitume-logo-full-color.svg` (or the matching PNG at the width you need). Use `nitume-logo-reversed.svg` the moment it sits on Deep Trust Blue or any dark photo/background.
- **App icon (iOS/Android home screen), PWA manifest icon, social profile picture:** `svg/nitume-app-icon.svg` or `png/app-icon/`. This is the only version with a solid background — every other export is transparent.
- **Browser tab icon:** `png/favicon/favicon.ico` (covers 16/32/48px in one file) or the individual PNGs if your platform wants them separately.
- **Square or vertical placements** (splash screens, printed signage, a business card): `nitume-logo-stacked.svg`.
- **Small or single-color contexts** (engraving, a watermark, printing on branded merchandise in one ink color): the monochrome icon files.
- **Text-only contexts** where the pin mark doesn't fit or is already shown elsewhere on the page: the wordmark-only files.

## Rules, carried over from the design system

- Don't recolor the mark outside the brand palette, and don't separate the green dot from the blue pin shape — they're the same mark.
- Keep clear space around the logo roughly equal to the height of the pin's green dot on every side; don't crowd it against other content.
- Never place the full-color (blue) version on a dark background, or the reversed (white) version on a light one — use `icon-reversed`/`logo-reversed` for anything dark, blue, or photographic.
- The wordmark is always Fira Sans Bold — if you need to typeset "Nitume" somewhere the SVG can't be embedded, match that exactly rather than substituting a system bold.
