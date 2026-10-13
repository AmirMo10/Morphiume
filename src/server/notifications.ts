import "server-only";
import { pool } from "./db";
import { createNotificationFeed } from "./commerce/notification-feed";

let feed: ReturnType<typeof createNotificationFeed> | undefined;
export function getNotificationFeed() {
  return feed ??= createNotificationFeed({ pool });
}
