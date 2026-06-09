import {launchImageLibrary} from 'react-native-image-picker';

export type ImagePickerResult = {
  uri?: string;
  base64?: string | null;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  width?: number;
  height?: number;
};

export async function pickImageFromGallery(): Promise<ImagePickerResult | null> {
  try {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.8,
      maxWidth: 1024,
      maxHeight: 1024,
      includeBase64: true,
      selectionLimit: 1,
    });

    if (result.didCancel) {
      return null;
    }

    if (result.errorCode) {
      console.warn('[ImagePicker] Error:', result.errorMessage);
      return null;
    }

    const asset = result.assets?.[0];
    if (!asset) {
      return null;
    }

    return {
      uri: asset.uri,
      base64: asset.base64 || null,
      mimeType: asset.type || 'image/jpeg',
      fileName: asset.fileName,
      fileSize: asset.fileSize,
      width: asset.width,
      height: asset.height,
    };
  } catch (error) {
    console.warn('[ImagePicker] Exception:', error);
    return null;
  }
}
