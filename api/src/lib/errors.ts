import type { Response } from "express";
import type { NormalizedErrorCode } from "@prisma/client";

export class AppError extends Error {
  readonly statusCode: number;
  readonly code:
    | NormalizedErrorCode
    | "bad_request"
    | "unauthorized"
    | "forbidden"
    | "not_found"
    | "conflict"
    | "internal_error";
  readonly details?: unknown;

  constructor(
    statusCode: number,
    code: AppError["code"],
    message: string,
    details?: unknown
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function sendAppError(res: Response, error: unknown): void {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details ?? null,
      },
    });
    return;
  }

  const message = error instanceof Error ? error.message : "Internal server error";
  res.status(500).json({
    error: {
      code: "internal_error",
      message,
      details: null,
    },
  });
}
