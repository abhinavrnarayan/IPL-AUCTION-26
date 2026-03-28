-- Migration 006: seed auction participants with email/password login
-- Password for all accounts: 12345678
-- Run this in Supabase SQL editor ONCE.

do $$
declare
  emails text[] := array[
    'sherlockholmes221b715@gmail.com',
    'abhijithbabu855@gmail.com',
    'sonushajim@gmail.com',
    'lonewolf6996a@gmail.com',
    'abiddileep7@gmail.com',
    'gpy120643@gmail.com',
    'swabeehca@gmail.com'
  ];
  names text[] := array[
    'Wayanad Tarzans',
    'OPM',
    'Malabar Magic',
    'Kerala Indians',
    'Mumbai Indians',
    'Goated Super Kings',
    'Kerala Blasters'
  ];
  i int;
begin
  for i in 1..array_length(emails, 1) loop
    if not exists (select 1 from auth.users where email = emails[i]) then
      insert into auth.users (
        id, instance_id, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, role, aud
      ) values (
        gen_random_uuid(),
        '00000000-0000-0000-0000-000000000000',
        emails[i],
        crypt('12345678', gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}',
        json_build_object('full_name', names[i]),
        now(), now(),
        'authenticated', 'authenticated'
      );
    end if;
  end loop;
end $$;

-- Sync into public.users so the app can see them
insert into public.users (id, email, display_name)
select id, email, raw_user_meta_data->>'full_name'
from auth.users
where email in (
  'sherlockholmes221b715@gmail.com',
  'abhijithbabu855@gmail.com',
  'sonushajim@gmail.com',
  'lonewolf6996a@gmail.com',
  'abiddileep7@gmail.com',
  'gpy120643@gmail.com',
  'swabeehca@gmail.com'
)
on conflict (id) do nothing;
