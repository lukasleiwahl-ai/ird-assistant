/**
 * MINIBAR DAILY OPERATION — independent Google Apps Script backend
 * v1.1.0: two-way source synchronization. Formula cells are read-only; writes go
 * only to ROOM STATUS quantity inputs and product-sheet IN/OUT ledger inputs.
 */
const MDO_VERSION = '1.3.5';
const MDO_DISCONTINUED = ['MB-Aqua Reflection Still 380 ml'];
const MDO_CATEGORY_MAP = {
  'mb-a&w sarsaparilla 250ml':'Rootbeer',
  'mb-aqua reflection sparkling 380 ml':'Sparkling Mineral Water',
  'mb-banfi col di sasso red wine 375 ml':'House Bottle of Red Wine',
  'mb-banfi le rime white wine 375 ml':'House Bottle of White Wine',
  'mb-blue diamond almond 130 gr':'Almond Nuts',
  'mb-cadbury chocolate milk bar 25 gr':'Chocolate Bar',
  'mb-coca cola 330 ml':'Coca Cola',
  'mb-coca cola zero 330 ml':'Coca Cola Light',
  'mb-coca cola zero 330 ml ':'Coca Cola Light',
  'mb-ird fanta soda water 250 ml':'Soda Water',
  'mb-ird red bull energy drink 250 ml':'Red Bull',
  'mb-ird schweppes tonic water 250 ml':'Tonic Water',
  'mb-ird sprite 250 ml':'Sprite',
  'mb-ird-bintang beer 330 ml':'Local Beer',
  'mb-ird-coca cola 250 ml':'Coca Cola',
  'mb-ird-coke zero':'Coca Cola Light',
  'mb-ird-heineken beer 330 ml':'Imported Beer',
  'mb-laurent perrier sparkling wine 375 ml':'House Bottle of Champagne',
  'mb-le fruit apple juice 250 ml':'Apple Juice',
  'mb-le fruit orange juice 250 ml':'Orange Juice',
  'mb-local nuts yava roasted cashew 35 gr':'Cashew',
  'mb-local nuts yava sweet and spicy 35 gr':'Local Nuts',
  'mb-marques de caceres blanco joven (375ml) – vintage 2023':'House Bottle of White Wine',
  'mb-marques de caceres tinto crianza (375ml) – vintage 2020':'House Bottle of Red Wine',
  'mb-moet & chandon 200 ml':'House Bottle of Champagne',
  'mb-chocolate monggo 40 gr':'Chocolate Bar',
  'mb-pringles potato chips 42 gr':'Potato Chips',
  'mb-rauch apple juice 200 ml':'Apple Juice',
  'mb-rauch orange juice 200 ml':'Orange Juice',
  'mb-ricola candy':'Candy',
  'mb-soy joy energy bar 30 gr':'Energy Bar',
  'mb-ird sprite 330 ml':'Sprite',
  'mb-taittinger sparkling wine 375 ml':'House Bottle of Champagne',
  'mb- tong garden almond 140 gr':'Almond Nuts',
  "mb-wafer loacker's quadratini":'Wafer',
  'mb-wonderful pistachio120 gr':'Pistachio'
};
const MDO_HEADERS = {
  catalog:['SKU','Item','Category','Active','Source Header','Mapping Note','Created By','Created At','Updated At'],
  rooms:['Room No','Floor','SKU','Item','Category','Qty','Updated By','Updated At'],
  store:['SKU','Item','Category','Qty','Stock Status','Updated At'],
  outlets:['Outlet ID','Outlet Name','Location','Status','Notes','Created By','Created At','Updated At'],
  outletStock:['Outlet ID','SKU','Item','Category','Qty','Updated At'],
  roomTx:['Transaction ID','Timestamp','Type','Room No','SKU','Item','Qty','Notes','Evidence URL','Created By','Reference','Idempotency Key'],
  storeTx:['Transaction ID','Timestamp','Type','SKU','Item','Qty In','Qty Out','Balance After','Room / Outlet','Notes','Created By','Reference','Idempotency Key'],
  history:['Timestamp','Transaction ID','Module','Action','Room / Outlet','Item','Qty','Notes','Evidence URL','Created By','Reference'],
  sold:['Transaction ID','Timestamp','Room No','SKU','Item','Qty','Selling Price','Total','Notes','Evidence URL','Created By','Reference'],
  loss:['Transaction ID','Timestamp','Room No','SKU','Item','Qty','Loss Type','Notes','Evidence URL','Created By','Reference'],
  transfers:['Transfer ID','Timestamp','From Outlet','To Outlet','SKU','Item','Qty','Notes','Created By','Status','Idempotency Key'],
  changes:['Revision','Type','Key','Created At'],
  roomLocks:['Room No','Locked','Updated By','Updated At']
};
function doGet(){return json_({ok:true,app:'Minibar Daily Operation',version:MDO_VERSION});}
function authorizeMdo(){DriveApp.getRootFolder().getName();return 'Drive access authorized for optional evidence photos.';}
function doPost(e){
  let p={};
  try{p=JSON.parse((e&&e.postData&&e.postData.contents)||'{}');const action=String(p.action||'bootstrap');
    if(action==='revision')return json_({ok:true,revision:PropertiesService.getScriptProperties().getProperty('MDO_REVISION')||'0'});
    const ss=SpreadsheetApp.openById(String(p.spreadsheetId||''));
    if(action==='health'){const props=PropertiesService.getScriptProperties();return json_({ok:true,version:MDO_VERSION,spreadsheet:ss.getName(),spreadsheetId:ss.getId(),timezone:ss.getSpreadsheetTimeZone(),timestamp:now_(),revision:props.getProperty('MDO_REVISION')||'0',editTriggerInstalled:props.getProperty('MDO_EDIT_TRIGGER_INSTALLED')==='true',sourceSyncStatus:props.getProperty('MDO_SOURCE_SYNC_STATUS')||'PENDING',monthlyAdapterReady:props.getProperty('MDO_MONTHLY_SCHEMA_V1_3_5_READY')==='true'});}
    if(action==='monthlyDiagnostics')return json_(monthlyDiagnostics_(ss));
    if(action==='delta')return json_(delta_(ss,p));
    if(action==='bootstrap'||action==='list')return json_(bootstrap_(ss));
    if(action==='roomTransaction')return json_(roomTransaction_(ss,p));
    if(action==='roomLock')return json_(roomLock_(ss,p));
    if(action==='catalogAdd')return json_(catalogAdd_(ss,p));
    if(action==='catalogArchive')return json_(catalogArchive_(ss,p));
    if(action==='outletAdd')return json_(outletAdd_(ss,p));
    if(action==='outletArchive')return json_(outletArchive_(ss,p));
    if(action==='transfer')return json_(transfer_(ss,p));
    if(action==='storeAdjustment')return json_(storeAdjustment_(ss,p));
    if(action==='history')return json_(history_(ss,p));
    if(action==='reconcileStock')return json_(reconcileStock_(ss,p));
    throw new Error('Unknown action: '+action);
  }catch(err){return json_({ok:false,error:String(err&&err.message||err)});}
}
function json_(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);}
function norm_(s){return String(s||'').toLowerCase().replace(/\u00a0/g,' ').replace(/[–—]/g,'-').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');}
function n_(v){if(v===null||v===''||v===undefined)return null;if(typeof v==='number')return isFinite(v)?v:null;const s=String(v).trim();if(!s||s[0]==='#')return null;const x=Number(s.replace(/,/g,''));return isFinite(x)?x:null;}
function now_(){return new Date();}
function id_(prefix){return prefix+'-'+Utilities.getUuid().slice(0,8).toUpperCase();}
function ensureSheet_(ss,key){let sh=ss.getSheetByName('MDO_'+key);if(!sh){sh=ss.insertSheet('MDO_'+key);sh.getRange(1,1,1,MDO_HEADERS[key].length).setValues([MDO_HEADERS[key]]);sh.setFrozenRows(1);sh.getRange(1,1,1,MDO_HEADERS[key].length).setFontWeight('bold').setBackground('#10263d').setFontColor('#ffffff');}return sh;}
function ensureRows_(sh,required){if(sh.getMaxRows()<required)sh.insertRowsAfter(sh.getMaxRows(),required-sh.getMaxRows());}
function setup_(ss){
  const sourceStore=ss.getSheetByName('STORE'),sourceRooms=ss.getSheetByName('ROOM STATUS');
  if(!sourceStore||!sourceRooms)throw new Error('Source spreadsheet must contain the existing STORE and ROOM STATUS tabs. No source data has been changed.');
  Object.keys(MDO_HEADERS).forEach(k=>ensureSheet_(ss,k));
  const cat=ss.getSheetByName('MDO_catalog'),rooms=ss.getSheetByName('MDO_rooms'),store=ss.getSheetByName('MDO_store');
  if(cat.getLastRow()===1){
    const src=sourceStore.getDataRange().getDisplayValues(),roomHeaders=sourceRooms.getRange(1,1,1,sourceRooms.getLastColumn()).getDisplayValues()[0];
    const rows=[];let seq=1;
    for(let i=3;i<src.length;i++){const item=String(src[i][0]||'').trim();if(!item||MDO_DISCONTINUED.some(x=>norm_(x)===norm_(item)))continue;const category=categoryFor_(item);const match=roomHeaders.find(h=>norm_(h)===norm_(item))||roomHeaders.find(h=>norm_(h).replace(/^mb /,'')===norm_(item).replace(/^mb /,''))||'';const note=!category?'CATEGORY MAPPING REQUIRED':(norm_(item)==='mb ird coke zero'?'SKU SIZE NEEDS CONFIRMATION; kept as separate SKU':'');rows.push(['SKU-'+String(seq++).padStart(3,'0'),item,category,true,match,note,'System',now_(),now_()]);}
    if(rows.length)cat.getRange(2,1,rows.length,MDO_HEADERS.catalog.length).setValues(rows);
  }
  if(store.getLastRow()===1){
    const c=cat.getDataRange().getValues(),src=sourceStore.getDataRange().getDisplayValues(),idx={};for(let i=3;i<src.length;i++)idx[norm_(src[i][0])]=src[i];
    const rows=c.slice(1).filter(r=>r[0]).map(r=>{const sr=idx[norm_(r[1])]||[];const q=n_(sr[5]);return [r[0],r[1],r[2],q,q===null?'REVIEW_REQUIRED':'OK',now_()];});
    if(rows.length)store.getRange(2,1,rows.length,MDO_HEADERS.store.length).setValues(rows);
  }
  if(rooms.getLastRow()===1){
    const src=sourceRooms.getDataRange().getValues(),headers=src[0],catRows=cat.getDataRange().getValues().slice(1),rows=[];
    for(let i=1;i<src.length;i++){const room=src[i][0];const roomNum=Number(room);if(room===null||room===''||!isFinite(roomNum)||roomNum<=0)continue;const floor=Math.floor(roomNum/100);for(const c of catRows){const h=String(c[4]||'');if(!h)continue;const col=headers.findIndex(x=>norm_(x)===norm_(h));if(col<1)continue;const q=n_(src[i][col]);rows.push([String(roomNum),floor,c[0],c[1],c[2],q===null?0:q,'Source Import',now_()]);}}
    if(rows.length){const CH=5000;ensureRows_(rooms,rows.length+1);for(let i=0;i<rows.length;i+=CH)rooms.getRange(i+2,1,Math.min(CH,rows.length-i),MDO_HEADERS.rooms.length).setValues(rows.slice(i,i+CH));}
  }
  const sourceSync=initialSourceReconcile_(ss);
  return {ok:true,sourceSync};
}
/**
 * One-time v1.1 migration. A full source-to-MDO reconciliation is safe only if
 * no MDO operational transactions exist yet. If transactions already exist,
 * preserve them and require a human reconciliation instead of overwriting stock.
 */
function initialSourceReconcile_(ss){
  const props=PropertiesService.getScriptProperties();
  if(props.getProperty('MDO_SOURCE_SYNC_V110_READY')==='true')return {status:props.getProperty('MDO_SOURCE_SYNC_STATUS')||'SYNCED',alreadyRun:true};
  const priorHistory=rows_(ss,'history');
  const hasOperationalHistory=priorHistory.some(r=>['ROOM','STORE','TRANSFER'].includes(String(r[2]).toUpperCase()));
  const hasTransactions=rows_(ss,'roomTx').length>0||rows_(ss,'storeTx').length>0||rows_(ss,'transfers').length>0||hasOperationalHistory;
  if(hasTransactions){
    props.setProperty('MDO_SOURCE_SYNC_STATUS','REVIEW_REQUIRED');
    props.setProperty('MDO_SOURCE_SYNC_REASON','EXISTING_TRANSACTIONS');
    props.setProperty('MDO_SOURCE_SYNC_V110_READY','true');
    return {status:'REVIEW_REQUIRED',message:'Existing MDO transactions found. Automatic initial reconciliation was skipped to protect operational history.'};
  }
  const roomResult=syncAllRoomStatusToMdo_(ss);
  const storeResult=syncAllStoreBalancesToMdo_(ss);
  const needsReview=roomResult.skipped>0||storeResult.reviewRequired>0;
  const finalStatus=needsReview?'REVIEW_REQUIRED':'SYNCED';
  props.setProperty('MDO_SOURCE_SYNC_STATUS',finalStatus);
  props.setProperty('MDO_SOURCE_SYNC_REASON',roomResult.skipped>0?'ROOM_VALUES':(storeResult.reviewRequired>0?'STORE_VALUES':''));
  props.setProperty('MDO_SOURCE_SYNC_V110_READY','true');
  appendHistory_(ss,id_('SYNC'),'SYSTEM','INITIAL_SOURCE_SYNC','ROOM STATUS + STORE','Source snapshot',roomResult.updated+storeResult.updated,'Initial source reconciliation completed; formula cells were read only. '+(needsReview?'Some unmapped or invalid source values require review.':'All mapped source balances reconciled.'),'', 'System','');
  return {status:finalStatus,roomsUpdated:roomResult.updated,roomValuesSkipped:roomResult.skipped,storeUpdated:storeResult.updated,storeReviewRequired:storeResult.reviewRequired};
}
function syncAllRoomStatusToMdo_(ss){
  const src=ss.getSheetByName('ROOM STATUS');
  const rooms=ss.getSheetByName('MDO_rooms');
  const cat=rows_(ss,'catalog').filter(r=>truth_(r[3]));
  if(!src||!rooms||src.getLastRow()<2||rooms.getLastRow()<2)return {updated:0,skipped:0};
  const source=src.getDataRange().getValues();
  const headers=source[0].map(v=>String(v||''));
  const colBySku={};
  cat.forEach(c=>{let h=String(c[4]||'');let col=h?headers.findIndex(x=>norm_(x)===norm_(h)):-1;if(col<1){const target=norm_(c[1]);col=headers.findIndex(x=>norm_(x)===target);}if(col>0)colBySku[String(c[0])]=col;});
  const mdo=rooms.getDataRange().getValues();
  const sourceRowByRoom={};
  for(let i=1;i<source.length;i++){const room=String(source[i][0]||'').trim();if(room)sourceRowByRoom[room]=source[i];}
  let updated=0,skipped=0;const stamp=now_();
  for(let i=1;i<mdo.length;i++){
    const room=String(mdo[i][0]),sku=String(mdo[i][2]),row=sourceRowByRoom[room],col=colBySku[sku];
    if(!row||col===undefined){skipped++;continue;}
    const raw=row[col],q=n_(raw);
    if(q===null&&String(raw||'').trim()!==''){skipped++;continue;}
    mdo[i][5]=q===null?0:q;mdo[i][6]='Google Sheets v1.1 sync';mdo[i][7]=stamp;updated++;
  }
  if(mdo.length>1){const out=mdo.slice(1).map(r=>[r[5],r[6],r[7]]);rooms.getRange(2,6,out.length,3).setValues(out);}
  return {updated,skipped};
}
function monthlyMonthTitle_(date, timezone){
  return Utilities.formatDate(date, timezone || 'Asia/Jakarta', 'MMMM yyyy').toUpperCase();
}
function monthlyMonthKey_(date, timezone){
  return Utilities.formatDate(date, timezone || 'Asia/Jakarta', 'yyyy-MM');
}
function monthKeyFromTitle_(title){
  const names=['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
  const m=String(title||'').trim().toUpperCase().match(/^([A-Z]+)\s+(\d{4})$/);
  if(!m)return '';
  const ix=names.indexOf(m[1]);
  return ix<0?'':m[2]+'-'+String(ix+1).padStart(2,'0');
}
function monthlyIndexSheet_(ss){
  const sh=ss.getSheetByName('MONTHLY BIN CARD INDEX');
  if(!sh)throw new Error('MONTHLY BIN CARD INDEX was not found. Upload the supplied Monthly Bin Card workbook first.');
  return sh;
}
function monthlyIndexRows_(ss){
  const sh=monthlyIndexSheet_(ss),last=sh.getLastRow();
  if(last<5)return [];
  return sh.getRange(5,1,last-4,6).getDisplayValues().map((r,i)=>({row:i+5,no:r[0],item:r[1],sheetName:r[2],sku:r[3],migrated:r[4],status:r[5]})).filter(x=>x.item||x.sku||x.sheetName);
}
function monthlyMappingBySku_(ss,sku){
  const key=String(sku||'').trim();
  const ix=monthlyIndexRows_(ss).find(x=>String(x.sku||'').trim()===key && String(x.sheetName||'').trim());
  if(!ix)return null;
  const sh=ss.getSheetByName(String(ix.sheetName).trim());
  if(!sh)return {sku:key,item:ix.item,sheetName:ix.sheetName,unmapped:true,reason:'Mapped Monthly Bin Card sheet is missing.'};
  const cat=ss.getSheetByName('MDO_catalog'),cr=findRow_(cat,1,key);
  return {sku:key,item:cr?String(cat.getRange(cr,2).getValue()||ix.item):ix.item,sheetName:sh.getName(),sheet:sh,indexRow:ix.row,status:ix.status};
}
function monthlyMappingBySheet_(ss,sheetName){
  return monthlyIndexRows_(ss).find(x=>String(x.sheetName||'').trim()===String(sheetName||'').trim() && String(x.sku||'').trim()) || null;
}
function monthlyBlocks_(sh){
  const last=Math.max(sh.getLastRow(),1),col=sh.getRange(1,1,last,1).getDisplayValues().flat(),starts=[];
  for(let i=0;i<col.length;i++){
    const key=monthKeyFromTitle_(col[i]);
    if(key)starts.push({startRow:i+1,key,title:String(col[i]).trim()});
  }
  return starts.map((b,i)=>({
    ...b,
    headerRow:b.startRow+1,
    dataStart:b.startRow+2,
    summaryRow:i<starts.length-1?starts[i+1].startRow-1:sh.getLastRow(),
    dataEnd:(i<starts.length-1?starts[i+1].startRow-1:sh.getLastRow())-1
  })).filter(b=>b.summaryRow>=b.dataStart);
}
function monthlyFindFreeRow_(sh,block){
  const n=block.dataEnd-block.dataStart+1;
  if(n<=0)return null;
  const values=sh.getRange(block.dataStart,2,n,6).getValues(); // B:G; C contains opening formula.
  for(let i=0;i<values.length;i++){
    const r=values[i];
    const used=[r[0],r[2],r[3],r[4],r[5]].some(v=>v!==''&&v!==null&&v!==undefined);
    if(!used)return block.dataStart+i;
  }
  return null;
}
function refreshMonthlySheetFormulas_(sh){
  let blocks=monthlyBlocks_(sh);
  if(!blocks.length)throw new Error('No monthly sections found in '+sh.getName()+'.');
  for(let bi=0;bi<blocks.length;bi++){
    const b=blocks[bi],prev=bi>0?blocks[bi-1]:null;
    const rows=b.dataEnd-b.dataStart+1;
    if(rows<1)throw new Error('Monthly section '+b.title+' has no transaction rows.');
    // Keep the first-ever opening snapshot in the first section. All later months roll forward.
    if(prev)sh.getRange(b.dataStart,3).setFormula('=H'+prev.summaryRow);
    if(rows>1){
      const formulas=[];
      for(let r=b.dataStart+1;r<=b.dataEnd;r++)formulas.push(['=H'+(r-1)]);
      sh.getRange(b.dataStart+1,3,formulas.length,1).setFormulas(formulas);
    }
    const closing=[];
    for(let r=b.dataStart;r<=b.dataEnd;r++)closing.push(['=IF(COUNTA(B'+r+',D'+r+':G'+r+')=0,C'+r+',C'+r+'+N(D'+r+')-N(E'+r+'))']);
    sh.getRange(b.dataStart,8,closing.length,1).setFormulas(closing);
    const serial=Array.from({length:rows},(_,i)=>[i+1]);
    sh.getRange(b.dataStart,1,rows,1).setValues(serial);
    sh.getRange(b.summaryRow,4).setFormula('=SUM(D'+b.dataStart+':D'+b.dataEnd+')');
    sh.getRange(b.summaryRow,5).setFormula('=SUM(E'+b.dataStart+':E'+b.dataEnd+')');
    sh.getRange(b.summaryRow,8).setFormula('=H'+b.dataEnd);
  }
  SpreadsheetApp.flush();
  return monthlyBlocks_(sh);
}
function monthlyEnsureMonth_(sh,date){
  const tz=sh.getParent().getSpreadsheetTimeZone()||'Asia/Jakarta';
  const key=monthlyMonthKey_(date,tz);
  let blocks=monthlyBlocks_(sh),found=blocks.find(b=>b.key===key);
  if(found)return found;
  if(!blocks.length)throw new Error('Cannot extend '+sh.getName()+': no monthly template section exists.');
  const last=blocks[blocks.length-1];
  if(key<last.key)throw new Error('Monthly Bin Card is missing historical section '+key+'. Add/reconcile that month before posting a backdated transaction.');
  const height=last.summaryRow-last.startRow+1;
  const newStart=last.summaryRow+1;
  const currentMax=sh.getMaxRows();
  if(currentMax<newStart+height-1)sh.insertRowsAfter(currentMax,newStart+height-1-currentMax);
  sh.getRange(last.startRow,1,height,8).copyTo(sh.getRange(newStart,1,height,8));
  const monthDate=new Date(Number(key.slice(0,4)),Number(key.slice(5,7))-1,1);
  const title=monthlyMonthTitle_(monthDate,tz);
  sh.getRange(newStart,1).setValue(title);
  const dataStart=newStart+2,summary=newStart+height-1;
  for(let r=dataStart;r<summary;r++){
    sh.getRange(r,2).clearContent();
    sh.getRange(r,4,1,4).clearContent();
    sh.getRange(r,6).clearNote();
  }
  blocks=refreshMonthlySheetFormulas_(sh);
  found=blocks.find(b=>b.key===key);
  if(!found)throw new Error('Could not create monthly section '+title+' in '+sh.getName()+'.');
  return found;
}
function monthlyExpandBlock_(sh,block,addRows){
  const count=Math.max(10,Number(addRows)||10),insertAt=block.summaryRow,templateRow=insertAt-1;
  sh.insertRowsBefore(insertAt,count);
  for(let i=0;i<count;i++)sh.getRange(templateRow,1,1,8).copyTo(sh.getRange(insertAt+i,1,1,8));
  for(let i=0;i<count;i++){
    const r=insertAt+i;
    sh.getRange(r,2).clearContent();
    sh.getRange(r,4,1,4).clearContent();
    sh.getRange(r,6).clearNote();
  }
  const refreshed=refreshMonthlySheetFormulas_(sh);
  return refreshed.find(b=>b.key===block.key);
}
function monthlyStoreBalance_(ss,sku){
  const map=monthlyMappingBySku_(ss,sku);
  if(!map||map.unmapped)return {sku:String(sku),qty:null,unmapped:true,reason:map?map.reason:'No Monthly Bin Card mapping.'};
  const blocks=monthlyBlocks_(map.sheet);
  if(!blocks.length)return {sku:String(sku),qty:null,unmapped:true,reason:'Monthly sections are missing.'};
  const latest=blocks[blocks.length-1],v=map.sheet.getRange(latest.summaryRow,8).getValue();
  const stock=ss.getSheetByName('MDO_store'),sr=stock?findRow_(stock,1,sku):0;
  const status=sr?String(stock.getRange(sr,5).getValue()||'').toUpperCase():'';
  const qty=n_(v);
  if(status==='REVIEW_REQUIRED')return {sku:String(sku),item:map.item,sheet:map.sheet,sheetName:map.sheetName,closingA1:'H'+latest.summaryRow,closingFormula:true,qty:null,reviewRequired:true,reason:'Physical opening balance reconciliation is required.'};
  return {sku:String(sku),item:map.item,sheet:map.sheet,sheetName:map.sheetName,closingA1:'H'+latest.summaryRow,closingFormula:true,qty:qty,reviewRequired:qty===null};
}
function sourceStoreInfo_(ss,sku){
  const map=monthlyMappingBySku_(ss,sku);
  if(!map)return {sku:String(sku),unmapped:true,reason:'No Monthly Bin Card mapping. Run setupMdoMonthlyCards() in Apps Script.'};
  if(map.unmapped)return {sku:String(sku),unmapped:true,reason:map.reason};
  return monthlyStoreBalance_(ss,sku);
}
function monthlyStoreSummaryFormula_(ss,sku){
  const info=monthlyStoreBalance_(ss,sku);if(!info.sheet)return null;
  const blocks=monthlyBlocks_(info.sheet),q=quoteSheet_(info.sheet.getName());
  const inRefs=blocks.map(b=>q+'!D'+b.summaryRow).join(',');
  const outRefs=blocks.map(b=>q+'!E'+b.summaryRow).join(',');
  return {sheet:info.sheet,blocks,inFormula:'=SUM('+inRefs+')',outFormula:'=SUM('+outRefs+')',balanceFormula:'='+q+'!H'+blocks[blocks.length-1].summaryRow};
}
function quoteSheet_(name){return "'"+String(name).replace(/'/g,"''")+"'";}
function refreshStoreSummaryForSku_(ss,sku){
  const cat=ss.getSheetByName('MDO_catalog'),cr=findRow_(cat,1,sku);if(!cr)return false;
  const item=String(cat.getRange(cr,2).getValue()||''),store=ss.getSheetByName('STORE');if(!store)return false;
  const last=Math.max(0,store.getLastRow()-3),names=last?store.getRange(4,1,last,1).getDisplayValues().flat():[];
  let r=0;for(let i=0;i<names.length;i++)if(norm_(names[i])===norm_(item)){r=i+4;break;}
  if(!r)return false;
  const f=monthlyStoreSummaryFormula_(ss,sku);if(!f)return false;
  store.getRange(r,2).setFormula(f.inFormula);
  store.getRange(r,4).setFormula(f.outFormula);
  store.getRange(r,6).setFormula(f.balanceFormula);
  return true;
}
function refreshAllStoreSummaryFormulas_(ss){
  rows_(ss,'catalog').filter(r=>truth_(r[3])).forEach(r=>refreshStoreSummaryForSku_(ss,r[0]));
  SpreadsheetApp.flush();
}
function monthlyIdempotencyRow_(sh,key){
  const marker='MDO_IDEMPOTENCY:'+String(key||'');
  if(!key)return null;
  for(const b of monthlyBlocks_(sh)){
    const n=b.dataEnd-b.dataStart+1;if(n<=0)continue;
    const notes=sh.getRange(b.dataStart,6,n,1).getNotes();
    for(let i=0;i<notes.length;i++)if(String(notes[i][0]||'').includes(marker))return {row:b.dataStart+i,block:b};
  }
  return null;
}
function appendSkuLedger_(ss,sku,direction,qty,createdBy,displayNote,notes,idempotencyKey){
  const ready=PropertiesService.getScriptProperties().getProperty('MDO_MONTHLY_SCHEMA_V1_3_5_READY')==='true';
  if(!ready)throw new Error('Monthly Bin Card adapter is not initialized. Run setupMdoMonthlyCards() once in the bound Apps Script project.');
  let info=sourceStoreInfo_(ss,sku);
  if(!info||info.unmapped)throw new Error('Monthly Bin Card is not mapped for '+(info&&info.item||sku)+'. '+(info&&info.reason||''));
  if(info.qty===null)throw new Error('Store stock is REVIEW_REQUIRED for '+info.item+'. Reconcile the opening balance before posting transactions.');
  const dir=String(direction||'').toUpperCase();if(!['IN','OUT'].includes(dir))throw new Error('Bin Card direction must be IN or OUT.');
  const q=Number(qty);if(!Number.isInteger(q)||q<1)throw new Error('Bin Card quantity must be a positive whole number.');
  const key=String(idempotencyKey||id_('MDO')),marker='MDO_IDEMPOTENCY:'+key;
  const dupe=monthlyIdempotencyRow_(info.sheet,key);
  if(dupe){SpreadsheetApp.flush();const latest=monthlyStoreBalance_(ss,sku);return {synced:true,duplicate:true,sheet:info.sheetName,row:dupe.row,balance:latest.qty};}
  const when=now_(),tz=ss.getSpreadsheetTimeZone()||'Asia/Jakarta';
  let block=monthlyEnsureMonth_(info.sheet,when);
  let target=monthlyFindFreeRow_(info.sheet,block);
  if(!target){block=monthlyExpandBlock_(info.sheet,block,10);target=monthlyFindFreeRow_(info.sheet,block);}
  if(!target)throw new Error('Could not allocate a transaction row in '+block.title+' for '+info.item+'. No stock was changed.');
  const noteCell=info.sheet.getRange(target,6);
  const cells=[2,dir==='IN'?4:5,6,7];
  cells.forEach(c=>{const cell=info.sheet.getRange(target,c);if(cell.getFormula())throw new Error('Monthly ledger input '+cell.getA1Notation()+' contains a formula.');if(cell.getValue()!==''&&cell.getValue()!==null)throw new Error('Monthly ledger row '+target+' changed during posting. Refresh and retry.');});
  const expected=info.qty+(dir==='IN'?q:-q);
  try{
    noteCell.setNote(marker+'\n'+String(notes||''));
    info.sheet.getRange(target,2).setValue(when);
    info.sheet.getRange(target,dir==='IN'?4:5).setValue(q);
    noteCell.setValue(String(displayNote||notes||info.item+' '+dir).slice(0,250));
    info.sheet.getRange(target,7).setValue(String(createdBy||'MDO PWA'));
    refreshMonthlySheetFormulas_(info.sheet);
    SpreadsheetApp.flush();
    const refreshed=monthlyStoreBalance_(ss,sku);
    if(!refreshed||refreshed.qty===null||Number(refreshed.qty)!==Number(expected))throw new Error('Monthly closing balance did not reconcile. Expected '+expected+', received '+(refreshed&&refreshed.qty)+'.');
    refreshStoreSummaryForSku_(ss,sku);
    return {synced:true,duplicate:false,sheet:info.sheetName,row:target,balance:refreshed.qty,dateCol:2,inCol:4,outCol:5,noteCol:6,picCol:7,marker:marker};
  }catch(writeErr){
    [2,4,5,6,7].forEach(c=>info.sheet.getRange(target,c).clearContent());
    noteCell.clearNote();
    refreshMonthlySheetFormulas_(info.sheet);SpreadsheetApp.flush();
    throw new Error(String(writeErr&&writeErr.message||writeErr)+' Monthly Bin Card inputs were rolled back; stock totals were not committed.');
  }
}
function rollbackSkuLedger_(ss,result){
  if(!result||!result.synced||result.duplicate)return false;
  const sh=ss.getSheetByName(result.sheet);if(!sh)return false;
  const note=sh.getRange(result.row,result.noteCol);
  if(!String(note.getNote()||'').includes(String(result.marker||'')))return false;
  [result.dateCol,result.inCol,result.outCol,result.picCol].forEach(c=>sh.getRange(result.row,c).clearContent());
  note.clearContent();note.clearNote();refreshMonthlySheetFormulas_(sh);SpreadsheetApp.flush();return true;
}
function createMonthlyCardForSku_(ss,catalogRow,initialBalance,needsReview){
  const sku=String(catalogRow[0]),item=String(catalogRow[1]||''),ix=monthlyIndexSheet_(ss);
  const existing=monthlyMappingBySku_(ss,sku);if(existing)return existing;
  const template=ss.getSheetByName('BCM 003');if(!template)throw new Error('BCM 003 template is missing; cannot create a monthly Bin Card for '+sku+'.');
  const numbers=ss.getSheets().map(s=>{const m=s.getName().match(/^BCM\s+(\d+)$/i);return m?Number(m[1]):0;});
  const next=Math.max(0,...numbers)+1,view='BCM '+String(next).padStart(3,'0');
  const sh=template.copyTo(ss);sh.setName(view);
  sh.getRange('A1').setValue('MINIBAR DAILY OPERATION — MONTHLY BIN CARD | '+item);
  sh.getRange('A2').setValue('PWA-linked monthly view | SKU: '+sku+' | '+(needsReview?'Opening balance requires physical reconciliation.':'Opening balance initialized to '+Number(initialBalance||0)+'.'));
  sh.getRange('A3').setValue('Monthly Bin Card is the stock ledger source of truth. Notes are generated by PWA transactions.');
  const blocks=monthlyBlocks_(sh);
  blocks.forEach((b,bi)=>{
    for(let r=b.dataStart;r<=b.dataEnd;r++){
      sh.getRange(r,2).clearContent();sh.getRange(r,4,1,4).clearContent();sh.getRange(r,6).clearNote();
    }
    if(bi===0)sh.getRange(b.dataStart,3).setValue(needsReview?'':Number(initialBalance||0));
  });
  refreshMonthlySheetFormulas_(sh);
  const nextRow=ix.getLastRow()+1;
  const serial=Math.max(0,monthlyIndexRows_(ss).reduce((m,x)=>Math.max(m,Number(x.no)||0),0))+1;
  if(ix.getLastRow()>=5)ix.getRange(ix.getLastRow(),1,1,6).copyTo(ix.getRange(nextRow,1,1,6),SpreadsheetApp.CopyPasteType.PASTE_FORMAT,false);
  ix.getRange(nextRow,1,1,6).setValues([[serial,item,view,sku,0,needsReview?'REVIEW_REQUIRED — physical opening reconciliation required':'Monthly Bin Card created']]);
  return monthlyMappingBySku_(ss,sku);
}
function setupMdoMonthlyCards(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  if(!ss)throw new Error('Open this Apps Script from the new Monthly Bin Card spreadsheet (Extensions → Apps Script).');
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    setup_(ss);
    ss.setSpreadsheetTimeZone('Asia/Jakarta');
    const ix=monthlyIndexSheet_(ss);
    // Correct the two wine mappings and the missing wafer SKU mapping from the MDO catalog.
    const overrides={'BCM 018':'SKU-023','BCM 019':'SKU-022','BCM 021':'SKU-034'};
    const entries=monthlyIndexRows_(ss);
    Object.keys(overrides).forEach(view=>{
      const row=entries.find(x=>String(x.sheetName).trim()===view);
      if(row)ix.getRange(row.row,4).setValue(overrides[view]);
    });
    const catalog=rows_(ss,'catalog').filter(r=>truth_(r[3])&&!MDO_DISCONTINUED.some(x=>norm_(x)===norm_(r[1])));
    let created=0;
    catalog.forEach(c=>{
      if(!monthlyMappingBySku_(ss,c[0])){
        const stock=ss.getSheetByName('MDO_store'),sr=findRow_(stock,1,c[0]);
        const status=sr?String(stock.getRange(sr,5).getValue()||'').toUpperCase():'REVIEW_REQUIRED';
        const qty=sr?n_(stock.getRange(sr,4).getValue()):null;
        const needsReview=status==='REVIEW_REQUIRED'||qty===null;
        createMonthlyCardForSku_(ss,c,needsReview?null:qty,needsReview);created++;
      }
    });
    let synced=0,review=0;
    catalog.forEach(c=>{
      const info=monthlyStoreBalance_(ss,c[0]),r=findRow_(ss.getSheetByName('MDO_store'),1,c[0]);
      if(!r)return;
      if(info.qty===null){setMdoStoreBalance_(ss,c[0],'','REVIEW_REQUIRED');review++;}
      else{setMdoStoreBalance_(ss,c[0],info.qty,'OK');synced++;}
    });
    refreshAllStoreSummaryFormulas_(ss);
    PropertiesService.getScriptProperties().setProperty('MDO_SPREADSHEET_ID',ss.getId());
    PropertiesService.getScriptProperties().setProperty('MDO_MONTHLY_SCHEMA_V1_3_5_READY','true');
    PropertiesService.getScriptProperties().setProperty('MDO_MONTHLY_TIMEZONE','Asia/Jakarta');
    installMdoTriggers();
    SpreadsheetApp.flush();
    return {ok:true,version:MDO_VERSION,spreadsheet:ss.getName(),spreadsheetId:ss.getId(),monthlyCards:monthlyIndexRows_(ss).length,newCardsCreated:created,storeBalancesSynced:synced,reviewRequired:review,timezone:ss.getSpreadsheetTimeZone()};
  }finally{lock.releaseLock();}
}
function monthlyDiagnostics_(ss){
  const mappings=monthlyIndexRows_(ss),catalog=rows_(ss,'catalog').filter(r=>truth_(r[3])&&!MDO_DISCONTINUED.some(x=>norm_(x)===norm_(r[1])));
  const mapped=new Set(mappings.map(x=>String(x.sku||'').trim()).filter(Boolean));
  const missing=catalog.filter(r=>!mapped.has(String(r[0]))).map(r=>({sku:r[0],item:r[1]}));
  const review=rows_(ss,'store').filter(r=>String(r[4]||'').toUpperCase()==='REVIEW_REQUIRED').map(r=>({sku:r[0],item:r[1]}));
  return {ok:true,version:MDO_VERSION,spreadsheet:ss.getName(),spreadsheetId:ss.getId(),timezone:ss.getSpreadsheetTimeZone(),adapterReady:PropertiesService.getScriptProperties().getProperty('MDO_MONTHLY_SCHEMA_V1_3_5_READY')==='true',catalogSkus:catalog.length,monthlyMappings:mapped.size,missingMappings:missing,reviewRequired:review,monthlyCards:mappings.length};
}
function initializeMonthlyOpeningBalance_(ss,sku,qty,createdBy,notes,idempotencyKey){
  const info=monthlyMappingBySku_(ss,sku);if(!info||info.unmapped)throw new Error('Monthly Bin Card mapping is missing for '+sku+'.');
  const blocks=monthlyBlocks_(info.sheet);
  for(const b of blocks){
    const n=b.dataEnd-b.dataStart+1,vals=info.sheet.getRange(b.dataStart,2,n,6).getValues();
    if(vals.some(r=>[r[0],r[2],r[3],r[4],r[5]].some(v=>v!==''&&v!==null&&v!==undefined)))throw new Error('This SKU already has monthly ledger transactions. Use normal stock reconciliation; opening balance cannot be reset.');
  }
  const first=blocks[0];info.sheet.getRange(first.dataStart,3).setValue(0);
  const store=ss.getSheetByName('MDO_store');setMdoStoreBalance_(ss,sku,0,'OK');
  const cat=ss.getSheetByName('MDO_catalog'),cr=findRow_(cat,1,sku),item=cr?String(cat.getRange(cr,2).getValue()):sku;
  const ledger=appendSkuLedger_(ss,sku,'IN',qty,createdBy,item+' Opening Balance Reconciliation (Physical Count)',String(notes||'Opening balance established from physical stock count.'),idempotencyKey);
  const tx=id_('REC');
  ss.getSheetByName('MDO_storeTx').appendRow([tx,now_(),'OPENING_BALANCE_RECONCILIATION',sku,item,qty,0,ledger.balance,'Minibar Store',String(notes||'Opening balance established from physical stock count.'),createdBy,'',String(idempotencyKey||tx)]);
  appendHistory_(ss,tx,'STORE','OPENING_BALANCE_RECONCILIATION','Minibar Store',item,qty,String(notes||'Opening balance established from physical stock count.'),'',createdBy,'');
  return {balance:ledger.balance,transactionId:tx};
}
function setMdoStoreBalance_(ss,sku,qty,status){const sh=ss.getSheetByName('MDO_store'),r=findRow_(sh,1,sku);if(!r)throw new Error('SKU not found in MDO_store.');sh.getRange(r,4,1,3).setValues([[qty,status||'OK',now_()]]);}
function installMdoTriggers(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();if(!ss)throw new Error('Open this Apps Script from the Minibar Daily Operation spreadsheet (Extensions → Apps Script).');
  const props=PropertiesService.getScriptProperties();props.setProperty('MDO_SPREADSHEET_ID',ss.getId());
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='mdoOnEdit').forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('mdoOnEdit').forSpreadsheet(ss).onEdit().create();
  props.setProperty('MDO_EDIT_TRIGGER_INSTALLED','true');
  return 'MDO onEdit trigger installed for '+ss.getName()+'.';
}
function mdoOnEdit(e){
  if(!e||!e.range)return;const ss=e.source||e.range.getSheet().getParent(),sh=e.range.getSheet(),range=e.range;
  try{
    const lock=LockService.getScriptLock();lock.waitLock(10000);
    try{
      if(sh.getName()==='ROOM STATUS'){
        const result=syncEditedRoomStatus_(ss,range);
        if(result.count>0)appendHistory_(ss,id_('SHEET'),'SOURCE_SYNC','SHEET_EDIT','ROOM STATUS!'+range.getA1Notation(),'Room quantities',result.count,'Google Sheets → MDO operational inventory','',safeEditUser_(e),'',result.changes);
      }else if(sh.getName()==='STORE'){
        const result=syncEditedStoreFormula_(ss,range);
        if(result.count>0)appendHistory_(ss,id_('SHEET'),'SOURCE_SYNC','STORE_FORMULA_EDIT','STORE!'+range.getA1Notation(),'Store balances',result.count,'STORE formula references were re-read; formula cells were not overwritten.','',safeEditUser_(e),'',result.changes);
        refreshSourceSyncStatus_(ss);
      }else{
        const mapping=monthlyMappingBySheet_(ss,sh.getName());
        if(mapping&&isMonthlyLedgerEditArea_(sh,range)){
          SpreadsheetApp.flush();const info=sourceStoreInfo_(ss,mapping.sku);
          if(info&&info.closingFormula&&info.qty!==null){setMdoStoreBalance_(ss,mapping.sku,info.qty,'OK');refreshStoreSummaryForSku_(ss,mapping.sku);}
          else setMdoStoreBalance_(ss,mapping.sku,'','REVIEW_REQUIRED');
          appendHistory_(ss,id_('SHEET'),'SOURCE_SYNC','MONTHLY_BIN_CARD_EDIT',sh.getName(),mapping.item,0,'Monthly Bin Card edited directly in Google Sheets; MDO Store balance refreshed.','',safeEditUser_(e),'',[{type:'STORE',key:String(mapping.sku)}]);
          refreshSourceSyncStatus_(ss);
        }
      }
    }finally{lock.releaseLock();}
  }catch(err){PropertiesService.getScriptProperties().setProperty('MDO_LAST_SYNC_ERROR',String(err&&err.message||err));bumpRevision_();}
}
function syncEditedStoreFormula_(ss,range){
  const startRow=Math.max(2,range.getRow()),endRow=range.getLastRow();
  if(range.getColumn()>6||range.getLastColumn()<6||endRow<2)return {count:0,changes:[]};
  SpreadsheetApp.flush();
  const source=ss.getSheetByName('STORE'),catalog=rows_(ss,'catalog'),store=ss.getSheetByName('MDO_store');
  const values=source.getRange(startRow,1,endRow-startRow+1,6).getValues(),changes=[],seen=new Set();let count=0;
  values.forEach((row,i)=>{
    const item=String(row[0]||'').trim();if(!item)return;
    const c=catalog.find(x=>norm_(x[1])===norm_(item));if(!c||seen.has(String(c[0])))return;seen.add(String(c[0]));
    const info=sourceStoreInfo_(ss,c[0]),r=findRow_(store,1,c[0]);if(!r)return;
    if(info&&!info.unmapped&&info.closingFormula&&info.qty!==null)setMdoStoreBalance_(ss,c[0],info.qty,'OK');
    else setMdoStoreBalance_(ss,c[0],'','REVIEW_REQUIRED');
    changes.push({type:'STORE',key:String(c[0])});count++;
  });
  return {count,changes};
}
function refreshSourceSyncStatus_(ss){
  const props=PropertiesService.getScriptProperties();
  if(props.getProperty('MDO_SOURCE_SYNC_REASON')!=='STORE_VALUES')return;
  const pending=rows_(ss,'store').some(r=>String(r[4]||'').toUpperCase()==='REVIEW_REQUIRED');
  if(!pending){props.setProperty('MDO_SOURCE_SYNC_STATUS','SYNCED');props.deleteProperty('MDO_SOURCE_SYNC_REASON');}
}
function safeEditUser_(e){try{return e.user&&e.user.getEmail?e.user.getEmail():'Google Sheets user';}catch(_){return 'Google Sheets user';}}
function syncEditedRoomStatus_(ss,range){
  const src=ss.getSheetByName('ROOM STATUS'),rooms=ss.getSheetByName('MDO_rooms');if(!src||!rooms)return {count:0,changes:[]};
  const headers=src.getRange(1,1,1,src.getLastColumn()).getDisplayValues()[0];const cat=rows_(ss,'catalog').filter(r=>truth_(r[3]));
  const skuByCol={};cat.forEach(c=>{const h=String(c[4]||'');const col=headers.findIndex(x=>norm_(x)===norm_(h));if(col>0)skuByCol[col+1]=String(c[0]);});
  const startRow=Math.max(2,range.getRow()),endRow=range.getLastRow(),startCol=Math.max(2,range.getColumn()),endCol=range.getLastColumn();if(endRow<2||endCol<2)return {count:0,changes:[]};
  const sourceRows=src.getRange(startRow,1,endRow-startRow+1,src.getLastColumn()).getValues();
  const mdo=rooms.getDataRange().getValues(),mdoRowByKey={};for(let i=1;i<mdo.length;i++)mdoRowByKey[String(mdo[i][0])+'|'+String(mdo[i][2])]=i+1;
  const updates=new Map(),changeKeys=new Set(),stamp=now_();
  for(let r=startRow;r<=endRow;r++){
    const srcRow=sourceRows[r-startRow],room=String(srcRow[0]||'').trim();if(!room)continue;
    for(let c=startCol;c<=endCol;c++){
      const sku=skuByCol[c];if(!sku)continue;const targetRow=mdoRowByKey[room+'|'+sku];if(!targetRow)continue;
      const raw=srcRow[c-1],q=n_(raw);if(q===null&&String(raw||'').trim()!=='')continue;
      updates.set(targetRow,[q===null?0:q,'Google Sheets',stamp]);changeKeys.add(room+'|'+sku);
    }
  }
  // Write only affected MDO rows. Group adjacent rows into ranges to reduce calls.
  const ordered=[...updates.entries()].sort((a,b)=>a[0]-b[0]);let i=0;
  while(i<ordered.length){let j=i+1;while(j<ordered.length&&ordered[j][0]===ordered[j-1][0]+1)j++;
    const vals=ordered.slice(i,j).map(x=>x[1]);rooms.getRange(ordered[i][0],6,vals.length,3).setValues(vals);i=j;
  }
  return {count:updates.size,changes:[...changeKeys].map(key=>({type:'ROOM',key}))};
}

function isMonthlyLedgerEditArea_(sh,range){
  const r1=range.getRow(),r2=range.getLastRow(),c1=range.getColumn(),c2=range.getLastColumn();
  if(c1>7||c2<2)return false;
  return monthlyBlocks_(sh).some(b=>r1<=b.dataEnd&&r2>=b.dataStart);
}

function bootstrap_(ss){const lock=LockService.getScriptLock();lock.waitLock(15000);try{setup_(ss);const catalog=rows_(ss,'catalog'),roomRows=rows_(ss,'rooms'),store=rows_(ss,'store'),outlets=rows_(ss,'outlets'),outletStock=rows_(ss,'outletStock'),roomLocks=rows_(ss,'roomLocks');
  const lockMap={};roomLocks.forEach(r=>lockMap[String(r[0])]=truth_(r[1]));
  const roomMap={};roomRows.forEach(r=>{const k=String(r[0]);if(!roomMap[k])roomMap[k]={roomNo:k,floor:r[1],items:[],total:0,categories:{},locked:!!lockMap[k]};roomMap[k].items.push({sku:r[2],item:r[3],category:r[4],qty:Number(r[5])||0});if(Number(r[5])>0){roomMap[k].total+=Number(r[5]);roomMap[k].categories[String(r[4])]=true;}});
  const rooms=Object.values(roomMap).sort((a,b)=>Number(a.roomNo)-Number(b.roomNo));const categories=[...new Set(catalog.filter(r=>truth_(r[3])).map(r=>String(r[2]||'').trim()).filter(Boolean))].sort();
  const storeItems=store.filter(r=>catalog.some(c=>c[0]===r[0]&&truth_(c[3]))).map(r=>({sku:r[0],item:r[1],category:r[2],qty:n_(r[3]),status:r[4]}));
  const sold=rows_(ss,'sold'),loss=rows_(ss,'loss'),transfers=rows_(ss,'transfers'),recent=rows_(ss,'history').slice(-12).reverse();const legacySold=legacyTotal_(ss,'SOLD'),legacyDispute=legacyTotal_(ss,'DISPUTE');const soldTotal=legacySold+sold.reduce((s,r)=>s+(Number(r[5])||0),0);const lossTotal=legacyDispute+loss.reduce((s,r)=>s+(Number(r[5])||0),0);
  return {ok:true,version:MDO_VERSION,revision:PropertiesService.getScriptProperties().getProperty('MDO_REVISION')||'0',sourceSyncStatus:PropertiesService.getScriptProperties().getProperty('MDO_SOURCE_SYNC_STATUS')||'PENDING',monthlyAdapterReady:PropertiesService.getScriptProperties().getProperty('MDO_MONTHLY_SCHEMA_V1_3_5_READY')==='true',rooms,catalog:catalog.filter(r=>truth_(r[3])).map(r=>({sku:r[0],item:r[1],category:r[2],active:true,sourceHeader:r[4],mappingNote:r[5]})),categories,store:storeItems,outlets:outlets.filter(r=>String(r[3]).toUpperCase()==='ACTIVE').map(r=>({id:r[0],name:r[1],location:r[2],status:r[3],notes:r[4]})),outletStock:outletStock.map(r=>({outletId:r[0],sku:r[1],item:r[2],category:r[3],qty:Number(r[4])||0})),soldRecords:sold.slice(-100).reverse().map(r=>({id:r[0],timestamp:r[1],roomNo:r[2],sku:r[3],item:r[4],qty:r[5],price:r[6],total:r[7],notes:r[8],evidenceUrl:r[9],createdBy:r[10]})),lossRecords:loss.slice(-100).reverse().map(r=>({id:r[0],timestamp:r[1],roomNo:r[2],sku:r[3],item:r[4],qty:r[5],type:r[6],notes:r[7],evidenceUrl:r[8],createdBy:r[9]})),transferRecords:transfers.slice(-100).reverse().map(r=>({id:r[0],timestamp:r[1],from:r[2],to:r[3],sku:r[4],item:r[5],qty:r[6],notes:r[7],createdBy:r[8],status:r[9]})),recentHistory:recent.map(r=>({timestamp:r[0],transactionId:r[1],module:r[2],action:r[3],where:r[4],item:r[5],qty:r[6],notes:r[7],evidenceUrl:r[8],createdBy:r[9]})),summary:{roomCount:rooms.length,roomUnits:rooms.reduce((s,r)=>s+r.total,0),fullSetup:rooms.filter(r=>categories.length===24&&Object.keys(r.categories).length>=24).length,incomplete:rooms.filter(r=>r.total>0&&(categories.length!==24||Object.keys(r.categories).length<24)).length,empty:rooms.filter(r=>r.total===0).length,storeUnits:storeItems.reduce((s,r)=>s+(Number(r.qty)||0),0),soldUnits:soldTotal,lossDisputeUnits:lossTotal,activeSkus:storeItems.length,categoryCount:categories.length}};
  }finally{lock.releaseLock();}
}
function legacyTotal_(ss,name){const sh=ss.getSheetByName(name);if(!sh||sh.getLastRow()<5)return 0;const vals=sh.getDataRange().getValues();let total=0;for(let i=4;i<vals.length;i++){const item=String(vals[i][0]||'').trim();if(!item||item.toUpperCase().includes('GRAND TOTAL'))continue;const v=n_(vals[i][33]);if(v!==null)total+=v;}return total;}
function rows_(ss,key){const sh=ss.getSheetByName('MDO_'+key);if(!sh||sh.getLastRow()<2)return [];return sh.getRange(2,1,sh.getLastRow()-1,MDO_HEADERS[key].length).getValues().filter(r=>r[0]!==''&&r[0]!==null);}
function truth_(v){return v===true||String(v).toLowerCase()==='true';}
function categoryFor_(item){const key=norm_(item);for(const k in MDO_CATEGORY_MAP)if(norm_(k)===key)return MDO_CATEGORY_MAP[k];return '';}
function requireFields_(p,fields){fields.forEach(k=>{if(p[k]===undefined||p[k]===null||String(p[k]).trim()==='')throw new Error(k+' is required.');});}
function findRow_(sh,col,value){const lastRow=sh.getLastRow();if(!sh||lastRow<2)return 0;const vals=sh.getRange(2,col,lastRow-1,1).getValues();for(let i=0;i<vals.length;i++)if(String(vals[i][0])===String(value))return i+2;return 0;}
function changeQty_(ss,key,sku,delta){const sh=ss.getSheetByName('MDO_'+key),r=findRow_(sh,1,sku);if(!r)throw new Error('SKU not found in '+key+'.');const q=n_(sh.getRange(r, key==='store'?4:6).getValue());if(q===null)throw new Error('Stock is marked REVIEW_REQUIRED. Reconcile this SKU before posting a stock movement.');const next=q+delta;if(next<0)throw new Error('Insufficient stock. Available: '+q);sh.getRange(r,key==='store'?4:6).setValue(next);sh.getRange(r,key==='store'?6:8).setValue(now_());return next;}
function appendHistory_(ss,tx,module,action,where,item,qty,notes,evidence,by,ref,syncChanges){
  ss.getSheetByName('MDO_history').appendRow([now_(),tx,module,action,where,item,qty,notes||'',evidence||'',by,ref||'']);
  const revision=bumpRevision_(),changeSh=ss.getSheetByName('MDO_changes');
  const changes=(Array.isArray(syncChanges)&&syncChanges.length)?syncChanges:[{type:'FULL',key:'*'}];
  const rows=changes.map(c=>[revision,String(c.type||'FULL'),String(c.key||'*'),now_()]);
  if(rows.length){const start=changeSh.getLastRow()+1;ensureRows_(changeSh,start+rows.length-1);changeSh.getRange(start,1,rows.length,4).setValues(rows);}
  if(changeSh.getLastRow()>5001){const remove=1000;const old=changeSh.getRange(2,1,remove,1).getValues().flat();const floor=Math.max.apply(null,old.map(Number).filter(Number.isFinite).concat([0]));PropertiesService.getScriptProperties().setProperty('MDO_CHANGE_LOG_FLOOR',String(floor));changeSh.deleteRows(2,remove);}
}
function bumpRevision_(){const props=PropertiesService.getScriptProperties();const last=Number(String(props.getProperty('MDO_REVISION')||'0').split('-')[0])||0;const revision=Math.max(Date.now(),last+1);props.setProperty('MDO_REVISION',String(revision));return revision;}
function delta_(ss,p){
  const props=PropertiesService.getScriptProperties(),current=String(props.getProperty('MDO_REVISION')||'0');
  if(String(p.revision||'0')===current)return {ok:true,changed:false,fullRefresh:false,revision:current};
  const since=Number(String(p.revision||'0').split('-')[0])||0,floor=Number(props.getProperty('MDO_CHANGE_LOG_FLOOR')||'0');
  if(since<floor)return {ok:true,changed:true,fullRefresh:true,revision:current};
  const changeRows=rows_(ss,'changes').filter(r=>Number(r[0])>since);
  if(!changeRows.length||changeRows.some(r=>String(r[1])==='FULL'))return {ok:true,changed:true,fullRefresh:true,revision:current};
  const roomSet=new Set(),storeSet=new Set();
  changeRows.forEach(r=>{const type=String(r[1]),key=String(r[2]);if(type==='ROOM')roomSet.add(key.split('|')[0]);else if(type==='STORE')storeSet.add(key);else if(type==='FULL'){roomSet.clear();storeSet.clear();}});
  if(!roomSet.size&&!storeSet.size)return {ok:true,changed:true,fullRefresh:true,revision:current};
  const snap=bootstrap_(ss);
  return {ok:true,changed:true,fullRefresh:false,revision:snap.revision,rooms:snap.rooms.filter(r=>roomSet.has(String(r.roomNo))),store:snap.store.filter(r=>storeSet.has(String(r.sku))),summary:snap.summary,recentHistory:snap.recentHistory};
}
function saveEvidence_(p){if(!p.photoBase64)return '';const bytes=Utilities.base64Decode(String(p.photoBase64).split(',').pop());const blob=Utilities.newBlob(bytes,p.photoType||'image/jpeg',p.photoName||('MDO-Evidence-'+Date.now()+'.jpg'));const props=PropertiesService.getScriptProperties();let folderId=props.getProperty('MDO_EVIDENCE_FOLDER_ID');let folder=folderId?DriveApp.getFolderById(folderId):null;if(!folder){folder=DriveApp.createFolder('Minibar Daily Operation Evidence');props.setProperty('MDO_EVIDENCE_FOLDER_ID',folder.getId());}const file=folder.createFile(blob);return 'https://drive.google.com/uc?export=view&id='+file.getId();}
function roomLockState_(ss,roomNo){
  const sh=ss.getSheetByName('MDO_roomLocks');
  if(!sh||sh.getLastRow()<2)return false;
  const values=sh.getRange(2,1,sh.getLastRow()-1,4).getValues();
  for(let i=0;i<values.length;i++)if(String(values[i][0])===String(roomNo))return truth_(values[i][1]);
  return false;
}
function roomLock_(ss,p){
  requireFields_(p,['roomNo','locked','updatedBy']);
  const roomNo=String(p.roomNo).trim();
  if(!/^\d{3,4}$/.test(roomNo))throw new Error('Invalid room number.');
  const locked=p.locked===true||String(p.locked).toLowerCase()==='true';
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    setup_(ss);
    const known=rows_(ss,'rooms').some(r=>String(r[0])===roomNo);
    if(!known)throw new Error('Room not found in room inventory.');
    const sh=ss.getSheetByName('MDO_roomLocks');
    const row=findRow_(sh,1,roomNo);
    const values=[roomNo,locked,String(p.updatedBy),now_()];
    if(row)sh.getRange(row,1,1,4).setValues([values]);else sh.appendRow(values);
    appendHistory_(ss,id_('LOCK'),'ROOM','ROOM_'+(locked?'LOCKED':'UNLOCKED'),'Room '+roomNo,'Room access',0,locked?'Room locked; room stock actions are blocked.':'Room unlocked; room stock actions are enabled.','',p.updatedBy,'',[{type:'FULL',key:'*'}]);
    SpreadsheetApp.flush();
    return {ok:true,roomNo,locked};
  }finally{lock.releaseLock();}
}
function roomTransaction_(ss,p){
  requireFields_(p,['type','roomNo','sku','qty','createdBy']);
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    setup_(ss);
    if(p.idempotencyKey){const prior=rows_(ss,'roomTx').find(r=>String(r[11])===String(p.idempotencyKey));if(prior)return {ok:true,duplicate:true,transactionId:prior[0]};}
    if(roomLockState_(ss,String(p.roomNo)))throw new Error('Room '+p.roomNo+' is LOCKED. Unlock the room before posting any room inventory transaction.');
    const type=String(p.type).toUpperCase(),qty=Number(p.qty);
    if(!Number.isInteger(qty)||qty<1)throw new Error('Quantity must be a positive whole number.');
    const cat=ss.getSheetByName('MDO_catalog'),cr=findRow_(cat,1,p.sku);
    if(!cr||!truth_(cat.getRange(cr,4).getValue()))throw new Error('Active SKU not found.');
    const item=cat.getRange(cr,2).getValue(),rsh=ss.getSheetByName('MDO_rooms'),roomKey=String(p.roomNo);
    const rr=rsh.getDataRange().getValues();let target=0;
    for(let i=1;i<rr.length;i++)if(String(rr[i][0])===roomKey&&String(rr[i][2])===String(p.sku)){target=i+1;break;}
    if(!target)throw new Error('Room/SKU record not found.');
    const roomSource=prepareRoomSourceCell_(ss,roomKey,p.sku);
    const before=roomSource?roomSource.value:(Number(rsh.getRange(target,6).getValue())||0);
    let after=before,storeAfter=null,storeIn=0,storeOut=0,ledgerResult=null;
    const store=ss.getSheetByName('MDO_store');
    if(['REFILL','TAKE_OUT'].includes(type)){
      const sourceInfo=sourceStoreInfo_(ss,p.sku);const sr=findRow_(store,1,p.sku);
      const storeBefore=sourceInfo&&!sourceInfo.unmapped&&sourceInfo.closingFormula?sourceInfo.qty:null;
      if(storeBefore===null)throw new Error('Store stock is REVIEW_REQUIRED. Repair or reconcile the product closing formula before posting this movement.');
      if(type==='REFILL'){
        if(storeBefore<qty)throw new Error('Insufficient Minibar Store stock. Available: '+storeBefore);
        after=before+qty;storeAfter=storeBefore-qty;storeOut=qty;
      }else{
        if(before<qty)throw new Error('Room quantity is only '+before+'.');
        after=before-qty;storeAfter=storeBefore+qty;storeIn=qty;
      }
    }else if(['SOLD','LOSS','DISPUTE'].includes(type)){
      if(before<qty)throw new Error('Room quantity is only '+before+'.');after=before-qty;
    }else throw new Error('Unsupported room transaction type.');
    const note=String(p.notes||'');const tx=id_('ROOM');const idem=String(p.idempotencyKey||tx);const evidence=String(p.evidenceUrl||saveEvidence_(p));
    // Product stock movements are written to the product sheet IN/OUT ledger. Formula cells stay untouched.
    if(type==='REFILL')ledgerResult=appendSkuLedger_(ss,p.sku,'OUT',qty,p.createdBy,item+' Transfer to Room '+roomKey+' for Refill',note,idem);
    if(type==='TAKE_OUT')ledgerResult=appendSkuLedger_(ss,p.sku,'IN',qty,p.createdBy,item+' Return from Room '+roomKey,note,idem);
    // If a human changed ROOM STATUS after preflight, compensate by removing this
    // request's just-appended ledger inputs (unless it was an idempotent replay).
    try{writeRoomSourceQty_(roomSource,after);}catch(sourceErr){rollbackSkuLedger_(ss,ledgerResult);throw sourceErr;}
    rsh.getRange(target,6,1,3).setValues([[after,p.createdBy,now_()]]);
    if(storeAfter!==null){
      if(ledgerResult&&ledgerResult.synced&&ledgerResult.balance!==null)storeAfter=ledgerResult.balance;
      const sr=findRow_(store,1,p.sku);if(sr)setMdoStoreBalance_(ss,p.sku,storeAfter,'OK');
    }
    const txSh=ss.getSheetByName('MDO_roomTx');txSh.appendRow([tx,now_(),type,roomKey,p.sku,item,qty,note,evidence,p.createdBy,p.reference||'',idem]);
    if(type==='SOLD')ss.getSheetByName('MDO_sold').appendRow([tx,now_(),roomKey,p.sku,item,qty,Number(p.sellingPrice)||0,qty*(Number(p.sellingPrice)||0),note,evidence,p.createdBy,p.reference||'']);
    if(type==='LOSS'||type==='DISPUTE')ss.getSheetByName('MDO_loss').appendRow([tx,now_(),roomKey,p.sku,item,qty,type,note,evidence,p.createdBy,p.reference||'']);
    if(storeAfter!==null)ss.getSheetByName('MDO_storeTx').appendRow([id_('STORE'),now_(),type==='REFILL'?'REFILL_TO_ROOM':'ROOM_RETURN',p.sku,item,storeIn,storeOut,storeAfter,'Room '+roomKey,note,p.createdBy,tx,idem]);
    appendHistory_(ss,tx,'ROOM',type,'Room '+roomKey,item,qty,note,evidence,p.createdBy,p.reference||'',(['REFILL','TAKE_OUT'].includes(type)?[{type:'ROOM',key:roomKey+'|'+p.sku},{type:'STORE',key:String(p.sku)}]:undefined));SpreadsheetApp.flush();
    return {ok:true,transactionId:tx,roomQty:after,storeQty:storeAfter,sourceSynced:!!roomSource,productLedgerSynced:!!(ledgerResult&&ledgerResult.synced)};
  }finally{lock.releaseLock();}
}

