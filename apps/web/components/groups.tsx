"use client";

import { SixApiError } from "@six/sdk";
import {
  type ChatDTO,
  type ChatMemberDTO,
  type Dict,
  GROUP_MAX_PLACES,
  GROUP_MIN_PLACES,
  MUTE_PRESETS,
  chatFace,
  durationLabel,
  groupClosed,
  randomAlias,
  randomGender,
} from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, LockKeyhole, LogOut, MoreHorizontal, Pencil, RefreshCw, Share2, Shuffle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useGoUp } from "@/lib/back";
import { groupUrl, sendAtLabel, shareGroup } from "@/lib/format";
import {
  createGroup,
  leaveGroup,
  removeGroupMember,
  resetGroupLink,
  setGroupRole,
  updateGroup,
  updateGroupMe,
} from "@/lib/groups";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { Avatar } from "./avatar";
import { Dialog } from "./dialog";
import { ScheduleDialog } from "./scheduled";
import { PhotoPicker } from "./photo-picker";
import { Sheet } from "./sheet";
import { PrimaryButton, Toggle } from "./ui";

const field =
  "w-full rounded-xl bg-stone-100 px-3 py-2.5 text-[16px] outline-none focus:ring-2 focus:ring-brand dark:bg-stone-800";
const label = "block space-y-1.5";
const caption = "text-sm font-medium text-stone-600 dark:text-stone-300";

/** The words for a failed group request, from its error code. */
export function groupError(err: unknown, tr: Dict) {
  const code = err instanceof SixApiError ? err.code : null;
  if (code === "GROUP_FULL") return tr.groups.full;
  if (code === "GROUP_BANNED") return tr.groups.banned;
  if (code === "GROUP_LINK_INVALID") return tr.groups.invalidLink;
  if (code === "NOT_IN_GROUPS") return tr.groups.notInGroups;
  return err instanceof SixApiError ? err.message : tr.common.couldNotSave;
}

function Places({ value, min, onChange }: { value: number | null; min: number; onChange: (n: number | null) => void }) {
  const tr = useT();
  const [text, setText] = useState(String(value ?? ""));
  return (
    <label className={label}>
      <span className={caption}>{tr.groups.places}</span>
      <input
        inputMode="numeric"
        maxLength={2}
        value={text}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "");
          const n = Number(v);
          setText(v);
          onChange(v && n >= min && n <= GROUP_MAX_PLACES ? n : null);
        }}
        aria-invalid={value === null}
        className={`${field} ${value === null ? "ring-2 ring-red-500" : ""}`}
      />
      {value === null ? (
        <span className="block text-xs text-red-600 dark:text-red-400">{tr.groups.placesRange(min, GROUP_MAX_PLACES)}</span>
      ) : (
        <span className="block text-xs text-stone-500">{tr.groups.placesHint(value)}</span>
      )}
    </label>
  );
}

