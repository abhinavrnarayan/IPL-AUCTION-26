-- Migration 007: remove broken partial user records created by migration 006
-- Run BEFORE calling /api/seed-users

delete from auth.users
where email in (
  'sherlockholmes221b715@gmail.com',
  'abhijithbabu855@gmail.com',
  'sonushajim@gmail.com',
  'lonewolf6996a@gmail.com',
  'abiddileep7@gmail.com',
  'gpy120643@gmail.com',
  'swabeehca@gmail.com'
);
