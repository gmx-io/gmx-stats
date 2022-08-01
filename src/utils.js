function createHttpError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

function toReadable(ts) {
  return (new Date(ts * 1000).toISOString()).replace('T', ' ').replace('.000Z', '')
}

module.exports = {
    sleep,
    toReadable,
    createHttpError
}
