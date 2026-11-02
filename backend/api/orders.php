<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../helpers.php';

$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['id']) ? (int) $_GET['id'] : 0;
$pdo    = getDB();

switch ($method) {
    case 'GET':
        $user = requireLogin();
        if ($id > 0) {
            getOne($pdo, $id, $user);
        } else {
            getAll($pdo, $user);
        }
        break;

    case 'POST':
        $user = requireRole('WAITER', 'ADMIN');   // kuzhinieri nuk krijon porosi
        createOrder($pdo, $user);
        break;

    case 'PATCH':
        $user = requireLogin();
        updateStatus($pdo, $id, $user);
        break;

    default:
        sendError(405, 'METHOD_NOT_ALLOWED', 'Kjo metodë nuk lejohet këtu.');
}

// ---------------- Funksione ndihmëse ----------------

function orderStatuses(): array
{
    return ['NEW', 'IN_PREPARATION', 'READY', 'SERVED', 'PAID', 'CANCELLED'];
}

function orderSelectSql(): string
{
    return 'SELECT o.id, o.table_id, t.number AS table_number, o.waiter_id,
                   u.name AS waiter_name, o.status, o.total, o.created_at
            FROM orders o
            JOIN restaurant_tables t ON t.id = o.table_id
            JOIN users u ON u.id = o.waiter_id';
}

