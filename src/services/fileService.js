import multer from "multer";
import path from "path";
import mammoth from "mammoth";
import { v4 } from "uuid";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  paginateListObjectsV2,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { PDFParse } from "pdf-parse";

export default class FileService {
  constructor() {
    this.maxFileSize = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024; // 10MB
    this.allowedMimeTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
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
      console.error("Failed to create upload directory:", error);
    }
  }

  getMulterConfig() {
    // 1. Use memory storage instead of disk storage
    const storage = multer.memoryStorage();

    const fileFilter = (req, file, cb) => {
      if (this.allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(
          new Error("Invalid file type. Only PDF and DOCX files are allowed."),
          false,
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

  async extractTextFromFile(filePath, fileType) {
    try {
      let extractedText = "";

      switch (fileType.toLowerCase()) {
        case "pdf":
          extractedText = await this.extractFromPDF(filePath);
          break;
        case "docx":
          extractedText = await this.extractFromDOCX(filePath);
          break;
        default:
          throw new Error(`Unsupported file type: ${fileType}`);
      }

      return this.cleanExtractedText(extractedText);
    } catch (error) {
      console.error("Text extraction error:", error);
      throw new Error(`Failed to extract text from file: ${error.message}`);
    }
  }

  async extractFromPDF(fileKey) {
    try {
      const { Body } = await this.s3.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: fileKey }),
      );
      const dataBuffer = await Body.transformToByteArray();

      const data = new PDFParse(dataBuffer);
      return (await data.getText()).text;
    } catch (error) {
      throw new Error(`PDF extraction failed: ${error.message}`);
    }
  }

  async extractFromDOCX(fileKey) {
    try {
      const { Body } = await this.s3.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: fileKey }),
      );
      const dataBuffer = await Body.transformToByteArray();
      const buffer = Buffer.from(dataBuffer);

      const result = await mammoth.extractRawText({ buffer: buffer });
      return result.value;
    } catch (error) {
      throw new Error(`DOCX extraction failed: ${error.message}`);
    }
  }

  /**
   * Enhanced extraction that captures both the section titles (headers)
   * and the content within them.
   */
  extractTextFromBuilderCv(obj) {
    let text = "";

    for (const key in obj) {
      // 1. If the key is a section title (e.g., "experience"), add it to the text
      // We filter out generic keys like 'cv' or 'metadata'
      if (isNaN(Number(key)) && key !== "cv" && key !== "design") {
        text += key + " ";
      }

      const value = obj[key];

      // 2. Standard recursive extraction for the values
      if (typeof value === "string") {
        text += value + " ";
      } else if (Array.isArray(value)) {
        value.forEach((item) => {
          if (typeof item === "string") text += item + " ";
          else text += this.extractTextFromBuilderCv(item);
        });
      } else if (typeof value === "object" && value !== null) {
        text += this.extractTextFromBuilderCv(value);
      }
    }

    return text.trim();
  }

  cleanExtractedText(text) {
    if (!text) return "";

    return text
      .replace(/\s+/g, " ") // Replace multiple whitespace with single space
      .replace(/\n\s*\n/g, "\n") // Remove empty lines
      .trim();
  }

  getFileTypeFromMimeType(mimeType) {
    const mimeToType = {
      "application/pdf": "pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        "docx",
      "application/msword": "doc",
    };
    return mimeToType[mimeType] || "unknown";
  }

  async storeFile(buffer, originalName, mimeType = "application/pdf") {
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

  async deleteFile(fileKey) {
    try {
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: fileKey,
        }),
      );
      return true;
    } catch (error) {
      console.error("File deletion error:", error);
      return false;
    }
  }

  validateFileSize(fileSize) {
    return fileSize <= this.maxFileSize;
  }

  validateFileType(mimeType) {
    return this.allowedMimeTypes.includes(mimeType);
  }

  getFileExtension(filename) {
    return path.extname(filename).toLowerCase();
  }

  generateUniqueFilename(originalName) {
    const ext = this.getFileExtension(originalName);
    return `${v4()}-${Date.now()}${ext}`;
  }
}

const fileService = new FileService();
export { fileService };
