"use client";

import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

// Use the current site's origin so browser auth requests always target this deployment.
export const authClient = createAuthClient({
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect: () => {
        window.location.href = "/two-factor";
      },
    }),
  ],
});
