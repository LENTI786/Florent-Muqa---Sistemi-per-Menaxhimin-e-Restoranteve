<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('GET');
requireLogin();

$categories = getDB()->query('SELECT id, name FROM categories ORDER BY name')->fetchAll();
sendJson(200, ['success' => true, 'data' => $categories]);