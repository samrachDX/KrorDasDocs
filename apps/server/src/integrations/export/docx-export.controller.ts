import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { IsString } from 'class-validator';
import { FastifyReply } from 'fastify';
import { InjectKysely } from 'nestjs-kysely';
import { getSchema } from '@tiptap/core';
import { Node as PMNode } from '@tiptap/pm/model';
import { pageNodeToDocxBuffer } from '@docmost/editor-ext';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { User } from '@docmost/db/types/entity.types';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { getPageTitle, sanitizeFileName } from '../../common/helpers';
import { tiptapExtensions } from '../../collaboration/collaboration.util';
import { getProsemirrorContent } from '../../common/helpers/prosemirror/utils';
import { StorageService } from '../storage/storage.service';

class DocxExportDto {
  @IsString()
  pageId: string;
}

const FILE_URL = /\/api\/files\/([0-9a-f-]{36})\//i;

/**
 * Word export for a single page. Same route the web client already calls.
 * UI spec blocks become tables in the source spec layout.
 */
@Controller()
export class DocxExportController {
  constructor(
    private readonly pageRepo: PageRepo,
    private readonly pageAccessService: PageAccessService,
    private readonly storageService: StorageService,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('docx-export')
  async exportDocx(
    @Body() dto: DocxExportDto,
    @AuthUser() user: User,
    @Res() res: FastifyReply,
  ) {
    const page = await this.pageRepo.findById(dto.pageId, {
      includeContent: true,
    });
    if (!page || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }
    await this.pageAccessService.validateCanView(page, user);

    const json = getProsemirrorContent(page.content);
    json.content = [
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: getPageTitle(page.title) }],
      },
      ...(json.content ?? []),
    ];

    const schema = getSchema(tiptapExtensions);
    const doc = PMNode.fromJSON(schema, json);

    const buffer = await pageNodeToDocxBuffer(doc as any, (async (
      src: string,
    ) => {
      const m = src.match(FILE_URL);
      if (!m) throw new Error('external image');
      const attachment = await this.db
        .selectFrom('attachments')
        .select(['filePath', 'workspaceId'])
        .where('id', '=', m[1])
        .executeTakeFirst();
      if (!attachment || attachment.workspaceId !== page.workspaceId) {
        throw new Error('attachment not found');
      }
      return this.storageService.read(attachment.filePath);
    }) as any);

    const fileName =
      sanitizeFileName(page.title || 'untitled', { preserveSpaces: true }) +
      '.docx';
    res.headers({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition':
        'attachment; filename="' + encodeURIComponent(fileName) + '"',
    });
    res.send(buffer);
  }
}
