export class ContextError extends Error {
  readonly context: Record<string, string>;

  private constructor(
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

export function apiNotFoundWithName(name: string): Error {
  return new Error(
    `Can't find device using the name '${name}' on your network`
  );
}
