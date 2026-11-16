
<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../helpers.php';

$pdo = getDB();

switch ($_SERVER['REQUEST_METHOD']) {

    case 'GET':
        $user = requireRole('ADMIN', 'WAITER');

        if (isset($_GET['id'])) {
            getPaymentDetails($pdo, $user);
        }

        getPaymentHistory($pdo, $user);
        break;

    case 'POST':
        $user = requireRole('ADMIN', 'WAITER');
        createPayment($pdo, $user);
        break;

    case 'PATCH':
        $user = requireRole('ADMIN');
        cancelPayment($pdo, $user);
        break;

    default:
        sendError(405, 'METHOD_NOT_ALLOWED', 'Metoda HTTP nuk lejohet.');
}


// =====================================================
// HISTORIKU I PAGESAVE
// =====================================================

function getPaymentHistory(PDO $pdo, array $user): void {

    $sql = "
        SELECT
            p.id,
            p.order_id,
            t.number AS table_number,
            p.amount,
            p.method,
            p.status,
            p.paid_at,
            o.waiter_id,
            w.name AS waiter_name,
            p.paid_by,
            payer.name AS paid_by_name,
            p.cancelled_at,
            p.cancelled_by,
            canceller.name AS cancelled_by_name,
            p.cancellation_reason

        FROM payments p

        INNER JOIN orders o ON o.id = p.order_id
        INNER JOIN restaurant_tables t ON t.id = o.table_id
        INNER JOIN users w ON w.id = o.waiter_id

        LEFT JOIN users payer ON payer.id = p.paid_by
        LEFT JOIN users canceller ON canceller.id = p.cancelled_by

        WHERE 1 = 1
    ";

    $params = [];

    // Kamarieri sheh vetëm pagesat e porosive të veta
    if ($user['role'] === 'WAITER') {
        $sql .= " AND o.waiter_id = ?";
        $params[] = (int) $user['id'];
    }

    // Filtri sipas ID së porosisë
    if (isset($_GET['order_id']) && $_GET['order_id'] !== '') {

        if (!ctype_digit((string) $_GET['order_id']) || (int) $_GET['order_id'] <= 0) {
            sendError(400, 'VALIDATION_ERROR', 'order_id nuk është valid.');
        }

        $sql .= " AND p.order_id = ?";
        $params[] = (int) $_GET['order_id'];
    }

    // Filtrat shtesë vetëm për ADMIN
    if ($user['role'] === 'ADMIN') {

        if (isset($_GET['waiter_id']) && $_GET['waiter_id'] !== '') {

            if (!ctype_digit((string) $_GET['waiter_id']) || (int) $_GET['waiter_id'] <= 0) {
                sendError(400, 'VALIDATION_ERROR', 'waiter_id nuk është valid.');
            }

            $sql .= " AND o.waiter_id = ?";
            $params[] = (int) $_GET['waiter_id'];
        }

        if (isset($_GET['status']) && $_GET['status'] !== '') {

            if (!in_array($_GET['status'], ['PAID', 'CANCELLED'], true)) {
                sendError(400, 'VALIDATION_ERROR', 'Statusi nuk është valid.');
            }

            $sql .= " AND p.status = ?";
            $params[] = $_GET['status'];
        }
    }

    // Filtrat sipas datës
    if (!empty($_GET['date_from'])) {

        $dateFrom = $_GET['date_from'];

        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateFrom)) {
            sendError(400, 'VALIDATION_ERROR', 'Data fillestare nuk është valide.');
        }

        $sql .= " AND p.paid_at >= ?";
        $params[] = $dateFrom . ' 00:00:00';
    }

    if (!empty($_GET['date_to'])) {

        $dateTo = $_GET['date_to'];

        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateTo)) {
            sendError(400, 'VALIDATION_ERROR', 'Data përfundimtare nuk është valide.');
        }

        $sql .= " AND p.paid_at < DATE_ADD(?, INTERVAL 1 DAY)";
        $params[] = $dateTo . ' 00:00:00';
    }

    $sql .= " ORDER BY p.paid_at DESC";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $payments = $stmt->fetchAll();

    $stats = null;

    if ($user['role'] === 'ADMIN') {
        $stats = getRevenueStats($pdo);
    }

    sendJson(200, [
        'success' => true,
        'data' => $payments,
        'stats' => $stats
    ]);
}


