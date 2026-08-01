import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import type { FileFilterCallback } from 'multer';

const multer = require('multer');
const path = require('path');
const mammoth = require('mammoth');
const { v4 } = require('uuid');
const { PDFParse } = require('pdf-parse');

class FileService {
  maxFileSize: number;
  allowedMimeTypes: string[];
  s3!: S3Client;
  bucket?: string;

  constructor() {
    this.maxFileSize =
      parseInt(process.env.MAX_FILE_SIZE as string) || 10 * 1024 * 1024; // 10MB
    this.allowedMimeTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ];

    this.initializeUploadDirectory();
  }

  async initializeUploadDirectory() {
    try {
      this.s3 = new S3Client({
        region: process.env.AWS_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });
      this.bucket = process.env.AWS_BUCKET_NAME;
    } catch (error) {
      console.error('Failed to create upload directory:', error);
    }
  }

  getMulterConfig() {
    // 1. Use memory storage instead of disk storage
    const storage = multer.memoryStorage();

    const fileFilter = (
      req: Express.Request,
      file: Express.Multer.File,
      cb: FileFilterCallback,
    ) => {
      if (this.allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        // multer ignores the acceptFile arg once an error is passed
        cb(
          new Error('Invalid file type. Only PDF and DOCX files are allowed.'),
        );
      }
    };

    return multer({
      storage,
      fileFilter,
      limits: {
        fileSize: this.maxFileSize,
        files: 1,
      },
    });
  }

  async extractTextFromFile(
    filePath: string,
    fileType: string,
  ): Promise<string> {
    try {
      let extractedText = '';

      switch (fileType.toLowerCase()) {
        case 'pdf':
          extractedText = await this.extractFromPDF(filePath);
          break;
        case 'docx':
          extractedText = await this.extractFromDOCX(filePath);
          break;
        default:
          throw new Error(`Unsupported file type: ${fileType}`);
      }

      return this.cleanExtractedText(extractedText);
    } catch (error) {
      console.error('Text extraction error:', error);
      throw new Error(
        `Failed to extract text from file: ${(error as Error).message}`,
      );
    }
  }

  async extractTextFromLocalFile(dataBuffer: Buffer, fileType: string) {
    // TODO finish the text extraction
    try {
      let extractedText = '';
      let data = null;

      const uint8Array = new Uint8Array(dataBuffer);

      switch (fileType.toLowerCase()) {
        case 'pdf':
          data = new PDFParse(uint8Array);
          extractedText = (await data.getText()).text;
          break;
        case 'docx':
          data = await mammoth.extractRawText({ buffer: dataBuffer });
          extractedText = data.value;
          break;
        default:
          throw new Error(`Unsupported file type: ${fileType}`);
      }

      return this.cleanExtractedText(extractedText);
    } catch (error) {
      console.error('Text extraction error:', error);
      throw new Error(
        `Failed to extract text from file: ${(error as Error).message}`,
      );
    }
  }

  async extractFromPDF(fileKey: string): Promise<string> {
    try {
      const { Body } = await this.s3.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: fileKey }),
      );
      const dataBuffer = await Body.transformToByteArray();

      const data = new PDFParse(dataBuffer);
      return (await data.getText()).text;
    } catch (error) {
      throw new Error(`PDF extraction failed: ${(error as Error).message}`);
    }
  }

  async extractFromDOCX(fileKey: string): Promise<string> {
    try {
      const { Body } = await this.s3.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: fileKey }),
      );
      const dataBuffer = await Body.transformToByteArray();
      const buffer = Buffer.from(dataBuffer);

      const result = await mammoth.extractRawText({ buffer: buffer });
      return result.value;
    } catch (error) {
      throw new Error(`DOCX extraction failed: ${(error as Error).message}`);
    }
  }

  /**
   * Enhanced extraction that captures both the section titles (headers)
   * and the content within them.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- recurses over an arbitrarily nested, dynamically-shaped CV JSON tree
  extractTextFromBuilderCv(obj: any): string {
    let text = '';

    for (const key in obj) {
      // 1. If the key is a section title (e.g., "experience"), add it to the text
      // We filter out generic keys like 'cv' or 'metadata'
      if (isNaN(Number(key)) && key !== 'cv' && key !== 'design') {
        text += key + ' ';
      }

      const value = obj[key];

      // 2. Standard recursive extraction for the values
      if (typeof value === 'string') {
        text += value + ' ';
      } else if (Array.isArray(value)) {
        value.forEach((item) => {
          if (typeof item === 'string') text += item + ' ';
          else text += this.extractTextFromBuilderCv(item);
        });
      } else if (typeof value === 'object' && value !== null) {
        text += this.extractTextFromBuilderCv(value);
      }
    }

    return text.trim();
  }

  cleanExtractedText(text: string): string {
    if (!text) return '';

    return text
      .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
      .replace(/\n\s*\n/g, '\n') // Remove empty lines
      .trim();
  }

  getFileTypeFromMimeType(mimeType: string): string {
    const mimeToType: Record<string, string> = {
      'application/pdf': 'pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        'docx',
      'application/msword': 'doc',
    };
    return mimeToType[mimeType] || 'unknown';
  }

  async storeFile(
    buffer: Buffer,
    originalName: string,
    mimeType = 'application/pdf',
  ): Promise<string> {
    const key = `resumes/${this.generateUniqueFilename(originalName)}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );

    return key;
  }

  async deleteFile(fileKey: string): Promise<boolean> {
    try {
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: fileKey,
        }),
      );
      return true;
    } catch (error) {
      console.error('File deletion error:', error);
      return false;
    }
  }

  validateFileSize(fileSize: number): boolean {
    return fileSize <= this.maxFileSize;
  }

  validateFileType(mimeType: string): boolean {
    return this.allowedMimeTypes.includes(mimeType);
  }

  getFileExtension(filename: string): string {
    return path.extname(filename).toLowerCase();
  }

  generateUniqueFilename(originalName: string): string {
    const ext = this.getFileExtension(originalName);
    return `${v4()}-${Date.now()}${ext}`;
  }
}

const fileService = new FileService();

module.exports = fileService;
