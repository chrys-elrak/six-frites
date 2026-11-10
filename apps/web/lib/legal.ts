import type { Locale } from "@six/shared";

/** A page of plain text: each section's body holds paragraphs, and lists as arrays of items. */
export interface LegalDoc {
  title: string;
  updated?: string;
  intro: string;
  sections: { heading: string; body: (string | string[])[] }[];
}

export const about: Record<Locale, LegalDoc> = {
  en: {
    title: "About Six Frites",
    intro: "Six Frites is a messaging app for the people who matter: your friends, your family, your crew.",
    sections: [
      {
        heading: "What you can do",
        body: [
          [
            "Chat one to one, with end-to-end encryption.",
            "Call by voice or video.",
            "Send photos, videos, voice notes, files, your location, checklists, stickers and GIFs.",
            "Play games together: Ludo, Fanorona, Crazy Eights, dots and boxes, memory, word hunt and more.",
            "Make messages vanish, delete themselves after a while, or go out later.",
            "Get anonymous messages through your own link, and share them to your story.",
          ],
          "Six Frites works in English, French and Malagasy, on the web and on Android.",
        ],
      },
      {
        heading: "Invite only",
        body: [
          "To keep Six Frites among people who know each other, you join with an invite from someone already on it. No invite yet? Ask a friend, or write to our support. Anonymous messages don't need an invite.",
        ],
      },
      {
        heading: "Made in Madagascar",
        body: ["Six Frites is designed and built in Madagascar."],
      },
      {
        heading: "Credits",
        body: ["The message, anonymous message and call sounds come from Pixabay (pixabay.com)."],
      },
      {
        heading: "Contact",
        body: ["Questions, ideas or problems? Chat with our support from the app or at six-frites.koera.mg/support."],
      },
    ],
  },
  fr: {
    title: "À propos de Six Frites",
    intro: "Six Frites est une messagerie pour les gens qui comptent : vos amis, votre famille, votre bande.",
    sections: [
      {
        heading: "Ce que vous pouvez faire",
        body: [
          [
            "Discuter à deux, avec un chiffrement de bout en bout.",
            "Appeler en audio ou en vidéo.",
            "Envoyer photos, vidéos, messages vocaux, fichiers, votre position, listes, stickers et GIF.",
            "Jouer ensemble : Ludo, Fanorona, Huit américain, pipopipette, memory, chasse aux mots et plus.",
            "Faire disparaître des messages, les supprimer automatiquement après un temps, ou les programmer.",
            "Recevoir des messages anonymes grâce à votre propre lien, et les partager en story.",
          ],
          "Six Frites existe en anglais, en français et en malgache, sur le web et sur Android.",
        ],
      },
      {
        heading: "Sur invitation",
        body: [
          "Pour garder Six Frites entre personnes qui se connaissent, on y entre avec l'invitation de quelqu'un qui y est déjà. Pas encore d'invitation ? Demandez à un ami, ou écrivez à notre assistance. Les messages anonymes ne demandent pas d'invitation.",
        ],
      },
      {
        heading: "Fait à Madagascar",
        body: ["Six Frites est conçu et développé à Madagascar."],
      },
      {
        heading: "Crédits",
        body: ["Les sons des messages, des messages anonymes et des appels viennent de Pixabay (pixabay.com)."],
      },
      {
        heading: "Contact",
        body: [
          "Une question, une idée ou un problème ? Écrivez à notre assistance depuis l'application ou sur six-frites.koera.mg/support.",
        ],
      },
    ],
  },
  mg: {
    title: "Momba ny Six Frites",
    intro: "Six Frites dia fifandefasana hafatra ho an'ireo olona manan-danja aminao: ny namanao, ny fianakavianao, ny ekipanao.",
    sections: [
      {
        heading: "Izay azonao atao",
        body: [
          [
            "Miresaka mianaka, miaro tanteraka (chiffrement de bout en bout).",
            "Miantso amin'ny feo na amin'ny video.",
            "Mandefa sary, video, hafatra am-peo, rakitra, ny toerana misy anao, lisitra, sticker ary GIF.",
            "Milalao miaraka: Ludo, Fanorona, Huit, teboka, fahatsiarovana, fikarohana teny sy ny maro hafa.",
            "Mampanjavona hafatra, mamafa azy ho azy rehefa afaka fotoana, na mandefa azy any aoriana.",
            "Mahazo hafatra tsy fantatra mpandefa amin'ny rohinao manokana, ary mizara azy ao amin'ny story.",
          ],
          "Misy amin'ny teny anglisy, frantsay ary malagasy ny Six Frites, amin'ny web sy amin'ny Android.",
        ],
      },
      {
        heading: "Amin'ny fanasana ihany",
        body: [
          "Mba hijanonan'ny Six Frites ho eo amin'ny olona mifankahalala, miditra amin'ny fanasan'olona efa ao ianao. Mbola tsy manana fanasana? Angataho amin'ny namanao, na manorata amin'ny fanampiana. Tsy mila fanasana ny hafatra tsy fantatra mpandefa.",
        ],
      },
      {
        heading: "Vita teto Madagasikara",
        body: ["Noforonina sy namboarina teto Madagasikara ny Six Frites."],
      },
      {
        heading: "Fankasitrahana",
        body: ["Avy amin'ny Pixabay (pixabay.com) ny feon'ny hafatra, ny hafatra miafina ary ny antso."],
      },
      {
        heading: "Fifandraisana",
        body: [
          "Misy fanontaniana, hevitra na olana? Resaho amin'ny fanampiana ao amin'ny fampiharana na ao amin'ny six-frites.koera.mg/support.",
        ],
      },
    ],
  },
};

