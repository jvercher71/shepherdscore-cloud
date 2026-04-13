-- ============================================================
-- Church onboarding trigger
-- When a new user signs up, create a church row and stamp
-- church_id into their auth.users app_metadata so it flows
-- into the JWT automatically.
-- ============================================================

create or replace function public.handle_new_user_church()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_church_id uuid;
begin
  -- Create a placeholder church for this user
  insert into public.churches (name)
  values (coalesce(new.raw_user_meta_data->>'church_name', 'My Church'))
  returning id into new_church_id;

  -- Stamp church_id into app_metadata so it appears in JWT claims
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('church_id', new_church_id)
  where id = new.id;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user_church();
