<?php
require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../helpers.php';

requireMethod('POST');

$input    = getJsonInput();
$email    = trim($input['email'] ?? '');
$password = $input['password'] ?? '';

// 1. Validimi: fushat e detyrueshme
if ($email === '' || $password === '') {
    sendError(400, 'MISSING_FIELDS', 'Email dhe fjalëkalimi janë të detyrueshëm.');
}

// 2. Gjej përdoruesin në databazë
$stmt = getDB()->prepare(
    'SELECT id, name, password_hash, role, is_active FROM users WHERE email = ?'
);
$stmt->execute([$email]);
$user = $stmt->fetch();

// 3. Kontrollo llogarinë dhe fjalëkalimin
if (!$user || !$user['is_active'] || !password_verify($password, $user['password_hash'])) {
    sendError(401, 'INVALID_CREDENTIALS', 'Email ose fjalëkalim i gabuar.');
}

// 4. Krijo session
startSession();
session_regenerate_id(true);
$_SESSION['user'] = [
    'id'   => (int) $user['id'],
    'name' => $user['name'],
    'role' => $user['role'],
];

sendJson(200, [
    'success' => true,
    'message' => 'Hyrja u krye me sukses.',
    'user'    => $_SESSION['user'],
]);