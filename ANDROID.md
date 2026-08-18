# FundTrack Android



FundTrack Android is a **standalone** Capacitor app — like the Windows desktop version. The full fund database is bundled inside the APK and an embedded Node.js server runs on the device. **No PC connection is required** for normal use.



TEFAS / FonBul sync still needs **internet** on the phone (same as desktop).



## Prerequisites



1. **Node.js** (already installed for dev)

2. **Android Studio** with Android SDK ([download](https://developer.android.com/studio))

3. **JDK 21** (not Java 25): `winget install Microsoft.OpenJDK.21`

4. **Seed database** — built by the desktop prepare step or present at `server/funds.db`:

   ```powershell

   cd fundtrack-local\desktop

   node prepare.mjs

   ```



## Build the APK



```powershell

cd fundtrack-local\client

.\build-android.ps1

```



This will:

1. Build the React client

2. Bundle the Express API + sql.js for embedded Node

3. Copy `funds.seed.db` (~70 MB) into the app

4. Sync Capacitor + Gradle assemble



**APK output:** `fundtrack-local\FundTrack-Android.apk`  

**Gradle output:** `client\android\app\build\outputs\apk\debug\app-debug.apk`



> First build downloads Gradle deps and embeds Node.js (~60 MB) + seed DB — APK is typically **130–150 MB**.



## Open in Android Studio



```powershell

npm run cap:open

```



## First launch on the phone



1. Install the APK (enable “Install unknown apps” if needed).

2. Open the app — it copies the bundled database on first run (may take a few seconds).

3. All features work offline with the same data as the PC app.



### Optional: connect to a PC server instead



In **Ayarlar → Sunucu Bağlantısı**, enter a remote API URL (e.g. `http://192.168.1.4:3001`). Leave empty to use the **on-device database** (default).



## Architecture



| Layer | Role |

|-------|------|

| React UI | Same client as desktop |

| Capacitor WebView | Serves UI from app assets |

| `@choreruiz/capacitor-node-js` | Embedded Node.js v18 on Android |

| `server-mobile.cjs` | Express API (sql.js instead of better-sqlite3) |

| `funds.seed.db` | Full price history snapshot from PC build |



## Quick commands



| Command | Purpose |

|---------|---------|

| `npm run build:cap` | Production web build for Capacitor |

| `npm run prepare:android-node` | Bundle embedded server + seed DB |

| `npm run cap:sync` | Build + embed Node + sync Android project |

| `npm run cap:open` | Open Android Studio |

| `npm run cap:run` | Sync + run on connected device/emulator |

