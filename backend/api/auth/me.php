<?php
require_once __DIR__ . '/../../helpers.php';

requireMethod('GET');
$user = requireLogin();

sendJson(200, ['success' => true, 'user' => $user]);