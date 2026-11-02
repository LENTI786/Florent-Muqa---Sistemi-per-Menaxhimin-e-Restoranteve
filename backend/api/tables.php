<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../helpers.php';

$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['id']) ? (int) $_GET['id'] : 0;
$pdo    = getDB();

switch ($method) {
    case 'GET':
        requireLogin();
        if ($id > 0) {
            getOne($pdo, $id);
        } else {
            getAll($pdo);
        }
        break;

    case 'POST':
        requireRole('ADMIN');
        createTable($pdo);
        break;

    case 'PATCH':
        requireRole('ADMIN');
        updateTable($pdo, $id);
        break;

    case 'DELETE':
        requireRole('ADMIN');
        deleteTable($pdo, $id);
        break;

    default:
        sendError(405, 'METHOD_NOT_ALLOWED', 'Kjo metodë nuk lejohet këtu.');
}

// ---------------- Funksionet ----------------

function formatTable(array $row): array
{
    return [
        'id'       => (int) $row['id'],
        'number'   => (int) $row['number'],
        'capacity' => (int) $row['capacity'],
        'status'   => $row['status'],
    ];
}

function findTable(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT id, number, capacity, status FROM restaurant_tables WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function getAll(PDO $pdo): void
{
    $rows = $pdo->query(
        'SELECT id, number, capacity, status FROM restaurant_tables ORDER BY number'
    )->fetchAll();
    sendJson(200, ['success' => true, 'data' => array_map('formatTable', $rows)]);
}

function getOne(PDO $pdo, int $id): void
{
    $row = findTable($pdo, $id);
    if (!$row) {
        sendError(404, 'TABLE_NOT_FOUND', 'Tavolina nuk ekziston.');
    }
    sendJson(200, ['success' => true, 'data' => formatTable($row)]);
}

// Kthen tekstin e gabimit nëse të dhënat nuk janë të vlefshme, përndryshe null
function validateTable($number, $capacity): ?string
{
    if (!is_numeric($number) || (int) $number != $number || $number < 1 || $number > 999) {
        return 'Numri i tavolinës duhet të jetë numër i plotë nga 1 deri në 999.';
    }
    if (!is_numeric($capacity) || (int) $capacity != $capacity || $capacity < 1 || $capacity > 50) {
        return 'Kapaciteti duhet të jetë numër i plotë nga 1 deri në 50.';
    }
    return null;
}

function createTable(PDO $pdo): void
{
    $input    = getJsonInput();
    $number   = $input['number'] ?? null;
    $capacity = $input['capacity'] ?? null;

    $error = validateTable($number, $capacity);
    if ($error) {
        sendError(400, 'VALIDATION_ERROR', $error);
    }

    try {
        $stmt = $pdo->prepare('INSERT INTO restaurant_tables (number, capacity) VALUES (?, ?)');
        $stmt->execute([(int) $number, (int) $capacity]);
    } catch (PDOException $e) {
        // 1062 = vlerë e dyfishtë në një fushë UNIQUE
        if ((int) ($e->errorInfo[1] ?? 0) === 1062) {
            sendError(409, 'TABLE_NUMBER_EXISTS', 'Ekziston tashmë një tavolinë me këtë numër.');
        }
        throw $e;
    }

    $newId = (int) $pdo->lastInsertId();
    sendJson(201, [
        'success' => true,
        'message' => 'Tavolina u shtua.',
        'data'    => formatTable(findTable($pdo, $newId)),
    ]);
}

function updateTable(PDO $pdo, int $id): void
{
    if ($id <= 0) {
        sendError(400, 'MISSING_ID', 'Shto ?id=... te adresa.');
    }
    $existing = findTable($pdo, $id);
    if (!$existing) {
        sendError(404, 'TABLE_NOT_FOUND', 'Tavolina nuk ekziston.');
    }

    $input    = getJsonInput();
    $number   = $input['number']   ?? $existing['number'];
    $capacity = $input['capacity'] ?? $existing['capacity'];
    $status   = $input['status']   ?? $existing['status'];

    $error = validateTable($number, $capacity);
    if (!$error && !in_array($status, ['FREE', 'OCCUPIED'], true)) {
        $error = 'Statusi duhet të jetë FREE ose OCCUPIED.';
    }
    if ($error) {
        sendError(400, 'VALIDATION_ERROR', $error);
    }

    try {
        $stmt = $pdo->prepare(
            'UPDATE restaurant_tables SET number = ?, capacity = ?, status = ? WHERE id = ?'
        );
        $stmt->execute([(int) $number, (int) $capacity, $status, $id]);
    } catch (PDOException $e) {
        if ((int) ($e->errorInfo[1] ?? 0) === 1062) {
            sendError(409, 'TABLE_NUMBER_EXISTS', 'Ekziston tashmë një tavolinë me këtë numër.');
        }
        throw $e;
    }

    sendJson(200, [
        'success' => true,
        'message' => 'Tavolina u ndryshua.',
        'data'    => formatTable(findTable($pdo, $id)),
    ]);
}

function deleteTable(PDO $pdo, int $id): void
{
    if ($id <= 0) {
        sendError(400, 'MISSING_ID', 'Shto ?id=... te adresa.');
    }
    $existing = findTable($pdo, $id);
    if (!$existing) {
        sendError(404, 'TABLE_NOT_FOUND', 'Tavolina nuk ekziston.');
    }
    if ($existing['status'] === 'OCCUPIED') {
        sendError(409, 'TABLE_OCCUPIED', 'Tavolina është e zënë dhe nuk mund të fshihet.');
    }

    try {
        $stmt = $pdo->prepare('DELETE FROM restaurant_tables WHERE id = ?');
        $stmt->execute([$id]);
    } catch (PDOException $e) {
        // 1451 = çelës i huaj: tavolina ka porosi në histori
        if ((int) ($e->errorInfo[1] ?? 0) === 1451) {
            sendError(409, 'TABLE_IN_USE', 'Tavolina ka porosi në histori dhe nuk mund të fshihet.');
        }
        throw $e;
    }

    sendJson(200, ['success' => true, 'message' => 'Tavolina u fshi.']);
}