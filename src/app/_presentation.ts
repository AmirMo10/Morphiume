import "server-only";
import { cache } from "react";
import { getPresentation } from "@/server/presentation";

// React cache deduplicates this render's public read; no persistent/shared private cache.
export const readPresentation = cache(getPresentation);
