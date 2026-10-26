# End-to-end encryption and calls

Status: design, agreed with the product owner on 2026-10-25.

Decisions:

- **Protocol:** Signal-style. X3DH to start a session between two devices, then the Double Ratchet for
  every message, so a stolen key cannot decrypt past messages (forward secrecy) and the session heals
  after a compromise (post-compromise security).
- **Existing chats:** kept as they are and marked unencrypted. A service notice marks where encryption
  starts in each chat.
- **New devices:** an encrypted backup unlocked by a recovery key that only the user holds restores
  history on a new device.
- **Calls:** one-to-one voice and video over WebRTC, on web and Android first.

## Building blocks

All crypto lives in a new workspace package, `packages/crypto`, written in TypeScript on top of the
audited `@noble/curves`, `@noble/ciphers` and `@noble/hashes`. The same code runs in Node (tests),
browsers and React Native (Hermes). Randomness comes from `crypto.getRandomValues` (expo-crypto
provides it on mobile).

| Purpose | Primitive |
| --- | --- |
| Identity signatures | Ed25519 |
| Key agreement | X25519 |
| Key derivation | HKDF-SHA-256 |
| Message encryption | XChaCha20-Poly1305 (AEAD) |
| Media encryption | XChaCha20-Poly1305 in fixed-size chunks |

No crypto is hand-rolled below this level; the protocol code composes these primitives exactly as the
Signal X3DH and Double Ratchet specifications describe. **The package needs an external security
review before real users rely on it.**

## Devices and keys

Every signed-in session is a *device*. On first launch a device generates:

- an identity key pair (Ed25519 for signing, X25519 for agreement), which never leaves the device;
- a signed prekey (X25519, signed by the identity key), rotated about weekly;
- a batch of 100 one-time prekeys (X25519), replenished when fewer than 20 remain.

The device uploads the public halves as its *key bundle*. Private keys are stored with
expo-secure-store on mobile and in IndexedDB (non-extractable where possible) on web.

## Sending a message

1. The sender fetches the device lists of the recipient **and of themselves** (their other devices).
2. For each device without a session, it claims one key bundle (the server hands out each one-time
   prekey only once) and runs X3DH.
3. The message content (text, entities, spoiler flag, attachment key and metadata, quoted message
   preview) is serialised and encrypted once per device with that device's Double Ratchet. Each result
   is an *envelope*.
4. One more envelope is encrypted to the sender's backup key (see below).
5. The sender posts all envelopes in one request. The server stores them and gives each device only
   its own envelope.

What the server still sees: who talks to whom and when, message type and size, reactions, read and
delivery receipts, and timer settings (auto-delete, self-destruct rules). Those stay readable so the
server can enforce them. Text, captions, formatting, file contents, file names and quoted text do not.

## Media

The sending device picks a random 32-byte file key, encrypts the file in 64 KB chunks with
XChaCha20-Poly1305, and uploads only the ciphertext. The file key, original name, type, dimensions,
duration, waveform and a small thumbnail travel inside the encrypted message. Thumbnails, waveforms,
video-note cropping and transcoding move from the API worker to the sending device; the worker
only stores encrypted files.

## Backup and new devices

At setup each user creates a **recovery key**: 32 random bytes shown once as 24 words (or saved to a
password manager). From it the app derives the backup key with HKDF. Every message carries one
envelope sealed to the backup key, alongside the per-device ones. A new device that enters the
recovery key decrypts those envelopes and restores history. The server never sees the recovery key
or the backup key. Losing the recovery key and every device means losing history; this is stated
plainly in the setup screen.

## Trust

Each chat gets a **safety number** computed from both people's identity keys, shown in the contact
screen with a QR code to compare in person. When a contact's identity key changes (new device, or a
reinstall without recovery), the chat shows a notice before the next message is sent.

## Existing data

Messages sent before encryption is turned on keep `encrypted: false` and render as today. Once both
people have a key bundle, new messages in that chat are always encrypted, and a service message
"Messages are now end-to-end encrypted" marks the change. Plaintext sending is refused for that chat
from then on.

## What changes elsewhere

- **Push notifications:** the server cannot see text, so pushes say "New message" (web can decrypt
  in the service worker later; Android needs the Firebase setup first).
- **Edits:** the edit is a new encrypted payload referencing the original message.
- **Scheduled messages:** encrypted when scheduled, for the devices known at that moment.
- **Search, link previews, content moderation and admin views:** cannot read encrypted content.
- **Self-destructing messages:** the server deletes the envelopes when the rules say so; it can no
  longer withhold text it cannot read, so "view once" is enforced by the clients.

## Calls

One-to-one voice and video with WebRTC: `react-native-webrtc` on Android, the browser API on web.
Media is encrypted by DTLS-SRTP between the two devices. The signalling (offer, answer, ICE
candidates) is sent as encrypted envelopes through the same Double Ratchet sessions, so the server
cannot insert itself into a call. A TURN relay (coturn, added to docker compose) handles networks
where a direct connection fails. Ringing works while the app is open; ringing a closed Android app
needs Firebase push.

## Phases

1. `packages/crypto`: keys, X3DH, Double Ratchet, envelopes, media encryption, backup, safety
   numbers, with a full test suite.
2. API: device key bundles, envelope storage and delivery, encrypted uploads.
3. Mobile and web: key setup and recovery key, sending and receiving encrypted text, then media.
4. Calls: signalling, TURN, call screens on web and Android.
5. External review of `packages/crypto` before relying on it.
