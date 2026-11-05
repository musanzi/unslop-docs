import { FindAllowance } from './queries/find-allowance.handler';
import { AllowanceResponse } from './dto/allowance-response';
import { FindDocument } from './queries/find-document.handler';
import { DocumentAssessmentResponse } from './dto/document-assessment-response';
import {
  Body,
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
import { UnslopifyDocument } from './commands/unslopify-document.handler';
import { UnslopifyDocumentDto } from './dto/unslopify-document.dto';
import { FindDocumentPreview } from './queries/find-document-preview.handler';
import { DocumentPreviewResponse } from './dto/document-preview-response';
import { FindDocuments } from './queries/find-documents.handler';
import { DownloadDocument } from './queries/download-document.handler';
import { DocumentPage, DocumentResponse } from './dto/document-response';
import { ListDocumentsDto } from './dto/list-documents.dto';

@ApiTags('documents')
@ApiUnauthorizedResponse({ description: 'Sign-in required' })
@Controller('documents')
export class DocumentsController extends AbstractController {
  @Post(':id/unslopify')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Start rewriting your assessed document with the chosen strength',
    description:
      'Reserves one monthly allowance slot in the same transaction that queues rewriting. The final assessment runs automatically after rewriting, and the slot is charged only when the revised download is ready.'
  })
  @ApiOkResponse({ type: DocumentResponse })
  @ApiBadRequestResponse({ description: 'Rewrite strength is not an integer from 1 to 100' })
  @ApiNotFoundResponse({ description: 'Document does not exist or belongs to another user' })
  @ApiConflictResponse({
    description:
      'Document is not assessed, rewriting is already queued or complete, or the monthly allowance is fully used or reserved'
  })
  @ApiServiceUnavailableResponse({ description: 'Unslopify could not be confirmed. Refresh history before retrying.' })
  unslopify(
    @CurrentUser('id') ownerId: string,
    @Param('id') id: string,
    @Body() body: UnslopifyDocumentDto
  ): Promise<DocumentResponse> {
    return this.commandHandler.execute(new UnslopifyDocument(ownerId, id, body.strength));
  }

  @Post(':id/retry')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Retry your failed document using its stored original',
    description:
      'A failed initial assessment is queued again without a reservation. A failed rewrite keeps its assessment and strength and reserves a new slot.'
  })
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
  @ApiOperation({ summary: 'Upload a private original DOCX and queue its initial assessment' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } }
  })
  @ApiCreatedResponse({ type: DocumentResponse, description: 'Original saved and queued for its initial assessment' })
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

  @Get(':id/preview')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Read the private read-only preview of your original',
    description: 'Available once the initial assessment is published. Blocks follow the original structure in order.'
  })
  @ApiOkResponse({ type: DocumentPreviewResponse })
  @ApiNotFoundResponse({ description: 'Document does not exist, belongs to another user, or is not assessed yet' })
  @ApiServiceUnavailableResponse({ description: 'Preview could not be loaded' })
  preview(@CurrentUser('id') ownerId: string, @Param('id') id: string): Promise<DocumentPreviewResponse> {
    return this.queryHandler.execute(new FindDocumentPreview(ownerId, id));
  }

  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read your document status, assessments and revision notices' })
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
