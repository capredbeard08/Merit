export const dynamic = "force-dynamic";

import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { createSupportAccessRequesterCancelHandler } from "@/lib/support-access-request-api";

const handleRequesterCancellation = createSupportAccessRequesterCancelHandler({
  prisma,
  getSession: (headers) => auth.api.getSession({ headers }),
});

export const DELETE = handleRequesterCancellation;
