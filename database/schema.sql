
-- Sistemi për Menaxhimin e Restoranteve - Skema e databazës
-- Raporti Teknik 2

CREATE DATABASE IF NOT EXISTS restaurant_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE restaurant_db;

-- Fshijmë tabelat ekzistuese (sipas renditjes së kundërt të varësive),
-- që skedari të mund të importohet sa herë të duhet.
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS menu_items;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS restaurant_tables;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;


-- users: përdoruesit e sistemit (admin, kamarier, kuzhinier)

CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,                     -- vetëm hash, kurrë fjalëkalimi
  role          ENUM('ADMIN','WAITER','KITCHEN') NOT NULL DEFAULT 'WAITER',
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,           -- çaktivizohet, nuk fshihet
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_users_email UNIQUE (email)                 -- dy llogari nuk mund të kenë të njëjtin email
) ENGINE=InnoDB;


-- categories: kategoritë e menusë

CREATE TABLE categories (
  id   INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  CONSTRAINT uq_categories_name UNIQUE (name)
) ENGINE=InnoDB;


-- menu_items: artikujt e menusë

CREATE TABLE menu_items (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  category_id  INT           NOT NULL,
  name         VARCHAR(120)  NOT NULL,
  price        DECIMAL(8,2)  NOT NULL,
  is_available TINYINT(1)    NOT NULL DEFAULT 1,
  CONSTRAINT chk_menu_items_price CHECK (price > 0),
  CONSTRAINT fk_menu_items_category
    FOREIGN KEY (category_id) REFERENCES categories(id)
    ON DELETE RESTRICT,                                    -- nuk fshihet kategori që ka artikuj
  INDEX idx_menu_items_category (category_id)
) ENGINE=InnoDB;


-- restaurant_tables: tavolinat e restorantit

CREATE TABLE restaurant_tables (
  id       INT AUTO_INCREMENT PRIMARY KEY,
  number   INT NOT NULL,
  capacity INT NOT NULL,
  status   ENUM('FREE','OCCUPIED') NOT NULL DEFAULT 'FREE',
  CONSTRAINT uq_tables_number UNIQUE (number),             -- numri i tavolinës është unik
  CONSTRAINT chk_tables_capacity CHECK (capacity > 0)
) ENGINE=InnoDB;


-- orders: porositë

CREATE TABLE orders (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  table_id   INT NOT NULL,
  waiter_id  INT NOT NULL,
  status     ENUM('NEW','IN_PREPARATION','READY','SERVED','PAID','CANCELLED')
             NOT NULL DEFAULT 'NEW',
  total      DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_orders_total CHECK (total >= 0),
  CONSTRAINT fk_orders_table
    FOREIGN KEY (table_id)  REFERENCES restaurant_tables(id) ON DELETE RESTRICT,
  CONSTRAINT fk_orders_waiter
    FOREIGN KEY (waiter_id) REFERENCES users(id)             ON DELETE RESTRICT,
  INDEX idx_orders_status (status),                        -- kuzhina filtron shpesh sipas statusit
  INDEX idx_orders_waiter (waiter_id),
  INDEX idx_orders_table  (table_id)
) ENGINE=InnoDB;


-- order_items: artikujt brenda një porosie (lidhja many-to-many)

CREATE TABLE order_items (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  order_id     INT NOT NULL,
  menu_item_id INT NOT NULL,
  quantity     INT NOT NULL,
  unit_price   DECIMAL(8,2) NOT NULL,                      -- çmimi i atëhershëm i artikullit
  CONSTRAINT chk_order_items_quantity CHECK (quantity > 0),
  CONSTRAINT chk_order_items_price    CHECK (unit_price > 0),
  CONSTRAINT fk_order_items_order
    FOREIGN KEY (order_id)     REFERENCES orders(id)     ON DELETE CASCADE,  -- fshihet porosia, fshihen artikujt e saj
  CONSTRAINT fk_order_items_menu_item
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE RESTRICT,
  INDEX idx_order_items_order (order_id)
) ENGINE=InnoDB;


-- payments: pagesa e një porosie (një-me-një)

CREATE TABLE payments (
  id       INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  amount   DECIMAL(10,2) NOT NULL,
  method   ENUM('CASH','CARD') NOT NULL,
  paid_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_payments_order UNIQUE (order_id),          -- një porosi paguhet vetëm një herë
  CONSTRAINT chk_payments_amount CHECK (amount > 0),
  CONSTRAINT fk_payments_order
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
