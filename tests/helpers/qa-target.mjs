const databases = new Set(["morphiume_staging", "morphiume_staging_runtime"]);
// Coordinator-created, dedicated QA databases use exactly sixteen lowercase
// hexadecimal characters; no arbitrary suffix, substring or wildcard is allowed.
const dedicatedQaDatabase = /^morphiume_staging_qa_[0-9a-f]{16}$/u;

// Pure, fail-closed target check shared by QA tools. Never log a connection URL.
// Environment loading belongs to the caller and precedes this check/any I/O.
export function controlledQaDatabase(configuration) {
  if (!["test", "staging"].includes(configuration.DEPLOYMENT_ENV ?? "") || configuration.PAYMENT_PROVIDER !== "mock" || configuration.SMS_PROVIDER !== "mock") throw new Error("QA requires controlled test/staging mock services");
  const value = configuration.DATABASE_URL;
  if (typeof value !== "string" || !value || value !== value.trim()) throw new Error("QA requires an explicit isolated database URL");
  let target, originalPath, database;
  try {
    target = new URL(value);
    // Inspect the original path as well: WHATWG URL normalizes dot segments.
    // /other/../allowed is still an ambiguous multi-segment PostgreSQL target.
    originalPath = /^[a-z][a-z\d+.-]*:\/\/[^/?#]*(\/[^?#]*)(?:[?#]|$)/iu.exec(value)?.[1];
    if (!originalPath || !/^\/[^/]+$/u.test(originalPath)) throw new Error();
    database = decodeURIComponent(originalPath.slice(1));
  } catch { throw new Error("QA database target is malformed"); }
  // pg-connection-string honors query host/options/user overrides. Approved
  // SSH tunnel URLs require no parameters, including empty query/fragment marks.
  if (!["postgres:", "postgresql:"].includes(target.protocol) || !["localhost", "127.0.0.1"].includes(target.hostname) || target.search || target.hash || /[?#]/u.test(value) || !(databases.has(database) || dedicatedQaDatabase.test(database))) throw new Error("QA refuses a nonisolated database target");
  return target;
}
