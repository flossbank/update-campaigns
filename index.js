const aws = require('aws-sdk')
const { MongoClient } = require('mongodb')

const MONGO_DB = 'flossbank_db'
const AD_CAMPAIGNS_COLLECTION = 'adCampaigns'

const kms = new aws.KMS()

const decrypt = async data => kms.decrypt({
  CiphertextBlob: Buffer.from(data, 'base64')
}).promise().then(decrypted => decrypted.Plaintext.toString())

const getMongoClient = async () => {
  const mongoUri = await decrypt(process.env.MONGO_URI)
  const mongoClient = new MongoClient(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  return mongoClient.connect()
}

exports.handler = async () => {
  const mongoClient = await getMongoClient()
  const db = mongoClient.db(MONGO_DB)
  const bulkCampaigns = db.collection(AD_CAMPAIGNS_COLLECTION).initializeUnorderedBulkOp()

  bulkCampaigns.find({
    expires: { $lte: Date.now() }
  }).updateOne({
    $set: { active: false }
  })

  await bulkCampaigns.execute()
}
