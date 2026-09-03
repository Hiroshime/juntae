export class AppError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly code = "BAD_REQUEST",
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function assertFound<T>(value: T | null | undefined, message: string): T {
  if (value == null) throw new AppError(message, 404, "NOT_FOUND");
  return value;
}
