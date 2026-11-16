<?php
// Lidhja me databazën MySQL përmes PDO

function getDB(): PDO
{
    static $pdo = null;              // lidhja krijohet vetëm një herë

    if ($pdo === null) {
        $host = 'localhost';
        $db   = 'restaurant_db';
        $user = 'root';              // përdoruesi i parazgjedhur në XAMPP
        $pass = '';                  // fjalëkalimi në XAMPP është bosh

        $dsn = "mysql:host=$host;dbname=$db;charset=utf8mb4";
        $pdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    }

    return $pdo;
}