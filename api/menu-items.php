<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../helpers.php';

$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['id']) ? (int) $_GET['id'] : 0;   // p.sh. menu-items.php?id=3
$pdo    = getDB();

// Zgjedh çfarë të bëjë sipas metodës HTTP
switch ($method) {
    case 'GET':
        requireLogin();                 // çdo përdorues i kyçur mund ta shohë menunë
        if ($id > 0) {
            getOne($pdo, $id);
        } else {
            getAll($pdo);
        }
        break;

    case 'POST':
        requireRole('ADMIN');           // vetëm admini
        createItem($pdo);
        break;

    case 'PATCH':
        requireRole('ADMIN');
        updateItem($pdo, $id);
        break;

    case 'DELETE':
        requireRole('ADMIN');
        deleteItem($pdo, $id);
        break;

    default:
        sendError(405, 'METHOD_NOT_ALLOWED', 'Kjo metodë nuk lejohet këtu.');
}

// ---------------- Funksionet ----------------

// E kthen një rresht nga databaza në formën që e shohin klientët
function formatItem(array $row): array
{
    return [
        'id'           => (int) $row['id'],
        'category_id'  => (int) $row['category_id'],
        'category'     => $row['category'],
        'name'         => $row['name'],
        'price'        => (float) $row['price'],
        'is_available' => (bool) $row['is_available'],
    ];
}

// Gjen një artikull sipas ID-së (ose kthen null nëse nuk ekziston)
function findItem(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare(
        'SELECT m.id, m.category_id, c.name AS category, m.name, m.price, m.is_available
         FROM menu_items m JOIN categories c ON c.id = m.category_id
         WHERE m.id = ?'
    );
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function getAll(PDO $pdo): void
{
    $rows = $pdo->query(
        'SELECT m.id, m.category_id, c.name AS category, m.name, m.price, m.is_available
         FROM menu_items m JOIN categories c ON c.id = m.category_id
         ORDER BY c.name, m.name'
    )->fetchAll();

    sendJson(200, ['success' => true, 'data' => array_map('formatItem', $rows)]);
}

function getOne(PDO $pdo, int $id): void
{
    $row = findItem($pdo, $id);
    if (!$row) {
        sendError(404, 'MENU_ITEM_NOT_FOUND', 'Artikulli nuk ekziston.');
    }
    sendJson(200, ['success' => true, 'data' => formatItem($row)]);
}

// Kthen tekstin e gabimit nëse të dhënat nuk janë të vlefshme, përndryshe null
function validateItem(PDO $pdo, $name, $price, $categoryId): ?string
{
    if (!is_string($name) || trim($name) === '' || mb_strlen(trim($name)) > 120) {
        return 'Emri është i detyrueshëm (maksimumi 120 shkronja).';
    }
    if (!is_numeric($price) || $price <= 0 || $price >= 10000) {
        return 'Çmimi duhet të jetë numër më i madh se 0.';
    }
    $stmt = $pdo->prepare('SELECT id FROM categories WHERE id = ?');
    $stmt->execute([(int) $categoryId]);
    if (!$stmt->fetch()) {
        return 'Kategoria nuk ekziston.';
    }
    return null;
}

function createItem(PDO $pdo): void
{
    $input      = getJsonInput();
    $name       = $input['name'] ?? null;
    $price      = $input['price'] ?? null;
    $categoryId = $input['category_id'] ?? null;
    $available  = array_key_exists('is_available', $input) ? (int) (bool) $input['is_available'] : 1;

    $error = validateItem($pdo, $name, $price, $categoryId);
    if ($error) {
        sendError(400, 'VALIDATION_ERROR', $error);
    }

    $stmt = $pdo->prepare(
        'INSERT INTO menu_items (category_id, name, price, is_available) VALUES (?, ?, ?, ?)'
    );
    $stmt->execute([(int) $categoryId, trim($name), $price, $available]);

    $newId = (int) $pdo->lastInsertId();
    sendJson(201, [
        'success' => true,
        'message' => 'Artikulli u shtua.',
        'data'    => formatItem(findItem($pdo, $newId)),
    ]);
}

function updateItem(PDO $pdo, int $id): void
{
    if ($id <= 0) {
        sendError(400, 'MISSING_ID', 'Shto ?id=... te adresa.');
    }
    $existing = findItem($pdo, $id);
    if (!$existing) {
        sendError(404, 'MENU_ITEM_NOT_FOUND', 'Artikulli nuk ekziston.');
    }

    $input = getJsonInput();
    // Nëse një fushë nuk dërgohet, mbetet vlera e vjetër
    $name       = $input['name']        ?? $existing['name'];
    $price      = $input['price']       ?? $existing['price'];
    $categoryId = $input['category_id'] ?? $existing['category_id'];
    $available  = array_key_exists('is_available', $input)
        ? (int) (bool) $input['is_available']
        : (int) $existing['is_available'];

    $error = validateItem($pdo, $name, $price, $categoryId);
    if ($error) {
        sendError(400, 'VALIDATION_ERROR', $error);
    }

    $stmt = $pdo->prepare(
        'UPDATE menu_items SET category_id = ?, name = ?, price = ?, is_available = ? WHERE id = ?'
    );
    $stmt->execute([(int) $categoryId, trim($name), $price, $available, $id]);

    sendJson(200, [
        'success' => true,
        'message' => 'Artikulli u ndryshua.',
        'data'    => formatItem(findItem($pdo, $id)),
    ]);
}

function deleteItem(PDO $pdo, int $id): void
{
    if ($id <= 0) {
        sendError(400, 'MISSING_ID', 'Shto ?id=... te adresa.');
    }
    if (!findItem($pdo, $id)) {
        sendError(404, 'MENU_ITEM_NOT_FOUND', 'Artikulli nuk ekziston.');
    }

    try {
        $stmt = $pdo->prepare('DELETE FROM menu_items WHERE id = ?');
        $stmt->execute([$id]);
    } catch (PDOException $e) {
        // 1451 = shkelje e çelësit të huaj: artikulli është përdorur në një porosi
        if ((int) ($e->errorInfo[1] ?? 0) === 1451) {
            sendError(409, 'MENU_ITEM_IN_USE',
                'Artikulli është në porosi dhe nuk mund të fshihet. Vendose si jo i disponueshëm.');
        }
        throw $e;
    }

    sendJson(200, ['success' => true, 'message' => 'Artikulli u fshi.']);
}