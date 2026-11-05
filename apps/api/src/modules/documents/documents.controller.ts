import { FindDocument } from './queries/find-document.handler';
import { DocumentAssessmentResponse } from './dto/document-assessment-response';
import {
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common';
import { DocumentUploadInterceptor } from './document-upload.interceptor';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiProduces,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse
} from '@nestjs/swagger';
import { AbstractController } from '@api/shared/abstracts';
import { CurrentUser } from '../auth/decorators';
import { UploadDocument } from './commands/upload-document.handler';
import { FindDocuments } from './queries/find-documents.handler';
import { DownloadOriginal } from './queries/download-original.handler';
import { DocumentPage, DocumentResponse } from './dto/document-response';
import { ListDocumentsDto } from './dto/list-documents.dto';

@ApiTags('documents')
@ApiUnauthorizedResponse({ description: 'Sign-in required' })
@Controller('documents')
export class DocumentsController extends AbstractController {
  @Post()
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(DocumentUploadInterceptor)
  @ApiOperation({ summary: 'Upload a private original DOCX' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } }
  })
  @ApiCreatedResponse({ type: DocumentResponse })
  @ApiBadRequestResponse({ description: 'Missing, invalid or unsafe DOCX content' })
  @ApiPayloadTooLargeResponse({ description: 'Original exceeds 10,000,000 bytes' })
  @ApiServiceUnavailableResponse({ description: 'Upload could not be confirmed; refresh history before retrying' })
  upload(@CurrentUser('id') ownerId: string, @UploadedFile() file: Express.Multer.File): Promise<DocumentResponse> {
    return this.commandHandler.execute(new UploadDocument(ownerId, file));
  }

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List your documents, newest first' })
  @ApiOkResponse({ type: DocumentPage })
  @ApiBadRequestResponse({ description: 'Invalid pagination' })
  list(@CurrentUser('id') ownerId: string, @Query() pagination: ListDocumentsDto): Promise<DocumentPage> {
    return this.queryHandler.execute(new FindDocuments(ownerId, pagination));
  }

  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read your document status and writing assessment' })
  @ApiOkResponse({ type: DocumentAssessmentResponse })
  @ApiNotFoundResponse({ description: 'Document does not exist or belongs to another user' })
  @ApiServiceUnavailableResponse({ description: 'Document could not be loaded' })
  detail(@CurrentUser('id') ownerId: string, @Param('id') id: string): Promise<DocumentAssessmentResponse> {
    return this.queryHandler.execute(new FindDocument(ownerId, id));
  }

  @Get(':id/original')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({ summary: 'Download your original document' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  @ApiOkResponse({ description: 'Original DOCX bytes', schema: { type: 'string', format: 'binary' } })
  @ApiNotFoundResponse({ description: 'Document does not exist or belongs to another user' })
  original(@CurrentUser('id') ownerId: string, @Param('id') id: string): Promise<StreamableFile> {
    return this.queryHandler.execute(new DownloadOriginal(ownerId, id));
  }
}
