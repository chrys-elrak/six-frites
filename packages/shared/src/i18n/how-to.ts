const en = {
  title: "How to play",
  steps: {
    rps: [
      "Pick rock, paper or scissors and send it. Your friend can't see it.",
      "They pick theirs to answer.",
      "Rock beats scissors, scissors beat paper, paper beats rock. The same hand is a draw.",
    ],
    dice: [
      "Pick a number from 1 to 6.",
      "Your friend picks one too, then the die is rolled for both of you.",
      "Whoever picked closer to the roll wins.",
    ],
    guess: [
      "Pick a secret number from 1 to 100.",
      "Your friend guesses, and each try tells them higher or lower.",
      "The fewer tries they need, the better.",
    ],
    penalty: [
      "Choose where your five kicks go: left, middle or right.",
      "Then choose where your keeper dives for each of their five kicks.",
      "A shot goes in unless the keeper dives the same way.",
      "Most goals wins.",
    ],
    hangman: [
      "Write a secret word.",
      "Your friend guesses it one letter at a time.",
      "Each wrong letter eats one of their 6 fries 🍟. They must find the word before they're all gone.",
    ],
    lie: [
      "Write three things about you: two true, one made up, and tap the lie.",
      "Your friend picks the one they think is the lie.",
      "They win if they find it, you win if you fooled them.",
    ],
    rather: [
      "Write two choices, then pick the one you'd rather.",
      "Your friend picks theirs without seeing yours.",
      "See if you think alike.",
    ],
    riddle: [
      "Describe a film, a song, a place or anything with emoji only, and write the answer.",
      "Your friend types guesses until they find it. Small spelling mistakes are fine.",
    ],
    ships: [
      "Place your three boats on the 5 by 5 sea: one of 3 squares and two of 2, in straight lines.",
      "Your friend shoots one square at a time and sees what they hit.",
      "They must sink every boat in as few shots as they can.",
    ],
    ttt: [
      "Take turns putting your mark on the 3 by 3 board.",
      "Three in a row, across, down or diagonally, wins.",
      "A full board with no line is a draw.",
    ],
    four: [
      "Take turns dropping a disc into one of the 7 columns. It falls to the lowest free spot.",
      "Four in a row, across, down or diagonally, wins.",
      "A full board with no line is a draw.",
    ],
    sketch: [
      "Draw something and write what it is.",
      "Your friend types guesses until they find it. Small spelling mistakes are fine.",
    ],
    ludo: [
      "Everyone has 4 tokens in their corner. Roll a 6 to bring one out onto your start square.",
      "Move a token by the number you roll, around the board, then up your coloured path to the middle. You need the exact number to get home.",
      "Land on someone else's token to send it back to their corner. Tokens on a star or a start square are safe.",
      "A 6, taking a token or getting one home gives you another roll, but three 6s in a row end your turn.",
      "First to bring all 4 tokens home wins. You have 25 seconds a turn, or it's played for you.",
    ],
    eights: [
      "Play a card of the same suit or the same number as the top of the pile.",
      "8s go on anything and let you choose the next suit.",
      "A 2 makes the next player draw two and miss their turn, a jack makes them miss it, an ace turns play around.",
      "Can't play? Draw a card, then play or pass.",
      "First to get rid of all their cards wins.",
    ],
    words: [
      "Everyone gets the same 16 letters for 2 minutes.",
      "Make words of 3 letters or more by sliding across touching letters, sideways, up, down or diagonally, each letter once.",
      "Longer words score more: 1 point for 3 or 4 letters, then 2, 3 and 5, and 11 for 8 or more.",
      "Most points when time's up wins. Then you see everyone's words.",
    ],
  },
};

