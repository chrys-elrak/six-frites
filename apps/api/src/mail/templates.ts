import { type Locale, isLocale } from "@six/shared";

const strings = {
  en: {
    poke: {
      subject: (name: string) => `${name} poked you 👋`,
      title: (name: string) => `${name} poked you!`,
      body: (name: string) => `${name} is waiting for you on Six Frites. Come say hi, your chat is right where you left it.`,
      says: (name: string) => `${name} says:`,
      cta: "Open the chat",
      why: (name: string) => `You're getting this because ${name} poked you on Six Frites.`,
    },
    inactive: {
      subject: "Your Six Frites account misses you",
      title: "We haven't seen you in a while",
      body: "It's been more than a day since you opened Six Frites. Accounts that stay inactive may be deactivated, along with their chats. Open the app to keep yours.",
      cta: "Open Six Frites",
      why: "You're getting this because your account hasn't been used for a while.",
    },
    anon: {
      subject: "Get anonymous messages 🎭",
      title: "Your anonymous link is waiting",
      body: "Share your link on your story, status or bio, and your friends can send you anonymous messages. The more you share it, the more you get!",
      link: "Your link",
      cta: "Share my link",
      why: "You're getting this because you have a Six Frites anonymous link.",
    },
    access: {
      subject: "You now have full access to Six Frites 🎉",
      title: "Welcome all the way in!",
      body: "An admin just gave you full access. You can now chat with anyone, post stories, join groups and invite your friends.",
      cta: "Open Six Frites",
      why: "You're getting this because your Six Frites account was upgraded.",
    },
    stop: "Don't want these emails?",
    unsubscribe: "Unsubscribe",
    unsubscribeTitle: "Stop emails from Six Frites?",
    unsubscribeBody: "You won't get pokes, reminders or tips by email any more. Your account stays as it is.",
    unsubscribeDone: "Done. You won't get emails from Six Frites any more.",
    badLink: "This link doesn't work. Unsubscribe from the newest email instead.",
  },
  fr: {
    poke: {
      subject: (name: string) => `${name} vous fait coucou 👋`,
      title: (name: string) => `${name} vous fait coucou !`,
      body: (name: string) => `${name} vous attend sur Six Frites. Passez dire bonjour, votre discussion est là où vous l'avez laissée.`,
      says: (name: string) => `${name} dit :`,
      cta: "Ouvrir la discussion",
      why: (name: string) => `Vous recevez cet e-mail parce que ${name} vous a fait coucou sur Six Frites.`,
    },
    inactive: {
      subject: "Six Frites s'ennuie de vous",
      title: "Ça fait un moment !",
      body: "Vous n'avez pas ouvert Six Frites depuis plus d'un jour. Les comptes inactifs peuvent être désactivés, avec leurs discussions. Ouvrez l'app pour garder le vôtre.",
      cta: "Ouvrir Six Frites",
      why: "Vous recevez cet e-mail parce que votre compte n'a pas servi depuis un moment.",
    },
    anon: {
      subject: "Recevez des messages anonymes 🎭",
      title: "Votre lien anonyme vous attend",
      body: "Partagez votre lien en story, en statut ou dans votre bio, et vos amis pourront vous envoyer des messages anonymes. Plus vous le partagez, plus vous en recevez !",
      link: "Votre lien",
      cta: "Partager mon lien",
      why: "Vous recevez cet e-mail parce que vous avez un lien anonyme Six Frites.",
    },
    access: {
      subject: "Vous avez maintenant accès à tout Six Frites 🎉",
      title: "Bienvenue, pour de bon !",
      body: "Un administrateur vient de vous donner l'accès complet. Vous pouvez maintenant discuter avec tout le monde, publier des stories, rejoindre des groupes et inviter vos amis.",
      cta: "Ouvrir Six Frites",
      why: "Vous recevez cet e-mail parce que votre compte Six Frites a été mis à niveau.",
    },
    stop: "Vous ne voulez plus ces e-mails ?",
    unsubscribe: "Se désabonner",
    unsubscribeTitle: "Ne plus recevoir d'e-mails de Six Frites ?",
    unsubscribeBody: "Vous ne recevrez plus de coucous, de rappels ni d'astuces par e-mail. Votre compte reste tel quel.",
    unsubscribeDone: "C'est fait. Vous ne recevrez plus d'e-mails de Six Frites.",
    badLink: "Ce lien ne fonctionne pas. Désabonnez-vous depuis l'e-mail le plus récent.",
  },
  mg: {
    poke: {
      subject: (name: string) => `Mitady anao i ${name} 👋`,
      title: (name: string) => `Mitady anao i ${name}!`,
      body: (name: string) => `Miandry anao ao amin'ny Six Frites i ${name}. Avia hiarahaba azy, eo foana ny resakareo.`,
      says: (name: string) => `Hoy i ${name}:`,
      cta: "Sokafy ny resaka",
      why: (name: string) => `Nahazo ity ianao satria nitady anao tao amin'ny Six Frites i ${name}.`,
    },
    inactive: {
      subject: "Malahelo anao ny Six Frites",
      title: "Efa ela tsy nahita anao izahay",
      body: "Efa mihoatra ny iray andro izay tsy nanokafanao ny Six Frites. Mety hajanona ny kaonty tsy ampiasaina, miaraka amin'ny resaka ao aminy. Sokafy ny app mba hitazonana ny anao.",
      cta: "Sokafy ny Six Frites",
      why: "Nahazo ity ianao satria efa ela tsy nampiasaina ny kaontinao.",
    },
    anon: {
      subject: "Mahazoa hafatra tsy fantatra anarana 🎭",
      title: "Miandry anao ny rohinao",
      body: "Zarao amin'ny story, sata na bio-nao ny rohinao, dia afaka mandefa hafatra tsy fantatra anarana aminao ny namanao. Arakaraka ny izarana azy no hahazoanao bebe kokoa!",
      link: "Ny rohinao",
      cta: "Zarao ny rohiko",
      why: "Nahazo ity ianao satria manana rohy tsy fantatra anarana ao amin'ny Six Frites ianao.",
    },
    access: {
      subject: "Afaka mampiasa ny Six Frites manontolo ianao izao 🎉",
      title: "Tongasoa tanteraka!",
      body: "Nomen'ny mpitantana anao ny fidirana feno. Afaka miresaka amin'iza na iza ianao izao, mamoaka story, miditra amin'ny vondrona ary manasa ny namanao.",
      cta: "Sokafy ny Six Frites",
      why: "Nahazo ity ianao satria nohatsaraina ny kaontinao Six Frites.",
    },
    stop: "Tsy te hahazo ireo mailaka ireo intsony?",
    unsubscribe: "Ajanony",
    unsubscribeTitle: "Hajanona ve ny mailaka avy amin'ny Six Frites?",
    unsubscribeBody: "Tsy hahazo fampahatsiahivana na torohevitra amin'ny mailaka intsony ianao. Tsy miova ny kaontinao.",
    unsubscribeDone: "Vita. Tsy hahazo mailaka avy amin'ny Six Frites intsony ianao.",
    badLink: "Tsy mandeha ity rohy ity. Ampiasao ilay ao amin'ny mailaka farany.",
  },
};

