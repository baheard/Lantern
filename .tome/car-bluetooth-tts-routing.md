---
title: Car Bluetooth / CarPlay TTS routing — platform constraints (#54)
tags: [audio, bluetooth, carplay, ios, tts, media-session, speech-synthesis, openai-tts, platform-constraint]
created: 2026-06-29
updated: 2026-06-29
aliases: [media-session-car, carplay-audio, bluetooth-narration]
---

Constraints that govern issue #54 ("register as a media audio source for car Bluetooth")
and the whole car-audio bug cluster (#53 volume, #57 echo, #58 finished, #59 routing).
Two are hard platform limits with **no web-side fix**:

## 1. iOS `speechSynthesis` does NOT route to Bluetooth / CarPlay — phone speaker only
Structural, not a bug we can patch. WebKit backs `speechSynthesis` with native
`AVSpeechSynthesizer` on its own system-managed audio session; the
`AllowBluetooth`/`A2DP`/`AirPlay` options are only set on WebKit's mic
(`PlayAndRecord`) category, never the speech-synth path, and **there is no JS API to
change the AVAudioSession category** from a web page. Independently confirmed (Apple
Community #255514185, iOS 17): Web Speech TTS came out the iPhone speaker while an
HTML5 `<audio>` element on the *same page* played over CarPlay fine.

**The only narration path that reaches Bluetooth/CarPlay on iOS is a real `<audio>`
element** — i.e. Lantern's **OpenAI-TTS path** (`playWithOpenAITTS()` in
`docs/js/narration/openai-tts.js`, which does `new Audio(blob)` / MediaSource). The
device-voice path (`playWithBrowserTTS()` in `tts-player.js`) cannot. Android
`speechSynthesis` is the same story (routes to device speaker, not the BT sink).

**Strategic decision (user, 2026-06-29): cloud TTS is NOT the answer here.** Device voice
(`speechSynthesis`) is the base/default and stays that way — cloud TTS is not long-term
viable as a foundation (cost, per-user API key, network, breaks offline). See memory
`feedback_no_cloud_tts_as_base`. **So full in-car narration AUDIO over Bluetooth on iOS
is treated as a documented PLATFORM WALL, not something we fix by defaulting to cloud
TTS.** Cloud TTS users get it as a side effect; we don't engineer #54 around it.

## 2. Active `getUserMedia` (voice / push-to-talk) FORCES output to the phone speaker
WebKit #167788 (open since 2017): when mic capture is live, iOS overrides
Bluetooth/CarPlay and sends ALL output to the built-in speaker — even the cloud-TTS
`<audio>` path. So hands-free "listen + narrate over the car" fights itself: the mic
being on yanks narration off Bluetooth. Implication for #54: to get reliable in-car
audio, **suspend mic capture while narrating** (it's already decoupled — see
[[mic-narration-coupling]]).

## Decisions that close off the "real" fixes
- **Cloud TTS as default — NO** (user, 2026-06-29): not long-term viable; device voice
  is the base. See memory `feedback_no_cloud_tts_as_base`.
- **Native wrapper (Capacitor/WKWebView + native `AVSpeechSynthesizer` on a self-owned
  `AVAudioSession`) — NO** (user, 2026-06-29: "i don't want to pay"): a native iOS app on
  a real device needs an Apple Developer membership ($99/yr). That route WOULD fully fix
  it (free system voices routed to BT, mic+playback coexisting, real CarPlay screen) — but
  it's off the table on cost. So Lantern stays **pure PWA**.
- **Net:** with neither cloud nor native allowed, iOS in-car narration AUDIO over
  Bluetooth is a documented platform wall. The free PWA-only escape that exists is local
  WASM TTS (Piper/sherpa-onnx → `<audio>`/AudioContext) — escapes the `speechSynthesis`
  routing wall, but heavy bundle + the getUserMedia-forces-speaker wall remains. Treated
  as an optional experiment, not the #54 deliverable.

## 3. The car SCREEN (CarPlay/Android Auto dashboard) is unreachable from a PWA
Those are native-only frameworks (`MPRemoteCommandCenter` / `MediaBrowserService`). No
web JS runs there; Media Session can never list the app in the car's media browser or
draw on the dash. Realistic target = the **phone's lock-screen/Control-Center controls
and physical BT / steering-wheel media buttons**, which DO route to Media Session
action handlers.

## What Media Session CAN do (and how to wire it right)
- Reaches phone controls + BT hardware buttons: `metadata`, `playbackState`
  (`'playing'`/`'paused'`/`'none'` — wrong value makes controls vanish), and handlers
  `play`/`pause`/`stop`/`previoustrack`/`nexttrack`. Wrap each `setActionHandler` in
  try/catch (unsupported actions throw).
- **No volume action exists** — the car/system knob owns volume (so #53's "volume
  control doesn't work in car" is partly *by design*; we can't override the sink, and
  `setSinkId()` is unreliable in WebKit).
- **Anchor must be a looping, UNMUTED, actually-*playing* `<audio>` element** — not a
  Web Audio gain=0 / silent oscillator. Chrome/Android needs ≥~5 s of real media and
  drops the controls ~5 s after pause; a bare oscillator doesn't create the OS
  "media playing" state. Lantern already has the right primitive:
  `ensureSilentAudioLoop()` in `docs/js/utils/audio-feedback.js` (silent WAV data URI).
  The Media Session wiring currently lives in `tts-player.js` `startKeepAlive()` and is
  anchored to a **bare oscillator** — prefer the silent `<audio>` loop as the backing.
- **State sync is load-bearing:** mirror anchor ↔ TTS exactly (speak → `audio.play()` +
  `playbackState='playing'`; pause → both; end → stop anchor + `'none'`). Drift =
  controls vanish or show the wrong button.
- **Don't trust OS auto-resume after a phone call** (AudioContext goes
  `interrupted`/`suspended`, doesn't reliably resume; speechSynthesis has no documented
  resume). Surface a manual "Resume" control on `statechange` / `visibilitychange`.

## Net shape for #54 (with device voice as the base — NOT cloud TTS)
The realistic, engine-agnostic deliverable is the **controls layer**, which works with
the device voice on both platforms:
(1) Keep the silent-`<audio>` anchor + Media Session handlers for lock-screen/BT-button
control; back it with `ensureSilentAudioLoop()` not the oscillator.
(2) Complete the Media Session wiring: `playbackState` on every transition,
`previoustrack`/`nexttrack` → existing chunk nav, anchor↔TTS state mirrored.
(3) Manual Resume after phone-call interruptions.
**Out of reach with device voice (document, don't paper over):** actual narration AUDIO
over Bluetooth/CarPlay on iOS — platform wall (limits 1+2 above). Cloud-TTS users happen
to get it; we do NOT make cloud TTS the in-car default to "solve" this. Suspending the mic
during narration (limit 2) only matters for the cloud-TTS users who do route to BT.
**Also out of reach:** the car SCREEN — needs a native wrapper.

Related: [[ios-web-audio-silent-mode]], [[narration-module-quirks]],
[[openai-tts-pipeline]], [[mic-narration-coupling]], [[ios-mic-chime-and-ptt-sounds]].
