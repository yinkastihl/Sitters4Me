import fs from 'node:fs/promises';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';

const base = process.cwd();
const out = `${base}/Deliverables`;
const source = await fs.readFile(`${base}/work/requirements_extracted.txt`, 'utf8');
const lines = source.split(/\r?\n/);
const reqs = [];
for (const line of lines) {
  const m = line.match(/^([A-Z]{2,3}-\d{2}) \| ([^|]+) \| (.+)$/);
  if (m) reqs.push({ id: m[1], title: m[2].trim(), detail: m[3].trim() });
}
const navy = '#17365D', blue = '#2F75B5', pale = '#EAF2F8', gray = '#F2F2F2';

function family(id) {
  const p=id.split('-')[0];
  return ({W:'Welcome & session',PL:'Parent login',PR:'Parent registration',PH:'Parent home & scheduling',JA:'Parent active job',PHI:'Parent history',PPE:'Parent profile',PPS:'Payment settings',PF:'Favorites',CP:'Child profiles',SL:'Sitter login',SR:'Sitter registration',SP:'Sitter pending',SH:'Sitter home',AJ:'Sitter active job',CH:'Chat',SPE:'Sitter profile',SA:'Availability',SB:'Bank setup',SE:'Earnings',SBR:'Browse sitters',SPV:'Sitter profile view',RF:'Referral',PW:'Password reset',DJ:'Live dispatch',DS:'Scheduled dispatch',PAY:'Payments',PN:'Push notifications',AD:'Admin dashboard',AS:'Admin sitter management',AP:'Admin parent management',APO:'Admin payouts',SEC:'Security'})[p] || p;
}
function priority(id) { return ['DJ','PAY','SEC','PN','JA','AJ'].includes(id.split('-')[0]) ? 'P0' : ['PH','SH','DS','PL','SL','CH','AD','AS','AP','APO'].includes(id.split('-')[0]) ? 'P1' : 'P2'; }
function tcFor(r, index) {
  const n=String(index+1).padStart(3,'0');
  return [`TC-${r.id}-${n}`,r.id,family(r.id),`Verify ${r.title}`,`Appropriate authenticated test account and seeded data are available.`, `1. Open the ${family(r.id)} feature.\n2. Establish the stated precondition.\n3. Perform the action described by the requirement.\n4. Observe UI, API response, persistence, and role isolation.`,r.detail,priority(r.id),'Functional','Yes','Not Executed','Baseline requirement test'];
}
const extra = [
 ['TC-RISK-001','NFR-001','Authentication','Reject malformed/blank/whitespace credentials','Unauthenticated user','1. Submit blank, malformed, and whitespace-padded login values.','Safe validation; no account information leakage; no request accepted.','P0','Negative/Security','Yes','Not Executed',''],
 ['TC-RISK-002','NFR-002','Authentication','Rate-limit repeated failed logins','Test account available','1. Submit repeated invalid passwords.\n2. Attempt valid login afterwards.','Configured throttle/lockout policy is enforced and logged without permanent denial of legitimate access.','P0','Security','Yes','Not Executed','Requirement gap'],
 ['TC-RISK-003','NFR-003','Authorization','Prevent parent IDOR on job and payment data','Two parent accounts with separate jobs','1. Authenticate as Parent A.\n2. Modify request identifiers to Parent B records.','Server denies access; no Parent B data or action is exposed.','P0','Security','Yes','Not Executed',''],
 ['TC-RISK-004','NFR-004','Dispatch','Resolve cancel-versus-accept race atomically','One parent, two sitters, dispatch test data','1. Start dispatch.\n2. Cancel as the first sitter accepts simultaneously.','Exactly one terminal outcome; no active job, duplicate notification, or charge is created incorrectly.','P0','Concurrency','Yes','Not Executed',''],
 ['TC-RISK-005','NFR-005','Dispatch','Prevent duplicate live requests','Parent with payment method','1. Tap request repeatedly or replay request.','One job/queue is created; duplicate submissions are idempotently rejected.','P0','Concurrency','Yes','Not Executed',''],
 ['TC-RISK-006','NFR-006','Payments','Prevent duplicate end-job charge','Active job in Stripe test mode','1. Trigger end job twice or retry after timeout.','Only one charge/capture and one earnings credit exist; reconciliation data is retained.','P0','Payments','Yes','Not Executed',''],
 ['TC-RISK-007','NFR-007','Payments','Handle declined card at job end','Active job; Stripe decline card','1. End job using a decline simulation.','Clear recovery state; no silent completion, duplicate charge, or incorrect payout.','P0','Payments','Yes','Not Executed','Requirement gap'],
 ['TC-RISK-008','NFR-008','Location','Handle denied or stale location permission','Device location disabled','1. Deny permission.\n2. Start map/search and go online as sitter.','Usable fallback/error; request does not use misleading location; user is informed.','P1','Reliability','No','Not Executed','Requirement gap'],
 ['TC-RISK-009','NFR-009','Scheduling','Book across midnight/DST boundary','Clock controllable','1. Schedule appointment crossing midnight and DST transition.','Correct local date/time, eligibility, notification, and duration calculation.','P1','Boundary','Yes','Not Executed',''],
 ['TC-RISK-010','NFR-010','Chat','Recover messages after offline period','Active job; disconnect connectivity','1. Send/offline/reconnect from both roles.','Messages appear once, ordered correctly, with accurate unread status.','P1','Reliability','Yes','Not Executed',''],
 ['TC-RISK-011','NFR-011','Notifications','Handle foreground/background/terminated notification routing','Physical test devices','1. Send each notification type in each app state.','Correct delivery, deduplication, and route; failure is observable.','P0','Integration','No','Not Executed',''],
 ['TC-RISK-012','NFR-012','Admin','Block direct admin API/action access without valid session','Browser/API client','1. Open admin action URLs without/with expired session.','Redirect or 401/403; no data/action exposure.','P0','Security','Yes','Not Executed',''],
 ['TC-RISK-013','NFR-013','Accessibility','Support screen reader and text scaling','iOS/Android accessibility tools','1. Enable screen reader and largest text size.','Controls have meaningful labels, logical focus order, and no clipping.','P1','Accessibility','No','Not Executed','Requirement gap'],
 ['TC-RISK-014','NFR-014','Resilience','Restore safely after app force-quit during active job','Active job','1. Force-close/reopen on both user roles.','Correct active job restored, no duplicate status/API operation, and unread state consistent.','P0','Recovery','No','Not Executed',''],
 ['TC-RISK-015','NFR-015','Security','Reject XSS/SQL-like payloads in mutable fields and chat','Test accounts','1. Submit payloads in text inputs.\n2. View result via app/admin.','Input stored/rendered safely; no script execution, SQL error, or corrupted UI.','P0','Security','Yes','Not Executed',''],
];

