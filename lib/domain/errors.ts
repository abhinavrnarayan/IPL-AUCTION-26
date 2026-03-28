export class AppError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "APP_ERROR") {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export function asAppError(error: unknown) {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError(error.message, 500, "UNEXPECTED_ERROR");
  }

  return new AppError("Unexpected error", 500, "UNEXPECTED_ERROR");
}
