import { environment } from '../../environments/environment';

const DEFAULT_PROFILE_IMAGE_PATH = 'images/default/default-image-profile.png';

interface NormalizeImageUrlOptions {
  assumeImagesDirectory?: boolean;
  rejectDefaultProfileImage?: boolean;
}

export class ImageUrlUtil {
  static normalizeBackendImageUrl(
    path: string | null | undefined,
    options: NormalizeImageUrlOptions = {},
  ): string | null {
    const normalizedPath = path?.trim();

    if (!normalizedPath || this.isInvalidImagePath(normalizedPath, options.rejectDefaultProfileImage)) {
      return null;
    }

    if (normalizedPath.startsWith('http://') || normalizedPath.startsWith('https://')) {
      return normalizedPath;
    }

    if (normalizedPath.startsWith('/')) {
      return `${environment.backendBaseUrl}${normalizedPath}`;
    }

    const relativePath = normalizedPath.replace(/^\/+/, '');

    if (options.assumeImagesDirectory && !relativePath.startsWith('images/')) {
      return `${environment.backendBaseUrl}/images/${relativePath}`;
    }

    return `${environment.backendBaseUrl}/${relativePath}`;
  }

  static normalizeProfileImageUrl(
    path: string | null | undefined,
    options: Pick<NormalizeImageUrlOptions, 'assumeImagesDirectory'> = {},
  ): string | null {
    return this.normalizeBackendImageUrl(path, {
      ...options,
      rejectDefaultProfileImage: true,
    });
  }

  private static isInvalidImagePath(path: string, rejectDefaultProfileImage = false): boolean {
    const normalizedPath = path.trim().toLowerCase();

    return (
      normalizedPath === 'string' ||
      normalizedPath === 'null' ||
      normalizedPath === 'undefined' ||
      (
        rejectDefaultProfileImage &&
        (
          normalizedPath === DEFAULT_PROFILE_IMAGE_PATH ||
          normalizedPath === `/${DEFAULT_PROFILE_IMAGE_PATH}` ||
          normalizedPath.endsWith(`/${DEFAULT_PROFILE_IMAGE_PATH}`)
        )
      )
    );
  }
}