export type MailStrings = (typeof strings)["en"];
export const mailStrings = (locale: string | null | undefined): MailStrings => strings[isLocale(locale) ? (locale as Locale) : "en"];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INK = "#3B1F0E";
const MUTED = "#8A6A55";
const ORANGE = "#F2711C";

/** The first letter or digit of a name, for the round badge standing in for a picture. */
const initial = (name: string) => (name.match(/[\p{L}\p{N}]/u)?.[0] ?? "6").toUpperCase();

export interface Layout {
  assets: string;
  lang: string;
  preheader: string;
  /** Drawn above the title: an emoji, or a person's initial on the brand gradient. */
  badge: { emoji: string } | { name: string };
  title: string;
  paragraphs: string[];
  /** A quote in a speech bubble, such as the words someone added to a poke. */
  quote?: { label: string; text: string };
  /** A link shown in a box, to copy. */
  box?: { label: string; text: string };
  cta: { label: string; href: string };
  why: string;
  unsubscribe?: { prompt: string; label: string; href: string };
}

/**
 * A Six Frites email: the logo on a warm background, a white card with the brand's gradient along its top, a big
 * friendly badge, the words, a pill button, and a quiet footer. Tables and inline styles, so it holds up in Gmail
 * and Outlook; gradients fall back to plain orange where they aren't supported.
 */
