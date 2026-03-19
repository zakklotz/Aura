export class AppError extends Error {
    statusCode;
    code;
    details;
    constructor(statusCode, code, message, details) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
    }
}
export function sendAppError(res, error) {
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
