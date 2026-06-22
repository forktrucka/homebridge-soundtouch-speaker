export class AppError extends Error {
  readonly info: Record<string, unknown>;

  private constructor(info: Record<string, unknown>, cause: unknown) {
    super((info.msg ?? '') as string, cause !== undefined ? { cause } : undefined);
    this.name = info.name as string;
    this.info = info;
  }

  static create({
    name,
    msg,
    cause,
    ...rest
  }: {
    name: string;
    msg?: string;
    cause?: unknown;
    [key: string]: unknown;
  }): AppError {
    return new AppError({ name, ...(msg !== undefined ? { msg } : {}), ...rest }, cause);
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
