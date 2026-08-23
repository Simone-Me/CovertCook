# Originals, kept out of the build

Everything in `public/` is copied into `dist/` and then precached by the
service worker, so a full-size original left there ships to every phone that
installs the PWA — `DESIGN.md` §4 is explicit that four high-resolution
pictures outweigh the rest of the app on their own.

These are the masters. The versions the app actually loads live in `public/`:

| Master here | Shipped in `public/` | Why |
|---|---|---|
| `inside_fridge.png` (1122×1402, 1.2 MB) | `inside_fridge.webp` (820 px wide, 42 KB) | 28× smaller; 820 px covers a 2× phone and a desktop fold |
| *(deleted)* `cutlery_anim.gif` | `cutlery_anim.mp4` (165 KB) + `cutlery_anim.png` poster | the GIF was the same animation 5× heavier and impossible to pause, so it was removed rather than kept as a master |

To regenerate the WebP after editing the master:

```
python -c "from PIL import Image; im=Image.open('assets-src/inside_fridge.png'); w=820; im.resize((w, round(im.height*w/im.width)), Image.LANCZOS).save('public/inside_fridge.webp','WEBP',quality=82,method=6)"
```