// =====================================================
// DETAJET E FATURËS
// =====================================================

function getPaymentDetails(PDO $pdo, array $user): void {

    $paymentId = $_GET['id'];

    if (!ctype_digit((string) $paymentId) || (int) $paymentId <= 0) {
        sendError(400, 'VALIDATION_ERROR', 'ID e pagesës nuk është valide.');
    }

    $sql = "
        SELECT
            p.id,
            p.order_id,
            p.amount,
            p.method,
            p.status,
            p.paid_at,
            p.paid_by,
            payer.name AS paid_by_name,

            p.cancelled_at,
            p.cancelled_by,
            canceller.name AS cancelled_by_name,
            p.cancellation_reason,

            o.waiter_id,
            w.name AS waiter_name,

            t.number AS table_number

        FROM payments p

        INNER JOIN orders o ON o.id = p.order_id
        INNER JOIN restaurant_tables t ON t.id = o.table_id
        INNER JOIN users w ON w.id = o.waiter_id

        LEFT JOIN users payer ON payer.id = p.paid_by
        LEFT JOIN users canceller ON canceller.id = p.cancelled_by

        WHERE p.id = ?
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([(int) $paymentId]);

    $payment = $stmt->fetch();

    if (!$payment) {
        sendError(404, 'PAYMENT_NOT_FOUND', 'Pagesa nuk ekziston.');
    }

    // Kamarieri mund të shohë vetëm faturat e porosive të veta
    if (
        $user['role'] === 'WAITER' &&
        (int) $payment['waiter_id'] !== (int) $user['id']
    ) {
        sendError(404, 'PAYMENT_NOT_FOUND', 'Pagesa nuk ekziston.');
    }

    // Merr artikujt e faturës
    $itemsSql = "
        SELECT
            oi.menu_item_id,
            mi.name,
            oi.quantity,
            oi.unit_price,
            (oi.quantity * oi.unit_price) AS subtotal

        FROM order_items oi

        INNER JOIN menu_items mi ON mi.id = oi.menu_item_id

        WHERE oi.order_id = ?

        ORDER BY oi.id ASC
    ";

    $itemsStmt = $pdo->prepare($itemsSql);
    $itemsStmt->execute([(int) $payment['order_id']]);

    $items = $itemsStmt->fetchAll();

    sendJson(200, [
        'success' => true,
        'data' => [
            'payment' => $payment,
            'items' => $items
        ]
    ]);
}


// =====================================================
// STATISTIKAT E TË HYRAVE
// =====================================================

function getRevenueStats(PDO $pdo): array {

    $dailySql = "
        SELECT
            COALESCE(SUM(amount), 0) AS revenue,
            COUNT(*) AS total
        FROM payments
        WHERE status = 'PAID'
        AND paid_at >= CURDATE()
        AND paid_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
    ";

    $daily = $pdo->query($dailySql)->fetch();

    $monthlySql = "
        SELECT
            COALESCE(SUM(amount), 0) AS revenue
        FROM payments
        WHERE status = 'PAID'
        AND paid_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
        AND paid_at < DATE_ADD(
            DATE_FORMAT(CURDATE(), '%Y-%m-01'),
            INTERVAL 1 MONTH
        )
    ";

    $monthly = $pdo->query($monthlySql)->fetch();

    return [
        'daily_revenue' => (float) $daily['revenue'],
        'monthly_revenue' => (float) $monthly['revenue'],
        'total_payments' => (int) $pdo->query(
            "SELECT COUNT(*) FROM payments WHERE status = 'PAID'"
        )->fetchColumn()
    ];
}


// =====================================================
// REGJISTRIMI I PAGESËS
// =====================================================

