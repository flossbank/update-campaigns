const aws = require('aws-sdk')
const { MongoClient, ObjectId } = require('mongodb')

const MONGO_DB = 'flossbank_db'
const ADVERTISERS_COLLECTION = 'advertisers'

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

const process = async ({ db }) => {
  // first take care of the easy ones (end date has passed)
  const bulkCampaigns = db.collection(ADVERTISERS_COLLECTION).initializeUnorderedBulkOp()
  bulkCampaigns.find({
    'adCampaigns.active': true,
    'adCampaigns.endDate': { $lte: Date.now() }
  }).updateOne({
    $set: { 'adCampaigns.$.active': false }
  })
  await bulkCampaigns.execute()

  // next take care of campaigns that have reached or exceeded their max spend
  const advertisersWithActiveCampaigns = await db.collection(ADVERTISERS_COLLECTION).find({
    'adCampaigns.active': true
  }).toArray()

  const allActiveCampaigns = advertisersWithActiveCampaigns.reduce((campaigns, advertiser) => {
    return campaigns.concat(advertiser.adCampaigns)
  }, [])

  const campaignsExceedingMaxSpend = allActiveCampaigns.filter((campaign) => {
    const { maxSpend, ads, cpm } = campaign
    const impressionValue = cpm / 1000
    const spentSoFar = ads.reduce((total, ad) => {
      return total + ((ad.impressions || []).length * impressionValue)
    }, 0)
    return spentSoFar >= maxSpend
  }).map(({ id }) => id)

  db.collection(ADVERTISERS_COLLECTION).updateMany({
    _id: { $in: advertisersWithActiveCampaigns.map(({ _id }) => ObjectId(_id)) }
  }, {
    $set: { 'adCampaigns.$[campaign].active': false }
  }, {
    arrayFilters: [
      { 'campaign.id': { $in: campaignsExceedingMaxSpend } }
    ]
  })
}

exports.handler = async () => {
  const mongoClient = await getMongoClient()
  const db = mongoClient.db(MONGO_DB)

  try {
    await process({ db })
  } catch (e) {
    console.error(e)
  }

  mongoClient.close()
}
