-- Reference data. Safe to run more than once.

-- Optional: restrict accounts to your organisation's e-mail domain(s).
-- insert into public.app_allowed_email_domains (domain) values ('yourcompany.com') on conflict do nothing;

-- Catalogue from the Figma design. Images are served by the web app (public/supplies);
-- upload real photos to the "supply-images" bucket later and store the object key instead.
insert into public.supplies (name, stock, unit, image_url) values
  ('Gel Pen',           300, 'pcs', '/supplies/gel-pen.png'),
  ('Black Marker',        0, 'pcs', '/supplies/black-marker.png'),
  ('Standard Pen',      200, 'pcs', '/supplies/standard-pen.png'),
  ('A4 75gsm',           14, 'pcs', '/supplies/a4-paper.png'),
  ('Blue Gel Pen',      120, 'pcs', '/supplies/gel-pen.png'),
  ('Red Gel Pen',        80, 'pcs', '/supplies/gel-pen.png'),
  ('Ballpoint Pen',      45, 'pcs', '/supplies/standard-pen.png'),
  ('F4 70gsm',           22, 'pcs', '/supplies/a4-paper.png'),
  ('Whiteboard Marker',   9, 'pcs', '/supplies/black-marker.png'),
  ('Fine Liner',         60, 'pcs', '/supplies/standard-pen.png'),
  ('A3 80gsm',            5, 'pcs', '/supplies/a4-paper.png'),
  ('Permanent Marker',   18, 'pcs', '/supplies/black-marker.png'),
  ('Sticky Notes',       70, 'pcs', null)
on conflict (name) do nothing;
