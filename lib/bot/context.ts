import type { Context } from "grammy";
import type { AppUser } from "@/lib/auth/user";

/** grammY context + the current user (with memberships and linked student), set by middleware. */
export type BotContext = Context & { appUser: AppUser };
