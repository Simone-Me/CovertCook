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

`icons/` holds the icon masters. The five `logo*.png` are the app mark, drawn
for this app and not from Flaticon, so the credit and the licence below do not
apply to them. Which one becomes which shipped file is in the CHANGELOG for
2026-09-27; the command to regenerate them is at the foot of this file.

Every other file in `icons/` is a 512×512 tile master. What ships is a 96 px WebP each —
3× a 32 px icon, which is every phone worth designing for — and the set went
from **273 KB to 37 KB** doing it.

The icons are **Flaticon's**, and their licence requires visible credit. That
credit is in the app footer on every screen, not buried in an About page; if
the footer ever loses it, the app is no longer allowed to use them.

`jar_money.png` came in from outside this repo; whatever its licence requires is
not recorded here, so check it before shipping the app anywhere new.

`icon-proposals/` is the exception to all of the above: those are drawn from
scratch, and the point of drawing them was that the Flaticon free licence does
not stretch to a store listing. The credit in the footer covers the tiles
inside the app, which is the use it was written for; it does not travel to a
512×512 icon sitting in a Play listing, and that icon is the app's mark rather
than an illustration in it. Recolouring the Flaticon one does not change the
answer — a modification stays a derivative. See `icon-proposals/README.md`.

To regenerate the icons after editing a master:

```
python -c "from PIL import Image; import glob,os; [Image.open(f).convert('RGBA').resize((96,96), Image.LANCZOS).save('public/'+os.path.basename(f)[:-4]+'.webp','WEBP',quality=88,method=6) for f in glob.glob('assets-src/icons/*.png') if 'logo' not in f]"
```

The mark is regenerated separately, because each size comes from a different
master (the masters are not exactly square, so they are cropped first):

```
python - <<'PY'
from PIL import Image
L=Image.LANCZOS
def sq(p): im=Image.open(p).convert('RGBA'); s=min(im.size); return im.crop((0,0,s,s))
logo=sq('assets-src/icons/logo.png'); face=sq('assets-src/icons/logo_face.png'); nobg=sq('assets-src/icons/logo_face_inverse_nobg.png')
for n,o in [(180,'apple-touch-icon.png'),(192,'pwa-192x192.png'),(512,'pwa-512x512.png')]: logo.resize((n,n),L).save('public/'+o,optimize=True)
for n,o in [(32,'favicon-32.png'),(192,'favicon-192.png')]: face.resize((n,n),L).save('public/'+o,optimize=True)
m=Image.new('RGBA',(512,512),face.getpixel((2,2))); m.paste(face.resize((400,400),L),(56,56)); m.save('public/pwa-maskable-512x512.png',optimize=True)
nobg.resize((96,96),L).save('public/logo.webp','WEBP',quality=88,method=6)
face.resize((168,168),L).save('public/logo_face.webp','WEBP',quality=88,method=6)
PY
```

To regenerate the fridge WebP after editing the master:

```
python -c "from PIL import Image; im=Image.open('assets-src/inside_fridge.png'); w=820; im.resize((w, round(im.height*w/im.width)), Image.LANCZOS).save('public/inside_fridge.webp','WEBP',quality=82,method=6)"
```

`public/logo-hands-white-borders.png` (the chef peeking over the counter in the
creation sheet) and `public/pwa-maskable-white-borders.png` (the face in the
tour's bubble and on its last screen) are used exactly as the designer supplied
them, white background included: that white is what keeps the red hat visible
on the red tablecloth. They are not converted, cropped or recoloured.
