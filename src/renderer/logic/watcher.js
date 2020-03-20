import chokidar from 'chokidar'
import database from '../../database/index'
import Logger from '../../libs/logger'
import { remote } from 'electron'

let watcherStarted = false

function StartWatcher(path) {
  watcherStarted = false
  var watcher = chokidar.watch(path, {
    // eslint-disable-next-line no-useless-escape
    ignored: /[\/\\]\./,
    persistent: true
  })

  function onWatcherReady() {
    watcherStarted = true
    Logger.info('From here can you check for real changes, the initial scan has been completed.')
  }

  const rootFolder = path

  // Declare the listeners of the watcher
  watcher
    .on('add', function (path) {
      if (watcherStarted) {
        Logger.log('File', path, 'has been added')
        database.TempSet(path, 'add')
      }
    })
    .on('addDir', function (path) {
      if (watcherStarted) {
        Logger.log('Directory', path, 'has been added')
        database.TempSet(path, 'addDir')
      }
    })
    .on('change', function (path) {
      if (watcherStarted) {
        Logger.log('File', path, 'has been changed')
        database.TempSet(path, 'add')
      }
    })
    .on('unlink', function (path) {
      if (watcherStarted) {
        Logger.log('File', path, 'has been removed')
        database.TempSet(path, 'unlink')
      }
    })
    .on('unlinkDir', function (path) {
      if (watcherStarted) {
        Logger.log('Directory', path, 'has been removed')
        if (path === rootFolder) {
          database.ClearAll().then(() => {
            remote.getCurrentWindow().close()
          }).catch(() => {
            remote.getCurrentWindow().close()
          })
        } else {
          database.TempSet(path, 'unlinkDir')
        }
      }
    })
    .on('error', function (error) {
      if (watcherStarted) {
        Logger.log('Error happened', error)
      }
    })
    .on('ready', onWatcherReady)
    .on('raw', function (event, path, details) {
      // This event should be triggered everytime something happens.
      // Logger.log('Raw event info:', event, path, details)
    })

  return watcher
}

export default {
  StartWatcher
}
