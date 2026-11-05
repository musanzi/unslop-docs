import { FindAllowance } from './queries/find-allowance.handler';
import { AllowanceResponse } from './dto/allowance-response';
import { FindDocument } from './queries/find-document.handler';
import { DocumentAssessmentResponse } from './dto/document-assessment-response';
import {
  Controller,
  Get,
  Header,
  HttpCode,
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
  ApiConflictResponse,
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
import { RetryDocument } from './commands/retry-document.handler';
import { FindDocuments } from './queries/find-documents.handler';
import { DownloadDocument } from './queries/download-document.handler';
import { DocumentPage, DocumentResponse } from './dto/document-response';
import { ListDocumentsDto } from './dto/list-documents.dto';

@ApiTags('documents')
@ApiUnauthorizedResponse({ description: 'Sign-in required' })
@Controller('documents')
export class DocumentsController extends AbstractController {
  @Post(':id/retry')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Retry your failed document using its stored original' })
  @ApiOkResponse({ type: DocumentResponse })
  @ApiNotFoundResponse({ description: 'Document does not exist or belongs to another user' })
  @ApiConflictResponse({ description: 'Document is not failed, or monthly allowance is fully used or reserved' })
  @ApiServiceUnavailableResponse({ description: 'Retry could not be confirmed. Refresh history before retrying.' })
  retry(@CurrentUser('id') ownerId: string, @Param('id') id: string): Promise<DocumentResponse> {
    return this.commandHandler.execute(new RetryDocument(ownerId, id));
  }

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(DocumentUploadInterceptor)
  @ApiOperation({ summary: 'Upload a private original DOCX' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } }
  })
  @ApiCreatedResponse({ type: DocumentResponse })
  @ApiConflictResponse({
    description: 'Monthly allowance fully used or reserved; message includes limit and UTC reset'
  })
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

  @Get('allowance')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read your current UTC monthly allowance' })
  @ApiOkResponse({ type: AllowanceResponse })
  allowance(@CurrentUser('id') ownerId: string): Promise<AllowanceResponse> {
    return this.queryHandler.execute(new FindAllowance(ownerId));
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
    return this.queryHandler.execute(new DownloadDocument(ownerId, id));
  }
  @Get(':id/revised')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Download your validated revised DOCX' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiNotFoundResponse({ description: 'Document or validated revision unavailable' })
  revised(@CurrentUser('id') ownerId: string, @Param('id') id: string): Promise<StreamableFile> {
    return this.queryHandler.execute(new DownloadDocument(ownerId, id, 'revised'));
  }
}
