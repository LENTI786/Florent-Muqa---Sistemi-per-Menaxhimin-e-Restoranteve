<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('GET');
requireLogin();

$rows = getDB()->query('SELECT id, name FROM categories ORDER BY name')->fetchAll();
$categories = array_map(fn($c) => ['id' => (int) $c['id'], 'name' => $c['name']], $rows);

sendJson(200, ['success' => true, 'data' => $categories]);