export function layout(m: Layout) {
  const badge =
    "emoji" in m.badge
      ? `<div style="font-size:44px;line-height:72px;width:72px;height:72px;margin:0 auto;border-radius:36px;background:#FFF1DE;text-align:center">${m.badge.emoji}</div>`
      : `<div style="width:72px;height:72px;margin:0 auto;border-radius:36px;background:${ORANGE};background-image:linear-gradient(135deg,#FFB547,${ORANGE});color:#fff;font:800 32px/72px ${FONT};text-align:center">${esc(initial(m.badge.name))}<span style="display:inline-block;font-size:22px;line-height:1;vertical-align:top;margin:-6px -14px 0 2px">👋</span></div>`;
  const quote = m.quote
    ? `<p style="margin:24px 0 6px;font:600 13px/1.4 ${FONT};color:${MUTED}">${esc(m.quote.label)}</p>
       <div style="margin:0 0 4px;padding:14px 18px;border-radius:20px 20px 20px 6px;background:#FFF1DE;font:500 17px/1.5 ${FONT};color:${INK};white-space:pre-wrap">${esc(m.quote.text)}</div>`
    : "";
  const box = m.box
    ? `<p style="margin:24px 0 6px;font:600 13px/1.4 ${FONT};color:${MUTED}">${esc(m.box.label)}</p>
       <div style="padding:14px 18px;border-radius:16px;border:2px dashed #FFC98A;background:#FFFAF3;font:700 16px/1.4 ${FONT};color:${ORANGE};word-break:break-all">${esc(m.box.text)}</div>`
    : "";
  const unsubscribe = m.unsubscribe
    ? `<br>${esc(m.unsubscribe.prompt)} <a href="${esc(m.unsubscribe.href)}" style="color:${MUTED};text-decoration:underline">${esc(m.unsubscribe.label)}</a>`
    : "";

  return `<!doctype html>
<html lang="${esc(m.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(m.title)}</title>
</head>
<body style="margin:0;padding:0;background:#FFF4E5;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(m.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF4E5">
<tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
    <tr><td align="center" style="padding:0 0 20px">
      <img src="${esc(m.assets)}/icon-192.png" width="56" height="56" alt="Six Frites" style="display:block;border:0;border-radius:14px">
      <div style="margin-top:8px;font:800 20px/1.2 ${FONT};color:${INK};letter-spacing:-0.3px">Six Frites</div>
    </td></tr>
    <tr><td style="background:#ffffff;border-radius:28px;overflow:hidden;box-shadow:0 10px 30px rgba(242,113,28,0.14)">
      <div style="height:6px;background:${ORANGE};background-image:linear-gradient(90deg,#FFB547,${ORANGE},#E63B2E)"></div>
      <div style="padding:36px 32px 32px">
        ${badge}
        <h1 style="margin:20px 0 12px;font:800 26px/1.25 ${FONT};color:${INK};text-align:center;letter-spacing:-0.4px">${esc(m.title)}</h1>
        ${m.paragraphs.map((p) => `<p style="margin:0 0 12px;font:400 16px/1.6 ${FONT};color:#5C4033;text-align:center">${esc(p)}</p>`).join("")}
        ${quote}
        ${box}
        <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:28px auto 4px">
          <tr><td style="border-radius:999px;background:${ORANGE};background-image:linear-gradient(135deg,#FFB547,${ORANGE} 55%,#E63B2E)">
            <a href="${esc(m.cta.href)}" style="display:inline-block;padding:15px 34px;font:700 16px/1 ${FONT};color:#ffffff;text-decoration:none;border-radius:999px">${esc(m.cta.label)}</a>
          </td></tr>
        </table>
      </div>
    </td></tr>
    <tr><td align="center" style="padding:24px 12px 0;font:400 12px/1.6 ${FONT};color:${MUTED}">
      ${esc(m.why)}${unsubscribe}
      <br><span style="color:#C4A48C">Six Frites 🍟</span>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

/** The same email as plain text, for mail apps that don't show HTML. */
export function plain(m: Layout) {
  return [
    m.title,
    "",
    ...m.paragraphs,
    ...(m.quote ? ["", m.quote.label, `"${m.quote.text}"`] : []),
    ...(m.box ? ["", `${m.box.label}: ${m.box.text}`] : []),
    "",
    `${m.cta.label}: ${m.cta.href}`,
    "",
    "--",
    m.why,
    ...(m.unsubscribe ? [`${m.unsubscribe.prompt} ${m.unsubscribe.href}`] : []),
  ].join("\n");
}

/** A small page in the same look, for the unsubscribe link. */
export function page(m: { lang: string; title: string; body: string; button?: string }) {
  const form = m.button
    ? `<form method="post" style="margin:24px 0 0"><button type="submit" style="border:0;cursor:pointer;padding:14px 30px;border-radius:999px;background:${ORANGE};background-image:linear-gradient(135deg,#FFB547,${ORANGE} 55%,#E63B2E);color:#fff;font:700 16px/1 ${FONT}">${esc(m.button)}</button></form>`
    : "";
  return `<!doctype html><html lang="${esc(m.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(m.title)}</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#FFF4E5;font-family:${FONT};padding:16px;box-sizing:border-box">
<main style="max-width:440px;width:100%;background:#fff;border-radius:28px;overflow:hidden;box-shadow:0 10px 30px rgba(242,113,28,0.14);text-align:center">
<div style="height:6px;background-image:linear-gradient(90deg,#FFB547,${ORANGE},#E63B2E)"></div>
<div style="padding:32px 28px"><div style="font-size:44px">🍟</div>
<h1 style="margin:12px 0;font-size:22px;color:${INK}">${esc(m.title)}</h1>
<p style="margin:0;color:#5C4033;line-height:1.6">${esc(m.body)}</p>${form}</div></main></body></html>`;
}
