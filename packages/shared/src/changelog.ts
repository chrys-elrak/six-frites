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
    version: "1.4.0",
    date: "2026-10-30",
    notes: {
      en: [
        "A Games tab, and games to play with a friend right in a chat, from a penalty shootout and hangman to draw and guess.",
        "No one around? Play against Frite Bot from the Games tab.",
        "Live games: Fanorona, Ludo, Crazy Eights, Word Hunt, Dots and Boxes and Memory with up to 3 friends at the same time, with Frite Bot in the empty seats.",
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
        "Un onglet Jeux, et des jeux à faire avec un ami dans une discussion, du tir au but et du pendu au dessin à deviner.",
        "Personne pour jouer ? Affrontez Frite Bot depuis l'onglet Jeux.",
        "Jeux en direct : fanorona, petits chevaux, huit américain, chasse aux mots, pipopipette et memory avec jusqu'à 3 amis en même temps, et Frite Bot aux places libres.",
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
        "Fizarana Lalao vaovao, sy lalao azonao atao miaraka amin'ny namana ao anatin'ny resaka.",
        "Tsy misy olona? Milalaova amin'i Frite Bot ao amin'ny fizarana Lalao.",
        "Lalao mivantana: Fanorona, Ludo, Valo adala, Fihazana teny, Teboka sy efamira ary Tadidy miaraka amin'ny namana hatramin'ny 3 amin'ny fotoana iray, ary i Frite Bot amin'ny toerana banga.",
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