function createPayment(PDO $pdo, array $user): void {

    $input = getJsonInput();

    $orderId = $input['order_id'] ?? null;
    $method = $input['method'] ?? null;

    if (!is_numeric($orderId) || (int) $orderId <= 0) {
        sendError(400, 'VALIDATION_ERROR', 'order_id është i detyrueshëm.');
    }

    if (!in_array($method, ['CASH', 'CARD'], true)) {
        sendError(400, 'VALIDATION_ERROR', 'method duhet të jetë CASH ose CARD.');
    }

    $orderId = (int) $orderId;

    try {

        $pdo->beginTransaction();

        $stmt = $pdo->prepare("
            SELECT id, table_id, waiter_id, status, total
            FROM orders
            WHERE id = ?
            FOR UPDATE
        ");

        $stmt->execute([$orderId]);

        $order = $stmt->fetch();

        if (!$order) {
            $pdo->rollBack();
            sendError(404, 'ORDER_NOT_FOUND', 'Porosia nuk ekziston.');
        }

        if (
            $user['role'] === 'WAITER' &&
            (int) $order['waiter_id'] !== (int) $user['id']
        ) {
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

        // Regjistro pagesën dhe personin që e regjistroi
        $insert = $pdo->prepare("
            INSERT INTO payments (
                order_id,
                amount,
                method,
                paid_by
            )
            VALUES (?, ?, ?, ?)
        ");

        $insert->execute([
            $orderId,
            $order['total'],
            $method,
            (int) $user['id']
        ]);

        // Përditëso porosinë
        $pdo->prepare("
            UPDATE orders
            SET status = 'PAID'
            WHERE id = ?
        ")->execute([$orderId]);

        // Liro tavolinën
        $pdo->prepare("
            UPDATE restaurant_tables
            SET status = 'FREE'
            WHERE id = ?
        ")->execute([(int) $order['table_id']]);

        $paymentId = (int) $pdo->lastInsertId();

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
        'data' => [
            'id' => $paymentId,
            'order_id' => $orderId,
            'amount' => (float) $order['total'],
            'method' => $method,
            'status' => 'PAID'
        ]
    ]);
}


// =====================================================
// ANULIMI I PAGESËS
// =====================================================

function cancelPayment(PDO $pdo, array $user): void {

    $input = getJsonInput();

    $paymentId = $input['payment_id'] ?? null;
    $reason = trim($input['reason'] ?? '');

    if (!is_numeric($paymentId) || (int) $paymentId <= 0) {
        sendError(400, 'VALIDATION_ERROR', 'payment_id është i detyrueshëm.');
    }

    if ($reason === '') {
        sendError(400, 'VALIDATION_ERROR', 'Duhet të shkruash arsyen e anulimit.');
    }

    if (mb_strlen($reason) > 255) {
        sendError(400, 'VALIDATION_ERROR', 'Arsyeja nuk mund të ketë më shumë se 255 karaktere.');
    }

    $paymentId = (int) $paymentId;

    try {

        $pdo->beginTransaction();

        $stmt = $pdo->prepare("
            SELECT id, status
            FROM payments
            WHERE id = ?
            FOR UPDATE
        ");

        $stmt->execute([$paymentId]);

        $payment = $stmt->fetch();

        if (!$payment) {
            $pdo->rollBack();
            sendError(404, 'PAYMENT_NOT_FOUND', 'Pagesa nuk ekziston.');
        }

        if ($payment['status'] === 'CANCELLED') {
            $pdo->rollBack();
            sendError(409, 'PAYMENT_ALREADY_CANCELLED', 'Pagesa është anuluar më parë.');
        }

        // Anulo vetëm pagesën.
        // Porosia mbetet PAID dhe nuk rikthehet te porositë në pritje.
        $update = $pdo->prepare("
            UPDATE payments
            SET
                status = 'CANCELLED',
                cancelled_at = CURRENT_TIMESTAMP,
                cancelled_by = ?,
                cancellation_reason = ?
            WHERE id = ?
        ");

        $update->execute([
            (int) $user['id'],
            $reason,
            $paymentId
        ]);

        // Nuk ndryshojmë orders ose restaurant_tables.
        $pdo->commit();

    } catch (PDOException $e) {

        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        error_log($e->getMessage());

        sendError(500, 'SERVER_ERROR', 'Ndodhi një gabim në server.');
    }

    sendJson(200, [
        'success' => true,
        'message' => 'Pagesa u anulua dhe u ruajt në historik.',
        'data' => [
            'payment_id' => $paymentId,
            'status' => 'CANCELLED'
        ]
    ]);
}
