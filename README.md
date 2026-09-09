# PBS for BBO - Browser Extension

A lightweight browser extension for [Practice Bidding Scenarios](https://github.com/bridge-craftwork/Practice-Bidding-Scenarios) on [Bridge Base Online](https://www.bridgebase.com). Supports Chrome and Safari on macOS.

Derived from [BBOalert](https://github.com/stanmaz/BBOalert) by Stanislaw Mazur, stripped down to only what PBS needs - no alerting system, no auto-alerts, just the script engine, shortcuts panel, and plugin support (BBA Compare, PBN Capture).

> **Status: Beta** - For testing by PBS contributors.

## Install on Chrome

1. **Download** this repository:
   - Click the green **Code** button above, then **Download ZIP**
   - Or clone: `git clone https://github.com/bridge-craftwork/pbs-bbo-extension.git`

2. **Open** Chrome and go to `chrome://extensions/`

3. **Enable** Developer mode (toggle in the top right corner)

4. **Click** "Load unpacked" and select the `src/` folder inside the downloaded repository

5. **Go to** [bridgebase.com](https://www.bridgebase.com) and log in - you should see the **PBS** tab in the sidebar

## Install on Safari (macOS)

> **Note:** iPad is not currently supported. BBO serves a different mobile layout on iPad that lacks the DOM elements the extension requires.

1. **Requirements:** Xcode installed on a Mac, Apple Developer account

2. **Build the Xcode project:**
   - Open `safari/PBS with BBA Compare/PBS with BBA Compare.xcodeproj` in Xcode
   - Select your development team for code signing
   - Select **My Mac** as the build target
   - Build and run (⌘R)

3. **Enable the extension:** Go to **Safari > Settings > Extensions** and enable "PBS with BBA Compare"

4. **Go to** [bridgebase.com](https://www.bridgebase.com) and log in

### Rebuilding after src/ changes

The Safari project uses copied resources. After modifying files in `src/`, re-run the converter:

```bash
xcrun safari-web-extension-converter src/ \
  --project-location safari/ \
  --app-name "PBS with BBA Compare" \
  --bundle-identifier com.rickwilson.pbs-bbo \
  --macos-only --swift --copy-resources --force --no-open --no-prompt
```

## Updating

If you installed via ZIP:
- Download the latest ZIP, replace the `src/` folder, then click the reload icon on `chrome://extensions/`

If you cloned:
- `git pull` then click the reload icon on `chrome://extensions/`

## Notes

- If you also have BBOalert installed, **disable it** before using this extension to avoid conflicts
- PBS data URL defaults to the main `-PBS.txt` from the Practice-Bidding-Scenarios repo
- Plugin configuration (Enable Test Mode, Use Beta Layout) is accessed through the config selector in the Data tab

## License

See [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md) for BBOalert license attribution.
