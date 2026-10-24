import type { PublicUser } from "@six/shared";

const sizes = { sm: "size-9 text-sm", md: "size-14 text-xl", lg: "size-20 text-3xl" };

export function Avatar({
  user,
  size = "sm",
}: {
  user: Pick<PublicUser, "displayName" | "avatarUrl">;
  size?: keyof typeof sizes;
}) {
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
