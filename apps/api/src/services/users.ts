import type { User } from "../generated/prisma/client.js";
import { AppError, type UpdateMeInput, type UserDTO } from "@six/shared";
import { generateCode, isUniqueViolation } from "../lib/codes.js";
import { prisma } from "../lib/prisma.js";

const RESERVED_USERNAMES = new Set(["admin", "support", "help", "system", "root", "six", "sixfrites", "official"]);

export function toUserDTO(u: User): UserDTO {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    username: u.username,
    contactCode: u.contactCode,
    findByEmail: u.findByEmail,
    createdAt: u.createdAt.toISOString(),
  };
}

export function toPublicUser(u: Pick<User, "id" | "displayName" | "avatarUrl">) {
  return { id: u.id, displayName: u.displayName, avatarUrl: u.avatarUrl };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("USER_NOT_FOUND");
  return toUserDTO(user);
}

export async function updateMe(userId: string, input: UpdateMeInput) {
  if (input.username && RESERVED_USERNAMES.has(input.username)) throw new AppError("USERNAME_TAKEN");
  try {
    const user = await prisma.user.update({ where: { id: userId }, data: input });
    return toUserDTO(user);
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError("USERNAME_TAKEN");
    throw err;
  }
}

/** Replaces the user's contact code, so the old code, link and QR stop working. */
export async function resetContactCode(userId: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return toUserDTO(await prisma.user.update({ where: { id: userId }, data: { contactCode: generateCode() } }));
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new AppError("CONFLICT", "Could not generate a unique contact code");
}