function catalogAdd_(ss,p){requireFields_(p,['item','category','createdBy']);const lock=LockService.getScriptLock();lock.waitLock(10000);try{setup_(ss);const cat=ss.getSheetByName('MDO_catalog'),vals=cat.getDataRange().getValues();if(vals.slice(1).some(r=>norm_(r[1])===norm_(p.item)&&truth_(r[3])))throw new Error('Item already exists in active catalog.');const sku=id_('SKU');cat.appendRow([sku,String(p.item).trim(),String(p.category).trim(),true,'','Manually added',''+p.createdBy,now_(),now_()]);const store=ss.getSheetByName('MDO_store');store.appendRow([sku,String(p.item).trim(),String(p.category).trim(),0,'OK',now_()]);const rooms=ss.getSheetByName('MDO_rooms'),r=rooms.getDataRange().getValues();const rows=[];for(let i=1;i<r.length;i++)rows.push([r[i][0],r[i][1],sku,String(p.item).trim(),String(p.category).trim(),0,p.createdBy,now_()]);if(rows.length){ensureRows_(rooms,rooms.getLastRow()+rows.length);rooms.getRange(rooms.getLastRow()+1,1,rows.length,8).setValues(rows);}createMonthlyCardForSku_(ss,[sku,String(p.item).trim(),String(p.category).trim(),true],0,false);refreshStoreSummaryForSku_(ss,sku);appendHistory_(ss,sku,'CATALOG','ADD','All Rooms',p.item,0,'New item added with a monthly Bin Card', '',p.createdBy,'');return {ok:true,sku};}finally{lock.releaseLock();}}
function catalogArchive_(ss,p){requireFields_(p,['sku','createdBy']);const lock=LockService.getScriptLock();lock.waitLock(10000);try{const sh=ss.getSheetByName('MDO_catalog'),r=findRow_(sh,1,p.sku);if(!r)throw new Error('SKU not found.');const stock=ss.getSheetByName('MDO_store'),sr=findRow_(stock,1,p.sku);if(sr){const sq=n_(stock.getRange(sr,4).getValue());if(sq===null)throw new Error('Reconcile this SKU store balance before archiving.');if(sq>0)throw new Error('Return this SKU from Minibar Store before archiving.');}const roomRows=rows_(ss,'rooms');if(roomRows.some(x=>String(x[2])===String(p.sku)&&Number(x[5])>0))throw new Error('Remove this SKU from all rooms before archiving.');const outletRows=rows_(ss,'outletStock');if(outletRows.some(x=>String(x[1])===String(p.sku)&&Number(x[4])>0))throw new Error('Return this SKU from all outlets before archiving.');sh.getRange(r,4).setValue(false);sh.getRange(r,9).setValue(now_());appendHistory_(ss,p.sku,'CATALOG','ARCHIVE','All Rooms',sh.getRange(r,2).getValue(),0,'Archived, historical transactions retained','',p.createdBy,'');return {ok:true};}finally{lock.releaseLock();}}