function findOrder(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare(orderSelectSql() . ' WHERE o.id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function getOrderItems(PDO $pdo, int $orderId): array
{
    $stmt = $pdo->prepare(
        'SELECT oi.menu_item_id, m.name, oi.quantity, oi.unit_price
         FROM order_items oi JOIN menu_items m ON m.id = oi.menu_item_id
         WHERE oi.order_id = ? ORDER BY oi.id'
    );
    $stmt->execute([$orderId]);

    return array_map(fn($i) => [
        'menu_item_id' => (int) $i['menu_item_id'],
        'name'         => $i['name'],
        'quantity'     => (int) $i['quantity'],
        'unit_price'   => (float) $i['unit_price'],
    ], $stmt->fetchAll());
}

function formatOrder(PDO $pdo, array $row, bool $withItems = false): array
{
    $out = [
        'id'           => (int) $row['id'],
        'table_id'     => (int) $row['table_id'],
        'table_number' => (int) $row['table_number'],
        'waiter'       => $row['waiter_name'],
        'status'       => $row['status'],
        'total'        => (float) $row['total'],
        'created_at'   => $row['created_at'],
    ];
    if ($withItems) {
        $out['items'] = getOrderItems($pdo, (int) $row['id']);
    }
    return $out;
}

// ---------------- Leximi i porosive ----------------

function getAll(PDO $pdo, array $user): void
{
    $where  = [];
    $params = [];

    // Kamarieri sheh vetëm porositë e veta; admini dhe kuzhina i shohin të gjitha
    if ($user['role'] === 'WAITER') {
        $where[]  = 'o.waiter_id = ?';
        $params[] = $user['id'];
    }

    // Filtër opsional: orders.php?status=NEW
    if (isset($_GET['status'])) {
        if (!in_array($_GET['status'], orderStatuses(), true)) {
            sendError(400, 'VALIDATION_ERROR', 'Statusi nuk është i vlefshëm.');
        }
        $where[]  = 'o.status = ?';
        $params[] = $_GET['status'];
    }

    $sql = orderSelectSql();
    if ($where) {
        $sql .= ' WHERE ' . implode(' AND ', $where);
    }
    $sql .= ' ORDER BY o.created_at DESC, o.id DESC';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $data = array_map(fn($row) => formatOrder($pdo, $row), $stmt->fetchAll());
    sendJson(200, ['success' => true, 'data' => $data]);
}

function getOne(PDO $pdo, int $id, array $user): void
{
    $order = findOrder($pdo, $id);
    if (!$order) {
        sendError(404, 'ORDER_NOT_FOUND', 'Porosia nuk ekziston.');
    }
    if ($user['role'] === 'WAITER' && (int) $order['waiter_id'] !== $user['id']) {
        sendError(403, 'FORBIDDEN', 'Nuk ke të drejtë ta shohësh këtë porosi.');
    }
    sendJson(200, ['success' => true, 'data' => formatOrder($pdo, $order, true)]);
}

// ---------------- Krijimi i porosisë ----------------

function createOrder(PDO $pdo, array $user): void
{
    $input   = getJsonInput();
    $tableId = $input['table_id'] ?? null;
    $items   = $input['items'] ?? null;

    // 1. Validimi i të dhënave hyrëse
    if (!is_numeric($tableId) || (int) $tableId <= 0) {
        sendError(400, 'VALIDATION_ERROR', 'table_id është i detyrueshëm.');
    }
    if (!is_array($items) || count($items) === 0) {
        sendError(400, 'VALIDATION_ERROR', 'Porosia duhet të ketë të paktën një artikull.');
    }

    // Bashko artikujt e përsëritur: [menu_item_id => sasia totale]
    $quantities = [];
    foreach ($items as $item) {
        $menuId = is_array($item) ? ($item['menu_item_id'] ?? null) : null;
        $qty    = is_array($item) ? ($item['quantity'] ?? null) : null;

        if (!is_numeric($menuId) || (int) $menuId <= 0
            || !is_numeric($qty) || (int) $qty != $qty || $qty < 1 || $qty > 100) {
            sendError(400, 'VALIDATION_ERROR',
                'Çdo artikull duhet të ketë menu_item_id dhe sasi nga 1 deri në 100.');
        }
        $menuId = (int) $menuId;
        $quantities[$menuId] = ($quantities[$menuId] ?? 0) + (int) $qty;
    }

    try {
        $pdo->beginTransaction();

        // 2. Tavolina duhet të ekzistojë dhe të jetë e lirë.
        //    FOR UPDATE e bllokon rreshtin, që dy kamarierë të mos e marrin të njëjtën tavolinë.
        $stmt = $pdo->prepare('SELECT status FROM restaurant_tables WHERE id = ? FOR UPDATE');
        $stmt->execute([(int) $tableId]);
        $table = $stmt->fetch();

        if (!$table) {
            $pdo->rollBack();
            sendError(404, 'TABLE_NOT_FOUND', 'Tavolina nuk ekziston.');
        }
        if ($table['status'] !== 'FREE') {
            $pdo->rollBack();
            sendError(409, 'TABLE_NOT_FREE', 'Tavolina është e zënë.');
        }

        // 3. Kontrollo çdo artikull dhe llogarit totalin
        $total = 0;
        $rows  = [];
        $stmt  = $pdo->prepare('SELECT id, name, price, is_available FROM menu_items WHERE id = ?');

        foreach ($quantities as $menuId => $qty) {
            $stmt->execute([$menuId]);
            $menu = $stmt->fetch();

            if (!$menu) {
                $pdo->rollBack();
                sendError(404, 'MENU_ITEM_NOT_FOUND', "Artikulli me ID $menuId nuk ekziston.");
            }
            if (!$menu['is_available']) {
                $pdo->rollBack();
                sendError(409, 'MENU_ITEM_UNAVAILABLE',
                    'Artikulli "' . $menu['name'] . '" nuk është i disponueshëm.');
            }
            $rows[] = [$menuId, $qty, $menu['price']];
            $total += $qty * $menu['price'];
        }
        $total = round($total, 2);

        // 4. Ruaj porosinë dhe artikujt e saj
        $stmt = $pdo->prepare('INSERT INTO orders (table_id, waiter_id, total) VALUES (?, ?, ?)');
        $stmt->execute([(int) $tableId, $user['id'], $total]);
        $orderId = (int) $pdo->lastInsertId();

        $stmt = $pdo->prepare(
            'INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price) VALUES (?, ?, ?, ?)'
        );
        foreach ($rows as [$menuId, $qty, $price]) {
            $stmt->execute([$orderId, $menuId, $qty, $price]);   // çmimi ruhet te porosia
        }

        // 5. Tavolina bëhet e zënë
        $pdo->prepare("UPDATE restaurant_tables SET status = 'OCCUPIED' WHERE id = ?")
            ->execute([(int) $tableId]);

        $pdo->commit();   // vetëm tani ruhet gjithçka
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log($e->getMessage());
        sendError(500, 'SERVER_ERROR', 'Ndodhi një gabim në server.');
    }

    sendJson(201, [
        'success' => true,
        'message' => 'Porosia u krijua.',
        'data'    => formatOrder($pdo, findOrder($pdo, $orderId), true),
    ]);
}

// ---------------- Ndryshimi i statusit ----------------

// Cilat ndryshime statusi lejohen për secilin rol
function allowedTransition(string $role, string $from, string $to): bool
{
    $rules = [
        'KITCHEN' => [
            'NEW'            => ['IN_PREPARATION'],
            'IN_PREPARATION' => ['READY'],
        ],
        'WAITER' => [
            'NEW'   => ['CANCELLED'],
            'READY' => ['SERVED'],
        ],
        'ADMIN' => [
            'NEW'            => ['IN_PREPARATION', 'CANCELLED'],
            'IN_PREPARATION' => ['READY', 'CANCELLED'],
            'READY'          => ['SERVED', 'CANCELLED'],
            'SERVED'         => ['CANCELLED'],
        ],
    ];
    return in_array($to, $rules[$role][$from] ?? [], true);
}

function updateStatus(PDO $pdo, int $id, array $user): void
{
    if ($id <= 0) {
        sendError(400, 'MISSING_ID', 'Shto ?id=... te adresa.');
    }

    $order = findOrder($pdo, $id);
    if (!$order) {
        sendError(404, 'ORDER_NOT_FOUND', 'Porosia nuk ekziston.');
    }

    // Kamarieri mund t'i ndryshojë vetëm porositë e veta
    if ($user['role'] === 'WAITER' && (int) $order['waiter_id'] !== $user['id']) {
        sendError(403, 'FORBIDDEN', 'Nuk mund t\'i ndryshosh porositë e një kamarieri tjetër.');
    }

    $input = getJsonInput();
    $to    = $input['status'] ?? null;
    $from  = $order['status'];

    if (!in_array($to, orderStatuses(), true)) {
        sendError(400, 'VALIDATION_ERROR', 'Statusi nuk është i vlefshëm.');
    }
    if ($to === 'PAID') {
        sendError(400, 'VALIDATION_ERROR', 'Statusi PAID vendoset vetëm përmes pagesës.');
    }
    if (in_array($from, ['PAID', 'CANCELLED'], true)) {
        sendError(409, 'ORDER_CLOSED', 'Porosia është e mbyllur dhe nuk mund të ndryshohet.');
    }
    if (!allowedTransition($user['role'], $from, $to)) {
        sendError(403, 'FORBIDDEN', "Roli yt nuk mund ta kalojë porosinë nga $from në $to.");
    }

    try {
        $pdo->beginTransaction();
        $pdo->prepare('UPDATE orders SET status = ? WHERE id = ?')->execute([$to, $id]);

        // Nëse porosia anulohet, tavolina lirohet
        if ($to === 'CANCELLED') {
            $pdo->prepare("UPDATE restaurant_tables SET status = 'FREE' WHERE id = ?")
                ->execute([(int) $order['table_id']]);
        }
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
        'message' => 'Statusi u ndryshua.',
        'data'    => formatOrder($pdo, findOrder($pdo, $id)),
    ]);
}