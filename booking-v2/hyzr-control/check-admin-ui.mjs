import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync('docs/booking/admin/index.html','utf8');
const match=html.match(/<script type="module">([\s\S]*?)<\/script>/);
if(!match)throw Error('admin module missing');
const js=match[1].replace(/^import\s+.*?;\s*$/gm,'');
new vm.Script(js,{filename:'booking-admin-inline.js'});
for(const id of ['staffcodeform','staffcodeemail','staffcodeissue','staffcodeonce','staffcodevalue','staffcodemessage','staffcodecopy','stafflist','staffrefresh','staffcodemessage','hyzr-result','usage-result']){
 if(!html.includes('id="'+id+'"'))throw Error('Required UI element missing: '+id);
}
if(!html.includes('if(!/^\\d{8}$/.test(String(result.code||"")))'))throw Error('Staff PIN validation pattern incorrect');
console.log('Booking admin JavaScript syntax and staff UI element checks passed.');
