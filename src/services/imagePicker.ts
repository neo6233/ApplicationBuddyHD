import {launchImageLibrary} from 'react-native-image-picker';
import {
  errorCodes,
  isErrorWithCode,
  keepLocalCopy,
  pick,
  types,
} from '@react-native-documents/picker';
import * as RNFS from 'react-native-fs';

export type ImagePickerResult = {
  uri?: string;
  base64?: string | null;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  width?: number;
  height?: number;
};

export type EligibilityDocumentResult = ImagePickerResult & {
  kind: 'image' | 'pdf' | 'word';
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

const stripFileScheme = (uri: string) => uri.replace(/^file:\/\//, '');

const isPickedPdf = (mimeType: string, nativeType?: string | null, fileName?: string | null) =>
  mimeType.toLowerCase().includes('pdf') ||
  (nativeType || '').toLowerCase().includes('pdf') ||
  (fileName || '').toLowerCase().endsWith('.pdf');

const isPickedWordDocument = (mimeType: string, nativeType?: string | null, fileName?: string | null) => {
  const normalizedMime = mimeType.toLowerCase();
  const normalizedNativeType = (nativeType || '').toLowerCase();
  const normalizedFileName = (fileName || '').toLowerCase();

  return (
    normalizedMime.includes('word') ||
    normalizedMime.includes('officedocument.wordprocessingml') ||
    normalizedNativeType.includes('word') ||
    normalizedNativeType.includes('wordprocessing') ||
    normalizedFileName.endsWith('.doc') ||
    normalizedFileName.endsWith('.docx')
  );
};

export async function pickEligibilityDocument(): Promise<EligibilityDocumentResult | null> {
  try {
    const [document] = await pick({
      type: [types.images, types.pdf, types.doc, types.docx],
      allowMultiSelection: false,
      mode: 'import',
    });

    if (!document || document.hasRequestedType === false) {
      return null;
    }

    const mimeType = document.type || 'application/octet-stream';
    const pickedPdf = isPickedPdf(mimeType, document.nativeType, document.name);
    const pickedWord = isPickedWordDocument(mimeType, document.nativeType, document.name);
    const fileName = document.name || (pickedPdf ? 'document.pdf' : pickedWord ? 'document.docx' : 'document.jpg');
    const [localCopy] = await keepLocalCopy({
      files: [
        {
          uri: document.uri,
          fileName,
          convertVirtualFileToType: pickedPdf ? 'application/pdf' : undefined,
        },
      ],
      destination: 'cachesDirectory',
    });

    if (!localCopy || localCopy.status === 'error') {
      console.warn('[DocumentPicker] Copy failed:', localCopy?.copyError);
      return null;
    }

    const base64 = await RNFS.readFile(stripFileScheme(localCopy.localUri), 'base64');
    const kind: EligibilityDocumentResult['kind'] = pickedPdf ? 'pdf' : pickedWord ? 'word' : 'image';

    return {
      uri: kind === 'image' ? localCopy.localUri : document.uri,
      base64,
      mimeType: kind === 'pdf'
        ? 'application/pdf'
        : kind === 'word' && fileName.toLowerCase().endsWith('.docx')
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : kind === 'word' && fileName.toLowerCase().endsWith('.doc')
        ? 'application/msword'
        : mimeType,
      fileName,
      fileSize: document.size || undefined,
      kind,
    };
  } catch (error) {
    if (isErrorWithCode(error) && error.code === errorCodes.OPERATION_CANCELED) {
      return null;
    }

    console.warn('[DocumentPicker] Exception:', error);
    return null;
  }
}

export default {
  pickImageFromGallery,
  pickEligibilityDocument,
};