export const terms: Record<Locale, LegalDoc> = {
  en: {
    title: "Terms of Service",
    updated: "Last updated: 1 November 2026",
    intro:
      "These terms are the rules for using Six Frites, on the web and in the Android app. By using Six Frites you agree to them. If you don't agree, please don't use it.",
    sections: [
      {
        heading: "Who can use Six Frites",
        body: [
          "You must be at least 13, or older if the law where you live requires it, and sign in with your own Google account. Chatting needs an invite; anonymous messages don't.",
          "One account is for one person. Keep your devices and your recovery key safe: you are responsible for what happens on your account.",
        ],
      },
      {
        heading: "Your content",
        body: [
          "What you send stays yours. You let us store, copy and deliver it only as needed to run Six Frites for you and the people you send it to.",
          "You are responsible for what you send. Only send things you have the right to share.",
        ],
      },
      {
        heading: "What's not allowed",
        body: [
          [
            "Anything illegal, or helping someone do something illegal.",
            "Harassment, bullying, threats, or hate against people for who they are.",
            "Sexual content involving minors. We report it to the authorities.",
            "Sharing intimate photos or videos of someone without their consent.",
            "Spam, scams, phishing, or malware.",
            "Pretending to be someone else, or sharing someone's private details without their consent.",
            "Attacking, overloading or scraping Six Frites, or getting around a ban or a block.",
          ],
        ],
      },
      {
        heading: "Anonymous messages",
        body: [
          "The person you write to never learns who you are. We do keep who sent each anonymous message, so we can stop abuse, and we may share it when the law requires us to.",
          "If the person you write to blocks you, you'll see that you can't write to them anymore; they still never learn who you are.",
          "Messages you receive can be shared by you, for example to your story. Messages you send can be shared by the person who gets them.",
        ],
      },
      {
        heading: "Safety and moderation",
        body: [
          "You can block anyone and report messages or people. Our moderators review reports and may remove content, limit an account or close it when these terms are broken.",
          "Moderators can ban someone from the whole app, or from chats only, leaving them their anonymous messages. A full ban, or a block on anonymous messages, also covers other accounts used on the same phone or browser.",
          "We can't read end-to-end encrypted messages. When you report one, a copy of it and a few messages around it, as you see them, goes to our moderators.",
        ],
      },
      {
        heading: "Ads",
        body: ["The website may show ads from Google. The Android app has none."],
      },
      {
        heading: "The service",
        body: [
          "We work to keep Six Frites running and safe, but we provide it as it is, and it can be interrupted. We may change, add or remove features.",
          "Your encrypted messages can only be restored with your recovery key. If you lose it and every device you are signed in on, we can't get your messages back.",
        ],
      },
      {
        heading: "Responsibility",
        body: [
          "As far as the law allows, we are not responsible for what other people send you, for lost messages, or for indirect losses from using Six Frites. Nothing here removes rights the law gives you.",
        ],
      },
      {
        heading: "Ending",
        body: [
          "You can delete your account at any time in Settings. We may suspend or close an account that breaks these terms or puts others at risk.",
        ],
      },
      {
        heading: "Changes",
        body: [
          "We may update these terms. The date at the top shows the latest version, and we'll tell you in the app about important changes. Using Six Frites after a change means you accept it.",
        ],
      },
      {
        heading: "Contact",
        body: ["Questions about these terms? Chat with our support at six-frites.koera.mg/support."],
      },
    ],
  },
  fr: {
    title: "Conditions d'utilisation",
    updated: "Dernière mise à jour : 1er novembre 2026",
    intro:
      "Ces conditions sont les règles d'utilisation de Six Frites, sur le web et dans l'application Android. En utilisant Six Frites, vous les acceptez. Si vous n'êtes pas d'accord, merci de ne pas l'utiliser.",
    sections: [
      {
        heading: "Qui peut utiliser Six Frites",
        body: [
          "Vous devez avoir au moins 13 ans, ou plus si la loi de votre pays l'exige, et vous connecter avec votre propre compte Google. Discuter demande une invitation ; les messages anonymes, non.",
          "Un compte correspond à une personne. Protégez vos appareils et votre clé de récupération : vous êtes responsable de ce qui se passe sur votre compte.",
        ],
      },
      {
        heading: "Vos contenus",
        body: [
          "Ce que vous envoyez reste à vous. Vous nous autorisez seulement à le stocker, le copier et le transmettre dans la mesure nécessaire pour faire fonctionner Six Frites pour vous et vos destinataires.",
          "Vous êtes responsable de ce que vous envoyez. N'envoyez que ce que vous avez le droit de partager.",
        ],
      },
      {
        heading: "Ce qui est interdit",
        body: [
          [
            "Tout ce qui est illégal, ou aider quelqu'un à faire quelque chose d'illégal.",
            "Le harcèlement, les menaces, ou la haine envers des personnes pour ce qu'elles sont.",
            "Tout contenu sexuel impliquant des mineurs. Nous le signalons aux autorités.",
            "Partager des photos ou vidéos intimes de quelqu'un sans son accord.",
            "Le spam, les arnaques, l'hameçonnage ou les logiciels malveillants.",
            "Se faire passer pour quelqu'un d'autre, ou diffuser les informations privées de quelqu'un sans son accord.",
            "Attaquer, surcharger ou aspirer Six Frites, ou contourner un bannissement ou un blocage.",
          ],
        ],
      },
      {
        heading: "Messages anonymes",
        body: [
          "La personne à qui vous écrivez ne sait jamais qui vous êtes. Nous gardons en revanche l'auteur de chaque message anonyme, pour pouvoir arrêter les abus, et nous pouvons le communiquer quand la loi nous y oblige.",
          "Si la personne à qui vous écrivez vous bloque, vous verrez que vous ne pouvez plus lui écrire ; elle ne sait toujours pas qui vous êtes.",
          "Vous pouvez partager les messages que vous recevez, par exemple en story. Ceux que vous envoyez peuvent être partagés par leur destinataire.",
        ],
      },
      {
        heading: "Sécurité et modération",
        body: [
          "Vous pouvez bloquer n'importe qui et signaler des messages ou des personnes. Nos modérateurs examinent les signalements et peuvent retirer un contenu, limiter un compte ou le fermer quand ces conditions ne sont pas respectées.",
          "Les modérateurs peuvent bannir quelqu'un de toute l'application, ou seulement des discussions en lui laissant ses messages anonymes. Un bannissement complet, ou un blocage des messages anonymes, s'applique aussi aux autres comptes utilisés sur le même téléphone ou navigateur.",
          "Nous ne pouvons pas lire les messages chiffrés de bout en bout. Quand vous en signalez un, une copie de ce message et de quelques messages autour, tels que vous les voyez, est transmise à nos modérateurs.",
        ],
      },
      {
        heading: "Publicité",
        body: ["Le site web peut afficher des publicités de Google. L'application Android n'en a pas."],
      },
      {
        heading: "Le service",
        body: [
          "Nous faisons en sorte que Six Frites fonctionne et reste sûr, mais nous le fournissons tel quel, et il peut être interrompu. Nous pouvons modifier, ajouter ou retirer des fonctionnalités.",
          "Vos messages chiffrés ne peuvent être restaurés qu'avec votre clé de récupération. Si vous la perdez ainsi que tous vos appareils connectés, nous ne pouvons pas récupérer vos messages.",
        ],
      },
      {
        heading: "Responsabilité",
        body: [
          "Dans les limites permises par la loi, nous ne sommes pas responsables de ce que d'autres personnes vous envoient, des messages perdus, ni des pertes indirectes liées à l'utilisation de Six Frites. Rien ici ne retire les droits que la loi vous accorde.",
        ],
      },
      {
        heading: "Fin",
        body: [
          "Vous pouvez supprimer votre compte à tout moment dans les Réglages. Nous pouvons suspendre ou fermer un compte qui enfreint ces conditions ou met d'autres personnes en danger.",
        ],
      },
      {
        heading: "Modifications",
        body: [
          "Nous pouvons mettre à jour ces conditions. La date en haut indique la dernière version, et nous vous prévenons dans l'application des changements importants. Continuer à utiliser Six Frites après un changement vaut acceptation.",
        ],
      },
      {
        heading: "Contact",
        body: ["Une question sur ces conditions ? Écrivez à notre assistance sur six-frites.koera.mg/support."],
      },
    ],
  },
  mg: {
    title: "Fepetra fampiasana",
    updated: "Novaina farany: 1 Novambra 2026",
    intro:
      "Ireto fepetra ireto no fitsipika amin'ny fampiasana ny Six Frites, amin'ny web sy amin'ny fampiharana Android. Raha mampiasa ny Six Frites ianao dia manaiky azy ireo. Raha tsy manaiky ianao dia aza mampiasa azy.",
    sections: [
      {
        heading: "Iza no afaka mampiasa ny Six Frites",
        body: [
          "Tokony ho 13 taona farafahakeliny ianao, na mihoatra raha izany no takian'ny lalàna any amin'ny toerana misy anao, ary miditra amin'ny kaonty Google anao manokana. Mila fanasana ny firesahana; tsy mila izany kosa ny hafatra tsy fantatra mpandefa.",
          "Olona iray ihany isaky ny kaonty. Arovy tsara ny fitaovanao sy ny fanalahidinao famerenana: tompon'andraikitra amin'izay mitranga ao amin'ny kaontinao ianao.",
        ],
      },
      {
        heading: "Ny votoatinao",
        body: [
          "Anao foana izay alefanao. Omenao alalana fotsiny izahay hitahiry, handika ary handefa azy araka izay ilaina mba hampandehanana ny Six Frites ho anao sy ho an'ireo andefasanao.",
          "Tompon'andraikitra amin'izay alefanao ianao. Alefaso ihany izay manana zo hizara ianao.",
        ],
      },
      {
        heading: "Izay tsy azo atao",
        body: [
          [
            "Izay rehetra tsy ara-dalàna, na manampy olona hanao zavatra tsy ara-dalàna.",
            "Fanorisorenana, fandrahonana, na fankahalana olona noho ny maha izy azy.",
            "Votoaty ara-nofo mahakasika zaza tsy ampy taona. Ampahafantarinay ny manam-pahefana izany.",
            "Fizarana sary na video manokana an'olona tsy nahazoana alalana taminy.",
            "Spam, hosoka, fakana tenimiafina an-tsokosoko na rindrankajy manimba.",
            "Mody ho olon-kafa, na manaparitaka ny mombamomba manokan'olona tsy nahazoana alalana taminy.",
            "Manafika, manavesatra na maka angona betsaka avy amin'ny Six Frites, na mandingana fandraràna na fanakanana.",
          ],
        ],
      },
      {
        heading: "Hafatra tsy fantatra mpandefa",
        body: [
          "Tsy hahafantatra mihitsy hoe iza ianao ilay olona soratanao. Fantatray kosa hoe iza no nandefa ny hafatra tsirairay, mba hahafahanay manakana ny fanararaotana, ary mety homenay izany raha takian'ny lalàna.",
          "Raha sakanan'ilay olona soratanao ianao dia ho hitanao fa tsy afaka manoratra aminy intsony ianao; tsy ho fantany ihany hoe iza ianao.",
          "Azonao zaraina ny hafatra raisinao, ohatra ao amin'ny story-nao. Azon'ilay nandray zaraina koa ny hafatra alefanao.",
        ],
      },
      {
        heading: "Fiarovana sy fanaraha-maso",
        body: [
          "Afaka manakana na iza na iza ianao ary mitatitra hafatra na olona. Dinihin'ny mpandrindra anay ny tatitra ary mety hesorin'izy ireo ny votoaty, hoferana na hakatona ny kaonty rehefa tsy voahaja ireto fepetra ireto.",
          "Afaka mandrara olona amin'ny fampiharana manontolo ny mpandrindra, na amin'ny resaka ihany ka avelany ho azy ny hafatra miafina. Mihatra amin'ireo kaonty hafa ampiasaina amin'io finday na navigateur io ihany koa ny fandraràna tanteraka, na ny fanakanana hafatra tsy fantatra mpandefa.",
          "Tsy vakianay ny hafatra voaaro tanteraka. Rehefa mitatitra iray amin'izy ireo ianao dia mandeha any amin'ny mpandrindra anay ny dika mitovin'io hafatra io sy hafatra vitsivitsy manodidina azy, araka ny ahitanao azy.",
        ],
      },
      {
        heading: "Dokambarotra",
        body: ["Mety haneho dokambarotra avy amin'i Google ny tranonkala. Tsy misy izany ny fampiharana Android."],
      },
      {
        heading: "Ny tolotra",
        body: [
          "Miezaka izahay mba handeha tsara sy ho voaaro ny Six Frites, saingy omenay araka izao misy izao izy, ary mety ho tapaka indraindray. Mety hanova, hanampy na hanaisotra fiasa izahay.",
          "Ny fanalahidinao famerenana ihany no ahafahana mamerina ny hafatrao voaaro. Raha very izany sy ireo fitaovana rehetra idiranao dia tsy afaka mamerina ny hafatrao izahay.",
        ],
      },
      {
        heading: "Andraikitra",
        body: [
          "Araka izay avelan'ny lalàna, tsy tompon'andraikitra amin'izay alefan'ny olon-kafa aminao izahay, na amin'ny hafatra very, na amin'ny fatiantoka tsy mivantana avy amin'ny fampiasana ny Six Frites. Tsy manaisotra ny zo omen'ny lalàna anao ireto.",
        ],
      },
      {
        heading: "Fiafarana",
        body: [
          "Afaka mamafa ny kaontinao ianao amin'ny fotoana rehetra ao amin'ny Fikirana. Mety hampiato na hanakatona kaonty izahay raha tsy manaja ireto fepetra ireto izy na mampidi-doza ny hafa.",
        ],
      },
      {
        heading: "Fanovana",
        body: [
          "Mety hanavao ireto fepetra ireto izahay. Ny daty eo ambony no mampiseho ny dika farany, ary hampahafantarinay anao ao amin'ny fampiharana ny fanovana lehibe. Ny fanohizana mampiasa ny Six Frites aorian'ny fanovana dia midika fa manaiky azy ianao.",
        ],
      },
      {
        heading: "Fifandraisana",
        body: ["Misy fanontaniana momba ireto fepetra ireto? Resaho amin'ny fanampiana ao amin'ny six-frites.koera.mg/support."],
      },
    ],
  },
};

