-- Application tables will be added with the MVP requirements. Keep this schema
-- outside the Data API; access is through the server's Postgres connection.
create schema app;
revoke all on schema app from public, anon, authenticated;
alter default privileges in schema app revoke all on tables from public, anon, authenticated;
alter default privileges in schema app revoke all on sequences from public, anon, authenticated;
alter default privileges in schema app revoke all on functions from public, anon, authenticated;
