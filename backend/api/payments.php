<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('POST');
$user = requireRole('WAITER', 'ADMIN');
$pdo  = getDB();

$input   = getJsonInput();
$orderId = $input['order_id'] ?? null;
$method  = $input['method'] ?? null;

// 1. Validimi
if (!is_numeric($orderId) || (int) $orderId <= 0) {
    sendError(400, 'VALIDATION_ERROR', 'order_id është i detyrueshëm.');
}
if (!in_array($method, ['CASH', 'CARD'], true)) {
    sendError(400, 'VALIDATION_ERROR', 'method duhet të jetë CASH ose CARD.');
}
$orderId = (int) $orderId;

try {
    $pdo->beginTransaction();

    // 2. Merr porosinë dhe e bllokon gjatë transaksionit
    $stmt = $pdo->prepare('SELECT id, table_id, waiter_id, status, total FROM orders WHERE id = ? FOR UPDATE');
    $stmt->execute([$orderId]);
    $order = $stmt->fetch();

    if (!$order) {
        $pdo->rollBack();
        sendError(404, 'ORDER_NOT_FOUND', 'Porosia nuk ekziston.');
    }
    // Kamarieri mund ta paguajë vetëm porosinë e vet
    if ($user['role'] === 'WAITER' && (int) $order['waiter_id'] !== $user['id']) {
        $pdo->rollBack();
        sendError(403, 'FORBIDDEN', 'Nuk mund ta paguash porosinë e një kamarieri tjetër.');
    }
    if ($order['status'] === 'PAID') {
        $pdo->rollBack();
        sendError(409, 'ORDER_ALREADY_PAID', 'Porosia është paguar tashmë.');
    }
    if ($order['status'] !== 'SERVED') {
        $pdo->rollBack();
        sendError(409, 'ORDER_NOT_SERVED', 'Porosia duhet të jetë e shërbyer përpara pagesës.');
    }

    // 3. Regjistro pagesën, mbyll porosinë dhe liro tavolinën
    $pdo->prepare('INSERT INTO payments (order_id, amount, method) VALUES (?, ?, ?)')
        ->execute([$orderId, $order['total'], $method]);
    $pdo->prepare("UPDATE orders SET status = 'PAID' WHERE id = ?")->execute([$orderId]);
    $pdo->prepare("UPDATE restaurant_tables SET status = 'FREE' WHERE id = ?")
        ->execute([(int) $order['table_id']]);

    $pdo->commit();
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log($e->getMessage());
    sendError(500, 'SERVER_ERROR', 'Ndodhi një gabim në server.');
}

sendJson(201, [
    'success' => true,
    'message' => 'Pagesa u regjistrua.',
    'data'    => [
        'order_id' => $orderId,
        'amount'   => (float) $order['total'],
        'method'   => $method,
        'status'   => 'PAID',
    ],
]);