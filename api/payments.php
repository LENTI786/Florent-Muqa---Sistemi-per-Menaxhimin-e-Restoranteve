
<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../helpers.php';

$method = $_SERVER['REQUEST_METHOD'];
$pdo = getDB();

switch ($method) {

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
        sendError(405, 'METHOD_NOT_ALLOWED', 'Metoda nuk lejohet.');
}


// ============================================
// GET - HISTORIKU I PAGESAVE
// ============================================

function getPaymentHistory(PDO $pdo, array $user): void
{
    $where = [];
    $params = [];

    // Kamarieri sheh vetëm pagesat e porosive të veta
    if ($user['role'] === 'WAITER') {
        $where[] = 'o.waiter_id = ?';
        $params[] = $user['id'];
    }

    // Filtri sipas ID së porosisë
    if (!empty($_GET['order_id'])) {

        if (!ctype_digit((string) $_GET['order_id']) || (int) $_GET['order_id'] <= 0) {
            sendError(400, 'VALIDATION_ERROR', 'ID e porosisë nuk është e vlefshme.');
        }

        $where[] = 'p.order_id = ?';
        $params[] = (int) $_GET['order_id'];
    }

    // Filtri sipas kamarierit - vetëm ADMIN
    if (!empty($_GET['waiter_id'])) {

        if ($user['role'] !== 'ADMIN') {
            sendError(403, 'FORBIDDEN', 'Vetëm administratori mund të filtrojë sipas kamarierit.');
        }

        if (!ctype_digit((string) $_GET['waiter_id']) || (int) $_GET['waiter_id'] <= 0) {
            sendError(400, 'VALIDATION_ERROR', 'ID e kamarierit nuk është e vlefshme.');
        }

        $where[] = 'o.waiter_id = ?';
        $params[] = (int) $_GET['waiter_id'];
    }

    // Filtri sipas statusit - vetëm ADMIN
    if (!empty($_GET['status'])) {

        if ($user['role'] !== 'ADMIN') {
            sendError(403, 'FORBIDDEN', 'Vetëm administratori mund të filtrojë sipas statusit.');
        }

        if (!in_array($_GET['status'], ['PAID', 'CANCELLED'], true)) {
            sendError(400, 'VALIDATION_ERROR', 'Statusi nuk është i vlefshëm.');
        }

        $where[] = 'p.status = ?';
        $params[] = $_GET['status'];
    }

    // Filtri sipas datës
    if (!empty($_GET['date_from'])) {

        $date = DateTime::createFromFormat('Y-m-d', $_GET['date_from']);

        if (!$date || $date->format('Y-m-d') !== $_GET['date_from']) {
            sendError(400, 'VALIDATION_ERROR', 'Data fillestare nuk është e vlefshme.');
        }

        $where[] = 'p.paid_at >= ?';
        $params[] = $_GET['date_from'] . ' 00:00:00';
    }

    if (!empty($_GET['date_to'])) {

        $date = DateTime::createFromFormat('Y-m-d', $_GET['date_to']);

        if (!$date || $date->format('Y-m-d') !== $_GET['date_to']) {
            sendError(400, 'VALIDATION_ERROR', 'Data përfundimtare nuk është e vlefshme.');
        }

        $where[] = 'p.paid_at < DATE_ADD(?, INTERVAL 1 DAY)';
        $params[] = $_GET['date_to'] . ' 00:00:00';
    }

    $sql = "
        SELECT
            p.id,
            p.order_id,
            p.amount,
            p.method,
            p.status,
            p.paid_at,
            p.cancelled_at,
            p.cancellation_reason,
            p.paid_by,
            p.cancelled_by,
            t.number AS table_number,
            o.waiter_id,
            w.name AS waiter_name,
            payer.name AS paid_by_name,
            canceller.name AS cancelled_by_name

        FROM payments p

        JOIN orders o ON o.id = p.order_id
        JOIN restaurant_tables t ON t.id = o.table_id
        JOIN users w ON w.id = o.waiter_id

        LEFT JOIN users payer ON payer.id = p.paid_by
        LEFT JOIN users canceller ON canceller.id = p.cancelled_by
    ";

    if ($where) {
        $sql .= ' WHERE ' . implode(' AND ', $where);
    }

    $sql .= ' ORDER BY p.paid_at DESC, p.id DESC';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $payments = [];

    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {

        $payments[] = [
            'id' => (int) $row['id'],
            'order_id' => (int) $row['order_id'],
            'table_number' => (int) $row['table_number'],
            'amount' => (float) $row['amount'],
            'method' => $row['method'],
            'status' => $row['status'],
            'paid_at' => $row['paid_at'],

            'waiter_id' => (int) $row['waiter_id'],
            'waiter_name' => $row['waiter_name'],

            'paid_by' => $row['paid_by'] !== null
                ? (int) $row['paid_by'] : null,

            'paid_by_name' => $row['paid_by_name'],

            'cancelled_at' => $row['cancelled_at'],

            'cancelled_by' => $row['cancelled_by'] !== null
                ? (int) $row['cancelled_by'] : null,

            'cancelled_by_name' => $row['cancelled_by_name'],
            'cancellation_reason' => $row['cancellation_reason'],
        ];
    }

    // Statistikat vetëm për ADMIN
    $stats = null;

    if ($user['role'] === 'ADMIN') {
        $stats = getRevenueStats($pdo);
    }

    sendJson(200, [
        'success' => true,
        'data' => $payments,
        'stats' => $stats,
    ]);
}


