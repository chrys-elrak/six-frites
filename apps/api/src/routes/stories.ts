import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { CreateStoryInput, Id, NoteDTO, NoteViewerDTO, NotesDTO, ReactStoryInput, SetNoteInput, StoryDTO, StoryGroupDTO, StoryViewerDTO } from "@six/shared";
import {
  createStory,
  deleteNote,
  deleteStory,
  listNoteViewers,
  listNotes,
  listStories,
  listStoryViewers,
  markNoteViewed,
  markStoryViewed,
  reactToStory,
  setNote,
} from "../services/stories.js";

const security = [{ bearer: [] }];
const Params = z.object({ id: Id });

const storyRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", app.requireAuth);

  app.get(
    "/stories",
    {
      schema: {
        tags: ["stories"],
        summary: "Stories that are up: yours first, then your contacts', unopened ones first",
        description: "Listen for `stories:changed` on the socket to know when to fetch them again.",
        security,
        response: { 200: z.object({ items: z.array(StoryGroupDTO) }) },
      },
    },
    (req) => listStories(req.auth.userId),
  );

  app.get(
    "/notes",
    {
      schema: {
        tags: ["stories"],
        summary: "Your note and your contacts' notes that are up",
        description: "Notes change with stories: fetch them again on `stories:changed`. Answer one by sending a message with its id as `storyId`.",
        security,
        response: { 200: NotesDTO },
      },
    },
    (req) => listNotes(req.auth.userId),
  );

  app.put(
    "/notes",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        tags: ["stories"],
        summary: "Leave a note for your contacts",
        description: "It shows above your picture for a day, or as long as `durationSecs` says, and replaces the one you had.",
        security,
        body: SetNoteInput,
        response: { 200: NoteDTO },
      },
    },
    (req) => setNote(req.auth.userId, req.body),
  );

  app.post(
    "/notes/:id/view",
    {
      schema: { tags: ["stories"], summary: "Mark a contact's note as opened", security, params: Params, response: { 204: z.null() } },
    },
    async (req, reply) => {
      await markNoteViewed(req.auth.userId, req.params.id);
      return reply.status(204).send(null);
    },
  );

  app.get(
    "/notes/viewers",
    {
      schema: {
        tags: ["stories"],
        summary: "Who opened the note you have up, latest first",
        security,
        response: { 200: z.object({ items: z.array(NoteViewerDTO) }) },
      },
    },
    (req) => listNoteViewers(req.auth.userId),
  );

  app.delete(
    "/notes",
    { schema: { tags: ["stories"], summary: "Take your note down", security, response: { 204: z.null() } } },
    async (req, reply) => {
      await deleteNote(req.auth.userId);
      return reply.status(204).send(null);
    },
  );

  app.post(
    "/stories",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        tags: ["stories"],
        summary: "Post a story to your contacts",
        description:
          "Text on a colour, or a photo or video (at most 30 seconds) uploaded first with kind `image` or `video`, unencrypted. A photo or video only shows to others once it is processed.",
        security,
        body: CreateStoryInput,
        response: { 201: StoryDTO },
      },
    },
    async (req, reply) => reply.status(201).send(await createStory(req.auth.userId, req.body)),
  );

  app.delete(
    "/stories/:id",
    {
      schema: { tags: ["stories"], summary: "Take down one of your stories", security, params: Params, response: { 204: z.null() } },
    },
    async (req, reply) => {
      await deleteStory(req.auth.userId, req.params.id);
      return reply.status(204).send(null);
    },
  );

  app.post(
    "/stories/:id/view",
    {
      schema: { tags: ["stories"], summary: "Mark a contact's story as opened", security, params: Params, response: { 204: z.null() } },
    },
    async (req, reply) => {
      await markStoryViewed(req.auth.userId, req.params.id);
      return reply.status(204).send(null);
    },
  );

  app.post(
    "/stories/:id/react",
    {
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
      schema: {
        tags: ["stories"],
        summary: "React to a contact's story with an emoji",
        description: "Only the poster sees it, in who opened the story. It is not sent as a message; reacting again replaces it.",
        security,
        params: Params,
        body: ReactStoryInput,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await reactToStory(req.auth.userId, req.params.id, req.body.emoji);
      return reply.status(204).send(null);
    },
  );

  app.get(
    "/stories/:id/viewers",
    {
      schema: {
        tags: ["stories"],
        summary: "Who opened one of your stories, latest first",
        security,
        params: Params,
        response: { 200: z.object({ items: z.array(StoryViewerDTO) }) },
      },
    },
    (req) => listStoryViewers(req.auth.userId, req.params.id),
  );
};

export default storyRoutes;
