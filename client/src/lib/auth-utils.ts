export const usernameToEmail = (u: string) => `${u.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "")}@yodo.local`;

export const ROLE_LABEL: Record<string, string> = { superadmin: "SuperAdmin", admin: "Admin", user: "User" };
