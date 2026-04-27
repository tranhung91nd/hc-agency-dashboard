-- ═══════════════════════════════════════════════════════════════
-- Migration: Form thu lead công khai (Phase 1.1 CRM)
--
-- - Cột client.lead_source: ghi nhận nguồn lead (web_form, fb_lead_ads,
--   zalo, referral, cold_call, …) để phân tích phễu sau này
-- - RPC submit_public_lead(p_data jsonb): cho phép anon submit form
--   mà bypass RLS (SECURITY DEFINER). Tự verify dữ liệu bên trong,
--   chống trùng phone, gắn nguồn lead.
--
-- Sau khi chạy migration này, mở URL:
--   <vercel-url>/index.html?form=lead
--   <vercel-url>/index.html?form=lead&source=fbpage
-- → form công khai hiện ra cho khách điền.
-- Nguồn (source) sẽ được lưu vào lead_source để biết kênh nào hiệu quả.
--
-- Cách chạy:
--   Vào Supabase Dashboard → SQL Editor → New query → paste → Run
-- ═══════════════════════════════════════════════════════════════

-- 1. Cột lead_source
ALTER TABLE client ADD COLUMN IF NOT EXISTS lead_source text;
CREATE INDEX IF NOT EXISTS idx_client_lead_source ON client(lead_source);

COMMENT ON COLUMN client.lead_source IS
  'Nguồn lead: web_form, fb_lead_ads, zalo, referral, cold_call, other. NULL = lead nhập tay từ admin.';

-- 2. RPC submit_public_lead
CREATE OR REPLACE FUNCTION submit_public_lead(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_phone text;
  v_clean_phone text;
  v_existing uuid;
  v_id uuid;
  v_services text[];
  v_msg text;
  v_budget text;
  v_source text;
BEGIN
  -- Validate cơ bản
  v_name := nullif(trim(p_data->>'name'),'');
  v_phone := nullif(trim(p_data->>'phone'),'');

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Vui lòng nhập họ tên / tên doanh nghiệp' USING ERRCODE = 'P0001';
  END IF;

  v_clean_phone := regexp_replace(coalesce(v_phone,''), '\D', '', 'g');
  IF length(v_clean_phone) < 9 OR length(v_clean_phone) > 11 THEN
    RAISE EXCEPTION 'Số điện thoại không hợp lệ' USING ERRCODE = 'P0001';
  END IF;

  -- Build services array (default fb_ads nếu không truyền)
  BEGIN
    v_services := ARRAY(SELECT jsonb_array_elements_text(p_data->'services'));
  EXCEPTION WHEN OTHERS THEN
    v_services := ARRAY['fb_ads'];
  END;
  IF v_services IS NULL OR cardinality(v_services) = 0 THEN
    v_services := ARRAY['fb_ads'];
  END IF;

  v_msg := nullif(trim(p_data->>'message'),'');
  v_budget := nullif(trim(p_data->>'monthly_budget'),'');
  v_source := coalesce(nullif(trim(p_data->>'source'),''), 'web_form');

  -- Anti-dup: nếu đã có client cùng phone thì update note + return existing id
  SELECT id INTO v_existing
  FROM client
  WHERE phone = v_phone OR phone = v_clean_phone
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    UPDATE client SET
      lead_source = COALESCE(lead_source, v_source),
      prospect_note = COALESCE(prospect_note,'') ||
        E'\n[' || to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh','DD/MM HH24:MI') || ' · ' ||
        v_source || '] ' ||
        coalesce(v_msg,'(không có lời nhắn)') ||
        CASE WHEN v_budget IS NOT NULL THEN E' · NS: ' || v_budget ELSE '' END,
      care_status = CASE WHEN care_status='lost' THEN 'new' ELSE care_status END
    WHERE id = v_existing;
    RETURN jsonb_build_object('id', v_existing, 'duplicate', true);
  END IF;

  -- Insert mới
  INSERT INTO client (
    name, phone, zalo, email_invoice, company_full_name, industry,
    services, prospect_note,
    care_status, status, payment_status, has_vat, service_fee, lead_source
  ) VALUES (
    v_name,
    v_phone,
    nullif(trim(p_data->>'zalo'),''),
    nullif(trim(p_data->>'email'),''),
    nullif(trim(p_data->>'company_name'),''),
    nullif(trim(p_data->>'industry'),''),
    v_services,
    nullif(
      coalesce(v_msg,'') ||
      CASE WHEN v_budget IS NOT NULL THEN E'\nNgân sách dự kiến: ' || v_budget ELSE '' END,
      ''
    ),
    'new',
    'prospect',
    'unpaid',
    false,
    0,
    v_source
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'duplicate', false);
END;
$$;

GRANT EXECUTE ON FUNCTION submit_public_lead(jsonb) TO anon, authenticated;

-- ═══ KIỂM TRA ═══
-- SELECT submit_public_lead('{"name":"Test","phone":"0912345678","services":["fb_ads"],"message":"Demo","source":"web_form"}'::jsonb);
-- SELECT name, phone, lead_source, prospect_note, care_status FROM client WHERE lead_source IS NOT NULL ORDER BY created_at DESC LIMIT 5;
