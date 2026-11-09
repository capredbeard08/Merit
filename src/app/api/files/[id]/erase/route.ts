import { del } from "@vercel/blob";
import { createPermanentErasureHandler } from "@/lib/permanent-erasure-handler";

export const POST = createPermanentErasureHandler(del);
