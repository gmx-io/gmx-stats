import sizeof from 'object-sizeof'

import { getLogger } from './helpers'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

class TtlCache {
  constructor(ttl = 60, maxKeys) {
    this._cache = {}
    this._ttl = ttl
    this._maxKeys = maxKeys
    this._logger = getLogger('routes.TtlCache')
  }

  get(key) {
    this._logger.debug('get key %s', key)
    return this._cache[key]
  }

  set(key, value) {
    this._cache[key] = value

    const keys = Object.keys(this._cache)
    if (this._maxKeys && keys.length >= this._maxKeys) {
      for (let i = 0; i <= keys.length - this._maxKeys; i++) {
        this._logger.debug('delete key %s (max keys)', key)
        delete this._cache[keys[i]]
      }
    }

    setTimeout(() => {
      this._logger.debug('delete key %s (ttl)', key)
      delete this._cache[key]
    }, this._ttl * 1000)

    if (!IS_PRODUCTION) {
      console.time('sizeof call')
      const size = sizeof(this._cache) / 1024 / 1024
      console.timeEnd('sizeof call')
      this._logger.debug('TtlCache cache size %s MB', size)
    }
  }
}

module.exports = TtlCache