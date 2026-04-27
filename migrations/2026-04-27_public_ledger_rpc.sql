-- ═══════════════════════════════════════════════════════════════
-- Migration: RPC public ledger — bypass RLS cho khách rental xem qua URL
--
-- Tại sao: anon role bị RLS chặn đọc daily_spend / ad_account / ...
-- → khách mở link không thấy số.
-- Giải pháp: 1 function SECURITY DEFINER tự verify share_token rồi
-- trả về JSON aggregate. Anon chỉ cần EXECUTE function này.
--
-- Cách chạy:
--   Vào Supabase Dashboard → SQL Editor → New query → paste → Run
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_public_rental_ledger(p_client_id uuid, p_token text)
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
  v_deposits jsonb;
  v_fees jsonb;
BEGIN
  -- 1. Verify token (đồng thời lấy thông tin client)
  SELECT to_jsonb(c) INTO v_client
  FROM client c
  WHERE c.id = p_client_id
    AND c.share_token IS NOT NULL
    AND c.share_token = p_token;

  IF v_client IS NULL THEN
    RAISE EXCEPTION 'Invalid token or client not found' USING ERRCODE = 'P0001';
  END IF;

  -- 2. Lấy TKQC (gắn cứng client_id HOẶC qua assignment)
  SELECT coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) INTO v_ads
  FROM ad_account a
  WHERE a.client_id = p_client_id
     OR a.id IN (SELECT ad_account_id FROM assignment WHERE client_id = p_client_id);

  -- 3. Assignments của khách này
  SELECT coalesce(jsonb_agg(to_jsonb(asg)), '[]'::jsonb) INTO v_assigns
  FROM assignment asg
  WHERE asg.client_id = p_client_id;

  -- 4. Daily spend 180 ngày gần nhất, CHỈ của TKQC khách này (giảm tải)
  SELECT coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) INTO v_spend
  FROM daily_spend d
  WHERE d.report_date >= (current_date - interval '180 days')::date
    AND d.ad_account_id IN (
      SELECT id FROM ad_account WHERE client_id = p_client_id
      UNION
      SELECT ad_account_id FROM assignment WHERE client_id = p_client_id
    );

  -- 5. Deposits
  SELECT coalesce(jsonb_agg(to_jsonb(dep) ORDER BY dep.deposit_date DESC), '[]'::jsonb) INTO v_deposits
  FROM client_deposit dep
  WHERE dep.client_id = p_client_id;

  -- 6. Monthly fees
  SELECT coalesce(jsonb_agg(to_jsonb(mf)), '[]'::jsonb) INTO v_fees
  FROM client_monthly_fee mf
  WHERE mf.client_id = p_client_id;

  RETURN jsonb_build_object(
    'client', v_client,
    'ad_accounts', v_ads,
    'assignments', v_assigns,
    'daily_spend', v_spend,
    'deposits', v_deposits,
    'monthly_fees', v_fees,
    'fetched_at', now()
  );
END;
$$;

-- Cấp quyền EXECUTE cho anon (khách public) và authenticated (admin cũng dùng được)
GRANT EXECUTE ON FUNCTION get_public_rental_ledger(uuid, text) TO anon, authenticated;

-- ═══ KIỂM TRA ═══
-- SELECT get_public_rental_ledger('<uuid>', '<token>');
