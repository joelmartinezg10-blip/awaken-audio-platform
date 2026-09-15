-- Fallback schema export — run each block separately in the Supabase SQL
-- editor and save the output. Read-only. Preferred path is the CLI dump;
-- see RECOVER_LIVE_SCHEMA.md.

-- 1. Tables and columns
select table_name, ordinal_position, column_name, data_type,
       is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

-- 2. Constraints (pk, fk, unique, check) as DDL text
select conrelid::regclass::text as table_name, conname,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'public'::regnamespace
order by 1, 2;

-- 3. Functions — full source, including SECURITY INVOKER/DEFINER.
--    Check every roster function is INVOKER: get_roster,
--    get_campus_topic_stats, get_campus_arcade, get_campus_reflections,
--    get_campus_directors. A DEFINER among them is the way around every
--    rule in the roles doc.
select p.proname,
       case when p.prosecdef then 'DEFINER' else 'INVOKER' end as security,
       pg_get_functiondef(p.oid) as source
from pg_proc p
where p.pronamespace = 'public'::regnamespace
order by p.proname;

-- 4. RLS policies
select schemaname, tablename, policyname, permissive, roles,
       cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 5. Which tables have RLS on at all
select relname, relrowsecurity, relforcerowsecurity
from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r'
order by relname;
