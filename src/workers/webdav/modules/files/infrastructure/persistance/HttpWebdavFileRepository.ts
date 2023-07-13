import { Axios } from 'axios';
import { FileCreatedResponseDTO } from 'shared/HttpClient/responses/file-created';
import { Nullable } from 'shared/types/Nullable';
import { ServerFile } from '../../../../../filesystems/domain/ServerFile';
import { ServerFolder } from '../../../../../filesystems/domain/ServerFolder';
import { WebdavFile } from '../../domain/WebdavFile';
import { WebdavFileRepository } from '../../domain/WebdavFileRepository';
import * as uuid from 'uuid';
import { Traverser } from '../../../../modules/items/application/Traverser';
import { AddFileDTO } from './dtos/AddFileDTO';
import { UpdateFileParentDirDTO } from './dtos/UpdateFileParentDirDTO';
import { UpdateFileNameDTO } from './dtos/UpdateFileNameDTO';
import { FilePath } from '../../domain/FilePath';
import { WebdavIpc } from '../../../../ipc';
import { RemoteItemsGenerator } from '../../../items/application/RemoteItemsGenerator';
import { FileStatuses } from '../../domain/FileStatus';
import { Crypt } from '../../../shared/domain/Crypt';
import { Stopwatch } from 'shared/types/Stopwatch';
import Logger from 'electron-log';
export class HttpWebdavFileRepository implements WebdavFileRepository {
  private files: Record<string, WebdavFile> = {};

  constructor(
    private readonly crypt: Crypt,
    private readonly httpClient: Axios,
    private readonly trashHttpClient: Axios,
    private readonly traverser: Traverser,
    private readonly bucket: string,
    private readonly ipc: WebdavIpc
  ) {}

  private async getTree(): Promise<{
    files: ServerFile[];
    folders: ServerFolder[];
  }> {
    const remoteItemsGenerator = new RemoteItemsGenerator(this.ipc);
    return remoteItemsGenerator.getAll();
  }

  public async init(): Promise<void> {
    const stopWatch = new Stopwatch();
    stopWatch.start();
    const raw = await this.getTree();
    stopWatch.finish();

    Logger.info(
      `WebdavFileRepository tree generated in ${stopWatch.elapsedTime()}`
    );
    this.traverser.reset();
    const all = this.traverser.run(raw);

    const files = Object.entries(all).filter(
      ([_key, value]) => value.isFile() && value.hasStatus(FileStatuses.EXISTS)
    ) as Array<[string, WebdavFile]>;

    this.files = files.reduce((items, [key, value]) => {
      items[key] = value;
      return items;
    }, {} as Record<string, WebdavFile>);
  }

  search(path: FilePath): Nullable<WebdavFile> {
    const item = this.files[path.value];

    if (!item) return;

    return WebdavFile.from(item.attributes());
  }

  async delete(file: WebdavFile): Promise<void> {
    const result = await this.trashHttpClient.post(
      `${process.env.NEW_DRIVE_URL}/drive/storage/trash/add`,
      {
        items: [
          {
            type: 'file',
            id: file.fileId,
          },
        ],
      }
    );

    if (result.status === 200) {
      delete this.files[file.path];

      await this.ipc.invoke('UPDATE_ITEM');
    }
  }

  async add(file: WebdavFile): Promise<void> {
    const encryptedName = this.crypt.encryptName(
      file.name,
      file.folderId.toString()
    );

    if (!encryptedName) {
      throw new Error('Failed to encrypt name');
    }

    const body: AddFileDTO = {
      file: {
        bucket: this.bucket,
        encrypt_version: '03-aes',
        fileId: file.fileId,
        file_id: file.fileId,
        folder_id: file.folderId,
        name: encryptedName,
        plain_name: file.name,
        size: file.size,
        type: file.type,
        modificationTime: Date.now(),
      },
    };

    // TODO: MAKE SURE ALL FIELDS ARE CORRECT
    const result = await this.httpClient.post<FileCreatedResponseDTO>(
      `${process.env.API_URL}/api/storage/file`,
      body
    );

    if (result.status === 500) {
      //rollback
    }

    const created = WebdavFile.from({
      ...result.data,
      folderId: result.data.folder_id,
      size: parseInt(result.data.size, 10),
      path: file.path,
      status: FileStatuses.EXISTS,
    });

    this.files[file.path] = created;
  }

  async updateName(file: WebdavFile): Promise<void> {
    const url = `${process.env.API_URL}/api/storage/file/${file.fileId}/meta`;

    const body: UpdateFileNameDTO = {
      metadata: { itemName: file.name },
      bucketId: this.bucket,
      relativePath: uuid.v4(),
    };

    const res = await this.httpClient.post(url, body);

    if (res.status !== 200) {
      throw new Error(
        `[REPOSITORY] Error updating item metadata: ${res.status}`
      );
    }

    const oldFileEntry = Object.entries(this.files).filter(
      ([_, f]) => f.fileId === file.fileId && f.name !== file.name
    )[0];

    if (oldFileEntry) {
      delete this.files[oldFileEntry[0]];
    }

    this.files[file.path] = WebdavFile.from(file.attributes());
  }

  async updateParentDir(item: WebdavFile): Promise<void> {
    const url = `${process.env.API_URL}/api/storage/move/file`;
    const body: UpdateFileParentDirDTO = {
      destination: item.folderId,
      fileId: item.fileId,
    };

    const res = await this.httpClient.post(url, body);

    if (res.status !== 200) {
      throw new Error(`[REPOSITORY] Error moving item: ${res.status}`);
    }

    await this.init();
  }

  async searchOnFolder(folderId: number): Promise<Array<WebdavFile>> {
    await this.init();
    return Object.values(this.files).filter((file) => file.hasParent(folderId));
  }
}
