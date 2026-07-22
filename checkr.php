<?php
/**
 * Sitters4Me — Checkr Background Check Integration
 * Upload to: public_html/sitters4me.com/api/checkr.php
 *
 * Actions (all POST):
 *   initiate_check   — called by app after sitter registers
 *   get_check_status — called by sitter-pending screen
 *   webhook          — called by Checkr servers when a report completes
 */

ini_set('display_errors', 0);
error_reporting(0);

// ── CONFIG ────────────────────────────────────────────────────────────────────
// SANDBOX: use test key + staging URL. Switch both when going live.
define('CHECKR_API_KEY',       'YOUR_TEST_KEY_HERE');   // ← paste your test_xxxx key here
define('CHECKR_BASE_URL',      'https://api.checkr-staging.com'); // sandbox
// define('CHECKR_BASE_URL',   'https://api.checkr.com');          // uncomment for production

// Background check package. 'tasker_standard' covers:
//   SSN trace · National Criminal · Sex Offender Registry · Global Watchlist · County Criminal (7yr)
define('CHECKR_PACKAGE',       'tasker_standard');

// Webhook secret — set this after configuring your webhook in the Checkr dashboard
// Dashboard → Developer → Webhooks → copy the "Signing Secret"
define('CHECKR_WEBHOOK_SECRET', '');   // ← paste signing secret here when available

// ── DB (same creds as jobs.php) ───────────────────────────────────────────────
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
function row($sql, $p=[])  { $s=db()->prepare($sql); $s->execute($p); return $s->fetch(); }
function run($sql, $p=[])  { $s=db()->prepare($sql); $s->execute($p); return $s; }

// ── HTTP helpers ──────────────────────────────────────────────────────────────
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }

function ok($data=[], $msg='OK')   { echo json_encode(['success'=>true, 'message'=>$msg, 'data'=>$data]); exit; }
function err($msg, $code=400)     { http_response_code($code); echo json_encode(['success'=>false, 'error'=>$msg]); exit; }

// ── Checkr API caller ─────────────────────────────────────────────────────────
function checkrRequest(string $method, string $endpoint, array $data = []): array {
    $url = CHECKR_BASE_URL . $endpoint;
    $ch  = curl_init($url);

    $headers = [
        'Content-Type: application/json',
        'Accept: application/json',
    ];

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_USERPWD        => CHECKR_API_KEY . ':',  // Checkr uses HTTP Basic Auth: key as username, blank password
    ]);

    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    }

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if (!$response) {
        return ['error' => 'No response from Checkr', 'http_code' => $httpCode];
    }

    $decoded = json_decode($response, true);
    $decoded['http_code'] = $httpCode;
    return $decoded ?: ['error' => 'Invalid JSON from Checkr', 'raw' => $response];
}

// ── Route ─────────────────────────────────────────────────────────────────────
$action = $_GET['action'] ?? 'webhook'; // default to webhook for Checkr POST calls
$raw    = file_get_contents('php://input');
$body   = json_decode($raw, true) ?? [];

