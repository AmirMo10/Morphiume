export function validateLoadFixtureState<T>(fixture: T, progress: unknown, latest: unknown, configuration: Record<string, string | undefined>): T;
export function readLoadFixtureState(fixturePath: string, configuration: Record<string, string | undefined>, privateDirectory?: string): Promise<Record<string, unknown>>;
