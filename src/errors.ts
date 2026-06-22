export class AppError extends Error {
  readonly info: Record<string, unknown>;

  private constructor(
    name: string,
    message: string,
    info: Record<string, unknown>,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = name;
    this.info = info;
  }

  static create({
    name,
    message,
    info = {},
    cause,
  }: {
    name: string;
    message: string;
    info?: Record<string, unknown>;
    cause?: unknown;
  }): AppError {
    return new AppError(name, message, info, { cause });
  }

  /** Collects info from every AppError in the cause chain, nearest wins. */
  static collect(err: Error): Record<string, unknown> {
    let result: Record<string, unknown> = {};
    let node: unknown = err;
    while (node instanceof Error) {
      if (node instanceof AppError) {
        result = { ...node.info, ...result };
      }
      node = node.cause;
    }
    return result;
  }
}
