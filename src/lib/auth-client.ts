"use client";

import { createAuthClient } from "better-auth/react";

// Use the current site's origin so browser auth requests always target this deployment.
// This avoids a stale or mismatched NEXT_PUBLIC_APP_URL sending requests to another host.
export const authClient = createAuthClient();
