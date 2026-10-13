export type ServerEvidenceSource = "verify-runtime" | "image-runtime";
export type ServerFailureRecord = {
  event: "request.completed"; time: string; requestId: string; route: string;
  status: 500; durationMs: number; errorCode?: "INTERNAL"; failureCategory?: string;
  requestAborted?: boolean; nativeAuthStatus?: 400 | 401 | 403 | 404 | 408 | 429 | 500 | 502 | 503;
};
export type ServerFailureEvidence = {
  schemaVersion: 1; source: ServerEvidenceSource; state: "collected" | "missing" | "unreadable";
  linesScanned: number; eventCount: number; byteLimitReached: boolean; lineLimitReached: boolean;
  eventLimitReached: boolean; events: ServerFailureRecord[];
};
export const SERVER_ROUTE_ALIASES: readonly string[];
export const SERVER_FAILURE_CATEGORIES: readonly string[];
export const SERVER_NATIVE_AUTH_STATUSES: readonly (400 | 401 | 403 | 404 | 408 | 429 | 500 | 502 | 503)[];
export const SERVER_EVIDENCE_LIMITS: Readonly<{ bytes: number; lineBytes: number; lines: number; events: number; durationMs: number }>;
export function safeServerFailureRecord(line: unknown): ServerFailureRecord | null;
export function collectServerFailureEvidence(text: string, source: ServerEvidenceSource): ServerFailureEvidence;
export function readServerFailureEvidence(source: ServerEvidenceSource, workspace?: string): Promise<ServerFailureEvidence>;
