const test = require('ava')
const sinon = require('sinon')
const { MongoClient, ObjectId } = require('mongodb')
const Mongo = require('../lib/mongo')

test.before((t) => {
  sinon.stub(Date, 'now').returns(1234)
})

test.beforeEach((t) => {
  t.context.mongo = new Mongo({
    config: {
      getMongoUri: async () => 'mongodb+srv://0.0.0.0/test'
    }
  })
  t.context.mongo.db = {
    collection: sinon.stub().returns({
      find: sinon.stub().returns({
        toArray: sinon.stub().resolves([
          // array of advertisers with active campaigns
          {
            _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
            adCampaigns: [
              {
                id: 'a1',
                active: true,
                maxSpend: 1,
                cpm: 1000,
                ads: [{ impressions: [{}] }]
              },
              {
                id: 'a2',
                active: false,
                maxSpend: 1,
                cpm: 1000,
                ads: [{}]
              }
            ]
          },
          {
            _id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
            adCampaigns: [
              { id: 'b1', active: false },
              {
                id: 'b2',
                active: true,
                maxSpend: 2,
                cpm: 1000,
                ads: [{ impressions: [{}] }]
              }
            ]
          }
        ])
      }),
      updateMany: sinon.stub().resolves(),
      initializeUnorderedBulkOp: sinon.stub().returns({
        find: sinon.stub().returns({
          updateOne: sinon.stub()
        }),
        execute: sinon.stub()
      })
    })
  }
})

test.after.always((t) => {
  Date.now.restore()
})

test('connect', async (t) => {
  sinon.stub(MongoClient.prototype, 'connect')
  sinon.stub(MongoClient.prototype, 'db')

  await t.context.mongo.connect()
  t.true(MongoClient.prototype.connect.calledOnce)

  MongoClient.prototype.connect.restore()
  MongoClient.prototype.db.restore()
})

test('close', async (t) => {
  await t.context.mongo.close()
  t.context.mongo.mongoClient = { close: sinon.stub() }
  await t.context.mongo.close()
  t.true(t.context.mongo.mongoClient.close.calledOnce)
})

test('disable expired campaigns', async (t) => {
  await t.context.mongo.disableExpiredCampaigns()
  t.deepEqual(t.context.mongo.db.collection().initializeUnorderedBulkOp().find.lastCall.args, [{
    'adCampaigns.active': true,
    'adCampaigns.endDate': { $lte: 1234 }
  }])
  t.deepEqual(t.context.mongo.db.collection().initializeUnorderedBulkOp().find().updateOne.lastCall.args, [{
    $set: { 'adCampaigns.$.active': false }
  }])
})

test('disable overspent campaigns', async (t) => {
  await t.context.mongo.disableOverspentCampaigns()
  t.deepEqual(t.context.mongo.db.collection().updateMany.lastCall.args, [{
    _id: { $in: [ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'), ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb')] }
  }, {
    $set: { 'adCampaigns.$[campaign].active': false }
  }, {
    arrayFilters: [
      { 'campaign.id': { $in: ['a1'] } }
    ]
  }])
})
