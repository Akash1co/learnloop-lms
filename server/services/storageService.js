const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');
const ALLOWED_TYPES = new Map([
  ['application/pdf', { extension: '.pdf', signature: (buffer) => buffer.subarray(0, 5).toString() === '%PDF-' }],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', {
    extension: '.docx',
    signature: (buffer) => buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b
      && buffer[2] === 0x03 && buffer[3] === 0x04,
  }],
  ['image/png', {
    extension: '.png',
    signature: (buffer) => buffer.length >= 8
      && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  }],
  ['image/jpeg', {
    extension: '.jpg',
    signature: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  }],
]);

class UploadError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

function decodeBase64(value) {
  if (typeof value !== 'string') throw new UploadError('A base64 file payload is required', 422);
  const match = value.match(/^data:([^;]+);base64,([\s\S]+)$/);
  const encoded = match ? match[2] : value;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) {
    throw new UploadError('File payload must be valid base64', 422);
  }
  return {
    mimeType: match ? match[1] : null,
    buffer: Buffer.from(encoded, 'base64'),
  };
}

async function saveUpload({ buffer, mimeType, isPublic = false }) {
  if (!Buffer.isBuffer(buffer)) throw new UploadError('A file is required', 422);
  if (buffer.length > MAX_FILE_SIZE) throw new UploadError('File exceeds the 10 MB limit', 413);
  const type = ALLOWED_TYPES.get(mimeType);
  if (!type) throw new UploadError('Unsupported file MIME type', 415);
  if (!type.signature(buffer)) throw new UploadError('File content does not match its MIME type', 415);

  const filename = `${randomUUID()}${type.extension}`;
  const directory = path.join(UPLOAD_ROOT, isPublic ? 'public' : 'private');
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, filename), buffer, { flag: 'wx' });
  return {
    filename,
    mimeType,
    size: buffer.length,
    isPublic,
    url: isPublic ? `/uploads/${filename}` : `/api/v1/integrations/assets/${filename}`,
  };
}

async function saveBase64Upload({ data, mimeType, isPublic = false }) {
  const decoded = decodeBase64(data);
  return saveUpload({
    buffer: decoded.buffer,
    mimeType: mimeType || decoded.mimeType,
    isPublic,
  });
}

async function readAsset(filename, isPublic = false) {
  if (typeof filename !== 'string' || !/^[0-9a-f-]+\.(pdf|docx|png|jpg)$/.test(filename)) {
    throw new UploadError('Asset not found', 404);
  }
  try {
    return await fs.readFile(path.join(UPLOAD_ROOT, isPublic ? 'public' : 'private', filename));
  } catch (error) {
    if (error.code === 'ENOENT') throw new UploadError('Asset not found', 404);
    throw error;
  }
}

async function removeAsset(filename, isPublic = false) {
  try {
    await fs.unlink(path.join(UPLOAD_ROOT, isPublic ? 'public' : 'private', filename));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

module.exports = { ALLOWED_TYPES, MAX_FILE_SIZE, UPLOAD_ROOT, UploadError, readAsset, removeAsset, saveBase64Upload, saveUpload };
