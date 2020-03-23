const { MongoClient, ObjectId } = require('mongodb')

const MONGO_DB = 'flossbank_db'
const ADVERTISERS_COLLECTION = 'advertisers'

class Mongo {
  constructor ({ config }) {
    this.config = config
    this.db = null
    this.mongoClient = null
  }

  async connect () {
    const mongoUri = await this.config.getMongoUri()
    this.mongoClient = new MongoClient(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    })
    await this.mongoClient.connect()

    this.db = this.mongoClient.db(MONGO_DB)
  }

  async close () {
    if (this.mongoClient) return this.mongoClient.close()
  }

  async disableExpiredCampaigns () {
    const bulkCampaigns = this.db.collection(ADVERTISERS_COLLECTION).initializeUnorderedBulkOp()
    bulkCampaigns.find({
      'adCampaigns.active': true,
      'adCampaigns.endDate': { $lte: Date.now() }
    }).updateOne({
      $set: { 'adCampaigns.$.active': false }
    })
    return bulkCampaigns.execute()
  }

  async disableOverspentCampaigns () {
    const advertisersWithActiveCampaigns = await this.db.collection(ADVERTISERS_COLLECTION).find({
      'adCampaigns.active': true
    }).toArray()

    const allActiveCampaigns = advertisersWithActiveCampaigns.reduce((campaigns, advertiser) => {
      return campaigns.concat(advertiser.adCampaigns)
    }, [])

    const campaignsExceedingMaxSpend = allActiveCampaigns.filter((campaign) => {
      const { maxSpend, ads, cpm } = campaign
      const impressionValue = cpm / 1000
      const spentSoFar = (ads || []).reduce((total, ad) => {
        return total + ((ad.impressions || []).length * impressionValue)
      }, 0)
      return spentSoFar >= maxSpend
    }).map(({ id }) => id)

    return this.db.collection(ADVERTISERS_COLLECTION).updateMany({
      _id: { $in: advertisersWithActiveCampaigns.map(({ _id }) => ObjectId(_id)) }
    }, {
      $set: { 'adCampaigns.$[campaign].active': false }
    }, {
      arrayFilters: [
        { 'campaign.id': { $in: campaignsExceedingMaxSpend } }
      ]
    })
  }
}

module.exports = Mongo
