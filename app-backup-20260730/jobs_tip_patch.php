    // ── SAVE TIP (parent tips sitter after job — no Stripe, stored in jobs table) ──
    case 'save_tip':
        $job_id    = (int)($body['job_id']    ?? 0);
        $parent_id = (int)($body['parent_id'] ?? 0);
        $tip_amount= round((float)($body['tip_amount'] ?? 0), 2);
        if (!$job_id || !$parent_id) err('Missing fields');
        if ($tip_amount < 1)   err('Minimum tip is $1');
        if ($tip_amount > 200) err('Maximum tip is $200');
        // Verify job belongs to this parent
        $job = row("SELECT id, sitter_id FROM jobs WHERE id=? AND parent_id=?", [$job_id, $parent_id]);
        if (!$job) err('Job not found');
        // Store tip on the job row
        run("UPDATE jobs SET tip_amount=? WHERE id=?", [$tip_amount, $job_id]);
        // Notify sitter
        $sitterUser = row("SELECT u.reg_id, s.fname FROM `user` u
                           INNER JOIN sitters s ON s.id=u.u_id
                           WHERE u.u_id=? AND u.user_type='sitter'", [$job['sitter_id']]);
        if ($sitterUser && !empty($sitterUser['reg_id'])) {
            sendExpoPush($sitterUser['reg_id'],
                "💝 You received a \${$tip_amount} tip!",
                "A parent added a tip for your great work. Thank you!",
                ['type'=>'tip_received','amount'=>$tip_amount,'job_id'=>$job_id]);
        }
        ok(['tip_amount' => $tip_amount], "Tip of \${$tip_amount} saved successfully!");
