# Google Play release kit

Images are in `apps/mobile/store-listing/`.

| Play Console field | File | Spec |
| --- | --- | --- |
| App icon | `icon-512.png` | 512 x 512, 32-bit PNG |
| Feature graphic | `feature-graphic.png` | 1024 x 500, 24-bit PNG |
| Phone screenshots | `screenshots/phone/01..06` | 1080 x 1920, captioned |
| Same screens, no caption or frame | `screenshots/plain/01..06` | 1236 x 2472 |

All names, chats and photos in the screenshots are invented.

## Build

`npm run build:android:play -w apps/mobile` writes `apps/mobile/dist/six-frites-<version>.aab`, signed with our
`six-frites` key as the upload key. Compared with the Koera Store build it has no new-version banner, no gallery
permissions, and registers for push as `fcmPlay`, so the new-version push skips it. Deploy the API before releasing a
Play build: an older API refuses `fcmPlay`, and that phone would get no notifications.

Play has never seen this app, so `versionCode` 8 is fine for the first upload. Each later upload needs a higher one.

## Fix before submitting

1. **Child safety standards.** Play requires social and messaging apps to publish child sexual abuse and exploitation
   standards, and name a contact. The Terms ban sexual content involving minors, but a dedicated page is still needed.
2. **Signing.** Decide this at setup, as it can't be changed freely later: a build signed by Play is a different
   signature from the Koera Store APK, so people can't update from one store's build to the other.
3. **Screenshots come from the web app.** Android has the same design but is built separately. Compare them with the
   real app before publishing, as Play expects screenshots to show the actual app.

Also check in the Console: new personal developer accounts must run a closed test with at least 12 testers for 14 days
before production.

## Store listing

- **App name:** Six Frites: Chat, Call & Play
- **Category:** Communication
- **Website:** https://six-frites.koera.mg
- **Privacy policy:** https://six-frites.koera.mg/privacy
- **Contact email:** to fill in; Play shows it publicly
- **Malagasy:** as far as I know Play has no Malagasy listing language; English and French cover it

### English

**Short description**

Invite-only chats, calls, stories, live games and anonymous messages.

**Full description**

Six Frites is a messaging app for the people who matter: your friends, your family, your crew. It is invite-only, so it stays among people who know each other.

CHAT YOUR WAY
• One-to-one chats with end-to-end encryption
• Voice and video calls
• Photos, videos, voice notes, files, your location, checklists, stickers and GIFs
• Group chats that people join by link
• Reactions, replies and a background for each chat

STAY PRIVATE
• Each person sees you under a different colour code with a food picture, until you choose to show your real name and photo
• Messages that vanish, delete themselves after a while, or go out later
• Optional app lock
• Encrypted backups that only you can open

STORIES AND NOTES
• Share photos, videos and text in stories for your contacts
• Leave a short note above your picture

PLAY TOGETHER
• Live games with friends, right from a chat: Ludo, Fanorona, Crazy Eights, dots and boxes, memory, word hunt and more
• No one around? Play with Six Frites Game, any time

ANONYMOUS MESSAGES
• Share your own link and let anyone send you a message without saying who they are
• Share the best ones to your story
• Block or report anything you don't want to see

No ads in the Android app. Available in English, French and Malagasy. Designed and built in Madagascar.

You must be at least 13 to use Six Frites. Chatting needs an invite from someone already on it; anonymous messages don't.

### Français

**Description courte**

Discussions sur invitation, appels, stories, jeux et messages anonymes.

**Description complète**

Six Frites est une messagerie pour les gens qui comptent : vos amis, votre famille, votre bande. L'application fonctionne sur invitation, pour rester entre personnes qui se connaissent.

DISCUTEZ À VOTRE FAÇON
• Discussions à deux, chiffrées de bout en bout
• Appels vocaux et vidéo
• Photos, vidéos, messages vocaux, fichiers, position, listes, stickers et GIF
• Groupes que l'on rejoint par un lien
• Réactions, réponses et un fond pour chaque discussion

GARDEZ VOTRE VIE PRIVÉE
• Chaque personne vous voit sous un code couleur différent, avec une image de nourriture, jusqu'à ce que vous choisissiez de montrer votre vrai nom et votre photo
• Des messages qui disparaissent, se suppriment après un certain temps ou partent plus tard
• Verrouillage de l'application en option
• Des sauvegardes chiffrées que vous seul pouvez ouvrir

STORIES ET NOTES
• Partagez des photos, des vidéos et du texte en story avec vos contacts
• Laissez une courte note au-dessus de votre image

JOUEZ ENSEMBLE
• Des jeux en direct avec vos amis, depuis une discussion : Ludo, Fanorona, Huit américain, pipopipette, memory, chasse aux mots et plus encore
• Personne de disponible ? Jouez avec Six Frites Game, quand vous voulez

MESSAGES ANONYMES
• Partagez votre lien et n'importe qui peut vous écrire sans dire qui il est
• Partagez les meilleurs dans votre story
• Bloquez ou signalez ce que vous ne voulez pas voir

Aucune publicité dans l'application Android. Disponible en français, en anglais et en malgache. Conçue et développée à Madagascar.

Vous devez avoir au moins 13 ans pour utiliser Six Frites. Discuter nécessite une invitation d'une personne déjà inscrite ; les messages anonymes, non.

## App content answers

These are drafted from the Privacy Policy and Terms. Check them against what the app does when you fill them in.

**Ads:** No, the Android app has none.

**App access:** Restricted. Sign-in is Google-only and chats are invite-only, so give the reviewer a dedicated Google
account without two-step verification that has already joined, with instructions.

**Target audience:** 13 and over. Don't mark it as appealing to children.

**Content rating questionnaire:** Communication app. Answer yes to users interacting, user-generated content and
sharing location.

**Account deletion:** Yes, in Settings and at https://six-frites.koera.mg/delete-account. Say that anonymous messages
and sign-in records are kept after deletion, as the Privacy Policy does.

**Foreground service:** declare `FOREGROUND_SERVICE_MEDIA_PLAYBACK` and describe what plays in the background.

**Location:** foreground only, sent when the user chooses to.

### Data safety

Encrypted in transit: yes. Users can request deletion: yes. Data sold: no.

| Data | Collected | Why | Optional |
| --- | --- | --- | --- |
| Name | Yes | Account | No |
| Email address | Yes | Account | No |
| User IDs | Yes | Account | No |
| Photos | Yes | Profile photo, anonymous messages, unencrypted chats | Yes |
| Videos | Yes | Unencrypted chats | Yes |
| Voice or sound recordings | Yes | Anonymous messages, unencrypted chats | Yes |
| Files | Yes | Unencrypted chats | Yes |
| In-app messages | Yes | Anonymous messages, unencrypted chats | Yes |
| Approximate and precise location | Yes | Sent only when the user chooses | Yes |
| Contacts within the app | Yes | People you talk to | No |
| App interactions | Yes | Message activity, receipts, last online | No |
| Device or other IDs | Yes | Device ID, notification token, bans | No |

Google is a service provider here (sign-in, notifications), which Play doesn't count as sharing. Confirm whether GIF
searches sent to GIPHY and KLIPY need declaring.
