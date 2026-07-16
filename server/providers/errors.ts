export class ProviderError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