function outletAdd_(ss,p){requireFields_(p,['name','createdBy']);const lock=LockService.getScriptLock();lock.waitLock(10000);try{const sh=ss.getSheetByName('MDO_outlets');if(rows_(ss,'outlets').some(r=>norm_(r[1])===norm_(p.name)&&String(r[3]).toUpperCase()==='ACTIVE'))throw new Error('An active outlet with this name already exists.');const id=id_('OUT');sh.appendRow([id,String(p.name).trim(),p.location||'','ACTIVE',p.notes||'',p.createdBy,now_(),now_()]);const cat=rows_(ss,'catalog').filter(r=>truth_(r[3]));const os=ss.getSheetByName('MDO_outletStock');const rows=cat.map(c=>[id,c[0],c[1],c[2],0,now_()]);if(rows.length){ensureRows_(os,os.getLastRow()+rows.length);os.getRange(os.getLastRow()+1,1,rows.length,6).setValues(rows);}appendHistory_(ss,id,'OUTLET','ADD',p.name,'',0,p.notes||'','',p.createdBy,'');return {ok:true,outletId:id};}finally{lock.releaseLock();}}

function outletArchive_(ss,p){requireFields_(p,['outletId','createdBy']);const lock=LockService.getScriptLock();lock.waitLock(10000);try{const sh=ss.getSheetByName('MDO_outlets'),r=findRow_(sh,1,p.outletId);if(!r)throw new Error('Outlet not found.');const stock=rows_(ss,'outletStock');if(stock.some(x=>String(x[0])===String(p.outletId)&&Number(x[4])>0))throw new Error('Return all outlet stock to Minibar Store before archiving this outlet.');sh.getRange(r,4).setValue('ARCHIVED');sh.getRange(r,8).setValue(now_());appendHistory_(ss,p.outletId,'OUTLET','ARCHIVE',sh.getRange(r,2).getValue(),' ',0,'Outlet archived; stock/history retained','',p.createdBy,'');return {ok:true};}finally{lock.releaseLock();}}