const fr: typeof en = {
  title: "Comment jouer",
  steps: {
    rps: [
      "Choisis pierre, feuille ou ciseaux et envoie. Ton ami ne le voit pas.",
      "Il choisit le sien pour répondre.",
      "La pierre bat les ciseaux, les ciseaux la feuille, la feuille la pierre. La même main, c'est égalité.",
    ],
    dice: [
      "Choisis un nombre de 1 à 6.",
      "Ton ami en choisit un aussi, puis le dé est lancé pour vous deux.",
      "Le plus proche du lancer gagne.",
    ],
    guess: [
      "Choisis un nombre secret de 1 à 100.",
      "Ton ami devine, et chaque essai lui dit plus grand ou plus petit.",
      "Moins il lui faut d'essais, mieux c'est.",
    ],
    penalty: [
      "Choisis où vont tes cinq tirs : à gauche, au milieu ou à droite.",
      "Puis choisis où ton gardien plonge sur chacun de ses cinq tirs.",
      "Le tir entre sauf si le gardien plonge du même côté.",
      "Le plus de buts gagne.",
    ],
    hangman: [
      "Écris un mot secret.",
      "Ton ami le devine une lettre à la fois.",
      "Chaque mauvaise lettre mange une de ses 6 frites 🍟. Il doit trouver le mot avant qu'il n'en reste plus.",
    ],
    lie: [
      "Écris trois choses sur toi : deux vraies, une inventée, et touche le mensonge.",
      "Ton ami choisit celle qu'il pense être le mensonge.",
      "Il gagne s'il le trouve, tu gagnes si tu l'as eu.",
    ],
    rather: [
      "Écris deux choix, puis choisis celui que tu préfères.",
      "Ton ami choisit le sien sans voir le tien.",
      "Vous verrez si vous pensez pareil.",
    ],
    riddle: [
      "Décris un film, une chanson, un lieu ou n'importe quoi avec seulement des emoji, et écris la réponse.",
      "Ton ami tape des propositions jusqu'à trouver. Les petites fautes passent.",
    ],
    ships: [
      "Place tes trois bateaux sur la mer de 5 sur 5 : un de 3 cases et deux de 2, en ligne droite.",
      "Ton ami tire une case à la fois et voit ce qu'il touche.",
      "Il doit tout couler en un minimum de tirs.",
    ],
    ttt: [
      "Chacun son tour, placez votre signe sur la grille de 3 sur 3.",
      "Trois alignés, en ligne, en colonne ou en diagonale, gagnent.",
      "Grille pleine sans ligne : égalité.",
    ],
    four: [
      "Chacun son tour, faites tomber un jeton dans l'une des 7 colonnes. Il descend tout en bas.",
      "Quatre alignés, en ligne, en colonne ou en diagonale, gagnent.",
      "Grille pleine sans ligne : égalité.",
    ],
    sketch: [
      "Dessine quelque chose et écris ce que c'est.",
      "Ton ami tape des propositions jusqu'à trouver. Les petites fautes passent.",
    ],
    ludo: [
      "Chacun a 4 pions dans son coin. Fais un 6 pour en sortir un sur ta case de départ.",
      "Avance un pion du nombre tiré, fais le tour du plateau puis monte ton chemin de couleur jusqu'au centre. Il faut le nombre exact pour arriver.",
      "Tombe sur le pion d'un autre pour le renvoyer dans son coin. Les pions sur une étoile ou une case de départ sont protégés.",
      "Un 6, une prise ou un pion arrivé te donne un autre lancer, mais trois 6 de suite terminent ton tour.",
      "Le premier qui ramène ses 4 pions gagne. Tu as 25 secondes par tour, sinon on joue pour toi.",
    ],
    eights: [
      "Pose une carte de la même couleur ou du même chiffre que celle du dessus.",
      "Les 8 se posent sur tout et te laissent choisir la couleur suivante.",
      "Un 2 fait piocher deux cartes au suivant et lui fait passer son tour, un valet le fait passer, un as change le sens.",
      "Tu ne peux pas jouer ? Pioche une carte, puis joue ou passe.",
      "Le premier qui n'a plus de cartes gagne.",
    ],
    words: [
      "Tout le monde a les mêmes 16 lettres pendant 2 minutes.",
      "Forme des mots de 3 lettres ou plus en glissant sur des lettres voisines, sur les côtés, en haut, en bas ou en diagonale, chaque lettre une seule fois.",
      "Plus le mot est long, plus il rapporte : 1 point pour 3 ou 4 lettres, puis 2, 3 et 5, et 11 pour 8 lettres ou plus.",
      "Le plus de points à la fin du temps gagne. Tu vois ensuite les mots de tout le monde.",
    ],
  },
};

