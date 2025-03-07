import { Readable } from 'stream';
import {
  ContentFileUploader,
  FileUploadEvents,
} from '../../domain/ContentFileUploader';

export class ContentFileUploaderMock implements ContentFileUploader {
  uploadMock = jest.fn();
  onMock = jest.fn();
  elapsedTimeMock = jest.fn();

  upload(contents: Readable, size: number): Promise<string> {
    return this.uploadMock(contents, size);
  }

  on(
    event: keyof FileUploadEvents,
    fn:
      | (() => void)
      | ((progress: number) => void)
      | ((fileId: string) => void)
      | ((error: Error) => void)
  ): void {
    return this.onMock(event, fn);
  }

  elapsedTime(): number {
    return this.elapsedTimeMock();
  }
}
