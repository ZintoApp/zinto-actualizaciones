/**
 * WhatsApp Media Validation Service
 * Handles validation of media files for WhatsApp campaigns
 */

import { WHATSAPP_MESSAGE_TYPES, WHATSAPP_LIMITS } from '@/lib/whatsapp-constants';

export interface MediaValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  fileInfo: {
    name: string;
    size: number;
    type: string;
    sizeFormatted: string;
  };
}

export interface MediaUploadResult {
  success: boolean;
  url?: string;
  error?: string;
  validationResult: MediaValidationResult;
}

export class WhatsAppMediaValidationService {
  
  /**
   * Validate a media file for WhatsApp
   */
  static validateMediaFile(file: File, messageType: string): MediaValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    const fileInfo = {
      name: file.name,
      size: file.size,
      type: file.type,
      sizeFormatted: this.formatFileSize(file.size)
    };


    const limits = this.getMediaLimits(messageType);
    
    if (!limits) {
      errors.push(`Unsupported message type: ${messageType}`);
      return {
        isValid: false,
        errors,
        warnings,
        fileInfo
      };
    }


    if (file.size > limits.maxSize) {
      errors.push(`File too large. Maximum size: ${this.formatFileSize(limits.maxSize)}`);
    } else if (file.size > limits.maxSize * 0.9) {
      warnings.push(`File is close to size limit (${fileInfo.sizeFormatted}/${this.formatFileSize(limits.maxSize)})`);
    }


    if (!(limits.allowedTypes as readonly string[]).includes(file.type)) {
      errors.push(`Unsupported file format: ${file.type}. Allowed: ${limits.allowedTypes.join(', ')}`);
    }


