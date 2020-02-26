import Tree from './tree'
import async from 'async'
import Database from '../../database/index'
import { Environment } from './inxtdeps'
import temp from 'temp'
import path from 'path'
import fs from 'fs'
import Sync from './sync'
import CheckDiskSpace from 'check-disk-space'
import electron from 'electron'

const app = electron.remote.app

async function _getStorjCredentials() {
  const mnemonic = await Database.Get('xMnemonic')
  const userInfo = (await Database.Get('xUser')).user

  const options = {
    bridgeUrl: 'https://api.internxt.com',
    bridgeUser: userInfo.email,
    bridgePass: userInfo.userId,
    encryptionKey: mnemonic
  }

  return options
}

function _getEnvironment() {
  return new Promise(async (resolve, reject) => {
    const options = await _getStorjCredentials()
    const storj = new Environment(options)
    resolve(storj)
  })
}

function DownloadFileTemp(fileObj, silent = false) {
  return new Promise(async (resolve, reject) => {
    const storj = await _getEnvironment()

    const originalFileName = path.basename(fileObj.fullpath)

    const tempPath = temp.dir
    const tempFilePath = path.join(tempPath, fileObj.fileId + '.dat')

    // Delete temp file
    if (fs.existsSync(tempFilePath)) { try { fs.unlinkSync(tempFilePath) } catch (e) { } }

    storj.resolveFile(fileObj.bucket, fileObj.fileId, tempFilePath, {
      progressCallback: function (progress, downloadedBytes, totalBytes) {
        if (!silent) {
          let progressPtg = progress * 100
          progressPtg = progressPtg.toFixed(2)
          app.emit('set-tooltip', 'Downloading ' + originalFileName + ' (' + progressPtg + '%)')
          // console.log('download progress:', progress)
        } else {
          app.emit('set-tooltip', 'Checking ' + originalFileName)
        }
      },
      finishedCallback: function (err) {
        app.emit('set-tooltip')
        if (err) { reject(err) } else {
          console.log('FINISHED CALLBACK', fileObj)
          Sync.SetModifiedTime(tempFilePath, fileObj.created_at)
            .then(() => resolve(tempFilePath))
            .catch(reject)
        }
      }
    })
  })
}

function RestoreFile(fileObj) {
  return new Promise(async (resolve, reject) => {
    const storj = await _getEnvironment()
    Sync.UploadFile(storj, fileObj.fullpath).then(() => resolve()).catch(reject)
  })
}

function DownloadAllFiles() {
  return new Promise((resolve, reject) => {
    Tree.GetFileListFromRemoteTree().then(list => {
      async.eachSeries(list, async (item, next) => {
        console.log('Cheking file', item.fullpath)

        const freeSpace = await CheckDiskSpace(path.dirname(item.fullpath))

        if (item.size * 3 >= freeSpace) { return next('No space left') }

        let downloadAndReplace = false
        let uploadAndReplace = false
        let ignoreThisFile = false

        const localExists = fs.existsSync(item.fullpath)

        if (localExists) {
          const stat = fs.lstatSync(item.fullpath)

          const remoteTime = new Date(item.created_at)
          const localTime = stat.mtime

          if (remoteTime > localTime) { downloadAndReplace = true }
          if (localTime > remoteTime) { uploadAndReplace = true }
        } else {
          const isLocallyDeleted = await Database.TempGet(item.fullpath)
          if (isLocallyDeleted && isLocallyDeleted.value === 'unlink') {
            ignoreThisFile = true
          } else {
            downloadAndReplace = true
          }
        }

        if (ignoreThisFile) {
          try { fs.unlinkSync(item.fullpath) } catch (e) { }
          Database.TempDel(item.fullpath)
          return next()
        } else if (downloadAndReplace) {
          console.log('DOWNLOAD AND REPLACE WITHOUT QUESTION', item.fullpath)
          DownloadFileTemp(item).then(tempPath => {
            if (localExists) { try { fs.unlinkSync(item.fullpath) } catch (e) { } }
            fs.renameSync(tempPath, item.fullpath)
            next(null)
          }).catch(err => {
            // On error by shard, upload again
            console.log(err)
            if (localExists) {
              console.error('Fatal error: Can\'t restore remote file: local is older')
            } else {
              console.error('Fatal error: Can\'t restore remote file: local does not exists')
            }
            next()
          })
        } else if (uploadAndReplace) {
          let storj = await _getEnvironment()
          Sync.UploadFile(storj, item.fullpath).then(() => next()).catch(next)
        } else {
          // Check if should download to ensure file
          let shouldEnsureFile = false
          if (!shouldEnsureFile) {
            return next()
          }
          console.log('DOWNLOAD JUST TO ENSURE FILE')
          // Check file is ok
          DownloadFileTemp(item, true).then(tempPath => next()).catch(err => {
            if (err.message === 'File missing shard error' && localExists) {
              console.error('Missing shard error. Reuploading...')
              RestoreFile(item).then(() => next()).catch(next)
            } else {
              console.error('Cannot upload local final')
              next(err)
            }
          })
        }
      }, (err, result) => {
        if (err) { reject(err) } else { resolve() }
      })
    }).catch(reject)
  })
}

