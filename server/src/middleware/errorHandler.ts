import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../types';

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'VALIDATION_ERROR',
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthorizationError extends Error {
  constructor(message: string = 'Authorization required') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error for debugging
  if (process.env.NODE_ENV !== 'test') {
    console.error(`Error: ${err.message}`, {
      path: req.path,
      method: req.method,
      ip: req.ip
    });
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const error: ApiError = {
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: { errors: err.errors }
    };
    res.status(400).json(error);
    return;
  }

  // Handle custom validation errors
  if (err instanceof ValidationError) {
    const error: ApiError = {
      error: err.message,
      code: err.code,
      details: err.details
    };
    res.status(400).json(error);
    return;
  }

  // Handle authorization errors
  if (err instanceof AuthorizationError) {
    const error: ApiError = {
      error: err.message,
      code: 'AUTHORIZATION_REQUIRED'
    };
    res.status(403).json(error);
    return;
  }

  // Handle not found errors
  if (err instanceof NotFoundError) {
    const error: ApiError = {
      error: err.message,
      code: 'NOT_FOUND'
    };
    res.status(404).json(error);
    return;
  }

  // Handle JSON parse errors
  if (err instanceof SyntaxError && 'body' in err) {
    const error: ApiError = {
      error: 'Invalid JSON',
      code: 'INVALID_JSON'
    };
    res.status(400).json(error);
    return;
  }

  // Handle payload too large
  if ((err as any).type === 'entity.too.large') {
    const error: ApiError = {
      error: 'Payload too large',
      code: 'PAYLOAD_TOO_LARGE'
    };
    res.status(413).json(error);
    return;
  }

  // Generic error handler
  const error: ApiError = {
    error: 'Internal server error',
    code: 'INTERNAL_ERROR'
  };
  
  // Don't leak stack traces in production
  if (process.env.NODE_ENV === 'development') {
    error.details = { stack: err.stack };
  }
  
  res.status(500).json(error);
}