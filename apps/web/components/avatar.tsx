import type { PublicUser } from "@six/shared";

const sizes = { sm: "size-9 text-sm", md: "size-14 text-xl", lg: "size-20 text-3xl" };

export function Avatar({
  user,
  size = "sm",
  online = false,
}: {
  user: Pick<PublicUser, "displayName" | "avatarUrl">;
  size?: keyof typeof sizes;
  online?: boolean;
}) {
  if (!online) return <Picture user={user} size={size} />;
  return (
    <span className="relative shrink-0">
      <Picture user={user} size={size} />
      <span
        aria-label="Online"
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
  return (
    <div
      className={`${sizes[size]} grid shrink-0 place-items-center rounded-full bg-brand font-semibold text-brand-ink`}
    >
      {user.displayName.slice(0, 1).toUpperCase()}
    </div>
  );
}
