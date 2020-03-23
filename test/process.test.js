const test = require('ava')
const sinon = require('sinon')
const Process = require('../lib/process')

test.beforeEach((t) => {
  t.context.db = {
    disableExpiredCampaigns: sinon.stub().resolves({ nModified: 2 }),
    disableOverspentCampaigns: sinon.stub().resolves({ modifiedCount: 2 })
  }
})

test('disables campaigns', async (t) => {
  await Process.process({ db: t.context.db, log: () => {} })
  t.true(t.context.db.disableExpiredCampaigns.calledOnce)
  t.true(t.context.db.disableOverspentCampaigns.calledOnce)
})
