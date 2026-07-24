import { supabase } from './client';

type UploadResult = {
  url: string;
  path: string;
  error?: string;
};

type StorageBucket = 'scanned-copies' | 'annotated-copies' | 'answer-sheets';

/**
 * Upload a file to Supabase Storage.
 * Returns the public URL or signed URL.
 */
export async function uploadFile(
  bucket: StorageBucket,
  path: string,
  fileUri: string,
  contentType: string = 'image/jpeg',
): Promise<UploadResult> {
  const response = await fetch(fileUri);
  const blob = await response.blob();

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, { contentType, upsert: true });

  if (error) {
    return { url: '', path: '', error: error.message };
  }

  const { data: urlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(data.path);

  return { url: urlData.publicUrl, path: data.path };
}

/**
 * Get a signed URL for a private file.
 */
export async function getSignedUrl(
  bucket: StorageBucket,
  path: string,
  expiresIn: number = 3600,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error) return '';
  return data.signedUrl;
}

/**
 * Delete a file from Supabase Storage.
 */
export async function deleteFile(
  bucket: StorageBucket,
  path: string,
): Promise<boolean> {
  const { error } = await supabase.storage
    .from(bucket)
    .remove([path]);
  return !error;
}

/**
 * List files in a storage folder.
 */
export async function listFiles(
  bucket: StorageBucket,
  folder: string = '',
): Promise<string[]> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .list(folder);

  if (error) return [];
  return data.map((f) => `${folder}/${f.name}`);
}
