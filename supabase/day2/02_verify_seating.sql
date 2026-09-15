-- Day 2 · Cards 5-8 — run after seating in the Manage tab.
-- All four should return zero rows.

select id, email from public.profiles where campus is null;          -- card 5

select p.id, p.email from public.profiles p                           -- card 8
  left join public.admin_user_assignments a on a.member_id = p.id
 where p.role = 'user' and a.member_id is null;

select campus_slug, count(*) from public.campus_directors             -- card 7
 group by 1 having count(*) > 2;

select c.slug from public.campuses c                                  -- card 7
 where c.is_active
   and not exists (select 1 from public.campus_directors d
                    where d.campus_slug = c.slug);
