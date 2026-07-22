<?php
/**
 * Sitters4me — Jobs API v3
 * Upload to: public_html/sitters4me.com/api/jobs.php
 */

ini_set('display_errors', 0);
error_reporting(0);

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }

// ── DB (same credentials as working auth.php) ─────────────────
function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $pdo = new PDO(
        'mysql:host=localhost;dbname=Sitters4me;charset=utf8mb4',
        'Sitters4me', 'Sitters4me..#00',
        [PDO::ATTR_ERRMODE       => PDO::ERRMODE_EXCEPTION,
         PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
    // Force MySQL session to UTC so NOW() always returns UTC regardless of
    // server's local timezone (GoDaddy shared hosting runs on US Central).
    // This is the single source of truth — all timestamps stored and read as UTC.
    $pdo->exec("SET time_zone = '+00:00'");
    return $pdo;
}

function ok($data=[],$msg='OK'){
    echo json_encode(['success'=>true,'message'=>$msg,'data'=>$data]);
    exit;
}
function err($msg,$code=400){
    http_response_code($code);
    echo json_encode(['success'=>false,'error'=>$msg]);
    exit;
}
function row($sql,$params=[]){
    $s=db()->prepare($sql); $s->execute($params); return $s->fetch();
}
function rows($sql,$params=[]){
    $s=db()->prepare($sql); $s->execute($params); return $s->fetchAll();
}
function run($sql,$params=[]){
    $s=db()->prepare($sql); $s->execute($params); return $s;
}

// ── MySQL 5.7-safe: check if column exists before ALTER ──────
function colExists($table, $col) {
    try {
        $rows = db()->query("SHOW COLUMNS FROM `{$table}` LIKE '{$col}'")->fetchAll();
        return count($rows) > 0;
    } catch(Exception $e){ return false; }
}
function addCol($table, $col, $def) {
    if (!colExists($table, $col)) {
        try { db()->exec("ALTER TABLE `{$table}` ADD COLUMN `{$col}` {$def}"); } catch(Exception $e){}
    }
}

// ── Convert MySQL datetime string → UTC ISO 8601 with Z suffix ───────────────
// Because the DB session is forced to UTC (SET time_zone='+00:00' in db()),
// every value read from MySQL is already UTC — we just reformat the string.
// No timezone conversion needed; no dependency on PHP's date.timezone setting.
function utcIso(?string $dt): ?string {
    if (!$dt || $dt === '0000-00-00 00:00:00') return null;
    // "2026-07-21 15:30:00"  →  "2026-07-21T15:30:00Z"
    return str_replace(' ', 'T', rtrim($dt)) . 'Z';
}

// ── Ensure extra columns exist (safe to call on every boot) ──
function ensureExtraColumns(){
    // jobs.scheduled_time — for future/scheduled appointments
    addCol('jobs',   'scheduled_time',       "DATETIME DEFAULT NULL COMMENT 'Future appointment date/time'");
    // jobs.children_ages — JSON array of each child's age e.g. [3,7,5]
    addCol('jobs',   'children_ages',        "VARCHAR(150) DEFAULT NULL COMMENT 'JSON array of child ages e.g. [3,7,5]'");
    // jobs.accept_time — when sitter accepted, used for waiting-timer on parent screen
    addCol('jobs',   'accept_time',          "DATETIME DEFAULT NULL COMMENT 'When sitter accepted the job'");
    // user.last_seen — heartbeat to auto-expire crashed/disconnected sitters
    addCol('user',   'last_seen',            "DATETIME DEFAULT NULL COMMENT 'Last heartbeat while online'");
    // sitters.additional_child_rate — extra $/hr per sibling beyond first child
    addCol('sitters','additional_child_rate',"DECIMAL(5,2) DEFAULT 2.00 COMMENT 'Extra charge per additional child'");
    // sitters.work_distance — max travel radius in miles
    addCol('sitters','work_distance',        "INT DEFAULT 10 COMMENT 'Max travel radius in miles'");
    // sitters.about — bio/description shown to parents
    addCol('sitters','about',               "TEXT DEFAULT NULL COMMENT 'Sitter bio shown to parents'");
    // sitters.avg_rating — cached average review score
    addCol('sitters','avg_rating',           "DECIMAL(3,2) DEFAULT NULL COMMENT 'Cached average star rating'");
    // sitters.review_count — total number of reviews
    addCol('sitters','review_count',         "INT DEFAULT 0 COMMENT 'Total reviews received'");
    // parents.cancel_count — lifetime cancellation counter (controls fee after 3 free)
    addCol('parents','cancel_count',         "INT DEFAULT 0 COMMENT 'Total cancellations by this parent'");
    // push_token columns — Expo push tokens so we can send notifications
    addCol('parents','push_token',           "VARCHAR(255) DEFAULT NULL COMMENT 'Expo push notification token'");
    addCol('sitters','push_token',           "VARCHAR(255) DEFAULT NULL COMMENT 'Expo push notification token'");
    // sitter experience / certifications — shown on profile view
    addCol('sitters','experience_years',     "TINYINT DEFAULT NULL COMMENT 'Years of babysitting experience'");
    addCol('sitters','certifications',       "VARCHAR(255) DEFAULT NULL COMMENT 'e.g. CPR Certified, First Aid'");
    // Checkr background check tracking
    addCol('sitters','checkr_candidate_id',  "VARCHAR(64) DEFAULT NULL COMMENT 'Checkr candidate ID'");
    addCol('sitters','checkr_report_id',     "VARCHAR(64) DEFAULT NULL COMMENT 'Checkr report ID'");
    addCol('sitters','checkr_status',        "VARCHAR(32) DEFAULT 'pending' COMMENT 'pending|consider|clear|suspended'");
    addCol('sitters','checkr_invitation_url',"VARCHAR(512) DEFAULT NULL COMMENT 'Checkr hosted apply flow URL'");
    // Scheduled job extras
    addCol('jobs','duration_hours',          "DECIMAL(4,1) DEFAULT NULL COMMENT 'Requested duration in hours'");
    addCol('jobs','notes',                   "TEXT DEFAULT NULL COMMENT 'Parent notes / special instructions'");
    addCol('jobs','tip_amount',              "DECIMAL(8,2) DEFAULT 0.00 COMMENT 'Optional tip charged to parent'");
    addCol('jobs','preferred_sitter_id',     "INT DEFAULT NULL COMMENT 'Book Again: requested sitter ID'");
}

// ── Ensure payout_requests table exists ──────────────────────
function ensurePayoutTable(){
    db()->exec("CREATE TABLE IF NOT EXISTS payout_requests (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        sitter_id   INT NOT NULL,
        amount      DECIMAL(8,2) NOT NULL,
        status      ENUM('pending','approved','paid','rejected') DEFAULT 'pending',
        method      VARCHAR(50)  DEFAULT 'direct_deposit',
        notes       TEXT         DEFAULT NULL,
        requested_at DATETIME    DEFAULT CURRENT_TIMESTAMP,
        paid_at     DATETIME     DEFAULT NULL,
        INDEX (sitter_id),
        INDEX (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

// ── Ensure messages table exists ─────────────────────────────
function ensureMessagesTable(){
    db()->exec("CREATE TABLE IF NOT EXISTS messages (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        job_id      INT NOT NULL,
        sender_type ENUM('parent','sitter') NOT NULL,
        sender_id   INT NOT NULL,
        message     TEXT NOT NULL,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        read_at     DATETIME DEFAULT NULL,
        INDEX idx_job    (job_id),
        INDEX idx_sender (sender_type, sender_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

// ── Ensure reviews table exists ───────────────────────────────
function ensureReviewsTable(){
    db()->exec("CREATE TABLE IF NOT EXISTS reviews (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        job_id      INT NOT NULL DEFAULT 0,
        parent_id   INT NOT NULL DEFAULT 0,
        sitter_id   INT NOT NULL DEFAULT 0,
        rating      TINYINT NOT NULL DEFAULT 5,
        review_text TEXT DEFAULT NULL,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_sitter (sitter_id),
        INDEX idx_job    (job_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

// ── Ensure favorite_sitters table exists ─────────────────────
function ensureFavoritesTable(){
    db()->exec("CREATE TABLE IF NOT EXISTS favorite_sitters (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        parent_id  INT NOT NULL DEFAULT 0,
        sitter_id  INT NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_pair (parent_id, sitter_id),
        INDEX idx_parent (parent_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

// ── Ensure payments table exists with all required columns ────
// Uses CREATE TABLE IF NOT EXISTS then addCol() for each column
// so an older payments table with different schema gets patched safely.
function ensurePaymentsTable(){
    // Create table with minimal columns if it doesn't exist at all
    db()->exec("CREATE TABLE IF NOT EXISTS payments (
        id        INT AUTO_INCREMENT PRIMARY KEY,
        job_id    INT NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Add every column the queries rely on — safe no-op if column already exists
    addCol('payments', 'parent_id',                "INT NOT NULL DEFAULT 0");
    addCol('payments', 'sitter_id',                "INT NOT NULL DEFAULT 0");
    addCol('payments', 'stripe_payment_intent_id', "VARCHAR(120) DEFAULT NULL");
    addCol('payments', 'amount_usd',               "DECIMAL(10,2) DEFAULT 0");
    addCol('payments', 'platform_fee_usd',         "DECIMAL(10,2) DEFAULT 0");
    addCol('payments', 'hours_worked',             "DECIMAL(8,4)  DEFAULT 0");
    addCol('payments', 'rate_per_hr',              "DECIMAL(8,2)  DEFAULT 0");
    addCol('payments', 'kids',                     "INT DEFAULT 1");
    addCol('payments', 'status',                   "VARCHAR(30) DEFAULT 'pending'");
    addCol('payments', 'created_at',               "DATETIME DEFAULT CURRENT_TIMESTAMP");
}

// ── Ensure job_routing table exists ──────────────────────────
function ensureRoutingTable(){
    db()->exec("CREATE TABLE IF NOT EXISTS job_routing (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        job_id       INT NOT NULL,
        sitter_id    INT NOT NULL,
        distance_mi  FLOAT DEFAULT 0,
        status       ENUM('pending','notified','accepted','declined','timeout') DEFAULT 'pending',
        notified_at  DATETIME DEFAULT NULL,
        responded_at DATETIME DEFAULT NULL,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_job(job_id),
        INDEX idx_sitter(sitter_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    // Add distance_mi column if it doesn't exist (MySQL 5.7-safe)
    addCol('job_routing', 'distance_mi', 'FLOAT DEFAULT 0');
}

// ── Find online sitters within radius (miles) ─────────────────
function getNearestSitters($lat, $lng, $radius_miles, $exclude_ids=[]){
    $exclude = empty($exclude_ids) ? '0' : implode(',', array_map('intval', $exclude_ids));

    // Pick best available lat/lng for each sitter
    // Priority: user table > sitters table (user table updated when they go online)
    $stmt = db()->prepare("
        SELECT s.id, s.fname, s.lname, s.email, s.minrate, s.maxrate,
               s.city, s.state, s.image, s.about, s.bgcheck,
               u.reg_id AS device_token,
               IF(ABS(u.latitude)  > 0.001, u.latitude,  s.latitude)  AS slat,
               IF(ABS(u.longitude) > 0.001, u.longitude, s.longitude) AS slng
        FROM sitters s
        INNER JOIN `user` u ON u.u_id = s.id AND u.user_type = 'sitter'
        WHERE u.status = 'active'
          AND u.online = 1
          AND s.id NOT IN ($exclude)
          AND (
              u.last_seen IS NULL
              OR u.last_seen > DATE_SUB(NOW(), INTERVAL 5 MINUTE)
          )
    ");
    $stmt->execute();
    $all = $stmt->fetchAll();

    // Calculate distance in PHP to avoid HAVING/NULL issues
    $results = [];
    foreach ($all as $s) {
        $slat = (float)$s['slat'];
        $slng = (float)$s['slng'];

        // If sitter has no coordinates at all, include them anyway at distance 0
        if ($slat == 0 && $slng == 0) {
            $s['distance_away'] = 0;
            $s['latitude']  = $slat;
            $s['longitude'] = $slng;
            $results[] = $s;
            continue;
        }

        // Haversine distance in miles
        $dlat = deg2rad($slat - $lat);
        $dlng = deg2rad($slng - $lng);
        $a    = sin($dlat/2)*sin($dlat/2) +
                cos(deg2rad($lat))*cos(deg2rad($slat))*sin($dlng/2)*sin($dlng/2);
        $dist = 3959 * 2 * atan2(sqrt($a), sqrt(1-$a));

        if ($dist <= $radius_miles) {
            $s['distance_away'] = round($dist, 2);
            $s['latitude']      = $slat;
            $s['longitude']     = $slng;
            $results[] = $s;
        }
    }

    // Sort by distance ascending (nearest first)
    usort($results, function($a, $b) {
        return $a['distance_away'] <=> $b['distance_away'];
    });
    return array_slice($results, 0, 20);
}

// ── Send Expo push notification ───────────────────────────────
function sendExpoPush($token, $title, $body, $data=[]){
    if(empty($token)) return false;
    $payload = json_encode([[
        'to'    => $token,
        'sound' => 'default',
        'title' => $title,
        'body'  => $body,
        'data'  => $data,
        'priority' => 'high',
    ]]);
    $ch = curl_init('https://exp.host/--/api/v2/push/send');
    curl_setopt_array($ch,[
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json','Accept: application/json'],
        CURLOPT_TIMEOUT        => 10,
    ]);
    $result = curl_exec($ch);
    curl_close($ch);
    return json_decode($result, true);
}

// ── ROUTER ────────────────────────────────────────────────────
$body   = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $_GET['action'] ?? ($body['action'] ?? '');

// Run once per request — adds columns/tables if missing
ensureExtraColumns();
ensurePaymentsTable();

try {

switch ($action) {

    // ── TEST ──────────────────────────────────────────────────
    case 'test':
        $pc = row("SELECT COUNT(*) AS c FROM parents")['c'];
        $sc = row("SELECT COUNT(*) AS c FROM sitters")['c'];
        $uc = row("SELECT COUNT(*) AS c FROM `user` WHERE user_type='sitter' AND online=1")['c'];
        ok(['parents'=>$pc,'sitters'=>$sc,'online_sitters'=>$uc,'db'=>'connected']);

    // ── REGISTER PUSH TOKEN ───────────────────────────────────
    case 'register_token':
        $token     = $body['token']     ?? '';
        $user_id   = (int)($body['user_id']   ?? 0);
        $user_type = $body['user_type'] ?? 'sitter';
        if (!$token || !$user_id) err('Missing token or user_id');
        run("UPDATE `user` SET reg_id=? WHERE u_id=? AND user_type=?",
            [$token, $user_id, $user_type]);
        ok([], 'Token registered');

    // ── SET SITTER ONLINE / OFFLINE ───────────────────────────
    case 'set_online':
        $sitter_id = (int)($body['sitter_id'] ?? 0);
        $online    = (int)($body['online']    ?? 0);
        $lat       = (float)($body['lat']     ?? 0);
        $lng       = (float)($body['lng']     ?? 0);
        if (!$sitter_id) err('Missing sitter_id');

        // Update user table — stamp last_seen when going online so we appear on parent map immediately
        $lastSeenSql = $online ? ', last_seen=NOW()' : '';
        run("UPDATE `user` SET online=?, latitude=?, longitude=?{$lastSeenSql} WHERE u_id=? AND user_type='sitter'",
            [$online, $lat, $lng, $sitter_id]);

        // Also update sitters table coordinates
        if ($lat && $lng) {
            run("UPDATE sitters SET latitude=?, longitude=? WHERE id=?",
                [$lat, $lng, $sitter_id]);
        }
        ok(['online' => $online, 'sitter_id' => $sitter_id],
            $online ? 'You are now online' : 'You are now offline');

    // ── UPDATE LOCATION ───────────────────────────────────────
    case 'update_location':
        $sitter_id = (int)($body['sitter_id'] ?? 0);
        $lat       = (float)($body['lat']     ?? 0);
        $lng       = (float)($body['lng']     ?? 0);
        if (!$sitter_id || !$lat || !$lng) err('Missing fields');
        run("UPDATE `user` SET latitude=?, longitude=? WHERE u_id=? AND user_type='sitter'",
            [$lat, $lng, $sitter_id]);
        run("UPDATE sitters SET latitude=?, longitude=? WHERE id=?",
            [$lat, $lng, $sitter_id]);
        ok([], 'Location updated');

    // ── NEARBY ONLINE SITTERS (for parent map) ────────────────
    case 'nearby_sitters':
        $lat    = (float)($_GET['lat']    ?? $body['lat']    ?? 0);
        $lng    = (float)($_GET['lng']    ?? $body['lng']    ?? 0);
        $radius = (float)($_GET['radius'] ?? $body['radius'] ?? 10);
        if (!$lat || !$lng) err('Missing location — lat:'.$lat.' lng:'.$lng);

        $sitters = getNearestSitters($lat, $lng, $radius);

        // Return flat array — app reads res.data.data
        ok($sitters, count($sitters).' online sitter(s) within '.$radius.' miles of '.$lat.','.$lng);

    // ── REQUEST LIVE SITTER ───────────────────────────────────
    case 'request_live':
        $parent_id        = (int)($body['parent_id']        ?? 0);
        $lat              = (float)($body['lat']             ?? 0);
        $lng              = (float)($body['lng']             ?? 0);
        $radius           = (float)($body['radius']          ?? 10);
        $kids             = (int)($body['kids']              ?? 1);
        $address          = $body['address']                 ?? '';
        $preferred_sid    = (int)($body['preferred_sitter_id'] ?? 0);
        // children_ages: array of ints from app e.g. [3, 7, 5]
        $childrenAges  = $body['children_ages']        ?? [];
        if (!is_array($childrenAges)) $childrenAges = [];
        // Sanitise: keep only ints 0-17, max 10 entries
        $childrenAges  = array_slice(array_map('intval', $childrenAges), 0, 10);
        $childrenAgesJson = !empty($childrenAges) ? json_encode($childrenAges) : null;

        if (!$parent_id) err('Missing parent_id');
        if (!$lat || !$lng) err('Missing location');

        // Get parent info
        $parent = row("SELECT * FROM parents WHERE id=?", [$parent_id]);
        if (!$parent) err('Parent account not found');

        // Find online sitters in radius
        $sitters = getNearestSitters($lat, $lng, $radius);
        if (empty($sitters)) {
            ok(['sitters_found' => 0, 'job_id' => 0, 'queue' => []],
               'No online sitters within ' . $radius . ' miles');
        }

        // If a preferred sitter is in the pool, move them to the front
        if ($preferred_sid > 0) {
            $prefIdx = -1;
            foreach ($sitters as $i => $s) {
                if ((int)$s['id'] === $preferred_sid) { $prefIdx = $i; break; }
            }
            if ($prefIdx > 0) {
                $preferred = array_splice($sitters, $prefIdx, 1);
                array_unshift($sitters, $preferred[0]);
            }
        }

        // Build human-readable ages summary for push notification
        $agesSummary = '';
        if (!empty($childrenAges)) {
            $agesStr = implode(', ', array_map(fn($a) => $a === 0 ? 'infant' : "{$a}yr", $childrenAges));
            $agesSummary = " · Ages: $agesStr";
        }

        // Create job record — include children_ages and preferred_sitter_id
        ensureExtraColumns();
        run("INSERT INTO jobs
                (parent_id, address, city, state, latitude, longitude, kids, children_ages, preferred_sitter_id, status, post_time, charge_amt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open', NOW(), ?)",
            [
                $parent_id,
                $address ?: ($parent['address'] ?? ''),
                $parent['city']  ?? '',
                $parent['state'] ?? '',
                $lat, $lng, $kids,
                $childrenAgesJson,
                $preferred_sid ?: null,
                $sitters[0]['minrate'] ?? 15,
            ]
        );
        $job_id = db()->lastInsertId();

        // Create routing queue
        ensureRoutingTable();
        // Insert in order — preferred sitter (if any) is already first in $sitters
        foreach ($sitters as $s) {
            $dist = round((float)($s['distance_away'] ?? 0), 2);
            run("INSERT INTO job_routing (job_id, sitter_id, distance_mi, status) VALUES (?, ?, ?, 'pending')",
                [$job_id, $s['id'], $dist]);
        }

        // Mark first sitter as notified (preferred if present, otherwise nearest)
        $first = $sitters[0];
        run("UPDATE job_routing SET status='notified', notified_at=NOW()
             WHERE job_id=? AND sitter_id=?",
            [$job_id, $first['id']]);

        // Send push notification to first sitter
        $parentName = trim($parent['fname'] . ' ' . $parent['lname']);
        $notifSent  = false;
        if (!empty($first['device_token'])) {
            $r = sendExpoPush(
                $first['device_token'],
                '🍼 New Job Request!',
                "From $parentName · $kids child(ren){$agesSummary} · \${$first['minrate']}/hr · 60s to accept!",
                [
                    'type'          => 'job_request',
                    'job_id'        => $job_id,
                    'parent_id'     => $parent_id,
                    'parent_name'   => $parentName,
                    'kids'          => $kids,
                    'children_ages' => $childrenAges,
                    'address'       => $address,
                    'lat'           => $lat,
                    'lng'           => $lng,
                    'rate'          => $first['minrate'],
                    'timeout'       => 60,
                ]
            );
            $notifSent = isset($r['data'][0]['status']) && $r['data'][0]['status'] === 'ok';
        }

        ok([
            'job_id'       => (int)$job_id,
            'sitters_found'=> count($sitters),
            'notif_sent'   => $notifSent,
            'first_sitter' => [
                'id'       => (int)$first['id'],
                'name'     => trim($first['fname'] . ' ' . $first['lname']),
                'distance' => round((float)($first['distance_away'] ?? 0), 1),
                'rate'     => $first['minrate'],
            ],
            'queue' => array_map(function($s) {
                return [
                    'id'       => (int)$s['id'],
                    'fname'    => $s['fname'],
                    'lname'    => $s['lname'],
                    'distance' => round((float)($s['distance_away'] ?? 0), 1),
                    'rate'     => $s['minrate'],
                ];
            }, $sitters),
        ], 'Job request sent to ' . count($sitters) . ' sitter(s)');

    // ── SITTER ACCEPTS JOB ────────────────────────────────────
    case 'accept_job':
        $job_id    = (int)($body['job_id']    ?? 0);
        $sitter_id = (int)($body['sitter_id'] ?? 0);
        if (!$job_id || !$sitter_id) err('Missing fields');

        // Update job — remove status guard so it always works regardless of case
        run("UPDATE jobs SET sitter_id=?, status='Sitter hired', accept_time=NOW() WHERE id=?",
            [$sitter_id, $job_id]);
        run("UPDATE job_routing SET status='accepted', responded_at=NOW()
             WHERE job_id=? AND sitter_id=?",
            [$job_id, $sitter_id]);
        // Cancel other pending sitters
        run("UPDATE job_routing SET status='timeout'
             WHERE job_id=? AND sitter_id!=? AND status IN ('pending','notified')",
            [$job_id, $sitter_id]);

        // Notify parent
        $job    = row("SELECT j.*, p.reg_id AS parent_token, p.fname AS pname
                        FROM jobs j LEFT JOIN `user` p ON p.u_id=j.parent_id AND p.user_type='parent'
                        WHERE j.id=?", [$job_id]);
        $sitter = row("SELECT fname, lname FROM sitters WHERE id=?", [$sitter_id]);
        if (!empty($job['parent_token'])) {
            $sitterName = trim(($sitter['fname']??'') . ' ' . ($sitter['lname']??''));
            sendExpoPush($job['parent_token'], '🎉 Sitter Found!',
                "$sitterName accepted your request and is on the way!",
                ['type' => 'job_accepted', 'job_id' => $job_id, 'sitter_id' => $sitter_id,
                 'sitter_name' => $sitterName]);
        }
        ok(['job_id' => $job_id, 'sitter_id' => $sitter_id], 'Job accepted');

    // ── SITTER DECLINES JOB ───────────────────────────────────
    case 'decline_job':
        $job_id    = (int)($body['job_id']    ?? 0);
        $sitter_id = (int)($body['sitter_id'] ?? 0);
        if (!$job_id || !$sitter_id) err('Missing fields');

        run("UPDATE job_routing SET status='declined', responded_at=NOW()
             WHERE job_id=? AND sitter_id=?", [$job_id, $sitter_id]);

        // Route to next available sitter
        // Route to next nearest sitter (ordered by jr.id = insertion order = distance order)
        $next = row("SELECT jr.sitter_id, jr.distance_mi, s.fname, s.lname, u.reg_id AS device_token,
                            s.minrate
                     FROM job_routing jr
                     INNER JOIN sitters s ON s.id  = jr.sitter_id
                     INNER JOIN `user`  u ON u.u_id = jr.sitter_id AND u.user_type='sitter'
                     WHERE jr.job_id=? AND jr.status='pending' AND u.online=1
                     ORDER BY jr.id ASC LIMIT 1", [$job_id]);

        if ($next) {
            run("UPDATE job_routing SET status='notified', notified_at=NOW()
                 WHERE job_id=? AND sitter_id=?", [$job_id, $next['sitter_id']]);
            if (!empty($next['device_token'])) {
                // Read kids and children_ages from jobs table (not parents table)
                $job = row("SELECT j.kids, j.children_ages, p.fname AS pname, p.lname AS plname
                             FROM jobs j LEFT JOIN parents p ON p.id=j.parent_id
                             WHERE j.id=?", [$job_id]);
                $jKids     = (int)($job['kids'] ?? 1);
                $jAges     = !empty($job['children_ages']) ? (json_decode($job['children_ages'],true) ?: []) : [];
                $pName     = trim(($job['pname']??'').' '.($job['plname']??''));
                $agesSummary = !empty($jAges)
                    ? ' · Ages: ' . implode(', ', array_map(fn($a) => $a===0?'Infant':"{$a}yr", $jAges))
                    : '';
                sendExpoPush($next['device_token'], '🍼 New Job Request!',
                    "From $pName · $jKids child(ren)$agesSummary · \${$next['minrate']}/hr · 60s to accept!",
                    ['type'=>'job_request','job_id'=>$job_id,'parent_name'=>$pName,
                     'kids'=>$jKids,'children_ages'=>$jAges,'rate'=>$next['minrate'],'timeout'=>60]);
            }
            ok(['routed' => true, 'next_sitter' => $next['sitter_id']], 'Routed to next sitter');
        } else {
            // No more sitters — close job
            run("UPDATE jobs SET status='Closed' WHERE id=?", [$job_id]);
            ok(['routed' => false], 'No more sitters available');
        }

    // ── PARENT CANCELS REQUEST BEFORE SITTER ACCEPTS ─────────
    case 'cancel_request':
        $job_id    = (int)($body['job_id']    ?? 0);
        $parent_id = (int)($body['parent_id'] ?? 0);
        if (!$job_id || !$parent_id) err('Missing job_id or parent_id');
        // Only cancel if still Open (not yet accepted)
        $job = row("SELECT id, status FROM jobs WHERE id=? AND parent_id=?", [$job_id, $parent_id]);
        if (!$job) err('Job not found');
        if ($job['status'] !== 'Open') err('Job already accepted — use cancel_booking instead');
        run("UPDATE jobs SET status='Cancelled' WHERE id=?", [$job_id]);
        run("UPDATE job_routing SET status='cancelled' WHERE job_id=?", [$job_id]);
        ok([], 'Request cancelled');

    // ── TIMEOUT ───────────────────────────────────────────────
    case 'timeout_job':
        $job_id    = (int)($body['job_id']    ?? 0);
        $sitter_id = (int)($body['sitter_id'] ?? 0);
        if (!$job_id || !$sitter_id) err('Missing fields');

        run("UPDATE job_routing SET status='timeout', responded_at=NOW()
             WHERE job_id=? AND sitter_id=?", [$job_id, $sitter_id]);

        // Same as decline — route to next nearest sitter
        $next = row("SELECT jr.sitter_id, jr.distance_mi, s.fname, s.lname, u.reg_id AS device_token, s.minrate
                     FROM job_routing jr
                     INNER JOIN sitters s  ON s.id  = jr.sitter_id
                     INNER JOIN `user`  u  ON u.u_id = jr.sitter_id AND u.user_type='sitter'
                     WHERE jr.job_id=? AND jr.status='pending' AND u.online=1
                     ORDER BY jr.id ASC LIMIT 1", [$job_id]);

        if ($next) {
            run("UPDATE job_routing SET status='notified', notified_at=NOW()
                 WHERE job_id=? AND sitter_id=?", [$job_id, $next['sitter_id']]);
            if (!empty($next['device_token'])) {
                $job = row("SELECT j.kids, j.children_ages, p.fname AS pname, p.lname AS plname
                             FROM jobs j LEFT JOIN parents p ON p.id=j.parent_id
                             WHERE j.id=?", [$job_id]);
                $jKids     = (int)($job['kids'] ?? 1);
                $jAges     = !empty($job['children_ages']) ? (json_decode($job['children_ages'],true) ?: []) : [];
                $pName     = trim(($job['pname']??'').' '.($job['plname']??''));
                $agesSummary = !empty($jAges)
                    ? ' · Ages: ' . implode(', ', array_map(fn($a) => $a===0?'Infant':"{$a}yr", $jAges))
                    : '';
                sendExpoPush($next['device_token'], '🍼 New Job Request!',
                    "From $pName · $jKids child(ren)$agesSummary · \${$next['minrate']}/hr · 60s to accept!",
                    ['type'=>'job_request','job_id'=>$job_id,'parent_name'=>$pName,
                     'kids'=>$jKids,'children_ages'=>$jAges,'rate'=>$next['minrate'],'timeout'=>60]);
            }
        } else {
            run("UPDATE jobs SET status='Closed' WHERE id=?", [$job_id]);
        }
        ok([], 'Timeout processed');

    // ── JOB STATUS (parent polls this) ────────────────────────
    case 'job_status':
        $job_id = (int)($body['job_id'] ?? $_GET['job_id'] ?? $_REQUEST['job_id'] ?? 0);
        if (!$job_id) err('Missing job_id — pass job_id as GET param or POST body');
        ensureExtraColumns(); // ensure accept_time column exists
        $job = row("
            SELECT j.id, j.status, j.sitter_id, j.kids, j.children_ages,
                   j.parent_id,
                   j.address, j.city, j.state,
                   j.latitude  AS job_lat,  j.longitude AS job_lng,
                   j.start_time, j.stop_time, j.accept_time, j.charge_amt,
                   s.fname AS sitter_fname, s.lname AS sitter_lname,
                   s.cellphone AS sitter_phone, s.homephone AS sitter_home_phone,
                   s.image  AS sitter_image, s.about, s.bgcheck,
                   s.minrate AS rate,
                   COALESCE(s.additional_child_rate, 0) AS additional_child_rate,
                   COALESCE(s.avg_rating, 0)             AS avg_rating,
                   COALESCE(s.review_count, 0)           AS review_count,
                   s.latitude AS sitter_lat, s.longitude AS sitter_lng,
                   -- Server-computed elapsed seconds since job started
                   CASE
                       WHEN j.start_time IS NOT NULL AND j.stop_time IS NULL
                           THEN GREATEST(0, TIMESTAMPDIFF(SECOND, j.start_time, NOW()))
                       WHEN j.start_time IS NOT NULL AND j.stop_time IS NOT NULL
                           THEN GREATEST(0, TIMESTAMPDIFF(SECOND, j.start_time, j.stop_time))
                       ELSE 0
                   END AS elapsed_seconds,
                   -- Seconds since sitter accepted (for parent waiting counter)
                   CASE
                       WHEN j.accept_time IS NOT NULL
                           THEN GREATEST(0, TIMESTAMPDIFF(SECOND, j.accept_time, NOW()))
                       ELSE 0
                   END AS waiting_seconds
            FROM jobs j
            LEFT JOIN sitters s ON s.id = j.sitter_id
            WHERE j.id=?", [$job_id]);
        if (!$job) err('Job not found');
        $assigned = !empty($job['sitter_id']) &&
                    in_array($job['status'], ['Sitter hired','Sitter arrived','In progress','Sitter offered']);
        // Get parent's cancel count for policy display
        $parentRow = $job['parent_id'] ? row("SELECT COALESCE(cancel_count,0) AS cancel_count FROM parents WHERE id=?", [$job['parent_id']]) : null;
        $cancelCount = (int)($parentRow['cancel_count'] ?? 0);
        ok([
            'status'       => $job['status'],
            'assigned'     => $assigned,
            'sitter_id'    => $job['sitter_id'],
            'parent_id'    => $job['parent_id'],
            'sitter_name'  => trim(($job['sitter_fname']??'').' '.($job['sitter_lname']??'')),
            'sitter_fname' => $job['sitter_fname'] ?? '',
            'sitter_lname' => $job['sitter_lname'] ?? '',
            'sitter_phone' => $job['sitter_phone'] ?: $job['sitter_home_phone'] ?: '',
            'sitter_image' => $job['sitter_image'] ?? '',
            'about'        => $job['about'] ?? '',
            'bgcheck'      => $job['bgcheck'] ?? 'N',
            'avg_rating'   => (float)($job['avg_rating']   ?? 0),
            'review_count' => (int)  ($job['review_count'] ?? 0),
            'rate'                 => (float)($job['rate'] ?? 15),
            'additional_child_rate'=> (float)($job['additional_child_rate'] ?? 0),
            'effective_rate'       => (float)($job['rate'] ?? 15)
                                      + (float)($job['additional_child_rate'] ?? 0)
                                        * max(0, (int)($job['kids'] ?? 1) - 1),
            'kids'         => (int)($job['kids'] ?? 1),
            'address'      => $job['address'] ?? '',
            // Live sitter GPS (updated while travelling)
            'sitter_lat'   => $job['sitter_lat']  ? (float)$job['sitter_lat']  : null,
            'sitter_lng'   => $job['sitter_lng']  ? (float)$job['sitter_lng']  : null,
            // Job location (where parent requested from)
            'job_lat'      => $job['job_lat']     ? (float)$job['job_lat']     : null,
            'job_lng'      => $job['job_lng']     ? (float)$job['job_lng']     : null,
            'children_ages'  => !empty($job['children_ages'])
                                    ? (json_decode($job['children_ages'], true) ?: [])
                                    : [],
            // Timestamps — converted to UTC ISO so device displays correct local time
            'start_time'     => utcIso($job['start_time']  ?? null),
            'stop_time'      => utcIso($job['stop_time']   ?? null),
            'accept_time'    => utcIso($job['accept_time'] ?? null),
            'charge_amt'     => $job['charge_amt']    ?? null,
            'tip_amount'     => (float)($job['tip_amount']  ?? 0),
            // Server-computed timers — no timezone issues
            'elapsed_seconds' => (int)($job['elapsed_seconds'] ?? 0),
            'waiting_seconds' => (int)($job['waiting_seconds'] ?? 0),
            // Cancellation policy info
            'cancel_count'    => $cancelCount,
            'cancel_free'     => $cancelCount < 3,
        ]);

    // ── UPDATE SITTER LOCATION (sitter sends GPS while travelling) ──
    case 'update_sitter_location':
        $sitter_id = (int)($body['sitter_id'] ?? 0);
        $lat       = (float)($body['lat'] ?? 0);
        $lng       = (float)($body['lng'] ?? 0);
        if (!$sitter_id || !$lat || !$lng) err('Missing sitter_id, lat, or lng');
        run("UPDATE sitters SET latitude=?, longitude=? WHERE id=?", [$lat, $lng, $sitter_id]);
        run("UPDATE `user` SET latitude=?, longitude=? WHERE u_id=? AND user_type='sitter'", [$lat, $lng, $sitter_id]);
        ok([], 'Location updated');

    // ── SETUP SITTER BANK ACCOUNT ────────────────────────────────
    case 'save_bank_account':
        $sitter_id    = (int)($body['sitter_id']    ?? 0);
        $bank_name    = trim($body['bank_name']    ?? '');
        $routing      = preg_replace('/\D/', '', $body['routing_number'] ?? '');
        $account      = preg_replace('/\D/', '', $body['account_number'] ?? '');
        $acct_type    = in_array($body['account_type']??'', ['checking','savings'])
                        ? $body['account_type'] : 'checking';
        if (!$sitter_id || !$bank_name || strlen($routing) !== 9 || strlen($account) < 4)
            err('Please fill in all bank account fields correctly. Routing number must be 9 digits.');
        $last4 = substr($account, -4);
        run("UPDATE sitters SET bank_name=?, routing_number=?, account_number_last4=?,
             account_type=?, payout_method='direct_deposit' WHERE id=?",
            [$bank_name, $routing, $last4, $acct_type, $sitter_id]);
        ok(['last4' => $last4], 'Bank account saved. Payouts will be deposited every Friday.');

    // ── GET SITTER BANK ACCOUNT STATUS ──────────────────────────
    case 'get_bank_account':
        $sitter_id = (int)($body['sitter_id'] ?? $_GET['sitter_id'] ?? 0);
        if (!$sitter_id) err('Missing sitter_id');
        $s = row("SELECT bank_name, routing_number, account_number_last4,
                         account_type, payout_method
                  FROM sitters WHERE id=?", [$sitter_id]);
        if (!$s) err('Sitter not found');
        $hasBank = !empty($s['bank_name']) && !empty($s['routing_number']);
        ok([
            'has_bank'      => $hasBank,
            'bank_name'     => $s['bank_name'] ?? null,
            'last4'         => $s['account_number_last4'] ?? null,
            'account_type'  => $s['account_type'] ?? 'checking',
            'payout_method' => $s['payout_method'] ?? 'check',
        ], $hasBank ? 'Bank account found' : 'No bank account');

    // ── SITTER EARNINGS BY WEEK ──────────────────────────────────
    case 'sitter_weekly_earnings':
        $sitter_id = (int)($body['sitter_id'] ?? $_GET['sitter_id'] ?? 0);
        if (!$sitter_id) err('Missing sitter_id');
        // Belt-and-suspenders: ensure all payment columns exist before querying
        ensurePaymentsTable();
        // Get all succeeded payments, grouped into pay weeks (Sun-Fri)
        // LEFT JOIN parents so rows aren't dropped if parent record is missing
        // Try full query first; fall back to minimal columns if server schema is behind
        try {
            $payments = rows("
                SELECT py.amount_usd, py.platform_fee_usd, py.hours_worked,
                       py.rate_per_hr, py.kids, py.status, py.created_at,
                       p.fname AS parent_fname, p.lname AS parent_lname
                FROM payments py
                LEFT JOIN parents p ON p.id = py.parent_id
                WHERE py.sitter_id = ? AND py.status = 'succeeded'
                ORDER BY py.created_at DESC
            ", [$sitter_id]);
        } catch (Exception $e) {
            // Fallback: some columns (hours_worked/rate_per_hr/kids/created_at) may not exist yet
            // Use literal zeros and NOW() so no missing-column error can occur
            $payments = rows("
                SELECT py.amount_usd, py.platform_fee_usd,
                       0 AS hours_worked, 0 AS rate_per_hr, 1 AS kids,
                       py.status, NOW() AS created_at,
                       p.fname AS parent_fname, p.lname AS parent_lname
                FROM payments py
                LEFT JOIN parents p ON p.id = py.parent_id
                WHERE py.sitter_id = ? AND py.status = 'succeeded'
            ", [$sitter_id]);
        }
        // Compute next pay Friday
        $now     = new DateTime();
        $dow     = (int)$now->format('w'); // 0=Sun, 5=Fri, 6=Sat
        $daysToFriday = (5 - $dow + 7) % 7;
        if ($daysToFriday === 0 && $dow === 5) $daysToFriday = 7; // already Friday = next Friday
        $nextFriday = (clone $now)->modify("+{$daysToFriday} days")->format('Y-m-d');
        // Group by pay week
        $weeks = [];
        foreach ($payments as $p) {
            $dt  = new DateTime($p['created_at']);
            $wdow = (int)$dt->format('w');
            // pay week starts Sunday
            $weekStart = (clone $dt)->modify('-' . $wdow . ' days')->format('Y-m-d');
            if (!isset($weeks[$weekStart])) {
                $weeks[$weekStart] = ['week_start'=>$weekStart,'jobs'=>[],'total_gross'=>0,'total_net'=>0,'hours'=>0];
            }
            $gross = (float)$p['amount_usd'];
            $fee   = (float)$p['platform_fee_usd'];
            $net   = $gross - $fee;
            $p['created_at'] = utcIso($p['created_at']); // ← UTC for frontend display
            $weeks[$weekStart]['jobs'][]       = $p;
            $weeks[$weekStart]['total_gross'] += $gross;
            $weeks[$weekStart]['total_net']   += $net;
            $weeks[$weekStart]['hours']       += (float)$p['hours_worked'];
        }
        ok(['weeks' => array_values($weeks), 'next_pay_date' => $nextFriday], 'Weekly earnings');

    // ── REQUEST PAYOUT ────────────────────────────────────────
    // Body: { sitter_id }
    // Calculates available (unpaid) balance from payments table,
    // creates a payout_request record, returns new balance.
    case 'request_payout':
        ensurePayoutTable();
        ensurePaymentsTable();
        $sitter_id = (int)($body['sitter_id'] ?? 0);
        if (!$sitter_id) err('Missing sitter_id');

        // Total net earned
        $earned = row("SELECT COALESCE(SUM(amount_usd - platform_fee_usd),0) AS net
                       FROM payments WHERE sitter_id=? AND status='succeeded'", [$sitter_id]);
        $totalNet = (float)($earned['net'] ?? 0);

        // Total already paid out
        $paid = row("SELECT COALESCE(SUM(amount),0) AS paid
                     FROM payout_requests WHERE sitter_id=? AND status IN ('approved','paid')", [$sitter_id]);
        $totalPaid = (float)($paid['paid'] ?? 0);

        // Pending requests
        $pending = row("SELECT COALESCE(SUM(amount),0) AS pending
                        FROM payout_requests WHERE sitter_id=? AND status='pending'", [$sitter_id]);
        $totalPending = (float)($pending['pending'] ?? 0);

        $available = round($totalNet - $totalPaid - $totalPending, 2);
        if ($available < 1.00) err('Minimum payout is $1.00. Your available balance is $' . number_format($available, 2));

        // Check bank account is set up
        $sitter = row("SELECT routing_number, account_number FROM sitters WHERE id=?", [$sitter_id]);
        if (empty($sitter['routing_number']) || empty($sitter['account_number'])) {
            err('Please set up your bank account (Direct Deposit) before requesting a payout.');
        }

        run("INSERT INTO payout_requests (sitter_id, amount, status, method, requested_at)
             VALUES (?, ?, 'pending', 'direct_deposit', NOW())", [$sitter_id, $available]);
        $requestId = db()->lastInsertId();

        ok([
            'request_id'    => (int)$requestId,
            'amount'        => $available,
            'status'        => 'pending',
            'available'     => 0.00,  // now $0 pending a review
            'total_earned'  => $totalNet,
            'total_paid'    => $totalPaid + $available,
        ], "Payout request of \${$available} submitted — typically processed within 1 business day.");

    // ── GET PAYOUT HISTORY ────────────────────────────────────
    // Body: { sitter_id }
    // Returns available balance + list of all payout requests
    case 'get_payout_history':
        ensurePayoutTable();
        ensurePaymentsTable();
        $sitter_id = (int)($body['sitter_id'] ?? $_GET['sitter_id'] ?? 0);
        if (!$sitter_id) err('Missing sitter_id');

        $earned = row("SELECT COALESCE(SUM(amount_usd - platform_fee_usd),0) AS net
                       FROM payments WHERE sitter_id=? AND status='succeeded'", [$sitter_id]);
        $totalNet = (float)($earned['net'] ?? 0);

        $paid = row("SELECT COALESCE(SUM(amount),0) AS paid
                     FROM payout_requests WHERE sitter_id=? AND status IN ('approved','paid')", [$sitter_id]);
        $totalPaid = (float)($paid['paid'] ?? 0);

        $pending = row("SELECT COALESCE(SUM(amount),0) AS pending
                        FROM payout_requests WHERE sitter_id=? AND status='pending'", [$sitter_id]);
        $totalPending = (float)($pending['pending'] ?? 0);

        $available = round($totalNet - $totalPaid - $totalPending, 2);

        $requests = rows("SELECT id, amount, status, method, requested_at, paid_at, notes
                          FROM payout_requests WHERE sitter_id=?
                          ORDER BY requested_at DESC LIMIT 30", [$sitter_id]);
        foreach ($requests as &$r) {
            $r['requested_at'] = utcIso($r['requested_at']);
            $r['paid_at']      = $r['paid_at'] ? utcIso($r['paid_at']) : null;
        }

        ok([
            'available'     => max(0, $available),
            'total_earned'  => $totalNet,
            'total_paid'    => $totalPaid,
            'total_pending' => $totalPending,
            'requests'      => $requests,
        ], 'Payout history');

    // ── CHECK INCOMING JOB (sitter polls this) ────────────────
    case 'check_incoming':
        $sitter_id = (int)($body['sitter_id'] ?? 0);
        if (!$sitter_id) err('Missing sitter_id');
        // Heartbeat — keeps sitter visible on parent map; auto-expires if app crashes
        run("UPDATE `user` SET last_seen=NOW() WHERE u_id=? AND user_type='sitter'", [$sitter_id]);

        // ── Auto-dispatch scheduled jobs starting within 30 minutes ──
        // Wrapped in try/catch — a failure here must NEVER break the main check_incoming flow
        try {
            // u.latitude / u.longitude are the correct column names (set by update_sitter_location)
            $sitterLoc = row("SELECT s.minrate, u.latitude AS lat, u.longitude AS lng,
                                     u.online, s.work_distance
                              FROM sitters s
                              INNER JOIN `user` u ON u.u_id=s.id AND u.user_type='sitter'
                              WHERE s.id=?", [$sitter_id]);
            if ($sitterLoc && $sitterLoc['online']) {
                $schedJobs = rows("
                    SELECT j.id, j.latitude, j.longitude, j.parent_id, j.kids, j.children_ages,
                           j.address, j.city, j.state, j.notes, j.duration_hours
                    FROM jobs j
                    WHERE j.status = 'Scheduled'
                      AND j.scheduled_time BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 30 MINUTE)
                      AND j.id NOT IN (SELECT DISTINCT job_id FROM job_routing)
                ", []);
                foreach ($schedJobs as $sj) {
                    // Skip if job has no coordinates
                    if (!$sj['latitude'] || !$sj['longitude']) continue;
                    // Haversine distance sitter → job
                    $R    = 3958.8;
                    $dLat = deg2rad($sj['latitude']  - $sitterLoc['lat']);
                    $dLng = deg2rad($sj['longitude'] - $sitterLoc['lng']);
                    $a    = sin($dLat/2)**2 + cos(deg2rad($sitterLoc['lat']))*cos(deg2rad($sj['latitude']))*sin($dLng/2)**2;
                    $dist = $R * 2 * asin(sqrt($a));
                    $maxDist = (float)($sitterLoc['work_distance'] ?? 10);
                    if ($dist > $maxDist) continue;
                    // Dispatch: open job and create routing entries
                    run("UPDATE jobs SET status='Open' WHERE id=?", [$sj['id']]);
                    ensureRoutingTable();
                    $nearby = getNearestSitters($sj['latitude'], $sj['longitude'], $maxDist);
                    foreach ($nearby as $ns) {
                        $d = round((float)($ns['distance_away'] ?? 0), 2);
                        run("INSERT IGNORE INTO job_routing (job_id,sitter_id,distance_mi,status) VALUES(?,?,?,'pending')",
                            [$sj['id'], $ns['id'], $d]);
                    }
                    if (!empty($nearby)) {
                        $first = $nearby[0];
                        run("UPDATE job_routing SET status='notified',notified_at=NOW() WHERE job_id=? AND sitter_id=?",
                            [$sj['id'], $first['id']]);
                        $parent = row("SELECT fname,lname FROM parents WHERE id=?", [$sj['parent_id']]);
                        $pName  = trim(($parent['fname']??'').' '.($parent['lname']??''));
                        $ages   = !empty($sj['children_ages']) ? (json_decode($sj['children_ages'],true) ?: []) : [];
                        $ageStr = !empty($ages) ? ' · Ages: '.implode(', ', array_map(fn($a)=>$a===0?'Infant':"{$a}yr",$ages)) : '';
                        if (!empty($first['device_token'])) {
                            sendExpoPush($first['device_token'], '📅 Scheduled Job Starting Soon!',
                                "From $pName · {$sj['kids']} child(ren){$ageStr} · \${$first['minrate']}/hr · 60s to accept!",
                                ['type'=>'job_request','job_id'=>$sj['id'],'parent_name'=>$pName,
                                 'kids'=>$sj['kids'],'children_ages'=>$ages,'rate'=>$first['minrate'],'timeout'=>60]);
                        }
                    }
                }
            }
        } catch (Exception $e) {
            // Log silently — do NOT let auto-dispatch failure break real-time job polling
            error_log('auto-dispatch error: ' . $e->getMessage());
        }

        // ── Return any open job currently routed to this sitter ──
        $job = row("
            SELECT j.id, j.kids, j.children_ages, j.address, j.city, j.state,
                   COALESCE(s.minrate, j.charge_amt, 15) AS rate,
                   COALESCE(s.additional_child_rate, 0) AS additional_child_rate,
                   CONCAT(p.fname, ' ', p.lname) AS parent_name,
                   jr.id AS routing_id
            FROM job_routing jr
            INNER JOIN jobs    j ON j.id = jr.job_id
            INNER JOIN parents p ON p.id = j.parent_id
            LEFT  JOIN sitters s ON s.id = jr.sitter_id
            WHERE jr.sitter_id   = ?
              AND jr.status      = 'notified'
              AND j.status       = 'Open'
              AND jr.notified_at > DATE_SUB(NOW(), INTERVAL 65 SECOND)
            ORDER BY jr.notified_at DESC
            LIMIT 1
        ", [$sitter_id]);
        if ($job && !empty($job['children_ages'])) {
            $job['children_ages'] = json_decode($job['children_ages'], true) ?: [];
        } else if ($job) {
            $job['children_ages'] = [];
        }
        ok(['job' => $job ?: null], $job ? 'Incoming job found' : 'No incoming jobs');

    // ── GET SITTER UPCOMING SCHEDULED JOBS ───────────────────
    // Returns jobs accepted by this sitter that have a future scheduled_time
    case 'get_sitter_scheduled':
        $sitter_id = (int)($body['sitter_id'] ?? 0);
        if (!$sitter_id) err('Missing sitter_id');
        $jobs = rows("
            SELECT j.id, j.kids, j.children_ages, j.address, j.city, j.state,
                   j.scheduled_time, j.duration_hours, j.notes, j.status,
                   COALESCE(s.minrate, 15) AS rate,
                   CONCAT(p.fname, ' ', p.lname) AS parent_name,
                   p.cellphone AS parent_phone
            FROM jobs j
            LEFT JOIN sitters s ON s.id = j.sitter_id
            LEFT JOIN parents p ON p.id = j.parent_id
            WHERE j.sitter_id = ?
              AND j.status IN ('Sitter hired','Scheduled')
              AND j.scheduled_time > NOW()
            ORDER BY j.scheduled_time ASC
            LIMIT 20
        ", [$sitter_id]);
        $jobs = array_map(function($j) {
            $ages = !empty($j['children_ages']) ? (json_decode($j['children_ages'],true) ?: []) : [];
            return array_merge($j, [
                'children_ages'  => $ages,
                'scheduled_time' => utcIso($j['scheduled_time'] ?? null),
            ]);
        }, $jobs);
        ok($jobs, count($jobs).' upcoming job(s)');

    // ── GET SITTER ACTIVE JOB ────────────────────────────────
    case 'get_sitter_active_job':
        $sitter_id = (int)($body['sitter_id'] ?? 0);
        if (!$sitter_id) err('Missing sitter_id');
        $job = row("
            SELECT j.id, j.kids, j.children_ages, j.address, j.city, j.state,
                   j.charge_amt AS rate, j.status,
                   j.start_time, j.accept_time,
                   CASE
                       WHEN j.start_time IS NOT NULL AND j.stop_time IS NULL
                           THEN GREATEST(0, TIMESTAMPDIFF(SECOND, j.start_time, NOW()))
                       WHEN j.start_time IS NOT NULL AND j.stop_time IS NOT NULL
                           THEN GREATEST(0, TIMESTAMPDIFF(SECOND, j.start_time, j.stop_time))
                       ELSE 0
                   END AS elapsed_seconds,
                   s.minrate AS sitter_minrate,
                   COALESCE(s.additional_child_rate, 0) AS additional_child_rate,
                   p.fname AS parent_fname, p.lname AS parent_lname,
                   p.cellphone AS parent_phone, p.homephone AS parent_home_phone,
                   p.image AS parent_image
            FROM jobs j
            LEFT JOIN sitters s ON s.id = j.sitter_id
            INNER JOIN parents p ON p.id = j.parent_id
            WHERE j.sitter_id = ?
              AND j.status IN ('Sitter hired','Sitter arrived','In progress','Sitter offered')
            ORDER BY j.id DESC
            LIMIT 1
        ", [$sitter_id]);
        if (!$job) err('No active job found');
        $job['parent_name']  = trim($job['parent_fname'].' '.$job['parent_lname']);
        $job['parent_phone'] = $job['parent_phone'] ?: $job['parent_home_phone'] ?: '';
        // Decode children ages
        if (!empty($job['children_ages'])) {
            $job['children_ages'] = json_decode($job['children_ages'], true) ?: [];
        } else {
            $job['children_ages'] = [];
        }
        // Compute effective rate so the app can show the right number
        $kids    = (int)($job['kids'] ?? 1);
        $base    = (float)($job['sitter_minrate'] ?? $job['rate'] ?? 15);
        $addRate = (float)($job['additional_child_rate'] ?? 0);
        $job['effective_rate'] = $base + ($addRate * max(0, $kids - 1));
        ok($job, 'Active job found');

    // ── SITTER ARRIVED ────────────────────────────────────────
    case 'sitter_arrived':
        $job_id    = (int)($body['job_id']    ?? 0);
        $sitter_id = (int)($body['sitter_id'] ?? 0);
        if (!$job_id || !$sitter_id) err('Missing fields');
        // Update job status so parent polling can detect arrival
        run("UPDATE jobs SET status='Sitter arrived' WHERE id=? AND sitter_id=?", [$job_id, $sitter_id]);
        $job = row("SELECT j.*, u.reg_id AS parent_token, p.fname AS pname
                    FROM jobs j
                    LEFT JOIN `user` u ON u.u_id=j.parent_id AND u.user_type='parent'
                    LEFT JOIN parents p ON p.id=j.parent_id
                    WHERE j.id=?", [$job_id]);
        $sitter = row("SELECT fname, lname FROM sitters WHERE id=?", [$sitter_id]);
        if (!empty($job['parent_token'])) {
            $sName = trim(($sitter['fname']??'').' '.($sitter['lname']??''));
            sendExpoPush($job['parent_token'], '📍 Sitter Arrived!',
                "$sName has arrived and is ready to start.",
                ['type'=>'sitter_arrived','job_id'=>$job_id]);
        }
        ok([], 'Parent notified of arrival');

    // ── START JOB ─────────────────────────────────────────────
    case 'start_job':
        $job_id    = (int)($body['job_id']    ?? 0);
        $sitter_id = (int)($body['sitter_id'] ?? 0);
        if (!$job_id || !$sitter_id) err('Missing fields');
        run("UPDATE jobs SET status='In progress', start_time=NOW() WHERE id=? AND sitter_id=?",
            [$job_id, $sitter_id]);
        $job = row("SELECT j.*, u.reg_id AS parent_token
                    FROM jobs j
                    LEFT JOIN `user` u ON u.u_id=j.parent_id AND u.user_type='parent'
                    WHERE j.id=?", [$job_id]);
        $sitter = row("SELECT fname FROM sitters WHERE id=?", [$sitter_id]);
        if (!empty($job['parent_token'])) {
            $now = date('g:i A');
            sendExpoPush($job['parent_token'], '▶ Job Started!',
                "{$sitter['fname']} started at $now. Timer is running.",
                ['type'=>'job_started','job_id'=>$job_id,'start_time'=>$now]);
        }
        ok(['start_time' => date('Y-m-d H:i:s')], 'Job started');

    // ── STOP JOB ──────────────────────────────────────────────
    case 'stop_job':
        $job_id    = (int)($body['job_id']    ?? 0);
        $sitter_id = (int)($body['sitter_id'] ?? 0);
        $hours     = (float)($body['hours']   ?? 0);
        if (!$job_id || !$sitter_id) err('Missing fields');

        // Fetch sitter with additional_child_rate
        $sitter = row("SELECT fname, lname, minrate,
                              COALESCE(additional_child_rate, 0) AS additional_child_rate
                       FROM sitters WHERE id=?", [$sitter_id]);
        $job    = row("SELECT j.*, u.reg_id AS parent_token, p.fname AS pname
                       FROM jobs j
                       LEFT JOIN `user` u ON u.u_id=j.parent_id AND u.user_type='parent'
                       LEFT JOIN parents p ON p.id=j.parent_id
                       WHERE j.id=?", [$job_id]);

        $kids      = max(1, (int)($job['kids'] ?? 1));
        $baseRate  = (float)($sitter['minrate'] ?? 15);
        $addRate   = (float)($sitter['additional_child_rate'] ?? 0);

        // If start_time was never set (sitter skipped timer), compute hours from server-side time
        if ($hours <= 0 && !empty($job['start_time'])) {
            $startTs = strtotime($job['start_time']);
            $hours   = $startTs > 0 ? round((time() - $startTs) / 3600, 4) : 0;
        }
        // Minimum 15 minutes billable
        if ($hours < 0.25) $hours = 0.25;

        // Rate = base rate + (additional_child_rate × extra children)
        $effectiveRate = $baseRate + ($addRate * max(0, $kids - 1));
        $total         = round($hours * $effectiveRate, 2);

        // If start_time was NULL, record it now so elapsed_seconds works
        $startSql = empty($job['start_time']) ? ', start_time=DATE_SUB(NOW(), INTERVAL ' . round($hours*3600) . ' SECOND)' : '';
        run("UPDATE jobs SET status='Complete', stop_time=NOW(), charge_amt=?{$startSql} WHERE id=? AND sitter_id=?",
            [$total, $job_id, $sitter_id]);

        if (!empty($job['parent_token'])) {
            $sName  = trim(($sitter['fname']??'').' '.($sitter['lname']??''));
            $stopAt = date('g:i A');
            sendExpoPush($job['parent_token'], '✅ Job Complete!',
                "$sName finished at $stopAt. Total: \${$total}. Thank you for using Sitters4Me!",
                ['type'=>'job_complete','job_id'=>$job_id,'total'=>$total,'stop_time'=>$stopAt]);
        }
        ok([
            'total_usd'     => $total,
            'hours'         => $hours,
            'base_rate'     => $baseRate,
            'additional_rate'=> $addRate,
            'effective_rate' => $effectiveRate,
            'kids'          => $kids,
        ], 'Job stopped');

    // ── SCHEDULE FUTURE APPOINTMENT ──────────────────────────
    // Parent picks a future date/time — creates a Scheduled job (no sitter notified yet)
    case 'schedule_job':
        ensureExtraColumns();
        $parent_id           = (int)($body['parent_id']          ?? 0);
        $scheduled_time      = trim($body['scheduled_time']      ?? '');
        $kids                = (int)($body['kids']               ?? 1);
        $duration_hours      = (float)($body['duration_hours']   ?? 2);
        $lat                 = (float)($body['lat']              ?? 0);
        $lng                 = (float)($body['lng']              ?? 0);
        $address             = trim($body['address']             ?? '');
        $notes               = trim($body['notes']               ?? '');
        $preferred_sitter_id = ($body['preferred_sitter_id'] ?? null) ? (int)$body['preferred_sitter_id'] : null;
        $childrenAges        = $body['children_ages']            ?? [];
        if (!is_array($childrenAges)) $childrenAges = [];
        $childrenAges   = array_slice(array_map('intval', $childrenAges), 0, 10);
        $childrenAgesJson = !empty($childrenAges) ? json_encode($childrenAges) : null;

        if (!$parent_id)      err('Missing parent_id');
        if (!$scheduled_time) err('Missing scheduled_time');

        $dt = date_create($scheduled_time);
        if (!$dt) err('Invalid scheduled_time format. Use ISO-8601 e.g. 2025-06-15T14:30:00');
        if ($dt->getTimestamp() <= time()) err('Appointment must be in the future');

        $mysqlDt = $dt->format('Y-m-d H:i:s');

        $parent = row("SELECT * FROM parents WHERE id=?", [$parent_id]);
        if (!$parent) err('Parent account not found');

        // Validate preferred sitter exists (if provided)
        if ($preferred_sitter_id) {
            $prefSitter = row("SELECT id FROM sitters WHERE id=?", [$preferred_sitter_id]);
            if (!$prefSitter) $preferred_sitter_id = null;
        }

        run("INSERT INTO jobs
                (parent_id, address, city, state, latitude, longitude,
                 kids, children_ages, status, post_time, charge_amt,
                 scheduled_time, duration_hours, notes, preferred_sitter_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Scheduled', NOW(), 0, ?, ?, ?, ?)",
            [
                $parent_id,
                $address ?: ($parent['address'] ?? ''),
                $parent['city']  ?? '',
                $parent['state'] ?? '',
                $lat ?: ($parent['latitude']  ?? 0),
                $lng ?: ($parent['longitude'] ?? 0),
                $kids,
                $childrenAgesJson,
                $mysqlDt,
                $duration_hours ?: 2,
                $notes ?: null,
                $preferred_sitter_id,
            ]
        );
        $job_id = db()->lastInsertId();
        ok([
            'job_id'               => (int)$job_id,
            'scheduled_time'       => $mysqlDt,
            'duration_hours'       => $duration_hours,
            'preferred_sitter_id'  => $preferred_sitter_id,
            'formatted'            => $dt->format('l, F j, Y \a\t g:i A'),
        ], 'Appointment scheduled for ' . $dt->format('M j, Y g:i A'));

    // ── CANCEL SCHEDULED APPOINTMENT ─────────────────────────
    // Free cancellation — no sitter has been assigned yet
    case 'cancel_scheduled':
        $job_id    = (int)($body['job_id']    ?? 0);
        $parent_id = (int)($body['parent_id'] ?? 0);
        if (!$job_id || !$parent_id) err('Missing job_id or parent_id');
        $job = row("SELECT id, status FROM jobs WHERE id=? AND parent_id=?", [$job_id, $parent_id]);
        if (!$job) err('Appointment not found');
        if ($job['status'] !== 'Scheduled') err('Only pending scheduled appointments can be cancelled here');
        run("UPDATE jobs SET status='Cancelled' WHERE id=?", [$job_id]);
        ok([], 'Scheduled appointment cancelled');

    // ── UPDATE SITTER PROFILE ─────────────────────────────────
    // Sitter updates rates, bio, work distance, additional child rate.
    // Name changes are NOT allowed here — must go through customer support.
    case 'update_sitter_profile':
        $sitter_id             = (int)($body['sitter_id']             ?? 0);
        $minrate               = (float)($body['minrate']             ?? 0);
        $maxrate               = (float)($body['maxrate']             ?? 0);
        $additional_child_rate = (float)($body['additional_child_rate'] ?? 0);
        $work_distance         = (int)($body['work_distance']         ?? 10);
        $about                 = trim($body['about']                  ?? '');

        if (!$sitter_id) err('Missing sitter_id');
        if ($minrate <= 0) err('Minimum rate must be greater than $0/hr');
        if ($maxrate < $minrate) $maxrate = $minrate;
        if ($additional_child_rate < 0) $additional_child_rate = 0;
        if ($work_distance < 1) $work_distance = 1;
        if ($work_distance > 100) $work_distance = 100;

        // Verify sitter exists
        $sitterCheck = row("SELECT id FROM sitters WHERE id=?", [$sitter_id]);
        if (!$sitterCheck) err('Sitter not found');

        // Build update — only include about if the column exists
        $updates = ["minrate=?", "maxrate=?", "additional_child_rate=?", "work_distance=?"];
        $params  = [$minrate, $maxrate, $additional_child_rate, $work_distance];

        if ($about !== '' && colExists('sitters','about')) {
            $updates[] = "about=?";
            $params[]  = $about;
        }

        $params[] = $sitter_id;
        run("UPDATE sitters SET " . implode(', ', $updates) . " WHERE id=?", $params);

        // Mirror work_distance to user table if that column exists
        if (colExists('user','work_distance')) {
            try {
                run("UPDATE `user` SET work_distance=? WHERE u_id=? AND user_type='sitter'",
                    [$work_distance, $sitter_id]);
            } catch(Exception $e){}
        }

        // Return the freshly-saved profile
        $updated = row("SELECT id, fname, lname, minrate, maxrate,
                               additional_child_rate, work_distance, about, city, state
                        FROM sitters WHERE id=?", [$sitter_id]);
        if (!$updated) err('Could not retrieve updated profile');
        ok($updated, 'Profile updated successfully');

    // ── GET SITTER PROFILE ────────────────────────────────────
    // get_sitter_profile — full version is below (after push token); this stub intentionally removed

    // ── SITTER JOB HISTORY ────────────────────────────────────
    // All completed jobs for a sitter — used in Job History tab
    case 'sitter_job_history':
        $sitter_id = (int)($body['sitter_id'] ?? $_GET['sitter_id'] ?? 0);
        if (!$sitter_id) err('Missing sitter_id');
        // Belt-and-suspenders: ensure all payment columns exist before querying
        ensurePaymentsTable();

        // Try full query first; fall back if extended payment columns don't exist yet
        try {
            $jobs = rows("
                SELECT j.id, j.status, j.kids, j.children_ages, j.address, j.city, j.state,
                       j.start_time, j.stop_time, j.charge_amt, j.post_time,
                       CASE
                         WHEN j.start_time IS NOT NULL AND j.stop_time IS NOT NULL
                           THEN GREATEST(0, TIMESTAMPDIFF(SECOND, j.start_time, j.stop_time))
                         WHEN j.start_time IS NOT NULL AND j.stop_time IS NULL
                           THEN GREATEST(0, TIMESTAMPDIFF(SECOND, j.start_time, NOW()))
                         ELSE 0
                       END AS elapsed_seconds,
                       p.fname AS parent_fname, p.lname AS parent_lname,
                       py.amount_usd, py.platform_fee_usd, py.hours_worked,
                       py.rate_per_hr, py.status AS payment_status
                FROM jobs j
                LEFT JOIN parents p ON p.id = j.parent_id
                LEFT JOIN payments py ON py.job_id = j.id AND py.sitter_id = ?
                WHERE j.sitter_id = ?
                  AND j.status IN ('Complete','In progress','Sitter arrived','Sitter hired')
                ORDER BY j.id DESC
                LIMIT 50
            ", [$sitter_id, $sitter_id]);
        } catch (Exception $e) {
            // Fallback: hours_worked/rate_per_hr may not exist — use charge_amt as gross
            $jobs = rows("
                SELECT j.id, j.status, j.kids, j.children_ages, j.address, j.city, j.state,
                       j.start_time, j.stop_time, j.charge_amt, j.post_time,
                       CASE
                         WHEN j.start_time IS NOT NULL AND j.stop_time IS NOT NULL
                           THEN GREATEST(0, TIMESTAMPDIFF(SECOND, j.start_time, j.stop_time))
                         WHEN j.start_time IS NOT NULL AND j.stop_time IS NULL
                           THEN GREATEST(0, TIMESTAMPDIFF(SECOND, j.start_time, NOW()))
                         ELSE 0
                       END AS elapsed_seconds,
                       p.fname AS parent_fname, p.lname AS parent_lname,
                       py.amount_usd, py.platform_fee_usd,
                       0 AS hours_worked, 0 AS rate_per_hr,
                       py.status AS payment_status
                FROM jobs j
                LEFT JOIN parents p ON p.id = j.parent_id
                LEFT JOIN payments py ON py.job_id = j.id AND py.sitter_id = ?
                WHERE j.sitter_id = ?
                  AND j.status IN ('Complete','In progress','Sitter arrived','Sitter hired')
                ORDER BY j.id DESC
                LIMIT 50
            ", [$sitter_id, $sitter_id]);
        }

        // Compute derived fields + convert timestamps to UTC ISO
        $enriched = array_map(function($j) {
            $gross   = (float)($j['amount_usd']       ?? $j['charge_amt'] ?? 0);
            $fee     = (float)($j['platform_fee_usd'] ?? $gross * 0.15);
            $net     = $gross - $fee;
            $elapsed = (int)($j['elapsed_seconds'] ?? 0);
            $hours   = $elapsed > 0 ? round($elapsed / 3600, 2) : (float)($j['hours_worked'] ?? 0);
            return array_merge($j, [
                'gross'        => round($gross, 2),
                'fee'          => round($fee,   2),
                'net'          => round($net,   2),
                'hours'        => $hours,
                'elapsed_secs' => $elapsed,
                'parent_name'  => trim(($j['parent_fname']??'').' '.($j['parent_lname']??'')),
                // ── UTC timestamps for correct local-time display on device ──
                'start_time'   => utcIso($j['start_time'] ?? null),
                'stop_time'    => utcIso($j['stop_time']  ?? null),
                'post_time'    => utcIso($j['post_time']  ?? null),
            ]);
        }, $jobs);

        ok($enriched, count($enriched) . ' completed job(s)');

    // ── PARENT JOB HISTORY ───────────────────────────────────
    // All jobs a parent has requested — completed, in progress, scheduled
    case 'parent_job_history':
        $parent_id = (int)($body['parent_id'] ?? $_GET['parent_id'] ?? 0);
        if (!$parent_id) err('Missing parent_id');

        $jobs = rows("
            SELECT j.id, j.status, j.kids, j.children_ages,
                   j.address, j.city, j.state,
                   j.post_time, j.start_time, j.stop_time,
                   j.charge_amt, j.scheduled_time,
                   s.fname AS sitter_fname, s.lname AS sitter_lname,
                   s.minrate AS sitter_rate, s.image AS sitter_image,
                   COALESCE(s.additional_child_rate, 0) AS additional_child_rate,
                   -- MySQL 5.7-safe elapsed
                   CASE
                     WHEN j.start_time IS NOT NULL AND j.stop_time IS NOT NULL
                       THEN GREATEST(0, TIMESTAMPDIFF(SECOND, j.start_time, j.stop_time))
                     WHEN j.start_time IS NOT NULL AND j.stop_time IS NULL
                       THEN GREATEST(0, TIMESTAMPDIFF(SECOND, j.start_time, NOW()))
                     ELSE 0
                   END AS elapsed_seconds,
                   py.amount_usd, py.platform_fee_usd, py.status AS payment_status
            FROM jobs j
            LEFT JOIN sitters  s  ON s.id  = j.sitter_id
            LEFT JOIN payments py ON py.job_id = j.id
            WHERE j.parent_id = ?
              AND j.status NOT IN ('Open','Closed')
            ORDER BY j.id DESC
            LIMIT 100
        ", [$parent_id]);

        $enriched = array_map(function($j) {
            $ages    = !empty($j['children_ages']) ? (json_decode($j['children_ages'],true) ?: []) : [];
            $gross   = (float)($j['amount_usd']   ?? $j['charge_amt'] ?? 0);
            $fee     = (float)($j['platform_fee_usd'] ?? 0);
            $elapsed = (int)($j['elapsed_seconds'] ?? 0);
            $hours   = $elapsed > 0 ? round($elapsed / 3600, 2) : 0;
            return array_merge($j, [
                'children_ages'  => $ages,
                'sitter_name'    => trim(($j['sitter_fname']??'').' '.($j['sitter_lname']??'')),
                'gross'          => round($gross, 2),
                'fee'            => round($fee, 2),
                'hours'          => $hours,
                'elapsed_secs'   => $elapsed,
                // ── UTC timestamps for correct local-time display on device ──
                'post_time'      => utcIso($j['post_time']      ?? null),
                'start_time'     => utcIso($j['start_time']     ?? null),
                'stop_time'      => utcIso($j['stop_time']      ?? null),
                'scheduled_time' => utcIso($j['scheduled_time'] ?? null),
            ]);
        }, $jobs);

        ok($enriched, count($enriched) . ' job(s) in history');

    // ── DEBUG SITTER — reveal DB state for a sitter ─────────
    // Usage: POST {sitter_id:X} or GET ?sitter_id=X&action=debug_sitter
    case 'debug_sitter':
        $sitter_id = (int)($body['sitter_id'] ?? $_GET['sitter_id'] ?? 0);
        if (!$sitter_id) err('Pass sitter_id');

        $sitter = row("SELECT id, fname, lname, email, minrate, maxrate,
                              additional_child_rate, work_distance, about
                       FROM sitters WHERE id=?", [$sitter_id]);

        $userRow = row("SELECT u_id, username, online, status, reg_id
                        FROM `user` WHERE u_id=? AND user_type='sitter'", [$sitter_id]);

        $recentJobs = rows("SELECT id, status, kids, charge_amt, start_time, stop_time, post_time
                             FROM jobs WHERE sitter_id=?
                             ORDER BY id DESC LIMIT 10", [$sitter_id]);

        // Show actual columns in payments table so we can see what exists on the server
        $paymentsCols = [];
        $paymentsExist = false;
        $recentPayments = [];
        $paymentsError = null;
        try {
            $colRows = db()->query("SHOW COLUMNS FROM payments")->fetchAll();
            $paymentsCols = array_column($colRows, 'Field');
            $paymentsExist = true;
        } catch(Exception $e) {
            $paymentsError = $e->getMessage();
        }
        try {
            $recentPayments = rows("SELECT id, job_id, sitter_id, parent_id,
                                           amount_usd, platform_fee_usd,
                                           hours_worked, rate_per_hr, kids, status, created_at
                                    FROM payments WHERE sitter_id=?
                                    ORDER BY id DESC LIMIT 10", [$sitter_id]);
        } catch(Exception $e) {
            $paymentsError = ($paymentsError ? $paymentsError . ' | ' : '') . $e->getMessage();
        }

        ok([
            'sitter'                => $sitter,
            'user_row'              => $userRow,
            'recent_jobs'           => $recentJobs,
            'payments_table_exists' => $paymentsExist,
            'payments_columns'      => $paymentsCols,   // ← exact column list on live server
            'payments_error'        => $paymentsError,
            'recent_payments'       => $recentPayments,
            'sitter_id_tested'      => $sitter_id,
        ], 'Debug info for sitter #' . $sitter_id);

    // ── LIST RECENT JOBS (for debugging) ─────────────────────
    case 'list_jobs':
        $jobs = rows("
            SELECT j.id, j.status, j.sitter_id, j.parent_id,
                   j.kids, j.post_time,
                   p.fname AS parent_name,
                   s.fname AS sitter_fname, s.lname AS sitter_lname
            FROM jobs j
            LEFT JOIN parents p ON p.id = j.parent_id
            LEFT JOIN sitters s ON s.id = j.sitter_id
            ORDER BY j.id DESC
            LIMIT 10
        ");
        ok($jobs, count($jobs).' recent jobs');

    // ── DEBUG: show online sitters ────────────────────────────
    // ── TIMEZONE DEBUG — visit ?action=debug_tz to verify UTC is correct ──────
    case 'debug_tz':
        $tz = row("SELECT @@session.time_zone AS session_tz, @@global.time_zone AS global_tz,
                          NOW() AS mysql_now, UTC_TIMESTAMP() AS mysql_utc");
        ok([
            'mysql_session_tz' => $tz['session_tz'],
            'mysql_global_tz'  => $tz['global_tz'],
            'mysql_NOW()'      => $tz['mysql_now'],
            'mysql_UTC_TIMESTAMP()' => $tz['mysql_utc'],
            'php_date_timezone'     => date_default_timezone_get(),
            'php_date_now'          => date('Y-m-d H:i:s'),
            'utcIso_test'           => utcIso($tz['mysql_now']),
            'note' => 'mysql_NOW() and utcIso_test should show current UTC time. php_date_timezone does not matter.',
        ]);

    case 'debug_online':
        $online = rows("
            SELECT u.u_id, u.username, u.online, u.latitude, u.longitude,
                   s.fname, s.lname, s.minrate, s.city, s.state
            FROM `user` u
            LEFT JOIN sitters s ON s.id = u.u_id
            WHERE u.user_type = 'sitter' AND u.online = 1
            LIMIT 20
        ");
        $recent = rows("
            SELECT u.u_id, u.username, u.online, s.fname, s.lname
            FROM `user` u LEFT JOIN sitters s ON s.id=u.u_id
            WHERE u.user_type='sitter'
            ORDER BY u.u_id DESC LIMIT 10
        ");
        ok(['online_count' => count($online), 'online_sitters' => $online, 'last_10_sitter_users' => $recent]);

    // ── CANCEL BOOKING (parent cancels before job starts) ─────────
    case 'cancel_booking':
        ensureExtraColumns();
        $job_id    = (int)($body['job_id']    ?? 0);
        $parent_id = (int)($body['parent_id'] ?? 0);
        if (!$job_id || !$parent_id) err('Missing job_id or parent_id');

        $job = row("SELECT j.id, j.status, j.sitter_id, j.parent_id, j.charge_amt,
                           j.kids, s.minrate, COALESCE(s.additional_child_rate,0) AS add_rate,
                           p.cancel_count
                    FROM jobs j
                    LEFT JOIN sitters s ON s.id = j.sitter_id
                    LEFT JOIN parents p ON p.id = j.parent_id
                    WHERE j.id=? AND j.parent_id=?", [$job_id, $parent_id]);
        if (!$job) err('Job not found');

        // Cannot cancel once job is in progress or complete
        $blockStatuses = ['In progress', 'Complete'];
        if (in_array($job['status'], $blockStatuses)) {
            err('Cannot cancel a job that has already started or completed.', 400);
        }

        $cancelCount = (int)($job['cancel_count'] ?? 0);
        $freeRemaining = max(0, 3 - $cancelCount);
        $applyFee = ($cancelCount >= 3);
        $cancellationFee = 0.00;

        if ($applyFee) {
            // 10% of estimated 1-hour charge
            $kids    = (int)($job['kids'] ?? 1);
            $base    = (float)($job['minrate'] ?? 15);
            $addRate = (float)($job['add_rate'] ?? 0);
            $effRate = $base + ($addRate * max(0, $kids - 1));
            $cancellationFee = round($effRate * 0.10, 2);
        }

        // Mark job cancelled
        run("UPDATE jobs SET status='Cancelled' WHERE id=?", [$job_id]);
        // Increment parent cancel count
        run("UPDATE parents SET cancel_count = COALESCE(cancel_count,0) + 1 WHERE id=?", [$parent_id]);

        // Notify sitter if assigned
        if (!empty($job['sitter_id'])) {
            $sitterUser = row("SELECT reg_id FROM `user` WHERE u_id=? AND user_type='sitter'", [$job['sitter_id']]);
            if (!empty($sitterUser['reg_id'])) {
                sendExpoPush($sitterUser['reg_id'], '❌ Booking Cancelled',
                    'The parent has cancelled this booking.' . ($applyFee ? ' A cancellation fee has been applied.' : ''),
                    ['type'=>'job_cancelled','job_id'=>$job_id]);
            }
        }

        ok([
            'cancelled'         => true,
            'fee_applied'       => $applyFee,
            'cancellation_fee'  => $cancellationFee,
            'cancel_count'      => $cancelCount + 1,
            'free_remaining'    => max(0, $freeRemaining - 1),
        ], $applyFee
            ? "Booking cancelled. \${$cancellationFee} cancellation fee applied."
            : "Booking cancelled. {$freeRemaining} free cancellation(s) remaining after this one.");

    // ── SUBMIT REVIEW (parent rates sitter after job) ──────────
    case 'submit_review':
        ensureReviewsTable();
        $job_id    = (int)($body['job_id']    ?? 0);
        $parent_id = (int)($body['parent_id'] ?? 0);
        $sitter_id = (int)($body['sitter_id'] ?? 0);
        $rating    = max(1, min(5, (int)($body['rating']      ?? 5)));
        $text      = trim($body['review_text'] ?? '');
        if (!$job_id || !$parent_id || !$sitter_id) err('Missing fields');

        // Verify job exists and belongs to this parent
        $job = row("SELECT id FROM jobs WHERE id=? AND parent_id=? AND status='Complete'", [$job_id, $parent_id]);
        if (!$job) err('Job not found or not yet complete');

        // Upsert — one review per job
        $existing = row("SELECT id FROM reviews WHERE job_id=? AND parent_id=?", [$job_id, $parent_id]);
        if ($existing) {
            run("UPDATE reviews SET rating=?, review_text=? WHERE id=?", [$rating, $text, $existing['id']]);
        } else {
            run("INSERT INTO reviews (job_id, parent_id, sitter_id, rating, review_text)
                 VALUES (?,?,?,?,?)", [$job_id, $parent_id, $sitter_id, $rating, $text]);
        }

        // Update sitter's cached avg_rating and review_count
        $stats = row("SELECT AVG(rating) AS avg_r, COUNT(*) AS cnt FROM reviews WHERE sitter_id=?", [$sitter_id]);
        if ($stats) {
            run("UPDATE sitters SET avg_rating=?, review_count=? WHERE id=?",
                [round((float)$stats['avg_r'], 2), (int)$stats['cnt'], $sitter_id]);
        }
        ok(['rating' => $rating], 'Review submitted — thank you!');

    // ── GET SITTER REVIEWS (show on sitter profile) ────────────
    case 'get_sitter_reviews':
        ensureReviewsTable();
        $sitter_id = (int)($body['sitter_id'] ?? $_GET['sitter_id'] ?? 0);
        if (!$sitter_id) err('Missing sitter_id');
        $reviews = rows("
            SELECT r.id, r.rating, r.review_text, r.created_at,
                   p.fname AS parent_fname, p.lname AS parent_lname
            FROM reviews r
            LEFT JOIN parents p ON p.id = r.parent_id
            WHERE r.sitter_id=?
            ORDER BY r.created_at DESC
            LIMIT 20", [$sitter_id]);
        $stats = row("SELECT AVG(rating) AS avg_r, COUNT(*) AS cnt FROM reviews WHERE sitter_id=?", [$sitter_id]);
        ok([
            'reviews'      => $reviews,
            'avg_rating'   => $stats ? round((float)$stats['avg_r'], 2) : 0,
            'review_count' => $stats ? (int)$stats['cnt'] : 0,
        ]);

    // ── SAVE FAVORITE SITTER ───────────────────────────────────
    case 'save_favorite':
        ensureFavoritesTable();
        $parent_id = (int)($body['parent_id'] ?? 0);
        $sitter_id = (int)($body['sitter_id'] ?? 0);
        if (!$parent_id || !$sitter_id) err('Missing fields');

        // IGNORE duplicate — UNIQUE KEY prevents duplicates
        db()->prepare("INSERT IGNORE INTO favorite_sitters (parent_id, sitter_id) VALUES (?,?)")
             ->execute([$parent_id, $sitter_id]);
        ok(['saved' => true], 'Sitter saved to your favorites!');

    // ── REMOVE FAVORITE SITTER ─────────────────────────────────
    case 'remove_favorite':
        ensureFavoritesTable();
        $parent_id = (int)($body['parent_id'] ?? 0);
        $sitter_id = (int)($body['sitter_id'] ?? 0);
        if (!$parent_id || !$sitter_id) err('Missing fields');
        run("DELETE FROM favorite_sitters WHERE parent_id=? AND sitter_id=?", [$parent_id, $sitter_id]);
        ok(['removed' => true], 'Sitter removed from favorites');

    // ── SAVE PUSH TOKEN (called on login from app) ─────────────
    case 'save_push_token':
        $user_type = $body['user_type'] ?? ''; // 'parent' or 'sitter'
        $user_id   = (int)($body['user_id'] ?? 0);
        $token     = trim($body['push_token'] ?? '');
        if (!$user_id || !$token || !in_array($user_type, ['parent','sitter'])) err('Missing fields');
        // Store in user table (reg_id column) — existing push logic reads from here
        run("UPDATE `user` SET reg_id=? WHERE u_id=? AND user_type=?", [$token, $user_id, $user_type]);
        // Also store in parent/sitter table for get_favorites / get_sitter_profile queries
        if ($user_type === 'parent') {
            run("UPDATE parents SET push_token=? WHERE id=?", [$token, $user_id]);
        } else {
            run("UPDATE sitters SET push_token=? WHERE id=?", [$token, $user_id]);
        }
        ok(['saved' => true], 'Push token saved');

    // ── GET FULL SITTER PROFILE (with reviews) ────────────────
    case 'get_sitter_profile':
        ensureReviewsTable();
        $sitter_id = (int)($body['sitter_id'] ?? $_GET['sitter_id'] ?? 0);
        if (!$sitter_id) err('Missing sitter_id');
        $sitter = row("
            SELECT s.id, s.fname, s.lname, s.minrate, s.image, s.about, s.bgcheck,
                   s.city, s.state,
                   s.experience_years, s.certifications,
                   COALESCE(s.avg_rating,0)    AS avg_rating,
                   COALESCE(s.review_count,0)  AS review_count,
                   u.online, u.latitude, u.longitude,
                   CASE
                     WHEN s.dob IS NOT NULL AND s.dob != '' AND s.dob != '0000-00-00'
                       THEN TIMESTAMPDIFF(YEAR, s.dob, CURDATE())
                     ELSE NULL
                   END AS age
            FROM sitters s
            LEFT JOIN `user` u ON u.u_id = s.id AND u.user_type='sitter'
            WHERE s.id=?", [$sitter_id]);
        if (!$sitter) err('Sitter not found', 404);
        $reviews = rows("
            SELECT r.id, r.rating, r.review_text, r.created_at,
                   p.fname AS parent_fname, p.lname AS parent_lname
            FROM reviews r
            LEFT JOIN parents p ON p.id = r.parent_id
            WHERE r.sitter_id=?
            ORDER BY r.created_at DESC
            LIMIT 20", [$sitter_id]);
        // format review dates
        foreach ($reviews as &$rev) {
            $rev['created_at'] = utcIso($rev['created_at']);
        }
        ok(array_merge($sitter, ['reviews' => $reviews]));

    // ── UPLOAD PROFILE PHOTO ──────────────────────────────────
    // Accepts base64-encoded JPEG/PNG. Decodes, saves to uploads/, updates DB.
    // Body: { user_type: 'parent'|'sitter', user_id: int, image_base64: string }
    case 'upload_photo':
        $user_type   = $body['user_type'] ?? '';
        $user_id     = (int)($body['user_id'] ?? 0);
        $image_b64   = $body['image_base64'] ?? '';
        if (!in_array($user_type, ['parent','sitter'])) err('Invalid user_type');
        if (!$user_id) err('Missing user_id');
        if (empty($image_b64))  err('Missing image_base64');

        // Strip optional data-URI prefix (e.g. "data:image/jpeg;base64,")
        if (strpos($image_b64, ',') !== false) {
            $image_b64 = explode(',', $image_b64, 2)[1];
        }
        $decoded = base64_decode($image_b64, true);
        if ($decoded === false || strlen($decoded) < 100) err('Invalid image data');

        // Detect mime type from magic bytes
        $mime = '';
        if (str_starts_with($decoded, "\xFF\xD8\xFF")) { $mime = 'jpg'; }
        elseif (str_starts_with($decoded, "\x89PNG"))  { $mime = 'png'; }
        elseif (str_starts_with($decoded, "GIF8"))     { $mime = 'gif'; }
        else { $mime = 'jpg'; } // default

        // Enforce 5 MB limit
        if (strlen($decoded) > 5 * 1024 * 1024) err('Image too large (max 5 MB)');

        // Build upload directory path (relative to this file)
        $uploadDir = __DIR__ . '/../uploads/';
        if (!is_dir($uploadDir)) {
            // Try alternate common GoDaddy paths
            $altDir = $_SERVER['DOCUMENT_ROOT'] . '/uploads/';
            $uploadDir = is_dir($altDir) ? $altDir : $uploadDir;
            if (!is_dir($uploadDir)) {
                @mkdir($uploadDir, 0755, true);
            }
        }

        $filename  = $user_type . '_' . $user_id . '_' . time() . '.' . $mime;
        $filepath  = $uploadDir . $filename;
        if (file_put_contents($filepath, $decoded) === false) {
            err('Could not save image. Check server write permissions on uploads/ folder.');
        }

        // Update the image column in the appropriate table
        if ($user_type === 'parent') {
            run("UPDATE parents SET image=? WHERE id=?", [$filename, $user_id]);
        } else {
            run("UPDATE sitters SET image=? WHERE id=?", [$filename, $user_id]);
        }
        ok(['filename' => $filename], 'Photo uploaded successfully');

    // ── UPDATE PARENT PROFILE ──────────────────────────────────
    case 'update_parent_profile':
        $parent_id = (int)($body['parent_id'] ?? 0);
        if (!$parent_id) err('Missing parent_id');
        $allowed = ['fname','lname','phone','address','kids'];
        $sets = []; $vals = [];
        foreach ($allowed as $f) {
            if (isset($body[$f])) { $sets[] = "`{$f}`=?"; $vals[] = $body[$f]; }
        }
        if (empty($sets)) err('Nothing to update');
        $vals[] = $parent_id;
        run("UPDATE parents SET ".implode(',',$sets)." WHERE id=?", $vals);
        $updated = row("SELECT id,fname,lname,phone,address,kids,email,image,stripe_customer_id FROM parents WHERE id=?",[$parent_id]);
        ok($updated, 'Profile updated');

    // ── GET FAVORITE SITTERS (for parent home) ─────────────────
    case 'get_favorites':
        ensureFavoritesTable();
        $parent_id = (int)($body['parent_id'] ?? $_GET['parent_id'] ?? 0);
        if (!$parent_id) err('Missing parent_id');
        $favs = rows("
            SELECT s.id, s.fname, s.lname, s.minrate, s.image, s.about, s.bgcheck,
                   COALESCE(s.avg_rating,0) AS avg_rating,
                   COALESCE(s.review_count,0) AS review_count,
                   u.online, u.latitude, u.longitude,
                   fs.created_at AS saved_at
            FROM favorite_sitters fs
            JOIN sitters s ON s.id = fs.sitter_id
            LEFT JOIN `user` u ON u.u_id = s.id AND u.user_type='sitter'
            WHERE fs.parent_id=?
            ORDER BY fs.created_at DESC
            LIMIT 20", [$parent_id]);
        ok($favs, count($favs) . ' favorite sitter(s)');

    // ── SEND MESSAGE ──────────────────────────────────────────────────────────
    case 'send_message':
        ensureMessagesTable();
        $job_id      = (int)($body['job_id']      ?? 0);
        $sender_type = $body['sender_type'] ?? ''; // 'parent' or 'sitter'
        $sender_id   = (int)($body['sender_id']   ?? 0);
        $message     = trim($body['message']       ?? '');
        if (!$job_id || !$sender_id || !$message || !in_array($sender_type, ['parent','sitter']))
            err('Missing required fields');

        run("INSERT INTO messages (job_id, sender_type, sender_id, message)
             VALUES (?, ?, ?, ?)", [$job_id, $sender_type, $sender_id, $message]);
        $new_id = (int)db()->lastInsertId();

        // Push notify the OTHER party
        // COALESCE: prefer dedicated push_token column, fall back to user.reg_id
        // (reg_id is what older logins stored before the push_token column existed)
        $job = row("SELECT j.parent_id, j.sitter_id,
                           COALESCE(p.push_token, up.reg_id) AS parent_token, p.fname AS pname,
                           COALESCE(s.push_token, us.reg_id) AS sitter_token, s.fname AS sname
                    FROM jobs j
                    LEFT JOIN parents p  ON p.id  = j.parent_id
                    LEFT JOIN sitters s  ON s.id  = j.sitter_id
                    LEFT JOIN `user` up  ON up.u_id = j.parent_id AND up.user_type = 'parent'
                    LEFT JOIN `user` us  ON us.u_id = j.sitter_id AND us.user_type = 'sitter'
                    WHERE j.id = ?", [$job_id]);

        if ($job) {
            if ($sender_type === 'parent' && !empty($job['sitter_token'])) {
                sendExpoPush($job['sitter_token'],
                    "💬 {$job['pname']}",
                    $message,
                    ['type' => 'chat', 'job_id' => $job_id, 'sender_type' => 'parent']
                );
            } elseif ($sender_type === 'sitter' && !empty($job['parent_token'])) {
                sendExpoPush($job['parent_token'],
                    "💬 {$job['sname']}",
                    $message,
                    ['type' => 'chat', 'job_id' => $job_id, 'sender_type' => 'sitter']
                );
            }
        }

        ok(['id' => $new_id, 'created_at' => utcIso(date('Y-m-d H:i:s'))], 'Message sent');

    // ── GET MESSAGES (poll — returns only messages after last_id) ─────────────
    case 'get_messages':
        ensureMessagesTable();
        $job_id  = (int)($body['job_id']  ?? $_GET['job_id']  ?? 0);
        $last_id = (int)($body['last_id'] ?? $_GET['last_id'] ?? 0);
        $viewer_type = $body['viewer_type'] ?? 'parent'; // to mark messages as read
        $viewer_id   = (int)($body['viewer_id'] ?? 0);
        if (!$job_id) err('Missing job_id');

        $msgs = rows("
            SELECT id, sender_type, sender_id, message, created_at, read_at
            FROM messages
            WHERE job_id = ? AND id > ?
            ORDER BY id ASC
            LIMIT 100", [$job_id, $last_id]);

        // Mark incoming messages as read
        if ($viewer_id && $viewer_type) {
            run("UPDATE messages
                 SET read_at = NOW()
                 WHERE job_id = ? AND sender_type != ? AND read_at IS NULL",
                [$job_id, $viewer_type]);
        }

        foreach ($msgs as &$m) {
            $m['created_at'] = utcIso($m['created_at']);
            $m['read_at']    = $m['read_at'] ? utcIso($m['read_at']) : null;
        }

        ok($msgs);

    // ── GET ALL MESSAGES (initial load) ───────────────────────────────────────
    case 'get_all_messages':
        ensureMessagesTable();
        $job_id      = (int)($body['job_id']      ?? $_GET['job_id']      ?? 0);
        $viewer_type = $body['viewer_type'] ?? 'parent';
        $viewer_id   = (int)($body['viewer_id']   ?? 0);
        if (!$job_id) err('Missing job_id');

        $msgs = rows("
            SELECT id, sender_type, sender_id, message, created_at, read_at
            FROM messages
            WHERE job_id = ?
            ORDER BY id ASC
            LIMIT 200", [$job_id]);

        // Mark incoming as read on load
        if ($viewer_id && $viewer_type) {
            run("UPDATE messages
                 SET read_at = NOW()
                 WHERE job_id = ? AND sender_type != ? AND read_at IS NULL",
                [$job_id, $viewer_type]);
        }

        foreach ($msgs as &$m) {
            $m['created_at'] = utcIso($m['created_at']);
            $m['read_at']    = $m['read_at'] ? utcIso($m['read_at']) : null;
        }

        ok($msgs);

    // ── UNREAD MESSAGE COUNT (polled by chat button badge) ───────────────────
    case 'get_unread_count':
        ensureMessagesTable();
        $job_id      = (int)($body['job_id']      ?? $_GET['job_id']      ?? 0);
        $viewer_type = $body['viewer_type'] ?? $_GET['viewer_type'] ?? '';
        if (!$job_id || !$viewer_type) err('Missing job_id or viewer_type');
        $row = row("SELECT COUNT(*) AS cnt FROM messages
                    WHERE job_id=? AND sender_type != ? AND read_at IS NULL",
                   [$job_id, $viewer_type]);
        ok(['unread' => (int)($row['cnt'] ?? 0)]);

    // ── FORGOT PASSWORD — step 1: request reset code ──────────
    // Body: { email, user_type: 'parent'|'sitter' }
    case 'forgot_password':
        $email     = strtolower(trim($body['email'] ?? ''));
        $user_type = $body['user_type'] ?? '';
        if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) err('Please enter a valid email address.');
        if (!in_array($user_type, ['parent','sitter'])) err('Invalid user_type');

        // Ensure password_resets table exists
        db()->exec("CREATE TABLE IF NOT EXISTS password_resets (
            id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            email        VARCHAR(255) NOT NULL,
            user_type    ENUM('parent','sitter') NOT NULL,
            code         CHAR(6) NOT NULL,
            expires_at   DATETIME NOT NULL,
            used         TINYINT(1) DEFAULT 0,
            created_at   DATETIME DEFAULT NOW(),
            INDEX idx_email_type (email, user_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        // Check user exists
        if ($user_type === 'parent') {
            $user = row("SELECT id, fname FROM parents WHERE LOWER(email)=?", [$email]);
        } else {
            $user = row("SELECT id, fname FROM sitters WHERE LOWER(email)=?", [$email]);
        }
        // Always return success even if email not found — prevents email enumeration
        if (!$user) {
            ok([], 'If that email exists, a reset code has been sent.');
        }

        // Generate 6-digit code, expire in 30 minutes
        $code = str_pad((string)random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
        run("DELETE FROM password_resets WHERE email=? AND user_type=?", [$email, $user_type]);
        run("INSERT INTO password_resets (email, user_type, code, expires_at)
             VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))",
            [$email, $user_type, $code]);

        // Send email via PHP mail()
        $fname   = $user['fname'] ?? 'there';
        $subject = 'Your Sitters4Me Password Reset Code';
        $message = "Hi $fname,\r\n\r\n"
            . "Your password reset code is:\r\n\r\n"
            . "    $code\r\n\r\n"
            . "This code expires in 30 minutes.\r\n\r\n"
            . "If you didn't request a password reset, you can safely ignore this email.\r\n\r\n"
            . "— The Sitters4Me Team\r\n"
            . "https://sitters4me.com";
        $headers  = "From: Sitters4Me <noreply@sitters4me.com>\r\n";
        $headers .= "Reply-To: support@sitters4me.com\r\n";
        $headers .= "X-Mailer: PHP/" . phpversion();
        @mail($email, $subject, $message, $headers);

        ok([], 'If that email exists, a reset code has been sent.');

    // ── RESET PASSWORD — step 2: verify code + set new password ─
    // Body: { email, user_type, code, new_password }
    case 'reset_password':
        $email        = strtolower(trim($body['email'] ?? ''));
        $user_type    = $body['user_type'] ?? '';
        $code         = trim($body['code'] ?? '');
        $new_password = $body['new_password'] ?? '';
        if (empty($email) || empty($code) || empty($new_password)) err('Missing required fields.');
        if (!in_array($user_type, ['parent','sitter'])) err('Invalid user_type');
        if (strlen($new_password) < 8) err('Password must be at least 8 characters.');

        // Look up valid, unused code
        $reset = row("SELECT id FROM password_resets
                      WHERE email=? AND user_type=? AND code=?
                        AND used=0 AND expires_at > NOW()
                      ORDER BY created_at DESC LIMIT 1",
                     [$email, $user_type, $code]);
        if (!$reset) err('Invalid or expired code. Please request a new one.');

        // Hash new password (same algorithm as auth.php registration)
        $hash = password_hash($new_password, PASSWORD_DEFAULT);

        if ($user_type === 'parent') {
            $updated = run("UPDATE parents SET password=? WHERE LOWER(email)=?", [$hash, $email]);
        } else {
            $updated = run("UPDATE sitters SET password=? WHERE LOWER(email)=?", [$hash, $email]);
        }
        if ($updated->rowCount() === 0) err('Account not found.');

        // Mark code as used
        run("UPDATE password_resets SET used=1 WHERE id=?", [$reset['id']]);
        ok([], 'Password reset successfully. You can now log in with your new password.');

    default:
        err('Unknown action: ' . $action);
}

} catch (Exception $e) {
    err('Server error: ' . $e->getMessage());
}
