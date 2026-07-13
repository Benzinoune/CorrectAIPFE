/**
 * upload.ts
 *
 * Multipart upload helper for the CorrectAI scanner.
 *
 * Uses expo-file-system v56's new File.upload() API.
 * Key fixes vs. the original:
 *   1. Normalise URI → always file:// scheme before passing to File().
 *   2. Guard file.size (may be undefined/NaN in the new API).
 *   3. Guard file.type (may be '' or undefined on Android).
 *   4. Add AbortSignal timeout so a hung request never blocks the detection loop.
 *   5. Explicit sessionType:'foreground' so the upload is cancelled when the
 *      component unmounts (background session survives app suspension).
 */

import { File, UploadType } from 'expo-file-system';

export type ScannerUploadFields = Record<string, string | number | boolean | null | undefined>;

export type ScannerUploadResult = {
  status: number;
  body: string;
  headers: Record<string, string>;
  fileName: string;
  fileSize: number;
  mimeType: string;
  requestUrl: string;
};

export type ScannerUploadRequest = {
  requestUrl: string;
  imageUri: string;
  fileFieldName?: string;
  fields?: ScannerUploadFields;
  label: 'detect-corners' | 'extract-student-info' | 'detect-bubbles' | 'scan';
  /** AbortSignal to cancel the request early. */
  signal?: AbortSignal;
};

/** Ensure the URI has a file:// scheme so the new expo-file-system File class can open it. */
function normalizeUri(uri: string): string {
  if (uri.startsWith('file://') || uri.startsWith('content://') || uri.startsWith('http')) {
    return uri;
  }
  // Bare path like /var/... or /data/...
  return `file://${uri}`;
}

function guessMimeType(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'heic':
      return 'image/heic';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/jpeg';
  }
}

function normalizeFields(fields: ScannerUploadFields): Record<string, string> {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)]),
  );
}

const DEFAULT_TIMEOUT_MS = 15_000; // 15 s — long enough for detection, short enough to fail fast

export async function uploadScannerMultipart({
  requestUrl,
  imageUri,
  fileFieldName = 'file',
  fields = {},
  label,
  signal,
}: ScannerUploadRequest): Promise<ScannerUploadResult> {
  const normalizedUri = normalizeUri(imageUri);
  const file = new File(normalizedUri);

  // .name is a reliable getter in the new API
  const fileName = file.name || normalizedUri.split('/').pop() || 'scan.jpg';

  // .size may be undefined / NaN if the file object is not yet resolved — guard it
  const rawSize: unknown = file.size;
  const fileSize = typeof rawSize === 'number' && isFinite(rawSize) ? rawSize : 0;

  // .type may be empty string on Android — fall back to extension guess
  const rawType: unknown = (file as any).type;
  const mimeType =
    typeof rawType === 'string' && rawType.startsWith('image/')
      ? rawType
      : guessMimeType(fileName);

  const normalizedFields = normalizeFields(fields);
  const fieldSummary =
    Object.entries(normalizedFields)
      .map(([key, value]) => `${key}=${value}`)
      .join('&') || 'none';

  console.log(
    '[Scanner] %s upload start url=%s file=%s size=%d mimeType=%s fieldName=%s fields=%s',
    label,
    requestUrl,
    fileName,
    fileSize,
    mimeType,
    fileFieldName,
    fieldSummary,
  );

  // Create a combined AbortSignal: respect the caller's signal AND apply our own timeout.
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => {
    timeoutController.abort(new Error(`[Scanner] ${label} upload timed out after ${DEFAULT_TIMEOUT_MS}ms`));
  }, DEFAULT_TIMEOUT_MS);

  // Merge signals when the caller supplies one
  let combinedSignal: AbortSignal = timeoutController.signal;
  if (signal) {
    const outerController = new AbortController();
    signal.addEventListener('abort', () => outerController.abort(signal.reason));
    timeoutController.signal.addEventListener('abort', () => outerController.abort(timeoutController.signal.reason));
    combinedSignal = outerController.signal;
  }

  try {
    const response = await file.upload(requestUrl, {
      httpMethod: 'POST',
      uploadType: UploadType.MULTIPART,
      fieldName: fileFieldName,
      mimeType,
      parameters: normalizedFields,
      // Keep upload in the foreground so it is cancelled if the component unmounts.
      sessionType: 'foreground',
      signal: combinedSignal,
    });

    console.log(
      '[Scanner] %s upload complete status=%d body=%s',
      label,
      response.status,
      response.body?.substring(0, 300),
    );

    return {
      status: response.status,
      body: response.body,
      headers: response.headers,
      fileName,
      fileSize,
      mimeType,
      requestUrl,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
