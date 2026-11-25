DELETE FROM qr_anchors;
DELETE FROM edges;
DELETE FROM nodes;
DELETE FROM floors;
DELETE FROM hospitals;

INSERT INTO hospitals (id, name, floors) 
VALUES ('demo-hospital', 'City General Hospital', 1);

INSERT INTO floors (id, hospital_id, floor_number, floor_plan_url, scale_mpp) 
VALUES ('11111111-1111-1111-1111-111111111111', 'demo-hospital', 1, 'https://iakkbhtcmriohktxthew.supabase.co/storage/v1/object/public/floor-plans/test1/1.png', 0.05);

INSERT INTO nodes (id, hospital_id, floor, label, type, x, y, accessible) VALUES 
('22222222-2222-2222-2222-222222222221', 'demo-hospital', 1, 'Main Entrance', 'entry', 50, 500, true),
('22222222-2222-2222-2222-222222222222', 'demo-hospital', 1, 'Lobby', 'junction', 200, 500, true),
('22222222-2222-2222-2222-222222222223', 'demo-hospital', 1, 'Reception', 'destination', 200, 350, true),
('22222222-2222-2222-2222-222222222224', 'demo-hospital', 1, 'Cardiology Wing', 'destination', 500, 500, true),
('22222222-2222-2222-2222-222222222225', 'demo-hospital', 1, 'Restroom', 'destination', 500, 650, true),
('22222222-2222-2222-2222-222222222226', 'demo-hospital', 1, 'Elevator Bank A', 'elevator', 800, 500, true),
('22222222-2222-2222-2222-222222222227', 'demo-hospital', 1, 'Radiology', 'destination', 800, 350, true);

INSERT INTO edges (id, hospital_id, from_node, to_node, distance_m, accessible, is_stairs, is_elevator, landmark) VALUES 
(gen_random_uuid(), 'demo-hospital', '22222222-2222-2222-2222-222222222221', '22222222-2222-2222-2222-222222222222', 15.0, true, false, false, 'Walk through automatic doors'),
(gen_random_uuid(), 'demo-hospital', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222223', 10.0, true, false, false, 'Turn to face reception desk'),
(gen_random_uuid(), 'demo-hospital', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222224', 30.0, true, false, false, 'Continue down main hallway'),
(gen_random_uuid(), 'demo-hospital', '22222222-2222-2222-2222-222222222224', '22222222-2222-2222-2222-222222222225', 10.0, true, false, false, 'Turn right towards restroom'),
(gen_random_uuid(), 'demo-hospital', '22222222-2222-2222-2222-222222222224', '22222222-2222-2222-2222-222222222226', 30.0, true, false, false, 'Continue to end of hallway'),
(gen_random_uuid(), 'demo-hospital', '22222222-2222-2222-2222-222222222226', '22222222-2222-2222-2222-222222222227', 15.0, true, false, false, 'Turn left at elevators');

INSERT INTO qr_anchors (anchor_id, node_id, hospital_id) VALUES 
('entrance-qr-001', '22222222-2222-2222-2222-222222222221', 'demo-hospital'),
('lobby-qr-002', '22222222-2222-2222-2222-222222222222', 'demo-hospital'),
('elevator-qr-003', '22222222-2222-2222-2222-222222222226', 'demo-hospital');
