<?php
// Unit test of the PHP SDK: generated contract types load, the API client reports errors as AuthflyError.
declare(strict_types=1);
require __DIR__ . '/../src/Authfly.php';
require __DIR__ . '/../src/Contract.php';

$fail = 0;
$check = function (bool $c, string $m) use (&$fail) { echo ($c ? "ok   " : "FAIL ") . "$m\n"; if (!$c) $fail++; };
$check(\Authfly\Contract\VERSION === '1.0.0', 'contract version');
$check(interface_exists(\Authfly\Contract\Provider::class), 'Provider interface');
$check((new ReflectionClass(\Authfly\Contract\Provider::class))->hasMethod('sendMagicLink'), 'Provider::sendMagicLink');
// unreachable server -> AuthflyError
$api = new \Authfly\AuthflyApi('http://127.0.0.1:9');
error_reporting(E_ALL & ~E_WARNING);
try { $api->signIn('a', 'b'); $check(false, 'error on unreachable server'); }
catch (\Throwable $e) { $check($e instanceof \Authfly\AuthflyException, 'error on unreachable server: ' . get_class($e)); }
exit($fail ? 1 : 0);
