import log from 'electron-log'

let Logger = console

log.transports.file.maxSize = 1048576 * 150 // 150MB
log.transports.console.format = '[{iso}] [{level}] {text}'

Logger = log

export default Logger