switch ($action) {

    // ── INITIATE BACKGROUND CHECK ─────────────────────────────────────────────
    // Called by sitter-register.tsx after successful account creation
    case 'initiate_check':
        $sitter_id = (int)($body['sitter_id'] ?? 0);
        if (!$sitter_id) err('Missing sitter_id');

        $sitter = row("SELECT * FROM sitters WHERE id=?", [$sitter_id]);
        if (!$sitter) err('Sitter not found', 404);

        // Don't re-initiate if already in progress
        if (!empty($sitter['checkr_candidate_id'])) {
            ok([
                'candidate_id'    => $sitter['checkr_candidate_id'],
                'invitation_url'  => $sitter['checkr_invitation_url'],
                'checkr_status'   => $sitter['checkr_status'],
            ], 'Background check already initiated');
        }

        // ── Step 1: Create Candidate ──────────────────────────────────────────
        $candidatePayload = [
            'first_name' => $sitter['fname'],
            'last_name'  => $sitter['lname'],
            'email'      => $sitter['email'],
        ];

        // Add DOB if available (Checkr accepts YYYY-MM-DD)
        if (!empty($sitter['dob'])) {
            $candidatePayload['dob'] = date('Y-m-d', strtotime($sitter['dob']));
        }

        $candidate = checkrRequest('POST', '/v1/candidates', $candidatePayload);

        if (empty($candidate['id'])) {
            $errMsg = $candidate['error'] ?? ($candidate['message'] ?? 'Failed to create Checkr candidate');
            error_log("Checkr createCandidate error for sitter $sitter_id: " . json_encode($candidate));
            err("Checkr error: $errMsg");
        }

        $candidateId = $candidate['id'];

        // Save candidate ID immediately so we don't double-create
        run("UPDATE sitters SET checkr_candidate_id=?, checkr_status='pending' WHERE id=?",
            [$candidateId, $sitter_id]);

        // ── Step 2: Create Invitation (sends email to sitter) ─────────────────
        $invitationPayload = [
            'candidate_id' => $candidateId,
            'package'      => CHECKR_PACKAGE,
            // work_locations is required for some packages — set to US national
            'work_locations' => [['country' => 'US']],
        ];

        $invitation = checkrRequest('POST', '/v1/invitations', $invitationPayload);

        if (empty($invitation['id'])) {
            $errMsg = $invitation['error'] ?? ($invitation['message'] ?? 'Failed to create Checkr invitation');
            error_log("Checkr createInvitation error for sitter $sitter_id: " . json_encode($invitation));
            err("Checkr error: $errMsg");
        }

        $invitationUrl = $invitation['invitation_url'] ?? $invitation['url'] ?? null;

        // Save invitation URL for display on sitter-pending screen
        run("UPDATE sitters SET checkr_invitation_url=? WHERE id=?",
            [$invitationUrl, $sitter_id]);

        ok([
            'candidate_id'   => $candidateId,
            'invitation_id'  => $invitation['id'],
            'invitation_url' => $invitationUrl,
            'checkr_status'  => 'pending',
        ], 'Background check initiated — invitation email sent to sitter');


    // ── GET CURRENT CHECK STATUS ──────────────────────────────────────────────
    // Called by sitter-pending.tsx to show live status
    case 'get_check_status':
        $sitter_id = (int)($body['sitter_id'] ?? $_GET['sitter_id'] ?? 0);
        if (!$sitter_id) err('Missing sitter_id');

        $sitter = row("
            SELECT id, fname, lname, bgcheck, checkr_candidate_id,
                   checkr_report_id, checkr_status, checkr_invitation_url,
                   status AS account_status
            FROM sitters WHERE id=?", [$sitter_id]);
        if (!$sitter) err('Sitter not found', 404);

        // If we have a report ID, fetch live status from Checkr
        if (!empty($sitter['checkr_report_id'])) {
            $report = checkrRequest('GET', '/v1/reports/' . $sitter['checkr_report_id']);
            if (!empty($report['id'])) {
                $checkrStatus = $report['status'] ?? 'pending';
                $result       = $report['result'] ?? null; // clear | consider | null
                // Sync to DB if changed
                if ($checkrStatus !== $sitter['checkr_status']) {
                    run("UPDATE sitters SET checkr_status=? WHERE id=?", [$checkrStatus, $sitter_id]);
                    $sitter['checkr_status'] = $checkrStatus;
                }
                ok([
                    'checkr_status'   => $checkrStatus,
                    'result'          => $result,
                    'bgcheck'         => $sitter['bgcheck'],
                    'account_status'  => $sitter['account_status'],
                    'invitation_url'  => $sitter['checkr_invitation_url'],
                ]);
            }
        }

        // No report yet — return DB state
        ok([
            'checkr_status'  => $sitter['checkr_status'] ?? 'pending',
            'result'         => null,
            'bgcheck'        => $sitter['bgcheck'],
            'account_status' => $sitter['account_status'],
            'invitation_url' => $sitter['checkr_invitation_url'],
        ]);


    // ── CHECKR WEBHOOK ────────────────────────────────────────────────────────
    // Checkr POSTs to this URL when a report completes.
    // Configure in Checkr Dashboard → Developer → Webhooks
    // URL: https://sitters4me.com/api/checkr.php?action=webhook
    case 'webhook':
        // ── Verify Checkr signature (prevents spoofed webhooks) ───────────────
        if (CHECKR_WEBHOOK_SECRET !== '') {
            $sigHeader = $_SERVER['HTTP_X_CHECKR_SIGNATURE'] ?? '';
            $expected  = hash_hmac('sha256', $raw, CHECKR_WEBHOOK_SECRET);
            if (!hash_equals($expected, $sigHeader)) {
                http_response_code(401);
                echo json_encode(['error' => 'Invalid signature']);
                exit;
            }
        }

        $eventType = $body['type'] ?? '';
        $data      = $body['data'] ?? $body['object'] ?? [];

        // Log everything for debugging
        error_log("Checkr webhook received: $eventType — " . json_encode($data));

        // ── Handle report.completed ───────────────────────────────────────────
        if ($eventType === 'report.completed' || $eventType === 'report.updated') {
            $reportId    = $data['id']            ?? null;
            $candidateId = $data['candidate_id']  ?? null;
            $status      = $data['status']        ?? 'pending';  // complete | suspended | dispute
            $result      = $data['result']        ?? null;        // clear | consider | null

            if (!$candidateId) {
                http_response_code(200); // always 200 so Checkr doesn't retry
                echo json_encode(['received' => true]);
                exit;
            }

            // Find sitter by Checkr candidate ID
            $sitter = row("SELECT id, email FROM sitters WHERE checkr_candidate_id=?", [$candidateId]);
            if (!$sitter) {
                error_log("Checkr webhook: no sitter found for candidate_id $candidateId");
                http_response_code(200);
                echo json_encode(['received' => true, 'warning' => 'sitter not found']);
                exit;
            }

            $sitterId = $sitter['id'];

            // Save report ID
            if ($reportId) {
                run("UPDATE sitters SET checkr_report_id=? WHERE id=?", [$reportId, $sitterId]);
            }

            // Update checkr_status
            run("UPDATE sitters SET checkr_status=? WHERE id=?", [$status === 'complete' ? ($result ?? 'complete') : $status, $sitterId]);

            // ── Auto-activate if clear ────────────────────────────────────────
            if ($result === 'clear') {
                run("UPDATE sitters SET bgcheck='Y', status='active', checkr_status='clear' WHERE id=?", [$sitterId]);
                // Push notification to sitter (if token saved)
                $sitterData = row("SELECT push_token FROM sitters WHERE id=?", [$sitterId]);
                if (!empty($sitterData['push_token'])) {
                    sendExpoPush(
                        $sitterData['push_token'],
                        '✅ Background Check Cleared!',
                        'Great news! Your background check came back clear. Your Sitters4Me account is now active — go online and start earning!',
                        ['type' => 'bgcheck_clear']
                    );
                }
                error_log("Sitter $sitterId auto-activated after clear background check");
            }

            // ── Flag for admin review if 'consider' ──────────────────────────
            if ($result === 'consider') {
                run("UPDATE sitters SET checkr_status='consider' WHERE id=?", [$sitterId]);
                // Push notification — account needs review
                $sitterData = row("SELECT push_token FROM sitters WHERE id=?", [$sitterId]);
                if (!empty($sitterData['push_token'])) {
                    sendExpoPush(
                        $sitterData['push_token'],
                        '⏳ Background Check Under Review',
                        'Your background check requires additional review. We\'ll notify you once a decision has been made. This typically takes 1–3 business days.',
                        ['type' => 'bgcheck_consider']
                    );
                }
                error_log("Sitter $sitterId background check flagged as 'consider' — admin review needed");
            }
        }

        // ── Handle invitation.completed (sitter finished entering their info) ─
        if ($eventType === 'invitation.completed') {
            $candidateId = $data['candidate_id'] ?? null;
            if ($candidateId) {
                $sitter = row("SELECT id FROM sitters WHERE checkr_candidate_id=?", [$candidateId]);
                if ($sitter) {
                    run("UPDATE sitters SET checkr_status='processing' WHERE id=?", [$sitter['id']]);
                    error_log("Sitter {$sitter['id']} completed Checkr invitation — check now processing");
                }
            }
        }

        // Always respond 200 so Checkr doesn't retry
        http_response_code(200);
        echo json_encode(['received' => true]);
        exit;


    default:
        err('Unknown action');
}

// ── Shared push helper (same as jobs.php) ─────────────────────────────────────
function sendExpoPush($token, $title, $body, $data=[]) {
    if (empty($token)) return;
    $payload = json_encode([[
        'to'       => $token,
        'sound'    => 'default',
        'title'    => $title,
        'body'     => $body,
        'data'     => $data,
        'priority' => 'high',
    ]]);
    $ch = curl_init('https://exp.host/--/api/v2/push/send');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Accept: application/json'],
        CURLOPT_TIMEOUT        => 5,
    ]);
    curl_exec($ch);
    curl_close($ch);
}
