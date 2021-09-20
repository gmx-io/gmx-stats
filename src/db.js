import path from 'path'
import Logger from 'console-log-level'
import sqlite3 from 'sqlite3'
import { ethers } from 'ethers'

import { getLogger } from './helpers'
const { BigNumber } = ethers

const logger = getLogger('db')

const DB_PATH = path.join(__dirname, '..', 'main.db')

export const db = new sqlite3.Database(DB_PATH)

export function dbAll(query, ...args) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const newArgs = [
      ...args,
      (err, rows) => {
        if (err) return reject(err)
        logQuery('dbAll', start, query, args)
        resolve(rows)
      }
    ]
    db.all(query, ...newArgs)
  })  
}

export function dbRun(query, ...args) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    args.push((err) => {
      if (err) return reject(err)
      logQuery('dbRun', start, query, args)
      resolve()
    })
    db.run(query, ...args)
  })  
}

export async function dbGet(query, ...args) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    args.push((err, row) => {
      if (err) return reject(err)
      logQuery('dbGet', start, query, args)
      resolve(row)
    })
    db.get(query, ...args)
  })
}

export async function getMeta(key) {
  const row = await dbGet('SELECT value FROM meta WHERE key = ?', [key]) 
  if (!row) {
    return null
  }
  const ret = JSON.parse(row.value)
  if (ret.type === 'BigNumber') {
    return BigNumber.from(ret.hex)
  }
  return ret
}

export async function setMeta(key, value) {
  const valueJson = JSON.stringify(value)
  logger.info('setMeta %s %s %s', key, valueJson, typeof value)
  await dbRun(`
    INSERT INTO meta (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = ?
  `, key, valueJson, valueJson)
}

function logQuery(name, start, query, args) {
  logger.debug('%s took: %s ms.',
    name,
    Date.now() - start,
    query.replace(/\s+/g, ' ').trim(),
    JSON.stringify(args)
  )
}