function styleSheet(sheet, title, headers, widths) {
  sheet.showGridLines = false;
  sheet.getRange(`A1:${String.fromCharCode(64+headers.length)}1`).merge();
  const t=sheet.getRange('A1'); t.values=[[title]]; t.format={fill:navy,font:{bold:true,color:'#FFFFFF',size:16},horizontalAlignment:'left',verticalAlignment:'center'}; t.format.rowHeight=28;
  sheet.getRange(`A3:${String.fromCharCode(64+headers.length)}3`).values=[headers];
  sheet.getRange(`A3:${String.fromCharCode(64+headers.length)}3`).format={fill:blue,font:{bold:true,color:'#FFFFFF'},wrapText:true,horizontalAlignment:'center',verticalAlignment:'center',borders:{preset:'all',style:'thin',color:'#B4C7E7'}};
  sheet.getRange(`A3:${String.fromCharCode(64+headers.length)}3`).format.rowHeight=32;
  widths.forEach((w,i)=>sheet.getRangeByIndexes(0,i,1,1).format.columnWidth=w);
  sheet.freezePanes.freezeRows(3);
}
async function save(book,path){const f=await SpreadsheetFile.exportXlsx(book); await f.save(path)}

// RTM
{ const wb=Workbook.create(); const s=wb.worksheets.add('RTM'); const headers=['Requirement ID','Module','Requirement','Mapped Test Case','Priority','Coverage','Execution Status','Notes']; styleSheet(s,'Sitters4Me Requirements Traceability Matrix',headers,[16,24,56,20,10,13,16,32]); const rows=reqs.map((r,i)=>[r.id,family(r.id),`${r.title}: ${r.detail}`,`TC-${r.id}-${String(i+1).padStart(3,'0')}`,priority(r.id),'Planned','Not Executed','Baseline mapping']); s.getRange(`A4:H${rows.length+3}`).values=rows; s.getRange(`A4:H${rows.length+3}`).format={wrapText:true,verticalAlignment:'top',borders:{preset:'all',style:'thin',color:'#D9E2F3'}}; s.getRange(`A4:H${rows.length+3}`).format.rowHeight=42; await save(wb,`${out}/02_RTM/Sitters4Me_Requirements_Traceability_Matrix_v1.0.xlsx`); }

// Test suite
{ const wb=Workbook.create(); const s=wb.worksheets.add('Test Cases'); const headers=['Test Case ID','Requirement','Module','Objective','Preconditions','Steps','Expected Result','Priority','Test Type','Automation','Status','Notes']; styleSheet(s,'Sitters4Me Detailed Test Case Suite',headers,[18,14,23,35,32,50,50,10,18,13,14,22]); const rows=[...reqs.map(tcFor),...extra]; s.getRange(`A4:L${rows.length+3}`).values=rows; s.getRange(`A4:L${rows.length+3}`).format={wrapText:true,verticalAlignment:'top',borders:{preset:'all',style:'thin',color:'#D9E2F3'}}; s.getRange(`A4:L${rows.length+3}`).format.rowHeight=68; s.getRange(`H4:H${rows.length+3}`).conditionalFormats.add('containsText',{text:'P0',format:{fill:'#F4CCCC',font:{bold:true,color:'#9C0006'}}}); await save(wb,`${out}/04_Test_Cases/Sitters4Me_Detailed_Test_Cases_v1.0.xlsx`); }

