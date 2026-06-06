const { createSupabase, runMetaSync, vnDate } = require('../api/_lib/meta-sync');

const D0 = vnDate(0);
const BACKFILL_FROM = process.env.BACKFILL_FROM || null;
const BACKFILL_TO = process.env.BACKFILL_TO || null;
const IS_BACKFILL = !!BACKFILL_FROM;
const DATE_FROM = BACKFILL_FROM || D0;
const DATE_TO = BACKFILL_TO || DATE_FROM;

async function main() {
  console.log('[HC Sync] window = ' + DATE_FROM + ' -> ' + DATE_TO + (IS_BACKFILL ? ' (BACKFILL mode)' : ' (D0 only)'));
  const sb = createSupabase();
  const result = await runMetaSync({
    sb,
    scope: IS_BACKFILL ? 'full' : 'cron',
    dateFrom: DATE_FROM,
    dateTo: DATE_TO,
    includeCampaignMess: true,
    includeAdPosts: true,
    updateAccounts: true
  });
  console.log('[HC Sync] Done!', JSON.stringify({
    status: result.status,
    saved_rows: result.saved_rows,
    error_rows: result.error_rows,
    ok_accounts: result.ok_accounts,
    error_accounts: result.error_accounts
  }));
  if (result.status === 'failed') process.exit(1);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
