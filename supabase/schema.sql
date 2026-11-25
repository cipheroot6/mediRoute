-- ==============================================================================
-- MediRoute — Supabase PostgreSQL Schema
-- Indoor Augmented Reality Hospital Navigation Platform
-- ==============================================================================

-- 1. Enable UUID Extension
create extension if not exists "pgcrypto";

-- 2. Hospitals Table
create table if not exists hospitals (
  id text primary key,
  name text not null,
  floors int not null default 1,
  created_at timestamp with time zone default now()
);

-- 3. Floors Table (one row per hospital floor)
create table if not exists floors (
  id uuid primary key default gen_random_uuid(),
  hospital_id text not null references hospitals(id) on delete cascade,
  floor_number int not null,
  floor_plan_url text,
  scale_mpp float, -- metres per pixel, calibrated in the floor plan editor
  created_at timestamp with time zone default now(),
  unique (hospital_id, floor_number)
);

-- 4. Nodes Table (navigation waypoints, destinations, entrances, elevators, stairs)
create table if not exists nodes (
  id uuid primary key default gen_random_uuid(),
  hospital_id text not null references hospitals(id) on delete cascade,
  floor int not null,
  label text not null,
  type text not null check (type in ('junction', 'destination', 'elevator', 'stairs', 'entry')),
  x float not null, -- metres from top-left origin
  y float not null, -- metres from top-left origin
  accessible boolean not null default true,
  created_at timestamp with time zone default now()
);

-- 5. Edges Table (physical path connections between nodes)
create table if not exists edges (
  id uuid primary key default gen_random_uuid(),
  hospital_id text not null references hospitals(id) on delete cascade,
  from_node uuid not null references nodes(id) on delete cascade,
  to_node uuid not null references nodes(id) on delete cascade,
  distance_m float not null,
  accessible boolean not null default true,
  is_stairs boolean not null default false,
  is_elevator boolean not null default false,
  landmark text, -- contextual cues, e.g. "after the pharmacy"
  created_at timestamp with time zone default now()
);

-- 6. QR Anchors Table (physical QR code sticker lookup mapping to nodes)
create table if not exists qr_anchors (
  anchor_id text primary key,
  node_id uuid not null references nodes(id) on delete cascade,
  hospital_id text not null references hospitals(id) on delete cascade,
  created_at timestamp with time zone default now()
);

-- 7. Query Performance Indexes
create index if not exists idx_floors_hospital on floors(hospital_id, floor_number);
create index if not exists idx_nodes_hospital_floor on nodes(hospital_id, floor);
create index if not exists idx_edges_hospital on edges(hospital_id);
create index if not exists idx_edges_from_node on edges(from_node);
create index if not exists idx_edges_to_node on edges(to_node);
create index if not exists idx_qr_anchors_hospital on qr_anchors(hospital_id);
create index if not exists idx_qr_anchors_node on qr_anchors(node_id);

-- 8. Row Level Security (RLS) Configuration
alter table hospitals enable row level security;
alter table floors enable row level security;
alter table nodes enable row level security;
alter table edges enable row level security;
alter table qr_anchors enable row level security;

-- Public Read Policies (allows patients to query hospital graphs without login)
create policy "Allow public read access for hospitals" on hospitals for select using (true);
create policy "Allow public read access for floors" on floors for select using (true);
create policy "Allow public read access for nodes" on nodes for select using (true);
create policy "Allow public read access for edges" on edges for select using (true);
create policy "Allow public read access for qr_anchors" on qr_anchors for select using (true);

-- Admin / Service Role Write Policies (full access for backend API routes using service role)
create policy "Allow service role all on hospitals" on hospitals for all using (true) with check (true);
create policy "Allow service role all on floors" on floors for all using (true) with check (true);
create policy "Allow service role all on nodes" on nodes for all using (true) with check (true);
create policy "Allow service role all on edges" on edges for all using (true) with check (true);
create policy "Allow service role all on qr_anchors" on qr_anchors for all using (true) with check (true);

-- 9. Floor Plans Storage Bucket Setup
insert into storage.buckets (id, name, public) 
values ('floor-plans', 'floor-plans', true)
on conflict (id) do nothing;

create policy "Allow public read access on floor-plans storage"
  on storage.objects for select using (bucket_id = 'floor-plans');

create policy "Allow authenticated/service role insert on floor-plans storage"
  on storage.objects for insert with check (bucket_id = 'floor-plans');
