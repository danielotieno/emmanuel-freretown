-- Reference data (requirements.md §4, database-design.md §5). Idempotent.

INSERT INTO hbc (name, sort_order) VALUES
  ('Jordan',1), ('Judea',2), ('Galilaya',3), ('Samaria',4), ('Zion Leisure',5),
  ('Zion Bombolulu',6), ('Zion Freretown',7), ('Damascus',8), ('Jerusalem',9),
  ('Bethlehem B',10), ('Bethlehem A',11)
ON CONFLICT ((lower(name))) DO NOTHING;
--> statement-breakpoint

INSERT INTO department (name, sort_order) VALUES
  ('Mother''s Union',1), ('KAMA / AMF',2), ('Kiswahili Choir',3), ('English Choir',4),
  ('KAYO',5), ('Children Ministry',6), ('Evangelism',7), ('G.F.S.',8)
ON CONFLICT ((lower(name))) DO NOTHING;
