# Yandex Music Custom (Mod)

An unofficial desktop mod for Yandex Music: Electron + TypeScript + React.
The brand and logo are original (`src/shared/brand.ts`, `build/icon.ico`) and live in one place.

**Windows x64 installer:** [download from Releases](https://github.com/Winirgt/yandex-music-custom/releases/latest).
Repository: https://github.com/Winirgt/yandex-music-custom

Two modes:
1. **Inject into the official app** — the installer patches the installed Yandex Music folder
   (`%LOCALAPPDATA%\Programs\YandexMusic`) and its `app.asar`. The mod then runs inside the
   regular desktop application.
2. **Standalone wrapper** — a separate window over `music.yandex.ru` for development and as a fallback.

## Features

- Animated settings menu via `Ctrl+Shift+M` or a floating gear button (press again to close).
- Background: 6 gradients, your own **photo / GIF / video** with blur and darkening, saved between launches.
- Weather overlay: **rain** with drops sliding down the screen and **snow** with drifting flakes.
- Hides ads, podcasts, subscribe buttons, social buttons and recommendations (CSS + MutationObserver).
- Removes inert overlays (`data-floating-ui-inert`) that used to block clicks.
- Hides "My Wave" blocks: mood/artist feed, hero cover and player, announcements.
- Removes the "Music on Windows / Download" banner.
- Hides **left sidebar categories** (Search, My Wave, For You and Trends, Concerts, Books and Podcasts,
  Kids, Collection, Plus, pinned items, logo, whole sidebar).
- **Player position**: bottom / top / left / right / hidden.
- **10-band equalizer** with presets (Flat, Bass, Vocal, Rock, Pop, Electronic, Classical, Jazz)
  and manual tuning.
- **Visualizer**: Spectrum, Wave, Radial, Rings, Aurora — with opacity and color options.
- **Background shake** with strength and direction settings.
- Profiles: Minimal, Dark Theme, Custom Background, plus a custom profile and autosave.
- Menu tab: accent and panel colors, corner radius, 6 locally bundled fonts (Classic, Oswald,
  Cormorant, Comfortaa, Rubik, Manrope) tuned with per-font line-height and letter-spacing.
- Background tab: gradients / photo / GIF / video, plus a Glass section (app glass, menu glass,
  blur strength, glass tint, menu opacity). The patch makes the window genuinely transparent so
  the Windows desktop and other windows show through the glass.
- The fullscreen "Yandex Plus" paywall (`PaywallRU`) and the "Music on Windows" banner are always
  removed so they never cover the interface or the play button.
- When the window is minimized, heavy visual work (visualizer, weather, video wallpaper, CSS effects)
  is paused while music keeps playing. Everything resumes when the window is restored.

> ⚠️ This project is not affiliated with Yandex. Modifying the official application, changing its
> interface and hiding ad blocks may violate the Yandex Music terms of use. Use it for personal
> purposes only, do not bypass paid features, and do not present the mod as an official client.
> The patch disables asar integrity validation, which lowers the application's protection.
> You are responsible for any consequences of use.

---

## 1. Project structure

```
yandex-music-client/
├─ package.json / electron.vite.config.ts / vite.injector.config.ts
├─ electron-builder.yml            # NSIS + customInstall/customUnInstall (patch / revert)
├─ build/installer.nsh             # calls --patch on install and --unpatch on uninstall
├─ build/icon.ico
├─ src/
│  ├─ shared/{types,presets,brand}.ts # types, gradients, EQ presets, profiles, brand
│  ├─ main/
│  │  ├─ index.ts                 # standalone wrapper + --patch / --unpatch modes
│  │  ├─ patcher.ts               # runs the patch worker in ELECTRON_RUN_AS_NODE
│  │  ├─ patch-worker.ts          # patches app.asar of the official app (@electron/asar)
│  │  ├─ store.ts                 # settings.json in userData
│  │  └─ media.ts                 # ymod-media protocol (Range for video) + relaxed CSP
│  ├─ mod/
│  │  ├─ main.ts                  # module injected into the official app (HTTP+SSE bridge)
│  │  └─ injector.ts              # page injector for the official app
│  ├─ preload/
│  │  ├─ core.ts                  # shared injection logic (background, hiding, player, EQ)
│  │  ├─ index.ts                 # preload for the wrapper (IPC transport)
│  │  ├─ settings.ts              # settings window API
│  │  ├─ audio.ts                 # Web Audio: EQ + AnalyserNode (CORS-safe)
│  │  ├─ visualizer.ts            # canvas visualizers
│  │  ├─ weather.ts               # rain and snow overlay
│  │  └─ selectors.ts             # selectors for hiding / sidebar / player
│  ├─ renderer/src/{Settings.tsx,styles.css,main.tsx,env.d.ts}
│  └─ renderer/fonts/              # local TTF files (static + variable)
└─ scripts/{feasibility,make-ico,fetch-fonts,step-copy}.mjs # patch check and helper scripts
```

---

## 2. Installing the mod into the official app

Build the installer with `npm run dist` and run `release\Yandex Music Custom-1.0.0-setup.exe`.
NSIS runs `--patch` during installation:

1. Finds `%LOCALAPPDATA%\Programs\YandexMusic`.
2. Creates backups `app.asar.ymod-backup` and `<exe>.ymod-backup`.
3. Extracts the asar, appends `require('./ymod/main.js')` to the main bundle, adds the `ymod/` folder.
4. Repacks the asar and disables the `EnableEmbeddedAsarIntegrityValidation` fuse in the exe
   (otherwise the patched asar would not load).
5. Writes the `resources/ymod-installed.json` marker.

Uninstalling from "Apps & features" runs `--unpatch` and restores the original files.

Manual commands:
```powershell
& "release\win-unpacked\Yandex Music Custom.exe" --patch     # inject
& "release\win-unpacked\Yandex Music Custom.exe" --unpatch   # revert
```

Notes:
- An official app update overwrites the asar/exe and removes the mod — reinstall it after updates.
- The mod stores settings in the official app's userData: `%APPDATA%\YandexMusic\ymod-settings.json`.
- The standalone wrapper uses its own userData folder: `%APPDATA%\yandex-music-custom\ymod-settings.json`.
- Settings are saved on every change (no debounce), so nothing is lost when the window closes.
  A separate file name prevents the official app from overwriting the mod settings.

---

## 3. Development and build

```powershell
npm install
npm run dev        # standalone wrapper with hot reload
npm run build      # typecheck + build main/preload/renderer/injector
npm run dist       # .exe installer in release/
npm run dist:dir   # unpacked folder without installer
```

If electron-builder fails with `Cannot create symbolic link ... winCodeSign`, enable Windows
Developer Mode or unpack the cache manually, then retry:

```powershell
$cache = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
$archive = Get-ChildItem $cache -Filter *.7z | Select-Object -First 1
$target = Join-Path $cache 'winCodeSign-2.6.0'
if (Test-Path $target) { Remove-Item $target -Recurse -Force }
& ".\node_modules\7zip-bin\win\x64\7za.exe" x $archive.FullName "-o$target" '-x!darwin\*' -y
```

---

## 4. Selectors and caveats

The selectors in `src/preload/selectors.ts` are starting examples. Yandex class names are hashed
and change over time — inspect them with DevTools (F12). Broad substrings are dangerous:
`[class*="Banner"]` also matches `WithTopBanner_*` (the content wrapper), and `[class*="Vibe"]`
matches `Content_main_newVibe`. Narrow compound selectors are used instead
(`TopAdvertBanner`, `Recommendations_`, etc.).
"My Wave" is found by menu text, categories by `href` (`/search`, `/landing/main`, `/concerts`,
`/non-music`, `/kids`, `/collection`, `/plus`).

Player positions (top/left/right) are experimental CSS rearrangements; Yandex markup may differ.
If you see artifacts, switch back to Bottom.

---

## 5. Equalizer, visualizer and weather

- Graph: `audio -> 10 BiquadFilter -> AnalyserNode -> destination`. Disabled EQ means all bands at 0 dB.
- The Yandex player usually uses MSE (`blob:` source), which is same-origin, so the EQ and analyser
  connect without CORS issues. For http(s) sources the mod tries `crossOrigin=anonymous`; if the CDN
  has no CORS headers, it falls back and leaves the audio untouched (status "unavailable").
- The visualizer is fed by the AnalyserNode; without a track it draws a procedural animation.
- In the official app the wallpaper media is served via `ymod-media://` (with Range support for video).
- Weather is a separate full-screen canvas: rain draws streaks plus droplets sliding down the screen,
  snow draws drifting flakes. It is disabled by default and pauses with the rest of the visual effects
  when the window is minimized.

---

## 6. Security

- Wrapper: contextIsolation + sandbox, nodeIntegration disabled, site permissions denied.
- Official-app mod: does not override `webRequest.onHeadersReceived` (Yandex uses it for certificate
  checks) and does not call `registerSchemesAsPrivileged` (that would reset the privileges of the
  `music-application` protocol). The bridge uses a token-protected loopback HTTP+SSE server.
- The patch disables asar integrity validation — a deliberate reduction of protection required for
  modification.
- Paid features are not bypassed.
