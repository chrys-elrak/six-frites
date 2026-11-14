import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  ChatDTO,
  CreateGroupInput,
  GroupLinkPreviewDTO,
  GroupPreviewDTO,
  Id,
  JoinGroupInput,
  SetGroupRoleInput,
  UpdateContactInput,
  UpdateGroupInput,
  UpdateGroupMeInput,
} from "@six/shared";
import {
  createGroup,
  groupLinkPreview,
  joinGroup,
  leaveGroup,
  nameGroupMember,
  previewGroup,
  removeGroupMember,
  resetGroupLink,
  setGroupRole,
  updateGroup,
  updateGroupMe,
} from "../services/groups.js";

const security = [{ bearer: [] }];
const GroupParams = z.object({ id: Id });
const MemberParams = z.object({ id: Id, userId: Id });
const CodeParams = z.object({ code: z.string().regex(/^[A-Za-z0-9]{4,32}$/) });
const tags = ["groups"];

const groupRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", app.requireAuth);

  app.post(
    "/groups",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 hour" } },
      schema: {
        tags,
        summary: "Create a group",
        description: "You are its owner and only member until people open its link; nobody can be added any other way.",
        security,
        body: CreateGroupInput,
        response: { 200: ChatDTO },
      },
    },
    (req) => createGroup(req.auth.userId, req.body),
  );

  app.get(
    "/groups/join/:code",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        tags,
        summary: "What the group behind a link looks like, before joining",
        security,
        params: CodeParams,
        response: { 200: GroupPreviewDTO },
      },
    },
    (req) => previewGroup(req.auth.userId, req.params.code),
  );

  app.post(
    "/groups/join/:code",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags,
        summary: "Join the group behind a link",
        description:
          "Fails with GROUP_FULL when every place is taken and GROUP_BANNED for someone removed from it. You only see messages sent from now on. Joining a group you're in returns it.",
        security,
        params: CodeParams,
        body: JoinGroupInput,
        response: { 200: ChatDTO },
      },
    },
    (req) => joinGroup(req.auth.userId, req.params.code, req.body),
  );

  app.patch(
    "/groups/:id",
    {
      schema: {
        tags,
        summary: "Rename a group, change its photo or its number of places",
        description: "Admins only. The places can't go below the number of members.",
        security,
        params: GroupParams,
        body: UpdateGroupInput,
        response: { 200: ChatDTO },
      },
    },
    (req) => updateGroup(req.auth.userId, req.params.id, req.body),
  );

  app.post(
    "/groups/:id/link",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags,
        summary: "Give a group a new link",
        description: "Admins only. The old link stops working; members stay.",
        security,
        params: GroupParams,
        response: { 200: ChatDTO },
      },
    },
    (req) => resetGroupLink(req.auth.userId, req.params.id),
  );

  app.patch(
    "/groups/:id/me",
    {
      schema: {
        tags,
        summary: "Change the name or photo you show in a group",
        security,
        params: GroupParams,
        body: UpdateGroupMeInput,
        response: { 200: ChatDTO },
      },
    },
    (req) => updateGroupMe(req.auth.userId, req.params.id, req.body),
  );

  app.patch(
    "/groups/:id/members/:userId",
    {
      schema: {
        tags,
        summary: "Make a member an admin, or an admin a member again",
        description: "Only the owner can.",
        security,
        params: MemberParams,
        body: SetGroupRoleInput,
        response: { 200: ChatDTO },
      },
    },
    (req) => setGroupRole(req.auth.userId, req.params.id, req.params.userId, req.body),
  );

  app.patch(
    "/groups/:id/members/:userId/name",
    {
      schema: {
        tags,
        summary: "Give a member a name and photo only you see",
        description:
          "The same as a contact's own name and photo (PATCH /v1/contacts/{userId}), for anyone in the group: it shows in every chat you share with them. Null clears it.",
        security,
        params: MemberParams,
        body: UpdateContactInput,
        response: { 200: ChatDTO },
      },
    },
    (req) => nameGroupMember(req.auth.userId, req.params.id, req.params.userId, req.body),
  );

  app.delete(
    "/groups/:id/members/:userId",
    {
      schema: {
        tags,
        summary: "Remove someone from a group",
        description: "Admins remove members; only the owner removes admins. They can't come back through the link.",
        security,
        params: MemberParams,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await removeGroupMember(req.auth.userId, req.params.id, req.params.userId);
      return reply.status(204).send(null);
    },
  );

  app.post(
    "/groups/:id/leave",
    {
      schema: {
        tags,
        summary: "Leave a group",
        description:
          "An owner who leaves hands the group to the longest-serving admin, or else the longest-serving member. The last one out deletes it.",
        security,
        params: GroupParams,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await leaveGroup(req.auth.userId, req.params.id);
      return reply.status(204).send(null);
    },
  );
};

/** The one group route open to anyone: what a link's preview may show. */
export const groupLinkRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/groups/link/:code",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        tags,
        summary: "Public name and picture of the group behind a link (no auth)",
        params: CodeParams,
        response: { 200: GroupLinkPreviewDTO },
      },
    },
    (req) => groupLinkPreview(req.params.code),
  );
};

export default groupRoutes;
