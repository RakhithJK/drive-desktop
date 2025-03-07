import { Readable } from 'stream';
import { FileMother } from '../../../../files/test/domain/FileMother';
import { createDownloadStrategy } from '../../__mocks__/environment/DownloadStratgeyFunctionMock';
import { EnvironmentContentFileDownloader } from '../../../infrastructure/download/EnvironmentContnetFileDownloader';

describe('Environment Content File Downloader', () => {
  const bucket = 'b51fd6af-cdac-51ec-b41c-21958aa4c2ae';
  const file = FileMother.any();

  describe('event emitter', () => {
    it('emits an event on start', async () => {
      const strategy = createDownloadStrategy((callbacks) => {
        callbacks.finishedCallback(null as unknown as Error, Readable.from(''));
      });

      const downloader = new EnvironmentContentFileDownloader(strategy, bucket);

      const handler = jest.fn();

      downloader.on('start', handler);

      await downloader.download(file);

      expect(handler).toBeCalled();
    });

    it('emits an event when the file is downloaded', async () => {
      const strategy = createDownloadStrategy((callbacks) => {
        callbacks.finishedCallback(null as unknown as Error, Readable.from(''));
      });

      const downloader = new EnvironmentContentFileDownloader(strategy, bucket);

      const handler = jest.fn();

      downloader.on('finish', handler);

      await downloader.download(file);

      expect(handler).toBeCalled();
    });

    it('emits an event when there is a progress update', async () => {
      const strategy = createDownloadStrategy((callbacks) => {
        callbacks.progressCallback(25);
        callbacks.progressCallback(50);
        callbacks.progressCallback(75);
        callbacks.finishedCallback(null as unknown as Error, Readable.from(''));
      });

      const downloader = new EnvironmentContentFileDownloader(strategy, bucket);

      const handler = jest.fn();

      downloader.on('progress', handler);

      await downloader.download(file);

      expect(handler.mock.calls).toEqual([[25], [50], [75]]);
    });

    it('emits an event when there is an error', async () => {
      const errorMsg = 'Error uploading file';
      const strategy = createDownloadStrategy((callbacks) => {
        callbacks.finishedCallback(
          { message: errorMsg } as unknown as Error,
          Readable.from('')
        );
      });

      const downloader = new EnvironmentContentFileDownloader(strategy, bucket);

      downloader.on('error', (error: Error) => {
        expect(error.message).toBe(errorMsg);
      });

      await downloader.download(file).catch(() => {
        // no-op
      });
    });
  });

  describe('time watcher', () => {
    it('starts the timer when the file is downloaded', async () => {
      const strategy = createDownloadStrategy((callbacks) => {
        callbacks.progressCallback(50);
        callbacks.finishedCallback(null as unknown as Error, Readable.from(''));
      });

      const downloader = new EnvironmentContentFileDownloader(strategy, bucket);

      downloader.on('progress', () => {
        expect(downloader.elapsedTime()).toBeGreaterThan(-1);
      });

      expect(downloader.elapsedTime()).toBe(-1);

      await downloader.download(file);
    });

    it('stops the timer when the file is not downloaded', async () => {
      const delay = 100;
      const strategy = createDownloadStrategy((callbacks) => {
        callbacks.progressCallback(50);
        setTimeout(() => {
          callbacks.finishedCallback(
            null as unknown as Error,
            Readable.from('')
          );
        }, delay);
      });

      const downloader = new EnvironmentContentFileDownloader(strategy, bucket);

      await downloader.download(file);

      setTimeout(() => {
        expect(downloader.elapsedTime()).toBeGreaterThan(delay - 10);
        expect(downloader.elapsedTime()).toBeLessThan(delay + 10);
      }, delay);
    });
  });
});
