import type { ErrorRequestHandler } from 'express';
import { ZodError, type ZodSchema, type z } from 'zod';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { logger } from './logger';

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, message: string, details?: unknown) => new AppError(400, code, message, details);
export const unauthorized = (message = 'Please sign in to continue') => new AppError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'You do not have access to this resource') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (code: string, message: string, details?: unknown) => new AppError(409, code, message, details);
export const unprocessable = (code: string, message: string, details?: unknown) => new AppError(422, code, message, details);

export function parse<S extends ZodSchema>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw zodToAppError(r.error);
  return r.data;
}

function zodToAppError(err: ZodError) {
  const fields: Record<string, string> = {};
  for (const i of err.issues) fields[i.path.join('.') || '_'] ??= i.message;
  return new AppError(400, 'VALIDATION_ERROR', 'Some details need fixing', { fields });
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let e: AppError;
  if (err instanceof AppError) e = err;
  else if (err instanceof ZodError) e = zodToAppError(err);
  else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
    e = new AppError(409, 'DUPLICATE', 'A record with these details already exists', { target: err.meta?.target });
  else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') e = new AppError(404, 'NOT_FOUND', 'Record not found');
  else if (err instanceof multer.MulterError) e = new AppError(400, 'UPLOAD_ERROR', err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : err.message);
  else if (err?.type === 'entity.parse.failed') e = new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON');
  else if (err?.type === 'entity.too.large') e = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  else {
    logger.error({ err, path: req.path }, 'unhandled error');
    e = new AppError(500, 'INTERNAL', 'Something went wrong. Please try again.');
  }
  if (e.status >= 500) logger.error({ err }, e.message);
  res.status(e.status).json({ error: { code: e.code, message: e.message, details: e.details } });
};
