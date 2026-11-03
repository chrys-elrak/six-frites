import type { Locale } from "./i18n/index.js";

export interface Release {
  version: string;
  date: string;
  notes: Record<Locale, string[]>;
}

/**
 * What each release brought, newest first, read in "What's new" on the web and in the Android app. Every Android
 * release needs an entry for the version in apps/mobile/app.config.ts, or the release build stops; its English
 * notes are what goes to Koera Store.
 */
export const CHANGELOG: Release[] = [
  {
    version: "1.5.0",
    date: "2026-11-03",
    notes: {
      en: [
        "Sign in on a computer with your phone: open six-frites.koera.mg, then scan its code from Settings, Devices, Link a computer. Your past messages come along, no PIN needed.",
        "Long-press a message, like on Messenger: the reactions sit on top of it and the actions line up as icons at the bottom.",
        "Games move to Frite Bot, pinned at the top of your chats: play against it straight away, or start a live game with friends. To play with someone, open your chat with them and tap Game.",
        "While the app is open, new messages from other chats show up as phone notifications.",
        "Data saver: photos, GIFs, videos and files download only when you tap them, and the photos you send are smaller. Turn it on in Settings, Data.",
        "No network? Your messages wait and go out by themselves when you're back online, and the chat list shows which chats still have some waiting.",
        "Can't read a message? Ask the sender to send it again, or restore it from your backup.",
        "The app opens and sends messages faster on slow connections.",
      ],
      fr: [
        "Connectez-vous sur un ordinateur avec votre téléphone : ouvrez six-frites.koera.mg, puis scannez son code depuis Paramètres, Appareils, Associer un ordinateur. Vos anciens messages suivent, sans code PIN.",
        "Appui long sur un message, comme sur Messenger : les réactions s'affichent au-dessus et les actions en icônes en bas.",
        "Les jeux passent chez Frite Bot, épinglé en haut de vos discussions : jouez contre lui tout de suite, ou lancez une partie en direct avec des amis. Pour jouer avec quelqu'un, ouvrez votre discussion avec lui et touchez Jeu.",
        "Quand l'application est ouverte, les nouveaux messages des autres discussions s'affichent en notifications du téléphone.",
        "Économiseur de données : les photos, GIF, vidéos et fichiers ne se téléchargent que quand vous les touchez, et les photos que vous envoyez sont plus légères. À activer dans Paramètres, Données.",
        "Pas de réseau ? Vos messages attendent et partent tout seuls quand la connexion revient, et la liste des discussions montre celles où il en reste en attente.",
        "Impossible de lire un message ? Demandez à l'expéditeur de le renvoyer, ou restaurez-le depuis votre sauvegarde.",
        "L'application s'ouvre et envoie les messages plus vite sur les connexions lentes.",
      ],
      mg: [
        "Midira amin'ny solosaina amin'ny alalan'ny findainao: sokafy ny six-frites.koera.mg, dia scanne ny kaodiny avy amin'ny Paramètres, Fitaovana, Hampifandray solosaina. Miaraka aminy ny hafatrao taloha, tsy mila PIN.",
        "Tsindrio ela ny hafatra iray, toy ny amin'ny Messenger: eo amboniny ny fihetseham-po ary eo ambany ny asa miendrika sary kely.",
        "Any amin'i Frite Bot, voahombo eo ambony indrindra amin'ny resakao, izao ny lalao: milalao miaraka aminy avy hatrany, na manomboka lalao mivantana miaraka amin'ny namana. Raha hilalao amin'olona, sokafy ny resakao aminy ary tsindrio ny Lalao.",
        "Raha misokatra ny app, miseho ho fampandrenesana amin'ny finday ny hafatra vaovao avy amin'ny resaka hafa.",
        "Fitsitsiana angona: tsy misintona raha tsy tsindrianao ny sary, GIF, horonantsary ary rakitra, ary maivana kokoa ny sary alefanao. Alefaso ao amin'ny Paramètres, Angona.",
        "Tsy misy tambajotra? Miandry ny hafatrao ary lasa irery rehefa tafaverina ny fifandraisana, ary asehon'ny lisitry ny resaka izay mbola misy miandry.",
        "Tsy vakianao ny hafatra iray? Angataho amin'ny mpandefa mba haveriny alefa, na avereno avy amin'ny backup-nao.",
        "Haingana kokoa ny fanokafana ny app sy ny fandefasana hafatra rehefa miadana ny fifandraisana.",
      ],
    },
  },
  {
    version: "1.4.0",
    date: "2026-11-02",
    notes: {
      en: [
        "Pin messages to the top of a chat, up to 20, for both of you. Tap the bar to jump from one to the next.",
        "A Games tab, and games to play with a friend right in a chat, from a penalty shootout and hangman to draw and guess.",
        "No one around? Play against Frite Bot from the Games tab.",
        "Live games: Fanorona, Ludo, Crazy Eights, Word Hunt, Dots and Boxes and Memory with up to 3 friends at the same time, with Frite Bot in the empty seats.",
        "Live game invites show up in your chat with that friend, with a Join button, and /play in a chat starts a game with everyone in it.",
        "Chat with the other players during a live game, with GIFs, emoji and voice notes up to 30 seconds, or give up when it isn't going your way.",
        "In a game's chat, react to a message, drag it to reply, and see when it was sent.",
        "A chime, a buzz and a countdown tell you when it's your turn, and tick through your last 10 seconds.",
        "Ludo comes alive: the die bounces, tokens walk square by square with sounds, and you roll by tapping the die.",
        "Left a game by mistake? Resume it from the Games tab, or join late and take Frite Bot's seat.",
        "Now and then, Six Frites sends a question to your anonymous inbox to answer on your story. Turn it off in the Anonymous settings.",
        "Your anonymous link shows your name, photo and prompt when you share it.",
        "Reusable contact codes last a week and can stop after a number of people add you.",
        "Anonymous messages: share your link in your story, get questions without knowing who sent them, with photos, GIFs, voice and formatted text, and share them back as a story picture. Write your link's title, or make temporary links that last a day to a week. No invite needed.",
        "Need help? Reach Six Frites support from the chat list, screenshots included.",
        "A new Six Frites message tone, and a sound of its own for anonymous messages.",
        "Type / in the message box for quick commands like /vanish, /autodelete, /blur and /search, or to send a message without a notification.",
        "Vanish mode: seen messages disappear when the chat is closed.",
        "Forward a message to another chat.",
        "Send files up to 1 GB, and big files upload faster.",
        "Cut a video before sending it, and tap once to record a voice or video message.",
        "Send photos as an album, find a chat's media, files and links, or search its messages.",
        "Message effects, reactions during calls, and nicknames for the people you talk to.",
        "Drafts follow you between your phone and the web.",
        "Compare security codes as emoji, and see when a contact's code changes.",
        "Archived chats hide above the chat list, behind the app lock.",
        "Zoom into photos, and see where unread messages start.",
      ],
      fr: [
        "Épinglez des messages en haut d'une discussion, jusqu'à 20, pour vous deux. Touchez la barre pour passer de l'un à l'autre.",
        "Un onglet Jeux, et des jeux à faire avec un ami dans une discussion, du tir au but et du pendu au dessin à deviner.",
        "Personne pour jouer ? Affrontez Frite Bot depuis l'onglet Jeux.",
        "Jeux en direct : fanorona, petits chevaux, huit américain, chasse aux mots, pipopipette et memory avec jusqu'à 3 amis en même temps, et Frite Bot aux places libres.",
        "Les invitations aux jeux en direct arrivent dans votre discussion avec cet ami, avec un bouton Rejoindre, et /play dans une discussion lance une partie avec tout le monde.",
        "Discutez avec les autres joueurs pendant une partie en direct, avec GIF, emoji et vocaux jusqu'à 30 secondes, ou abandonnez quand ça tourne mal.",
        "Dans la discussion d'une partie, réagissez à un message, faites-le glisser pour y répondre, et voyez quand il a été envoyé.",
        "Un carillon, une vibration et un compte à rebours vous préviennent quand c'est votre tour, avec un tic-tac pour les 10 dernières secondes.",
        "Les petits chevaux s'animent : le dé rebondit, les pions avancent case par case en musique, et un appui sur le dé le lance.",
        "Partie quittée par erreur ? Reprenez-la depuis l'onglet Jeux, ou rejoignez en cours et prenez la place de Frite Bot.",
        "De temps en temps, Six Frites envoie une question dans vos messages anonymes, à laquelle répondre en story. Désactivez-le dans les réglages Anonyme.",
        "Votre lien anonyme affiche votre nom, votre photo et votre titre quand vous le partagez.",
        "Les codes contact réutilisables durent une semaine et peuvent s'arrêter après un nombre de personnes.",
        "Messages anonymes : partagez votre lien en story, recevez des questions sans savoir qui les envoie, avec photos, GIF, vocaux et texte mis en forme, et repartagez-les en image dans votre story. Choisissez le titre de votre lien, ou créez des liens temporaires d'un jour à une semaine. Sans invitation.",
        "Besoin d'aide ? Contactez le support Six Frites depuis la liste des discussions, captures d'écran comprises.",
        "Une nouvelle sonnerie de message « Six Frites », et un son à part pour les messages anonymes.",
        "Tapez / dans la zone de message pour des commandes rapides comme /vanish, /autodelete, /blur et /search, ou pour envoyer un message sans notification.",
        "Mode éphémère : les messages vus disparaissent à la fermeture de la discussion.",
        "Transférez un message vers une autre discussion.",
        "Envoyez des fichiers jusqu'à 1 Go, et les gros fichiers partent plus vite.",
        "Coupez une vidéo avant de l'envoyer, et touchez une fois pour enregistrer un message vocal ou vidéo.",
        "Envoyez des photos en album, retrouvez les médias, fichiers et liens d'une discussion, ou cherchez dans ses messages.",
        "Effets de message, réactions pendant les appels et surnoms pour les personnes avec qui vous parlez.",
        "Vos brouillons vous suivent entre votre téléphone et le web.",
        "Comparez les codes de sécurité en emoji, et sachez quand le code d'un contact change.",
        "Les discussions archivées se cachent au-dessus de la liste, derrière le verrouillage de l'app.",
        "Zoomez sur les photos, et voyez où commencent les messages non lus.",
      ],
      mg: [
        "Apetaho eo ambony amin'ny resaka ny hafatra, hatramin'ny 20, ho anareo roa. Tsindrio ny tsipika hifindra amin'ny manaraka.",
        "Fizarana Lalao vaovao, sy lalao azonao atao miaraka amin'ny namana ao anatin'ny resaka.",
        "Tsy misy olona? Milalaova amin'i Frite Bot ao amin'ny fizarana Lalao.",
        "Lalao mivantana: Fanorona, Ludo, Valo adala, Fihazana teny, Teboka sy efamira ary Tadidy miaraka amin'ny namana hatramin'ny 3 amin'ny fotoana iray, ary i Frite Bot amin'ny toerana banga.",
        "Tonga ao amin'ny resakao amin'ilay namana ny fanasana hilalao mivantana, misy bokotra Hiditra, ary manomboka lalao miaraka amin'ny rehetra ao ny /play ao anaty resaka.",
        "Miresaha amin'ireo mpilalao hafa mandritra ny lalao mivantana, misy GIF, emoji ary hafatra am-peo hatramin'ny 30 segondra, na manaiky resy rehefa tsy mety intsony.",
        "Ao amin'ny resaky ny lalao, maneho fihetseham-po amin'ny hafatra, sintony hamaliana azy, ary jereo hoe oviana no nandefasana azy.",
        "Feo, fihovitrovitra ary fanisana mampahafantatra anao rehefa anjaranao, misy tik-tak amin'ny 10 segondra farany.",
        "Velona ny Ludo: mitsambikina ny dé, mandeha tsikelikely miaraka amin'ny feo ny poana, ary tsindrio ny dé hanipazana azy.",
        "Nandao lalao tsy nahy? Avereno ao amin'ny fizarana Lalao, na midira tara ka raiso ny toeran'i Frite Bot.",
        "Indraindray, mandefa fanontaniana ao amin'ny hafatra miafinao ny Six Frites, hovalianao amin'ny story. Azonao atsahatra ao amin'ny fikirakirana Miafina.",
        "Miseho ny anaranao, ny sarinao ary ny lohateninao rehefa zarainao ny rohinao miafina.",
        "Maharitra herinandro ny kaody mpifandray azo ampiasaina imbetsaka, ary afaka mijanona rehefa olona maromaro no nanampy anao.",
        "Hafatra miafina: zarao amin'ny story ny rohinao, mahazoa fanontaniana tsy fantatrao hoe iza no nandefa, misy sary, GIF, feo ary soratra voalamina, ary zarao ho sary amin'ny story indray. Soraty ny lohatenin'ny rohinao, na mamorona rohy vonjimaika maharitra iray andro ka hatramin'ny herinandro. Tsy mila fanasana.",
        "Mila fanampiana? Miresaha amin'ny mpanampy Six Frites avy eo amin'ny lisitry ny resaka, azo andefasana sary koa.",
        "Feo hafatra vaovao \"Six Frites\", ary feo manokana ho an'ny hafatra miafina.",
        "Soraty / ao amin'ny toerana fanoratana hafatra hampiasana baiko haingana toy ny /vanish, /autodelete, /blur ary /search, na handefasana hafatra tsy misy fampandrenesana.",
        "Fomba manjavona: manjavona ny hafatra efa hita rehefa mikatona ny resaka.",
        "Ampitao amin'ny resaka hafa ny hafatra iray.",
        "Mandefasa rakitra hatramin'ny 1 Go, ary haingana kokoa ny fandefasana rakitra lehibe.",
        "Tapaho ny horonan-tsary alohan'ny handefasana azy, ary tsindrio indray mandeha handraketana hafatra am-peo na horonan-tsary.",
        "Alefaso ho album ny sary, jereo ny sary, rakitra ary rohy ao amin'ny resaka, na mikaroha hafatra ao.",
        "Haingo amin'ny hafatra, fanehoan-kevitra mandritra ny antso, ary anaram-bositra ho an'ireo olona miresaka aminao.",
        "Manaraka anao eo amin'ny findainao sy ny tranonkala ny drafitrao.",
        "Ampitahao amin'ny emoji ny laharana fiarovana, ary fantaro rehefa miova ny an'ny mpifandray aminao.",
        "Miafina eo ambonin'ny lisitry ny resaka ny resaka arsiva, ao ambadiky ny hidin'ny fampiharana.",
        "Hangezao ny sary, ary jereo hoe aiza no manomboka ny hafatra mbola tsy voavaky.",
      ],
    },
  },
];

/** The releases newer than the one last read, or only the newest when that one is unknown, as on a first visit. */
export function unseenReleases(seen: string | null, changelog = CHANGELOG) {
  const at = changelog.findIndex((r) => r.version === seen);
  return at === -1 ? changelog.slice(0, 1) : changelog.slice(0, at);
}
