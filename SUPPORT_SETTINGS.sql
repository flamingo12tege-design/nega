-- Publish CAS support contact channels
-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- The Support tile on the member home screen reads these keys from
-- public.platform_settings. Any channel left empty simply stays hidden.
--
--   support_phone     -> "Call us" button (tel: link)
--   support_whatsapp  -> "WhatsApp" button (digits only, with country code)
--   support_telegram  -> "Telegram" button (handle, with or without @)
--   support_email     -> "Email" button (mailto: link)
--
-- Edit the values below, uncomment the block and run it.

-- insert into public.platform_settings (key, value) values
--   ('support_phone', '+251900000000'),
--   ('support_whatsapp', '251900000000'),
--   ('support_telegram', '@casethiopia'),
--   ('support_email', 'support@caset.casacam.net')
-- on conflict (key) do update
--   set value = excluded.value,
--       updated_at = now();

-- Check what is currently published.
select key, value
from public.platform_settings
where key in ('support_phone', 'support_whatsapp', 'support_telegram', 'support_email')
order by key;