export const privacy: Record<Locale, LegalDoc> = {
  en: {
    title: "Privacy Policy",
    updated: "Last updated: 10 November 2026",
    intro:
      "This policy explains what Six Frites collects, why, who else is involved, and the choices you have. We collect what we need to run the app, and we never sell your data.",
    sections: [
      {
        heading: "What we collect",
        body: [
          [
            "Your Google account's name, email address, photo and ID, when you sign in. We never see your Google password.",
            "Your profile: the name and photo you show, the name and photo on your anonymous link, and the names and photos you give your contacts.",
            "Your devices: their name and type, a random ID the app keeps for each phone or browser, when they signed in, their encryption public keys, and notification tokens.",
            "How you use the service: who you talk to and when, message types and sizes, reactions, read and delivery receipts, timers, when you were last online, how long you keep the app open and on which screens, and how much you use our servers. Moderators can see this per account.",
            "Reports you make and moderation decisions.",
            "Your IP address, which our servers see whenever you connect.",
          ],
        ],
      },
      {
        heading: "What other people see",
        body: [
          "The people you talk to don't see your Google name or photo. Each of them sees you under a random name, like #EF4535, that is different for each person, until you choose to show them your real name and photo.",
          "People who open your anonymous link see the name and photo you chose for it. Your email address is never shown to other people.",
        ],
      },
      {
        heading: "Your messages",
        body: [
          "In a chat where everyone's app supports it, messages, photos, videos, voice notes, files, locations, checklists and games are end-to-end encrypted: only the devices in the chat can read them. Our servers store them encrypted and can't open them.",
          "Older chats, and chats with someone whose app can't encrypt yet, are not end-to-end encrypted. We store their messages to deliver them.",
          "Message backups are encrypted on your device. Only your recovery key or your PIN opens them, and we never store either in readable form.",
        ],
      },
      {
        heading: "Anonymous messages",
        body: [
          "Anonymous messages are not end-to-end encrypted. We store their text, their photo, GIF or voice note, who sent them and who got them. Photos are redrawn in your browser before they're sent, and voice notes are re-encoded on our servers, which removes details like where a photo was taken or which phone recorded it.",
          "The person who gets one never sees who sent it. Our moderators can see who sent every anonymous message, reported or not, to deal with abuse.",
          "If someone blocks you, you'll see that you can't write to them anymore, and neither can other accounts used on your phone or browser. They still never learn who you are.",
          "We keep anonymous messages, with their photos and voice notes, after the sender or the recipient deletes them, and after the recipient deletes their account, for the same reason. They're gone for good only when a moderator removes them.",
        ],
      },
      {
        heading: "How we use it",
        body: [
          [
            "To run Six Frites: sign you in, deliver messages, calls and notifications, and keep your devices in sync.",
            "To keep it safe: stop spam and abuse, handle reports, and enforce our Terms of Service.",
            "To manage invites and answer you when you contact support.",
          ],
          "We don't use your messages for ads, and we don't sell or rent your data to anyone.",
        ],
      },
      {
        heading: "Who else is involved",
        body: [
          [
            "Google, for signing in; for ads on the website (Google AdSense, which may use cookies to choose ads); for Android notifications (Firebase Cloud Messaging); and to help connect calls.",
            "Your browser's push service (from Google, Mozilla or Apple), for notifications on the web.",
            "GIPHY and KLIPY, for GIFs. Searches go through our servers; the GIFs load from theirs.",
            "The people you call: calls connect device to device when they can, so the other person's device may see your IP address.",
          ],
          "When a link preview is shown, our servers fetch the page, so the website sees our servers, not you. We share data with authorities only when the law requires it.",
        ],
      },
      {
        heading: "Where it's stored",
        body: ["Our servers and stored files are in France, in the European Union."],
      },
      {
        heading: "How long we keep it",
        body: [
          "We keep your account until you delete it. Messages stay until they are deleted, or until their timer runs out. Anonymous messages are kept as explained above. Moderation records are kept as long as they are needed for safety.",
          "We keep a record of each sign-in, with its device ID, after you sign out, so a ban still reaches that phone or browser.",
          "When you delete your account, we erase your Google link, email, name, photos, contact links, invites, blocks and backups, and sign you out everywhere. Messages you already sent stay with the people who got them, under \"Deleted account\". Anonymous messages you sent or got, and your sign-in records, are kept.",
        ],
      },
      {
        heading: "Your choices",
        body: [
          [
            "Change your name and photo, and those on your anonymous link, at any time.",
            "Delete messages, set chats to delete themselves, or use vanish mode.",
            "Block people, and sign devices out from Settings.",
            "Delete your account in Settings.",
            "Ask our support for a copy of your data, or to correct it.",
          ],
        ],
      },
      {
        heading: "Security",
        body: [
          "We use end-to-end encryption, encrypted connections and an optional app lock. No system is perfectly secure, so keep your devices and recovery key safe and tell us if something looks wrong.",
          "Moderators need a code from an authenticator app, on top of their Google sign-in, before they can see reports, anonymous senders or accounts.",
        ],
      },
      {
        heading: "Children",
        body: ["Six Frites is not for children under 13. If you think a child under 13 has an account, tell our support."],
      },
      {
        heading: "Changes",
        body: [
          "We'll update this page when what we collect or how we use it changes, and tell you in the app about important changes. The date at the top shows the latest version.",
        ],
      },
      {
        heading: "Contact",
        body: ["Questions about your data? Chat with our support at six-frites.koera.mg/support."],
      },
    ],
  },
  fr: {
    title: "Politique de confidentialité",
    updated: "Dernière mise à jour : 10 novembre 2026",
    intro:
      "Cette politique explique ce que Six Frites collecte, pourquoi, qui d'autre intervient, et les choix que vous avez. Nous collectons ce qu'il faut pour faire fonctionner l'application, et nous ne vendons jamais vos données.",
    sections: [
      {
        heading: "Ce que nous collectons",
        body: [
          [
            "Le nom, l'adresse e-mail, la photo et l'identifiant de votre compte Google, quand vous vous connectez. Nous ne voyons jamais votre mot de passe Google.",
            "Votre profil : le nom et la photo que vous affichez, ceux de votre lien anonyme, et les noms et photos que vous donnez à vos contacts.",
            "Vos appareils : leur nom et leur type, un identifiant au hasard que l'application garde pour chaque téléphone ou navigateur, leur date de connexion, leurs clés publiques de chiffrement et leurs jetons de notification.",
            "Votre utilisation du service : avec qui vous parlez et quand, le type et la taille des messages, les réactions, les accusés de lecture et de réception, les minuteurs, votre dernière connexion, le temps passé dans l'application et sur quels écrans, et votre usage de nos serveurs. Les modérateurs peuvent le voir pour chaque compte.",
            "Les signalements que vous faites et les décisions de modération.",
            "Votre adresse IP, que nos serveurs voient à chaque connexion.",
          ],
        ],
      },
      {
        heading: "Ce que voient les autres",
        body: [
          "Les personnes avec qui vous parlez ne voient ni votre nom ni votre photo Google. Chacune vous voit sous un nom au hasard, comme #EF4535, différent pour chaque personne, jusqu'à ce que vous choisissiez de lui montrer votre vrai nom et votre photo.",
          "Les personnes qui ouvrent votre lien anonyme voient le nom et la photo que vous avez choisis pour lui. Votre adresse e-mail n'est jamais montrée aux autres.",
        ],
      },
      {
        heading: "Vos messages",
        body: [
          "Dans une discussion où l'application de chacun le permet, les messages, photos, vidéos, messages vocaux, fichiers, positions, listes et jeux sont chiffrés de bout en bout : seuls les appareils de la discussion peuvent les lire. Nos serveurs les stockent chiffrés et ne peuvent pas les ouvrir.",
          "Les anciennes discussions, et celles avec quelqu'un dont l'application ne chiffre pas encore, ne sont pas chiffrées de bout en bout. Nous stockons leurs messages pour les transmettre.",
          "Les sauvegardes de messages sont chiffrées sur votre appareil. Seuls votre clé de récupération ou votre code PIN les ouvrent, et nous ne stockons jamais l'un ou l'autre sous forme lisible.",
        ],
      },
      {
        heading: "Messages anonymes",
        body: [
          "Les messages anonymes ne sont pas chiffrés de bout en bout. Nous stockons leur texte, leur photo, GIF ou message vocal, leur auteur et leur destinataire. Les photos sont redessinées dans votre navigateur avant l'envoi, et les messages vocaux réencodés sur nos serveurs, ce qui retire des détails comme le lieu d'une photo ou le téléphone qui a enregistré.",
          "Le destinataire ne voit jamais qui l'a envoyé. Nos modérateurs voient l'auteur de chaque message anonyme, signalé ou non, pour traiter les abus.",
          "Si quelqu'un vous bloque, vous verrez que vous ne pouvez plus lui écrire, et les autres comptes utilisés sur votre téléphone ou navigateur non plus. Cette personne ne sait toujours pas qui vous êtes.",
          "Nous gardons les messages anonymes, avec leurs photos et messages vocaux, après leur suppression par l'auteur ou le destinataire, et après la suppression du compte du destinataire, pour la même raison. Ils ne disparaissent définitivement que lorsqu'un modérateur les retire.",
        ],
      },
      {
        heading: "Comment nous les utilisons",
        body: [
          [
            "Pour faire fonctionner Six Frites : vous connecter, transmettre messages, appels et notifications, et synchroniser vos appareils.",
            "Pour le garder sûr : arrêter le spam et les abus, traiter les signalements et faire respecter nos Conditions d'utilisation.",
            "Pour gérer les invitations et vous répondre quand vous contactez l'assistance.",
          ],
          "Nous n'utilisons pas vos messages pour la publicité, et nous ne vendons ni ne louons vos données à personne.",
        ],
      },
      {
        heading: "Qui d'autre intervient",
        body: [
          [
            "Google, pour la connexion ; pour la publicité sur le site web (Google AdSense, qui peut utiliser des cookies pour choisir les annonces) ; pour les notifications Android (Firebase Cloud Messaging) ; et pour aider à établir les appels.",
            "Le service de notifications de votre navigateur (de Google, Mozilla ou Apple), pour les notifications sur le web.",
            "GIPHY et KLIPY, pour les GIF. Les recherches passent par nos serveurs ; les GIF se chargent depuis les leurs.",
            "Les personnes que vous appelez : les appels relient directement les appareils quand c'est possible, donc l'appareil de l'autre personne peut voir votre adresse IP.",
          ],
          "Quand un aperçu de lien s'affiche, ce sont nos serveurs qui chargent la page : le site voit nos serveurs, pas vous. Nous ne communiquons des données aux autorités que lorsque la loi l'exige.",
        ],
      },
      {
        heading: "Où elles sont stockées",
        body: ["Nos serveurs et les fichiers stockés se trouvent en France, dans l'Union européenne."],
      },
      {
        heading: "Combien de temps nous les gardons",
        body: [
          "Nous gardons votre compte jusqu'à ce que vous le supprimiez. Les messages restent jusqu'à leur suppression, ou jusqu'à la fin de leur minuteur. Les messages anonymes sont conservés comme expliqué plus haut. Les dossiers de modération sont conservés aussi longtemps que la sécurité l'exige.",
          "Nous gardons une trace de chaque connexion, avec l'identifiant de l'appareil, après la déconnexion, pour qu'un bannissement atteigne toujours ce téléphone ou ce navigateur.",
          "Quand vous supprimez votre compte, nous effaçons le lien avec Google, votre e-mail, votre nom, vos photos, vos liens de contact, invitations, blocages et sauvegardes, et vous déconnectons partout. Les messages déjà envoyés restent chez leurs destinataires, sous « Compte supprimé ». Les messages anonymes envoyés ou reçus, et les traces de connexion, sont conservés.",
        ],
      },
      {
        heading: "Vos choix",
        body: [
          [
            "Changer votre nom et votre photo, et ceux de votre lien anonyme, à tout moment.",
            "Supprimer des messages, activer la suppression automatique, ou utiliser le mode éphémère.",
            "Bloquer des personnes, et déconnecter des appareils depuis les Réglages.",
            "Supprimer votre compte dans les Réglages.",
            "Demander à l'assistance une copie de vos données, ou leur correction.",
          ],
        ],
      },
      {
        heading: "Sécurité",
        body: [
          "Nous utilisons le chiffrement de bout en bout, des connexions chiffrées et un verrouillage de l'application en option. Aucun système n'est parfaitement sûr : protégez vos appareils et votre clé de récupération, et prévenez-nous si quelque chose vous paraît anormal.",
          "Les modérateurs doivent saisir un code d'une application d'authentification, en plus de leur connexion Google, avant de voir les signalements, les auteurs des messages anonymes ou les comptes.",
        ],
      },
      {
        heading: "Enfants",
        body: [
          "Six Frites n'est pas destiné aux enfants de moins de 13 ans. Si vous pensez qu'un enfant de moins de 13 ans a un compte, prévenez l'assistance.",
        ],
      },
      {
        heading: "Modifications",
        body: [
          "Nous mettrons cette page à jour si ce que nous collectons ou la façon dont nous l'utilisons change, et nous vous préviendrons dans l'application des changements importants. La date en haut indique la dernière version.",
        ],
      },
      {
        heading: "Contact",
        body: ["Une question sur vos données ? Écrivez à notre assistance sur six-frites.koera.mg/support."],
      },
    ],
  },
  mg: {
    title: "Fiarovana ny fiainana manokana",
    updated: "Novaina farany: 10 Novambra 2026",
    intro:
      "Manazava ity politika ity hoe inona no angonin'ny Six Frites, nahoana, iza avy koa no voakasika, ary inona no safidinao. Izay ilaina hampandehanana ny fampiharana ihany no angoninay, ary tsy amidinay mihitsy ny mombamomba anao.",
    sections: [
      {
        heading: "Izay angoninay",
        body: [
          [
            "Ny anarana, adiresy mailaka, sary ary famantarana ny kaonty Google anao, rehefa miditra ianao. Tsy hitanay mihitsy ny tenimiafinao Google.",
            "Ny mombamomba anao: ny anarana sy sary asehonao, ireo eo amin'ny rohinao tsy fantatra mpandefa, ary ny anarana sy sary omenao ny olona ao amin'ny lisitrao.",
            "Ny fitaovanao: ny anarany sy ny karazany, famantarana kisendrasendra tehirizin'ny fampiharana ho an'ny finday na navigateur tsirairay, ny fotoana nidirany, ny fanalahidy ampahibemaso fiarovana, ary ny famantarana ho an'ny fampahafantarana.",
            "Ny fampiasanao ny tolotra: iza no iresahanao sy rahoviana, ny karazana sy haben'ny hafatra, ny fihetsika, ny marika voavaky sy tonga, ny fe-potoana, ny fotoana farany nisianao, ny faharetan'ny fampiasanao ny fampiharana sy ny efijery nojerenao, ary ny fampiasanao ny mpizara anay. Hitan'ny mpandrindra izany isaky ny kaonty.",
            "Ny tatitra ataonao sy ny fanapahan-kevitry ny mpandrindra.",
            "Ny adiresy IP-nao, izay hitan'ny mpizara anay isaky ny miditra ianao.",
          ],
        ],
      },
      {
        heading: "Izay hitan'ny hafa",
        body: [
          "Tsy hitan'ireo olona iresahanao ny anarana sy sary Google anao. Samy mahita anao amin'ny anarana kisendrasendra toy ny #EF4535 izy ireo, tsy mitovy isaky ny olona, mandra-pisafidinao haneho aminy ny tena anaranao sy ny sarinao.",
          "Ireo manokatra ny rohinao tsy fantatra mpandefa dia mahita ny anarana sy sary nofidinao ho azy. Tsy aseho amin'ny hafa mihitsy ny adiresy mailakao.",
        ],
      },
      {
        heading: "Ny hafatrao",
        body: [
          "Ao amin'ny resaka izay ahafahan'ny fampiharan'ny tsirairay manao izany, voaaro tanteraka ny hafatra, sary, video, hafatra am-peo, rakitra, toerana, lisitra ary lalao: ireo fitaovana ao amin'ny resaka ihany no mahavaky azy. Voaaro no itahirizan'ny mpizara anay azy ary tsy afaka manokatra azy izahay.",
          "Ny resaka taloha, sy ny resaka amin'olona tsy mbola mahavita miaro ny fampiharany, dia tsy voaaro tanteraka. Tehirizinay ny hafatra ao aminy mba handefasana azy.",
          "Voaaro ao amin'ny fitaovanao ny tahiry hafatra. Ny fanalahidinao famerenana na ny PIN-nao ihany no manokatra azy, ary tsy tehirizinay amin'ny endrika azo vakiana mihitsy izy ireo.",
        ],
      },
      {
        heading: "Hafatra tsy fantatra mpandefa",
        body: [
          "Tsy voaaro tanteraka ny hafatra tsy fantatra mpandefa. Tehirizinay ny lahatsorany, ny sariny, ny GIF na hafatra am-peony, ny nandefa azy sy ny nandray azy. Averina soritana ao amin'ny navigateur-nao ny sary alohan'ny handefasana azy, ary averina amboarina ao amin'ny mpizara anay ny hafatra am-peo, ka voaesotra ny antsipiriany toy ny toerana nakana ny sary na ny finday nandrakitra.",
          "Tsy hitan'ny mpandray mihitsy hoe iza no nandefa. Hitan'ny mpandrindra anay kosa ny nandefa ny hafatra tsy fantatra mpandefa rehetra, voatatitra na tsia, mba hiadiana amin'ny fanararaotana.",
          "Raha misy manakana anao dia ho hitanao fa tsy afaka manoratra aminy intsony ianao, ary toy izany koa ireo kaonty hafa ampiasaina amin'ny finday na navigateur-nao. Tsy ho fantany ihany hoe iza ianao.",
          "Tehirizinay ny hafatra tsy fantatra mpandefa, miaraka amin'ny sary sy hafatra am-peony, na dia efa nofafan'ny nandefa na ny nandray aza, ary na dia efa nofafan'ny nandray aza ny kaontiny, noho io antony io ihany. Tsy ho voafafa tanteraka izy ireo raha tsy esorin'ny mpandrindra.",
        ],
      },
      {
        heading: "Ny fampiasanay azy",
        body: [
          [
            "Hampandehanana ny Six Frites: hampidirana anao, handefasana hafatra, antso ary fampahafantarana, ary hampitovizana ny fitaovanao.",
            "Hiarovana azy: hanakanana ny spam sy ny fanararaotana, handinihana ny tatitra, ary hampiharana ny Fepetra fampiasana.",
            "Handrindrana ny fanasana sy hamaliana anao rehefa manoratra amin'ny fanampiana ianao.",
          ],
          "Tsy ampiasainay ho an'ny dokambarotra ny hafatrao, ary tsy amidinay na hofaina amin'iza na iza ny mombamomba anao.",
        ],
      },
      {
        heading: "Iza avy koa no voakasika",
        body: [
          [
            "Google, amin'ny fidirana; amin'ny dokambarotra ao amin'ny tranonkala (Google AdSense, izay mety mampiasa cookies hisafidianana dokambarotra); amin'ny fampahafantarana Android (Firebase Cloud Messaging); ary hanampiana amin'ny fampifandraisana antso.",
            "Ny tolotra fampahafantaran'ny navigateur-nao (avy amin'i Google, Mozilla na Apple), ho an'ny fampahafantarana amin'ny web.",
            "GIPHY sy KLIPY, ho an'ny GIF. Mandalo amin'ny mpizara anay ny fikarohana; avy amin'ny mpizara azy ireo kosa no ahazoana ny GIF.",
            "Ireo olona antsoinao: mifandray mivantana ny fitaovana raha azo atao, ka mety hahita ny adiresy IP-nao ny fitaovan'ilay olona.",
          ],
          "Rehefa misy topy maso rohy aseho, ny mpizara anay no maka ilay pejy, ka ny mpizara anay no hitan'ilay tranonkala fa tsy ianao. Tsy omenay ny manam-pahefana ny mombamomba anao raha tsy takian'ny lalàna.",
        ],
      },
      {
        heading: "Toerana itahirizana azy",
        body: ["Any Frantsa, ao amin'ny Vondrona Eoropeana, ny mpizara anay sy ny rakitra voatahiry."],
      },
      {
        heading: "Hafiriana no itahirizanay azy",
        body: [
          "Tehirizinay ny kaontinao mandra-pamafanao azy. Mijanona ny hafatra mandra-pamafana azy, na mandra-pahataperan'ny fe-potoany. Tehirizina araka ny voalaza etsy ambony ny hafatra tsy fantatra mpandefa. Tehirizina mandritra ny fotoana ilaina amin'ny fiarovana ny antontan-taratasin'ny fanaraha-maso.",
          "Tehirizinay ny firaketana ny fidirana tsirairay, miaraka amin'ny famantarana ny fitaovana, na dia efa nivoaka aza ianao, mba hahatongavan'ny fandraràna amin'io finday na navigateur io foana.",
          "Rehefa mamafa ny kaontinao ianao dia fafanay ny rohy amin'ny Google, ny mailakao, ny anaranao, ny sarinao, ny rohy fifandraisanao, ny fanasana, ny fanakanana ary ny tahiry, ary avoakanay amin'ny fitaovana rehetra ianao. Mijanona eo amin'ireo nandray azy kosa ny hafatra efa nalefanao, amin'ny anarana hoe « Kaonty voafafa ». Tehirizina kosa ny hafatra tsy fantatra mpandefa nalefanao na noraisinao, sy ny firaketana ny fidiranao.",
        ],
      },
      {
        heading: "Ny safidinao",
        body: [
          [
            "Manova ny anaranao sy ny sarinao, ary ireo eo amin'ny rohinao tsy fantatra mpandefa, amin'ny fotoana rehetra.",
            "Mamafa hafatra, mampafana ho azy ny resaka, na mampiasa ny fomba manjavona.",
            "Manakana olona, ary mamoaka fitaovana ao amin'ny Fikirana.",
            "Mamafa ny kaontinao ao amin'ny Fikirana.",
            "Mangataka amin'ny fanampiana dika mitovin'ny mombamomba anao, na fanitsiana azy.",
          ],
        ],
      },
      {
        heading: "Fiarovana",
        body: [
          "Mampiasa fiarovana tanteraka, fifandraisana voaaro ary hidin'ny fampiharana azo safidiana izahay. Tsy misy rafitra azo antoka tanteraka, ka arovy tsara ny fitaovanao sy ny fanalahidinao famerenana, ary ampahafantaro anay raha misy zavatra hafahafa.",
          "Mila kaody avy amin'ny fampiharana fanamarinana ny mpandrindra, ankoatra ny fidirany amin'ny Google, vao afaka mahita ny tatitra, ny nandefa ny hafatra tsy fantatra mpandefa na ny kaonty.",
        ],
      },
      {
        heading: "Ankizy",
        body: [
          "Tsy natao ho an'ny ankizy latsaky ny 13 taona ny Six Frites. Raha heverinao fa misy ankizy latsaky ny 13 taona manana kaonty, lazao amin'ny fanampiana.",
        ],
      },
      {
        heading: "Fanovana",
        body: [
          "Havaozinay ity pejy ity raha miova izay angoninay na ny fampiasanay azy, ary hampahafantarinay anao ao amin'ny fampiharana ny fanovana lehibe. Ny daty eo ambony no mampiseho ny dika farany.",
        ],
      },
      {
        heading: "Fifandraisana",
        body: ["Misy fanontaniana momba ny mombamomba anao? Resaho amin'ny fanampiana ao amin'ny six-frites.koera.mg/support."],
      },
    ],
  },
};

