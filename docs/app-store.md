# App Store release kit

Images are in `apps/mobile/store-listing/app-store/`.

| App Store Connect field | File | Spec |
| --- | --- | --- |
| App icon | `icon-1024.png` | 1024 x 1024 PNG, no transparency (the build carries it too) |
| iPhone with Dynamic Island (6.1" / 6.3") | `screenshots/iphone-6.3/01..06` | 1206 x 2622, captioned |
| iPhone 6.9", if App Store Connect asks for it | `screenshots/iphone-6.9/01..06` | 1320 x 2868, captioned |
| iPad 13" | `screenshots/ipad-13/01..06` | 2064 x 2752, the phone screen framed on an iPad-sized page |
| Header ("En-tête"), optional | `header/header-5244x2950.png` or `header/header-3840x1646.png` | No text: the store puts the name, icon and Get button over it |

App Store Connect checks the exact pixel size per tab, so each tab takes only its own folder. The screenshots use the
same invented chats as the Play ones, rendered from the web app's design. Compare them with the iOS app before
publishing: Apple expects screenshots to show the app as it is.

**iPad:** `supportsTablet: true` in `app.config.ts` makes it an iPad app too, which needs 13" iPad screenshots
(2064 x 2752) taken from the app running on an iPad, and an iPad layout that holds up in review. For a first release,
setting `supportsTablet: false` avoids both: iPads still run it, at iPhone size.

## Fix before submitting

1. **Sign in with Apple in the iOS app.** Guideline 4.8: an app that signs in with Google must also offer Sign in with
   Apple. Done: the iOS app shows Apple's own button (`expo-apple-authentication`), swaps Apple's token for a Firebase
   one and sends it to `/v1/auth/firebase`. The build needs `EXPO_PUBLIC_FIREBASE_API_KEY` in `apps/mobile/.env`.
2. **Notifications on iPhone.** The app registers its push token as `apns`, but the server has no APNs sender, so
   iPhones get no notifications. It needs an APNs key (Keys, "Apple Push Notifications service"), the Push
   Notifications capability, and an APNs provider next to FCM in `apps/api/src/push/providers.ts`.
3. **A review account.** Apple has to get past sign-in and the invite. A Google account signing in from Apple's
   network often hits Google's "verify it's you" step, which gets apps rejected. Prefer a Sign in with Apple
   reviewer: give Apple an invite link, or let one reviewer email through without an invite.
4. **Anonymous messages.** Guideline 1.2 asks apps with user content to filter it, let people report and block, act
   on reports within 24 hours, and publish contact details. Report, block and admin moderation are there. Say so in the
   review notes, as anonymous message apps get a closer look.
5. **Privacy manifest.** Upload the build and read Apple's email: it lists any API that needs a declared reason.
   Expo adds the manifests for its own modules. Add anything missing under `ios.privacyManifests` in `app.config.ts`.

## App information

- **Name:** Six Frites: Chat, Call & Play
- **Subtitle:** Invite-only chats and games (French: Discussions et jeux entre amis)
- **Bundle ID:** com.sixfrites.app
- **SKU:** six-frites
- **Primary category:** Social Networking
- **Secondary category:** Games, only if the games are meant to be found in search; otherwise leave it empty
- **Support URL:** https://six-frites.koera.mg/support
- **Marketing URL:** https://six-frites.koera.mg
- **Privacy policy URL:** https://six-frites.koera.mg/privacy
- **Account deletion:** in Settings, and at https://six-frites.koera.mg/delete-account
- **Copyright:** 2026, then your name or company
- **Price:** Free
- **Languages:** English and French. App Store Connect has no Malagasy.

### English

**Promotional text** (170 characters, can change any time without review)

Chats, calls, stories and live games with your friends, invite-only. Now with notes you can pin a place to.

**Keywords** (99 of 100 characters; words in the name are already searchable)

messenger,friends,family,encrypted,video call,stories,games,anonymous,ludo,group,private,madagascar

**Description**

Six Frites is a messaging app for the people who matter: your friends, your family, your crew. It is invite-only, so
it stays among people who know each other.

CHAT YOUR WAY
• One-to-one chats with end-to-end encryption
• Voice and video calls
• Photos, videos, voice notes, files, your location, checklists, stickers and GIFs
• Group chats that people join by link
• Reactions, replies and a background for each chat

STAY PRIVATE
• Each person sees you under a different colour code with a food picture, until you choose to show your real name and
  photo
• Messages that vanish, delete themselves after a while, or go out later
• Optional app lock with Face ID
• Encrypted backups that only you can open

STORIES AND NOTES
• Share photos, videos and text in stories for your contacts
• Leave a short note above your picture, with a GIF or a place

PLAY TOGETHER
• Live games with friends, right from a chat: Ludo, Fanorona, Crazy Eights, dots and boxes, memory, word hunt and more
• No one around? Play with Six Frites Game, any time

ANONYMOUS MESSAGES
• Share your own link and let anyone send you a message without saying who they are
• Share the best ones to your story
• Block or report anything you don't want to see

No ads. Available in English, French and Malagasy. Designed and built in Madagascar.

You must be at least 13 to use Six Frites. Chatting needs an invite from someone already on it; anonymous messages
don't.

**What's new** (first release: leave empty)

### Français

**Texte promotionnel**

