<?php
/**
 * Sitters4Me — Stripe Payment API
 * Upload to: public_html/sitters4me.com/api/stripe.php
 *
 * Setup steps:
 *  1. Sign up at https://stripe.com — takes 5 minutes, free to start
 *  2. Copy your keys from Stripe Dashboard → Developers → API keys
 *  3. Paste your STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY below
 *  4. Install Stripe PHP via cPanel Terminal:
 *       composer require stripe/stripe-php
 *     OR upload the stripe-php folder manually (see README)
 *  5. Upload this file to public_html/sitters4me.com/api/stripe.php
 */

ini_set('display_errors', 0);
error_reporting(0);

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }

// ══════════════════════════════════════════════════════════════
// ── TEST MODE — set to false when Stripe SDK is installed ──────
//
//   TRUE  = no Stripe SDK needed; all payments are simulated.
//           Use this for testing the full app flow with dummy cards.
//
//   FALSE = real Stripe; requires:
//           1. Real keys below
//           2. composer require stripe/stripe-php on GoDaddy
//
define('TEST_MODE', true);   // ← CHANGE TO false FOR LIVE PAYMENTS
// ══════════════════════════════════════════════════════════════

// ── CONFIGURATION — replace with your real Stripe keys ────────
define('STRIPE_SECRET_KEY',      'sk_test_REPLACE_WITH_YOUR_TEST_KEY');
define('STRIPE_PUBLISHABLE_KEY', 'pk_test_REPLACE_WITH_YOUR_TEST_KEY');

// Platform fee: 15% of every transaction — this is Sitters4Me's revenue
define('PLATFORM_FEE_PCT', 0.15);

// ── Load Stripe PHP SDK (only when TEST_MODE is off) ──────────
if (!TEST_MODE) {
    $stripeAutoload = __DIR__ . '/../vendor/autoload.php';
    if (!file_exists($stripeAutoload)) {
        $stripeAutoload = $_SERVER['DOCUMENT_ROOT'] . '/vendor/autoload.php';
    }
    if (!file_exists($stripeAutoload)) {
        echo json_encode(['success' => false, 'error' =>
            'Stripe SDK not found. Run: composer require stripe/stripe-php  OR set TEST_MODE=true for testing.']);
        exit;
    }
    require_once $stripeAutoload;
    \Stripe\Stripe::setApiKey(STRIPE_SECRET_KEY);
}

// ── DB helper (same creds as jobs.php) ────────────────────────
function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $pdo = new PDO(
        'mysql:host=localhost;dbname=Sitters4me;charset=utf8mb4',
        'Sitters4me', 'Sitters4me..#00',
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
         PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
    $pdo->exec("SET time_zone = '+00:00'"); // force UTC session
    return $pdo;
}
function row($sql, $p = []) { $s = db()->prepare($sql); $s->execute($p); return $s->fetch(); }
function run($sql, $p = []) { $s = db()->prepare($sql); $s->execute($p); return $s; }

function ok($data = [], $msg = 'OK') {
    echo json_encode(['success' => true, 'message' => $msg, 'data' => $data]);
    exit;
}
function err($msg, $code = 400) {
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $msg]);
    exit;
}

// ── Router ────────────────────────────────────────────────────
$body   = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $_GET['action'] ?? ($body['action'] ?? '');

