import { WebdavIpc } from '../../../ipc';
import { FolderPath } from '../domain/FolderPath';
import { Folder } from '../domain/Folder';
import { FolderRepository } from '../domain/FolderRepository';

export class WebdavFolderRenamer {
  constructor(
    private readonly repository: FolderRepository,
    private readonly ipc: WebdavIpc
  ) {}

  async run(folder: Folder, destination: string) {
    const path = new FolderPath(destination);

    this.ipc.send('WEBDAV_FOLDER_RENAMING', {
      oldName: folder.name,
      newName: path.name(),
    });

    folder.rename(path);

    await this.repository.updateName(folder);

    this.ipc.send('WEBDAV_FOLDER_RENAMED', {
      oldName: folder.name,
      newName: path.name(),
    });
  }
}
