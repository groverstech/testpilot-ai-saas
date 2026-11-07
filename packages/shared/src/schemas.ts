import { z } from "zod";
import { ROLES } from "./rbac";
import { VIEWPORT_IDS } from "./viewports";

/** Request validation schemas shared by the API (enforcement) and web app (form UX). */

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128, "Password must be at most 128 characters")
  .refine((v) => /[a-zA-Z]/.test(v) && /[0-9]/.test(v), "Password must contain letters and numbers");

export const nameSchema = z.string().trim().min(1, "Name is required").max(100);

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required").max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const tokenSchema = z.object({ token: z.string().min(20).max(200) });

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export const updateProfileSchema = z.object({
  name: nameSchema.optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens");

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, "Organization name must be at least 2 characters").max(80),
  slug: slugSchema.optional(),
});

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  slug: slugSchema.optional(),
});

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(60),
});

export const roleSchema = z.enum(ROLES);

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: roleSchema,
});

export const updateMemberSchema = z.object({ role: roleSchema });

/** Application URL under test. Only http(s); further SSRF checks happen in url-safety.ts. */
export const appUrlSchema = z
  .string()
  .trim()
  .url("Enter a valid URL, including https://")
  .max(2048)
  .refine((v) => /^https?:\/\//i.test(v), "Only http:// and https:// URLs are supported");

export const branchNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^(?!\/|.*\/\/|.*\.\.|.*\/$)[A-Za-z0-9._/-]+$/, "Invalid branch name");

export const testSettingsSchema = z.object({
  viewports: z.array(z.enum(VIEWPORT_IDS)).min(1).default(["desktop", "mobile-390"]),
  categories: z
    .array(z.enum(["FUNCTIONAL", "UI_UX", "NEGATIVE", "ACCESSIBILITY", "PERFORMANCE", "RESPONSIVE"]))
    .min(1)
    .default(["FUNCTIONAL", "UI_UX", "NEGATIVE", "ACCESSIBILITY"]),
  maxPages: z.number().int().min(1).max(500).default(25),
  testTimeoutSeconds: z.number().int().min(5).max(600).default(60),
  recordVideo: z.boolean().default(true),
  runOnPush: z.boolean().default(false),
  runOnPullRequest: z.boolean().default(false),
});
export type TestSettings = z.infer<typeof testSettingsSchema>;
export const DEFAULT_TEST_SETTINGS: TestSettings = testSettingsSchema.parse({});

export const createProjectSchema = z.object({
  name: z.string().trim().min(2, "Project name must be at least 2 characters").max(80),
  description: z.string().trim().max(500).optional().nullable(),
  appUrl: appUrlSchema.optional().nullable(),
  defaultBranch: branchNameSchema.optional().nullable(),
  workspaceId: z.string().uuid().optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  appUrl: appUrlSchema.optional().nullable(),
  defaultBranch: branchNameSchema.optional().nullable(),
  testSettings: testSettingsSchema.partial().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
});
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

/** POSIX-style env var names; reserved/dangerous names are rejected. */
const RESERVED_ENV_KEYS = new Set([
  "PATH",
  "HOME",
  "NODE_OPTIONS",
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
  "DYLD_INSERT_LIBRARIES",
  "SHELL",
  "USER",
]);

export const envVarKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Use letters, numbers and underscores; must not start with a number")
  .refine((k) => !RESERVED_ENV_KEYS.has(k.toUpperCase()), "This variable name is reserved");

export const upsertSecretSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ENV_VAR"),
    key: envVarKeySchema,
    value: z.string().max(8192),
    description: z.string().trim().max(200).optional().nullable(),
  }),
  z.object({
    kind: z.literal("TEST_CREDENTIAL"),
    key: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9 _.-]+$/, "Use letters, numbers, spaces, dots, dashes and underscores"),
    value: z.string().max(8192),
    description: z.string().trim().max(200).optional().nullable(),
  }),
]);
export type UpsertSecretInput = z.infer<typeof upsertSecretSchema>;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const listProjectsQuerySchema = paginationSchema.extend({
  status: z.enum(["ACTIVE", "ARCHIVED", "ALL"]).default("ACTIVE"),
  search: z.string().trim().max(100).optional(),
  workspaceId: z.string().uuid().optional(),
});

export const createTestRunSchema = z.object({
  projectId: z.string().uuid(),
  branch: branchNameSchema.optional(),
});