try {

switch ($action) {

    // ── 1. CREATE SETUP INTENT — parent saves card ─────────────────
    case 'setup_intent':
        $parent_id = (int)($body['parent_id'] ?? 0);
        if (!$parent_id) err('Missing parent_id');

        $parent = row("SELECT * FROM parents WHERE id=?", [$parent_id]);
        if (!$parent) err('Parent not found');

        if (TEST_MODE) {
            // ── TEST MODE: simulate SetupIntent without Stripe SDK ──
            $mockCustomerId = 'test_cus_' . $parent_id . '_' . substr(md5($parent_id . 'sitters4me'), 0, 8);
            run("UPDATE parents SET stripe_customer_id=? WHERE id=?", [$mockCustomerId, $parent_id]);
            ok([
                'client_secret'   => 'test_seti_' . uniqid() . '_secret_test',
                'customer_id'     => $mockCustomerId,
                'publishable_key' => 'pk_test_TEST_MODE_NO_KEY_NEEDED',
                'test_mode'       => true,
            ], 'TEST MODE: SetupIntent simulated');
        }

        // ── LIVE MODE: real Stripe ──────────────────────────────────
        $customerId = $parent['stripe_customer_id'] ?? '';
        if (empty($customerId)) {
            $customer = \Stripe\Customer::create([
                'email'    => $parent['email'] ?? '',
                'name'     => trim(($parent['fname'] ?? '') . ' ' . ($parent['lname'] ?? '')),
                'metadata' => ['parent_id' => $parent_id],
            ]);
            $customerId = $customer->id;
            run("UPDATE parents SET stripe_customer_id=? WHERE id=?", [$customerId, $parent_id]);
        }
        $intent = \Stripe\SetupIntent::create([
            'customer'             => $customerId,
            'payment_method_types' => ['card'],
            'usage'                => 'off_session',
        ]);
        ok([
            'client_secret'   => $intent->client_secret,
            'customer_id'     => $customerId,
            'publishable_key' => STRIPE_PUBLISHABLE_KEY,
        ], 'SetupIntent created');

    // ── 2. CHARGE PARENT — called when sitter presses STOP ─────────
    case 'charge_parent':
        $job_id    = (int)($body['job_id']    ?? 0);
        $sitter_id = (int)($body['sitter_id'] ?? 0);
        $hours     = (float)($body['hours']   ?? 0);
        $kids      = (int)($body['kids']      ?? 1);
        if (!$job_id || !$sitter_id) err('Missing job_id or sitter_id');

        $job = row("
            SELECT j.*, p.fname, p.lname, p.email, p.stripe_customer_id,
                   s.fname AS sfname, s.lname AS slname,
                   s.minrate, COALESCE(s.additional_child_rate, 0) AS additional_child_rate
            FROM jobs j
            INNER JOIN parents p ON p.id = j.parent_id
            INNER JOIN sitters s ON s.id  = ?
            WHERE j.id = ?
        ", [$sitter_id, $job_id]);
        if (!$job) err('Job not found');

        // If app sent hours=0 (timer was never started), compute from DB start_time
        if ($hours <= 0) {
            if (!empty($job['start_time'])) {
                $startTs = strtotime($job['start_time']);
                $stopTs  = !empty($job['stop_time']) ? strtotime($job['stop_time']) : time();
                $hours   = $startTs > 0 ? round(($stopTs - $startTs) / 3600, 4) : 0;
            }
            // Minimum 15-minute billing
            if ($hours < 0.25) $hours = 0.25;
        }

        $customerId = $job['stripe_customer_id'] ?? '';
        if (empty($customerId)) err('Parent has no saved payment method. Ask them to add a card in Payment Settings.');

        // Rate = base rate + (additional_child_rate × extra children)
        $baseRate    = (float)($job['minrate'] ?? 15);
        $addRate     = (float)($job['additional_child_rate'] ?? 0);
        $effectiveRate = $baseRate + ($addRate * max(0, $kids - 1));
        $rate        = $effectiveRate;
        $subtotalUsd = round($hours * $rate, 2);
        $platformFee = round($subtotalUsd * PLATFORM_FEE_PCT, 2);
        $totalUsd    = $subtotalUsd;
        $totalCents  = (int)round($totalUsd * 100);

        if ($totalCents < 50) err('Charge amount too small (minimum $0.50)');

        if (TEST_MODE) {
            // ── TEST MODE: simulate successful charge ───────────────
            $mockPiId = 'test_pi_' . uniqid();
            run("INSERT INTO payments
                    (job_id, parent_id, sitter_id, stripe_payment_intent_id,
                     amount_usd, platform_fee_usd, hours_worked, rate_per_hr, kids, status, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'succeeded', NOW())",
                [$job_id, $job['parent_id'], $sitter_id, $mockPiId, $totalUsd, $platformFee, $hours, $rate, $kids]);
            run("UPDATE jobs SET status='Complete', charge_amt=? WHERE id=?", [$totalUsd, $job_id]);
            $sitterPayout = round($totalUsd - $platformFee, 2);
            ok([
                'payment_intent_id' => $mockPiId,
                'status'            => 'succeeded',
                'amount_charged'    => $totalUsd,
                'platform_fee'      => $platformFee,
                'sitter_payout'     => $sitterPayout,
                'hours'             => $hours,
                'rate'              => $rate,
                'kids'              => $kids,
                'receipt_url'       => null,
                'test_mode'         => true,
            ], "TEST MODE: \${$totalUsd} simulated charge succeeded");
        }

        // ── LIVE MODE: real Stripe charge ────────────────────────────
        $customer      = \Stripe\Customer::retrieve($customerId);
        $paymentMethod = $customer->invoice_settings->default_payment_method ?? null;
        if (empty($paymentMethod)) {
            $methods = \Stripe\PaymentMethod::all(['customer' => $customerId, 'type' => 'card']);
            if (!empty($methods->data)) {
                $paymentMethod = $methods->data[0]->id;
            }
        }
        if (empty($paymentMethod)) err('No payment method found. Ask parent to add a card in Payment Settings.');

        $feeCents   = (int)round($platformFee * 100);
        $sitterName = trim($job['sfname'] . ' ' . $job['slname']);

        $pi = \Stripe\PaymentIntent::create([
            'amount'               => $totalCents,
            'currency'             => 'usd',
            'customer'             => $customerId,
            'payment_method'       => $paymentMethod,
            'confirm'              => true,
            'off_session'          => true,
            'description'          => "Sitters4Me: {$sitterName} job #{$job_id}",
            'statement_descriptor' => 'SITTERS4ME',
            'receipt_email'        => $job['email'] ?? null,
            'metadata'             => ['job_id'=>$job_id,'sitter_id'=>$sitter_id,'hours'=>$hours,'kids'=>$kids,'rate'=>$rate],
            'application_fee_amount' => $feeCents,
        ]);
        $status = $pi->status;

        run("INSERT INTO payments
                (job_id, parent_id, sitter_id, stripe_payment_intent_id,
                 amount_usd, platform_fee_usd, hours_worked, rate_per_hr, kids, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())",
            [$job_id, $job['parent_id'], $sitter_id, $pi->id, $totalUsd, $platformFee, $hours, $rate, $kids, $status]);
        run("UPDATE jobs SET status='Complete', charge_amt=? WHERE id=?", [$totalUsd, $job_id]);

        ok([
            'payment_intent_id' => $pi->id,
            'status'            => $status,
            'amount_charged'    => $totalUsd,
            'platform_fee'      => $platformFee,
            'sitter_payout'     => round($totalUsd - $platformFee, 2),
            'hours'             => $hours,
            'rate'              => $rate,
            'kids'              => $kids,
            'receipt_url'       => $pi->charges->data[0]->receipt_url ?? null,
        ], $status === 'succeeded'
            ? "Payment of \${$totalUsd} charged successfully to {$parentName}"
            : "Payment status: {$status}");

    // ── 3. GET PUBLISHABLE KEY (app fetches on startup) ────────────
    case 'config':
        ok(['publishable_key' => STRIPE_PUBLISHABLE_KEY], 'Stripe config');

    // ── 3b. CHECK IF PARENT HAS SAVED CARD ─────────────────────────
    // Returns {has_card, brand, last4, exp_month, exp_year} or {has_card:false}
    case 'get_payment_method':
        $parent_id = (int)($body['parent_id'] ?? $_GET['parent_id'] ?? 0);
        if (!$parent_id) err('Missing parent_id');

        $parent = row("SELECT stripe_customer_id FROM parents WHERE id=?", [$parent_id]);
        if (!$parent || empty($parent['stripe_customer_id'])) {
            ok(['has_card' => false], 'No payment method');
        }

        $customerId = $parent['stripe_customer_id'];

        // ── TEST MODE: mock card data for test customers ────────────
        if (TEST_MODE || strpos($customerId, 'test_cus_') === 0) {
            ok([
                'has_card'  => true,
                'brand'     => 'visa',
                'last4'     => '4242',
                'exp_month' => 12,
                'exp_year'  => 2099,
                'test_mode' => true,
            ], 'TEST MODE: mock card returned');
        }

        // ── LIVE MODE: real Stripe lookup ───────────────────────────
        try {
            $customer = \Stripe\Customer::retrieve($customerId);
            $defaultPM = $customer->invoice_settings->default_payment_method ?? null;

            // Fallback: get most recent card
            if (empty($defaultPM)) {
                $methods = \Stripe\PaymentMethod::all(['customer' => $customerId, 'type' => 'card', 'limit' => 1]);
                if (!empty($methods->data)) {
                    $defaultPM = $methods->data[0]->id;
                    // Set it as default so future charges work reliably
                    \Stripe\Customer::update($customerId, [
                        'invoice_settings' => ['default_payment_method' => $defaultPM],
                    ]);
                }
            }

            if (empty($defaultPM)) {
                ok(['has_card' => false], 'No payment method found');
            }

            $pm = \Stripe\PaymentMethod::retrieve($defaultPM);
            ok([
                'has_card'  => true,
                'brand'     => $pm->card->brand     ?? 'card',
                'last4'     => $pm->card->last4     ?? '????',
                'exp_month' => $pm->card->exp_month ?? null,
                'exp_year'  => $pm->card->exp_year  ?? null,
            ], 'Payment method found');
        } catch (\Exception $e) {
            ok(['has_card' => false], 'Could not retrieve payment method');
        }

    // ── 4. PAYMENT HISTORY (parent or sitter) ──────────────────────
    case 'payment_history':
        $parent_id = (int)($body['parent_id'] ?? $_GET['parent_id'] ?? 0);
        $sitter_id = (int)($body['sitter_id'] ?? $_GET['sitter_id'] ?? 0);
        if (!$parent_id && !$sitter_id) err('Missing parent_id or sitter_id');

        if ($parent_id) {
            $payments = db()->prepare("
                SELECT py.*, j.post_time,
                       s.fname AS sitter_fname, s.lname AS sitter_lname
                FROM payments py
                INNER JOIN jobs j    ON j.id  = py.job_id
                INNER JOIN sitters s ON s.id  = py.sitter_id
                WHERE py.parent_id = ? ORDER BY py.id DESC LIMIT 20
            ");
            $payments->execute([$parent_id]);
        } else {
            $payments = db()->prepare("
                SELECT py.*, j.post_time,
                       p.fname AS parent_fname, p.lname AS parent_lname
                FROM payments py
                INNER JOIN jobs j    ON j.id  = py.job_id
                INNER JOIN parents p ON p.id  = py.parent_id
                WHERE py.sitter_id = ? ORDER BY py.id DESC LIMIT 20
            ");
            $payments->execute([$sitter_id]);
        }
        ok($payments->fetchAll(), 'Payment history');

    // ── 4b. ADD TIP — separate charge after job ends ───────────
    // Tips go 100% to the sitter (no platform fee deducted)
    // Body: { job_id, parent_id, tip_amount }
    case 'add_tip':
        $job_id     = (int)($body['job_id']     ?? 0);
        $parent_id  = (int)($body['parent_id']  ?? 0);
        $tipUsd     = round((float)($body['tip_amount'] ?? 0), 2);
        if (!$job_id || !$parent_id) err('Missing job_id or parent_id');
        if ($tipUsd < 1.00) err('Minimum tip is $1.00');
        if ($tipUsd > 200)  err('Maximum tip is $200');

        $job = row("
            SELECT j.*, p.stripe_customer_id, p.email AS parent_email,
                   s.fname AS sfname, s.lname AS slname
            FROM jobs j
            INNER JOIN parents p ON p.id = j.parent_id
            LEFT  JOIN sitters s ON s.id = j.sitter_id
            WHERE j.id=? AND j.parent_id=?
        ", [$job_id, $parent_id]);
        if (!$job) err('Job not found');

        $customerId = $job['stripe_customer_id'] ?? '';
        if (empty($customerId)) err('No saved payment method. Add a card in Payment Settings.');

        $tipCents   = (int)round($tipUsd * 100);
        $sitterName = trim(($job['sfname'] ?? '') . ' ' . ($job['slname'] ?? ''));

        if (TEST_MODE || strpos($customerId, 'test_cus_') === 0) {
            // TEST MODE — simulate tip
            $mockPiId = 'test_tip_' . uniqid();
            run("UPDATE jobs SET tip_amount = COALESCE(tip_amount,0) + ? WHERE id=?", [$tipUsd, $job_id]);
            ok([
                'payment_intent_id' => $mockPiId,
                'tip_amount'        => $tipUsd,
                'test_mode'         => true,
            ], "TEST MODE: \${$tipUsd} tip simulated successfully");
        }

        // LIVE MODE
        $customer      = \Stripe\Customer::retrieve($customerId);
        $paymentMethod = $customer->invoice_settings->default_payment_method ?? null;
        if (empty($paymentMethod)) {
            $methods = \Stripe\PaymentMethod::all(['customer' => $customerId, 'type' => 'card']);
            if (!empty($methods->data)) $paymentMethod = $methods->data[0]->id;
        }
        if (empty($paymentMethod)) err('No payment method found.');

        $pi = \Stripe\PaymentIntent::create([
            'amount'               => $tipCents,
            'currency'             => 'usd',
            'customer'             => $customerId,
            'payment_method'       => $paymentMethod,
            'confirm'              => true,
            'off_session'          => true,
            'description'          => "Sitters4Me tip for {$sitterName} job #{$job_id}",
            'statement_descriptor' => 'SITTERS4ME TIP',
            'receipt_email'        => $job['parent_email'] ?? null,
            'metadata'             => ['job_id' => $job_id, 'type' => 'tip'],
        ]);

        run("UPDATE jobs SET tip_amount = COALESCE(tip_amount,0) + ? WHERE id=?", [$tipUsd, $job_id]);
        ok([
            'payment_intent_id' => $pi->id,
            'status'            => $pi->status,
            'tip_amount'        => $tipUsd,
        ], "Tip of \${$tipUsd} charged successfully");

    // ── 5. REFUND ──────────────────────────────────────────────────
    case 'refund':
        $payment_intent_id = $body['payment_intent_id'] ?? '';
        $reason            = $body['reason'] ?? 'requested_by_customer';
        if (empty($payment_intent_id)) err('Missing payment_intent_id');

        $refund = \Stripe\Refund::create([
            'payment_intent' => $payment_intent_id,
            'reason'         => $reason,
        ]);
        run("UPDATE payments SET status='refunded' WHERE stripe_payment_intent_id=?",
            [$payment_intent_id]);
        ok(['refund_id' => $refund->id, 'status' => $refund->status], 'Refund processed');

    // ── 6. WEBHOOK — Stripe events ─────────────────────────────────
    case 'webhook':
        // Set STRIPE_WEBHOOK_SECRET in Stripe Dashboard → Developers → Webhooks
        $webhookSecret = 'whsec_REPLACE_WITH_YOUR_WEBHOOK_SECRET';
        $payload = file_get_contents('php://input');
        $sigHeader = $_SERVER['HTTP_STRIPE_SIGNATURE'] ?? '';
        try {
            $event = \Stripe\Webhook::constructEvent($payload, $sigHeader, $webhookSecret);
        } catch (\UnexpectedValueException $e) {
            http_response_code(400); echo 'Invalid payload'; exit;
        } catch (\Stripe\Exception\SignatureVerificationException $e) {
            http_response_code(400); echo 'Invalid signature'; exit;
        }
        // Handle events
        switch ($event->type) {
            case 'payment_intent.succeeded':
                $pi = $event->data->object;
                run("UPDATE payments SET status='succeeded' WHERE stripe_payment_intent_id=?", [$pi->id]);
                break;
            case 'payment_intent.payment_failed':
                $pi = $event->data->object;
                run("UPDATE payments SET status='failed' WHERE stripe_payment_intent_id=?", [$pi->id]);
                break;
        }
        http_response_code(200);
        echo json_encode(['received' => true]);
        exit;

    default:
        err('Unknown action: ' . $action);
}

} catch (\Stripe\Exception\CardException $e) {
    err('Card declined: ' . $e->getError()->message);
} catch (\Stripe\Exception\InvalidRequestException $e) {
    err('Stripe error: ' . $e->getMessage());
} catch (Exception $e) {
    err('Server error: ' . $e->getMessage(), 500);
}
