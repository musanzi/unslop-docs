import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';

const maximumUploadPages = 30;

@Injectable()
export class DocumentPageValidator {
  async validate(bytes: Buffer): Promise<number> {
    let response: Response;
    try {
      response = await fetch('http://renderer:8091/pages', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(65000),
        headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        body: new Uint8Array(bytes)
      });
    } catch {
      throw new ServiceUnavailableException('Page counting is unavailable. Retry your upload shortly.');
    }
    if (response.status === 422) {
      await response.body?.cancel();
      throw new BadRequestException(
        'This DOCX could not be rendered to check its pages. Save it again in Word and retry.'
      );
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new ServiceUnavailableException('Page counting is busy or unavailable. Retry your upload shortly.');
    }
    let result: { pages?: unknown; sha256?: unknown };
    try {
      result = await response.json();
      if (
        !result ||
        !Number.isSafeInteger(result.pages) ||
        Number(result.pages) < 1 ||
        result.sha256 !== createHash('sha256').update(bytes).digest('hex')
      )
        throw new Error('Invalid page count');
    } catch {
      throw new ServiceUnavailableException('Page counting returned an invalid result. Retry your upload shortly.');
    }
    const pages = Number(result.pages);
    if (pages > maximumUploadPages)
      throw new BadRequestException(
        `This document renders as ${pages} pages. The upload limit is ${maximumUploadPages} pages, including cover pages, references, and blank pages.`
      );
    return pages;
  }
}
