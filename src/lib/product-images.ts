import { supabase } from '@/integrations/supabase/client';

const PRODUCT_IMAGE_PRIMARY_BUCKET = 'product-images';
const PRODUCT_IMAGE_FALLBACK_BUCKET = 'business-logos';

function getStorageErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return String(error);
}

function isMissingStorageBucketError(error: unknown) {
  const message = getStorageErrorMessage(error).toLowerCase();
  return message.includes('bucket not found') || message.includes('bucket does not exist');
}

function getProductImageExtension(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension && /^[a-z0-9]+$/.test(extension)) return extension;
  if (file.type === 'image/jpeg' || file.type === 'image/jpg') return 'jpg';
  if (file.type === 'image/webp') return 'webp';
  return 'png';
}

async function uploadToBucket(bucket: string, path: string, file: File) {
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type || undefined,
    upsert: true,
  });

  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadProductImage({
  businessId,
  productId,
  file,
}: {
  businessId: string;
  productId: string;
  file: File;
}) {
  const extension = getProductImageExtension(file);
  const path = `${businessId}/products/${productId}-${Date.now()}.${extension}`;

  try {
    return await uploadToBucket(PRODUCT_IMAGE_PRIMARY_BUCKET, path, file);
  } catch (primaryError) {
    if (!isMissingStorageBucketError(primaryError)) throw primaryError;

    // Compatibility fallback for production projects where the product-images
    // bucket migration has not been applied yet. The business-logos bucket is
    // already business-folder scoped and publicly readable.
    try {
      return await uploadToBucket(PRODUCT_IMAGE_FALLBACK_BUCKET, path, file);
    } catch (fallbackError) {
      throw new Error(
        `Product image storage is not ready. Primary bucket is missing and fallback upload failed: ${getStorageErrorMessage(fallbackError)}`,
      );
    }
  }
}