const mg: typeof en = {
  title: "Ahoana ny filalaovana",
  steps: {
    rps: [
      "Fidio ny vato, taratasy na hety dia alefaso. Tsy hitan'ny namanao izany.",
      "Mifidy ny azy koa izy hamaliana.",
      "Mandresy ny hety ny vato, mandresy ny taratasy ny hety, mandresy ny vato ny taratasy. Sahala raha mitovy.",
    ],
    dice: [
      "Misafidiana isa 1 ka hatramin'ny 6.",
      "Misafidy isa koa ny namanao, dia arina ho anareo roa ny dé.",
      "Izay akaiky indrindra ny isan'ny dé no mandresy.",
    ],
    guess: [
      "Misafidiana isa miafina 1 ka hatramin'ny 100.",
      "Manandrana ny namanao, ary lazain'ny andrana tsirairay raha ambony kokoa na ambany kokoa.",
      "Arakaraka ny hahavitsy ny andrana no tsara kokoa.",
    ],
    penalty: [
      "Fidio izay alehan'ny daka dimy ataonao: ankavia, afovoany na ankavanana.",
      "Avy eo fidio izay hitsambikinan'ny mpiandry tsatokao amin'ny dakany dimy.",
      "Miditra ny baolina raha tsy mitsambikina amin'io lafiny io ihany ny mpiandry tsatoka.",
      "Izay be baolina miditra indrindra no mandresy.",
    ],
    hangman: [
      "Manorata teny miafina.",
      "Tadiavin'ny namanao tsirairay ny litera.",
      "Ny litera diso tsirairay dia mihinana iray amin'ny frites 6 🍟 ananany. Tsy maintsy hitany ny teny alohan'ny hahalany azy rehetra.",
    ],
    lie: [
      "Manorata zavatra telo momba anao: roa marina, iray noforonina, dia tsindrio ny lainga.",
      "Fidin'ny namanao izay heveriny ho lainga.",
      "Mandresy izy raha hitany, mandresy ianao raha voafitakao izy.",
    ],
    rather: [
      "Manorata safidy roa, dia fidio izay tianao kokoa.",
      "Mifidy ny azy ny namanao nefa tsy mahita ny anao.",
      "Ho hitanareo raha mitovy hevitra ianareo.",
    ],
    riddle: [
      "Lazao amin'ny emoji fotsiny ny sarimihetsika, hira, toerana na zavatra hafa, dia soraty ny valiny.",
      "Manoratra valiny ny namanao mandra-pahitany azy. Tsy maninona ny hadisoana kely.",
    ],
    ships: [
      "Apetraho amin'ny ranomasina 5 x 5 ny sambonao telo: iray misy toerana 3 sy roa misy toerana 2, mahitsy avokoa.",
      "Mitifitra toerana iray isaky ny mandeha ny namanao ary hitany izay voany.",
      "Tsy maintsy alentiny avokoa amin'ny tifitra vitsy indrindra.",
    ],
    ttt: [
      "Mifandimby mametraka ny marikao amin'ny tabilao 3 x 3.",
      "Telo milahatra, mitsivalana, mitsangana na mitongilana, no mandresy.",
      "Sahala raha feno ny tabilao nefa tsy misy milahatra.",
    ],
    four: [
      "Mifandimby mandatsaka boribory amin'ny iray amin'ireo tsanganana 7. Latsaka any amin'ny toerana malalaka ambany indrindra izy.",
      "Efatra milahatra, mitsivalana, mitsangana na mitongilana, no mandresy.",
      "Sahala raha feno ny tabilao nefa tsy misy milahatra.",
    ],
    sketch: [
      "Manaova sary dia soraty hoe inona ilay izy.",
      "Manoratra valiny ny namanao mandra-pahitany azy. Tsy maninona ny hadisoana kely.",
    ],
    ludo: [
      "Samy manana vato 4 eo an-jorony avy. Mila 6 vao afaka mamoaka iray eo amin'ny toerana fiaingananao.",
      "Ampandehano araka ny isa azonao ny vato, manodidina ny tabilao, dia miakatra amin'ny lalana misy lokonao mankany afovoany. Mila ny isa marina vao tonga.",
      "Mijanòna eo amin'ny vaton'olon-kafa hamerenana azy any an-joroniny. Voaaro ny vato eo amin'ny kintana na toerana fiaingana.",
      "Ny 6, ny fakana vato na ny vato tonga dia manome fanariana iray hafa, fa mamarana ny anjaranao ny 6 intelo misesy.",
      "Izay voalohany mampody ny vatony 4 no mandresy. Segondra 25 isaky ny anjara, raha tsy izany dia lalaovina ho anao.",
    ],
    eights: [
      "Apetraho ny karatra mitovy loko na mitovy isa amin'ilay eo ambony.",
      "Azo apetraka amin'ny karatra rehetra ny 8, ary ianao no misafidy ny loko manaraka.",
      "Ny 2 dia mampaka karatra roa ny manaraka ary mandalo ny anjarany, ny valety mampandalo azy, ny As mamadika ny lalana.",
      "Tsy afaka milalao? Makà karatra iray, dia milalao na mandalo.",
      "Izay voalohany lany karatra no mandresy.",
    ],
    words: [
      "Samy mahazo litera 16 mitovy avokoa mandritra ny 2 minitra.",
      "Mamorona teny misy litera 3 na mihoatra amin'ny fanatsofohana amin'ny litera mifanila, an-tsisiny, ambony, ambany na mitongilana, indray mandeha ny litera tsirairay.",
      "Arakaraka ny halavan'ny teny no betsaka ny isa: 1 ho an'ny litera 3 na 4, avy eo 2, 3 ary 5, ary 11 ho an'ny 8 na mihoatra.",
      "Izay be isa indrindra rehefa tapitra ny fotoana no mandresy. Hitanao avy eo ny tenin'ny rehetra.",
    ],
  },
};

export default { en, fr, mg };
