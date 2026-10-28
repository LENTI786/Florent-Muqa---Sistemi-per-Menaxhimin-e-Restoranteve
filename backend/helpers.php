<?php
// Funksione ndihmëse për të gjithë endpoint-et

// Kthen përgjigje JSON me status code dhe ndalon ekzekutimin
function sendJson(int $status, array $data): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

// Kthen gabim në format të njëtrajtshëm
function sendError(int $status, string $code, string $message): void
{
    sendJson($status, [
        'success' => false,
        'error'   => $code,
        'message' => $message,
    ]);
}

// Kontrollon që kërkesa përdor metodën e duhur (POST, GET etj.)
function requireMethod(string $method): void
{
    if ($_SERVER['REQUEST_METHOD'] !== $method) {
        sendError(405, 'METHOD_NOT_ALLOWED', "Ky endpoint pranon vetëm $method.");
    }
}

// Lexon të dhënat JSON që dërgon klienti (body)
function getJsonInput(): array
{
    $data = json_decode(file_get_contents('php://input'), true);
    return is_array($data) ? $data : [];
}

function startSession(): void
{
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
}

// Kërkon që përdoruesi të jetë i kyçur
function requireLogin(): array
{
    startSession();
    if (empty($_SESSION['user'])) {
        sendError(401, 'NOT_AUTHENTICATED', 'Duhet të kyçesh në sistem.');
    }
    return $_SESSION['user'];
}

// Kërkon që përdoruesi të ketë një nga rolet e lejuara
function requireRole(string ...$roles): array
{
    $user = requireLogin();
    if (!in_array($user['role'], $roles, true)) {
        sendError(403, 'FORBIDDEN', 'Nuk ke të drejtë për këtë veprim.');
    }
    return $user;
}