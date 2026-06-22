export class ContextError extends Error {
  readonly context: Record<string, string>;

  protected constructor(
    message: string,
    context: Record<string, string>,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'ContextError';
    this.context = context;
  }

  static wrap(
    message: string,
    context: Record<string, string>,
    cause: unknown
  ): ContextError {
    return new ContextError(message, context, { cause });
  }
}

export class NetworkRequestError extends ContextError {
  constructor(endpoint: string, cause: unknown) {
    super('network request failed', { endpoint }, { cause });
    this.name = 'NetworkRequestError';
  }
}

export class DeviceNotFoundError extends Error {
  constructor(name: string) {
    super(`Can't find device '${name}' on your network`);
    this.name = 'DeviceNotFoundError';
  }
}

export class DeviceInfoError extends Error {
  constructor(name: string) {
    super(`Could not fetch device info for '${name}'`);
    this.name = 'DeviceInfoError';
  }
}