export const deleteAccount: Record<Locale, LegalDoc> = {
  en: {
    title: "Delete your Six Frites account",
    intro: "You can delete your Six Frites account and the data linked to it yourself, at any time. It can't be undone.",
    sections: [
      {
        heading: "How to delete it",
        body: [
          [
            "Open the Six Frites app, or sign in at six-frites.koera.mg.",
            "Open Settings. If you only have anonymous messages, it's the gear icon at the top.",
            "Under Account, choose Delete, type DELETE and confirm.",
          ],
          "Your account is deleted as soon as you confirm. Signing in again with the same Google account starts a new, empty account.",
          "Can't do it yourself? Ask our support at six-frites.koera.mg/support and we'll delete it for you.",
        ],
      },
      {
        heading: "What we delete",
        body: [
          [
            "Your name, photos, email address and the link to your Google account.",
            "Your contact code, contact links, invites, blocks, notes and scheduled messages.",
            "Your message backups and notification tokens. You're signed out everywhere.",
            "Your stories stop showing right away, and are erased when their time runs out.",
          ],
        ],
      },
      {
        heading: "What we keep",
        body: [
          [
            'Messages you already sent stay with the people who got them, under "Deleted account", until they are deleted or their timer runs out.',
            "Anonymous messages you sent or got, with their photos and voice notes, until a moderator removes them, to deal with abuse.",
            "Your sign-in records, with their device ID, so a ban still reaches that phone or browser.",
            "Moderation records, as long as they are needed for safety.",
          ],
        ],
      },
    ],
  },
  fr: {
    title: "Supprimer votre compte Six Frites",
    intro: "Vous pouvez supprimer vous-même votre compte Six Frites et les données qui y sont liées, à tout moment. C'est irréversible.",
    sections: [
      {
        heading: "Comment le supprimer",
        body: [
          [
            "Ouvrez l'application Six Frites, ou connectez-vous sur six-frites.koera.mg.",
            "Ouvrez les Paramètres. Si vous n'avez que les messages anonymes, c'est l'icône d'engrenage en haut.",
            "Dans Compte, choisissez Supprimer, tapez DELETE et confirmez.",
          ],
          "Votre compte est supprimé dès que vous confirmez. Vous reconnecter avec le même compte Google crée un nouveau compte vide.",
          "Vous n'y arrivez pas ? Demandez à notre support sur six-frites.koera.mg/support et nous le supprimerons pour vous.",
        ],
      },
      {
        heading: "Ce que nous supprimons",
        body: [
          [
            "Votre nom, vos photos, votre adresse e-mail et le lien avec votre compte Google.",
            "Votre code de contact, vos liens de contact, invitations, blocages, notes et messages programmés.",
            "Vos sauvegardes de messages et jetons de notification. Vous êtes déconnecté partout.",
            "Vos stories cessent d'apparaître tout de suite, et sont effacées à la fin de leur durée.",
          ],
        ],
      },
      {
        heading: "Ce que nous gardons",
        body: [
          [
            "Les messages déjà envoyés restent chez leurs destinataires, sous « Compte supprimé », jusqu'à leur suppression ou la fin de leur minuteur.",
            "Les messages anonymes envoyés ou reçus, avec leurs photos et messages vocaux, jusqu'à ce qu'un modérateur les retire, pour lutter contre les abus.",
            "Vos traces de connexion, avec l'identifiant de l'appareil, pour qu'un bannissement s'applique toujours à ce téléphone ou navigateur.",
            "Les dossiers de modération, aussi longtemps que la sécurité l'exige.",
          ],
        ],
      },
    ],
  },
  mg: {
    title: "Fafao ny kaontinao Six Frites",
    intro: "Afaka mamafa ny kaontinao Six Frites sy ny mombamomba mifandray aminy ianao, amin'ny fotoana rehetra. Tsy azo averina izany.",
    sections: [
      {
        heading: "Ahoana no famafana azy",
        body: [
          [
            "Sokafy ny fampiharana Six Frites, na midira ao amin'ny six-frites.koera.mg.",
            "Sokafy ny Fikirana. Raha hafatra tsy fantatra mpandefa ihany no anananao, io ilay kisary kodiarana eo ambony.",
            "Ao amin'ny Kaonty, safidio ny Fafao, soraty DELETE ary hamafiso.",
          ],
          "Voafafa avy hatrany ny kaontinao rehefa manamafy ianao. Raha miditra indray amin'io kaonty Google io ianao dia kaonty vaovao sady foana no misokatra.",
          "Tsy vitanao? Angataho amin'ny fanampiana ao amin'ny six-frites.koera.mg/support dia izahay no hamafa azy ho anao.",
        ],
      },
      {
        heading: "Izay fafanay",
        body: [
          [
            "Ny anaranao, ny sarinao, ny mailakao ary ny rohy amin'ny kaontinao Google.",
            "Ny kaody fifandraisanao, ny rohy fifandraisanao, ny fanasana, ny fanakanana, ny naoty ary ny hafatra voalahatra.",
            "Ny tahirin'ny hafatrao sy ny famantarana fampandrenesana. Avoaka amin'ny fitaovana rehetra ianao.",
            "Tsy miseho intsony avy hatrany ny story-nao, ary voafafa rehefa tapitra ny fotoanany.",
          ],
        ],
      },
      {
        heading: "Izay tehirizinay",
        body: [
          [
            "Mijanona eo amin'ireo nandray azy ny hafatra efa nalefanao, amin'ny anarana hoe « Kaonty voafafa », mandra-pamafana azy na fahataperan'ny fotoanany.",
            "Ny hafatra tsy fantatra mpandefa nalefanao na noraisinao, miaraka amin'ny sary sy feo, mandra-pamafan'ny mpandrindra azy, mba hiadiana amin'ny fanararaotana.",
            "Ny firaketana ny fidiranao, miaraka amin'ny famantarana ny fitaovana, mba hihatra amin'io finday na mpitety tranonkala io foana ny fandrarana.",
            "Ny firaketana momba ny fanaraha-maso, raha mbola ilaina amin'ny fiarovana.",
          ],
        ],
      },
    ],
  },
};