Discussions, appels, stories et jeux en direct avec vos amis, sur invitation. Et maintenant, des notes avec un lieu.

**Mots-clés** (99 caractères)

messagerie,amis,famille,chiffré,appel vidéo,stories,jeux,anonyme,ludo,groupe,privé,madagascar,tchat

**Description**

Six Frites est une messagerie pour les gens qui comptent : vos amis, votre famille, votre bande. L'application
fonctionne sur invitation, pour rester entre personnes qui se connaissent.

DISCUTEZ À VOTRE FAÇON
• Discussions à deux, chiffrées de bout en bout
• Appels vocaux et vidéo
• Photos, vidéos, messages vocaux, fichiers, position, listes, stickers et GIF
• Groupes que l'on rejoint par un lien
• Réactions, réponses et un fond pour chaque discussion

GARDEZ VOTRE VIE PRIVÉE
• Chaque personne vous voit sous un code couleur différent, avec une image de nourriture, jusqu'à ce que vous
  choisissiez de montrer votre vrai nom et votre photo
• Des messages qui disparaissent, se suppriment après un certain temps ou partent plus tard
• Verrouillage de l'application avec Face ID en option
• Des sauvegardes chiffrées que vous seul pouvez ouvrir

STORIES ET NOTES
• Partagez des photos, des vidéos et du texte en story avec vos contacts
• Laissez une courte note au-dessus de votre image, avec un GIF ou un lieu

JOUEZ ENSEMBLE
• Des jeux en direct avec vos amis, depuis une discussion : Ludo, Fanorona, Huit américain, pipopipette, memory,
  chasse aux mots et plus encore
• Personne de disponible ? Jouez avec Six Frites Game, quand vous voulez

MESSAGES ANONYMES
• Partagez votre lien et n'importe qui peut vous écrire sans dire qui il est
• Partagez les meilleurs dans votre story
• Bloquez ou signalez ce que vous ne voulez pas voir

Aucune publicité. Disponible en français, en anglais et en malgache. Conçue et développée à Madagascar.

Vous devez avoir au moins 13 ans pour utiliser Six Frites. Discuter nécessite une invitation d'une personne déjà
inscrite ; les messages anonymes, non.

## Age rating

Answer the questionnaire as the app is: user-generated content and messaging yes, unrestricted web access no, no
gambling, no contests. Apple works out the rating; with chats between users and anonymous messages, expect 13+ or
higher. Don't choose the Kids category.

## App Privacy

Tracking: **No**. Nothing is shared with data brokers or used for ads.

Everything below is **linked to the user** and used for **App Functionality** only.

| Apple data type | Collected | Notes |
| --- | --- | --- |
| Contact Info: Name | Yes | From the Google or Apple account |
| Contact Info: Email Address | Yes | From the Google or Apple account |
| User Content: Photos or Videos | Yes | Profile photo, stories, anonymous messages, unencrypted chats |
| User Content: Audio Data | Yes | Voice notes in anonymous messages and unencrypted chats |
| User Content: Emails or Text Messages | Yes | Anonymous messages and unencrypted chats; encrypted chats are unreadable to us |
| User Content: Other User Content | Yes | Notes, stories, checklists, files |
| Location: Precise Location | Yes | Only when the user sends or posts it |
| Identifiers: User ID | Yes | Account |
| Identifiers: Device ID | Yes | The app's own device ID, used for bans and devices |
| Usage Data: Product Interaction | Yes | Receipts, last online, message activity |

Not collected: Health, Financial, Contacts (the phone's address book), Browsing or Search History, Purchases,
Diagnostics, Sensitive Info.

Check the GIF search: queries go to GIPHY and KLIPY. Apple counts what third parties receive through the app.

## Export compliance

The app uses encryption: HTTPS, and end-to-end encryption of chats with standard algorithms (no custom cipher). In
App Store Connect, answer that it uses encryption, with standard algorithms, and is exempt as a mass-market app. To
skip the question on every build, add this to `app.config.ts` once confirmed:

```ts
ios: { infoPlist: { ITSAppUsesNonExemptEncryption: false } }
```

If the app is sold in France, Apple may ask for the French encryption declaration (ANSSI). Check at submission.

## Notes for the reviewer

> Six Frites is an invite-only messenger. Sign in with the account below, which has already joined and has chats,
> contacts and a group, so every feature can be tried.
>
> Chats: open any chat to send messages, photos, voice notes and GIFs, or start a voice or video call.
> Games: in a chat, tap the paperclip, then Game, to start a live game; "Six Frites Game" plays against the app.
> Anonymous messages: the mask tab shows your link. Anyone can write to it without signing in. Every message can be
> blocked or reported, reports reach our moderators, who act within 24 hours, and repeat abusers are banned.
> Account deletion: Settings, then Delete account.
>
> Contact: (your email and phone)

Fill in the account and contact. Apple calls the phone number if review gets stuck.

## Build and upload

1. Set `ios.buildNumber` in `app.config.ts`, starting at "1". Raise it on every upload; `version` stays 1.5.1 until the
   next release.
2. `npx eas-cli@latest build -p ios --profile production`, or archive in Xcode from `apps/mobile/ios` after
   `npx expo prebuild -p ios`.
3. `npx eas-cli@latest submit -p ios`, or upload the archive from Xcode's Organizer.
4. Test it through TestFlight before sending it for review.
