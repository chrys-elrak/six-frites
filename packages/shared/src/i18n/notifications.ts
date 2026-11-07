const en = {
  title: "Notifications",
  markUnread: "Mark as unread",
  markRead: "Mark as read",
  empty: "Nothing yet. You'll see here when someone joins with your invite, adds you, reacts to your story or calls you.",
  joined: (name: string) => `${name} joined Six Frites with your invite.`,
  added: (name: string) => `${name} added you as a contact.`,
  storyReaction: (name: string, emoji: string) => `${name} reacted ${emoji} to your story.`,
  noteReaction: (name: string, emoji: string) => `${name} reacted ${emoji} to your note.`,
  storyReply: (name: string) => `${name} replied to your story.`,
  missedCall: (name: string) => `You missed a call from ${name}.`,
  missedVideoCall: (name: string) => `You missed a video call from ${name}.`,
};

const fr: typeof en = {
  title: "Notifications",
  markUnread: "Marquer comme non lue",
  markRead: "Marquer comme lue",
  empty: "Rien pour l'instant. Vous verrez ici quand quelqu'un rejoint Six Frites avec votre invitation, vous ajoute, réagit à votre story ou vous appelle.",
  joined: (name) => `${name} a rejoint Six Frites avec votre invitation.`,
  added: (name) => `${name} vous a ajouté à ses contacts.`,
  storyReaction: (name, emoji) => `${name} a réagi ${emoji} à votre story.`,
  noteReaction: (name, emoji) => `${name} a réagi ${emoji} à votre note.`,
  storyReply: (name) => `${name} a répondu à votre story.`,
  missedCall: (name) => `Appel manqué de ${name}.`,
  missedVideoCall: (name) => `Appel vidéo manqué de ${name}.`,
};

const mg: typeof en = {
  title: "Fampandrenesana",
  markUnread: "Ataovy hoe tsy voavaky",
  markRead: "Ataovy hoe voavaky",
  empty: "Mbola tsy misy. Hiseho eto raha misy miditra amin'ny fanasanao, manampy anao, mamaly ny story-nao na miantso anao.",
  joined: (name) => `Niditra tao amin'ny Six Frites tamin'ny fanasanao i ${name}.`,
  added: (name) => `Nanampy anao ho mpifandray i ${name}.`,
  storyReaction: (name, emoji) => `Namaly ${emoji} ny story-nao i ${name}.`,
  noteReaction: (name, emoji) => `Namaly ${emoji} ny fanamarihanao i ${name}.`,
  storyReply: (name) => `Namaly ny story-nao i ${name}.`,
  missedCall: (name) => `Antso tsy voaray avy amin'i ${name}.`,
  missedVideoCall: (name) => `Antso video tsy voaray avy amin'i ${name}.`,
};

export default { en, fr, mg };
