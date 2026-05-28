# Mobile iOS Deployment: decision record + plan

**Status:** Architecture decision, not yet implemented. Paused for the user to continue in a future session.
**Created:** 2026-05-27 via a multi-agent brainstorm (`/brainstorm`).
**Owner:** Yechi (one-person open-source project).

This file is self-contained. A future session can pick up the iOS deployment work from this file alone. Companion artifacts (gitignored, may not survive): `.claude/brainstorm/ios-mobile-deployment/round-1.md` (raw agent outputs), `.claude/brainstorm/ios-mobile-deployment/synthesis.md`, and `docs/architecture/mobile-ios-plan.md` (a near-duplicate of this file, but `docs/architecture/` may or may not be tracked depending on the repo's final docs layout).

---

## The dilemma

How do we put Spent on an iPhone, given a hard constraint: **no bank or credit card data may ever live in a deployed (cloud) database.** The desktop app is the only place credentials and the transaction DB exist.

Spent today is a Next.js 16 web app that runs on the user's own machine. It uses `better-sqlite3` (native, server-side) for storage with AES-256-GCM encryption at rest, and `israeli-bank-scrapers` (Puppeteer-based, server-side) to fetch transactions. It is open-source, self-hosted, local-only. Neither the SQLite native bindings nor the Puppeteer scrapers can run on iOS.

Additional user-fixed constraint: **iOS distribution is TestFlight / sideload only. No App Store public release.**

---

## Conclusion (the decision)

1. **Companion architecture only.** Desktop keeps running the scrapers and owning the SQLite DB. The iPhone is a thin client that pairs to the desktop over the local network. The "no cloud DB" constraint is satisfied by construction: the only database is the user's own desktop file.
2. **Reject standalone mobile.** A self-contained mobile app (manual entry / CSV / OCR instead of scrapers) was considered and rejected by all four brainstorm agents independently. It would require rewriting the scraper and DB layers for iOS, which is a second product a one-person team cannot maintain.
3. **Phase 1 ships as a PWA, not native.** A Progressive Web App over the existing Next.js build reaches the phone in 2-3 weeks with zero TestFlight overhead.
4. **Phase 2 is Capacitor wrapping the existing Next.js build** (not React Native, not a Swift rewrite), and only if Phase 1 produces real demand for native-only capabilities.
5. **All sync is LAN-only, forever.** No cloud relay, no TURN server, no "connect from anywhere" reverse proxy. "No cloud DB" extends to "no cloud transport."
6. **Bank credentials never leave the desktop.** The phone only ever sees derived data (transactions, balances, categories) plus a sync secret.

---

## Architectures considered

### Companion mode (CHOSEN)

```
Desktop (laptop)                         iPhone
  Next.js server                           PWA (Phase 1) or
  israeli-bank-scrapers                    Capacitor app (Phase 2)
  SQLite (source of truth)   <--LAN/TLS--> read-only view + light edits
```

Desktop is unchanged. Phone pairs once, then syncs over the LAN when the desktop is reachable. Phone holds a cached snapshot for offline reading but cannot edit while offline.

### Standalone mode (REJECTED)

Mobile would own its own SQLite (e.g. `expo-sqlite`) with manual entry / CSV import / receipt OCR replacing the scrapers. Rejected because:
- Bank scraping cannot run on iOS (Puppeteer needs Node + Chromium).
- `better-sqlite3` native bindings do not work in React Native without a full fork.
- It is a separate product solving a different problem, not a simplification.
- CSV/OCR does not solve the Israeli banking-data acquisition problem; it offloads it to the user.

Positioning consequence: if a user has no desktop, Spent is not for them in v1. That is a deliberate constraint, not a defect.

---

## The four agent positions (condensed)

The decision came out of a brainstorm with four agents holding deliberately conflicting values. Full outputs are in `.claude/brainstorm/ios-mobile-deployment/round-1.md`.

- **privacy-maximalist** (approve-with-conditions): companion only, LAN-only transport with no cloud relay ever, all app data directories excluded from iCloud backup, OCR on-device only. Cited LastPass (encrypted relay promised 2011, breached 2022) and Apple's transparency report on honored data requests.
- **pragmatic-shipper** (approve-with-cuts): ship a PWA in 2-3 weeks, cut standalone, cut the native wrapper, cut mDNS autodiscovery. Add a QR code on the desktop for the local URL. TestFlight-only is fine for a self-host audience. Cited Splitwise (mobile web for years) and Copilot Money (early TestFlight was a wrapped WebView).
- **security-architect** (approve-with-controls): wrote a threat model; required mutual TLS 1.3 + cert pinning for LAN sync, HMAC-signed nonce-bearing requests for replay protection, Keychain + biometric gate + Secure Enclave (Phase 2), `NSURLIsExcludedFromBackupKey` on the SQLite mirror, hardware-key 2FA on the Apple Developer account.
- **maintenance-realist** (approve-with-simplifications): defer mobile until desktop stabilizes; PWA as a zero-maintenance interim; if native, use Capacitor not React Native; write the TestFlight runbook before the first build. Estimated 4-6 h/month reactive maintenance with 20-30 h September spikes for a native app; flagged that `israeli-bank-scrapers` already breaks 3-5x/year and that Israeli Open Banking keeps slipping while banks add bot detection.

**Convergence:** all four rejected standalone; three explicitly favored companion + PWA-first; the fourth (security) was mode-neutral but his controls map cleanly onto companion.

**Key insight that resolved the PWA-vs-native tension:** in companion mode, bank credentials never leave the desktop, so most of the security-architect's iOS-native must-haves (Keychain, Secure Enclave, biometric) protect a *sync secret*, not bank logins. That is a smaller secret with a smaller blast radius, which makes the PWA's weaker protections acceptable for Phase 1 and makes Capacitor's stronger protections a Phase 2 upgrade gated on real demand.

---

## Phased roadmap

### Phase 1: PWA (2-3 weeks)

- Add `next-pwa` to the Next.js 16 app. Pin the manifest, configure the service worker for offline read caching.
- Mobile-responsive sweep of existing pages (most already work via Tailwind breakpoints; verify each).
- QR code on a desktop Settings > Phone page encoding `https://[local-IP]:3000`.
- Pairing: passphrase prompt on mobile, PBKDF2-derive a key (at least 600k iterations), encrypt the sync secret in IndexedDB (Web Crypto AES-GCM 256).
- LAN-only by design. No relay. Document prominently.
- **Read-only first.** Editing comes in Phase 1.5.
- Distribution: a URL. Document "Add to Home Screen" in the README.

Wins: ships fast, no TestFlight overhead, no native deps, one codebase. Loses: no Keychain / Secure Enclave / biometric, limited background sync, no native integrations, and service workers require HTTPS (see open question 1).

### Phase 1.5: light editing (week 2-3)

Add exactly two write actions, the most mobile-native ones:
- **Log a settlement** (time-sensitive: you are standing next to the partner who just paid).
- **Re-categorize a transaction** (quick taps during a coffee break).

Skip mark-as-individual, approve-flagged, and budget edits for now. Conflict handling: last-write-wins on the desktop, comparing `updated_at`; desktop returns 409 if its row is newer; mobile shows "Updated on another device, refresh?".

### Phase 2: Capacitor native (only if Phase 1 demand justifies it)

Wrap the existing Next.js build in Capacitor (keeps one codebase). Add native modules only where they unblock a feature: secure storage / Keychain for the sync secret, `capacitor-native-biometric` for a biometric gate, manual native code for `NSURLIsExcludedFromBackupKey`, camera for QR pairing, background runner, push notifications. Distribute via TestFlight (90-day build expiry, internal testers up to 100, $99/year Apple Developer Program).

### Phase 3: hardening (only on real-user growth)

Full security control set (below), plus operational hardening: hardware-key 2FA on the Apple ID, SHA-256 IPA verification communicated out-of-band, provisioning-profile rotation, desktop-side audit log of sync requests.

---

## Required controls

### Phase 1 (PWA), non-negotiable

- Passphrase-derived key (PBKDF2-SHA256, at least 600k iterations, 16-byte random salt per device) for the sync secret.
- Sync secret stored encrypted in IndexedDB (Web Crypto AES-GCM 256). Decrypt only after passphrase entry on app open.
- Sync over TLS to the desktop even on LAN. Self-signed cert pinned on first pairing.
- No third-party JS on mobile routes (no analytics, no fonts CDN, no telemetry). Audit the bundle.
- Sync secret never written to a URL, never logged.

### Phase 2 (Capacitor), additional must-haves

- Keychain with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`, no iCloud sync.
- Biometric gate on credential reads (`kSecAccessControlBiometryCurrentSet` so a new enrolled biometric invalidates old keys).
- Secure Enclave key derivation on A7+ devices (`kSecAttrTokenIDSecureEnclave`).
- `NSURLIsExcludedFromBackupKey = true` on every sensitive file in the app sandbox. Mandatory.
- Mutual TLS 1.3 with desktop-generated cert pinned on first pairing; renegotiate every 90 days.
- HMAC-SHA256 over the shared secret on every sync request, with monotonic sequence numbers (30s drift tolerance) for replay protection.
- App Transport Security enforced for all non-LAN traffic; the LAN exception scoped to the paired host only.

### Phase 3, operational

- Hardware-key 2FA on the Apple Developer account.
- SHA-256 IPA verification communicated out-of-band (GitHub release / signed git tag).
- Provisioning-profile rotation every 6 months.
- Desktop-side audit log: every mobile sync request logged with timestamp, nonce, device ID.

---

## Threat model summary

| Adversary | Likelihood (this app) | Worst case if controls fail |
|---|---|---|
| Opportunistic attacker on same WiFi | Medium | Replay session against desktop, view transactions |
| Lost / stolen iOS device (unlocked) | Medium-low | Biometric or passphrase gate stops casual access |
| Lost / stolen + cracked device | Low | Phase 1: passphrase strength is the only defense. Phase 2: Secure Enclave protects the key. |
| Malicious npm dep on desktop | Medium (event-stream 2018, node-ipc 2022) | Credential exfil at scrape time. Mitigate: pin versions, audit scraper updates. |
| Trojanized IPA via sideload (Phase 2) | Low | Mitigate: hardware-key 2FA on Apple ID, IPA SHA-256 verification |
| Unencrypted iCloud backup of app sandbox | Medium (default behavior) | Full SQLite mirror in Apple account. Mitigate: NSURLIsExcludedFromBackupKey. Mandatory. |
| State-level adversary | Very low (out of scope for v1) | Not a target |

---

## Maintenance forecast (24 months)

| Component | Decay risk | Hours / quarter |
|---|---|---|
| `next-pwa` config | Low | 1-2 |
| iOS Safari PWA support | Medium | 2-4 |
| Capacitor (Phase 2+) | Medium-high (annual September iOS SDK breakage) | 6-12 |
| `israeli-bank-scrapers` upstream | High (banks change HTML 3-5x/year) | 4-8 (already paid; companion mode does not add to this) |
| TestFlight build cycle (Phase 2+) | Always | 6-8 |
| Cert rotation (mTLS) | Quarterly | 1-2 |

Mandatory Phase 2 runbook (write before the first TestFlight build): cert rotation, TestFlight re-upload checklist, scraper-breakage triage, pairing-failure troubleshooting, lost-device recovery.

Israeli banking outlook: Open Banking keeps slipping; banks are adding bot detection (OneZero already aggressive). Plan for scraping to get harder before Open Banking arrives. Budget 2-4 emergency scraper patches per year.

---

## Open questions (decide these before Phase 1 starts)

These are the points where the brainstorm reached "the user knows their own preferences better than the agents can model." Each has options, tradeoffs, and a recommendation.

### 1. HTTPS on the desktop for the PWA

PWAs need HTTPS to install service workers (offline cache, real install behavior); the only exception is `localhost`, which does not apply when the phone reaches the desktop by LAN IP.

| Option | Setup | Ongoing | UX |
|---|---|---|---|
| A. Self-signed cert + manual trust | 5-min one-time per device (download cert, install profile, trust in Settings > General > About > Certificate Trust) | Annual cert regen + re-trust | Real PWA, offline, native-feeling install |
| B. Skip service worker, serve HTTP on LAN | None | None | Normal mobile web page, no offline, "Not Secure" warnings |
| C. `mkcert` local CA | One-time CA install per device | Auto-renew under the CA | Cleanest renewals, same first-install trust dance |
| D. Cloud tunnel (Tailscale / ngrok) | Trivial | n/a | DISQUALIFIED: routes financial traffic through a third party, violates LAN-only |

**Recommendation: A**, with a strong docs page. Desktop serves the `.crt` from Settings > Phone with a QR code; ship a 4-screenshot iOS walkthrough. Cert lives 365 days; desktop reminds 30 days before expiry. Reject C because `mkcert` is a real dependency for marginal gain. Reject B because a PWA that is not really a PWA defeats the purpose of Phase 1.

### 2. Read-only vs light editing in Phase 1

Read-only ships in roughly 1 week; light editing in 2-3 weeks.

Highest-value mobile writes, ranked: log-a-settlement (high, time-sensitive), re-categorize (high, quick), mark-individual (medium), approve-flagged (low), edit-budget (low, conflict-prone).

**Recommendation:** Phase 1 read-only (ship week 1). Phase 1.5 adds exactly log-settlement and re-categorize (week 2-3). Skip the rest. Rationale: ship "see my money on my phone" fast for feedback, then add the two writes that are genuinely better on mobile than on desktop. Conflict handling: last-write-wins by `updated_at`, 409 on stale write, mobile offers refresh.

### 3. Desktop-asleep behavior

Laptops sleep; the desktop may be unreachable when the phone opens.

| Option | User sees | Risk |
|---|---|---|
| A. Cached data, no timestamp | Normal app | User trusts stale data |
| B. Cached + prominent "Stale since [time]" banner | Same data, clear staleness | Mild initial confusion |
| C. Refuse to open | Error screen | App useless offline |
| D. Wake-on-LAN | App wakes desktop then loads | WoL setup, unreliable on WiFi |
| E. Cellular relay | Connects over internet | DISQUALIFIED: violates LAN-only |

**Recommendation: B.** Always load the last snapshot; show a banner when sync is older than ~30 min; read works offline; mutations (Phase 1.5) are gated with "Wake up your desktop to make changes"; manual "Retry sync" button. Defer Wake-on-LAN to Phase 3 if anyone asks. Implementation note: add a `last_synced_at` to the mobile cache.

### 4. README scope: Phase 1 release or follow-on?

The "use Spent on your phone" flow is non-trivial (find IP, install cert, trust profile, scan QR, enter passphrase). For self-hosted open-source, the README is the install flow.

**Recommendation: part of Phase 1 release scope, full quality.** Phase 1 is not "done" until a non-technical user can follow the README on a fresh device in about 15 minutes and end up with a working install. Write the README before the code is finished, then verify it by following it on a real fresh device. The 3-5 extra days is cheap insurance against the dominant Phase 1 failure mode (people try, get stuck, leave).

### 5. Phase 2 trigger criteria

Capacitor + TestFlight is a real investment (about 12 weeks of work + $99/year + 6-8 h/quarter + September SDK breakage taxes). Do not start speculatively; do not delay forever.

**Recommendation: combined gate, all three AND conditions:**
1. At least 3 users using the PWA daily for at least 30 days (real adoption).
2. At least 1 user explicitly requests a native-only capability (biometric, push, background, or "faster than the PWA").
3. Spent has at least 2 quarters of stable post-Phase-1 operation (the maintenance-realist's insurance: do not take on recurring native overhead for a project that might be abandoned in month 6).

Run the gate check quarterly. If any condition is false, defer another quarter. Escape hatch: building it for personal / learning reasons is fine, just label it "exploratory" rather than the official Phase 2.

---

## Decisions locked

- Companion architecture only (no standalone mobile).
- LAN-only sync forever (no cloud relay).
- Phase 1 is a PWA, not native.
- If native (Phase 2), Capacitor wrapping the existing Next.js build (not React Native, not Swift).
- TestFlight / sideload only; no App Store.
- Bank credentials never leave the desktop; mobile sees only derived data plus a sync secret.

## What is NOT decided (carry into the next session)

- The five open questions above. They have recommendations, not commitments.
- Whether to start Phase 1 at all, and when. This record is the analysis; the go decision is the user's.
- The exact desktop pairing-secret design (passphrase strength rules, rotation, multi-device pairing).
- Whether more than one phone / partner device pairs to one desktop (the couple-budget context: Yechi and Reni may each want a phone).

## Next-session starting point

If resuming: read this file, pick answers for the five open questions, then either (a) ask the planner agent to turn Phase 1 into an implementable plan, or (b) run `/feature-pipeline supervised` against a Phase 1 spec derived from this file. The brainstorm agents (privacy-maximalist, pragmatic-shipper, security-architect, maintenance-realist) and the `/brainstorm` skill are available if any open question needs another debate round.
