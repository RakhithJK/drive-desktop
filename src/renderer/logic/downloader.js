import path from 'path'
import fs, { createWriteStream } from 'fs'
import CheckDiskSpace from 'check-disk-space'
import Logger from '../../libs/logger'
import mkdirp from 'mkdirp'
import Folder from './folder'
import getEnvironment from './utils/localuploadProcess'
import FileLogger from './FileLogger'

const { app } = require('@electron/remote')

async function downloadFileTemp(cloudFile, filePath) {
  const storj = await getEnvironment()
  storj.config.download = { concurrency: 10 }
  const originalFileName = path.basename(filePath)

  const tempPath = Folder.getTempFolderPath()
  const freeSpace = await CheckDiskSpace(path.dirname(filePath))
  if (cloudFile.size * 3 >= freeSpace) {
    throw new Error('No space left')
  }
  if (!fs.existsSync(tempPath)) {
    mkdirp.sync(tempPath)
  }
  const tempFilePath = path.join(tempPath, cloudFile.fileId + '.dat')

  Logger.log('Delete temp file', tempFilePath)
  // Delete temp file
  if (fs.existsSync(tempFilePath)) {
    try {
      fs.unlinkSync(tempFilePath)
    } catch (e) {
      Logger.error('Delete temp file: Cannot delete', e.message)
    }
  }
  Logger.log(
    'DRIVE resolveFile, bucket: %s, file: %s',
    cloudFile.bucket,
    cloudFile.fileId
  )

  return new Promise((resolve, reject) => {
    try {
      const state = storj.download(cloudFile.bucket, cloudFile.fileId, {
        progressCallback: function (progress) {
          let progressPtg = progress * 100
          progressPtg = progressPtg.toFixed(2)
          app.emit(
            'set-tooltip',
            'Downloading ' + originalFileName + ' (' + progressPtg + '%).'
          )
          FileLogger.push({ filePath: filePath, filename: originalFileName, action: 'download', progress: progressPtg, date: Date() })
        },
        finishedCallback: (err, downloadStream) => {
          if (err || !downloadStream) {
            Logger.error(`download failed, file id: ${cloudFile.fileId}`)
            FileLogger.push({filePath, filename: originalFileName, action: 'download', status: 'error'})
            reject(err)
          } else {
            const writable = createWriteStream(tempFilePath)

            downloadStream.on('data', (chunk) => {
              writable.write(chunk)
            })

            downloadStream.once('end', () => {
              writable.close()
              app.emit('set-tooltip')
              app.removeListener('sync-stop', stopDownloadHandler)
              Logger.log('Download finished')
              resolve(tempFilePath)
            })

            downloadStream.once('error', (err) => {
              writable.close()
              Logger.error(`download failed, file id: ${cloudFile.fileId} ${err}`)
              reject(err)
            })
          }
        }}, { label: 'OneStreamOnly', params: {} })
      const stopDownloadHandler = () => {
        state.stop()
        reject(new Error('stop sync'))
      }
      app.once('sync-stop', stopDownloadHandler)
    } catch (err) {
      reject(err)
    }
  })
}

export default {
  downloadFileTemp
}
