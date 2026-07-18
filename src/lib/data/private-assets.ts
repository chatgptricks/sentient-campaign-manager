import { DomainError } from '../../domain/errors';

export const MAX_PRIVATE_ASSET_BYTES = 25 * 1024 * 1024;

export const PRIVATE_ASSET_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
] as const;

const extensionByMimeType: Record<(typeof PRIVATE_ASSET_MIME_TYPES)[number], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
};

function isAllowedMimeType(
  mimeType: string,
): mimeType is (typeof PRIVATE_ASSET_MIME_TYPES)[number] {
  return PRIVATE_ASSET_MIME_TYPES.some((allowed) => allowed === mimeType);
}

export function validatePrivateAssetFile(file: Pick<File, 'name' | 'size' | 'type'>) {
  if (!file.size) {
    throw new DomainError({
      code: 'ASSET_EMPTY',
      message: 'Choose a non-empty image or PDF file.',
    });
  }
  if (file.size > MAX_PRIVATE_ASSET_BYTES) {
    throw new DomainError({
      code: 'ASSET_TOO_LARGE',
      message: 'Private assets must be 25 MiB or smaller.',
    });
  }
  if (!isAllowedMimeType(file.type)) {
    throw new DomainError({
      code: 'ASSET_TYPE_UNSUPPORTED',
      message: 'Choose a JPG, PNG, WebP, GIF, or PDF file.',
    });
  }
}

export function sanitizePrivateAssetFilename(name: string, mimeType: string) {
  const extension = isAllowedMimeType(mimeType) ? extensionByMimeType[mimeType] : 'bin';
  let sanitized = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/-+\./g, '.')
    .replace(/\.-+/g, '.')
    .replace(/-+/g, '-')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');

  if (!sanitized) sanitized = `asset.${extension}`;
  if (!sanitized.includes('.')) sanitized = `${sanitized}.${extension}`;

  if (sanitized.length > 180) {
    const suffixIndex = sanitized.lastIndexOf('.');
    const suffix = suffixIndex > 0 ? sanitized.slice(suffixIndex, suffixIndex + 16) : '';
    const basename = suffixIndex > 0 ? sanitized.slice(0, suffixIndex) : sanitized;
    sanitized = `${basename.slice(0, 180 - suffix.length)}${suffix}`;
  }

  return sanitized;
}

export interface PrivateAssetDescriptor {
  id: string;
  path: string;
  displayName: string;
  resourceType: 'IMAGE' | 'PDF';
  mimeType: (typeof PRIVATE_ASSET_MIME_TYPES)[number];
  size: number;
}

export function createPrivateAssetDescriptor(
  promotionId: string,
  resourceId: string,
  file: Pick<File, 'name' | 'size' | 'type'>,
): PrivateAssetDescriptor {
  validatePrivateAssetFile(file);
  const mimeType = file.type as PrivateAssetDescriptor['mimeType'];
  const filename = sanitizePrivateAssetFilename(file.name, mimeType);
  const displayName = file.name.trim().slice(0, 160) || filename;

  return {
    id: resourceId,
    path: `${promotionId}/${resourceId}/${filename}`,
    displayName,
    resourceType: mimeType === 'application/pdf' ? 'PDF' : 'IMAGE',
    mimeType,
    size: file.size,
  };
}
