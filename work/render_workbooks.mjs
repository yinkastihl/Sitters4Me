import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const jobs = [
  ['Deliverables/02_RTM/Sitters4Me_Requirements_Traceability_Matrix_v1.0.xlsx','RTM'],
  ['Deliverables/04_Test_Cases/Sitters4Me_Detailed_Test_Cases_v1.0.xlsx','Test Cases'],
  ['Deliverables/05_Test_Data/Sitters4Me_Test_Data_Matrix_v1.0.xlsx','Test Data'],
  ['Deliverables/06_Test_Execution/Sitters4Me_Test_Execution_Report_v1.0.xlsx','Execution'],
  ['Deliverables/07_Defects/Sitters4Me_Defect_Log_v1.0.xlsx','Defects'],
];
await fs.mkdir('work/render/xlsx', {recursive:true});
for (const [path, sheetName] of jobs) {
  const blob = await FileBlob.load(path);
  const wb = await SpreadsheetFile.importXlsx(blob);
  const preview = await wb.render({sheetName, range:'A1:L16', scale:1, format:'png'});
  await fs.writeFile(`work/render/xlsx/${sheetName.replaceAll(' ','_')}.png`,new Uint8Array(await preview.arrayBuffer()));
  const errors = await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A',options:{useRegex:true,maxResults:30},summary:`formula scan ${sheetName}`});
  console.log(sheetName, errors.ndjson);
}
