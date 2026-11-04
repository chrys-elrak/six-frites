import { aliasAvatar, type PublicUser } from "@six/shared";
import { useT } from "@/lib/i18n";

const sizes = { sm: "size-9", md: "size-14", lg: "size-20", xl: "size-28" };
const letters = { sm: "text-sm", md: "text-xl", lg: "text-3xl", xl: "text-5xl" };
const foods = { sm: "text-xl", md: "text-3xl", lg: "text-5xl", xl: "text-6xl" };

export function Avatar({
  user,
  size = "sm",
  online = false,
}: {
  user: Pick<PublicUser, "displayName" | "avatarUrl">;
  size?: keyof typeof sizes;
  online?: boolean;
}) {
  const tr = useT();
  if (!online) return <Picture user={user} size={size} />;
  return (
    <span className="relative flex shrink-0">
      <Picture user={user} size={size} />
      <span
        aria-label={tr.time.online}
        className={`absolute right-0 bottom-0 rounded-full bg-green-500 ring-2 ring-stone-50 dark:ring-stone-950 ${
          size === "sm" ? "size-2.5" : "size-3.5"
        }`}
      />
    </span>
  );
}

function Picture({ user, size }: { user: Pick<PublicUser, "displayName" | "avatarUrl">; size: keyof typeof sizes }) {
  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt=""
        referrerPolicy="no-referrer"
        className={`${sizes[size]} shrink-0 rounded-full object-cover`}
      />
    );
  }
  const alias = aliasAvatar(user.displayName);
  if (alias) {
    return (
      <div
        style={{ backgroundImage: alias.gradient }}
        className={`${sizes[size]} ${foods[size]} grid shrink-0 place-items-center rounded-full leading-none select-none`}
      >
        {alias.food}
      </div>
    );
  }
  return (
    <div
      className={`${sizes[size]} ${letters[size]} grid shrink-0 place-items-center rounded-full bg-brand font-semibold text-brand-ink`}
    >
      {user.displayName.slice(0, 1).toUpperCase()}
    </div>
  );
}
