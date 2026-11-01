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