function UploadAllNewFiles() {
  return new Promise(async (resolve, reject) => {
    const localPath = await Database.Get('xPath')
    const arbol = Tree.GetListFromFolder(localPath)
    const storj = await _getEnvironment()

    async.eachSeries(arbol, async function (item, next) {
      var stat = Tree.GetStat(item)

      if (stat.isFile()) {
        // Is a file
        let entry = await Database.FileGet(item)
        if (!entry) {
          // File only exists in local
          console.log('New local file:', item)
          if (stat.size === 0) {
            console.log('Warning: Filesize 0. Ignoring file.')
            next()
          } else {
            Sync.UploadNewFile(storj, item).then(() => next()).catch(next)
          }
        } else { next() }
      } else {
        next()
      }
    }, (err, result) => {
      if (err) {
        if (err.message.includes('already exists')) {
          resolve()
        } else {
          console.error('Downloader Error uploading file', err)
          reject(err)
        }
      } else {
        resolve()
      }
    })
  })
}

function UploadAllNewFolders() {
  return new Promise(async (resolve, reject) => {
    const localPath = await Database.Get('xPath')
    const userInfo = await Database.Get('xUser')

    let lastParentId = null
    let lastParentFolder = null

    Tree.GetLocalFolderList(localPath).then(list => {
      async.eachSeries(list, async (item, next) => {
        console.log('Checking folder %s', item)
        // Check if exists in database
        const dbEntry = await Database.FolderGet(item)

        if (dbEntry) { return next() }

        // Substract local path
        const folderName = path.basename(item)
        const parentPath = path.dirname(item)

        let lastFolder = await Database.FolderGet(parentPath)
        let lastFolderId = lastFolder && lastFolder.value && lastFolder.value.id
        let parentId = parentPath === localPath ? userInfo.user.root_folder_id : lastFolderId

        if (parentPath === lastParentFolder) {
          parentId = lastParentId
        } else if (lastParentFolder) {
          lastParentFolder = null
          lastParentId = null
        }

        if (parentId) {
          Sync.RemoteCreateFolder(folderName, parentId).then(async (result) => {
            console.log('Remote create folder result', result)
            await Database.FolderSet(item, result)
            lastParentId = result ? result.id : null
            lastParentFolder = result ? item : null
            next()
          }).catch(err => {
            console.error('Error creating remote folder', err)
            next(err)
          })
        } else {
          console.error('Upload new folders: Undefined parent ID')
          next()
        }
      }, (err) => {
        if (err) {
          console.error(err)
          reject(err)
        } else { resolve() }
      })
    }).catch(reject)
  })
}

export default {
  DownloadAllFiles,
  UploadAllNewFiles,
  UploadAllNewFolders
}
