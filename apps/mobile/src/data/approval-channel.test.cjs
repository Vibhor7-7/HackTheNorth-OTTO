/* global __dirname */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const moduleValue={exports:{}};
new Function('exports',ts.transpileModule(fs.readFileSync(path.join(__dirname,'approval-channel.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(moduleValue.exports);
const {parseApprovalReply,sendApprovalReply}=moduleValue.exports;
const approval=(id='a',code='4821')=>({id,code,status:'pending',expires_at:new Date(Date.now()+300000).toISOString()});
test('requires explicit decision and exact known code',()=>{
  const a=approval();
  assert.equal(parseApprovalReply(' APPROVE 4821 ',[a]).decision,'approve');
  assert.throws(()=>parseApprovalReply('yes',[a]),/approve CODE/);
  assert.throws(()=>parseApprovalReply('approve 48210',[a]),/not found/);
  assert.throws(()=>parseApprovalReply('approve 4821 and 44',[a]),/approve CODE/);
});
test('rejects expired, handled, and ambiguous pending requests',()=>{
  assert.throws(()=>parseApprovalReply('deny 4821',[{...approval(),expires_at:new Date(Date.now()-1).toISOString()}]),/expired/);
  assert.throws(()=>parseApprovalReply('deny 4821',[{...approval(),status:'approved'}]),/handled/);
  assert.throws(()=>parseApprovalReply('deny 4821',[approval(),approval('b')]),/More than one/);
});
test('uses shared decision once and reports concurrent expiry accurately',async()=>{
  let a=approval();let calls=0;
  const source={getSnapshot:()=>({approvals:[a]}),approve:async()=>{calls++;a={...a,status:'approved'};},deny:async()=>{calls++;a={...a,status:'denied'};}};
  assert.match((await sendApprovalReply(source,'approve 4821')).text,/Approved/);
  await assert.rejects(sendApprovalReply(source,'approve 4821'),/handled/);assert.equal(calls,1);
  a=approval();source.approve=async()=>{a={...a,status:'expired'};};
  await assert.rejects(sendApprovalReply(source,'approve 4821'),/request changed/);
});
