# authfly/sdk-php (PHP)

> **Read-only mirror:** [authfly/sdk-php](https://github.com/authfly/sdk-php) is a read-only mirror of `sdk/php`; develop in [authfly/authfly](https://github.com/authfly/authfly) (`tools/split.sh`).

No dependencies. `require 'src/Authfly.php';` or `composer require authfly/sdk-php`.

```php
use Authfly\{Authfly, AuthflyApi};

$api = new AuthflyApi('http://localhost:4000');
$session = $api->signIn('alice@example.com', 'a long password'); // ['token' => ..., 'user' => ...]

$oidc = new Authfly('http://localhost:4000', 'http://localhost:8080', 'my-app', 'http://localhost:8000/callback');
[$url, $pending] = $oidc->authorizeUrl();       // redirect; keep $pending in the session
$result = $oidc->callback($_GET, $pending);       // ['user' => claims, 'tokens' => ...]
```
