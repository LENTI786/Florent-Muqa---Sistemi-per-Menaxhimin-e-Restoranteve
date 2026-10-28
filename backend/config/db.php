<?php
require_once __DIR__ . '/../config/db.php';

header('Content-Type: application/json; charset=utf-8');

try {
    $pdo   = getDB();
    $count = $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();

    echo json_encode([
        'success'     => true,
        'message'     => 'Lidhja me databazën punon',
        'users_count' => (int) $count,
    ], JSON_UNESCAPED_UNICODE);
} catch (PDOException $e) {
    error_log($e->getMessage());     // gabimi i vërtetë shkruhet në log
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => 'DB_CONNECTION_FAILED',
        'message' => 'Nuk mund të lidhem me databazën.',
    ], JSON_UNESCAPED_UNICODE);
}