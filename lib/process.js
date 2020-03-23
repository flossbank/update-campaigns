exports.process = async ({ db, log }) => {
  const expired = await db.disableExpiredCampaigns()
  log('disabled %d expired campaigns', expired.nModified)
  const overspent = await db.disableOverspentCampaigns()
  log('disabled %d overspent campaigns', overspent.modifiedCount)
}
