import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { v7 } from 'uuid';
import * as mammoth from 'mammoth';
import { StorageService } from '../../storage/storage.service';
import { getAttachmentFolderPath } from '../../../core/attachment/attachment.utils';
import { AttachmentType } from '../../../core/attachment/attachment.constants';

/**
 * Word (.docx) import built on mammoth. Images are stored as page
 * attachments. Tables whose header is "ID | Items | Description |
 * Displayed Content / Context | Specification" are turned into UI spec
 * blocks by the UiSpec extension's HTML parser.
 */
@Injectable()
export class DocxBasicImportService {
  private readonly logger = new Logger(DocxBasicImportService.name);

  constructor(
    private readonly storageService: StorageService,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  async convertDocxToHtml(
    fileBuffer: Buffer,
    workspaceId: string,
    spaceId: string,
    pageId: string,
    userId: string,
  ): Promise<string> {
    const uploads: Array<{
      id: string;
      fileName: string;
      storagePath: string;
      buffer: Buffer;
      mimeType: string;
    }> = [];

    const result = await mammoth.convertToHtml(
      { buffer: fileBuffer },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          const buffer = Buffer.from(await image.readAsBuffer());
          const ext = (image.contentType?.split('/')[1] || 'png').replace(
            'jpeg',
            'jpg',
          );
          const id = v7();
          const fileName = `image.${ext}`;
          const storagePath = `${getAttachmentFolderPath(
            AttachmentType.File,
            workspaceId,
          )}/${id}/${fileName}`;
          uploads.push({
            id,
            fileName,
            storagePath,
            buffer,
            mimeType: image.contentType || 'image/png',
          });
          return { src: `/api/files/${id}/${fileName}` };
        }),
      },
    );

    for (const u of uploads) {
      try {
        await this.storageService.upload(u.storagePath, u.buffer);
        await this.db
          .insertInto('attachments')
          .values({
            id: u.id,
            filePath: u.storagePath,
            fileName: u.fileName,
            fileSize: u.buffer.length,
            mimeType: u.mimeType,
            type: 'file',
            fileExt: `.${u.fileName.split('.').pop()}`,
            creatorId: userId,
            workspaceId,
            pageId,
            spaceId,
          })
          .execute();
      } catch (err) {
        this.logger.warn(`Failed to store image from docx: ${err}`);
      }
    }

    return result.value;
  }
}
