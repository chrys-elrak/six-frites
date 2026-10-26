export type DurationUnit = "year" | "month" | "week" | "day" | "hour" | "minute" | "second";

const frUnits: Record<DurationUnit, [string, string]> = {
  year: ["an", "ans"],
  month: ["mois", "mois"],
  week: ["semaine", "semaines"],
  day: ["jour", "jours"],
  hour: ["heure", "heures"],
  minute: ["minute", "minutes"],
  second: ["seconde", "secondes"],
};

const mgUnits: Record<DurationUnit, string> = {
  year: "taona",
  month: "volana",
  week: "herinandro",
  day: "andro",
  hour: "ora",
  minute: "minitra",
  second: "segondra",
};

const en = {
  justNow: "just now",
  minAgo: (n: number) => `${n} min ago`,
  hoursAgo: (n: number) => `${n} h ago`,
  today: "Today",
  yesterday: "Yesterday",
  tomorrow: "Tomorrow",
  dayAt: (day: string, time: string) => `${day} at ${time}`,
  online: "online",
  lastSeenLongAgo: "last seen a long time ago",
  lastSeenJustNow: "last seen just now",
  lastSeenMinAgo: (n: number) => `last seen ${n} min ago`,
  lastSeenTodayAt: (time: string) => `last seen today at ${time}`,
  lastSeenYesterdayAt: (time: string) => `last seen yesterday at ${time}`,
  lastSeenDayAt: (day: string, time: string) => `last seen ${day} at ${time}`,
  lastSeenOn: (date: string) => `last seen ${date}`,
  duration: (n: number, unit: DurationUnit) => `${n} ${unit}${n === 1 ? "" : "s"}`,
  bytes: ["B", "KB", "MB", "GB"],
};

const fr: typeof en = {
  justNow: "à l'instant",
  minAgo: (n) => `il y a ${n} min`,
  hoursAgo: (n) => `il y a ${n} h`,
  today: "Aujourd'hui",
  yesterday: "Hier",
  tomorrow: "Demain",
  dayAt: (day, time) => `${day} à ${time}`,
  online: "en ligne",
  lastSeenLongAgo: "vu(e) il y a longtemps",
  lastSeenJustNow: "vu(e) à l'instant",
  lastSeenMinAgo: (n) => `vu(e) il y a ${n} min`,
  lastSeenTodayAt: (time) => `vu(e) aujourd'hui à ${time}`,
  lastSeenYesterdayAt: (time) => `vu(e) hier à ${time}`,
  lastSeenDayAt: (day, time) => `vu(e) ${day} à ${time}`,
  lastSeenOn: (date) => `vu(e) le ${date}`,
  duration: (n, unit) => `${n} ${frUnits[unit][n > 1 ? 1 : 0]}`,
  bytes: ["o", "Ko", "Mo", "Go"],
};

const mg: typeof en = {
  justNow: "izao vao izao",
  minAgo: (n) => `${n} min lasa izay`,
  hoursAgo: (n) => `${n} ora lasa izay`,
  today: "Androany",
  yesterday: "Omaly",
  tomorrow: "Rahampitso",
  dayAt: (day, time) => `${day} amin'ny ${time}`,
  online: "an-tserasera",
  lastSeenLongAgo: "efa ela no hita farany",
  lastSeenJustNow: "hita farany izao vao izao",
  lastSeenMinAgo: (n) => `hita farany ${n} min lasa izay`,
  lastSeenTodayAt: (time) => `hita farany androany tamin'ny ${time}`,
  lastSeenYesterdayAt: (time) => `hita farany omaly tamin'ny ${time}`,
  lastSeenDayAt: (day, time) => `hita farany ny ${day} tamin'ny ${time}`,
  lastSeenOn: (date) => `hita farany ny ${date}`,
  duration: (n, unit) => `${n} ${mgUnits[unit]}`,
  bytes: ["o", "Ko", "Mo", "Go"],
};

export default { en, fr, mg };
