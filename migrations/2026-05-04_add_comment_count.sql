-- ═══════════════════════════════════════════════════════════════
-- Migration: thêm cột comment_count cho campaign_daily_mess
--
-- Lưu "Bình luận về bài viết" (action type 'comment' từ Meta Insights).
-- Tách biệt với lead_count (vẫn dùng cho Cảnh báo Form / lead form).
--
-- Cách chạy:
--   Vào Supabase Dashboard → SQL Editor → New query → paste → Run
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE campaign_daily_mess
  ADD COLUMN IF NOT EXISTS comment_count integer NOT NULL DEFAULT 0;

-- Cập nhật RPC public report để trả về comment_count
CREATE OR REPLACE FUNCTION get_public_client_report(p_client_id uuid, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client jsonb;
  v_ads jsonb;
  v_assigns jsonb;
  v_spend jsonb;
  v_mess jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'company_full_name', c.company_full_name,
    'services', c.services
  ) INTO v_client
  FROM client c
  WHERE c.id = p_client_id
    AND c.share_token IS NOT NULL
    AND c.share_token = p_token;

  IF v_client IS NULL THEN
    RAISE EXCEPTION 'Invalid token or client not found' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'account_name',a.account_name,'client_id',a.client_id)), '[]'::jsonb) INTO v_ads
  FROM ad_account a
  WHERE a.client_id = p_client_id
     OR a.id IN (SELECT ad_account_id FROM assignment WHERE client_id = p_client_id);

  SELECT coalesce(jsonb_agg(jsonb_build_object('ad_account_id',asg.ad_account_id,'client_id',asg.client_id,'start_date',asg.start_date,'end_date',asg.end_date)), '[]'::jsonb) INTO v_assigns
  FROM assignment asg
  WHERE asg.client_id = p_client_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object('report_date',d.report_date,'ad_account_id',d.ad_account_id,'spend_amount',d.spend_amount,'matched_client_id',d.matched_client_id)), '[]'::jsonb) INTO v_spend
  FROM daily_spend d
  WHERE d.report_date >= (current_date - interval '90 days')::date
    AND (
      d.matched_client_id = p_client_id
      OR d.ad_account_id IN (
        SELECT id FROM ad_account WHERE client_id = p_client_id
        UNION
        SELECT ad_account_id FROM assignment WHERE client_id = p_client_id
      )
    );

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'report_date',cm.report_date,
    'ad_account_id',cm.ad_account_id,
    'mess_count',cm.mess_count,
    'lead_count',cm.lead_count,
    'comment_count',cm.comment_count,
    'checkout_count',cm.checkout_count
  )), '[]'::jsonb) INTO v_mess
  FROM campaign_daily_mess cm
  WHERE cm.report_date >= (current_date - interval '90 days')::date
    AND cm.ad_account_id IN (
      SELECT id FROM ad_account WHERE client_id = p_client_id
      UNION
      SELECT ad_account_id FROM assignment WHERE client_id = p_client_id
    );

  RETURN jsonb_build_object(
    'client', v_client,
    'ad_accounts', v_ads,
    'assignments', v_assigns,
    'daily_spend', v_spend,
    'campaign_mess', v_mess,
    'fetched_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_client_report(uuid, text) TO anon, authenticated;
