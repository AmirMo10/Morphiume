"use client";
import { createAuthClient } from "better-auth/react";
import { phoneNumberClient, twoFactorClient } from "better-auth/client/plugins";

export const customerAuth = createAuthClient({ basePath: "/api/auth", plugins: [phoneNumberClient()] });
export const adminAuth = createAuthClient({ basePath: "/api/admin/auth", plugins: [twoFactorClient()] });