// Test data
{ const wb=Workbook.create(); const s=wb.worksheets.add('Test Data'); const headers=['Data ID','Category','Purpose','Example / Setup','Sensitivity','Reset Needed','Owner','Status']; styleSheet(s,'Sitters4Me Test Data Matrix',headers,[16,20,36,62,15,16,18,16]); const rows=[['TD-P-01','Parent','Valid parent with card','parent.valid@example.test; Stripe test card; Houston address','Synthetic','Yes','QA','Planned'],['TD-P-02','Parent','Suspended parent','parent.suspended@example.test; is_active=suspended','Synthetic','Yes','QA','Planned'],['TD-S-01','Sitter','Online eligible sitter','sitter.online@example.test; active; online; coordinates within 2 miles','Synthetic','Yes','QA','Planned'],['TD-S-02','Sitter','Pending sitter','sitter.pending@example.test; status=pending','Synthetic','Yes','QA','Planned'],['TD-S-03','Sitter','Suspended sitter','sitter.suspended@example.test; is_active=suspended','Synthetic','Yes','QA','Planned'],['TD-A-01','Admin','Authorized admin','Dedicated non-production administrator with resettable password','Restricted','Yes','QA','Planned'],['TD-J-01','Job','Active live job','One accepted job in each lifecycle state','Synthetic','Yes','QA','Planned'],['TD-J-02','Job','Scheduled job','Future job at T+30 minutes with preferred and fallback sitter variants','Synthetic','Yes','QA','Planned'],['TD-PAY-01','Payment','Stripe success card','Stripe test card for successful payment','Synthetic','Yes','QA','Planned'],['TD-PAY-02','Payment','Stripe decline card','Stripe test card configured to decline','Synthetic','Yes','QA','Planned'],['TD-LOC-01','Location','Coordinates','Houston baseline plus stale/denied/edge-radius locations','Synthetic','Yes','QA','Planned']]; s.getRange(`A4:H${rows.length+3}`).values=rows; s.getRange(`A4:H${rows.length+3}`).format={wrapText:true,verticalAlignment:'top',borders:{preset:'all',style:'thin',color:'#D9E2F3'}}; s.getRange(`A4:H${rows.length+3}`).format.rowHeight=46; await save(wb,`${out}/05_Test_Data/Sitters4Me_Test_Data_Matrix_v1.0.xlsx`); }

// Execution and defects
for (const [folder,file,title,headers,rows] of [
 ['06_Test_Execution','Sitters4Me_Test_Execution_Report_v1.0.xlsx','Sitters4Me Test Execution Report',['Run ID','Test Case ID','Environment','Build','Executor','Execution Date','Status','Actual Result','Evidence','Defect ID'],[['RUN-001','All planned cases','Not supplied','Not supplied','IV&V','2026-07-27','Blocked','Execution blocked pending test environment, credentials, devices, and non-production external-service configuration.','N/A','N/A']]],
 ['07_Defects','Sitters4Me_Defect_Log_v1.0.xlsx','Sitters4Me Defect and Observation Log',['Defect ID','Source','Summary','Severity','Priority','Status','Evidence','Recommendation'],[['OBS-001','Static lint','Lint reports 21 errors and 69 warnings in supplied snapshot.','High','P0','Open','npm run lint, 2026-07-27','Resolve errors before release candidate; triage warnings.'],['OBS-002','Static lint','Session restore source references a FileSystem API reported unavailable by lint.','High','P0','Open','app/index.tsx lint result','Validate and remediate against Expo SDK 54; verify cold restore on devices.'],['OBS-003','Source scope','Authentication backend referenced by requirements is not in supplied snapshot.','Medium','P1','Open','Source inventory','Provide backend baseline and API contract for IV&V.']]]
]) { const wb=Workbook.create(); const s=wb.worksheets.add(title.includes('Defect')?'Defects':'Execution'); styleSheet(s,title,headers,[16,20,22,18,14,16,16,60,24,16]); s.getRange(`A4:${String.fromCharCode(64+headers.length)}${rows.length+3}`).values=rows; s.getRange(`A4:${String.fromCharCode(64+headers.length)}${rows.length+3}`).format={wrapText:true,verticalAlignment:'top',borders:{preset:'all',style:'thin',color:'#D9E2F3'}}; s.getRange(`A4:${String.fromCharCode(64+headers.length)}${rows.length+3}`).format.rowHeight=60; await save(wb,`${out}/${folder}/${file}`); }
