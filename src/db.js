import path from 'path'
import Logger from 'console-log-level'
import sqlite3 from 'sqlite3'

import { getLogger } from './helpers'

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

function logQuery(name, start, query, args) {
  logger.debug('%s took: %s ms.',
    name,
    Date.now() - start,
    query.replace(/\s+/g, ' ').trim(),
    JSON.stringify(args)
  )
}
