import { unwrap } from "@six/sdk";
import type { CreateGroupInput, JoinGroupInput, SetGroupRoleInput, UpdateContactInput, UpdateGroupInput, UpdateGroupMeInput } from "@six/shared";
import type { QueryClient } from "@tanstack/react-query";
import { removeChat, upsertChat } from "./chats";
import { six } from "./six";

const path = (id: string) => ({ params: { path: { id } } });

export async function createGroup(qc: QueryClient, body: CreateGroupInput) {
  const chat = unwrap(await six.api.POST("/v1/groups", { body }));
  upsertChat(qc, chat);
  return chat;
}

export async function joinGroup(qc: QueryClient, code: string, body: JoinGroupInput) {
  const chat = unwrap(await six.api.POST("/v1/groups/join/{code}", { params: { path: { code } }, body }));
  upsertChat(qc, chat);
  return chat;
}

export async function updateGroup(qc: QueryClient, id: string, body: UpdateGroupInput) {
  upsertChat(qc, unwrap(await six.api.PATCH("/v1/groups/{id}", { ...path(id), body })));
}

export async function updateGroupMe(qc: QueryClient, id: string, body: UpdateGroupMeInput) {
  upsertChat(qc, unwrap(await six.api.PATCH("/v1/groups/{id}/me", { ...path(id), body })));
}

export async function resetGroupLink(qc: QueryClient, id: string) {
  upsertChat(qc, unwrap(await six.api.POST("/v1/groups/{id}/link", path(id))));
}

export async function setGroupRole(qc: QueryClient, id: string, userId: string, body: SetGroupRoleInput) {
  upsertChat(qc, unwrap(await six.api.PATCH("/v1/groups/{id}/members/{userId}", { params: { path: { id, userId } }, body })));
}

export async function removeGroupMember(id: string, userId: string) {
  unwrap(await six.api.DELETE("/v1/groups/{id}/members/{userId}", { params: { path: { id, userId } } }));
}

export async function leaveGroup(qc: QueryClient, id: string) {
  unwrap(await six.api.POST("/v1/groups/{id}/leave", path(id)));
  removeChat(qc, id);
}

/** Gives another member a name and photo only I see; it shows in every chat we share, so they all reload. */
export async function nameGroupMember(qc: QueryClient, id: string, userId: string, body: UpdateContactInput) {
  upsertChat(qc, unwrap(await six.api.PATCH("/v1/groups/{id}/members/{userId}/name", { params: { path: { id, userId } }, body })));
  void qc.invalidateQueries({ queryKey: ["chat"] });
  void qc.invalidateQueries({ queryKey: ["chats"] });
  void qc.invalidateQueries({ queryKey: ["contacts"] });
}
