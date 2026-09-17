# SQL runner

Runs a .sql file against the live database and prints real Postgres errors,
instead of pasting into the Supabase SQL editor and decoding riddles.

## Use

    node supabase/tools/run-sql.mjs path/to/file.sql            # dry run
    node supabase/tools/run-sql.mjs path/to/file.sql --commit   # apply

**Dry run by default.** Everything is wrapped in a transaction and rolled back
unless `--commit` is passed. This is strictly safer than the SQL editor, where
every Run is live. Verify against the real schema first, commit once proven.

On failure it prints the SQLSTATE, the message, and the exact character
position with 120 characters of context either side. That is the whole point:
on 16 Sep, six rounds went into a `relation "the" does not exist` error whose
real cause was the word `into` inside a string literal sixteen lines away.
This runner would have printed the offending text on the first try.

## Credentials

`DB-CONNECTION.txt` at the repo root, gitignored, never committed, never
pasted into a chat:

    DB_HOST=aws-0-us-west-2.pooler.supabase.com
    DB_PORT=5432
    DB_USER=postgres.<project-ref>
    DB_NAME=postgres
    DB_PASSWORD=<database password>

Discrete fields, not a URL, on purpose: a password containing `@ : / ? # %`
or a space needs no escaping this way. A connection *string* silently
mis-parses on those and reports the failure as a wrong username.

Reset the database password in Supabase -> Connect -> Direct -> Session pooler
if it is ever unknown. Nothing else uses it; the app authenticates with the
publishable key.

## Setup on a new machine

    cd supabase/tools && npm install

Requires node. The Supabase CLI is also available via `npx supabase@latest`
if migration files are ever preferred over pasted SQL.