// ============================================
// GET - DETAJET E PAGESËS / FATURA
// ============================================

function getPaymentDetails(PDO $pdo, array $user): void
{
    $paymentId = $_GET['id'] ?? null;

    if (
        !ctype_digit((string) $paymentId) ||
        (int) $paymentId <= 0
    ) {
        sendError(400, 'VALIDATION_ERROR', 'ID e pagesës nuk është e vlefshme.');
    }

    // Merr të dhënat e pagesës dhe porosisë
    $stmt = $pdo->prepare("
        SELECT
            p.id,
            p.order_id,
            p.amount,
            p.method,
            p.status,
            p.paid_at,
            p.paid_by,
            p.cancelled_at,
            p.cancelled_by,
            p.cancellation_reason,

            t.number AS table_number,

            o.waiter_id,

            w.name AS waiter_name,
            payer.name AS paid_by_name,
            canceller.name AS cancelled_by_name

        FROM payments p

        JOIN orders o ON o.id = p.order_id
        JOIN restaurant_tables t ON t.id = o.table_id
        JOIN users w ON w.id = o.waiter_id

        LEFT JOIN users payer ON payer.id = p.paid_by
        LEFT JOIN users canceller ON canceller.id = p.cancelled_by

        WHERE p.id = ?
    ");

    $stmt->execute([(int) $paymentId]);

    $payment = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$payment) {
        sendError(404, 'PAYMENT_NOT_FOUND', 'Pagesa nuk ekziston.');
    }

    // Kamarieri mund të shohë vetëm faturat e porosive të veta
    if (
        $user['role'] === 'WAITER' &&
        (int) $payment['waiter_id'] !== (int) $user['id']
    ) {
        sendError(403, 'FORBIDDEN', 'Nuk ke të drejtë të shohësh këtë faturë.');
    }

    // Merr artikujt e porosisë
    $stmt = $pdo->prepare("
        SELECT
            mi.name,
            oi.quantity,
            oi.unit_price,
            (oi.quantity * oi.unit_price) AS subtotal

        FROM order_items oi

        JOIN menu_items mi ON mi.id = oi.menu_item_id

        WHERE oi.order_id = ?

        ORDER BY oi.id ASC
    ");

    $stmt->execute([(int) $payment['order_id']]);

    $items = [];

    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $item) {

        $items[] = [
            'name' => $item['name'],
            'quantity' => (int) $item['quantity'],
            'unit_price' => (float) $item['unit_price'],
            'subtotal' => (float) $item['subtotal'],
        ];
    }

    // Konvertimi i të dhënave në tipe të përshtatshme
    $payment['id'] = (int) $payment['id'];
    $payment['order_id'] = (int) $payment['order_id'];
    $payment['table_number'] = (int) $payment['table_number'];
    $payment['amount'] = (float) $payment['amount'];
    $payment['waiter_id'] = (int) $payment['waiter_id'];

    $payment['paid_by'] = $payment['paid_by'] !== null
        ? (int) $payment['paid_by'] : null;

    $payment['cancelled_by'] = $payment['cancelled_by'] !== null
        ? (int) $payment['cancelled_by'] : null;

    sendJson(200, [
        'success' => true,
        'data' => [
            'payment' => $payment,
            'items' => $items,
        ],
    ]);
}


