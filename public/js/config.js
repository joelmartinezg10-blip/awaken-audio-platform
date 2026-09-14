/* Supabase connection. The anon key is a public, browser-side key by
   design — it identifies the project, it does not grant access. What
   actually protects the data is the row level security in
   supabase/migrations/0002_security.sql. The service_role key must
   never appear in this file or anywhere else in the front end. */
window.AWAKEN_CONFIG = {
  supabaseUrl: "https://kjbuffypftxaspmsvnuq.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqYnVmZnlwZnR4YXNwbXN2bnVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MDIyMDMsImV4cCI6MjEwMzk3ODIwM30.Pc9LNw91wV2cGsibrTv3CGk8KtZGBAYmRzNKyqfZnvI",
  courseSlug: "awaken-audio"
};
