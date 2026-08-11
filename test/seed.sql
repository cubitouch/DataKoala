-- Seed data shaped like what DataKoala is built to explore: an events/orders
-- time series with a few dimensions to slice by.
drop table if exists orders;
create table orders (
  id          bigserial primary key,
  created_at  timestamptz not null,
  status      text        not null,
  region      text        not null,
  amount      numeric(10,2) not null
);

insert into orders (created_at, status, region, amount)
select
  timestamptz '2024-01-01 00:00:00+00' + (n || ' minutes')::interval,
  (array['paid','pending','refunded'])[1 + (n % 3)],
  (array['eu-west','us-east','apac'])[1 + (n % 3)],
  round((random() * 500 + 10)::numeric, 2)
from generate_series(0, 20000) as n;

create index on orders (created_at);

analyze orders;

select count(*) as seeded_rows,
       min(created_at) as first_event,
       max(created_at) as last_event
from orders;

-- A proxy-style principal: an "@" inside the role name and no password.
-- Used by src/shared/connString.e2e.test.ts to prove that such connection
-- strings parse AND authenticate. scripts/db-up.mjs grants it trust auth.
drop role if exists "demo-reader@proxy-test.example";
create role "demo-reader@proxy-test.example" login;
grant connect on database datakoala_test to "demo-reader@proxy-test.example";
grant usage on schema public to "demo-reader@proxy-test.example";
grant select on all tables in schema public to "demo-reader@proxy-test.example";
