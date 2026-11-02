-- Only app_runtime is used by ordinary web requests. It cannot own tables or bypass RLS.
create role app_request nologin nosuperuser nobypassrls noinherit;
create role app_runtime login nosuperuser nobypassrls noinherit;
grant app_request to app_runtime;
grant usage on schema app to app_request;
-- Runtime password is provisioned out of band, never in migrations.
