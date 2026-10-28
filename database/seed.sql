-- Të dhëna testuese (vetëm për zhvillim dhe demonstrim)


-- Llogaritë testuese (fjalëkalimet janë vetëm për testim):
--   admin@restorant.test     /  Admin123!
--   kamarier@restorant.test  /  Waiter123!
--   kuzhina@restorant.test   /  Kitchen123!


USE restaurant_db;

INSERT INTO users (id, name, email, password_hash, role) VALUES
  (1, 'Admin Restorant', 'admin@restorant.test',    '$2y$12$utpvQlcVRSRrHT1l9U7bAeD2DYhVk5Tvz4XWVf/uhROHPaALTQ62q',   'ADMIN'),
  (2, 'Arben Kamarieri', 'kamarier@restorant.test', '$2y$12$D3wJJBLHVmERJJP/ADE30.4NnjUEfzagjGZykgPmOkGTPO7XdgiNu',  'WAITER'),
  (3, 'Besa Kuzhinierja', 'kuzhina@restorant.test', '$2y$12$x01HO5PjU9e9GoQIXa.pGuLIRS8RCkohQjMs8YLLzfeF9tjKLwYB6', 'KITCHEN');

INSERT INTO categories (id, name) VALUES
  (1, 'Paraushqime'),
  (2, 'Pjata kryesore'),
  (3, 'Pije'),
  (4, 'Ëmbëlsira');

INSERT INTO menu_items (id, category_id, name, price, is_available) VALUES
  (1,  1, 'Sallatë e gjelbër',  3.50, 1),
  (2,  1, 'Supë e ditës',       2.50, 1),
  (3,  2, 'Pica Margarita',     6.00, 1),
  (4,  2, 'Pasta Carbonara',    7.50, 1),
  (5,  2, 'Biftek',            12.00, 1),
  (6,  3, 'Ujë',                1.00, 1),
  (7,  3, 'Kafe espresso',      1.20, 1),
  (8,  3, 'Lëng portokalli',    2.50, 1),
  (9,  4, 'Tiramisu',           3.50, 1),
  (10, 4, 'Baklava',            2.00, 0);   -- jo i disponueshëm (për testimin e validimit)

INSERT INTO restaurant_tables (id, number, capacity, status) VALUES
  (1, 1, 2, 'FREE'),
  (2, 2, 2, 'FREE'),
  (3, 3, 4, 'OCCUPIED'),   -- ka porosi aktive (porosia 2)
  (4, 4, 4, 'FREE'),
  (5, 5, 6, 'FREE'),
  (6, 6, 8, 'FREE');

-- Porosia 1: e paguar (tavolina 1)
INSERT INTO orders (id, table_id, waiter_id, status, total) VALUES
  (1, 1, 2, 'PAID', 14.00);
INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price) VALUES
  (1, 3, 2, 6.00),    -- 2 x Pica Margarita = 12.00
  (1, 6, 2, 1.00);    -- 2 x Ujë            =  2.00
INSERT INTO payments (order_id, amount, method) VALUES
  (1, 14.00, 'CASH');

-- Porosia 2: në përgatitje (tavolina 3)
INSERT INTO orders (id, table_id, waiter_id, status, total) VALUES
  (2, 3, 2, 'IN_PREPARATION', 13.40);
INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price) VALUES
  (2, 4, 1, 7.50),    -- 1 x Pasta Carbonara = 7.50
  (2, 7, 2, 1.20),    -- 2 x Kafe espresso   = 2.40
  (2, 9, 1, 3.50);    -- 1 x Tiramisu        = 3.50