/** The name and photo you show in a group, for creating, joining or changing them. */
export function NicknameFields({
  nickname,
  photo,
  onNickname,
  onPhoto,
}: {
  nickname: string;
  photo: string | null;
  onNickname: (v: string) => void;
  onPhoto: (v: string) => void;
}) {
  const tr = useT();
  const [gender, setGender] = useState(randomGender);
  return (
    <div className="space-y-3">
      <PhotoPicker name={nickname} photo={photo} onChange={onPhoto} kind={gender} ring={nickname} />
      <div className="flex justify-center gap-2">
        {(["female", "male"] as const).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGender(g)}
            aria-pressed={gender === g}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              gender === g ? "bg-brand text-brand-ink" : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
            }`}
          >
            {g === "female" ? tr.groups.girl : tr.groups.boy}
          </button>
        ))}
      </div>
      <div className={label}>
        <span className={caption}>{tr.groups.yourNickname}</span>
        <div className="flex items-center gap-3 rounded-xl bg-stone-100 py-1.5 ps-3 pe-1.5 dark:bg-stone-800">
          <span className="size-4 shrink-0 rounded-full" style={{ backgroundColor: nickname }} />
          <span className="flex-1 font-mono text-[16px] font-semibold">{nickname}</span>
          <button
            type="button"
            onClick={() => onNickname(randomAlias())}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand/10"
          >
            <Shuffle className="size-4" />
            {tr.groups.newName}
          </button>
        </div>
        <span className="block text-xs text-stone-500">{tr.groups.nicknameHint}</span>
      </div>
    </div>
  );
}

function DescriptionField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const tr = useT();
  return (
    <label className={label}>
      <span className={caption}>{tr.groups.description}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={tr.groups.descriptionPlaceholder}
        maxLength={500}
        rows={3}
        className={`${field} resize-none`}
      />
    </label>
  );
}

/** Starts a group with a name, a photo, a number of places and the face you show in it, then opens it. */
export function NewGroupDialog({ onClose }: { onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [places, setPlaces] = useState<number | null>(GROUP_MAX_PLACES);
  const [nickname, setNickname] = useState(randomAlias);
  const [face, setFace] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (places === null) return;
    setSaving(true);
    setError(null);
    try {
      const chat = await createGroup(qc, {
        title: title.trim(),
        ...(description.trim() && { description: description.trim() }),
        maxMembers: places,
        nickname: nickname.trim(),
        ...(photo && { photo }),
        ...(face && { nicknamePhoto: face }),
      });
      onClose();
      router.push(`/chats/${chat.id}?info=1`);
    } catch (err) {
      setError(groupError(err, tr));
      setSaving(false);
    }
  }

  return (
    <Dialog onClose={onClose}>
      <form
        className="space-y-5 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h2 className="text-lg font-semibold">{tr.groups.newGroup}</h2>
        <PhotoPicker name={title} photo={photo} onChange={setPhoto} kind="food" />
        <label className={label}>
          <span className={caption}>{tr.groups.name}</span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={tr.groups.namePlaceholder}
            maxLength={64}
            required
            className={field}
          />
        </label>
        <DescriptionField value={description} onChange={setDescription} />
        <Places value={places} min={GROUP_MIN_PLACES} onChange={setPlaces} />
        <hr className="border-black/5 dark:border-white/10" />
        <NicknameFields nickname={nickname} photo={face} onNickname={setNickname} onPhoto={setFace} />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <PrimaryButton type="submit" disabled={saving || !title.trim() || !nickname.trim() || places === null} className="w-full">
          {saving ? tr.common.saving : tr.groups.create}
        </PrimaryButton>
      </form>
    </Dialog>
  );
}

function EditGroupDialog({ chat, onClose }: { chat: ChatDTO; onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const [title, setTitle] = useState(chat.title);
  const [description, setDescription] = useState(chat.group!.description ?? "");
  const [photo, setPhoto] = useState<string | null>(null);
  const [places, setPlaces] = useState<number | null>(chat.group!.maxMembers);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const descriptionChanged = description.trim() !== (chat.group!.description ?? "");

  async function save() {
    if (places === null) return;
    setSaving(true);
    setError(null);
    try {
      await updateGroup(qc, chat.id, {
        ...(title.trim() !== chat.title && { title: title.trim() }),
        ...(descriptionChanged && { description: description.trim() }),
        ...(photo && { photo }),
        ...(places !== chat.group!.maxMembers && { maxMembers: places }),
      });
      onClose();
    } catch (err) {
      setError(groupError(err, tr));
      setSaving(false);
    }
  }

  const changed = title.trim() !== chat.title || descriptionChanged || !!photo || places !== chat.group!.maxMembers;
  return (
    <Dialog onClose={onClose}>
      <form
        className="space-y-5 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h2 className="text-lg font-semibold">{tr.groups.edit}</h2>
        <PhotoPicker name={title} photo={photo ?? chat.group!.photoUrl} onChange={setPhoto} kind="food" />
        <label className={label}>
          <span className={caption}>{tr.groups.name}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={64} required className={field} />
        </label>
        <DescriptionField value={description} onChange={setDescription} />
        <Places value={places} min={Math.max(GROUP_MIN_PLACES, chat.members.length)} onChange={setPlaces} />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <PrimaryButton type="submit" disabled={saving || !title.trim() || !changed || places === null} className="w-full">
          {saving ? tr.common.saving : tr.common.save}
        </PrimaryButton>
      </form>
    </Dialog>
  );
}

function EditMeDialog({ chat, me, onClose }: { chat: ChatDTO; me: ChatMemberDTO; onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const [nickname, setNickname] = useState(me.user.displayName);
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updateGroupMe(qc, chat.id, {
        ...(nickname.trim() !== me.user.displayName && { nickname: nickname.trim() }),
        ...(photo && { photo }),
      });
      onClose();
    } catch (err) {
      setError(groupError(err, tr));
      setSaving(false);
    }
  }

  return (
    <Dialog onClose={onClose}>
      <form
        className="space-y-5 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <NicknameFields nickname={nickname} photo={photo ?? me.user.avatarUrl} onNickname={setNickname} onPhoto={setPhoto} />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <PrimaryButton
          type="submit"
          disabled={saving || !nickname.trim() || (nickname.trim() === me.user.displayName && !photo)}
          className="w-full"
        >
          {saving ? tr.common.saving : tr.common.save}
        </PrimaryButton>
      </form>
    </Dialog>
  );
}

type View = "info" | "edit" | "me" | "reset" | "leave" | "close" | "closeAt" | { member: ChatMemberDTO } | { removing: ChatMemberDTO };

/** Everything about a group: its link, its members and what you may do with them, and the way out. */
export function GroupInfo({ chat, onClose }: { chat: ChatDTO; onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const goUp = useGoUp();
  const meId = useSession((s) => s.user!.id);
  const [view, setView] = useState<View>("info");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const group = chat.group!;
  const me = chat.members.find((m) => m.user.id === meId)!;
  const admin = group.myRole !== "member";
  const canManage = (m: ChatMemberDTO) =>
    m.user.id !== meId && (group.myRole === "owner" || (group.myRole === "admin" && m.role === "member"));
  const run = (work: Promise<unknown>) => void work.catch((err) => setError(groupError(err, tr)));

  if (view === "edit") return <EditGroupDialog chat={chat} onClose={() => setView("info")} />;
  if (view === "me") return <EditMeDialog chat={chat} me={me} onClose={() => setView("info")} />;
  if (view === "reset") {
    return (
      <Sheet
        title={tr.groups.resetConfirm}
        onClose={() => setView("info")}
        actions={[{ label: tr.groups.resetLink, destructive: true, onSelect: () => run(resetGroupLink(qc, chat.id)) }]}
      />
    );
  }
  if (view === "leave") {
    return (
      <Sheet
        title={group.myRole === "owner" && chat.members.length > 1 ? `${tr.groups.leaveConfirm} ${tr.groups.leaveOwner}` : tr.groups.leaveConfirm}
        onClose={() => setView("info")}
        actions={[
          {
            label: tr.groups.leave,
            destructive: true,
            onSelect: () =>
              run(
                leaveGroup(qc, chat.id).then(() => {
                  onClose();
                  goUp("/");
                }),
              ),
          },
        ]}
      />
    );
  }
  if (view === "close") {
    const close = (secs: number) => run(updateGroup(qc, chat.id, { closeForSecs: secs }));
    return (
      <Sheet
        title={tr.groups.closeGroup}
        onClose={() => setView("info")}
        actions={[
          ...MUTE_PRESETS.map((p) => ({ label: tr.groups.closeFor(durationLabel(p.secs, tr)), onSelect: () => close(p.secs) })),
          { label: tr.groups.closeUntil, keepOpen: true, onSelect: () => setView("closeAt") },
        ]}
      />
    );
  }
  if (view === "closeAt") {
    return (
      <ScheduleDialog
        title={tr.groups.closeGroup}
        onPick={(at) => {
          run(updateGroup(qc, chat.id, { closeForSecs: Math.max(60, Math.round((at.getTime() - Date.now()) / 1000)) }));
          setView("info");
        }}
        onClose={() => setView("info")}
      />
    );
  }
  if (typeof view === "object" && "removing" in view) {
    return (
      <Sheet
        title={tr.groups.removeConfirm(view.removing.user.displayName)}
        onClose={() => setView("info")}
        actions={[
          { label: tr.groups.remove, destructive: true, onSelect: () => run(removeGroupMember(chat.id, view.removing.user.id)) },
        ]}
      />
    );
  }
  if (typeof view === "object") {
    const m = view.member;
    return (
      <Sheet
        title={m.user.displayName}
        onClose={() => setView("info")}
        actions={[
          ...(group.myRole === "owner"
            ? [
                m.role === "admin"
                  ? { label: tr.groups.dismissAdmin, onSelect: () => run(setGroupRole(qc, chat.id, m.user.id, { role: "member" })) }
                  : { label: tr.groups.makeAdmin, onSelect: () => run(setGroupRole(qc, chat.id, m.user.id, { role: "admin" })) },
              ]
            : []),
          { label: tr.groups.remove, destructive: true, keepOpen: true, onSelect: () => setView({ removing: m }) },
        ]}
      />
    );
  }

  const code = group.inviteCode;
  const link = code ? groupUrl(code) : "";
  const roleBadge = (m: ChatMemberDTO) =>
    m.role !== "member" && (
      <span className="shrink-0 rounded-full bg-brand/15 px-1.5 py-px text-[10px] font-bold tracking-wide text-brand uppercase">
        {m.role === "owner" ? tr.groups.owner : tr.groups.admin}
      </span>
    );
  const pill = "flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/70 px-3 py-2 text-sm font-medium dark:bg-stone-800";

  return (
    <Dialog onClose={onClose}>
      <div className="space-y-5 p-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <Avatar user={chatFace(chat, meId)} size="xl" />
          <div className="flex items-center gap-1">
            <h2 className="text-xl font-semibold break-words">{chat.title}</h2>
            {admin && (
              <button onClick={() => setView("edit")} aria-label={tr.groups.edit} className="grid size-8 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10">
                <Pencil className="size-4" />
              </button>
            )}
          </div>
          <p className="text-sm text-stone-500">{tr.groups.membersOf(chat.members.length, group.maxMembers)}</p>
          {group.description && <p className="text-sm whitespace-pre-line break-words">{group.description}</p>}
        </div>

        {code && (
          <section className="space-y-2 rounded-2xl bg-stone-100 p-3 dark:bg-stone-800/60">
            <h3 className="text-sm font-semibold">{tr.groups.inviteLink}</h3>
            <p className="truncate font-mono text-sm text-stone-600 dark:text-stone-300">{link}</p>
            <p className="text-xs text-stone-500">{tr.groups.inviteHint}</p>
            <div className="flex gap-2">
              <button
                className={pill}
                onClick={() =>
                  void navigator.clipboard.writeText(link).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  })
                }
              >
                <Copy className="size-4" /> {copied ? tr.common.copied : tr.common.copyLink}
              </button>
              <button className={pill} onClick={() => code && void shareGroup(chat.title, code)}>
                <Share2 className="size-4" /> {tr.common.share}
              </button>
              {admin && (
                <button className={`${pill} flex-none`} onClick={() => setView("reset")} aria-label={tr.groups.resetLink} title={tr.groups.resetLink}>
                  <RefreshCw className="size-4" />
                </button>
              )}
            </div>
          </section>
        )}

        {admin && (
          <section className="overflow-hidden rounded-2xl bg-stone-100 dark:bg-stone-800/60">
            <Toggle
              label={tr.groups.membersCanWrite}
              hint={tr.groups.membersCanWriteHint}
              checked={group.membersCanWrite}
              onChange={(on) => run(updateGroup(qc, chat.id, { membersCanWrite: on }))}
            />
            <Toggle
              label={tr.groups.membersCanInvite}
              hint={tr.groups.membersCanInviteHint}
              checked={group.membersCanInvite}
              onChange={(on) => run(updateGroup(qc, chat.id, { membersCanInvite: on }))}
            />
            {group.membersCanWrite && (
              <button
                type="button"
                onClick={() => (groupClosed(group) ? run(updateGroup(qc, chat.id, { closeForSecs: null })) : setView("close"))}
                className="flex w-full items-center gap-3 border-t border-black/5 px-4 py-3 text-left hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
              >
                <LockKeyhole className="size-5 shrink-0 text-stone-500" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{groupClosed(group) ? tr.groups.reopen : tr.groups.closeGroup}</span>
                  <span className="block text-xs text-stone-500">
                    {groupClosed(group) ? tr.groups.closedUntil(sendAtLabel(group.closedUntil!)) : tr.groups.closeGroupHint}
                  </span>
                </span>
              </button>
            )}
          </section>
        )}

        <section>
          <h3 className="mb-1 text-sm font-semibold">{tr.groups.members(chat.members.length)}</h3>
          {chat.members.map((m) => (
            <div key={m.user.id} className="flex items-center gap-3 py-1.5">
              <Avatar user={m.user} />
              <span className="min-w-0 flex-1 truncate">{m.user.id === meId ? `${m.user.displayName} (${tr.common.you})` : m.user.displayName}</span>
              {roleBadge(m)}
              {m.user.id === meId ? (
                <button onClick={() => setView("me")} aria-label={tr.common.edit} className="grid size-8 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10">
                  <Pencil className="size-4" />
                </button>
              ) : canManage(m) ? (
                <button onClick={() => setView({ member: m })} aria-label={m.user.displayName} className="grid size-8 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10">
                  <MoreHorizontal className="size-4" />
                </button>
              ) : null}
            </div>
          ))}
        </section>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button
          onClick={() => setView("leave")}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
        >
          <LogOut className="size-4" /> {tr.groups.leave}
        </button>
      </div>
    </Dialog>
  );
}
