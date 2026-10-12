export type QaTargetConfiguration = {
  [name: string]: string | undefined;
  DEPLOYMENT_ENV?: string; PAYMENT_PROVIDER?: string; SMS_PROVIDER?: string; DATABASE_URL?: string;
};
export function controlledQaDatabase(configuration: QaTargetConfiguration): URL;
