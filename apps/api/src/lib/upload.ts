import multer from 'multer';
import type { FilePurpose } from '@prisma/client';
import { AppError } from './errors';
import { prisma } from './prisma';
import { sha256 } from './crypto';
import { sniffFileType, storage } from '../providers/storage';

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 20, fieldNameSize: 100, fieldSize: 10 * 1024 },
});

/** Validates the real file type and stores it privately. Only JPEG, PNG, WebP and PDF are accepted. */
export async function saveUpload(file: Express.Multer.File | undefined, ownerUserId: string, purpose: FilePurpose) {
  if (!file) throw new AppError(400, 'FILE_REQUIRED', 'Please attach a file');
  const type = sniffFileType(file.buffer);
  if (!type) throw new AppError(400, 'UNSUPPORTED_FILE', 'Upload a JPG, PNG, WebP image or a PDF');
  const key = await storage.put(`${purpose.toLowerCase()}/${ownerUserId}`, file.buffer, type.ext);
  return prisma.storedFile.create({
    data: {
      ownerUserId,
      purpose,
      storageKey: key,
      originalName: file.originalname.replace(/[^\w.\- ]/g, '_').slice(0, 120),
      mimeType: type.mime,
      sizeBytes: file.size,
      sha256: sha256(file.buffer),
    },
  });
}
