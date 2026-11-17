// Account fields shared by self sign-up (/register) and accounts an admin creates on the Pengguna page.
import { z } from "zod";
import { PLAN_IDS } from "./plans";

export const accountFields = {
  name: z.string().trim().min(2, "Nama minimal 2 karakter").max(80),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_.]{3,30}$/, "Username 3–30 karakter: huruf kecil, angka, titik, atau garis bawah"),
  password: z.string().min(8, "Kata sandi minimal 8 karakter").max(200),
};

/** Roles an admin may create from the panel; new admins are still made by hand. */
export const CREATABLE_ROLES = ["user", "viewer"] as const;

/**
 * An account made by an admin. A "user" is either a client's main account (it holds the plan) or, with parentId, a
 * sub-account of one (it follows that plan). Viewers see everything read-only and have neither a plan nor a parent.
 */
export const newAccountSchema = z.object({
  ...accountFields,
  role: z.enum(CREATABLE_ROLES),
  parentId: z.string().uuid().nullable().default(null),
  plan: z.enum(PLAN_IDS).nullable().default(null),
  /** YYYY-MM-DD, end of that day in Jakarta; null = no end date. */
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  /** Demo account: billing hidden (main accounts only; sub-accounts follow their main account). */
  demo: z.boolean().default(false),
}).refine((a) => a.role === "user" || !a.parentId, { message: "Akun viewer tidak bisa menjadi anggota klien", path: ["parentId"] })
  .transform((a) => a.role === "user" && !a.parentId ? a : { ...a, plan: null, expiresAt: null, demo: false }); // only a main account holds a plan

export type NewAccount = z.infer<typeof newAccountSchema>;
