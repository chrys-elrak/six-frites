import { describe, expect, it } from "vitest";
import { chatHelpers, useApp } from "./helpers.js";

const ctx = useApp();
const { signUp, call } = chatHelpers(ctx);

describe("a group's link", () => {
  it("tells anyone the group's name and picture, and nothing else, without signing in", async () => {
    const owner = await signUp("owner");
    const group = (await call(owner, "POST", "/v1/groups", { title: "Beach crew", nickname: "#CAFE00", maxMembers: 3 })).json();
    const code = (group.group.inviteCode as string).toLowerCase();

    const res = await ctx.app.inject({ method: "GET", url: `/v1/groups/link/${code}` });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({ title: "Beach crew", photoUrl: null });

    expect((await ctx.app.inject({ method: "GET", url: "/v1/groups/link/NOSUCHCODE" })).statusCode).toBe(404);
    expect((await ctx.app.inject({ method: "GET", url: `/v1/groups/join/${code}` })).statusCode).toBe(401);
  });
});