function transfer_(ss,p){
  requireFields_(p,['from','to','sku','qty','createdBy']);const qty=Number(p.qty);
  if(!Number.isInteger(qty)||qty<1)throw new Error('Quantity must be a positive whole number.');if(p.from===p.to)throw new Error('Source and destination must be different.');
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    setup_(ss);if(p.idempotencyKey){const prior=rows_(ss,'transfers').find(r=>String(r[10])===String(p.idempotencyKey));if(prior)return {ok:true,duplicate:true,transferId:prior[0]};}
    const cat=ss.getSheetByName('MDO_catalog'),cr=findRow_(cat,1,p.sku);if(!cr)throw new Error('SKU not found.');
    const item=cat.getRange(cr,2).getValue(),fromStore=p.from==='MINIBAR_STORE',toStore=p.to==='MINIBAR_STORE';let fromAfter=null,toAfter=null;
    const storeSh=ss.getSheetByName('MDO_store'),storeRow=findRow_(storeSh,1,p.sku);let storeBefore=storeRow?n_(storeSh.getRange(storeRow,4).getValue()):null;
    const info=sourceStoreInfo_(ss,p.sku);storeBefore=(info&&!info.unmapped&&info.closingFormula)?info.qty:null;
    const outletSh=ss.getSheetByName('MDO_outletStock'),outletVals=outletSh.getDataRange().getValues();let fromOutletRow=0,toOutletRow=0,fromOutletQty=0,toOutletQty=0;
    if(!fromStore){for(let i=1;i<outletVals.length;i++)if(String(outletVals[i][0])===String(p.from)&&String(outletVals[i][1])===String(p.sku)){fromOutletRow=i+1;fromOutletQty=Number(outletVals[i][4])||0;break;}if(!fromOutletRow)throw new Error('Source outlet stock row not found.');if(fromOutletQty<qty)throw new Error('Insufficient source outlet stock. Available: '+fromOutletQty);}
    if(!toStore){for(let i=1;i<outletVals.length;i++)if(String(outletVals[i][0])===String(p.to)&&String(outletVals[i][1])===String(p.sku)){toOutletRow=i+1;toOutletQty=Number(outletVals[i][4])||0;break;}if(!toOutletRow)throw new Error('Destination outlet stock row not found.');}
    if((fromStore||toStore)&&(storeBefore===null||storeBefore< (fromStore?qty:0)))throw new Error(storeBefore===null?'Store balance requires reconciliation.':'Insufficient Minibar Store stock. Available: '+storeBefore);
    if(toStore&&storeBefore===null)throw new Error('Destination Minibar Store balance requires reconciliation before receiving this item.');
    const idem=String(p.idempotencyKey||id_('TRF'));let ledgerResult=null;
    if(fromStore)ledgerResult=appendSkuLedger_(ss,p.sku,'OUT',qty,p.createdBy,item+' Internal Transfer to '+String(p.to), 'INTERNAL TRANSFER OUT: '+(p.notes||''),idem);
    if(toStore)ledgerResult=appendSkuLedger_(ss,p.sku,'IN',qty,p.createdBy,item+' Internal Transfer from '+String(p.from), 'INTERNAL TRANSFER IN: '+(p.notes||''),idem);
    if(fromStore){fromAfter=(ledgerResult&&ledgerResult.balance!==null)?ledgerResult.balance:storeBefore-qty;setMdoStoreBalance_(ss,p.sku,fromAfter,'OK');}else{fromAfter=fromOutletQty-qty;outletSh.getRange(fromOutletRow,5).setValue(fromAfter);outletSh.getRange(fromOutletRow,6).setValue(now_());}
    if(toStore){toAfter=(ledgerResult&&ledgerResult.balance!==null)?ledgerResult.balance:storeBefore+qty;setMdoStoreBalance_(ss,p.sku,toAfter,'OK');}else{toAfter=toOutletQty+qty;outletSh.getRange(toOutletRow,5).setValue(toAfter);outletSh.getRange(toOutletRow,6).setValue(now_());}
    const id=id_('TRF'),note=String(p.notes||'');ss.getSheetByName('MDO_transfers').appendRow([id,now_(),p.from,p.to,p.sku,item,qty,note,p.createdBy,'POSTED',idem]);
    ss.getSheetByName('MDO_storeTx').appendRow([id,now_(),'INTERNAL_TRANSFER',p.sku,item,toStore?qty:0,fromStore?qty:0,toStore?toAfter:(fromStore?fromAfter:''),p.from+' → '+p.to,note,p.createdBy,id,idem]);
    appendHistory_(ss,id,'TRANSFER','POST',p.from+' → '+p.to,item,qty,note,'',p.createdBy,'');SpreadsheetApp.flush();
    return {ok:true,transferId:id,fromBalance:fromAfter,toBalance:toAfter,productLedgerSynced:!!(ledgerResult&&ledgerResult.synced)};
  }finally{lock.releaseLock();}
}
function changeOutletQty_(ss,outletId,sku,delta){const sh=ss.getSheetByName('MDO_outletStock'),vals=sh.getDataRange().getValues();for(let i=1;i<vals.length;i++)if(String(vals[i][0])===String(outletId)&&String(vals[i][1])===String(sku)){const q=Number(vals[i][4])||0,n=q+delta;if(n<0)throw new Error('Insufficient outlet stock. Available: '+q);sh.getRange(i+1,5).setValue(n);sh.getRange(i+1,6).setValue(now_());return n;}throw new Error('Outlet stock row not found.');}
function storeAdjustment_(ss,p){
  requireFields_(p,['sku','qty','direction','createdBy','notes']);const qty=Number(p.qty);
  if(!Number.isInteger(qty)||qty<1)throw new Error('Quantity must be a positive whole number.');
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    setup_(ss);const idem=String(p.idempotencyKey||'');if(idem){const prior=rows_(ss,'storeTx').find(x=>String(x[12])===idem);if(prior)return {ok:true,duplicate:true,transactionId:prior[0],balance:n_(prior[7])};}
    const dir=String(p.direction).toUpperCase();if(!['IN','OUT'].includes(dir))throw new Error('Direction must be IN or OUT.');
    const sh=ss.getSheetByName('MDO_store'),r=findRow_(sh,1,p.sku);if(!r)throw new Error('SKU not found.');
    const info=sourceStoreInfo_(ss,p.sku);let before=info&&!info.unmapped&&info.closingFormula?info.qty:null;
    if(before===null)throw new Error('Store balance is REVIEW_REQUIRED. Repair or reconcile its product ledger before adjustment.');
    if(dir==='OUT'&&before<qty)throw new Error('Insufficient Store stock. Available: '+before);
    const cat=ss.getSheetByName('MDO_catalog'),cr=findRow_(cat,1,p.sku),item=cat.getRange(cr,2).getValue();
    const transactionKey=idem||id_('ADJ');const ledger=appendSkuLedger_(ss,p.sku,dir,qty,p.createdBy,item+(dir==='IN'?' Stock Adjustment IN':' Stock Adjustment OUT'),'STOCK IN / STOCK OUT: '+p.notes,transactionKey);
    const after=ledger&&ledger.balance!==null?ledger.balance:before+(dir==='IN'?qty:-qty);
    setMdoStoreBalance_(ss,p.sku,after,'OK');
    const tx=id_('ADJ');ss.getSheetByName('MDO_storeTx').appendRow([tx,now_(),'MANUAL_ADJUSTMENT',p.sku,item,dir==='IN'?qty:0,dir==='OUT'?qty:0,after,'Minibar Store',p.notes,p.createdBy,'',transactionKey]);
    appendHistory_(ss,tx,'STORE','ADJUSTMENT','Minibar Store',item,qty,p.notes,'',p.createdBy,'',[{type:'STORE',key:String(p.sku)}]);SpreadsheetApp.flush();return {ok:true,transactionId:tx,balance:after,productLedgerSynced:!!(ledger&&ledger.synced)};
  }finally{lock.releaseLock();}
}
function historyDateKey_(value, timezone){
  const tz=timezone||Session.getScriptTimeZone()||'Etc/GMT';
  if(value instanceof Date && !isNaN(value.getTime())) return Utilities.formatDate(value,tz,'yyyy-MM-dd');
  if(typeof value==='number' && isFinite(value)){
    const whole=Math.floor(value),fraction=value-whole;
    const d=new Date(Date.UTC(1899,11,30)+whole*86400000+fraction*86400000);
    return isNaN(d.getTime())?'':Utilities.formatDate(d,tz,'yyyy-MM-dd');
  }
  const s=String(value===null||value===undefined?'':value).trim();
  if(!s) return '';
  let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m) return m[1]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[3]).padStart(2,'0');
  // Existing MDO_history display uses the spreadsheet's month/day/year format.
  m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s|$)/);
  if(m) return m[3]+'-'+String(m[1]).padStart(2,'0')+'-'+String(m[2]).padStart(2,'0');
  const parsed=new Date(s);
  return isNaN(parsed.getTime())?'':Utilities.formatDate(parsed,tz,'yyyy-MM-dd');
}
function history_(ss,p){
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    setup_(ss);
    const timezone=ss.getSpreadsheetTimeZone()||Session.getScriptTimeZone()||'Etc/GMT';
    const sh=ss.getSheetByName('MDO_history');
    if(!sh)throw new Error('MDO_history sheet was not found in the configured spreadsheet.');
    const lastRow=sh.getLastRow();
    const lastCol=Math.max(11,sh.getLastColumn());
    const headers=sh.getRange(1,1,1,lastCol).getDisplayValues()[0].map(v=>String(v||'').trim().toLowerCase());
    const col=(names,fallback)=>{
      for(let i=0;i<headers.length;i++)if(names.indexOf(headers[i])>=0)return i;
      return fallback;
    };
    const ix={
      timestamp:col(['timestamp','date/time','date time'],0),
      transactionId:col(['transaction id','transactionid','id'],1),
      module:col(['module','source'],2),
      action:col(['action','activity','type'],3),
      where:col(['room / outlet','room/outlet','room / room outlet','room','room no'],4),
      item:col(['item','item name','product'],5),
      qty:col(['qty','quantity'],6),
      notes:col(['notes','remarks','description'],7),
      evidenceUrl:col(['evidence url','evidence','photo url'],8),
      createdBy:col(['created by','staff','user'],9),
      reference:col(['reference','ref'],10)
    };
    const raw=lastRow>=2?sh.getRange(2,1,lastRow-1,lastCol).getValues():[];
    const populated=raw.filter(r=>r.some(v=>v!==''&&v!==null&&v!==undefined));
    const all=populated.map(r=>({
      timestamp:r[ix.timestamp],
      transactionId:r[ix.transactionId],
      module:r[ix.module],
      action:r[ix.action],
      where:r[ix.where],
      item:r[ix.item],
      qty:r[ix.qty],
      notes:r[ix.notes],
      evidenceUrl:r[ix.evidenceUrl],
      createdBy:r[ix.createdBy],
      reference:r[ix.reference]
    }));
    // IMPORTANT: p.action is the API router command ('history').
    // Activity filtering must use a separate property to avoid route/filter collision.
    const activityFilter=String(p.activityFilter||p.activityType||p.filterAction||'').trim();
    const filtered=all.filter(x=>
      (!p.roomNo||String(x.where||'').includes(String(p.roomNo)))&&
      (!p.createdBy||String(x.createdBy||'')===String(p.createdBy))&&
      (!activityFilter||String(x.action||'').trim().toUpperCase()===activityFilter.toUpperCase())&&
      (!p.date||historyDateKey_(x.timestamp,timezone)===String(p.date))
    );
    const diagnostics={
      spreadsheetName:ss.getName(),
      sheetName:sh.getName(),
      sheetLastRow:lastRow,
      sourceRows:Math.max(0,lastRow-1),
      nonEmptyRows:populated.length,
      returnedRows:filtered.length,
      timezone:timezone,
      filters:{roomNo:String(p.roomNo||''),date:String(p.date||''),activityFilter:activityFilter,createdBy:String(p.createdBy||'')},
      headerMap:ix
    };
    return {ok:true,history:filtered.reverse(),timezone:timezone,diagnostics:diagnostics};
  }finally{lock.releaseLock();}
}
function reconcileStock_(ss,p){
  requireFields_(p,['sku','qty','createdBy','notes']);const qty=Number(p.qty);
  if(!Number.isInteger(qty)||qty<0)throw new Error('Stock quantity must be zero or a positive whole number.');
  const lock=LockService.getScriptLock();lock.waitLock(15000);
  try{
    setup_(ss);const idem=String(p.idempotencyKey||'');if(idem){const prior=rows_(ss,'storeTx').find(x=>String(x[12])===idem);if(prior)return {ok:true,duplicate:true,transactionId:prior[0],balance:n_(prior[7])};}
    const sh=ss.getSheetByName('MDO_store'),r=findRow_(sh,1,p.sku);if(!r)throw new Error('SKU not found.');
    const before=n_(sh.getRange(r,4).getValue()),info=sourceStoreInfo_(ss,p.sku);
    let after=qty,sourceSynced=false,transactionId='';
    if(info&&info.monthly===true&&info.qty===null){
      const opening=initializeMonthlyOpeningBalance_(ss,p.sku,qty,p.createdBy,p.notes,idem||id_('OPEN'));
      after=opening.balance;transactionId=opening.transactionId;sourceSynced=true;
    }else if(info&&!info.unmapped&&info.closingFormula&&info.qty!==null){
      const diff=qty-info.qty;
      if(diff!==0){const ledger=appendSkuLedger_(ss,p.sku,diff>0?'IN':'OUT',Math.abs(diff),p.createdBy,String(p.item||'')+' Physical Stock Reconciliation', 'PHYSICAL RECONCILIATION: '+p.notes,idem||id_('REC'));after=ledger.balance;sourceSynced=!!ledger.synced;}
      else{after=info.qty;sourceSynced=true;}
      transactionId=id_('REC');
    }else{
      throw new Error('No Monthly Bin Card is mapped for this SKU. Run setupMdoMonthlyCards() and verify MONTHLY BIN CARD INDEX before reconciliation.');
    }
    setMdoStoreBalance_(ss,p.sku,after,'OK');refreshStoreSummaryForSku_(ss,p.sku);
    if(!transactionId){
      const cat=ss.getSheetByName('MDO_catalog'),cr=findRow_(cat,1,p.sku),item=cr?cat.getRange(cr,2).getValue():p.sku;
      transactionId=id_('REC');
      ss.getSheetByName('MDO_storeTx').appendRow([transactionId,now_(),'STOCK_RECONCILIATION',p.sku,item,qty>Number(before||0)?qty-Number(before||0):0,qty<Number(before||0)?Number(before||0)-qty:0,after,'Minibar Store',String(p.notes)+' | Previous MDO: '+before,p.createdBy,'',idem||transactionId]);
      appendHistory_(ss,transactionId,'STORE','RECONCILE','Minibar Store',item,qty,p.notes,'',p.createdBy,'');
    }
    SpreadsheetApp.flush();return {ok:true,transactionId:transactionId,balance:after,sourceSynced:sourceSynced};
  }finally{lock.releaseLock();}
}