    switch (messageType) {
      case WHATSAPP_MESSAGE_TYPES.IMAGE:
        this.validateImage(file, errors, warnings);
        break;
      case WHATSAPP_MESSAGE_TYPES.VIDEO:
        this.validateVideo(file, errors, warnings);
        break;
      case WHATSAPP_MESSAGE_TYPES.AUDIO:
        this.validateAudio(file, errors, warnings);
        break;
      case WHATSAPP_MESSAGE_TYPES.DOCUMENT:
        this.validateDocument(file, errors, warnings);
        break;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      fileInfo
    };
  }

  /**
   * Upload and validate media file
   */
  static async uploadMediaFile(file: File, messageType: string): Promise<MediaUploadResult> {

    const validationResult = this.validateMediaFile(file, messageType);
    
    if (!validationResult.isValid) {
      return {
        success: false,
        error: validationResult.errors.join(', '),
        validationResult
      };
    }

    try {

      const formData = new FormData();
      formData.append('file', file);
      formData.append('messageType', messageType);


      const response = await fetch('/api/media/upload', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (response.ok && data.success) {
        return {
          success: true,
          url: data.url,
          validationResult
        };
      } else {
        return {
          success: false,
          error: data.error || 'Upload failed',
          validationResult
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
        validationResult
      };
    }
  }

  /**
   * Get media limits for message type
   */
  private static getMediaLimits(messageType: string) {
    switch (messageType) {
      case WHATSAPP_MESSAGE_TYPES.IMAGE:
        return {
          maxSize: WHATSAPP_LIMITS.MEDIA.IMAGE.MAX_SIZE,
          allowedTypes: WHATSAPP_LIMITS.MEDIA.IMAGE.FORMATS
        };
      case WHATSAPP_MESSAGE_TYPES.VIDEO:
        return {
          maxSize: WHATSAPP_LIMITS.MEDIA.VIDEO.MAX_SIZE,
          allowedTypes: WHATSAPP_LIMITS.MEDIA.VIDEO.FORMATS
        };
      case WHATSAPP_MESSAGE_TYPES.AUDIO:
        return {
          maxSize: WHATSAPP_LIMITS.MEDIA.AUDIO.MAX_SIZE,
          allowedTypes: WHATSAPP_LIMITS.MEDIA.AUDIO.FORMATS
        };
      case WHATSAPP_MESSAGE_TYPES.DOCUMENT:
        return {
          maxSize: WHATSAPP_LIMITS.MEDIA.DOCUMENT.MAX_SIZE,
          allowedTypes: WHATSAPP_LIMITS.MEDIA.DOCUMENT.FORMATS
        };
      default:
        return null;
    }
  }

  /**
   * Validate image files
   */
  private static validateImage(file: File, errors: string[], warnings: string[]) {

    if (file.size < 1024) { // Less than 1KB
      warnings.push('Image file seems very small, ensure it\'s a valid image');
    }


    const fileName = file.name.toLowerCase();
    if (fileName.includes(' ')) {
      warnings.push('Consider removing spaces from filename for better compatibility');
    }
  }

  /**
   * Validate video files
   */
  private static validateVideo(file: File, errors: string[], warnings: string[]) {

    if (file.size > 10 * 1024 * 1024) { // 10MB
      warnings.push('Large video files may take longer to send and receive');
    }



  }

  /**
   * Validate audio files
   */
  private static validateAudio(file: File, errors: string[], warnings: string[]) {

    if (file.size > 5 * 1024 * 1024) { // 5MB
      warnings.push('Large audio files may take longer to send');
    }
  }

  /**
   * Validate document files
   */
  private static validateDocument(file: File, errors: string[], warnings: string[]) {

    const fileName = file.name.toLowerCase();
    

    if (fileName.length > 100) {
      warnings.push('Very long filename may cause display issues');
    }


    const executableExtensions = ['.exe', '.bat', '.cmd', '.scr', '.com', '.pif'];
    if (executableExtensions.some(ext => fileName.endsWith(ext))) {
      errors.push('Executable files are not allowed for security reasons');
    }


    if (fileName.includes('password') || fileName.includes('protected')) {
      warnings.push('Password-protected files may not be accessible to recipients');
    }
  }

  /**
   * Format file size for display
   */
  private static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get supported file extensions for message type
   */
  static getSupportedExtensions(messageType: string): string[] {
    const limits = this.getMediaLimits(messageType);
    if (!limits) return [];


    const mimeToExt: Record<string, string[]> = {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'video/mp4': ['.mp4'],
      'video/3gpp': ['.3gp'],
      'audio/aac': ['.aac'],
      'audio/mp4': ['.m4a'],
      'audio/mpeg': ['.mp3'],
      'audio/amr': ['.amr'],
      'audio/ogg': ['.ogg'],
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/plain': ['.txt']
    };

    const extensions: string[] = [];
    (limits.allowedTypes as readonly string[]).forEach((mimeType: string) => {
      const exts = mimeToExt[mimeType];
      if (exts) {
        extensions.push(...exts);
      }
    });

    return extensions;
  }

  /**
   * Check if file type is supported for message type
   */
  static isFileTypeSupported(file: File, messageType: string): boolean {
    const limits = this.getMediaLimits(messageType);
    return limits ? (limits.allowedTypes as readonly string[]).includes(file.type) : false;
  }

  /**
   * Get file type category
   */
  static getFileTypeCategory(file: File): string {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('audio/')) return 'audio';
    return 'document';
  }

  /**
   * Suggest optimal message type for file
   */
  static suggestMessageType(file: File): string {
    const category = this.getFileTypeCategory(file);
    
    switch (category) {
      case 'image':
        return WHATSAPP_MESSAGE_TYPES.IMAGE;
      case 'video':
        return WHATSAPP_MESSAGE_TYPES.VIDEO;
      case 'audio':
        return WHATSAPP_MESSAGE_TYPES.AUDIO;
      default:
        return WHATSAPP_MESSAGE_TYPES.DOCUMENT;
    }
  }
}


export const whatsappMediaValidation = WhatsAppMediaValidationService;
