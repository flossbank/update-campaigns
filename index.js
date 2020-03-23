const AWS = require('aws-sdk')
const Config = require('./lib/config')
const Db = require('./lib/mongo')
const Process = require('./lib/process')

const kms = new AWS.KMS({ region: 'us-west-2' })

exports.handler = async () => {
  const config = new Config({ kms })
  const db = new Db({ config })
  const log = console.log
  await db.connect()

  try {
    await Process.process({ db, log })
  } finally {
    db.close()
  }
}
