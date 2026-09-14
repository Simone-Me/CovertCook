# The Android shell

This folder builds the Google Play artefact. It contains **no application
code** and never will: a Trusted Web Activity is a browser with the address
bar taken off, pointed at `https://covertcook.netlify.app`. Everything people
see is the same React app Netlify already serves, which is why a change to the
product ships without anybody touching this folder or Play.

What the shell *does* pin, and therefore what a rebuild costs, is short:
package name, host, launcher name, icons, theme and splash colours. Those are
the only decisions here — and `packageId` is the one that is permanent, because
Play identifies an app by it forever.

## What has to be true before a build

1. **`public/.well-known/assetlinks.json` carries the real fingerprint.** It
   ships with a placeholder string. Until it holds the SHA-256 of the key that
   actually signs the installed app, Android cannot verify that this app and
   this site are the same thing, and the TWA opens **with the browser address
   bar visible** — which is the one visual difference between an app and a
   bookmark.

   Under Play App Signing the signing key is *Google's*, not the upload key on
   this machine, so the fingerprint comes from Play Console:
   **Test and release → App integrity → Play app signing → App signing key
   certificate → SHA-256 certificate fingerprint**. Copy it in, deploy, then
   build.

2. **The keystore exists and is backed up off this machine.** `upload.jks`
   here is the *upload* key: Play re-signs with its own key on the way out, so
   losing this one is recoverable through Play support, while losing a
   self-signed key — the case for any APK distributed outside Play — is not
   recoverable at all. It is in `.gitignore` for the obvious reason.

   ```
   keytool -genkeypair -v -keystore upload.jks -alias upload \
           -keyalg RSA -keysize 2048 -validity 10000
   ```

## Building

```
npm i -g @bubblewrap/cli
cd android
bubblewrap init --manifest=https://covertcook.netlify.app/manifest.webmanifest
bubblewrap build
```

`bubblewrap init` writes its own `twa-manifest.json` from the web manifest.
The one committed here is the answer sheet: after init, diff the two and keep
the values from this file — `packageId`, `enableNotifications` and the colours
in particular. `bubblewrap build` then emits `app-release-bundle.aab`, which is
what Play takes.

`enableNotifications: true` is not decoration. `src/lib/push.ts` subscribes to
web push, and without that flag the shell never asks Android for notification
permission, so every push the app sends is dropped silently on Android 13 and
later.

## The version numbers

`appVersionCode` must increase on **every** upload to Play, even a re-upload of
an identical build; `appVersionName` is the string humans read. They have
nothing to do with `package.json`'s version, which tracks the web app — the
shell changes a handful of times in its life, the web app changes weekly.
