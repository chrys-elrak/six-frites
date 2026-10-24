import type { User } from "@prisma/client";
import { AppError, type UpdateMeInput, type UserDTO } from "@six/shared";
import { prisma } from "../lib/prisma.js";

export function toUserDTO(u: User): UserDTO {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
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
  const user = await prisma.user.update({ where: { id: userId }, data: input });
  return toUserDTO(user);
}
