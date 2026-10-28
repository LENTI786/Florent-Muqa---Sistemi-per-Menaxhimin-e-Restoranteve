<?php
require_once __DIR__ . '/../../helpers.php';

requireMethod('POST');
startSession();
$_SESSION = [];
session_destroy();

sendJson(200, ['success' => true, 'message' => 'Dolën nga sistemi.']);