// ============================================
// STATISTIKAT E TË HYRAVE
// ============================================

function getRevenueStats(PDO $pdo): array
{
    $stmt = $pdo->query("
        SELECT
            COALESCE(SUM(
                CASE
                    WHEN paid_at >= CURDATE()
                    AND paid_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
                    THEN amount
                    ELSE 0
                END
            ), 0) AS daily_revenue,

            COALESCE(SUM(
                CASE
                    WHEN paid_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
                    AND paid_at < DATE_ADD(
                        DATE_FORMAT(CURDATE(), '%Y-%m-01'),
                        INTERVAL 1 MONTH
                    )
                    THEN amount
                    ELSE 0
                END
            ), 0) AS monthly_revenue,

            COUNT(*) AS total_payments

        FROM payments

        WHERE status = 'PAID'
    ");

    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    return [
        'daily_revenue' => (float) $row['daily_revenue'],
        'monthly_revenue' => (float) $row['monthly_revenue'],
        'total_payments' => (int) $row['total_payments'],
    ];
}


// ============================================
// POST - REGJISTRIMI I PAGESËS
// ============================================

function createPayment(PDO $pdo, array $user): void
{
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

        $order = $stmt->fetch(PDO::FETCH_ASSOC);

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

        // Regjistro pagesën
        $stmt = $pdo->prepare("
            INSERT INTO payments (order_id, amount, method, paid_by)
            VALUES (?, ?, ?, ?)
        ");

        $stmt->execute([
            $orderId,
            $order['total'],
            $method,
            $user['id']
        ]);

        $paymentId = (int) $pdo->lastInsertId();

        // Përditëso statusin e porosisë
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
            'paid_by' => (int) $user['id'],
            'status' => 'PAID',
        ],
    ]);
}


// ============================================
// PATCH - ANULIMI I PAGESËS
// ============================================

function cancelPayment(PDO $pdo, array $user): void
{
    $input = getJsonInput();

    $paymentId = $input['payment_id'] ?? null;
    $reason = trim($input['reason'] ?? '');

    if (!is_numeric($paymentId) || (int) $paymentId <= 0) {
        sendError(400, 'VALIDATION_ERROR', 'payment_id është i detyrueshëm.');
    }

    if ($reason === '' || mb_strlen($reason) > 255) {
        sendError(400, 'VALIDATION_ERROR', 'Arsyeja është e detyrueshme dhe nuk duhet të kalojë 255 karaktere.');
    }

    $paymentId = (int) $paymentId;

    try {

        $pdo->beginTransaction();

        $stmt = $pdo->prepare("
            SELECT
                p.id,
                p.order_id,
                p.status,
                o.status AS order_status

            FROM payments p

            JOIN orders o ON o.id = p.order_id

            WHERE p.id = ?

            FOR UPDATE
        ");

        $stmt->execute([$paymentId]);

        $payment = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$payment) {
            $pdo->rollBack();
            sendError(404, 'PAYMENT_NOT_FOUND', 'Pagesa nuk ekziston.');
        }

        if ($payment['status'] === 'CANCELLED') {
            $pdo->rollBack();
            sendError(409, 'PAYMENT_ALREADY_CANCELLED', 'Pagesa është anuluar tashmë.');
        }

        if ($payment['order_status'] !== 'PAID') {
            $pdo->rollBack();
            sendError(409, 'ORDER_NOT_PAID', 'Porosia nuk është në statusin PAID.');
        }

        // Anulo pagesën, por ruaje në historik
        $stmt = $pdo->prepare("
            UPDATE payments

            SET
                status = 'CANCELLED',
                cancelled_at = CURRENT_TIMESTAMP,
                cancelled_by = ?,
                cancellation_reason = ?

            WHERE id = ?
        ");

        $stmt->execute([
            $user['id'],
            $reason,
            $paymentId
        ]);

        // Porosia mbetet PAID.
        // Tavolina nuk ndryshohet.

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
        'message' => 'Pagesa u anulua me sukses.',
        'data' => [
            'payment_id' => $paymentId,
            'order_id' => (int) $payment['order_id'],
            'status' => 'CANCELLED',
            'cancelled_by' => (int) $user['id'],
            'cancellation_reason' => $reason,
        ],
    ]);
}
