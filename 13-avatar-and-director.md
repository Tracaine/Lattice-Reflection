# Avatar, audio clock, and director policy

ART-019. REQ-004/009–012/015/020. These are independent design choices informed by the recovered pipeline, not a reproduction of its private model or rig assets.

## Import and character customization

Baseline: self-contained VRM 1.0 through Three.js WebGL2 and three-vrm. VRM standardizes humanoid pose, expressions, gaze, and creator metadata; three-vrm supplies the runtime loader. [VRM features](https://vrm.dev/en/vrm/vrm_features/), [three-vrm](https://github.com/pixiv/three-vrm). Imported VRM 0.x, FBX, arbitrary GLB characters, and proprietary Unity bundles are not supported in the first importer; return a clear supported-format message.

An avatar package contains AvatarManifest, model.vrm, optional VRMA 1.0 clips, attribution/license metadata, and mapping data. Files are copied under a content hash, and all resource references must resolve inside that immutable package. A direct .vrm import generates the manifest. Package import accepts a directory chosen by the owner in v1; ZIP import is deferred to avoid making archive handling a hidden prerequisite.

Hard limits: 100 MiB model/package input, 200,000 triangles, 256 bones, 256 morph targets per mesh, 64 materials, texture dimension 4,096, and 256 MiB estimated decoded textures. Enforce file bounds before parse and mesh/texture bounds before GPU allocation. Reject external URLs, executable extensions/scripts, path traversal, invalid indices/nonfinite transforms, and missing required humanoid bones. Warnings begin at 100,000 triangles and 2,048-pixel textures. A warning does not authorize an automatic remote optimization/upload.

An import may lack mouth/blink/emotion expressions. Accept renderable avatars with a capability warning, offer an expression-mapping preview, and report unsupported capabilities. The five vowel presets map to actual imported expressions; never assume an arbitrary model has 52 ARKit channels. If no usable mouth target exists, play speech with neutral mouth and visibly report reduced lip-sync capability. Do not silently bind a random blendshape.

Customization in M0/M1 means changing the model, expression mapping, name/profile/voice, camera framing, and background/color. It does not mean automatically fitting arbitrary clothes or generating a mesh. Optional VRMA clips bind to named effects with body masks; preserve their author/license. VRMA carries portable humanoid/expression/gaze animation, with runtime retargeting still requiring validation. [VRM Animation](https://vrm.dev/en/vrma/), [three-vrm-animation](https://github.com/pixiv/three-vrm/tree/release/packages/three-vrm-animation).

VRMA playback is deferred to WRK-023. M0/M1 use procedural motion; an import may retain validated clip metadata, but cannot advertise clip playback as available until that package passes. Retained metadata never authorizes executing an unvalidated asset.

The original demo avatar is authored procedurally during implementation with a simple humanoid, explicit mouth/blink targets, and primitive phone prop. The fixture records its generated source/license; no Animates asset is required. Test a second differently proportioned avatar before claiming retargeting. A user-provided model may be used privately for validation without becoming a distributable fixture.

## Renderer and pose layers

One scene contains the active avatar, camera, neutral lighting, background, and allowed props. Default framing is waist-up with user-selectable full body. Normalize scale from humanoid height, use VRM's normalized humanoid transforms, and respect the importer's coordinate convention. Each tick starts from base pose, applies permitted body layers, solves gaze/constraints, updates expressions, then updates spring bones and renders. Never accumulate last-frame rotations as the next base pose.

A replacement avatar is prepared in a disposable scene. On successful validation, the coordinator commits selection and renderer atomically activates it in the current epoch. Failure disposes the candidate and retains the previous avatar. Character switching cancels old speech before preparation, so a long load cannot speak from a stale identity.

Baseline motion is authored procedural movement with fixed seeds per avatar/session: breathing and subtle head movement in idle; camera gaze and small head inclination while listening; a subdued thinking pose while waiting; low-amplitude torso/hand variation during speech. Seeded blinking varies between 2–6 seconds with 120–200 ms closure. Reduced motion removes body sway and optional activities, retaining essential mouth movement and a static gaze. Motion intensity is a saved 0–1 setting; default 0.35. This is an implementation baseline whose appeal requires review, not a claim of learned emotion/body motion.

## Playback clock and mouth timing

SpeechService converts completed text segments to canonical PCM. The renderer's AudioWorklet owns the source-sample consumption cursor. Use the actual output block length, not a hard-coded 128-frame assumption. Decode PCM to float, preserve fractional resampling phase across blocks, and support requested output rates 24,000, 44,100, and 48,000 Hz. Initial implementation uses continuous linear interpolation for those equal/upsampling ratios; reject other/downsampling paths until a tested resampler is supplied. Capture conversion may use a separate tested band-limited resampler before normalization.

Worklet reports rendered source samples and queue depth. Where supported, AudioContext.getOutputTimestamp/output latency estimate refines the presentation clock; otherwise mark clockQuality=rendered_samples. Never label this a measurement of exact physical speaker latency. Rendered audio content time freezes on underrun, while ordinary idle animation may continue. Volume zero continues the timeline; Stop flushes it. Cancellation applies a 10 ms gain fade and invalidates buffered frames immediately, subject to already-buffered device latency.

Mouth priority: validated provider/fixture cues first; amplitude fallback second. For fallback, compute RMS over 20 ms PCM windows, gate values below 0.015, map 0.015–0.15 to an aa weight of 0–0.7, and smooth with 40 ms attack / 80 ms release. Other vowel weights stay zero. These are tunable defaults, not phoneme recognition. Silence/underrun/cancel closes the mouth. Text-based estimated timings must be labelled estimated and are not treated as ground truth.

Viseme cues are evaluated against the played sample cursor, linearly blending across an 80 ms edge window. Clamp all weights to [0,1], limit total mouth weight to 1, and respect VRM expression override semantics. Emotion cannot overwrite the mouth while speech owns it. No sample is skipped to make an animation catch up. Long-term drift and device changes are tested independently from network latency.

Text segmentation emits a TTS segment at sentence-ending punctuation/newline once at least 30 UTF-16 units are available, or at the last whitespace before 240 units. After 700 ms with no complete boundary, flush at a whitespace if at least 30 units exist; on normal text end, flush the remainder. Parse Markdown to speakable plain text; omit code blocks/URLs, preserve a source span for each segment, and never rewrite persisted text. Only one TTS segment is generated at a time per utterance. Limit pending speakable text to 4,096 units/20 segments; exceeding it cancels further speech with a visible warning while text continues. A failed/cancelled response does not speak its unsent tail.

## Explicit arbitration

The director accepts normalized input/channel/playback events and computes a desired state. The renderer mixes that intent with speech timing, current capabilities, and local accessibility settings. Priority is per resource, not a single global “animation wins” flag.

| Resource | Highest to lowest ownership |
| --- | --- |
| All resources | Epoch reset, dispose, and safety stop invalidate old work immediately. |
| Mouth | Active speech cues/amplitude; otherwise expression mouth contribution; neutral fallback. |
| Torso/arms/legs | Manual activity (90); local listening/input (80); current remote reply phone/typing (70); accepted model activity (50); speech gestures (30); idle (0). |
| Head/gaze | Manual gaze setting; active listening camera gaze; supported phone gaze; default camera gaze. |
| Eyes/blink | Required expression override behavior; otherwise procedural blink and bounded gaze. |
| Prop | Active supported phone/typing activity owns the phone prop; no independent model attach/detach call. |

Manual dance may coexist with speech mouth animation while suppressing speaking body gestures. Local voice input preempts channel phone/typing; after it ends, only a still-valid channel intent may resume. Typing includes the phone pose/prop and wins over phone within the same channel request. One activity and one transient gesture are active at a time. Gesture requests yield if their body mask is owned by a higher-priority activity. Equal priority resolves by newest director revision, then stable intent ID; expiry is deterministic.

Transitions use 150 ms smoothstep crossfade by default; cancel closes mouth/flushes audio immediately and returns body over 150 ms. A missing activity clip uses its declared procedural fallback if the avatar supports the necessary bones/prop, otherwise returns unsupported. Do not convert unsupported into applied solely to acknowledge a request.

## Channel policy and model boundary

The chosen replacement policy is explicit: connected status changes only the channel indicator. An incoming remote message may create a 5 s phone intent; reply_processing selects typing until the turn ends, capped at 30 s with renewal while that specific turn remains active. reply_sent retains phone for 2 s, then clears it. peer_typing is a 3 s presence hint and never produces a reply by itself. Local input preempts these intents; old events older than their TTL are discarded. These rules are not established Animates server behavior.

Only activity for the currently displayed character can affect its director. A background character may complete a text-only channel reply, but cannot acquire the presentation slot, change the global epoch, start speech, or animate the foreground character. Selecting it later does not replay expired activity or completed speech. The coordinator filters by character/turn before publication; the renderer independently checks active character and epoch.

The optional director model receives a small observation: current turn state, latest bounded conversation text, allowed activities/expressions, active channel kind, and actual visual report. It may suggest only activity/emotion plus TTL (maximum 10 s). Validate the complete JSON result, tie it to the originating turn/epoch, and discard stale results. It cannot request raw poses, speech, provider changes, memory writes, tools, or repeated polling. One suggestion per turn maximum, two-second deadline; rules remain the fallback. Director speech is never synthesized.

Only actual VisualReport outcomes can update displayed “doing” state. Diary generation must not interpret an attempted dance or phone request as a real-world completed action. The director/memory model boundary is the same InferenceGateway used for dialogue, with independent role bindings.

## Scene and quality limits

Start with one avatar, no expensive postprocessing, one key/fill lighting setup, optional inexpensive shadow, and device pixel ratio capped at 1.5. Target 30 fps; offer a 60 fps preference only after the measured budget passes. Disable secondary physics/shadows before reducing render resolution. Keep chat responsive if WebGL context is lost; reinitialize the avatar in a new epoch without replaying speech.

Neural speech-to-body motion, audio-only phoneme classifiers, full 52-channel facial generation, native Unity rendering, and direct video streaming are replaceable later modules. The draft deliberately retains the sample clock, rig abstraction, capability reports, and effect ownership needed to add them without changing provider adapters.
