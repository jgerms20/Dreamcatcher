# Shipping DreamCatcher to TestFlight

The repo builds and uploads the iOS app for you. **You do not need a Mac** — the
`iOS TestFlight` workflow runs on a hosted macOS runner.

What you *do* need is an Apple Developer Program membership (**$99/year**). There
is no way around that one: only an enrolled account can sign a build or own a
TestFlight app record. Everything below is the one-time setup to connect that
account to this repo.

Budget about 30 minutes, plus up to 48 hours if Apple's enrollment review is slow.

---

## How the pieces fit

DreamCatcher is a React web app. TestFlight distributes native iOS binaries, so
[Capacitor](https://capacitorjs.com) wraps the built web bundle in a real iOS app
(`ios/` in this repo) that can be signed, uploaded, and installed like any other.

```
npm run build:ios          →  web bundle, base '/'  →  ios/App/App/public
GitHub Actions (macOS)     →  xcodebuild archive + export  →  DreamCatcher.ipa
xcrun altool               →  TestFlight
```

The wrapper is not just a browser window pointed at the site. Dictation — the
whole point of the app — **cannot** use the Web Speech API on iOS, because
WKWebView doesn't expose it. In the native build the record button drives
Apple's own `SFSpeechRecognizer` through a Capacitor plugin instead. See
[Known differences](#known-differences-in-the-ios-build).

---

## Step 1 — Enroll in the Apple Developer Program

<https://developer.apple.com/programs/enroll/>

Enroll as an **individual** unless you have a company with a D-U-N-S number.
Approval is usually same-day but can take a couple of days.

Once you're in, grab your **Team ID**: <https://developer.apple.com/account> →
**Membership details**. It's 10 characters, like `A1B2C3D4E5`.

> Save this as `APPLE_TEAM_ID` later.

## Step 2 — Register the bundle identifier

<https://developer.apple.com/account/resources/identifiers/list> → **+**

- Type: **App IDs** → **App**
- Description: `DreamCatcher`
- Bundle ID: **Explicit** → `com.jgerms.dreamcatcher`
- Capabilities: leave everything off. The app needs none.

The bundle ID must match [`capacitor.config.ts`](../capacitor.config.ts). If you
want a different one (say you own a domain), change it in **both** places:

```bash
# pick your identifier, then:
OLD=com.jgerms.dreamcatcher
NEW=com.yourdomain.dreamcatcher
sed -i '' "s/$OLD/$NEW/g" capacitor.config.ts ios/App/App.xcodeproj/project.pbxproj
```

Do this **before** the first upload — the identifier is permanent once a build
exists under it.

## Step 3 — Create the app record in App Store Connect

<https://appstoreconnect.apple.com/apps> → **+** → **New App**

- Platform: **iOS**
- Name: `DreamCatcher` (must be unique across the whole App Store — if it's
  taken, pick something like `DreamCatcher Journal`; this is the store listing
  name, not the home-screen name)
- Primary language: English
- Bundle ID: the one from step 2
- SKU: anything private, e.g. `dreamcatcher-001`
- User access: Full Access

You don't need screenshots, a description, or pricing for TestFlight. Those are
only required for public App Store release.

## Step 4 — Create an App Store Connect API key

This is what lets CI sign and upload without a Mac or a password.

<https://appstoreconnect.apple.com/access/integrations/api> → **Team Keys** → **+**

- Name: `GitHub Actions`
- Access: **App Manager**

> If a later run fails saying it can't create a signing certificate, regenerate
> the key with **Admin**. Certificate and profile creation is the one operation
> that sometimes needs the higher role.

Then:

1. **Download the `.p8` file.** Apple lets you download it exactly once. If you
   lose it, revoke the key and make a new one.
2. Copy the **Key ID** (10 characters, shown in the table).
3. Copy the **Issuer ID** (a UUID, shown above the table).

## Step 5 — Add four secrets to GitHub

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Secret name            | Value                                                        |
| ---------------------- | ------------------------------------------------------------ |
| `APPLE_TEAM_ID`        | Team ID from step 1, e.g. `A1B2C3D4E5`                        |
| `APPSTORE_KEY_ID`      | Key ID from step 4                                            |
| `APPSTORE_ISSUER_ID`   | Issuer ID from step 4                                         |
| `APPSTORE_PRIVATE_KEY` | The **entire contents** of the `.p8` file                     |

For the last one, open the `.p8` in a text editor and paste everything including
the header and footer lines:

```
-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg...
-----END PRIVATE KEY-----
```

The workflow checks all four upfront and fails in the first few seconds with a
named list if any are missing, rather than dying inside `xcodebuild`.

## Step 6 — Run the build

Repo → **Actions** → **iOS TestFlight** → **Run workflow**.

Takes roughly 10–15 minutes. When it finishes, Apple still needs a few more
minutes to process the build before it shows up in App Store Connect.

You can also trigger it by pushing a tag:

```bash
git tag ios-v1.0.0 && git push origin ios-v1.0.0
```

## Step 7 — Install it on your phone

App Store Connect → your app → **TestFlight** tab.

- **Internal testing** — add yourself under **Users and Access** first, then to
  an internal group. Up to 100 testers, and builds go out **as soon as
  processing finishes with no review**. This is what you want for yourself.
- **External testing** — up to 10,000 testers by email or public link, but the
  first build needs **Beta App Review** (usually about a day).

Install [TestFlight](https://apps.apple.com/app/testflight/id899247664) on your
iPhone and the build appears there.

---

## Versioning

The **build number** is set automatically to the GitHub Actions run number, so it
always increases and never collides — App Store Connect rejects duplicates.

The **version** (`1.0`) is `MARKETING_VERSION` in
`ios/App/App.xcodeproj/project.pbxproj`. Bump it when you want a new user-facing
version:

```bash
sed -i '' 's/MARKETING_VERSION = 1.0;/MARKETING_VERSION = 1.1;/g' ios/App/App.xcodeproj/project.pbxproj
```

## Known differences in the iOS build

| | Web / PWA | iOS app |
| --- | --- | --- |
| Dictation engine | Web Speech API | Native `SFSpeechRecognizer` |
| Keeps the raw audio | Yes, saved with the dream | No — the native recognizer holds the mic for the session |
| Service worker | Yes | Skipped; the bundle is already on the device |
| Base path | `/Dreamcatcher/` | `/` |

Everything else — the journal, symbols, insights, sleep, interpretation, the fal
video proxy, the passcode lock — behaves identically. Dream data still lives only
on the device, so the app and the website keep **separate** journals; there is no
sync between them.

## About App Review

Internal TestFlight builds skip review entirely, so you can use the app on your
own phone without Apple ever looking at it.

Going wider (external testing, or the App Store) means review, and the honest
risk there is **guideline 4.2, minimum functionality** — Apple rejects apps that
are just a repackaged website. Points in DreamCatcher's favour: it uses native
speech recognition and the microphone, it works fully offline, there's no login
wall, and it does real on-device work rather than framing a remote page. That's a
reasonable position, not a guaranteed pass.

Expect a reviewer to test dictation, since the app asks for two permissions. Make
sure it works on a real device before submitting.

## Building locally instead (optional, needs a Mac)

```bash
npm install
npm run build:ios
npm run ios:open      # opens Xcode
```

In Xcode: select the **App** target → **Signing & Capabilities** → tick
*Automatically manage signing* → pick your team. Then **Product → Archive**.

## Troubleshooting

**"No signing certificate iOS Distribution found"**
The API key lacks certificate permissions. Regenerate it with the **Admin** role
(step 4) and update `APPSTORE_KEY_ID` / `APPSTORE_PRIVATE_KEY`.

**"The bundle identifier cannot be registered to your development team"**
Someone else already owns that bundle ID globally. Pick another one using the
`sed` command in step 2.

**"No suitable application records were found"**
The App Store Connect app record from step 3 is missing, or its bundle ID doesn't
match `capacitor.config.ts`.

**"Redundant binary upload... build already exists"**
That build number was already used. Re-run the workflow; the run number
increments on its own.

**Dictation does nothing on device**
Check Settings → DreamCatcher → that both **Microphone** and **Speech
Recognition** are enabled. If the toggles are missing, the build predates the
`Info.plist` usage strings — rebuild from current `main`.
